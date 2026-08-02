import { createHmac } from "node:crypto";
import type { Address } from "viem";
import { getByoaClient } from "../byoa/service.ts";
import {
  createHostedWorkflowQuote,
  getHostedWorkflowQuote,
  HostedCheckoutInfrastructureError,
  HostedCheckoutPolicyError,
  toPublicHostedWorkflowQuote,
} from "../commerce/workflow-checkout.ts";
import {
  hostedIdempotencyRequestHash,
  hostedRequesterFingerprint,
  PROJECT_360_MAX_BUDGET_USDC,
} from "../agent/hosted-policy.ts";
import { previewHostedWorkflow } from "../agent/hosted-jobs.ts";
import {
  canonicalProject360Input,
  normalizeProject360Input,
  normalizeProject360Source,
  project360Hash,
  project360SelectionHash,
  Project360InputError,
} from "./input.ts";
import {
  discoverProject360Candidates,
  project360CandidateSetHash,
  type Project360CandidateDraft,
} from "./discovery.ts";
import {
  PROJECT_360_MODULES,
  PROJECT_360_MODULE_LABELS,
  type Project360CandidateRow,
  type Project360ConfirmedSource,
  type Project360DiscoveryRow,
  type Project360Input,
  type Project360Module,
  type Project360QuoteLineItem,
  type Project360QuoteRow,
  type Project360SourceType,
} from "./types.ts";
import { validateHostedWorkflowRequest } from "../agent/hosted-workflows.ts";
import { verifyDnsSsrf } from "../seller/ssrf.ts";

export class Project360Error extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly status = 400,
    public readonly retryable = false,
  ) {
    super(message);
    this.name = "Project360Error";
  }
}

function client() {
  return getByoaClient();
}

function project360Secret() {
  const secret = process.env.HOSTED_AGENT_RATE_LIMIT_SECRET?.trim();
  if (!secret) {
    throw new Project360Error(
      "Project 360 is temporarily unavailable.",
      "project_360_unavailable",
      503,
      true,
    );
  }
  return secret;
}

function keyedHash(purpose: string, value: string) {
  return createHmac("sha256", project360Secret())
    .update(`${purpose}\n${value}`)
    .digest("hex");
}

export function project360IdempotencyHash(input: {
  tenant: string;
  idempotencyKey: string;
  purpose: "discovery" | "quote" | "confirmation";
}) {
  return keyedHash(
    `project360-${input.purpose}-v1`,
    `${input.tenant.toLowerCase()}\n${input.idempotencyKey}`,
  );
}

function publicCandidate(row: Project360CandidateRow) {
  return {
    id: row.public_id,
    type: row.source_type,
    module: row.module,
    value: row.canonical_value,
    provenance: {
      origin: row.origin_kind,
      repository: row.origin_repository,
      file: row.file_path,
      lineStart: row.line_start,
      lineEnd: row.line_end,
      excerpt: row.safe_excerpt,
    },
    confidence: row.confidence,
    confidenceScore: Number(row.confidence_score),
    reason: row.reason_code,
    validationStatus: row.validation_status,
    included: false,
  };
}

function publicDiscovery(
  row: Project360DiscoveryRow,
  candidates: Project360CandidateRow[],
) {
  const expired = row.status === "ready" && Date.parse(row.expires_at) <= Date.now();
  return {
    id: row.public_id,
    status: expired ? "expired" : row.status,
    revision: row.revision,
    free: true,
    paymentRequired: false,
    primary: {
      type: row.primary_type,
      value: row.primary_value,
    },
    candidatesHash: row.candidates_hash,
    candidates: candidates.map(publicCandidate),
    warnings: row.warnings,
    errorCode: row.error_code,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    completedAt: row.completed_at,
  };
}

async function discoveryCandidates(discoveryId: string) {
  const result = await client()
    .from("project_360_candidates")
    .select("*")
    .eq("discovery_id", discoveryId)
    .order("confidence_score", { ascending: false })
    .order("created_at", { ascending: true });
  if (result.error) {
    throw new Project360Error(
      "Unable to load Project 360 candidates.",
      "project_360_unavailable",
      503,
      true,
    );
  }
  return (result.data ?? []) as Project360CandidateRow[];
}

