import type { AgentTrustReport, AgentTrustReportInput } from "../agent-trust/types.ts";
import type { Project360Module, Project360SourceType } from "../project-360/types.ts";

export type TrustMonitoringCadence = "manual" | "daily" | "weekly";
export type TrustMonitoringStatus = "active" | "paused";
export type TrustProfileVisibility = "private" | "public";
export type TrustSubjectType =
  | "github_repository"
  | "ai_agent"
  | "wallet"
  | "arc_contract"
  | "service_endpoint"
  | "project_360";

export type Project360ProfileInput = {
  project360: true;
  configurationHash: string;
  modules: Project360Module[];
  sources: Array<{ type: Project360SourceType; value: string; valueHash: string }>;
};
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
  profile_id: string;
  visibility: TrustProfileVisibility;
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

export type TrustProfileRow = {
  id: string;
  public_id: string;
  canonical_subject_key: string;
  subject_type: TrustSubjectType;
  canonical_subject_input: AgentTrustReportInput | Project360ProfileInput;
  display_name: string;
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

export const TRUST_ALERT_EVENT_TYPES = [
  "trust_score_changed",
  "trust_status_changed",
  "risk_added",
  "risk_resolved",
  "verification_failed",
  "recheck_failed",
  "subject_unavailable",
] as const;

export type TrustAlertEventType = (typeof TRUST_ALERT_EVENT_TYPES)[number];
export type AlertState = "unread" | "read" | "archived";
export type PublicTrustRisk = {
  riskCode: string;
  title: string;
  severity: TrustDeltaSeverity;
};
export type TrustDelta = {
  scoreChange: {
    previous: number;
    current: number;
    delta: number;
  } | null;
  statusChange: {
    previous: string;
    current: string;
  } | null;
  addedRisks: PublicTrustRisk[];
  resolvedRisks: PublicTrustRisk[];
  meaningful: boolean;
};
export type TrustAlertEventRow = {
  id: string;
  public_id: string;
  owner_wallet: string;
  profile_id: string;
  snapshot_id: string | null;
  project_360_snapshot_id: string | null;
  event_type: TrustAlertEventType;
  event_fingerprint: string;
  message: string;
  payload: Record<string, unknown>;
  byoa_agent_id: string | null;
  machine_credential_id: string | null;
  created_at: string;
};
export type WebhookSubscriptionStatus = "active" | "paused";
export type WebhookSubscriptionRow = {
  id: string;
  public_id: string;
  owner_wallet: string;
  name: string;
  endpoint_url: string;
  endpoint_domain: string;
  profile_ids: string[];
  event_types: TrustAlertEventType[];
  status: WebhookSubscriptionStatus;
  secret_ciphertext: string;
  previous_secret_ciphertext: string | null;
  previous_secret_expires_at: string | null;
  byoa_agent_id: string | null;
  machine_credential_id: string | null;
  last_success_at: string | null;
  last_failure_at: string | null;
  created_at: string;
  updated_at: string;
};
export type WebhookDeliveryStatus =
  | "pending"
  | "delivering"
  | "delivered"
  | "retry_scheduled"
  | "failed";
export type WebhookEventRow = {
  id: string;
  public_id: string;
  owner_wallet: string;
  alert_event_id: string | null;
  event_type: TrustAlertEventType | "test";
  payload: Record<string, unknown>;
  created_at: string;
};
export type WebhookDeliveryRow = {
  id: string;
  public_id: string;
  owner_wallet: string;
  subscription_id: string;
  event_id: string;
  status: WebhookDeliveryStatus;
  attempt_count: number;
  next_attempt_at: string;
  http_status: number | null;
  duration_ms: number | null;
  error_category: string | null;
  delivered_at: string | null;
  created_at: string;
  updated_at: string;
};
