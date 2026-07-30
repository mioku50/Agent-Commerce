import { createHash } from "node:crypto";
import { getAddress, type Address } from "viem";
import {
  AgentTrustInputError,
  canonicalAgentTrustInput,
  normalizeAgentTrustInput,
} from "../agent-trust/input.ts";
import type { AgentTrustReport, AgentTrustReportInput } from "../agent-trust/types.ts";
import {
  getHostedAgentJobView,
  previewHostedWorkflow,
  runHostedAgentJob,
} from "../agent/hosted-jobs.ts";
import {
  HOSTED_AGENT_MAX_BUDGET_USDC,
  getHostedRunnerConfig,
  hostedIdempotencyHash,
  hostedIdempotencyRequestHash,
  hostedRequesterFingerprint,
  validateIdempotencyKey,
} from "../agent/hosted-policy.ts";
import {
  hashHostedWorkflowInput,
  validateHostedWorkflowRequest,
} from "../agent/hosted-workflows.ts";
import { getHostedWorkflowTemplate } from "../agent/workflow-templates.ts";
import {
  confirmHostedWorkflowQuote,
  createHostedWorkflowQuote,
  getHostedWorkflowQuote,
  sponsoredWorkflowAuthorizationMessage,
  toPublicHostedWorkflowQuote,
} from "../commerce/workflow-checkout.ts";
import { getByoaClient } from "../byoa/service.ts";
import { buildTrustDeltaReport } from "./delta.ts";
import type {
  TrustMonitoringCadence,
  TrustMonitoringRecheckRow,
  TrustMonitoringSnapshotRow,
  TrustMonitoringStatus,
  TrustMonitoringTrigger,
  TrustWatchlistRow,
} from "./types.ts";

const MAX_WATCHLISTS_PER_OWNER = 10;
const REQUIRED_GITHUB_SERVICES = [
  "github-repository-intelligence",
  "github-due-diligence-analysis",
] as const;

export class TrustMonitoringError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly status = 400,
    public readonly retryable = false,
  ) {
    super(message);
  }
}