async function browserDiscoveryById(publicId: string, ownerWallet: string) {
  const result = await client()
    .from("project_360_discoveries")
    .select("*")
    .eq("public_id", publicId)
    .ilike("owner_wallet", ownerWallet)
    .is("machine_credential_id", null)
    .maybeSingle();
  if (result.error) {
    throw new Project360Error(
      "Unable to load Project 360 discovery.",
      "project_360_unavailable",
      503,
      true,
    );
  }
  if (!result.data) {
    throw new Project360Error(
      "Project 360 discovery was not found.",
      "discovery_not_found",
      404,
    );
  }
  return result.data as Project360DiscoveryRow;
}

async function machineDiscoveryById(input: {
  publicId: string;
  ownerWallet: string;
  machineCredentialId: string;
}) {
  const result = await client()
    .from("project_360_discoveries")
    .select("*")
    .eq("public_id", input.publicId)
    .ilike("owner_wallet", input.ownerWallet)
    .eq("machine_credential_id", input.machineCredentialId)
    .maybeSingle();
  if (result.error) {
    throw new Project360Error(
      "Unable to load Project 360 discovery.",
      "project_360_unavailable",
      503,
      true,
    );
  }
  if (!result.data) {
    throw new Project360Error(
      "Project 360 discovery was not found.",
      "discovery_not_found",
      404,
    );
  }
  return result.data as Project360DiscoveryRow;
}

export async function getBrowserProject360Discovery(input: {
  publicId: string;
  ownerWallet: string;
}) {
  if (!/^dsc_[0-9a-f]{20}$/.test(input.publicId)) {
    throw new Project360Error(
      "Project 360 discovery was not found.",
      "discovery_not_found",
      404,
    );
  }
  const row = await browserDiscoveryById(input.publicId, input.ownerWallet);
  return publicDiscovery(row, await discoveryCandidates(row.id));
}

export async function getMachineProject360Discovery(input: {
  publicId: string;
  ownerWallet: string;
  machineCredentialId: string;
}) {
  if (!/^dsc_[0-9a-f]{20}$/.test(input.publicId)) {
    throw new Project360Error(
      "Project 360 discovery was not found.",
      "discovery_not_found",
      404,
    );
  }
  const row = await machineDiscoveryById(input);
  return publicDiscovery(row, await discoveryCandidates(row.id));
}

function candidateInsert(discoveryId: string, candidate: Project360CandidateDraft) {
  return {
    discovery_id: discoveryId,
    source_type: candidate.sourceType,
    module: candidate.module,
    canonical_value: candidate.canonicalValue,
    value_hash: candidate.valueHash,
    origin_kind: candidate.originKind,
    origin_repository: candidate.originRepository,
    file_path: candidate.filePath,
    line_start: candidate.lineStart,
    line_end: candidate.lineEnd,
    safe_excerpt: candidate.safeExcerpt,
    confidence: candidate.confidence,
    confidence_score: candidate.confidenceScore,
    reason_code: candidate.reasonCode,
    validation_status: candidate.validationStatus,
    origin_fingerprint: candidate.originFingerprint,
    validated_at: new Date().toISOString(),
  };
}

