import type {
  HostedFinalReport,
  HostedPlannerSnapshot,
  HostedWorkflowType,
} from "../agent/hosted-workflows.ts";

export const BYOA_SCOPES = [
  "quotes:create",
  "workflows:execute",
  "results:read",
  "manifest:read",
] as const;

export type ByoaScope = (typeof BYOA_SCOPES)[number];
export type ByoaServiceType =
  | "internal_deterministic"
  | "live_provider"
  | "seller_created"
  | "external_seller";

export type ByoaAgentStatus = "pending" | "active" | "suspended" | "revoked";
export type ByoaWalletStatus = "unverified" | "verified" | "failed";

export type ByoaAgentRow = {
  id: string;
  public_id: string;
  display_name: string;
  owner_wallet: string;
  agent_wallet: string | null;
  agent_wallet_status: ByoaWalletStatus;
  status: ByoaAgentStatus;
  canary_enabled: boolean;
  wallet_verified_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ByoaCredentialRow = {
  id: string;
  agent_id: string;
  label: string;
  token_prefix: string;
  credential_hash: string;
  scopes: ByoaScope[];
  expires_at: string;
  rotated_from_id: string | null;
  revoked_at: string | null;
  last_used_at: string | null;
  created_at: string;
};

export type ByoaPolicyRow = {
  agent_id: string;
  allowed_workflows: HostedWorkflowType[];
  allowed_service_types: ByoaServiceType[];
  max_price_per_run_usdc: string;
  daily_spend_limit_usdc: string;
  max_daily_calls: number;
  status: "active" | "paused";
  created_at: string;
  updated_at: string;
};

export type ByoaQuoteStatus =
  | "quoted"
  | "settling"
  | "consumed"
  | "completed"
  | "failed"
  | "expired"
  | "credited"
  | "cancelled";

export type ByoaQuoteRow = {
  id: string;
  agent_id: string;
  credential_id: string;
  idempotency_hash: string;
  request_hash: string;
  requester_fingerprint: string;
  workflow_type: HostedWorkflowType;
  task: string;
  input_preview: string;
  input_hash: string;
  budget_usdc: string;
  planner_snapshot: HostedPlannerSnapshot;
  selected_services: HostedPlannerSnapshot["selectedServices"];
  service_types: ByoaServiceType[];
  price_usdc: string;
  amount_atomic: number | string;
  pay_to: string;
  network: "eip155:5042002";
  asset: string;
  resource_path: string;
  status: ByoaQuoteStatus;
  settle_claim_token: string | null;
  settle_claim_expires_at: string | null;
  aggregate_payment_event_id: string | null;
  job_id: string | null;
  expires_at: string;
  consumed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type ByoaPassportRow = {
  agent_id: string;
  total_workflows: number;
  completed_reports: number;
  successful_calls: number;
  verified_proofs: number;
  workflow_spent_usdc: string;
  downstream_spent_usdc: string;
  success_rate: string;
  last_run_at: string | null;
  updated_at: string;
};

export type PublicByoaQuote = {
  id: string;
  agentPublicId: string;
  workflowType: HostedWorkflowType;
  inputPreview: string;
  inputSha256: string;
  plan: HostedPlannerSnapshot;
  serviceTypes: ByoaServiceType[];
  priceUsdc: string;
  amountAtomic: string;
  payTo: string;
  network: "eip155:5042002";
  asset: string;
  resourceUrl: string;
  status: ByoaQuoteStatus;
  expiresAt: string;
  jobId: string | null;
};

export type ByoaResult = {
  agentPublicId: string;
  jobId: string;
  status: string;
  workflowType: HostedWorkflowType;
  inputPreview: string;
  inputSha256: string;
  finalReport: HostedFinalReport | null;
  workflowPayment: Record<string, unknown> | null;
  downstreamPayerWallet: string | null;
  runUrl: string | null;
  aggregateReceiptUrl: string;
  internalReceiptUrls: string[];
  proofUrls: string[];
  passportUrl: string;
};