function hash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function safeLabel(value: unknown, input: AgentTrustReportInput) {
  const supplied = typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
  const fallback =
    input.agentId ??
    input.repositoryUrl?.replace(/^https:\/\/github\.com\//, "") ??
    input.agentWallet ??
    input.contractAddress ??
    (input.serviceEndpoint ? new URL(input.serviceEndpoint).hostname : null) ??
    "Trust Watch";
  const label = supplied || fallback;
  if (label.length < 2 || label.length > 100) {
    throw new TrustMonitoringError(
      "Watchlist label must contain 2-100 characters.",
      "watchlist_invalid",
    );
  }
  return label;
}

export function normalizeMonitoringCadence(value: unknown): TrustMonitoringCadence {
  if (value === "manual" || value === "daily" || value === "weekly") return value;
  throw new TrustMonitoringError(
    "Cadence must be manual, daily, or weekly.",
    "watchlist_invalid",
  );
}

export function validateTrustWatchlistDraft(input: {
  label?: unknown;
  subjectInput: unknown;
  cadence?: unknown;
}) {
  try {
    const subjectInput = normalizeAgentTrustInput(input.subjectInput);
    return {
      subjectInput,
      cadence: normalizeMonitoringCadence(input.cadence ?? "manual"),
      label: safeLabel(input.label, subjectInput),
    };
  } catch (error) {
    if (error instanceof AgentTrustInputError) {
      throw new TrustMonitoringError(error.message, error.code, 400);
    }
    throw error;
  }
}

function normalizeMonitoringStatus(value: unknown): TrustMonitoringStatus {
  if (value === "active" || value === "paused") return value;
  throw new TrustMonitoringError(
    "Watchlist status must be active or paused.",
    "watchlist_invalid",
  );
}

function nextRecheckAt(cadence: TrustMonitoringCadence, now = new Date()) {
  if (cadence === "manual") return null;
  const interval = cadence === "daily" ? 24 : 7 * 24;
  return new Date(now.getTime() + interval * 60 * 60 * 1_000).toISOString();
}

function subjectHash(input: AgentTrustReportInput) {
  return hash(JSON.stringify(input));
}

function monitoringClient() {
  return getByoaClient();
}

function watchlistSummary(row: TrustWatchlistRow, latest?: TrustMonitoringSnapshotRow | null) {
  return {
    id: row.public_id,
    label: row.label,
    input: row.subject_input,
    cadence: row.cadence,
    status: row.status,
    nextRecheckAt: row.next_recheck_at,
    lastRecheckAt: row.last_recheck_at,
    lastJobId: row.last_job_id,
    lastErrorCode: row.last_error_code,
    currentScore: latest?.trust_score ?? null,
    trustStatus: latest?.trust_status ?? null,
    verificationStatus: latest?.verification_status ?? null,
    latestSnapshotId: latest?.public_id ?? null,
    publicHistoryUrl: `/trust/${row.public_id}`,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function latestSnapshots(rows: TrustWatchlistRow[]) {
  const ids = rows.map((row) => row.last_snapshot_id).filter((id): id is string => Boolean(id));
  if (ids.length === 0) return new Map<string, TrustMonitoringSnapshotRow>();
  const result = await monitoringClient()
    .from("trust_monitoring_snapshots")
    .select("*")
    .in("id", ids);
  if (result.error) throw new TrustMonitoringError(
    "Unable to load trust monitoring snapshots.",
    "monitoring_unavailable",
    503,
    true,
  );
  return new Map(
    ((result.data ?? []) as TrustMonitoringSnapshotRow[]).map((row) => [row.id, row]),
  );
}

export async function createTrustWatchlist(input: {
  ownerWallet: string;
  label?: unknown;
  subjectInput: unknown;
  cadence?: unknown;
  byoaAgentId?: string | null;
  machineCredentialId?: string | null;
}) {
  const ownerWallet = getAddress(input.ownerWallet as Address);
  const validated = validateTrustWatchlistDraft(input);
  const { subjectInput, cadence, label } = validated;
  const client = monitoringClient();
  const machineCredentialId = input.machineCredentialId ?? null;
  const byoaAgentId = input.byoaAgentId ?? null;
  if (Boolean(machineCredentialId) !== Boolean(byoaAgentId)) {
    throw new TrustMonitoringError(
      "Machine watchlists require an agent and credential tenant.",
      "watchlist_invalid",
    );
  }

  let existingQuery = client
    .from("trust_watchlists")
    .select("*")
    .ilike("owner_wallet", ownerWallet)
    .eq("subject_hash", subjectHash(subjectInput));
  existingQuery = machineCredentialId
    ? existingQuery.eq("machine_credential_id", machineCredentialId)
    : existingQuery.is("machine_credential_id", null);
  const existing = await existingQuery.maybeSingle();
  if (existing.error) throw new TrustMonitoringError(
    "Unable to inspect the watchlist.",
    "monitoring_unavailable",
    503,
    true,
  );
  if (existing.data) {
    return { watchlist: watchlistSummary(existing.data as TrustWatchlistRow), created: false };
  }

  const count = await client
    .from("trust_watchlists")
    .select("id", { count: "exact", head: true })
    .ilike("owner_wallet", ownerWallet);
  if (count.error) throw new TrustMonitoringError(
    "Unable to evaluate watchlist limits.",
    "monitoring_unavailable",
    503,
    true,
  );
  if ((count.count ?? 0) >= MAX_WATCHLISTS_PER_OWNER) {
    throw new TrustMonitoringError(
      `A wallet can monitor at most ${MAX_WATCHLISTS_PER_OWNER} subjects.`,
      "watchlist_limit_exceeded",
      429,
    );
  }

  const inserted = await client
    .from("trust_watchlists")
    .insert({
      owner_wallet: ownerWallet,
      label,
      subject_hash: subjectHash(subjectInput),
      subject_input: subjectInput,
      cadence,
      status: "active",
      next_recheck_at: nextRecheckAt(cadence),
      byoa_agent_id: byoaAgentId,
      machine_credential_id: machineCredentialId,
    })
    .select("*")
    .single();
  if (inserted.error || !inserted.data) throw new TrustMonitoringError(
    "Unable to create the watchlist.",
    "monitoring_unavailable",
    503,
    true,
  );
  return {
    watchlist: watchlistSummary(inserted.data as TrustWatchlistRow),
    created: true,
  };
}

export async function listOwnerTrustWatchlists(ownerWallet: string) {
  const owner = getAddress(ownerWallet as Address);
  const result = await monitoringClient()
    .from("trust_watchlists")
    .select("*")
    .ilike("owner_wallet", owner)
    .order("created_at", { ascending: false })
    .limit(MAX_WATCHLISTS_PER_OWNER);
  if (result.error) throw new TrustMonitoringError(
    "Unable to load watchlists.",
    "monitoring_unavailable",
    503,
    true,
  );
  const rows = (result.data ?? []) as TrustWatchlistRow[];
  const snapshots = await latestSnapshots(rows);
  return rows.map((row) =>
    watchlistSummary(row, row.last_snapshot_id ? snapshots.get(row.last_snapshot_id) : null),
  );
}

export async function listMachineTrustWatchlists(input: {
  ownerWallet: string;
  byoaAgentId: string;
  machineCredentialId: string;
}) {
  const result = await monitoringClient()
    .from("trust_watchlists")
    .select("*")
    .ilike("owner_wallet", getAddress(input.ownerWallet as Address))
    .eq("byoa_agent_id", input.byoaAgentId)
    .eq("machine_credential_id", input.machineCredentialId)
    .order("created_at", { ascending: false })
    .limit(MAX_WATCHLISTS_PER_OWNER);
  if (result.error) throw new TrustMonitoringError(
    "Unable to load watchlists.",
    "monitoring_unavailable",
    503,
    true,
  );
  const rows = (result.data ?? []) as TrustWatchlistRow[];
  const snapshots = await latestSnapshots(rows);
  return rows.map((row) =>
    watchlistSummary(row, row.last_snapshot_id ? snapshots.get(row.last_snapshot_id) : null),
  );
}

async function findWatchlistByPublicId(publicId: string) {
  if (!/^wtl_[0-9a-f]{20}$/.test(publicId)) return null;
  const result = await monitoringClient()
    .from("trust_watchlists")
    .select("*")
    .eq("public_id", publicId)
    .maybeSingle();
  if (result.error) throw new TrustMonitoringError(
    "Unable to load the watchlist.",
    "monitoring_unavailable",
    503,
    true,
  );
  return (result.data as TrustWatchlistRow | null) ?? null;
}

export async function requireOwnerWatchlist(publicId: string, ownerWallet: string) {
  const row = await findWatchlistByPublicId(publicId);
  if (!row || row.owner_wallet.toLowerCase() !== ownerWallet.toLowerCase()) {
    throw new TrustMonitoringError("Watchlist not found.", "watchlist_not_found", 404);
  }
  return row;
}

export async function requireMachineWatchlist(input: {
  publicId: string;
  ownerWallet: string;
  byoaAgentId: string;
  machineCredentialId: string;
}) {
  const row = await findWatchlistByPublicId(input.publicId);
  if (
    !row ||
    row.owner_wallet.toLowerCase() !== input.ownerWallet.toLowerCase() ||
    row.byoa_agent_id !== input.byoaAgentId ||
    row.machine_credential_id !== input.machineCredentialId
  ) {
    throw new TrustMonitoringError("Watchlist not found.", "watchlist_not_found", 404);
  }
  return row;
}

export async function updateOwnerTrustWatchlist(input: {
  publicId: string;
  ownerWallet: string;
  label?: unknown;
  cadence?: unknown;
  status?: unknown;
}) {
  const row = await requireOwnerWatchlist(input.publicId, input.ownerWallet);
  const cadence =
    input.cadence === undefined ? row.cadence : normalizeMonitoringCadence(input.cadence);
  const status =
    input.status === undefined ? row.status : normalizeMonitoringStatus(input.status);
  const label =
    input.label === undefined ? row.label : safeLabel(input.label, row.subject_input);
  const updated = await monitoringClient()
    .from("trust_watchlists")
    .update({
      cadence,
      status,
      label,
      next_recheck_at:
        status === "paused" || cadence === "manual"
          ? null
          : row.cadence === cadence && row.next_recheck_at
            ? row.next_recheck_at
            : nextRecheckAt(cadence),
    })
    .eq("id", row.id)
    .select("*")
    .single();
  if (updated.error || !updated.data) throw new TrustMonitoringError(
    "Unable to update the watchlist.",
    "monitoring_unavailable",
    503,
    true,
  );
  const latest = row.last_snapshot_id
    ? await monitoringClient()
      .from("trust_monitoring_snapshots")
      .select("*")
      .eq("id", row.last_snapshot_id)
      .maybeSingle()
    : null;
  return watchlistSummary(
    updated.data as TrustWatchlistRow,
    (latest?.data as TrustMonitoringSnapshotRow | null) ?? null,
  );
}

function monitoringRequest(watchlist: TrustWatchlistRow) {
  const template = getHostedWorkflowTemplate("agent_trust_report");
  if (!template) throw new TrustMonitoringError(
    "Agent Trust Report workflow is unavailable.",
    "monitoring_unavailable",
    503,
    true,
  );
  return validateHostedWorkflowRequest({
    workflowType: "agent_trust_report",
    inputText: JSON.stringify(watchlist.subject_input),
    agentTrustInput: watchlist.subject_input,
    task: template.task,
    budgetUsdc: HOSTED_AGENT_MAX_BUDGET_USDC,
  });
}

function assertMonitoringPlan(plan: Awaited<ReturnType<typeof previewHostedWorkflow>>, watchlist: TrustWatchlistRow) {
  const selected = new Set(plan.selectedServices.map((service) => service.slug));
  if (!selected.has("agent-trust-finalizer")) {
    throw new TrustMonitoringError(
      "Canonical Arc report verification is temporarily unavailable.",
      "agent_trust_service_unavailable",
      503,
      true,
    );
  }
  if (
    watchlist.subject_input.repositoryUrl &&
    REQUIRED_GITHUB_SERVICES.some((slug) => !selected.has(slug))
  ) {
    throw new TrustMonitoringError(
      "Required GitHub monitoring services are temporarily unavailable.",
      "provider_unavailable",
      503,
      true,
    );
  }
}

export async function createTrustMonitoringQuote(input: {
  watchlist: TrustWatchlistRow;
  trigger: TrustMonitoringTrigger;
  idempotencyKey: string;
  forwardedFor?: string | null;
  userAgent?: string | null;
  byoaAgentId?: string | null;
  machineCredentialId?: string | null;
  scheduledFor?: string | null;
  beforeQuote?: (estimatedProviderCostUsdc: number) => Promise<void>;
}) {
  const key = validateIdempotencyKey(input.idempotencyKey);
  const config = getHostedRunnerConfig();
  const idempotencyHash = hostedIdempotencyHash(config.rateLimitSecret, key);
  const existing = await monitoringClient()
    .from("trust_monitoring_rechecks")
    .select("*")
    .eq("watchlist_id", input.watchlist.id)
    .eq("idempotency_hash", idempotencyHash)
    .maybeSingle();
  if (existing.error) throw new TrustMonitoringError(
    "Unable to evaluate monitoring idempotency.",
    "monitoring_unavailable",
    503,
    true,
  );
  if (existing.data) {
    const recheck = existing.data as TrustMonitoringRecheckRow;
    const quoteRow = recheck.quote_id
      ? await getHostedWorkflowQuote(recheck.quote_id)
      : null;
    if (!quoteRow) throw new TrustMonitoringError(
      "The previous recheck request did not produce a reusable quote.",
      "recheck_conflict",
      409,
    );
    const quote = toPublicHostedWorkflowQuote(quoteRow);
    return {
      recheck,
      quote,
      sponsoredAuthorizationMessage:
        quote.paymentMode === "sponsored"
          ? sponsoredWorkflowAuthorizationMessage(quote)
          : null,
      created: false,
    };
  }

  const active = await monitoringClient()
    .from("trust_monitoring_rechecks")
    .select("id", { count: "exact", head: true })
    .eq("watchlist_id", input.watchlist.id)
    .in("status", ["quoted", "queued", "running"]);
  if (active.error) throw new TrustMonitoringError(
    "Unable to evaluate active rechecks.",
    "monitoring_unavailable",
    503,
    true,
  );
  if ((active.count ?? 0) > 0) {
    throw new TrustMonitoringError(
      "This watchlist already has an active recheck.",
      "recheck_in_progress",
      409,
      true,
    );
  }

  const inserted = await monitoringClient()
    .from("trust_monitoring_rechecks")
    .insert({
      watchlist_id: input.watchlist.id,
      trigger: input.trigger,
      status: "quoted",
      idempotency_hash: idempotencyHash,
      byoa_agent_id: input.byoaAgentId ?? null,
      machine_credential_id: input.machineCredentialId ?? null,
      scheduled_for: input.scheduledFor ?? null,
    })
    .select("*")
    .single();
  if (inserted.error || !inserted.data) throw new TrustMonitoringError(
    "Unable to create the monitoring recheck.",
    "monitoring_unavailable",
    503,
    true,
  );
  const recheck = inserted.data as TrustMonitoringRecheckRow;

  try {
    const request = monitoringRequest(input.watchlist);
    const plan = await previewHostedWorkflow(request);
    assertMonitoringPlan(plan, input.watchlist);
    await input.beforeQuote?.(plan.estimatedSpendUsdc);
    const inputSha256 = hashHostedWorkflowInput(request.inputText);
    const requestHash = hostedIdempotencyRequestHash({
      secret: config.rateLimitSecret,
      workflowType: request.workflowType,
      inputSha256,
      task: request.task,
      marketSymbol: request.marketSymbol,
      repository: request.repository,
      budgetUsdc: request.budgetUsdc,
    });
    const quoteResult = await createHostedWorkflowQuote({
      idempotencyHash,
      requestHash,
      requesterFingerprint:
        input.trigger === "scheduled"
          ? hostedIdempotencyHash(
              config.rateLimitSecret,
              `monitoring-fingerprint:${input.watchlist.id}`,
            )
          : hostedRequesterFingerprint({
              secret: config.rateLimitSecret,
              forwardedFor: input.forwardedFor ?? null,
              userAgent: input.userAgent ?? null,
            }),
      requesterWallet: getAddress(input.watchlist.owner_wallet as Address),
      request,
      plan,
      byoaAgentId: input.byoaAgentId ?? undefined,
      machineCredentialId: input.machineCredentialId ?? undefined,
      ownerWallet: input.watchlist.owner_wallet,
      sponsorship:
        input.trigger === "scheduled" ? "scheduled_monitoring" : "regular",
      metadata: {
        monitoringWatchlistId: input.watchlist.id,
        monitoringWatchlistPublicId: input.watchlist.public_id,
        monitoringRecheckId: recheck.id,
        monitoringRecheckPublicId: recheck.public_id,
        monitoringTrigger: input.trigger,
      },
    });
    const updated = await monitoringClient()
      .from("trust_monitoring_rechecks")
      .update({ quote_id: quoteResult.quote.id })
      .eq("id", recheck.id)
      .select("*")
      .single();
    if (updated.error || !updated.data) throw new Error("quote link failed");
    return {
      recheck: updated.data as TrustMonitoringRecheckRow,
      quote: quoteResult.quote,
      sponsoredAuthorizationMessage:
        quoteResult.quote.paymentMode === "sponsored"
          ? sponsoredWorkflowAuthorizationMessage(quoteResult.quote)
          : null,
      created: true,
    };
  } catch (error) {
    await monitoringClient()
      .from("trust_monitoring_rechecks")
      .update({
        status: "failed",
        error_code:
          error instanceof TrustMonitoringError
            ? error.code
            : "quote_creation_failed",
        error_message:
          error instanceof Error ? error.message.slice(0, 300) : "Quote creation failed.",
        completed_at: new Date().toISOString(),
      })
      .eq("id", recheck.id);
    throw error;
  }
}

export async function bindMachineTrustMonitoringJob(input: {
  recheckId: string;
  jobId: string;
  byoaAgentId: string;
  machineCredentialId: string;
}) {
  const result = await monitoringClient()
    .from("trust_monitoring_rechecks")
    .update({
      status: "queued",
      job_id: input.jobId,
      started_at: new Date().toISOString(),
    })
    .eq("id", input.recheckId)
    .eq("trigger", "machine")
    .eq("byoa_agent_id", input.byoaAgentId)
    .eq("machine_credential_id", input.machineCredentialId)
    .is("job_id", null)
    .select("id,watchlist_id")
    .maybeSingle();
  if (result.error || !result.data) {
    throw new TrustMonitoringError(
      "Unable to bind the monitoring run to this credential.",
      "watchlist_not_found",
      404,
    );
  }
  await monitoringClient()
    .from("trust_watchlists")
    .update({
      last_recheck_at: new Date().toISOString(),
      last_job_id: input.jobId,
      last_error_code: null,
      last_error_at: null,
    })
    .eq("id", result.data.watchlist_id);
}

export async function confirmTrustMonitoringQuote(input: {
  recheckPublicId: string;
  ownerWallet: string;
  signature?: string | null;
  transactionHash?: string | null;
}) {
  if (!/^trc_[0-9a-f]{20}$/.test(input.recheckPublicId)) {
    throw new TrustMonitoringError("Recheck not found.", "recheck_not_found", 404);
  }
  const result = await monitoringClient()
    .from("trust_monitoring_rechecks")
    .select("*,trust_watchlists!inner(*)")
    .eq("public_id", input.recheckPublicId)
    .maybeSingle();
  if (result.error || !result.data) {
    throw new TrustMonitoringError("Recheck not found.", "recheck_not_found", 404);
  }
  const recheck = result.data as TrustMonitoringRecheckRow & {
    trust_watchlists: TrustWatchlistRow;
  };
  const watchlist = recheck.trust_watchlists;
  if (
    watchlist.owner_wallet.toLowerCase() !== input.ownerWallet.toLowerCase() ||
    recheck.trigger !== "manual" ||
    !recheck.quote_id
  ) {
    throw new TrustMonitoringError("Recheck not found.", "recheck_not_found", 404);
  }
  const quote = await getHostedWorkflowQuote(recheck.quote_id);
  if (!quote) throw new TrustMonitoringError("Recheck quote not found.", "quote_not_found", 404);
  const request = monitoringRequest(watchlist);
  const confirmed = await confirmHostedWorkflowQuote({
    quoteId: quote.id,
    idempotencyHash: quote.idempotency_hash,
    requestHash: quote.request_hash,
    request,
    signature: input.signature ?? null,
    transactionHash: input.transactionHash ?? null,
  });
  if (!confirmed.jobId) {
    throw new TrustMonitoringError(
      `Monitoring checkout could not start: ${confirmed.reason}.`,
      confirmed.reason,
      confirmed.reason === "active_job" ? 409 : 400,
      confirmed.reason === "active_job",
    );
  }
  const updated = await monitoringClient()
    .from("trust_monitoring_rechecks")
    .update({
      status: "queued",
      job_id: confirmed.jobId,
      started_at: new Date().toISOString(),
    })
    .eq("id", recheck.id);
  if (updated.error) throw new TrustMonitoringError(
    "Unable to persist the monitoring run.",
    "monitoring_unavailable",
    503,
    true,
  );
  await monitoringClient()
    .from("trust_watchlists")
    .update({
      last_recheck_at: new Date().toISOString(),
      last_job_id: confirmed.jobId,
      last_error_code: null,
      last_error_at: null,
    })
    .eq("id", watchlist.id);
  return {
    jobId: confirmed.jobId,
    recheckId: recheck.public_id,
    created: confirmed.created,
    idempotent: confirmed.reason === "idempotent",
  };
}

export async function executeTrustMonitoringJob(input: {
  jobId: string;
  reportInput: AgentTrustReportInput;
}) {
  const recheck = await monitoringClient()
    .from("trust_monitoring_rechecks")
    .select("id")
    .eq("job_id", input.jobId)
    .maybeSingle();
  if (recheck.data) {
    await monitoringClient()
      .from("trust_monitoring_rechecks")
      .update({ status: "running" })
      .eq("id", recheck.data.id);
  }
  try {
    await runHostedAgentJob(input.jobId, canonicalAgentTrustInput(input.reportInput));
    return await captureTrustMonitoringSnapshot(input.jobId);
  } catch (error) {
    await failTrustMonitoringJob(
      input.jobId,
      "execution_failed",
      error instanceof Error ? error.message : "Monitoring execution failed.",
    );
    throw error;
  }
}

export async function failTrustMonitoringJob(
  jobId: string,
  code: string,
  message: string,
) {
  const client = monitoringClient();
  const recheckResult = await client
    .from("trust_monitoring_rechecks")
    .select("id,watchlist_id")
    .eq("job_id", jobId)
    .maybeSingle();
  if (!recheckResult.data) return;
  const now = new Date().toISOString();
  await Promise.all([
    client
      .from("trust_monitoring_rechecks")
      .update({
        status: "failed",
        error_code: code,
        error_message: message.slice(0, 300),
        completed_at: now,
      })
      .eq("id", recheckResult.data.id),
    client
      .from("trust_watchlists")
      .update({ last_error_code: code, last_error_at: now })
      .eq("id", recheckResult.data.watchlist_id),
  ]);
}

export async function captureTrustMonitoringSnapshot(jobId: string) {
  const client = monitoringClient();
  const recheckResult = await client
    .from("trust_monitoring_rechecks")
    .select("*,trust_watchlists!inner(*)")
    .eq("job_id", jobId)
    .maybeSingle();
  if (recheckResult.error || !recheckResult.data) return null;
  const recheck = recheckResult.data as TrustMonitoringRecheckRow & {
    trust_watchlists: TrustWatchlistRow;
  };
  const watchlist = recheck.trust_watchlists;
  const view = await getHostedAgentJobView(jobId);
  if (!view || view.job.status !== "completed") {
    if (view?.job.status === "failed") {
      await failTrustMonitoringJob(jobId, "execution_failed", view.job.error ?? "Monitoring run failed.");
    }
    return null;
  }
  const workflowData = view.job.structuredResult?.workflowData as
    | { kind?: string; report?: AgentTrustReport }
    | null
    | undefined;
  const report =
    workflowData?.kind === "agent_trust_report" ? workflowData.report ?? null : null;
  if (!report) {
    await failTrustMonitoringJob(
      jobId,
      "report_generation_failed",
      "The completed monitoring run did not contain an Agent Trust Report.",
    );
    return null;
  }
  const exactProof = view.proofs.find(
    (proof) =>
      proof.responseHash?.toLowerCase() === report.verification.reportHash.toLowerCase(),
  );
  const existing = await client
    .from("trust_monitoring_snapshots")
    .select("*")
    .eq("job_id", jobId)
    .maybeSingle();
  if (existing.error) throw new TrustMonitoringError(
    "Unable to reconcile the monitoring snapshot.",
    "monitoring_unavailable",
    503,
    true,
  );
  if (existing.data) {
    const updated = await client
      .from("trust_monitoring_snapshots")
      .update({
        verification_status: report.verification.status,
        proof_transaction_hash: exactProof?.transactionHash ?? null,
        report_snapshot: report,
      })
      .eq("job_id", jobId)
      .select("*")
      .single();
    if (updated.error || !updated.data) {
      throw new TrustMonitoringError(
        "Unable to reconcile the monitoring snapshot.",
        "monitoring_unavailable",
        503,
        true,
      );
    }
    const snapshot = updated.data as TrustMonitoringSnapshotRow;
    const completedAt =
      recheck.completed_at ?? view.job.completedAt ?? new Date().toISOString();
    const [recheckLink, watchlistLink] = await Promise.all([
      client
        .from("trust_monitoring_rechecks")
        .update({ status: "completed", completed_at: completedAt })
        .eq("id", recheck.id),
      client
        .from("trust_watchlists")
        .update({
          last_snapshot_id: snapshot.id,
          last_job_id: jobId,
          last_recheck_at: completedAt,
          last_error_code: null,
          last_error_at: null,
        })
        .eq("id", watchlist.id),
    ]);
    if (recheckLink.error || watchlistLink.error) {
      throw new TrustMonitoringError(
        "Unable to link the monitoring snapshot.",
        "monitoring_unavailable",
        503,
        true,
      );
    }
    return snapshot;
  }

  const previousResult = await client
    .from("trust_monitoring_snapshots")
    .select("*")
    .eq("watchlist_id", watchlist.id)
    .order("sequence_number", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (previousResult.error) throw new TrustMonitoringError(
    "Unable to build trust history.",
    "monitoring_unavailable",
    503,
    true,
  );
  const previous = (previousResult.data as TrustMonitoringSnapshotRow | null) ?? null;
  const snapshotId = crypto.randomUUID();
  const snapshotPublicId = `tms_${hash(snapshotId).slice(0, 20)}`;
  const delta = buildTrustDeltaReport({
    previous: previous?.report_snapshot ?? null,
    current: report,
    previousSnapshotId: previous?.public_id ?? null,
    currentSnapshotId: snapshotPublicId,
    generatedAt: report.generatedAt,
  });
  const inserted = await client
    .from("trust_monitoring_snapshots")
    .insert({
      id: snapshotId,
      public_id: snapshotPublicId,
      watchlist_id: watchlist.id,
      recheck_id: recheck.id,
      job_id: jobId,
      sequence_number: (previous?.sequence_number ?? 0) + 1,
      trust_score: report.trustScore.overall,
      trust_status: report.trustScore.status,
      report_hash: report.verification.reportHash,
      verification_status: report.verification.status,
      proof_transaction_hash: exactProof?.transactionHash ?? null,
      report_snapshot: report,
      delta_snapshot: delta,
      observed_at: report.generatedAt,
    })
    .select("*")
    .single();
  if (inserted.error || !inserted.data) {
    const replay = await client
      .from("trust_monitoring_snapshots")
      .select("*")
      .eq("job_id", jobId)
      .maybeSingle();
    if (replay.data) return replay.data as TrustMonitoringSnapshotRow;
    throw new TrustMonitoringError(
      "Unable to persist the monitoring snapshot.",
      "monitoring_unavailable",
      503,
      true,
    );
  }
  const snapshot = inserted.data as TrustMonitoringSnapshotRow;
  const completedAt =
    recheck.completed_at ?? view.job.completedAt ?? new Date().toISOString();
  const [recheckLink, watchlistLink] = await Promise.all([
    client
      .from("trust_monitoring_rechecks")
      .update({ status: "completed", completed_at: completedAt })
      .eq("id", recheck.id),
    client
      .from("trust_watchlists")
      .update({
        last_snapshot_id: snapshot.id,
        last_job_id: jobId,
        last_recheck_at: completedAt,
        last_error_code: null,
        last_error_at: null,
      })
      .eq("id", watchlist.id),
  ]);
  if (recheckLink.error || watchlistLink.error) {
    throw new TrustMonitoringError(
      "Unable to link the monitoring snapshot.",
      "monitoring_unavailable",
      503,
      true,
    );
  }
  return snapshot;
}

export async function getPublicTrustHistory(publicId: string) {
  const watchlist = await findWatchlistByPublicId(publicId);
  if (!watchlist) throw new TrustMonitoringError(
    "Trust history not found.",
    "watchlist_not_found",
    404,
  );
  if (watchlist.last_job_id) {
    await captureTrustMonitoringSnapshot(watchlist.last_job_id).catch(() => null);
  }
  const snapshotsResult = await monitoringClient()
    .from("trust_monitoring_snapshots")
    .select("*")
    .eq("watchlist_id", watchlist.id)
    .order("sequence_number", { ascending: false })
    .limit(52);
  if (snapshotsResult.error) throw new TrustMonitoringError(
    "Trust history is temporarily unavailable.",
    "monitoring_unavailable",
    503,
    true,
  );
  const snapshots = (snapshotsResult.data ?? []) as TrustMonitoringSnapshotRow[];
  const current = snapshots[0] ?? null;
  return {
    watchlist: {
      id: watchlist.public_id,
      label: watchlist.label,
      input: watchlist.subject_input,
      cadence: watchlist.cadence,
      status: watchlist.status,
      lastCheckedAt: current?.observed_at ?? watchlist.last_recheck_at,
      nextRecheckAt:
        watchlist.status === "active" ? watchlist.next_recheck_at : null,
    },
    currentReport: current?.report_snapshot ?? null,
    currentDelta: current?.delta_snapshot ?? null,
    history: snapshots.map((snapshot) => ({
      snapshotId: snapshot.public_id,
      jobId: snapshot.job_id,
      sequence: snapshot.sequence_number,
      score: snapshot.trust_score,
      trustStatus: snapshot.trust_status,
      reportHash: snapshot.report_hash,
      verificationStatus: snapshot.verification_status,
      proofTransactionHash: snapshot.proof_transaction_hash,
      proofUrl: snapshot.proof_transaction_hash
        ? `https://testnet.arcscan.app/tx/${snapshot.proof_transaction_hash}`
        : null,
      observedAt: snapshot.observed_at,
      delta: snapshot.delta_snapshot,
      reportUrl: `/agent-runner/${snapshot.job_id}`,
    })),
  };
}

export async function claimAndLaunchScheduledTrustRecheck() {
  const client = monitoringClient();
  const claimed = await client.rpc("claim_due_trust_watchlists_v1", { p_limit: 1 });
  if (claimed.error) throw new TrustMonitoringError(
    "Unable to claim due trust watchlists.",
    "monitoring_unavailable",
    503,
    true,
  );
  const watchlist = ((claimed.data ?? []) as TrustWatchlistRow[])[0] ?? null;
  if (!watchlist) return null;
  const scheduledFor = new Date().toISOString();
  const key = `scheduled-${watchlist.id}-${scheduledFor.slice(0, 10)}`;
  try {
    const quoted = await createTrustMonitoringQuote({
      watchlist,
      trigger: "scheduled",
      idempotencyKey: key,
      scheduledFor,
    });
    const launch = await client.rpc("launch_trust_monitoring_checkout_v1", {
      p_quote_id: quoted.quote.id,
      p_recheck_id: quoted.recheck.id,
    });
    if (launch.error) throw new Error("scheduled checkout RPC failed");
    const row = (launch.data as Array<{
      job_id: string | null;
      reason: string;
    }> | null)?.[0];
    if (!row?.job_id) {
      throw new TrustMonitoringError(
        `Scheduled monitoring could not start: ${row?.reason ?? "unknown"}.`,
        row?.reason ?? "schedule_launch_failed",
        row?.reason === "active_job" ? 409 : 503,
        true,
      );
    }
    return { watchlist, recheck: quoted.recheck, jobId: row.job_id };
  } catch (error) {
    await client
      .from("trust_watchlists")
      .update({
        last_error_code:
          error instanceof TrustMonitoringError ? error.code : "schedule_launch_failed",
        last_error_at: new Date().toISOString(),
        next_recheck_at: new Date(Date.now() + 60 * 60 * 1_000).toISOString(),
      })
      .eq("id", watchlist.id);
    throw error;
  }
}