export async function createBrowserProject360Discovery(input: {
  ownerWallet: string;
  idempotencyKey: string;
  primaryType: unknown;
  primaryValue: unknown;
}) {
  const primary = normalizeProject360Source({
    type: input.primaryType,
    value: input.primaryValue,
  });
  const idempotencyHash = project360IdempotencyHash({
    tenant: input.ownerWallet,
    idempotencyKey: input.idempotencyKey,
    purpose: "discovery",
  });
  const requestHash = keyedHash(
    "project360-discovery-request-v1",
    `${input.ownerWallet.toLowerCase()}\n${primary.type}\n${primary.valueHash}`,
  );
  const existing = await client()
    .from("project_360_discoveries")
    .select("*")
    .ilike("owner_wallet", input.ownerWallet)
    .is("machine_credential_id", null)
    .eq("idempotency_hash", idempotencyHash)
    .maybeSingle();
  if (existing.error) {
    throw new Project360Error(
      "Unable to inspect Project 360 discovery idempotency.",
      "project_360_unavailable",
      503,
      true,
    );
  }
  if (existing.data) {
    const row = existing.data as Project360DiscoveryRow;
    if (row.request_hash !== requestHash) {
      throw new Project360Error(
        "This Idempotency-Key is already bound to a different discovery input.",
        "idempotency_conflict",
        409,
      );
    }
    return {
      discovery: publicDiscovery(row, await discoveryCandidates(row.id)),
      created: false,
    };
  }

  const inserted = await client()
    .from("project_360_discoveries")
    .insert({
      owner_wallet: input.ownerWallet,
      machine_credential_id: null,
      status: "running",
      primary_type: primary.type,
      primary_value: primary.canonicalValue,
      primary_value_hash: primary.valueHash,
      idempotency_hash: idempotencyHash,
      request_hash: requestHash,
      started_at: new Date().toISOString(),
    })
    .select("*")
    .single();
  if (inserted.error || !inserted.data) {
    const replay = await client()
      .from("project_360_discoveries")
      .select("*")
      .ilike("owner_wallet", input.ownerWallet)
      .is("machine_credential_id", null)
      .eq("idempotency_hash", idempotencyHash)
      .maybeSingle();
    if (replay.data && (replay.data as Project360DiscoveryRow).request_hash === requestHash) {
      const row = replay.data as Project360DiscoveryRow;
      return {
        discovery: publicDiscovery(row, await discoveryCandidates(row.id)),
        created: false,
      };
    }
    throw new Project360Error(
      "Unable to create Project 360 discovery.",
      "project_360_unavailable",
      503,
      true,
    );
  }

  const row = inserted.data as Project360DiscoveryRow;
  try {
    const discovered = await discoverProject360Candidates({
      primaryType: primary.type,
      primaryValue: primary.canonicalValue,
    });
    const candidatesHash = project360CandidateSetHash(discovered.candidates);
    const stored = await client()
      .from("project_360_candidates")
      .insert(discovered.candidates.map((candidate) => candidateInsert(row.id, candidate)))
      .select("*");
    if (stored.error) throw new Error("candidate_insert_failed");
    const completedAt = new Date().toISOString();
    const completed = await client()
      .from("project_360_discoveries")
      .update({
        status: "ready",
        candidates_hash: candidatesHash,
        warnings: discovered.warnings,
        error_code: null,
        completed_at: completedAt,
      })
      .eq("id", row.id)
      .select("*")
      .single();
    if (completed.error || !completed.data) throw new Error("discovery_update_failed");
    return {
      discovery: publicDiscovery(
        completed.data as Project360DiscoveryRow,
        (stored.data ?? []) as Project360CandidateRow[],
      ),
      created: true,
      stats: discovered.stats,
    };
  } catch (error) {
    const code = error instanceof Project360InputError
      ? error.code
      : error instanceof Error && /github/i.test(error.message)
        ? "github_discovery_unavailable"
        : "discovery_failed";
    await client()
      .from("project_360_discoveries")
      .update({
        status: "failed",
        error_code: code,
        completed_at: new Date().toISOString(),
      })
      .eq("id", row.id);
    throw new Project360Error(
      code === "github_discovery_unavailable"
        ? "GitHub discovery is temporarily unavailable. No paid module was started."
        : "Project 360 discovery could not be completed. No paid module was started.",
      code,
      503,
      true,
    );
  }
}

