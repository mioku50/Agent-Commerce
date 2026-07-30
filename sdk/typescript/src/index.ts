export type MachineErrorCode =
  | "agent_trust_input_required"
  | "agent_not_found"
  | "agent_access_denied"
  | "agent_registry_unavailable"
  | "agent_trust_service_unavailable"
  | "contract_not_found"
  | "contract_provider_unavailable"
  | "endpoint_invalid"
  | "endpoint_private_network_blocked"
  | "endpoint_unreachable"
  | "endpoint_response_too_large"
  | "insufficient_trust_evidence"
  | "invalid_wallet"
  | "invalid_repository"
  | "repository_not_found"
  | "repository_inaccessible"
  | "credential_missing"
  | "credential_revoked"
  | "scope_denied"
  | "workflow_disabled"
  | "quote_expired"
  | "quote_not_found"
  | "quote_already_used"
  | "idempotency_key_missing"
  | "idempotency_conflict"
  | "idempotency_in_progress"
  | "idempotency_store_unavailable"
  | "invalid_request"
  | "payment_required"
  | "payment_invalid"
  | "spending_limit_exceeded"
  | "run_not_found"
  | "run_failed"
  | "run_expired"
  | "report_not_found"
  | "report_not_ready"
  | "report_generation_failed"
  | "verification_pending"
  | "provider_unavailable"
  | "rate_limited"
  | "payment_authorization_required"
  | "request_timeout"
  | "network_error"
  | "poll_timeout"
  | "invalid_response"
  | "internal_error"
  | string;

export type MachineErrorBody = {
  error: {
    code: MachineErrorCode;
    message: string;
    retryable: boolean;
    requestId: string;
  };
};

export class AgentCommerceApiError extends Error {
  readonly status: number;
  readonly code: MachineErrorCode;
  readonly retryable: boolean;
  readonly requestId: string | null;

  constructor(input: {
    status: number;
    code: MachineErrorCode;
    message: string;
    retryable: boolean;
    requestId?: string | null;
  }) {
    super(input.message);
    this.name = "AgentCommerceApiError";
    this.status = input.status;
    this.code = input.code;
    this.retryable = input.retryable;
    this.requestId = input.requestId ?? null;
  }
}

export type WorkflowTemplate = {
  id: string;
  name: string;
  shortName: string;
  description: string;
  task: string;
  estimatedUsdc: number;
  inputSchema: Record<string, unknown>;
  arc: {
    chainId: 5_042_002;
    network: "arc-testnet";
    asset: "USDC";
    tokenAddress: string;
  };
};

export type WorkflowQuoteRequest = {
  workflow: string;
  repository?: string;
  input?: Record<string, unknown>;
};

export type AgentTrustReportInput = (
  | { agentId: string; agentWallet?: string; repositoryUrl?: string }
  | { agentId?: string; agentWallet: string; repositoryUrl?: string }
  | { agentId?: string; agentWallet?: string; repositoryUrl: string }
) & {
  contractAddress?: string;
  serviceEndpoint?: string;
};

export type AgentTrustQuoteRequest = {
  workflow: "agent_trust_report";
  input: AgentTrustReportInput;
};

export type WorkflowQuote = {
  quoteId: string;
  workflow: string;
  repository: { fullName: string; canonicalUrl: string } | null;
  inputSources?: {
    agentRegistry: boolean;
    github: boolean;
    contract: boolean;
    endpoint: boolean;
  };
  totalUsdc: number;
  sponsored: boolean;
  checkout?: {
    mode: "sponsored" | "arc_transaction";
    asset: "USDC";
    network: "arc-testnet";
  };
  downstreamSettlement?: "server_side_x402";
  expiresAt: string;
  requiredPayment: {
    network: "arc-testnet";
    asset: "USDC";
    amount: number;
    treasuryAddress: string;
    chainId: 5_042_002;
  };
};

export type PaymentAuthorization = {
  type: "arc_transaction";
  payload: `0x${string}`;
};

export type RunLaunch = {
  runId: string;
  status: "queued";
  pollAfterMs: number;
};

export type VerificationSummary = {
  status:
    | "verified"
    | "partially_verified"
    | "verification_pending"
    | "verification_failed";
  verifiedSteps: number;
  requiredSteps: number;
};

export type RunStatus = {
  runId: string;
  status:
    | "queued"
    | "running"
    | "completed"
    | "completed_with_warnings"
    | "failed"
    | "expired";
  progress: number;
  stage: string;
  pollAfterMs: number;
  reportId?: string;
  verification?: VerificationSummary;
};

