export type HostedWorkflowType =
  | "sentiment_tone"
  | "builder_update"
  | "custom_task";

export type HostedPlanService = {
  id: string;
  slug: string;
  name: string;
  endpoint: string;
  method: "GET" | "POST";
  priceUsdc: number;
  reasoning: string;
};

export type HostedPlannerSnapshot = {
  workflowType: HostedWorkflowType;
  workflowLabel: string;
  selectedServices: HostedPlanService[];
  skippedServices: HostedPlanService[];
  estimatedSpendUsdc: number;
  remainingBudgetUsdc: number;
  maxPaidCalls: number;
  aggregationLabel: string;
  warnings: string[];
};

export type HostedApiResult = {
  serviceSlug: string;
  serviceName: string;
  status: "paid" | "failed";
  amountUsdc: string | null;
  response: unknown;
  error: string | null;
};

export type HostedFinalReport = {
  aggregationLabel: string;
  summary: string;
  keyFindings: string[];
  apiResults: HostedApiResult[];
  selectedServices: HostedPlanService[];
  skippedServices: HostedPlanService[];
  spentUsdc: string;
  receiptIds: string[];
  proofTransactionHashes: string[];
  links: {
    hostedResult: string;
    agentRun: string | null;
    receipts: string;
    passport: string | null;
    proofTransactions: string[];
  };
  completedWithWarnings: boolean;
  generatedAt: string;
};

export type HostedJobView = {
  job: {
    id: string;
    requesterWallet: string | null;
    workflowType: HostedWorkflowType;
    task: string;
    inputText: string | null;
    budgetUsdc: string;
    plannerSnapshot: HostedPlannerSnapshot;
    selectedServices: HostedPlanService[];
    structuredResult: HostedFinalReport | null;
    status: "queued" | "running" | "completed" | "failed";
    progressStage:
      | "queued"
      | "planning"
      | "purchasing"
      | "generating_receipt"
      | "publishing_onchain_proof"
      | "completed"
      | "failed";
    progressMessage: string | null;
    agentRunId: string | null;
    spentUsdc: string;
    error: string | null;
    createdAt: string;
    startedAt: string | null;
    completedAt: string | null;
  };
  payerWallet: string | null;
  receiptIds: string[];
  services: Array<{
    receiptId: string | null;
    serviceSlug: string;
    serviceName: string;
    priceUsdc: string;
    status: string;
    reasoning: string;
    response: unknown;
    error: string | null;
  }>;
  proofs: Array<{
    receiptId: string;
    status: "pending" | "verified" | "failed";
    transactionHash: string | null;
    blockNumber: number | null;
    contractAddress: string | null;
    transactionUrl: string | null;
    contractUrl: string | null;
  }>;
  links: {
    hostedRun: string;
    agentRun: string | null;
    receipts: string;
    receipt: string | null;
    passport: string | null;
    proofTransaction: string | null;
    proofTransactions: string[];
  };
};

export type HostedRunnerDiagnostic = {
  configured: boolean;
  chainId: number;
  payerAddress: string | null;
  maxBudgetUsdc: number;
  allowedServices: string[];
  cooldownSeconds: number;
  rateLimitWindowSeconds: number;
  rateLimitMaxRuns: number;
};

export type RecentHostedJob = {
  id: string;
  workflowType: HostedWorkflowType;
  task: string;
  status: "queued" | "running" | "completed" | "failed";
  spentUsdc: string;
  createdAt: string;
  completedAt: string | null;
  receiptCount: number;
  proofCount: number;
  href: string;
};