export async function createMachineProject360Discovery(input: {
  ownerWallet: string;
  machineCredentialId: string;
  idempotencyKey: string;
  primaryType: unknown;
  primaryValue: unknown;
}) {
  const primary = normalizeProject360Source({
    type: input.primaryType,
    value: input.primaryValue,
  });
  const idempotencyHash = project360IdempotencyHash({
    tenant: input.machineCredentialId,
    idempotencyKey: input.idempotencyKey,
    purpose: "discovery",
  });
  const requestHash = keyedHash(
    "project360-machine-discovery-request-v1",
    `${input.machineCredentialId}\n${primary.type}\n${primary.valueHash}`,
  );
  const existing = await client()
    .from("project_360_discoveries")
    .select("*")
    .eq("machine_credential_id", input.machineCredentialId)
    .eq("idempotency_hash", idempotencyHash)
    .maybeSingle();
  if (existing.error) {
    throw new Project360Error(
      "Unable to inspect Project 360 discovery idempotency.",
      "project_360_unavailable",
      503,
      true,
    );
  }
  if (existing.data) {
    const row = existing.data as Project360DiscoveryRow;
    if (row.request_hash !== requestHash) {
      throw new Project360Error(
        "This Idempotency-Key is already bound to a different discovery input.",
        "idempotency_conflict",
        409,
      );
    }
    return {
      discovery: publicDiscovery(row, await discoveryCandidates(row.id)),
      created: false,
    };
  }
  const inserted = await client()
    .from("project_360_discoveries")
    .insert({
      owner_wallet: input.ownerWallet,
      machine_credential_id: input.machineCredentialId,
      status: "running",
      primary_type: primary.type,
      primary_value: primary.canonicalValue,
      primary_value_hash: primary.valueHash,
      idempotency_hash: idempotencyHash,
      request_hash: requestHash,
      started_at: new Date().toISOString(),
    })
    .select("*")
    .single();
  if (inserted.error || !inserted.data) {
    throw new Project360Error(
      "Unable to create Project 360 discovery.",
      "project_360_unavailable",
      503,
      true,
    );
  }
  const row = inserted.data as Project360DiscoveryRow;
  try {
    const discovered = await discoverProject360Candidates({
      primaryType: primary.type,
      primaryValue: primary.canonicalValue,
    });
    const candidatesHash = project360CandidateSetHash(discovered.candidates);
    const stored = await client()
      .from("project_360_candidates")
      .insert(discovered.candidates.map((candidate) => candidateInsert(row.id, candidate)))
      .select("*");
    if (stored.error) throw new Error("candidate_insert_failed");
    const completed = await client()
      .from("project_360_discoveries")
      .update({
        status: "ready",
        candidates_hash: candidatesHash,
        warnings: discovered.warnings,
        error_code: null,
        completed_at: new Date().toISOString(),
      })
      .eq("id", row.id)
      .select("*")
      .single();
    if (completed.error || !completed.data) throw new Error("discovery_update_failed");
    return {
      discovery: publicDiscovery(
        completed.data as Project360DiscoveryRow,
        (stored.data ?? []) as Project360CandidateRow[],
      ),
      created: true,
      stats: discovered.stats,
    };
  } catch {
    await client()
      .from("project_360_discoveries")
      .update({
        status: "failed",
        error_code: "discovery_failed",
        completed_at: new Date().toISOString(),
      })
      .eq("id", row.id);
    throw new Project360Error(
      "Project 360 discovery could not be completed. No paid module was started.",
      "discovery_failed",
      503,
      true,
    );
  }
}

export function candidatesHashFromRows(rows: Project360CandidateRow[]) {
  return project360Hash(
    JSON.stringify(
      [...rows]
        .sort((left, right) =>
          `${left.source_type}\n${left.value_hash}\n${left.origin_fingerprint}`.localeCompare(
            `${right.source_type}\n${right.value_hash}\n${right.origin_fingerprint}`,
          ),
        )
        .map((row) => ({
          sourceType: row.source_type,
          module: row.module,
          valueHash: row.value_hash,
          originFingerprint: row.origin_fingerprint,
          confidence: row.confidence,
          confidenceScore: Number(row.confidence_score),
          validationStatus: row.validation_status,
        })),
    ),
  );
}

