import type { GitHubDueDiligenceAssessment } from "../agent/github-due-diligence.ts";
import type { AgentTrustReport } from "../agent-trust/types.ts";
import type { ContractTransparencySnapshot } from "../agent-trust/types.ts";
import type { ApiQualityPublicReport } from "../reports/api-quality-report.ts";
import type { TreasuryHealthPublicReport } from "../reports/treasury-health-report.ts";

export const PROJECT_360_SOURCE_TYPES = [
  "github_repository",
  "project_wallet",
  "agent_id",
  "arc_contract",
  "public_api_endpoint",
] as const;

export type Project360SourceType = (typeof PROJECT_360_SOURCE_TYPES)[number];

export const PROJECT_360_MODULES = [
  "github_due_diligence",
  "agent_trust_report",
  "treasury_health",
  "paid_api_quality",
  "arc_contract_analysis",
] as const;

export type Project360Module = (typeof PROJECT_360_MODULES)[number];
export type Project360Confidence = "high" | "medium" | "low" | "insufficient";
export type Project360ModuleStatus =
  | "not_provided"
  | "not_selected"
  | "completed"
  | "insufficient_data"
  | "provider_unavailable"
  | "failed";
export type Project360ModuleRunStatus =
  | Project360ModuleStatus
  | "pending"
  | "running"
  // Read compatibility for module rows created before P4.2.2.
  | "unsupported";

export type Project360ModuleFailure = {
  status: Exclude<Project360ModuleStatus, "completed" | "not_selected" | "not_provided">;
  retryable: boolean;
  publicReason: string;
  internalErrorCode: string;
  provider: string | null;
  attemptCount: number;
  durationMs: number;
};

export type Project360PublicModuleResult = {
  module: Project360Module;
  status: Project360ModuleStatus;
  inputHash: string;
  childReportHash: `0x${string}` | null;
  score: number | null;
  confidence: Project360Confidence;
  retryable: boolean;
  publicReason: string | null;
};

export const PROJECT_360_MODULE_FOR_SOURCE: Record<Project360SourceType, Project360Module> = {
  github_repository: "github_due_diligence",
  project_wallet: "treasury_health",
  agent_id: "agent_trust_report",
  arc_contract: "arc_contract_analysis",
  public_api_endpoint: "paid_api_quality",
};

export const PROJECT_360_MODULE_LABELS: Record<Project360Module, string> = {
  github_due_diligence: "GitHub Due Diligence",
  agent_trust_report: "Agent Trust Report",
  treasury_health: "Treasury Health",
  paid_api_quality: "Paid API Quality",
  arc_contract_analysis: "Arc Contract Analysis",
};

export type Project360ConfirmedSource = {
  candidateId: string;
  type: Project360SourceType;
  module: Project360Module;
  canonicalValue: string;
  valueHash: string;
  origin: "primary" | "github_file" | "public_record";
  confidence: Exclude<Project360Confidence, "insufficient">;
};

export type Project360Input = {
  schema: "veyra.project360.input.v1";
  discoveryId: string;
  discoveryRevision: number;
  discoverySnapshotHash: string;
  selectionHash: string;
  sources: Project360ConfirmedSource[];
  modules: Project360Module[];
};

export type Project360ModuleResult = {
  module: Project360Module;
  status: Project360ModuleStatus;
  inputHash: string;
  childReportHash: `0x${string}` | null;
  score: number | null;
  confidence: Project360Confidence;
  retryable: boolean;
  publicReason: string | null;
  internalErrorCode: string | null;
  report:
    | GitHubDueDiligenceAssessment
    | AgentTrustReport
    | TreasuryHealthPublicReport
    | ApiQualityPublicReport
    | Project360ArcContractReport
    | null;
};

