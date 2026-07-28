import { createClient } from "@supabase/supabase-js";
import { getServerSupabaseConfig } from "../supabase/server-env.ts";

export type OperationsAlertSeverity = "warning" | "critical";

export type OperationsAlert = {
  code:
    | "execution_failures"
    | "stale_execution"
    | "provider_failures"
    | "provider_latency"
    | "payment_failures"
    | "arc_proof_failed"
    | "arc_proof_delayed";
  severity: OperationsAlertSeverity;
  message: string;
  retryPolicy: string;
};

export type OperationsSnapshotInput = {
  now: string;
  windowMinutes: number;
  hostedJobs: Array<{
    status: string;
    created_at: string;
    updated_at: string;
  }>;
  providerSteps: Array<{
    service_slug: string | null;
    status: string;
    created_at: string;
    raw: Record<string, unknown> | null;
  }>;
  workflowPayments: Array<{
    payment_mode: string;
    status: string;
    created_at: string;
    updated_at: string;
  }>;
  proofEvents: Array<{
    onchain_status: string | null;
    created_at: string;
    onchain_verified_at: string | null;
    onchain_attempt_count: number | null;
  }>;
};

export type OperationsSnapshot = {
  generatedAt: string;
  windowMinutes: number;
  status: "healthy" | "degraded" | "critical";
  executions: {
    total: number;
    completed: number;
    failed: number;
    failureRate: number;
    staleRunning: number;
  };
  providers: {
    totalCalls: number;
    paidCalls: number;
    failedCalls: number;
    failureRate: number;
    measuredCalls: number;
    p50LatencyMs: number | null;
    p95LatencyMs: number | null;
  };
  payments: {
    paidCheckouts: number;
    settled: number;
    creditsOrRefunds: number;
    unresolved: number;
  };
  arcProofs: {
    verified: number;
    failed: number;
    delayed: number;
    p95VerificationDelayMs: number | null;
    maxAttemptCount: number;
  };
  alerts: OperationsAlert[];
  retryPolicy: {
    providerReads: string;
    paidProviderCalls: string;
    workflowExecution: string;
    arcProofs: string;
    paymentAccounting: string;
  };
};

const STALE_EXECUTION_MS = 10 * 60 * 1_000;
const DELAYED_PROOF_MS = 2 * 60 * 1_000;

function finiteNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function rate(failed: number, total: number) {
  return total > 0 ? Math.round((failed / total) * 10_000) / 10_000 : 0;
}

function percentile(values: number[], ratio: number) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil(sorted.length * ratio) - 1),
  );
  return Math.round(sorted[index]);
}