export type ArcProof = {
  receiptId?: string;
  txHash: string | null;
  status: string;
  explorerUrl: string | null;
};

export type MachineReport = {
  reportId: string;
  workflow: string;
  status: string;
  generatedAt: string;
  executiveSummary?: string;
  summary?: string;
  verdict?: {
    code: string;
    label: string;
    confidence: "high" | "medium" | "low";
    summary: string;
    reasons: string[];
    blockingFindings: string[];
  } | null;
  verification: {
    status: string;
    network: "arc-testnet";
    proofs: ArcProof[];
    verifiedSteps?: number;
    requiredSteps?: number;
  };
  [key: string]: unknown;
};

export type AgentTrustScoreCategory = {
  score: number | null;
  confidence: "high" | "medium" | "low";
  evidenceCount: number;
  summary: string;
  positiveSignals: Array<Record<string, unknown>>;
  reviewItems: Array<Record<string, unknown>>;
};

export type AgentTrustReport = {
  kind: "agent_trust_report";
  version: 1;
  workflowType: "agent_trust_report";
  reportId: string;
  input: AgentTrustReportInput;
  subject: {
    name: string;
    agentId: string | null;
    wallet: string | null;
    repository: { fullName: string; canonicalUrl: string } | null;
  };
  trustScore: {
    overall: number | null;
    status:
      | "strong_signals"
      | "review_recommended"
      | "high_attention"
      | "limited_data";
    categories: Partial<
      Record<
        | "codeHealth"
        | "agentIdentity"
        | "executionReliability"
        | "paymentHistory"
        | "serviceReliability"
        | "contractTransparency",
        AgentTrustScoreCategory
      >
    >;
    excludedCategories: string[];
  };
  executiveSummary: string[];
  identity: Record<string, unknown>;
  codeIntelligence: Record<string, unknown>;
  executionReliability: Record<string, unknown>;
  paymentsAndReceipts: Record<string, unknown>;
  services: Record<string, unknown>;
  contractTransparency: Record<string, unknown>;
  endpointAvailability: Record<string, unknown>;
  evidenceBackedStrengths: Array<Record<string, unknown>>;
  risksAndReviewItems: Array<Record<string, unknown>>;
  questionsBeforeIntegration: string[];
  dataFreshness: Array<{
    source: string;
    fetchedAt: string;
    cacheMode: string;
    upstreamStatus: string;
  }>;
  unavailableSources: string[];
  limitations: string[];
  verification: {
    status: "verified" | "verification_pending" | "verification_failed";
    verifiedOnArc: boolean;
    network: "arc-testnet";
    chainId: 5_042_002;
    reportHash: string;
    proofs: Array<{
      receiptId: string;
      status: "pending" | "verified" | "failed";
      transactionHash: string | null;
      explorerUrl: string | null;
    }>;
  };
  generatedAt: string;
};

export type AgentCommerceClientOptions = {
  baseUrl: string;
  credential: string;
  fetch?: typeof globalThis.fetch;
  timeoutMs?: number;
};

export type WaitForRunOptions = {
  timeoutMs?: number;
  signal?: AbortSignal;
  onStatus?: (status: RunStatus) => void | Promise<void>;
};

export type ExecuteWorkflowOptions = {
  quoteIdempotencyKey?: string;
  runIdempotencyKey?: string;
  paymentAuthorization?:
    | PaymentAuthorization
    | ((quote: WorkflowQuote) => Promise<PaymentAuthorization>);
  wait?: WaitForRunOptions;
};

function createIdempotencyKey(prefix: string) {
  if (!globalThis.crypto?.randomUUID) {
    throw new Error(
      "crypto.randomUUID() is required; provide an explicit idempotency key in this runtime.",
    );
  }
  return `${prefix}_${globalThis.crypto.randomUUID()}`;
}

function isMachineErrorBody(value: unknown): value is MachineErrorBody {
  if (!value || typeof value !== "object") return false;
  const error = (value as { error?: unknown }).error;
  return Boolean(
    error &&
      typeof error === "object" &&
      typeof (error as { code?: unknown }).code === "string" &&
      typeof (error as { message?: unknown }).message === "string",
  );
}

function mergeSignals(signal: AbortSignal | undefined, timeoutMs: number) {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(new Error(`Veyra Agent API request timed out after ${timeoutMs}ms.`)),
    timeoutMs,
  );
  const onAbort = () => controller.abort(signal?.reason);
  signal?.addEventListener("abort", onAbort, { once: true });
  return {
    signal: controller.signal,
    cleanup() {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", onAbort);
    },
  };
}

