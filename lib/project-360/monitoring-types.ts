import type {
  TrustDeltaChange,
  TrustMonitoringCadence,
  TrustMonitoringStatus,
  TrustProfileVisibility,
} from "../monitoring/types.ts";
import type {
  Project360ConfirmedSource,
  Project360CoverageStatus,
  Project360Module,
  Project360Report,
  Project360SourceType,
} from "./types.ts";

export type Project360MonitorTrigger = "baseline" | "manual" | "scheduled" | "machine";
export type Project360MonitorRecheckStatus =
  | "quoted"
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

export type Project360MonitorCandidateSnapshot = {
  type: Project360SourceType;
  module: Project360Module;
  canonicalValue: string;
  valueHash: string;
  origin: Project360ConfirmedSource["origin"];
  originRepository: string | null;
  filePath: string | null;
  lineStart: number | null;
  lineEnd: number | null;
  safeExcerpt: string | null;
  confidence: Project360ConfirmedSource["confidence"];
  confidenceScore: number;
  reasonCode: string;
  originFingerprint: string;
};

export type Project360MonitorRow = {
  id: string;
  public_id: string;
  owner_wallet: string;
  profile_id: string;
  label: string;
  baseline_quote_id: string;
  baseline_job_id: string;
  configuration_hash: string;
  project_input: Record<string, unknown>;
  selected_modules: Project360Module[];
  source_value_hashes: string[];
  selected_candidates_snapshot: Project360MonitorCandidateSnapshot[];
  cadence: TrustMonitoringCadence;
  status: TrustMonitoringStatus;
  visibility: TrustProfileVisibility;
  next_recheck_at: string | null;
  last_recheck_at: string | null;
  last_snapshot_id: string | null;
  last_job_id: string | null;
  last_error_code: string | null;
  last_error_at: string | null;
  created_at: string;
  updated_at: string;
};

export type Project360MonitorRecheckRow = {
  id: string;
  public_id: string;
  monitor_id: string;
  trigger: Project360MonitorTrigger;
  status: Project360MonitorRecheckStatus;
  idempotency_hash: string;
  configuration_hash: string;
  quote_id: string | null;
  job_id: string | null;
  scheduled_for: string | null;
  error_code: string | null;
  error_message: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  updated_at: string;
};

export type Project360ModuleDelta = {
  module: Project360Module;
  beforeStatus: string | null;
  afterStatus: string;
  beforeScore: number | null;
  afterScore: number | null;
};

export type Project360DeltaReport = {
  kind: "project_360_delta_report";
  version: 1;
  previousSnapshotId: string | null;
  currentSnapshotId: string;
  score: {
    before: number | null;
    after: number | null;
    change: number | null;
    direction: "improved" | "declined" | "unchanged" | "unavailable";
  };
  confidence: { before: number | null; after: number; change: number | null };
  coverage: {
    before: Project360CoverageStatus | null;
    after: Project360CoverageStatus;
    completedBefore: number | null;
    completedAfter: number;
    selected: number;
  };
  verdict: { before: string | null; after: string; changed: boolean };
  summary: {
    newRisks: number;
    resolvedRisks: number;
    improvements: number;
    statusChanges: number;
    activityChanges: number;
    totalChanges: number;
  };
  moduleChanges: Project360ModuleDelta[];
  changes: TrustDeltaChange[];
  meaningful: boolean;
  generatedAt: string;
};

export type Project360MonitorSnapshotRow = {
  id: string;
  public_id: string;
  monitor_id: string;
  recheck_id: string;
  job_id: string;
  sequence_number: number;
  project_trust_score: number | null;
  confidence_percent: number;
  verdict: Project360Report["verdict"];
  coverage_status: Project360CoverageStatus;
  completed_modules: number;
  selected_modules: number;
  report_hash: string;
  verification_status: Project360Report["verification"]["status"];
  proof_transaction_hash: string | null;
  report_snapshot: Project360Report;
  delta_snapshot: Project360DeltaReport;
  observed_at: string;
  created_at: string;
};

export type Project360MonitorSuggestionRow = {
  id: string;
  public_id: string;
  monitor_id: string;
  discovery_id: string;
  candidate_id: string;
  module: Project360Module;
  source_type: Project360SourceType;
  value_hash: string;
  candidate_snapshot: Project360MonitorCandidateSnapshot;
  status: "pending" | "dismissed" | "superseded";
  created_at: string;
  updated_at: string;
};
