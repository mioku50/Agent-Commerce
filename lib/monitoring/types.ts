import type { AgentTrustReport, AgentTrustReportInput } from "../agent-trust/types.ts";

export type TrustMonitoringCadence = "manual" | "daily" | "weekly";
export type TrustMonitoringStatus = "active" | "paused";
export type TrustMonitoringTrigger = "manual" | "scheduled" | "machine";
export type TrustMonitoringRecheckStatus =
  | "quoted"
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

export type TrustDeltaKind =
  | "new_risk"
  | "improved"
  | "activity"
  | "status_change"
  | "changed";

export type TrustDeltaSeverity = "critical" | "high" | "medium" | "low" | "info";

export type TrustDeltaChange = {
  code: string;
  kind: TrustDeltaKind;
  severity: TrustDeltaSeverity;
  category:
    | "trust_score"
    | "code"
    | "identity"
    | "execution"
    | "payments"
    | "services"
    | "contract"
    | "endpoint"
    | "verification";
  title: string;
  summary: string;
  before: string | number | boolean | null;
  after: string | number | boolean | null;
};
export type TrustDeltaReport = {
  kind: "trust_delta_report";
  version: 1;
  previousSnapshotId: string | null;
  currentSnapshotId: string;
  score: {
    before: number | null;
    after: number | null;
    change: number | null;
    direction: "improved" | "declined" | "unchanged" | "unavailable";
  };
  summary: {
    newRisks: number;
    improvements: number;
    statusChanges: number;
    activityChanges: number;
    totalChanges: number;
  };
  changes: TrustDeltaChange[];
  generatedAt: string;
};

export type TrustWatchlistRow = {
  id: string;
  public_id: string;
  owner_wallet: string;
  label: string;
  subject_hash: string;
  subject_input: AgentTrustReportInput;
  cadence: TrustMonitoringCadence;
  status: TrustMonitoringStatus;
  next_recheck_at: string | null;
  last_recheck_at: string | null;
  last_snapshot_id: string | null;
  last_job_id: string | null;
  last_error_code: string | null;
  last_error_at: string | null;
  byoa_agent_id: string | null;
  machine_credential_id: string | null;
  created_at: string;
  updated_at: string;
};

export type TrustMonitoringRecheckRow = {
  id: string;
  public_id: string;
  watchlist_id: string;
  trigger: TrustMonitoringTrigger;
  status: TrustMonitoringRecheckStatus;
  idempotency_hash: string;
  quote_id: string | null;
  job_id: string | null;
  byoa_agent_id: string | null;
  machine_credential_id: string | null;
  scheduled_for: string | null;
  error_code: string | null;
  error_message: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  updated_at: string;
};

export type TrustMonitoringSnapshotRow = {
  id: string;
  public_id: string;
  watchlist_id: string;
  recheck_id: string;
  job_id: string;
  sequence_number: number;
  trust_score: number | null;
  trust_status: AgentTrustReport["trustScore"]["status"];
  report_hash: string;
  verification_status: AgentTrustReport["verification"]["status"];
  proof_transaction_hash: string | null;
  report_snapshot: AgentTrustReport;
  delta_snapshot: TrustDeltaReport;
  observed_at: string;
  created_at: string;
};