export function buildOperationsSnapshot(
  input: OperationsSnapshotInput,
): OperationsSnapshot {
  const nowMs = Date.parse(input.now);
  const completed = input.hostedJobs.filter((job) => job.status === "completed").length;
  const failed = input.hostedJobs.filter((job) => job.status === "failed").length;
  const executionTotal = completed + failed;
  const staleRunning = input.hostedJobs.filter(
    (job) =>
      (job.status === "running" || job.status === "queued") &&
      nowMs - Date.parse(job.updated_at) >= STALE_EXECUTION_MS,
  ).length;

  const paidCalls = input.providerSteps.filter((step) => step.status === "paid").length;
  const failedCalls = input.providerSteps.filter((step) => step.status === "failed").length;
  const providerTotal = paidCalls + failedCalls;
  const providerLatencies = input.providerSteps.flatMap((step) => {
    const value = finiteNumber(step.raw?.providerLatencyMs);
    return value === null ? [] : [value];
  });

  const paidCheckouts = input.workflowPayments.filter(
    (payment) => payment.payment_mode === "paid",
  );
  const settledPayments = paidCheckouts.filter(
    (payment) => payment.status === "settled",
  ).length;
  const creditsOrRefunds = paidCheckouts.filter((payment) =>
    ["credit_issued", "refund_pending", "refunded"].includes(payment.status),
  ).length;
  const unresolvedPayments = paidCheckouts.filter(
    (payment) =>
      !["settled", "credit_issued", "refunded"].includes(payment.status) &&
      nowMs - Date.parse(payment.updated_at) >= DELAYED_PROOF_MS,
  ).length;

  const verifiedProofs = input.proofEvents.filter(
    (event) => event.onchain_status === "verified",
  );
  const failedProofs = input.proofEvents.filter(
    (event) => event.onchain_status === "failed",
  );
  const delayedProofs = input.proofEvents.filter(
    (event) =>
      event.onchain_status === "pending" &&
      nowMs - Date.parse(event.created_at) >= DELAYED_PROOF_MS,
  );
  const proofDelays = verifiedProofs.flatMap((event) => {
    if (!event.onchain_verified_at) return [];
    const delay = Date.parse(event.onchain_verified_at) - Date.parse(event.created_at);
    return Number.isFinite(delay) && delay >= 0 ? [delay] : [];
  });

  const executionFailureRate = rate(failed, executionTotal);
  const providerFailureRate = rate(failedCalls, providerTotal);
  const p95ProviderLatencyMs = percentile(providerLatencies, 0.95);
  const alerts: OperationsAlert[] = [];

  if (executionTotal >= 5 && executionFailureRate >= 0.2) {
    alerts.push({
      code: "execution_failures",
      severity: executionFailureRate >= 0.5 ? "critical" : "warning",
      message: `${failed}/${executionTotal} workflow executions failed in the current window.`,
      retryPolicy:
        "Retry only pre-payment failures after validating the original input hash; paid failures remain in credit reconciliation.",
    });
  }
  if (staleRunning > 0) {
    alerts.push({
      code: "stale_execution",
      severity: "critical",
      message: `${staleRunning} workflow execution(s) have not updated for at least 10 minutes.`,
      retryPolicy:
        "Do not replay automatically because the original private input is not persisted; inspect the job and use explicit recovery with the original input.",
    });
  }
  if (providerTotal >= 5 && providerFailureRate >= 0.2) {
    alerts.push({
      code: "provider_failures",
      severity: providerFailureRate >= 0.5 ? "critical" : "warning",
      message: `${failedCalls}/${providerTotal} provider calls failed in the current window.`,
      retryPolicy:
        "Read-only provider discovery may retry with exponential backoff. Paid provider calls remain single-attempt to prevent duplicate settlement.",
    });
  }
  if (p95ProviderLatencyMs !== null && providerLatencies.length >= 5 && p95ProviderLatencyMs >= 20_000) {
    alerts.push({
      code: "provider_latency",
      severity: p95ProviderLatencyMs >= 30_000 ? "critical" : "warning",
      message: `Provider p95 latency is ${p95ProviderLatencyMs}ms across ${providerLatencies.length} measured call(s).`,
      retryPolicy:
        "Keep the 30-second provider timeout; retry only transient read/preflight failures and never blindly repeat a paid call.",
    });
  }
  if (creditsOrRefunds + unresolvedPayments > 0) {
    alerts.push({
      code: "payment_failures",
      severity: unresolvedPayments > 0 ? "critical" : "warning",
      message: `${creditsOrRefunds} credit/refund payment(s) and ${unresolvedPayments} unresolved payment(s) detected.`,
      retryPolicy:
        "Never create a second checkout. Reconcile the existing payment row and preserve quote/run idempotency.",
    });
  }
  if (failedProofs.length > 0) {
    alerts.push({
      code: "arc_proof_failed",
      severity: "critical",
      message: `${failedProofs.length} Arc proof publication(s) are in a failed state.`,
      retryPolicy:
        "Reconcile the existing receipt hash first, then retry proof publication with the same payment event; never create a second payment.",
    });
  }
  if (delayedProofs.length > 0) {
    alerts.push({
      code: "arc_proof_delayed",
      severity: delayedProofs.length >= 3 ? "critical" : "warning",
      message: `${delayedProofs.length} Arc proof(s) have remained pending for at least two minutes.`,
      retryPolicy:
        "Read the existing registry state and transaction receipt before resubmission. Arc deterministic finality requires one confirmation.",
    });
  }

  return {
    generatedAt: input.now,
    windowMinutes: input.windowMinutes,
    status: alerts.some((alert) => alert.severity === "critical")
      ? "critical"
      : alerts.length > 0
        ? "degraded"
        : "healthy",
    executions: {
      total: executionTotal,
      completed,
      failed,
      failureRate: executionFailureRate,
      staleRunning,
    },
    providers: {
      totalCalls: providerTotal,
      paidCalls,
      failedCalls,
      failureRate: providerFailureRate,
      measuredCalls: providerLatencies.length,
      p50LatencyMs: percentile(providerLatencies, 0.5),
      p95LatencyMs: p95ProviderLatencyMs,
    },
    payments: {
      paidCheckouts: paidCheckouts.length,
      settled: settledPayments,
      creditsOrRefunds,
      unresolved: unresolvedPayments,
    },
    arcProofs: {
      verified: verifiedProofs.length,
      failed: failedProofs.length,
      delayed: delayedProofs.length,
      p95VerificationDelayMs: percentile(proofDelays, 0.95),
      maxAttemptCount: Math.max(
        0,
        ...input.proofEvents.map((event) =>
          Math.max(0, event.onchain_attempt_count ?? 0),
        ),
      ),
    },
    alerts,
    retryPolicy: {
      providerReads: "Up to 3 retries with exponential backoff for transient network and 502/503/504 responses.",
      paidProviderCalls: "Single attempt. Idempotency is resolved through the persisted payment event, never a blind HTTP replay.",
      workflowExecution: "Automatic retry is disabled after payment. Pre-payment recovery requires the original input and matching input hash.",
      arcProofs: "Reconcile onchain registry state before resubmitting the existing payment-event proof.",
      paymentAccounting: "Reconcile or credit the existing checkout; never charge a second transaction for the same quote.",
    },
  };
}

