import { createHash, randomUUID } from "node:crypto";
import { getAddress, type Address } from "viem";
import {
  PROJECT_360_MAX_BUDGET_USDC,
  validateIdempotencyKey,
} from "../agent/hosted-policy.ts";
import {
  getHostedAgentJobView,
  recoverHostedProject360AggregateProof,
  runHostedAgentJob,
} from "../agent/hosted-jobs.ts";
import { validateHostedWorkflowRequest } from "../agent/hosted-workflows.ts";
import { getByoaClient } from "../byoa/service.ts";
import {
  confirmHostedWorkflowQuote,
  sponsoredWorkflowAuthorizationMessage,
} from "../commerce/workflow-checkout.ts";
import type {
  Project360ProfileInput,
  TrustMonitoringCadence,
  TrustMonitoringStatus,
  TrustProfileRow,
  TrustProfileVisibility,
} from "../monitoring/types.ts";
import { publicAppUrl } from "../public-url.ts";
import {
  computeProject360ReportHash,
  validateProject360ReportPayload,
} from "./report.ts";
import { buildProject360DeltaReport } from "./monitoring-delta.ts";
import type {
  Project360MonitorCandidateSnapshot,
  Project360MonitorRecheckRow,
  Project360MonitorRow,
  Project360MonitorSnapshotRow,
  Project360MonitorSuggestionRow,
  Project360MonitorTrigger,
} from "./monitoring-types.ts";
import {
  candidatesHashFromRows,
  createBrowserProject360Discovery,
  createBrowserProject360Quote,
  Project360Error,
  project360IdempotencyHash,
  requireBrowserProject360Quote,
} from "./service.ts";
import {
  PROJECT_360_MODULES,
  PROJECT_360_MODULE_LABELS,
  type Project360CandidateRow,
  type Project360Input,
  type Project360Module,
  type Project360Report,
} from "./types.ts";
import {
  createProject360AlertsForSnapshot,
  createProject360RecheckFailureAlert,
} from "../monitoring/alerts.ts";

const MAX_MONITORS_PER_OWNER = 10;
const ACTIVE_RECHECK_STATUSES = ["quoted", "queued", "running"];

function db() {
  return getByoaClient();
}

function digest(value: unknown) {
  return createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
}

function nextRecheckAt(cadence: TrustMonitoringCadence, now = new Date()) {
  if (cadence === "manual") return null;
  return new Date(now.getTime() + (cadence === "daily" ? 24 : 168) * 60 * 60 * 1_000).toISOString();
}

function cadence(value: unknown): TrustMonitoringCadence {
  if (value === "manual" || value === "daily" || value === "weekly") return value;
  throw new Project360Error("Cadence must be manual, daily, or weekly.", "monitor_invalid");
}

function visibility(value: unknown): TrustProfileVisibility {
  if (value === "private" || value === "public") return value;
  throw new Project360Error("Visibility must be private or public.", "monitor_invalid");
}

function monitorStatus(value: unknown): TrustMonitoringStatus {
  if (value === "active" || value === "paused") return value;
  throw new Project360Error("Monitor status must be active or paused.", "monitor_invalid");
}