function quoteLineItems(
  plan: Awaited<ReturnType<typeof previewHostedWorkflow>>,
): Project360QuoteLineItem[] {
  const groups: Array<{
    module: Project360QuoteLineItem["module"];
    label: string;
    slugs: string[];
  }> = [
    { module: "github_due_diligence", label: PROJECT_360_MODULE_LABELS.github_due_diligence, slugs: ["github-repository-intelligence", "github-due-diligence-analysis"] },
    { module: "agent_trust_report", label: PROJECT_360_MODULE_LABELS.agent_trust_report, slugs: ["agent-trust-finalizer"] },
    { module: "treasury_health", label: PROJECT_360_MODULE_LABELS.treasury_health, slugs: ["treasury-health-finalizer"] },
    { module: "paid_api_quality", label: PROJECT_360_MODULE_LABELS.paid_api_quality, slugs: ["api-quality-finalizer"] },
    { module: "arc_contract_analysis", label: PROJECT_360_MODULE_LABELS.arc_contract_analysis, slugs: ["arc-contract-analysis-finalizer"] },
    { module: "project_360_finalization", label: "Project 360 canonical finalization", slugs: ["project-360-finalizer"] },
  ];
  return groups.flatMap((group) => {
    const services = plan.selectedServices.filter((service) => group.slugs.includes(service.slug));
    if (services.length === 0) return [];
    return [{
      module: group.module,
      label: group.label,
      serviceSlugs: services.map((service) => service.slug),
      priceUsdc: Number(
        services.reduce((sum, service) => sum + service.priceUsdc, 0).toFixed(6),
      ),
      sharedEvidence: group.module === "agent_trust_report" &&
        plan.selectedServices.some((service) => service.slug === "github-repository-intelligence"),
    }];
  });
}

function project360Warnings(modules: Project360Module[]) {
  const warnings: string[] = [];
  for (const candidateModule of PROJECT_360_MODULES) {
    if (!modules.includes(candidateModule)) warnings.push(`${candidateModule}_not_analyzed`);
  }
  if (modules.length < 5) warnings.unshift("partial_project_360_report");
  return warnings;
}

async function revalidateSelectedEndpointSources(sources: Project360ConfirmedSource[]) {
  for (const source of sources) {
    if (source.type !== "public_api_endpoint") continue;
    const url = new URL(source.canonicalValue);
    await verifyDnsSsrf(url.hostname, { allowLocalhost: false });
  }
}