export class AgentCommerceClient {
  readonly baseUrl: string;
  private readonly credential: string;
  private readonly fetchImpl: typeof globalThis.fetch;
  private readonly timeoutMs: number;

  constructor(options: AgentCommerceClientOptions) {
    const baseUrl = new URL(options.baseUrl);
    if (!["http:", "https:"].includes(baseUrl.protocol)) {
      throw new Error("Veyra Agent API baseUrl must use http or https.");
    }
    if (!options.credential.trim()) {
      throw new Error("Veyra Agent API credential is required.");
    }
    this.baseUrl = baseUrl.toString().replace(/\/$/, "");
    this.credential = options.credential.trim();
    this.fetchImpl = options.fetch ?? globalThis.fetch.bind(globalThis);
    this.timeoutMs = options.timeoutMs ?? 30_000;
  }

  private async request<T>(
    path: string,
    init: RequestInit = {},
    options: {
      idempotencyKey?: string;
      accept?: string;
      signal?: AbortSignal;
    } = {},
  ): Promise<T> {
    const merged = mergeSignals(options.signal ?? init.signal ?? undefined, this.timeoutMs);
    try {
      const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
        ...init,
        signal: merged.signal,
        headers: {
          Authorization: `Bearer ${this.credential}`,
          Accept: options.accept ?? "application/json",
          ...(init.body ? { "Content-Type": "application/json" } : {}),
          ...(options.idempotencyKey
            ? { "Idempotency-Key": options.idempotencyKey }
            : {}),
          ...(init.headers ?? {}),
        },
      });
      const text = await response.text();
      const body = text ? (JSON.parse(text) as unknown) : null;
      if (!response.ok) {
        if (isMachineErrorBody(body)) {
          throw new AgentCommerceApiError({
            status: response.status,
            code: body.error.code,
            message: body.error.message,
            retryable: Boolean(body.error.retryable),
            requestId: body.error.requestId,
          });
        }
        throw new AgentCommerceApiError({
          status: response.status,
          code: "invalid_response",
          message: `Veyra Agent API returned HTTP ${response.status} without a valid error body.`,
          retryable: response.status >= 500,
          requestId: response.headers.get("x-request-id"),
        });
      }
      return body as T;
    } catch (error) {
      if (error instanceof AgentCommerceApiError) throw error;
      if (merged.signal.aborted) {
        throw new AgentCommerceApiError({
          status: 0,
          code: "request_timeout",
          message: "Veyra Agent API request timed out or was aborted.",
          retryable: true,
        });
      }
      throw new AgentCommerceApiError({
        status: 0,
        code: "network_error",
        message: error instanceof Error ? error.message : "Veyra Agent API network request failed.",
        retryable: true,
      });
    } finally {
      merged.cleanup();
    }
  }

  async listWorkflows(options: { signal?: AbortSignal } = {}) {
    const response = await this.request<{ version: "1"; workflows: WorkflowTemplate[] }>(
      "/api/agent/v1/workflows",
      { method: "GET" },
      options,
    );
    return response.workflows;
  }

  async createQuote(
    input: WorkflowQuoteRequest,
    options: { idempotencyKey?: string; signal?: AbortSignal } = {},
  ) {
    return this.request<WorkflowQuote>(
      "/api/agent/v1/quotes",
      { method: "POST", body: JSON.stringify(input) },
      {
        idempotencyKey:
          options.idempotencyKey ?? createIdempotencyKey("quote"),
        signal: options.signal,
      },
    );
  }

  async createRun(
    input: { quoteId: string; paymentAuthorization?: PaymentAuthorization },
    options: { idempotencyKey?: string; signal?: AbortSignal } = {},
  ) {
    return this.request<RunLaunch>(
      "/api/agent/v1/runs",
      { method: "POST", body: JSON.stringify(input) },
      {
        idempotencyKey:
          options.idempotencyKey ?? createIdempotencyKey("run"),
        signal: options.signal,
      },
    );
  }

  async getRun(runId: string, options: { signal?: AbortSignal } = {}) {
    return this.request<RunStatus>(
      `/api/agent/v1/runs/${encodeURIComponent(runId)}`,
      { method: "GET" },
      options,
    );
  }

  async waitForRun(runId: string, options: WaitForRunOptions = {}) {
    const timeoutMs = options.timeoutMs ?? 5 * 60 * 1_000;
    const deadline = Date.now() + timeoutMs;
    let transientFailures = 0;

    while (Date.now() < deadline) {
      let status: RunStatus;
      try {
        status = await this.getRun(runId, { signal: options.signal });
        transientFailures = 0;
      } catch (error) {
        if (
          !(error instanceof AgentCommerceApiError) ||
          !error.retryable ||
          transientFailures >= 3
        ) {
          throw error;
        }
        const delay = 500 * 2 ** transientFailures++;
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }

      await options.onStatus?.(status);
      if (
        status.status === "completed" ||
        status.status === "completed_with_warnings" ||
        status.status === "failed" ||
        status.status === "expired"
      ) {
        return status;
      }
      const delay = Math.max(250, Math.min(status.pollAfterMs || 2_000, 10_000));
      await new Promise((resolve) => setTimeout(resolve, delay));
    }

    throw new AgentCommerceApiError({
      status: 0,
      code: "poll_timeout",
      message: `Run ${runId} did not reach a terminal state before the SDK timeout.`,
      retryable: true,
    });
  }

  async getReport<TReport extends MachineReport | AgentTrustReport = MachineReport>(
    reportId: string,
    options: { signal?: AbortSignal } = {},
  ) {
    return this.request<TReport>(
      `/api/agent/v1/reports/${encodeURIComponent(reportId)}`,
      { method: "GET" },
      options,
    );
  }

  async getReportMarkdown(
    reportId: string,
    options: { signal?: AbortSignal } = {},
  ) {
    const merged = mergeSignals(options.signal, this.timeoutMs);
    try {
      const response = await this.fetchImpl(
        `${this.baseUrl}/api/agent/v1/reports/${encodeURIComponent(reportId)}`,
        {
          method: "GET",
          signal: merged.signal,
          headers: {
            Authorization: `Bearer ${this.credential}`,
            Accept: "text/markdown",
          },
        },
      );
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as unknown;
        if (isMachineErrorBody(body)) {
          throw new AgentCommerceApiError({
            status: response.status,
            code: body.error.code,
            message: body.error.message,
            retryable: Boolean(body.error.retryable),
            requestId: body.error.requestId,
          });
        }
        throw new AgentCommerceApiError({
          status: response.status,
          code: "invalid_response",
          message: `Veyra Agent API returned HTTP ${response.status}.`,
          retryable: response.status >= 500,
        });
      }
      return response.text();
    } catch (error) {
      if (error instanceof AgentCommerceApiError) throw error;
      if (merged.signal.aborted) {
        throw new AgentCommerceApiError({
          status: 0,
          code: "request_timeout",
          message: "Veyra Agent API request timed out or was aborted.",
          retryable: true,
        });
      }
      throw new AgentCommerceApiError({
        status: 0,
        code: "network_error",
        message:
          error instanceof Error
            ? error.message
            : "Veyra Agent API network request failed.",
        retryable: true,
      });
    } finally {
      merged.cleanup();
    }
  }

  async executeWorkflow(
    input: WorkflowQuoteRequest,
    options: ExecuteWorkflowOptions = {},
  ) {
    const quote = await this.createQuote(input, {
      idempotencyKey: options.quoteIdempotencyKey,
      signal: options.wait?.signal,
    });
    let paymentAuthorization: PaymentAuthorization | undefined;
    if (!quote.sponsored) {
      if (typeof options.paymentAuthorization === "function") {
        paymentAuthorization = await options.paymentAuthorization(quote);
      } else {
        paymentAuthorization = options.paymentAuthorization;
      }
      if (!paymentAuthorization) {
        throw new AgentCommerceApiError({
          status: 402,
          code: "payment_authorization_required",
          message:
            "This quote requires an Arc Testnet payment transaction. Provide paymentAuthorization or a payment callback.",
          retryable: false,
        });
      }
    }

    const launch = await this.createRun(
      { quoteId: quote.quoteId, paymentAuthorization },
      {
        idempotencyKey: options.runIdempotencyKey,
        signal: options.wait?.signal,
      },
    );
    const run = await this.waitForRun(launch.runId, options.wait);
    if (run.status === "failed" || run.status === "expired" || !run.reportId) {
      throw new AgentCommerceApiError({
        status: 422,
        code: run.status === "expired" ? "run_expired" : "run_failed",
        message:
          run.status === "expired"
            ? `Run ${run.runId} expired before producing a report.`
            : `Run ${run.runId} did not produce a report.`,
        retryable: false,
      });
    }
    const report = await this.getReport(run.reportId, {
      signal: options.wait?.signal,
    });
    return { quote, launch, run, report };
  }
}