function label(value: unknown, report: Project360Report) {
  const supplied = typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
  const github = report.confirmedSources.find((source) => source.type === "github_repository");
  const fallback = github?.canonicalValue.replace(/^https:\/\/github\.com\//, "") ?? "Project 360";
  const result = supplied || fallback;
  if (result.length < 2 || result.length > 100) {
    throw new Project360Error("Monitor label must contain 2-100 characters.", "monitor_invalid");
  }
  return result;
}

function updatedLabel(value: unknown, fallback: string) {
  const supplied = typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
  const result = supplied || fallback;
  if (result.length < 2 || result.length > 100) {
    throw new Project360Error("Monitor label must contain 2-100 characters.", "monitor_invalid");
  }
  return result;
}

function publicRecheck(row: Project360MonitorRecheckRow) {
  return {
    id: row.public_id,
    trigger: row.trigger,
    status: row.status,
    quoteId: row.quote_id,
    jobId: row.job_id,
    scheduledFor: row.scheduled_for,
    errorCode: row.error_code,
    createdAt: row.created_at,
    startedAt: row.started_at,
    completedAt: row.completed_at,
  };
}

function privateSnapshot(row: Project360MonitorSnapshotRow) {
  return {
    snapshotId: row.public_id,
    jobId: row.job_id,
    sequence: row.sequence_number,
    score: row.project_trust_score,
    trustStatus: row.verdict,
    confidence: row.confidence_percent,
    coverage: row.coverage_status,
    completedModules: row.completed_modules,
    selectedModules: row.selected_modules,
    reportHash: row.report_hash,
    verificationStatus: row.verification_status,
    verifiedOnArc: row.verification_status === "verified" && Boolean(row.proof_transaction_hash),
    proofTransactionHash: row.proof_transaction_hash,
    proofUrl: row.proof_transaction_hash
      ? `https://testnet.arcscan.app/tx/${row.proof_transaction_hash}`
      : null,
    observedAt: row.observed_at,
    delta: row.delta_snapshot,
    reportUrl: `/agent-runner/${row.job_id}`,
  };
}

function publicSnapshot(row: Project360MonitorSnapshotRow) {
  const item = privateSnapshot(row);
  return {
    ...item,
    jobId: undefined,
    reportUrl: undefined,
    newRiskCount: row.delta_snapshot.summary.newRisks,
    resolvedRiskCount: row.delta_snapshot.summary.resolvedRisks,
    fullReportUrl: `/agent-runner/${row.job_id}`,
  };
}

function publicSuggestion(row: Project360MonitorSuggestionRow) {
  return {
    id: row.public_id,
    module: row.module,
    moduleLabel: PROJECT_360_MODULE_LABELS[row.module],
    type: row.source_type,
    value: row.candidate_snapshot.canonicalValue,
    provenance: {
      repository: row.candidate_snapshot.originRepository,
      file: row.candidate_snapshot.filePath,
      lineStart: row.candidate_snapshot.lineStart,
      lineEnd: row.candidate_snapshot.lineEnd,
      excerpt: row.candidate_snapshot.safeExcerpt,
    },
    confidence: row.candidate_snapshot.confidence,
    confidenceScore: row.candidate_snapshot.confidenceScore,
    status: row.status,
    reviewUrl: `/project-360?primaryType=${encodeURIComponent(row.source_type)}&primaryValue=${encodeURIComponent(row.candidate_snapshot.canonicalValue)}`,
    createdAt: row.created_at,
  };
}

async function profile(profileId: string) {
  const result = await db().from("trust_profiles").select("*").eq("id", profileId).single();
  if (result.error || !result.data) {
    throw new Project360Error("Project 360 monitor is temporarily unavailable.", "monitoring_unavailable", 503, true);
  }
  return result.data as TrustProfileRow;
}

async function findMonitor(publicId: string) {
  if (!/^p3m_[0-9a-f]{20}$/.test(publicId)) return null;
  const result = await db().from("project_360_monitors").select("*").eq("public_id", publicId).maybeSingle();
  if (result.error) throw new Project360Error("Project 360 monitor is temporarily unavailable.", "monitoring_unavailable", 503, true);
  return (result.data as Project360MonitorRow | null) ?? null;
}

export async function requireOwnerProject360Monitor(publicId: string, ownerWallet: string) {
  const row = await findMonitor(publicId);
  if (!row || row.owner_wallet.toLowerCase() !== ownerWallet.toLowerCase()) {
    throw new Project360Error("Project 360 monitor was not found.", "monitor_not_found", 404);
  }
  return row;
}

async function snapshots(monitorId: string) {
  const result = await db()
    .from("project_360_monitor_snapshots")
    .select("*")
    .eq("monitor_id", monitorId)
    .order("sequence_number", { ascending: false })
    .limit(52);
  if (result.error) throw new Project360Error("Project 360 history is temporarily unavailable.", "monitoring_unavailable", 503, true);
  return (result.data ?? []) as Project360MonitorSnapshotRow[];
}

async function suggestions(monitorId: string) {
  const result = await db()
    .from("project_360_monitor_suggestions")
    .select("*")
    .eq("monitor_id", monitorId)
    .eq("status", "pending")
    .order("created_at", { ascending: false });
  if (result.error) throw new Project360Error("Project 360 suggestions are temporarily unavailable.", "monitoring_unavailable", 503, true);
  return (result.data ?? []) as Project360MonitorSuggestionRow[];
}

async function monitorView(row: Project360MonitorRow) {
  if (row.last_job_id) await captureProject360MonitorSnapshot(row.last_job_id).catch(() => null);
  const [profileRow, history, suggestionRows] = await Promise.all([
    profile(row.profile_id),
    snapshots(row.id),
    suggestions(row.id),
  ]);
  const current = history[0] ?? null;
  return {
    id: row.public_id,
    profileId: profileRow.public_id,
    label: row.label,
    modules: row.selected_modules,
    sources: row.selected_candidates_snapshot.map((candidate) => ({
      type: candidate.type,
      module: candidate.module,
      value: candidate.canonicalValue,
      valueHash: candidate.valueHash,
    })),
    configurationHash: row.configuration_hash,
    cadence: row.cadence,
    status: row.status,
    visibility: row.visibility,
    nextRecheckAt: row.status === "active" ? row.next_recheck_at : null,
    lastRecheckAt: row.last_recheck_at,
    currentScore: current?.project_trust_score ?? null,
    confidence: current?.confidence_percent ?? null,
    coverage: current?.coverage_status ?? null,
    verificationStatus: current?.verification_status ?? null,
    latestSnapshotId: current?.public_id ?? null,
    publicHistoryUrl: `/trust/${profileRow.public_id}`,
    suggestions: suggestionRows.map(publicSuggestion),
    history: history.map(privateSnapshot),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function reportFromView(view: Awaited<ReturnType<typeof getHostedAgentJobView>>) {
  const workflowData = view?.job.structuredResult?.workflowData as
    | { kind?: string; report?: unknown }
    | null
    | undefined;
  const report = workflowData?.kind === "project_360_report" ? workflowData.report : null;
  if (!validateProject360ReportPayload(report)) return null;
  return report;
}

function exactProof(
  view: NonNullable<Awaited<ReturnType<typeof getHostedAgentJobView>>>,
  report: Project360Report,
) {
  return view.proofs.find(
    (proof) => proof.responseHash?.toLowerCase() === report.verification.reportHash.toLowerCase(),
  ) ?? null;
}

function candidateSnapshot(row: Project360CandidateRow): Project360MonitorCandidateSnapshot {
  return {
    type: row.source_type,
    module: row.module,
    canonicalValue: row.canonical_value,
    valueHash: row.value_hash,
    origin: row.origin_kind,
    originRepository: row.origin_repository,
    filePath: row.file_path,
    lineStart: row.line_start,
    lineEnd: row.line_end,
    safeExcerpt: row.safe_excerpt,
    confidence: row.confidence,
    confidenceScore: Number(row.confidence_score),
    reasonCode: row.reason_code,
    originFingerprint: row.origin_fingerprint,
  };
}

function configurationHashFromSources(
  modules: Project360Module[],
  sources: Array<{ module: Project360Module; type: string; valueHash: string }>,
) {
  const orderedModules = PROJECT_360_MODULES.filter((module) => modules.includes(module));
  return digest({
    schema: "veyra.project360.monitor.config.v1",
    modules: orderedModules,
    sources: orderedModules.map((module) => {
      const source = sources.find((item) => item.module === module);
      return source
        ? { module, type: source.type, valueHash: source.valueHash }
        : { module, type: null, valueHash: null };
    }),
  });
}

function fixedConfiguration(input: {
  projectInput: Project360Input;
  candidates: Project360MonitorCandidateSnapshot[];
}) {
  const modules = PROJECT_360_MODULES.filter((module) => input.projectInput.modules.includes(module));
  const candidates = modules.map((module) => input.candidates.find((item) => item.module === module));
  if (candidates.some((item) => !item)) {
    throw new Project360Error("The baseline Project 360 source selection is incomplete.", "monitor_baseline_invalid", 409);
  }
  const selected = candidates as Project360MonitorCandidateSnapshot[];
  const sourceHashes = selected.map((item) => item.valueHash);
  const configurationHash = configurationHashFromSources(modules, selected);
  return { modules, candidates: selected, sourceHashes, configurationHash };
}

async function getOrCreateProjectProfile(input: {
  configurationHash: string;
  modules: Project360Module[];
  candidates: Project360MonitorCandidateSnapshot[];
  label: string;
}) {
  const key = `project360:${input.configurationHash}`;
  const existing = await db().from("trust_profiles").select("*").eq("canonical_subject_key", key).maybeSingle();
  if (existing.error) throw new Project360Error("Unable to inspect the Project 360 profile.", "monitoring_unavailable", 503, true);
  if (existing.data) return existing.data as TrustProfileRow;
  const canonicalInput: Project360ProfileInput = {
    project360: true,
    configurationHash: input.configurationHash,
    modules: input.modules,
    sources: input.candidates.map((item) => ({ type: item.type, value: item.canonicalValue, valueHash: item.valueHash })),
  };
  const inserted = await db().from("trust_profiles").insert({
    canonical_subject_key: key,
    subject_type: "project_360",
    canonical_subject_input: canonicalInput,
    display_name: input.label,
  }).select("*").single();
  if (inserted.data) return inserted.data as TrustProfileRow;
  const replay = await db().from("trust_profiles").select("*").eq("canonical_subject_key", key).maybeSingle();
  if (replay.data) return replay.data as TrustProfileRow;
  throw new Project360Error("Unable to create the Project 360 profile.", "monitoring_unavailable", 503, true);
}

export async function createProject360Monitor(input: {
  ownerWallet: string;
  baselineJobId: unknown;
  label?: unknown;
  cadence?: unknown;
  visibility?: unknown;
}) {
  const ownerWallet = getAddress(input.ownerWallet as Address);
  const baselineJobId = typeof input.baselineJobId === "string" ? input.baselineJobId : "";
  if (!/^[0-9a-f-]{36}$/i.test(baselineJobId)) {
    throw new Project360Error("Completed Project 360 report was not found.", "monitor_baseline_not_found", 404);
  }
  const view = await getHostedAgentJobView(baselineJobId);
  const report = reportFromView(view);
  if (!view || view.job.status !== "completed" || view.job.workflowType !== "project_360" || !report || !view.job.workflowQuoteId) {
    throw new Project360Error("Completed Project 360 report was not found.", "monitor_baseline_not_found", 404);
  }
  const stored = await requireBrowserProject360Quote({ quoteId: view.job.workflowQuoteId, ownerWallet });
  if (stored.quote.job_id !== baselineJobId || computeProject360ReportHash(report).toLowerCase() !== report.verification.reportHash.toLowerCase()) {
    throw new Project360Error("The baseline Project 360 report failed its integrity check.", "monitor_baseline_invalid", 409);
  }
  const proof = exactProof(view, report);
  if (proof?.status !== "verified" || !proof.transactionHash || report.verification.status !== "verified") {
    throw new Project360Error("Wait for the baseline Aggregate Arc proof before enabling monitoring.", "aggregate_proof_pending", 409, true);
  }
  const candidatesResult = await db()
    .from("project_360_candidates")
    .select("*")
    .eq("discovery_id", stored.mapping.discovery_id)
    .in("public_id", stored.mapping.selected_candidate_ids);
  if (candidatesResult.error) throw new Project360Error("Unable to load the confirmed Project 360 sources.", "monitoring_unavailable", 503, true);
  const rows = (candidatesResult.data ?? []) as Project360CandidateRow[];
  if (rows.length !== stored.mapping.selected_candidate_ids.length) {
    throw new Project360Error("The baseline Project 360 source selection is incomplete.", "monitor_baseline_invalid", 409);
  }
  const fixed = fixedConfiguration({ projectInput: stored.projectInput, candidates: rows.map(candidateSnapshot) });
  const safeLabel = label(input.label, report);
  const profileRow = await getOrCreateProjectProfile({ ...fixed, label: safeLabel });
  const existing = await db()
    .from("project_360_monitors")
    .select("*")
    .ilike("owner_wallet", ownerWallet)
    .eq("profile_id", profileRow.id)
    .maybeSingle();
  if (existing.error) throw new Project360Error("Unable to inspect Project 360 monitoring.", "monitoring_unavailable", 503, true);
  if (existing.data) return { monitor: await monitorView(existing.data as Project360MonitorRow), created: false };

  const count = await db().from("project_360_monitors").select("id", { count: "exact", head: true }).ilike("owner_wallet", ownerWallet);
  if (count.error) throw new Project360Error("Unable to evaluate monitor limits.", "monitoring_unavailable", 503, true);
  if ((count.count ?? 0) >= MAX_MONITORS_PER_OWNER) {
    throw new Project360Error(`A wallet can monitor at most ${MAX_MONITORS_PER_OWNER} Project 360 reports.`, "monitor_limit_exceeded", 429);
  }
  const selectedCadence = cadence(input.cadence ?? "manual");
  const inserted = await db().from("project_360_monitors").insert({
    owner_wallet: ownerWallet,
    profile_id: profileRow.id,
    label: safeLabel,
    baseline_quote_id: stored.quote.id,
    baseline_job_id: baselineJobId,
    configuration_hash: fixed.configurationHash,
    project_input: stored.projectInput,
    selected_modules: fixed.modules,
    source_value_hashes: fixed.sourceHashes,
    selected_candidates_snapshot: fixed.candidates,
    cadence: selectedCadence,
    visibility: visibility(input.visibility ?? "private"),
    status: "active",
    next_recheck_at: nextRecheckAt(selectedCadence),
    last_recheck_at: view.job.completedAt,
    last_job_id: baselineJobId,
  }).select("*").single();
  if (inserted.error || !inserted.data) {
    throw new Project360Error("Unable to create Project 360 monitoring.", "monitoring_unavailable", 503, true);
  }
  const monitor = inserted.data as Project360MonitorRow;
  const baselineRecheck = await db().from("project_360_monitor_rechecks").insert({
    monitor_id: monitor.id,
    trigger: "baseline",
    status: "completed",
    idempotency_hash: digest(["baseline", baselineJobId]),
    configuration_hash: monitor.configuration_hash,
    quote_id: stored.quote.id,
    job_id: baselineJobId,
    started_at: view.job.startedAt,
    completed_at: view.job.completedAt ?? report.generatedAt,
  }).select("*").single();
  if (baselineRecheck.error || !baselineRecheck.data) {
    throw new Project360Error("Unable to capture the Project 360 baseline.", "monitoring_unavailable", 503, true);
  }
  await persistSnapshot({
    monitor,
    recheck: baselineRecheck.data as Project360MonitorRecheckRow,
    view,
    report,
  });
  await discoverProject360MonitorSuggestions(monitor).catch((error) => {
    console.error("[project360-monitoring] Free rediscovery failed.", { monitorId: monitor.public_id, error: error instanceof Error ? error.message : "unknown_error" });
  });
  return { monitor: await monitorView(monitor), created: true };
}

export async function listOwnerProject360Monitors(ownerWallet: string) {
  const owner = getAddress(ownerWallet as Address);
  const result = await db().from("project_360_monitors").select("*").ilike("owner_wallet", owner).order("created_at", { ascending: false }).limit(MAX_MONITORS_PER_OWNER);
  if (result.error) throw new Project360Error("Unable to load Project 360 monitors.", "monitoring_unavailable", 503, true);
  return Promise.all(((result.data ?? []) as Project360MonitorRow[]).map(monitorView));
}

export async function getOwnerProject360Monitor(publicId: string, ownerWallet: string) {
  return monitorView(await requireOwnerProject360Monitor(publicId, ownerWallet));
}

export async function updateOwnerProject360Monitor(input: {
  publicId: string;
  ownerWallet: string;
  label?: unknown;
  cadence?: unknown;
  visibility?: unknown;
  status?: unknown;
}) {
  const row = await requireOwnerProject360Monitor(input.publicId, input.ownerWallet);
  const selectedCadence = input.cadence === undefined ? row.cadence : cadence(input.cadence);
  const selectedStatus = input.status === undefined ? row.status : monitorStatus(input.status);
  let next = row.next_recheck_at;
  if (selectedStatus === "paused" || selectedCadence === "manual") next = null;
  else if (row.cadence !== selectedCadence || !next) next = nextRecheckAt(selectedCadence);
  const updated = await db().from("project_360_monitors").update({
    label: input.label === undefined ? row.label : updatedLabel(input.label, row.label),
    cadence: selectedCadence,
    status: selectedStatus,
    visibility: input.visibility === undefined ? row.visibility : visibility(input.visibility),
    next_recheck_at: next,
  }).eq("id", row.id).select("*").single();
  if (updated.error || !updated.data) throw new Project360Error("Unable to update Project 360 monitoring.", "monitoring_unavailable", 503, true);
  return monitorView(updated.data as Project360MonitorRow);
}

export async function deleteOwnerProject360Monitor(publicId: string, ownerWallet: string) {
  const row = await requireOwnerProject360Monitor(publicId, ownerWallet);
  const active = await db().from("project_360_monitor_rechecks").select("id", { count: "exact", head: true }).eq("monitor_id", row.id).in("status", ACTIVE_RECHECK_STATUSES);
  if (active.error) throw new Project360Error("Unable to inspect active rechecks.", "monitoring_unavailable", 503, true);
  if ((active.count ?? 0) > 0) throw new Project360Error("Wait for the active recheck before deleting this monitor.", "recheck_in_progress", 409, true);
  const deleted = await db().from("project_360_monitors").delete().eq("id", row.id);
  if (deleted.error) throw new Project360Error("Unable to delete Project 360 monitoring.", "monitoring_unavailable", 503, true);
  return { deleted: true, monitorId: row.public_id };
}

async function cloneExecutionDiscovery(monitor: Project360MonitorRow, recheck: Project360MonitorRecheckRow) {
  const primary = monitor.selected_candidates_snapshot[0];
  const now = new Date();
  const inserted = await db().from("project_360_discoveries").insert({
    owner_wallet: monitor.owner_wallet,
    machine_credential_id: null,
    status: "ready",
    revision: 1,
    primary_type: primary.type,
    primary_value: primary.canonicalValue,
    primary_value_hash: primary.valueHash,
    idempotency_hash: project360IdempotencyHash({ tenant: monitor.owner_wallet, idempotencyKey: `p43-clone-${recheck.public_id}`, purpose: "discovery" }),
    request_hash: digest([monitor.configuration_hash, recheck.idempotency_hash]),
    warnings: ["monitoring_fixed_selection"],
    expires_at: new Date(now.getTime() + 30 * 60 * 1_000).toISOString(),
    started_at: now.toISOString(),
    completed_at: now.toISOString(),
  }).select("*").single();
  if (inserted.error || !inserted.data) throw new Project360Error("Unable to prepare the fixed monitoring selection.", "monitoring_unavailable", 503, true);
  const candidateInsert = await db().from("project_360_candidates").insert(
    monitor.selected_candidates_snapshot.map((candidate) => ({
      discovery_id: inserted.data.id,
      source_type: candidate.type,
      module: candidate.module,
      canonical_value: candidate.canonicalValue,
      value_hash: candidate.valueHash,
      origin_kind: candidate.origin,
      origin_repository: candidate.originRepository,
      file_path: candidate.filePath,
      line_start: candidate.lineStart,
      line_end: candidate.lineEnd,
      safe_excerpt: candidate.safeExcerpt,
      confidence: candidate.confidence,
      confidence_score: candidate.confidenceScore,
      reason_code: candidate.reasonCode,
      validation_status: "valid",
      origin_fingerprint: candidate.originFingerprint,
      validated_at: now.toISOString(),
    })),
  ).select("*");
  if (candidateInsert.error || !candidateInsert.data) throw new Project360Error("Unable to prepare the fixed monitoring sources.", "monitoring_unavailable", 503, true);
  const candidates = candidateInsert.data as Project360CandidateRow[];
  const candidatesHash = candidatesHashFromRows(candidates);
  const ready = await db().from("project_360_discoveries").update({ candidates_hash: candidatesHash }).eq("id", inserted.data.id);
  if (ready.error) throw new Project360Error("Unable to seal the fixed monitoring selection.", "monitoring_unavailable", 503, true);
  return {
    publicId: inserted.data.public_id as string,
    revision: 1,
    candidateIds: monitor.selected_modules.map((module) => candidates.find((candidate) => candidate.module === module)!.public_id),
  };
}

export async function createProject360MonitorQuote(input: {
  monitor: Project360MonitorRow;
  trigger: Exclude<Project360MonitorTrigger, "baseline">;
  idempotencyKey: string;
  forwardedFor?: string | null;
  userAgent?: string | null;
  scheduledFor?: string | null;
}) {
  let userKey: string;
  try {
    userKey = validateIdempotencyKey(input.idempotencyKey);
  } catch {
    throw new Project360Error(
      "Idempotency-Key must contain 16-128 safe characters.",
      "idempotency_key_invalid",
    );
  }
  const scopedKey = `p43:${input.monitor.public_id}:${digest(userKey).slice(0, 40)}`;
  const idempotencyHash = project360IdempotencyHash({ tenant: input.monitor.owner_wallet, idempotencyKey: scopedKey, purpose: "quote" });
  const existing = await db().from("project_360_monitor_rechecks").select("*").eq("monitor_id", input.monitor.id).eq("idempotency_hash", idempotencyHash).maybeSingle();
  if (existing.error) throw new Project360Error("Unable to inspect monitoring idempotency.", "monitoring_unavailable", 503, true);
  if (existing.data) {
    const recheck = existing.data as Project360MonitorRecheckRow;
    if (!recheck.quote_id || recheck.configuration_hash !== input.monitor.configuration_hash) {
      throw new Project360Error("The monitoring key is bound to a different request.", "idempotency_conflict", 409);
    }
    const stored = await requireBrowserProject360Quote({ quoteId: recheck.quote_id, ownerWallet: input.monitor.owner_wallet });
    return {
      recheck: publicRecheck(recheck),
      quote: stored.publicQuote,
      project360: {
        selectedModules: stored.projectInput.modules,
        confirmedSources: stored.projectInput.sources,
        lineItems: stored.mapping.module_price_snapshot,
        expectedCoverage: { selected: stored.mapping.expected_coverage_count, total: 5 },
        warnings: stored.mapping.warnings,
      },
      sponsoredAuthorizationMessage: stored.publicQuote.paymentMode === "sponsored" ? sponsoredWorkflowAuthorizationMessage(stored.publicQuote) : null,
      created: false,
    };
  }
  const active = await db().from("project_360_monitor_rechecks").select("id", { count: "exact", head: true }).eq("monitor_id", input.monitor.id).in("status", ACTIVE_RECHECK_STATUSES);
  if (active.error) throw new Project360Error("Unable to inspect active rechecks.", "monitoring_unavailable", 503, true);
  if ((active.count ?? 0) > 0) throw new Project360Error("This Project 360 monitor already has an active recheck.", "recheck_in_progress", 409, true);
  const inserted = await db().from("project_360_monitor_rechecks").insert({
    monitor_id: input.monitor.id,
    trigger: input.trigger,
    status: "quoted",
    idempotency_hash: idempotencyHash,
    configuration_hash: input.monitor.configuration_hash,
    scheduled_for: input.scheduledFor ?? null,
  }).select("*").single();
  if (inserted.error || !inserted.data) throw new Project360Error("Unable to create Project 360 recheck.", "monitoring_unavailable", 503, true);
  const recheck = inserted.data as Project360MonitorRecheckRow;
  try {
    const clone = await cloneExecutionDiscovery(input.monitor, recheck);
    const quoted = await createBrowserProject360Quote({
      ownerWallet: getAddress(input.monitor.owner_wallet as Address),
      publicDiscoveryId: clone.publicId,
      discoveryRevision: clone.revision,
      selectedCandidateIds: clone.candidateIds,
      modules: input.monitor.selected_modules,
      idempotencyKey: scopedKey,
      forwardedFor: input.forwardedFor ?? null,
      userAgent: input.userAgent ?? null,
      allowSponsored: input.trigger === "scheduled" ? false : undefined,
      sponsorship: input.trigger === "scheduled" ? "scheduled_monitoring" : "regular",
      monitoringWatchlistId: input.monitor.id,
      monitoringRecheckId: recheck.id,
    });
    const updated = await db().from("project_360_monitor_rechecks").update({ quote_id: quoted.quote.id }).eq("id", recheck.id).select("*").single();
    if (updated.error || !updated.data) throw new Error("quote_link_failed");
    return {
      recheck: publicRecheck(updated.data as Project360MonitorRecheckRow),
      quote: quoted.quote,
      project360: quoted.project360,
      sponsoredAuthorizationMessage: quoted.quote.paymentMode === "sponsored" ? sponsoredWorkflowAuthorizationMessage(quoted.quote) : null,
      created: true,
    };
  } catch (error) {
    await db().from("project_360_monitor_rechecks").update({
      status: "failed",
      error_code: error instanceof Project360Error ? error.code : "quote_creation_failed",
      error_message: error instanceof Error ? error.message.slice(0, 300) : "Quote creation failed.",
      completed_at: new Date().toISOString(),
    }).eq("id", recheck.id);
    throw error;
  }
}

export async function createOwnerProject360MonitorQuote(input: {
  publicId: string;
  ownerWallet: string;
  idempotencyKey: string;
  forwardedFor?: string | null;
  userAgent?: string | null;
}) {
  return createProject360MonitorQuote({
    monitor: await requireOwnerProject360Monitor(input.publicId, input.ownerWallet),
    trigger: "manual",
    idempotencyKey: input.idempotencyKey,
    forwardedFor: input.forwardedFor,
    userAgent: input.userAgent,
  });
}

export async function confirmProject360MonitorQuote(input: {
  recheckPublicId: string;
  ownerWallet: string;
  signature?: string | null;
  transactionHash?: string | null;
}) {
  if (!/^pmr_[0-9a-f]{20}$/.test(input.recheckPublicId)) throw new Project360Error("Recheck was not found.", "recheck_not_found", 404);
  const result = await db().from("project_360_monitor_rechecks").select("*,project_360_monitors!inner(*)").eq("public_id", input.recheckPublicId).maybeSingle();
  if (result.error || !result.data) throw new Project360Error("Recheck was not found.", "recheck_not_found", 404);
  const recheck = result.data as Project360MonitorRecheckRow & { project_360_monitors: Project360MonitorRow };
  const monitor = recheck.project_360_monitors;
  if (monitor.owner_wallet.toLowerCase() !== input.ownerWallet.toLowerCase() || recheck.trigger !== "manual" || !recheck.quote_id) {
    throw new Project360Error("Recheck was not found.", "recheck_not_found", 404);
  }
  const stored = await requireBrowserProject360Quote({ quoteId: recheck.quote_id, ownerWallet: monitor.owner_wallet });
  const request = validateHostedWorkflowRequest({ workflowType: "project_360", inputText: stored.canonicalInput, budgetUsdc: PROJECT_360_MAX_BUDGET_USDC });
  const confirmed = await confirmHostedWorkflowQuote({
    quoteId: stored.quote.id,
    idempotencyHash: stored.quote.idempotency_hash,
    requestHash: stored.quote.request_hash,
    request,
    signature: input.signature ?? null,
    transactionHash: input.transactionHash ?? null,
  });
  if (!confirmed.jobId) throw new Project360Error(`Project 360 monitoring checkout could not start: ${confirmed.reason}.`, confirmed.reason, confirmed.reason === "active_job" ? 409 : 400, confirmed.reason === "active_job");
  const now = new Date().toISOString();
  const [recheckLink, monitorLink] = await Promise.all([
    db().from("project_360_monitor_rechecks").update({ status: "queued", job_id: confirmed.jobId, started_at: now }).eq("id", recheck.id),
    db().from("project_360_monitors").update({ last_recheck_at: now, last_job_id: confirmed.jobId, last_error_code: null, last_error_at: null }).eq("id", monitor.id),
  ]);
  if (recheckLink.error || monitorLink.error) throw new Project360Error("Unable to persist the Project 360 monitoring run.", "monitoring_unavailable", 503, true);
  return { jobId: confirmed.jobId, recheckId: recheck.public_id, created: confirmed.created, idempotent: confirmed.reason === "idempotent", canonicalInput: stored.canonicalInput };
}

export async function executeProject360MonitorJob(jobId: string) {
  const recheckResult = await db().from("project_360_monitor_rechecks").select("quote_id").eq("job_id", jobId).maybeSingle();
  if (!recheckResult.data?.quote_id) throw new Project360Error("Project 360 monitoring run was not found.", "recheck_not_found", 404);
  const quote = await db().from("hosted_workflow_quotes").select("owner_wallet").eq("id", recheckResult.data.quote_id).single();
  if (!quote.data?.owner_wallet) throw new Project360Error("Project 360 monitoring quote was not found.", "quote_not_found", 404);
  const stored = await requireBrowserProject360Quote({ quoteId: recheckResult.data.quote_id, ownerWallet: quote.data.owner_wallet });
  await db().from("project_360_monitor_rechecks").update({ status: "running" }).eq("job_id", jobId);
  try {
    await runHostedAgentJob(jobId, stored.canonicalInput);
    await recoverHostedProject360AggregateProof(jobId).catch(() => null);
    return captureProject360MonitorSnapshot(jobId);
  } catch (error) {
    await failProject360MonitorJob(jobId, "execution_failed", error instanceof Error ? error.message : "Project 360 monitoring failed.");
    throw error;
  }
}

async function persistSnapshot(input: {
  monitor: Project360MonitorRow;
  recheck: Project360MonitorRecheckRow;
  view: NonNullable<Awaited<ReturnType<typeof getHostedAgentJobView>>>;
  report: Project360Report;
}) {
  if (computeProject360ReportHash(input.report).toLowerCase() !== input.report.verification.reportHash.toLowerCase()) {
    throw new Project360Error("Project 360 report integrity failed.", "report_integrity_failed", 409);
  }
  const proof = exactProof(input.view, input.report);
  const existing = await db().from("project_360_monitor_snapshots").select("*").eq("job_id", input.view.job.id).maybeSingle();
  if (existing.error) throw new Project360Error("Unable to reconcile Project 360 history.", "monitoring_unavailable", 503, true);
  if (existing.data) {
    const updated = await db().from("project_360_monitor_snapshots").update({
      verification_status: input.report.verification.status,
      proof_transaction_hash: proof?.transactionHash ?? null,
      report_snapshot: input.report,
    }).eq("job_id", input.view.job.id).select("*").single();
    if (!updated.data) throw new Project360Error("Unable to reconcile Project 360 history.", "monitoring_unavailable", 503, true);
    const snapshot = updated.data as Project360MonitorSnapshotRow;
    const completedAt = input.view.job.completedAt ?? input.report.generatedAt;
    const previousResult = await db()
      .from("project_360_monitor_snapshots")
      .select("*")
      .eq("monitor_id", input.monitor.id)
      .lt("sequence_number", snapshot.sequence_number)
      .order("sequence_number", { ascending: false })
      .limit(1)
      .maybeSingle();
    const links = await Promise.all([
      db().from("project_360_monitor_rechecks").update({ status: "completed", completed_at: completedAt }).eq("id", input.recheck.id),
      db().from("project_360_monitors").update({ last_snapshot_id: snapshot.id, last_job_id: input.view.job.id, last_recheck_at: completedAt, last_error_code: null, last_error_at: null }).eq("id", input.monitor.id),
    ]);
    if (links.some((result) => result.error)) throw new Project360Error("Unable to reconcile Project 360 history.", "monitoring_unavailable", 503, true);
    try {
      await createProject360AlertsForSnapshot({
        monitor: input.monitor,
        profile: await profile(input.monitor.profile_id),
        previous: (previousResult.data as Project360MonitorSnapshotRow | null) ?? null,
        current: snapshot,
      });
    } catch (error) {
      console.error("[project360-monitoring] Alert reconciliation failed.", { monitorId: input.monitor.public_id, error: error instanceof Error ? error.message : "unknown_error" });
    }
    return snapshot;
  }
  const previousResult = await db().from("project_360_monitor_snapshots").select("*").eq("monitor_id", input.monitor.id).order("sequence_number", { ascending: false }).limit(1).maybeSingle();
  if (previousResult.error) throw new Project360Error("Unable to load Project 360 history.", "monitoring_unavailable", 503, true);
  const previous = (previousResult.data as Project360MonitorSnapshotRow | null) ?? null;
  const snapshotId = randomUUID();
  const snapshotPublicId = `pms_${digest(snapshotId).slice(0, 20)}`;
  const delta = buildProject360DeltaReport({ previous, currentSnapshotId: snapshotPublicId, current: input.report });
  const inserted = await db().from("project_360_monitor_snapshots").insert({
    id: snapshotId,
    public_id: snapshotPublicId,
    monitor_id: input.monitor.id,
    recheck_id: input.recheck.id,
    job_id: input.view.job.id,
    sequence_number: (previous?.sequence_number ?? 0) + 1,
    project_trust_score: input.report.score.value,
    confidence_percent: input.report.score.confidencePercent,
    verdict: input.report.verdict,
    coverage_status: input.report.coverage.status,
    completed_modules: input.report.coverage.completed,
    selected_modules: input.report.coverage.expected,
    report_hash: input.report.verification.reportHash,
    verification_status: input.report.verification.status,
    proof_transaction_hash: proof?.transactionHash ?? null,
    report_snapshot: input.report,
    delta_snapshot: delta,
    observed_at: input.report.generatedAt,
  }).select("*").single();
  if (inserted.error || !inserted.data) {
    const replay = await db().from("project_360_monitor_snapshots").select("*").eq("job_id", input.view.job.id).maybeSingle();
    if (replay.data) return replay.data as Project360MonitorSnapshotRow;
    throw new Project360Error("Unable to persist Project 360 history.", "monitoring_unavailable", 503, true);
  }
  const snapshot = inserted.data as Project360MonitorSnapshotRow;
  const completedAt = input.view.job.completedAt ?? input.report.generatedAt;
  const links = await Promise.all([
    db().from("project_360_monitor_rechecks").update({ status: "completed", completed_at: completedAt }).eq("id", input.recheck.id),
    db().from("project_360_monitors").update({ last_snapshot_id: snapshot.id, last_job_id: input.view.job.id, last_recheck_at: completedAt, last_error_code: null, last_error_at: null }).eq("id", input.monitor.id),
  ]);
  if (links.some((result) => result.error)) throw new Project360Error("Unable to link Project 360 history.", "monitoring_unavailable", 503, true);
  try {
    await createProject360AlertsForSnapshot({ monitor: input.monitor, profile: await profile(input.monitor.profile_id), previous, current: snapshot });
  } catch (error) {
    console.error("[project360-monitoring] Alert persistence failed.", { monitorId: input.monitor.public_id, error: error instanceof Error ? error.message : "unknown_error" });
  }
  return snapshot;
}

export async function captureProject360MonitorSnapshot(jobId: string) {
  const result = await db().from("project_360_monitor_rechecks").select("*,project_360_monitors!inner(*)").eq("job_id", jobId).maybeSingle();
  if (result.error || !result.data) return null;
  const recheck = result.data as Project360MonitorRecheckRow & { project_360_monitors: Project360MonitorRow };
  const monitor = recheck.project_360_monitors;
  const view = await getHostedAgentJobView(jobId);
  if (!view || view.job.status !== "completed") {
    if (view?.job.status === "failed") await failProject360MonitorJob(jobId, "execution_failed", view.job.error ?? "Project 360 monitoring failed.");
    return null;
  }
  const report = reportFromView(view);
  if (!report) {
    await failProject360MonitorJob(jobId, "report_generation_failed", "The completed monitoring run did not contain a Project 360 report.");
    return null;
  }
  const stored = recheck.quote_id ? await requireBrowserProject360Quote({ quoteId: recheck.quote_id, ownerWallet: monitor.owner_wallet }) : null;
  if (!stored || configurationHashFromSources(stored.projectInput.modules, stored.projectInput.sources) !== monitor.configuration_hash) {
    await failProject360MonitorJob(jobId, "configuration_mismatch", "The monitoring execution did not match its immutable configuration.");
    throw new Project360Error("Project 360 monitoring configuration mismatch.", "configuration_mismatch", 409);
  }
  const snapshot = await persistSnapshot({ monitor, recheck, view, report });
  await discoverProject360MonitorSuggestions(monitor).catch((error) => {
    console.error("[project360-monitoring] Free rediscovery failed.", { monitorId: monitor.public_id, error: error instanceof Error ? error.message : "unknown_error" });
  });
  return snapshot;
}

export async function failProject360MonitorJob(jobId: string, code: string, message: string) {
  const result = await db().from("project_360_monitor_rechecks").select("*,project_360_monitors!inner(*)").eq("job_id", jobId).maybeSingle();
  if (!result.data) return;
  const recheck = result.data as Project360MonitorRecheckRow & { project_360_monitors: Project360MonitorRow };
  const now = new Date().toISOString();
  await Promise.all([
    db().from("project_360_monitor_rechecks").update({ status: "failed", error_code: code.replace(/[^a-z0-9_]/g, "_").slice(0, 80), error_message: message.slice(0, 300), completed_at: now }).eq("id", recheck.id),
    db().from("project_360_monitors").update({ last_error_code: code.replace(/[^a-z0-9_]/g, "_").slice(0, 80), last_error_at: now }).eq("id", recheck.monitor_id),
  ]);
  try {
    await createProject360RecheckFailureAlert({
      monitor: recheck.project_360_monitors,
      profile: await profile(recheck.project_360_monitors.profile_id),
      recheck,
    });
  } catch (error) {
    console.error("[project360-monitoring] Failure alert persistence failed.", {
      monitorId: recheck.project_360_monitors.public_id,
      error: error instanceof Error ? error.message : "unknown_error",
    });
  }
}

export async function discoverProject360MonitorSuggestions(monitor: Project360MonitorRow) {
  const github = monitor.selected_candidates_snapshot.find((item) => item.type === "github_repository");
  if (!github || monitor.selected_modules.length === PROJECT_360_MODULES.length) return [];
  const discovery = await createBrowserProject360Discovery({
    ownerWallet: monitor.owner_wallet,
    idempotencyKey: `p43-suggestions-${monitor.public_id}-${digest(monitor.last_snapshot_id ?? monitor.baseline_job_id).slice(0, 24)}`,
    primaryType: github.type,
    primaryValue: github.canonicalValue,
  });
  const discoveryRow = await db().from("project_360_discoveries").select("id").eq("public_id", discovery.discovery.id).single();
  if (!discoveryRow.data) return [];
  const candidateRows = await db().from("project_360_candidates").select("*").eq("discovery_id", discoveryRow.data.id).eq("validation_status", "valid");
  if (candidateRows.error) return [];
  const unselected = (candidateRows.data as Project360CandidateRow[]).filter((candidate) => !monitor.selected_modules.includes(candidate.module));
  if (!unselected.length) return [];
  await db().from("project_360_monitor_suggestions").upsert(
    unselected.map((candidate) => ({
      monitor_id: monitor.id,
      discovery_id: candidate.discovery_id,
      candidate_id: candidate.id,
      module: candidate.module,
      source_type: candidate.source_type,
      value_hash: candidate.value_hash,
      candidate_snapshot: candidateSnapshot(candidate),
      status: "pending",
    })),
    { onConflict: "monitor_id,module,value_hash", ignoreDuplicates: true },
  );
  return unselected.map((candidate) => candidate.public_id);
}

export async function dismissProject360MonitorSuggestion(input: { publicId: string; ownerWallet: string }) {
  if (!/^psg_[0-9a-f]{20}$/.test(input.publicId)) throw new Project360Error("Suggestion was not found.", "suggestion_not_found", 404);
  const result = await db().from("project_360_monitor_suggestions").select("*,project_360_monitors!inner(owner_wallet)").eq("public_id", input.publicId).maybeSingle();
  const owner = (result.data as { project_360_monitors?: { owner_wallet?: string } } | null)?.project_360_monitors?.owner_wallet;
  if (!owner || owner.toLowerCase() !== input.ownerWallet.toLowerCase()) throw new Project360Error("Suggestion was not found.", "suggestion_not_found", 404);
  const updated = await db().from("project_360_monitor_suggestions").update({ status: "dismissed" }).eq("public_id", input.publicId);
  if (updated.error) throw new Project360Error("Unable to dismiss the suggestion.", "monitoring_unavailable", 503, true);
  return { dismissed: true, suggestionId: input.publicId };
}

export async function getPublicProject360Profile(profileRow: TrustProfileRow) {
  const monitorResult = await db().from("project_360_monitors").select("*").eq("profile_id", profileRow.id).eq("visibility", "public").order("last_recheck_at", { ascending: false, nullsFirst: false }).limit(1).maybeSingle();
  if (monitorResult.error) throw new Project360Error("Trust profile is temporarily unavailable.", "monitoring_unavailable", 503, true);
  const monitor = (monitorResult.data as Project360MonitorRow | null) ?? null;
  if (!monitor) throw new Project360Error("Trust profile not found.", "monitor_not_found", 404);
  if (monitor.last_job_id) await captureProject360MonitorSnapshot(monitor.last_job_id).catch(() => null);
  const history = await snapshots(monitor.id);
  const current = history[0] ?? null;
  const verified = history.find((snapshot) => snapshot.verification_status === "verified" && snapshot.proof_transaction_hash);
  const canonical = profileRow.canonical_subject_input as Project360ProfileInput;
  if (canonical.project360 !== true || !Array.isArray(canonical.sources)) {
    throw new Project360Error(
      "Trust profile is temporarily unavailable.",
      "monitoring_unavailable",
      503,
      true,
    );
  }
  const identity = {
    agentId: canonical.sources.find((source) => source.type === "agent_id")?.value ?? null,
    repositoryUrl: canonical.sources.find((source) => source.type === "github_repository")?.value ?? null,
    wallet: canonical.sources.find((source) => source.type === "project_wallet")?.value ?? null,
    contractAddress: canonical.sources.find((source) => source.type === "arc_contract")?.value ?? null,
    serviceEndpoint: canonical.sources.find((source) => source.type === "public_api_endpoint")?.value ?? null,
  };
  return {
    profile: {
      id: profileRow.public_id,
      name: profileRow.display_name,
      objectType: "project_360" as const,
      identity,
      currentScore: current?.project_trust_score ?? null,
      trustStatus: current?.verdict ?? null,
      scoreChange: current?.delta_snapshot.score.change ?? null,
      lastCheckedAt: current?.observed_at ?? null,
      lastVerifiedOnArcAt: verified?.observed_at ?? null,
      snapshotCount: history.length,
      coverage: current?.coverage_status ?? null,
      confidence: current?.confidence_percent ?? null,
    },
    currentReport: current?.report_snapshot ?? null,
    currentDelta: current?.delta_snapshot ?? null,
    snapshots: history.map(publicSnapshot),
  };
}

export async function claimAndLaunchScheduledProject360Recheck() {
  const claimed = await db().rpc("claim_due_project_360_monitors_v1", { p_limit: 1 });
  if (claimed.error) throw new Project360Error("Unable to claim due Project 360 monitors.", "monitoring_unavailable", 503, true);
  const monitor = ((claimed.data ?? []) as Project360MonitorRow[])[0] ?? null;
  if (!monitor) return null;
  const scheduledFor = new Date().toISOString();
  try {
    const quoted = await createProject360MonitorQuote({
      monitor,
      trigger: "scheduled",
      idempotencyKey: `scheduled-${monitor.public_id}-${digest(monitor.next_recheck_at ?? scheduledFor).slice(0, 24)}`,
      scheduledFor,
    });
    const recheck = await db().from("project_360_monitor_rechecks").select("*").eq("public_id", quoted.recheck.id).single();
    if (!recheck.data) throw new Error("recheck_missing");
    const launched = await db().rpc("launch_project_360_monitoring_checkout_v1", { p_quote_id: quoted.quote.id, p_recheck_id: recheck.data.id });
    if (launched.error) throw new Error("scheduled_checkout_failed");
    const row = (launched.data as Array<{ job_id: string | null; reason: string }> | null)?.[0];
    if (!row?.job_id) throw new Project360Error(`Scheduled Project 360 monitoring could not start: ${row?.reason ?? "unknown"}.`, row?.reason ?? "schedule_launch_failed", row?.reason === "active_job" ? 409 : 503, true);
    return { monitor, recheck: recheck.data as Project360MonitorRecheckRow, jobId: row.job_id };
  } catch (error) {
    await db().from("project_360_monitors").update({ last_error_code: error instanceof Project360Error ? error.code : "schedule_launch_failed", last_error_at: new Date().toISOString(), next_recheck_at: new Date(Date.now() + 60 * 60 * 1_000).toISOString() }).eq("id", monitor.id);
    throw error;
  }
}

export function project360ProfileUrl(publicId: string) {
  return `${publicAppUrl()}/trust/${publicId}`;
}