export async function createBrowserProject360Quote(input: {
  ownerWallet: Address;
  publicDiscoveryId: string;
  discoveryRevision: unknown;
  selectedCandidateIds: unknown;
  modules: unknown;
  idempotencyKey: string;
  forwardedFor: string | null;
  userAgent: string | null;
  byoaAgentId?: string;
  machineCredentialId?: string;
  allowSponsored?: boolean;
  sponsorship?: "regular" | "scheduled_monitoring";
  monitoringWatchlistId?: string;
  monitoringRecheckId?: string;
}) {
  const discovery = input.machineCredentialId
    ? await machineDiscoveryById({
        publicId: input.publicDiscoveryId,
        ownerWallet: input.ownerWallet,
        machineCredentialId: input.machineCredentialId,
      })
    : await browserDiscoveryById(input.publicDiscoveryId, input.ownerWallet);
  if (
    discovery.status !== "ready" ||
    Date.parse(discovery.expires_at) <= Date.now() ||
    !discovery.candidates_hash
  ) {
    throw new Project360Error(
      "Discovery is not ready or has expired. Run free discovery again.",
      "discovery_not_ready",
      409,
    );
  }
  if (
    !Number.isInteger(input.discoveryRevision) ||
    Number(input.discoveryRevision) !== discovery.revision
  ) {
    throw new Project360Error(
      "Discovery changed before quote creation. Review the current candidates.",
      "discovery_revision_conflict",
      409,
    );
  }
  if (!Array.isArray(input.selectedCandidateIds)) {
    throw new Project360Error(
      "Select at least one Project 360 source.",
      "project_sources_invalid",
    );
  }
  const selectedIds = [...new Set(input.selectedCandidateIds.map(String))];
  if (
    selectedIds.length < 1 ||
    selectedIds.length > 5 ||
    selectedIds.some((id) => !/^src_[0-9a-f]{20}$/.test(id))
  ) {
    throw new Project360Error(
      "Select one confirmed source per Project 360 module.",
      "project_sources_invalid",
    );
  }
  if (!Array.isArray(input.modules)) {
    throw new Project360Error(
      "Select at least one Project 360 module.",
      "project_modules_invalid",
    );
  }
  const moduleSet = [...new Set(input.modules.map(String))];
  if (
    moduleSet.length < 1 ||
    moduleSet.length > 5 ||
    moduleSet.some((module) => !PROJECT_360_MODULES.includes(module as Project360Module))
  ) {
    throw new Project360Error(
      "Select between one and five Project 360 modules.",
      "project_modules_invalid",
    );
  }
  const modules = PROJECT_360_MODULES.filter((module) => moduleSet.includes(module));
  const allCandidates = await discoveryCandidates(discovery.id);
  if (candidatesHashFromRows(allCandidates) !== discovery.candidates_hash) {
    throw new Project360Error(
      "Discovery candidate integrity check failed. Run discovery again.",
      "discovery_integrity_failed",
      409,
    );
  }
  const selectedRows = selectedIds.map((id) =>
    allCandidates.find((candidate) => candidate.public_id === id),
  );
  if (selectedRows.some((candidate) => !candidate || candidate.validation_status !== "valid")) {
    throw new Project360Error(
      "A selected candidate is unavailable or blocked.",
      "candidate_not_selectable",
      409,
    );
  }
  const typedRows = selectedRows as Project360CandidateRow[];
  if (new Set(typedRows.map((candidate) => candidate.module)).size !== typedRows.length) {
    throw new Project360Error(
      "Select at most one source per Project 360 module.",
      "duplicate_module_source",
    );
  }
  const sources: Project360ConfirmedSource[] = typedRows.map((candidate) => ({
    candidateId: candidate.public_id,
    type: candidate.source_type,
    module: candidate.module,
    canonicalValue: candidate.canonical_value,
    valueHash: candidate.value_hash,
    origin: candidate.origin_kind,
    confidence: candidate.confidence,
  }));
  for (const selectedModule of modules) {
    if (!sources.some((source) => source.module === selectedModule)) {
      throw new Project360Error(
        `${PROJECT_360_MODULE_LABELS[selectedModule]} needs a confirmed source.`,
        "project_module_source_missing",
      );
    }
  }
  if (sources.some((source) => !modules.includes(source.module))) {
    throw new Project360Error(
      "Every included source must have its module selected in the quote.",
      "source_module_not_selected",
    );
  }
  try {
    await revalidateSelectedEndpointSources(sources);
  } catch {
    throw new Project360Error(
      "A selected endpoint no longer resolves to a safe public address.",
      "endpoint_private_network_blocked",
      409,
    );
  }

  const selectionHash = project360SelectionHash({
    discoveryId: discovery.public_id,
    discoveryRevision: discovery.revision,
    candidatesHash: discovery.candidates_hash,
    sources,
    modules,
  });
  const projectInput: Project360Input = normalizeProject360Input({
    schema: "veyra.project360.input.v1",
    discoveryId: discovery.public_id,
    discoveryRevision: discovery.revision,
    discoverySnapshotHash: discovery.candidates_hash,
    selectionHash,
    sources,
    modules,
  });
  const canonicalInput = canonicalProject360Input(projectInput);
  const request = validateHostedWorkflowRequest({
    workflowType: "project_360",
    project360Input: projectInput,
    inputText: canonicalInput,
    budgetUsdc: PROJECT_360_MAX_BUDGET_USDC,
  });
  const plan = await previewHostedWorkflow(request);
  const requiredSlugs = new Set([
    ...(modules.includes("github_due_diligence")
      ? ["github-repository-intelligence", "github-due-diligence-analysis"]
      : []),
    ...(modules.includes("agent_trust_report") ? ["agent-trust-finalizer"] : []),
    ...(modules.includes("treasury_health") ? ["treasury-health-finalizer"] : []),
    ...(modules.includes("paid_api_quality") ? ["api-quality-finalizer"] : []),
    ...(modules.includes("arc_contract_analysis") ? ["arc-contract-analysis-finalizer"] : []),
    "project-360-finalizer",
  ]);
  const planned = new Set(plan.selectedServices.map((service) => service.slug));
  const missing = [...requiredSlugs].filter((slug) => !planned.has(slug));
  if (missing.length > 0 || plan.selectedServices.length > 7) {
    throw new Project360Error(
      "Project 360 required services are not fully enabled.",
      "project_360_services_unavailable",
      503,
      true,
    );
  }
  const lineItems = quoteLineItems(plan);
  const warnings = project360Warnings(modules);
  plan.metadata = {
    ...(plan.metadata ?? {}),
    project360Input: projectInput,
    project360Quote: {
      lineItems,
      expectedCoverage: { selected: modules.length, total: 5 },
      warnings,
    },
  };
  const inputSha256 = project360Hash(canonicalInput);
  const idempotencyHash = project360IdempotencyHash({
    tenant: input.machineCredentialId ?? input.ownerWallet,
    idempotencyKey: input.idempotencyKey,
    purpose: "quote",
  });
  const requestHash = hostedIdempotencyRequestHash({
    secret: project360Secret(),
    workflowType: request.workflowType,
    inputSha256,
    task: request.task,
    repository: request.repository,
    budgetUsdc: request.budgetUsdc,
  });
  let quoteResult: Awaited<ReturnType<typeof createHostedWorkflowQuote>>;
  try {
    quoteResult = await createHostedWorkflowQuote({
      idempotencyHash,
      requestHash,
      requesterFingerprint: hostedRequesterFingerprint({
        secret: project360Secret(),
        forwardedFor: input.forwardedFor,
        userAgent: input.userAgent,
      }),
      requesterWallet: input.ownerWallet,
      byoaAgentId: input.byoaAgentId,
      machineCredentialId: input.machineCredentialId,
      ownerWallet: input.ownerWallet,
      request,
      plan,
      metadata: {
        project360Input: projectInput,
        project360SelectionHash: selectionHash,
        project360DiscoveryId: discovery.public_id,
        project360LineItems: lineItems,
        project360Warnings: warnings,
        ...(input.monitoringWatchlistId
          ? { monitoringWatchlistId: input.monitoringWatchlistId }
          : {}),
        ...(input.monitoringRecheckId
          ? { monitoringRecheckId: input.monitoringRecheckId }
          : {}),
      },
      allowSponsored: input.allowSponsored,
      sponsorship: input.sponsorship,
    });
  } catch (error) {
    if (error instanceof HostedCheckoutPolicyError) {
      throw new Project360Error(
        error.reason === "idempotency_conflict"
          ? "The Idempotency-Key is already bound to a different Project 360 quote payload."
          : "Project 360 checkout is temporarily limited by the active-run policy.",
        error.reason,
        error.reason === "rate_limited" ? 429 : 409,
        error.reason !== "idempotency_conflict",
      );
    }
    if (error instanceof HostedCheckoutInfrastructureError) {
      const checkoutError = new Project360Error(
        "The immutable Project 360 quote could not be created right now.",
        `project_quote_${error.stage}_unavailable`,
        503,
        true,
      );
      checkoutError.cause = error;
      throw checkoutError;
    }
    throw new Project360Error(
      "The immutable Project 360 quote could not be created right now.",
      "project_quote_checkout_unavailable",
      503,
      true,
    );
  }
  const mappingPayload = {
    quote_id: quoteResult.quote.id,
    discovery_id: discovery.id,
    discovery_revision: discovery.revision,
    candidates_hash: discovery.candidates_hash,
    selection_hash: selectionHash,
    selected_candidate_ids: selectedIds,
    confirmed_sources: sources,
    module_price_snapshot: lineItems,
    expected_coverage_count: modules.length,
    warnings,
  };
  let mapping = await client()
    .from("project_360_quotes")
    .select("*")
    .eq("quote_id", quoteResult.quote.id)
    .maybeSingle();
  if (mapping.error) {
    throw new Project360Error(
      "Unable to inspect the immutable Project 360 quote binding.",
      "project_quote_binding_failed",
      503,
      true,
    );
  }
  if (!mapping.data) {
    const inserted = await client()
      .from("project_360_quotes")
      .insert(mappingPayload)
      .select("*")
      .single();
    if (inserted.error || !inserted.data) {
      // A concurrent idempotent request may have inserted the immutable row.
      mapping = await client()
        .from("project_360_quotes")
        .select("*")
        .eq("quote_id", quoteResult.quote.id)
        .maybeSingle();
    } else {
      mapping = inserted;
    }
  }
  const bound = mapping.data as Project360QuoteRow | null;
  if (
    mapping.error ||
    !bound ||
    bound.discovery_id !== discovery.id ||
    bound.discovery_revision !== discovery.revision ||
    bound.candidates_hash !== discovery.candidates_hash ||
    bound.selection_hash !== selectionHash
  ) {
    throw new Project360Error(
      "Unable to bind the immutable Project 360 quote.",
      "project_quote_binding_failed",
      503,
      true,
    );
  }
  return {
    quote: quoteResult.quote,
    project360: {
      discoveryId: discovery.public_id,
      discoveryRevision: discovery.revision,
      discoverySnapshotHash: discovery.candidates_hash,
      selectionHash,
      confirmedSources: sources,
      selectedModules: modules,
      lineItems,
      pricing: {
        moduleSubtotalUsdc: Number(
          lineItems.reduce((sum, item) => sum + item.priceUsdc, 0).toFixed(6),
        ),
        platformFeeUsdc: quoteResult.quote.pricing.platformFeeUsdc,
        totalUsdc: quoteResult.quote.pricing.listPriceUsdc,
        amountDueUsdc: quoteResult.quote.pricing.amountDueUsdc,
      },
      expectedCoverage: { selected: modules.length, total: 5 },
      expectedCoverageLabel: `${modules.length} of 5 modules`,
      warnings,
      canonicalInput,
    },
    created: quoteResult.created,
  };
}