export type Project360ArcContractReport = {
  kind: "arc_contract_analysis";
  version: 1;
  workflowType: "arc_contract_analysis";
  reportId: string;
  targetContract: string;
  score: number | null;
  confidence: Project360Confidence;
  verdict: "strong_signals" | "review_recommended" | "high_attention" | "limited_data";
  summary: string;
  snapshot: ContractTransparencySnapshot;
  strengths: string[];
  risks: Array<{
    code: string;
    severity: "low" | "medium" | "high";
    title: string;
    detail: string;
  }>;
  limitations: string[];
  generatedAt: string;
};

export type Project360CoverageStatus = "complete" | "partial" | "limited" | "failed";

export type Project360ReportSection = {
  number: number;
  id: string;
  title: string;
  status: "available" | "not_provided" | "not_analyzed" | "failed" | "limited";
  summary: string;
  data: unknown;
};

export type Project360Report = {
  schema: "veyra.project360.v1";
  reportId: string;
  workflow: "project_360";
  workflowType: "project_360";
  confirmedSources: Array<Omit<Project360ConfirmedSource, "candidateId">>;
  discoverySnapshotHash: string;
  selectionHash: string;
  modules: Project360PublicModuleResult[];
  score: {
    formulaVersion: "project360-score-v1";
    value: number | null;
    confidencePercent: number;
    confidence: Project360Confidence;
    breakdown: Array<{
      module: Project360Module;
      score: number;
      weight: number;
      confidence: Project360Confidence;
    }>;
  };
  coverage: {
    expected: number;
    completed: number;
    total: 5;
    status: Project360CoverageStatus;
    label: string;
  };
  executiveSummary: string;
  verdict: "strong_signals" | "review_recommended" | "high_attention" | "limited_data";
  sections: Project360ReportSection[];
  evidenceMatrix: Array<{
    id: string;
    module: Project360Module;
    sourceType: Project360SourceType;
    signal: string;
    confidence: Project360Confidence;
    evidenceHash: string;
  }>;
  strengths: string[];
  risks: string[];
  limitations: string[];
  verification: {
    status: "verification_pending" | "verified" | "verification_failed";
    network: "arc-testnet";
    chainId: 5_042_002;
    reportHash: `0x${string}`;
  };
  generatedAt: string;
};

export type Project360DiscoveryRow = {
  id: string;
  public_id: string;
  owner_wallet: string;
  machine_credential_id: string | null;
  status: "queued" | "running" | "ready" | "failed" | "expired";
  revision: number;
  primary_type: Project360SourceType;
  primary_value: string;
  primary_value_hash: string;
  idempotency_hash: string;
  request_hash: string;
  candidates_hash: string | null;
  warnings: string[];
  error_code: string | null;
  expires_at: string;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
};

export type Project360CandidateRow = {
  id: string;
  public_id: string;
  discovery_id: string;
  source_type: Project360SourceType;
  module: Project360Module;
  canonical_value: string;
  value_hash: string;
  origin_kind: "primary" | "github_file" | "public_record";
  origin_repository: string | null;
  file_path: string | null;
  line_start: number | null;
  line_end: number | null;
  safe_excerpt: string | null;
  confidence: Exclude<Project360Confidence, "insufficient">;
  confidence_score: string | number;
  reason_code: string;
  validation_status: "valid" | "unsupported" | "blocked";
  origin_fingerprint: string;
  created_at: string;
  validated_at: string | null;
};

export type Project360QuoteRow = {
  quote_id: string;
  discovery_id: string;
  discovery_revision: number;
  candidates_hash: string;
  selection_hash: string;
  selected_candidate_ids: string[];
  confirmed_sources: Project360ConfirmedSource[];
  module_price_snapshot: Project360QuoteLineItem[];
  expected_coverage_count: number;
  warnings: string[];
  created_at: string;
};

export type Project360QuoteLineItem = {
  module: Project360Module | "project_360_finalization";
  label: string;
  serviceSlugs: string[];
  priceUsdc: number;
  sharedEvidence: boolean;
};