export async function getOperationsSnapshot(
  now = new Date(),
  windowMinutes = 60,
): Promise<OperationsSnapshot> {
  const config = getServerSupabaseConfig();
  const supabase = createClient(config.url, config.key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const since = new Date(now.getTime() - windowMinutes * 60 * 1_000).toISOString();
  const proofSince = new Date(now.getTime() - 24 * 60 * 60 * 1_000).toISOString();

  const [jobsResult, stepsResult, paymentsResult, proofsResult] = await Promise.all([
    supabase
      .from("hosted_agent_jobs")
      .select("status,created_at,updated_at")
      .gte("created_at", since),
    supabase
      .from("agent_purchase_steps")
      .select("service_slug,status,created_at,raw")
      .gte("created_at", since)
      .in("status", ["paid", "failed"]),
    supabase
      .from("hosted_workflow_user_payments")
      .select("payment_mode,status,created_at,updated_at")
      .gte("created_at", since),
    supabase
      .from("payment_events")
      .select("onchain_status,created_at,onchain_verified_at,onchain_attempt_count")
      .gte("created_at", proofSince)
      .in("onchain_status", ["pending", "verified", "failed"]),
  ]);

  const failedQuery = [
    ["workflow executions", jobsResult.error],
    ["provider calls", stepsResult.error],
    ["workflow payments", paymentsResult.error],
    ["Arc proofs", proofsResult.error],
  ].find(([, error]) => Boolean(error));
  if (failedQuery) {
    throw new Error(`Unable to load ${failedQuery[0]} operations metrics.`);
  }

  return buildOperationsSnapshot({
    now: now.toISOString(),
    windowMinutes,
    hostedJobs: (jobsResult.data ?? []) as OperationsSnapshotInput["hostedJobs"],
    providerSteps: (stepsResult.data ?? []) as OperationsSnapshotInput["providerSteps"],
    workflowPayments: (paymentsResult.data ?? []) as OperationsSnapshotInput["workflowPayments"],
    proofEvents: (proofsResult.data ?? []) as OperationsSnapshotInput["proofEvents"],
  });
}