export async function requireBrowserProject360Quote(input: {
  quoteId: string;
  ownerWallet: string;
}) {
  const quote = await getHostedWorkflowQuote(input.quoteId);
  if (
    !quote ||
    quote.workflow_type !== "project_360" ||
    !quote.owner_wallet ||
    quote.owner_wallet.toLowerCase() !== input.ownerWallet.toLowerCase()
  ) {
    throw new Project360Error("Project 360 quote was not found.", "quote_not_found", 404);
  }
  const mapping = await client()
    .from("project_360_quotes")
    .select("*")
    .eq("quote_id", input.quoteId)
    .maybeSingle();
  if (mapping.error) {
    throw new Project360Error(
      "Unable to load Project 360 quote.",
      "project_360_unavailable",
      503,
      true,
    );
  }
  if (!mapping.data) {
    throw new Project360Error("Project 360 quote was not found.", "quote_not_found", 404);
  }
  const row = mapping.data as Project360QuoteRow;
  const projectInput = normalizeProject360Input(
    (quote.planner_snapshot.metadata as Record<string, unknown> | undefined)?.project360Input,
  );
  if (
    projectInput.selectionHash !== row.selection_hash ||
    projectInput.discoverySnapshotHash !== row.candidates_hash
  ) {
    throw new Project360Error(
      "Project 360 quote integrity check failed.",
      "project_quote_integrity_failed",
      409,
    );
  }
  return {
    quote,
    publicQuote: toPublicHostedWorkflowQuote(quote),
    mapping: row,
    projectInput,
    canonicalInput: canonicalProject360Input(projectInput),
  };
}
