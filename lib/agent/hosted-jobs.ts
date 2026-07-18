/**
 * Copyright 2026 Circle Internet Group, Inc.  All rights reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { executeBuyerAgent, type BuyerAgentProgressStage } from "./execution.ts";
import {
  getHostedRunnerConfig,
  safeHostedError,
} from "./hosted-policy.ts";
import {
  configuredExplorerUrl,
  onchainProofMetadataFromRow,
} from "../commerce/onchain-proof.ts";
import { getServerSupabaseConfig } from "../supabase/server-env.ts";

export type HostedJobStatus = "queued" | "running" | "completed" | "failed";
export type HostedJobProgressStage =
  | "queued"
  | BuyerAgentProgressStage;

export type HostedAgentJobRow = {
  id: string;
  idempotency_hash: string;
  requester_fingerprint: string;
  requester_wallet: string | null;
  task: string;
  budget_usdc: string;
  status: HostedJobStatus;
  progress_stage: HostedJobProgressStage;
  agent_run_id: string | null;
  spent_usdc: string;
  error: string | null;
  progress_message: string | null;
  attempt_count: number;
  recovery_count: number;
  created_at: string;
  updated_at: string;
  started_at: string | null;
  completed_at: string | null;
  last_heartbeat_at: string | null;
  raw: Record<string, unknown> | null;
};

export type HostedLaunchResult = {
  jobId: string | null;
  created: boolean;
  reason: "created" | "idempotent" | "active_job" | "cooldown" | "rate_limited";
  retryAfterSeconds: number;
};

let hostedClient: SupabaseClient | null = null;

function getHostedClient() {
  const config = getServerSupabaseConfig();
  hostedClient ??= createClient(config.url, config.key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return hostedClient;
}

export async function launchHostedAgentJob(input: {
  idempotencyHash: string;
  requesterFingerprint: string;
  requesterWallet: string | null;
  task: string;
  budgetUsdc: number;
}) {
  const config = getHostedRunnerConfig();
  const { data, error } = await getHostedClient().rpc("launch_hosted_agent_job", {
    p_idempotency_hash: input.idempotencyHash,
    p_requester_fingerprint: input.requesterFingerprint,
    p_requester_wallet: input.requesterWallet,
    p_task: input.task,
    p_budget_usdc: input.budgetUsdc,
    p_cooldown_seconds: config.cooldownSeconds,
    p_rate_window_seconds: config.rateLimitWindowSeconds,
    p_rate_max_runs: config.rateLimitMaxRuns,
  });
  if (error) throw new Error("Unable to launch hosted agent job.");

  const row = (data as Array<{
    job_id: string | null;
    created: boolean;
    reason: HostedLaunchResult["reason"];
    retry_after_seconds: number;
  }> | null)?.[0];
  if (!row) throw new Error("Hosted launch did not return a result.");

  return {
    jobId: row.job_id,
    created: row.created,
    reason: row.reason,
    retryAfterSeconds: row.retry_after_seconds,
  } satisfies HostedLaunchResult;
}

export async function getHostedAgentJob(jobId: string) {
  const { data, error } = await getHostedClient()
    .from("hosted_agent_jobs")
    .select("*")
    .eq("id", jobId)
    .maybeSingle();
  if (error) throw new Error("Unable to load hosted agent job.");
  return (data as HostedAgentJobRow | null) ?? null;
}

async function updateHostedAgentJob(
  jobId: string,
  values: Record<string, unknown>,
) {
  const { error } = await getHostedClient()
    .from("hosted_agent_jobs")
    .update(values)
    .eq("id", jobId);
  if (error) throw new Error("Unable to update hosted agent job.");
}

async function claimHostedAgentJob(jobId: string) {
  const { data, error } = await getHostedClient().rpc("claim_hosted_agent_job", {
    p_job_id: jobId,
  });
  if (error) throw new Error("Unable to claim hosted agent job.");
  return data === true;
}

export async function runHostedAgentJob(jobId: string) {
  const claimed = await claimHostedAgentJob(jobId);
  if (!claimed) return { claimed: false as const };

  const job = await getHostedAgentJob(jobId);
  if (!job) throw new Error("Claimed hosted job no longer exists.");

  try {
    const config = getHostedRunnerConfig();
    const result = await executeBuyerAgent({
      task: job.task,
      spendingLimit: Number(job.budget_usdc),
      baseUrl: config.baseUrl,
      sellerAddress: config.sellerAddress,
      agentPrivateKey: config.agentPrivateKey,
      walletSource: "HOSTED_AGENT_PRIVATE_KEY",
      skipFunding: true,
      skipDeposit: true,
      writeLocalRunLog: false,
      installSignalHandler: false,
      requirePersistence: true,
      requirePaidPurchase: true,
      proofWaitTimeoutMs: 45_000,
      fetchRetries: 2,
      fetchTimeoutMs: 30_000,
      serviceAllowlist: config.serviceAllowlist,
      onProgress: async (progress) => {
        if (progress.stage === "completed" || progress.stage === "failed") return;
        await updateHostedAgentJob(jobId, {
          status: "running",
          progress_stage: progress.stage,
          progress_message: progress.message ?? null,
          agent_run_id: progress.agentRunId,
          spent_usdc: progress.spentUsdc,
          last_heartbeat_at: new Date().toISOString(),
          raw: { paymentEventIds: progress.paymentEventIds },
        });
      },
    });

    await updateHostedAgentJob(jobId, {
      status: "completed",
      progress_stage: "completed",
      progress_message: result.summary,
      agent_run_id: result.agentRunId,
      spent_usdc: result.spentUsdc,
      error: null,
      completed_at: new Date().toISOString(),
      last_heartbeat_at: new Date().toISOString(),
      raw: {
        paymentEventIds: result.paymentEventIds,
        paidStepIds: result.paidStepIds,
      },
    });

    return { claimed: true as const, result };
  } catch (error) {
    const safeError = safeHostedError(error);
    await updateHostedAgentJob(jobId, {
      status: "failed",
      progress_stage: "failed",
      progress_message: "Hosted buyer-agent execution failed.",
      error: safeError,
      completed_at: new Date().toISOString(),
      last_heartbeat_at: new Date().toISOString(),
    });
    console.error(`[hosted-agent] job=${jobId} failed: ${safeError}`);
    return { claimed: true as const, error: safeError };
  }
}

export async function requeueFailedHostedAgentJob(jobId: string) {
  const { data, error } = await getHostedClient().rpc(
    "requeue_failed_hosted_agent_job",
    { p_job_id: jobId },
  );
  if (error) throw new Error("Unable to recover hosted agent job.");
  return data === true;
}

export async function recoverAndRunHostedAgentJob(jobId: string) {
  const recovered = await requeueFailedHostedAgentJob(jobId);
  if (!recovered) return { recovered: false as const };
  return { recovered: true as const, execution: await runHostedAgentJob(jobId) };
}

type PaymentEventView = {
  id: string;
  receipt_hash: string | null;
  service_hash: string | null;
  request_hash: string | null;
  response_hash: string | null;
  onchain_contract_address: string | null;
  onchain_chain_id: number | string | null;
  onchain_tx_hash: string | null;
  onchain_status: string | null;
  onchain_block_number: number | string | null;
  onchain_proof_id: string | null;
  onchain_attester: string | null;
  onchain_verified_at: string | null;
  onchain_last_attempt_at: string | null;
  onchain_attempt_count: number | null;
  onchain_error: string | null;
};

export async function getHostedAgentJobView(jobId: string) {
  const job = await getHostedAgentJob(jobId);
  if (!job) return null;

  let agentWallet: string | null = null;
  let paidSteps: Array<{ id: string; payment_event_id: string | null }> = [];
  if (job.agent_run_id) {
    const [{ data: run }, { data: steps }] = await Promise.all([
      getHostedClient()
        .from("agent_runs")
        .select("agent_wallet")
        .eq("id", job.agent_run_id)
        .maybeSingle(),
      getHostedClient()
        .from("agent_purchase_steps")
        .select("id,payment_event_id")
        .eq("run_id", job.agent_run_id)
        .eq("status", "paid")
        .order("step_index", { ascending: true }),
    ]);
    agentWallet = (run as { agent_wallet?: string } | null)?.agent_wallet ?? null;
    paidSteps = (steps ?? []) as Array<{ id: string; payment_event_id: string | null }>;
  }

  const paymentEventIds = paidSteps
    .map((step) => step.payment_event_id)
    .filter((value): value is string => Boolean(value));
  let paymentEvents: PaymentEventView[] = [];
  if (paymentEventIds.length > 0) {
    const { data, error } = await getHostedClient()
      .from("payment_events")
      .select([
        "id",
        "receipt_hash",
        "service_hash",
        "request_hash",
        "response_hash",
        "onchain_contract_address",
        "onchain_chain_id",
        "onchain_tx_hash",
        "onchain_status",
        "onchain_block_number",
        "onchain_proof_id",
        "onchain_attester",
        "onchain_verified_at",
        "onchain_last_attempt_at",
        "onchain_attempt_count",
        "onchain_error",
      ].join(","))
      .in("id", paymentEventIds);
    if (error) throw new Error("Unable to load hosted proof metadata.");
    paymentEvents = (data ?? []) as unknown as PaymentEventView[];
  }

  const proofMetadata = paymentEvents
    .map((event) => onchainProofMetadataFromRow(event))
    .filter((value) => value !== null);
  const verifiedProof = proofMetadata.find((proof) => proof.status === "verified") ?? null;
  const firstReceiptId = paidSteps[0]?.id ?? null;

  return {
    job: {
      id: job.id,
      requesterWallet: job.requester_wallet,
      task: job.task,
      budgetUsdc: job.budget_usdc,
      status: job.status,
      progressStage: job.progress_stage,
      progressMessage: job.progress_message,
      agentRunId: job.agent_run_id,
      spentUsdc: job.spent_usdc,
      error: job.error,
      attemptCount: job.attempt_count,
      recoveryCount: job.recovery_count,
      createdAt: job.created_at,
      startedAt: job.started_at,
      completedAt: job.completed_at,
    },
    payerWallet: agentWallet,
    receiptIds: paidSteps.map((step) => step.id),
    proof: verifiedProof ?? proofMetadata[0] ?? null,
    links: {
      hostedRun: `/agent-runner?job=${job.id}`,
      agentRun: job.agent_run_id ? `/runs/${job.agent_run_id}` : null,
      receipts: agentWallet ? `/receipts?wallet=${agentWallet}` : "/receipts",
      receipt: firstReceiptId ? `/receipts/${firstReceiptId}` : null,
      passport: agentWallet ? `/agents/${agentWallet}` : null,
      proofTransaction:
        verifiedProof?.transactionHash && verifiedProof.contractAddress
          ? `${configuredExplorerUrl()}/tx/${verifiedProof.transactionHash}`
          : null,
    },
  };
}
