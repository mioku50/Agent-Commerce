/**
 * Copyright 2026 Circle Internet Group, Inc.  All rights reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { executeBuyerAgent, type BuyerAgentProgressStage } from "./execution.ts";
import {
  getHostedRunnerConfig,
  hostedServiceAllowlist,
  safeHostedError,
} from "./hosted-policy.ts";
import {
  buildHostedFinalReport,
  createHostedWorkflowPlan,
  hashHostedWorkflowInput,
  hostedWorkflowInputMetadata,
  isHostedWorkflowType,
  workflowLabel,
  type HostedFinalReport,
  type HostedPlannerSnapshot,
  type HostedWorkflowRequest,
  type HostedWorkflowType,
  validateHostedWorkflowRequest,
} from "./hosted-workflows.ts";
import {
  configuredExplorerUrl,
  onchainProofMetadataFromRow,
} from "../commerce/onchain-proof.ts";
import { serviceRegistry } from "../services/registry.ts";
import { getServerSupabaseConfig } from "../supabase/server-env.ts";
import {
  defaultServicePresentation,
  providerResponsePresentation,
} from "../services/presentation.ts";
import type { ServiceSourceType } from "../services/registry.ts";

export type HostedJobStatus = "queued" | "running" | "completed" | "failed";
export type HostedJobProgressStage =
  | "queued"
  | BuyerAgentProgressStage;

export type HostedAgentJobRow = {
  id: string;
  idempotency_hash: string;
  request_hash: string;
  requester_fingerprint: string;
  requester_wallet: string | null;
  workflow_type: HostedWorkflowType;
  task: string;
  input_text: string | null;
  input_preview: string;
  input_hash: string;
  budget_usdc: string;
  planner_snapshot: HostedPlannerSnapshot;
  selected_services: HostedPlannerSnapshot["selectedServices"];
  structured_result: HostedFinalReport | null;
  receipt_ids: string[];
  proof_transaction_hashes: string[];
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
  reason:
    | "created"
    | "idempotent"
    | "idempotency_conflict"
    | "active_job"
    | "cooldown"
    | "rate_limited";
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
  requestHash: string;
  requesterFingerprint: string;
  requesterWallet: string | null;
  request: HostedWorkflowRequest;
}) {
  const config = getHostedRunnerConfig();
  const plan = await previewHostedWorkflow(input.request);
  const inputMetadata = hostedWorkflowInputMetadata(input.request.inputText);
  const { data, error } = await getHostedClient().rpc("launch_hosted_agent_workflow_v2", {
    p_idempotency_hash: input.idempotencyHash,
    p_request_hash: input.requestHash,
    p_requester_fingerprint: input.requesterFingerprint,
    p_requester_wallet: input.requesterWallet,
    p_workflow_type: input.request.workflowType,
    p_task: input.request.task,
    p_input_preview: inputMetadata.preview,
    p_input_hash: inputMetadata.sha256,
    p_budget_usdc: input.request.budgetUsdc,
    p_planner_snapshot: plan,
    p_selected_services: plan.selectedServices,
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

export async function previewHostedWorkflow(request: HostedWorkflowRequest) {
  return createHostedWorkflowPlan({
    request,
    services: serviceRegistry,
    allowlist: hostedServiceAllowlist(),
  });
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

function validatedExecutionRequest(job: HostedAgentJobRow, inputText: string) {
  const request = validateHostedWorkflowRequest({
    workflowType: job.workflow_type,
    task: job.task,
    inputText,
    marketSymbol: job.planner_snapshot.marketSymbol,
    budgetUsdc: Number(job.budget_usdc),
  });
  if (hashHostedWorkflowInput(request.inputText) !== job.input_hash) {
    throw new Error("Hosted workflow input does not match the original launch request.");
  }
  return request;
}

export async function runHostedAgentJob(jobId: string, inputText: string) {
  const queuedJob = await getHostedAgentJob(jobId);
  if (!queuedJob) throw new Error("Hosted job no longer exists.");
  const request = validatedExecutionRequest(queuedJob, inputText);
  const claimed = await claimHostedAgentJob(jobId);
  if (!claimed) return { claimed: false as const };

  const job = await getHostedAgentJob(jobId);
  if (!job) throw new Error("Claimed hosted job no longer exists.");

  try {
    const config = getHostedRunnerConfig();
    const plannerSnapshot = job.planner_snapshot;
    const result = await executeBuyerAgent({
      task: plannerSnapshot.effectiveTask ?? job.task,
      requestInputText: request.inputText,
      marketSymbol: request.marketSymbol,
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
      planningPolicy: {
        allowOfficial: true,
        allowSellerCreated: false,
        maxPaidCalls: 3,
        maxServicePriceUsd: Number(job.budget_usdc),
      },
      continueOnServiceFailure: true,
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

    let proofTransactionHashes: string[] = [];
    if (result.paymentEventIds.length > 0) {
      const { data, error } = await getHostedClient()
        .from("payment_events")
        .select("onchain_tx_hash")
        .in("id", result.paymentEventIds)
        .eq("onchain_status", "verified");
      if (error) {
        console.warn(
          `[hosted-agent] job=${jobId} proof metadata will reconcile on read: ${safeHostedError(error)}`,
        );
      } else {
        proofTransactionHashes = (data ?? [])
          .map((row) => (row as { onchain_tx_hash: string | null }).onchain_tx_hash)
          .filter((value): value is string => Boolean(value));
      }
    }
    const structuredResult = buildHostedFinalReport({
      jobId,
      request,
      plan: plannerSnapshot,
      agentRunId: result.agentRunId,
      agentWallet: result.agentWallet,
      spentUsdc: result.spentUsdc,
      receiptIds: result.paidStepIds,
      proofTransactionHashes,
      serviceResults: result.serviceResults,
      explorerUrl: configuredExplorerUrl(),
    });

    await updateHostedAgentJob(jobId, {
      status: "completed",
      progress_stage: "completed",
      progress_message: result.summary,
      agent_run_id: result.agentRunId,
      spent_usdc: result.spentUsdc,
      error: null,
      structured_result: structuredResult,
      selected_services: plannerSnapshot.selectedServices,
      receipt_ids: result.paidStepIds,
      proof_transaction_hashes: proofTransactionHashes,
      completed_at: new Date().toISOString(),
      last_heartbeat_at: new Date().toISOString(),
      raw: {
        paymentEventIds: result.paymentEventIds,
        paidStepIds: result.paidStepIds,
        serviceResults: result.serviceResults,
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

export async function recoverAndRunHostedAgentJob(jobId: string, inputText: string) {
  const job = await getHostedAgentJob(jobId);
  if (!job) throw new Error("Hosted job not found.");
  validatedExecutionRequest(job, inputText);
  const recovered = await requeueFailedHostedAgentJob(jobId);
  if (!recovered) return { recovered: false as const };
  return {
    recovered: true as const,
    execution: await runHostedAgentJob(jobId, inputText),
  };
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
  let steps: Array<{
    id: string;
    service_slug: string;
    service_name: string;
    service_source_type: string | null;
    price_usdc: string;
    status: string;
    reasoning: string;
    payment_event_id: string | null;
    response_preview: unknown;
    error: string | null;
  }> = [];
  if (job.agent_run_id) {
    const [{ data: run }, { data: dataSteps }] = await Promise.all([
      getHostedClient()
        .from("agent_runs")
        .select("agent_wallet")
        .eq("id", job.agent_run_id)
        .maybeSingle(),
      getHostedClient()
        .from("agent_purchase_steps")
        .select("id,service_slug,service_name,service_source_type,price_usdc,status,reasoning,payment_event_id,response_preview,error")
        .eq("run_id", job.agent_run_id)
        .order("step_index", { ascending: true }),
    ]);
    agentWallet = (run as { agent_wallet?: string } | null)?.agent_wallet ?? null;
    steps = (dataSteps ?? []) as typeof steps;
  }

  const paidSteps = steps.filter((step) => step.status === "paid");
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

  const eventById = new Map(paymentEvents.map((event) => [event.id, event]));
  const proofs = paidSteps.flatMap((step) => {
    const event = step.payment_event_id ? eventById.get(step.payment_event_id) : null;
    const proof = event ? onchainProofMetadataFromRow(event) : null;
    if (!proof) return [];
    return [{
      receiptId: step.id,
      paymentEventId: step.payment_event_id,
      ...proof,
      transactionUrl: proof.transactionHash
        ? `${configuredExplorerUrl()}/tx/${proof.transactionHash}`
        : null,
      contractUrl: proof.contractAddress
        ? `${configuredExplorerUrl()}/address/${proof.contractAddress}`
        : null,
    }];
  });
  const verifiedProof = proofs.find((proof) => proof.status === "verified") ?? null;
  const firstReceiptId = paidSteps[0]?.id ?? null;
  const verifiedHashes = proofs
    .filter((proof) => proof.status === "verified" && proof.transactionHash)
    .map((proof) => proof.transactionHash as string);

  let structuredResult = job.structured_result;
  if (
    job.status === "completed" &&
    JSON.stringify(verifiedHashes) !== JSON.stringify(job.proof_transaction_hashes)
  ) {
    structuredResult = structuredResult
      ? {
          ...structuredResult,
          proofTransactionHashes: verifiedHashes,
          links: {
            ...structuredResult.links,
            proofTransactions: verifiedHashes.map(
              (hash) => `${configuredExplorerUrl()}/tx/${hash}`,
            ),
          },
        }
      : null;
    await updateHostedAgentJob(job.id, {
      proof_transaction_hashes: verifiedHashes,
      structured_result: structuredResult,
    });
  }

  return {
    job: {
      id: job.id,
      requesterWallet: job.requester_wallet,
      workflowType: job.workflow_type,
      task: job.task,
      inputPreview: job.input_preview,
      inputSha256: job.input_hash,
      budgetUsdc: job.budget_usdc,
      plannerSnapshot: job.planner_snapshot,
      selectedServices: job.selected_services,
      structuredResult,
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
    services: steps.map((step) => {
      const planned = job.planner_snapshot.selectedServices?.find(
        (service) => service.slug === step.service_slug,
      );
      const responseProvider = providerResponsePresentation(step.response_preview);
      const sourceType = (
        step.service_source_type === "provider_backed" ||
        step.service_source_type === "seller_mock" ||
        step.service_source_type === "external_placeholder"
          ? step.service_source_type
          : "static"
      ) as ServiceSourceType;
      const fallback = defaultServicePresentation(sourceType);
      const presentation = planned?.presentation ?? {
        ...fallback,
        providerName: responseProvider?.providerName ?? fallback.providerName,
        assetSymbol: responseProvider?.assetSymbol ?? fallback.assetSymbol,
      };
      return {
        receiptId: step.status === "paid" ? step.id : null,
        serviceSlug: step.service_slug,
        serviceName: step.service_name,
        priceUsdc: step.price_usdc,
        status: step.status,
        reasoning: step.reasoning,
        presentation,
        response: step.response_preview,
        error: step.error,
      };
    }),
    proofs,
    proof: verifiedProof ?? proofs[0] ?? null,
    links: {
      hostedRun: `/agent-runner/${job.id}`,
      agentRun: job.agent_run_id ? `/runs/${job.agent_run_id}` : null,
      receipts: agentWallet ? `/receipts?wallet=${agentWallet}` : "/receipts",
      receipt: firstReceiptId ? `/receipts/${firstReceiptId}` : null,
      passport: agentWallet ? `/agents/${agentWallet}` : null,
      proofTransaction:
        verifiedProof?.transactionHash && verifiedProof.contractAddress
          ? `${configuredExplorerUrl()}/tx/${verifiedProof.transactionHash}`
          : null,
      proofTransactions: proofs
        .filter((proof) => proof.transactionUrl)
        .map((proof) => proof.transactionUrl as string),
    },
  };
}

export async function listRecentHostedAgentJobs(
  limit = 8,
  workflowType?: HostedWorkflowType | null,
) {
  const safeLimit = Math.max(1, Math.min(Math.trunc(limit), 20));
  let query = getHostedClient()
    .from("hosted_agent_jobs")
    .select("id,workflow_type,task,input_preview,status,spent_usdc,created_at,completed_at,receipt_ids,proof_transaction_hashes")
    .order("created_at", { ascending: false });
  if (workflowType && isHostedWorkflowType(workflowType)) {
    query = query.eq("workflow_type", workflowType);
  }
  const { data, error } = await query.limit(safeLimit);
  if (error) throw new Error("Unable to load recent hosted workflows.");
  return (data ?? []).map((row) => ({
    id: row.id as string,
    workflowType: row.workflow_type as HostedWorkflowType,
    task: row.task as string,
    inputPreview: String(row.input_preview ?? ""),
    status: row.status as HostedJobStatus,
    spentUsdc: String(row.spent_usdc),
    createdAt: row.created_at as string,
    completedAt: (row.completed_at as string | null) ?? null,
    receiptCount: Array.isArray(row.receipt_ids) ? row.receipt_ids.length : 0,
    proofCount: Array.isArray(row.proof_transaction_hashes)
      ? row.proof_transaction_hashes.length
      : 0,
    href: `/agent-runner/${row.id as string}`,
  }));
}

export type HostedFinalReportSummary = {
  id: string;
  workflowType: HostedWorkflowType;
  workflowLabel: string;
  inputPreview: string;
  summary: string;
  keyFindings: string[];
  spentUsdc: string;
  receiptCount: number;
  proofCount: number;
  completedWithWarnings: boolean;
  generatedAt: string;
  href: string;
};

export async function listHostedFinalReports(
  limit = 12,
  workflowType?: HostedWorkflowType | null,
) {
  const safeLimit = Math.max(1, Math.min(Math.trunc(limit), 50));
  let query = getHostedClient()
    .from("hosted_agent_jobs")
    .select("id,workflow_type,input_preview,structured_result,spent_usdc,completed_at,receipt_ids,proof_transaction_hashes")
    .eq("status", "completed")
    .not("structured_result", "is", null)
    .order("completed_at", { ascending: false, nullsFirst: false });
  if (workflowType && isHostedWorkflowType(workflowType)) {
    query = query.eq("workflow_type", workflowType);
  }
  const { data, error } = await query.limit(safeLimit);
  if (error) throw new Error("Unable to load hosted Final Reports.");

  return (data ?? []).flatMap((row) => {
    const report = row.structured_result as HostedFinalReport | null;
    if (!report) return [];
    const receiptIds = Array.isArray(row.receipt_ids) ? row.receipt_ids : [];
    const proofHashes = Array.isArray(row.proof_transaction_hashes)
      ? row.proof_transaction_hashes
      : [];
    return [{
      id: row.id as string,
      workflowType: row.workflow_type as HostedWorkflowType,
      workflowLabel: workflowLabel(row.workflow_type as HostedWorkflowType),
      inputPreview: report.input?.preview ?? String(row.input_preview ?? ""),
      summary: report.summary,
      keyFindings: Array.isArray(report.keyFindings) ? report.keyFindings.slice(0, 3) : [],
      spentUsdc: report.spentUsdc ?? String(row.spent_usdc ?? "0"),
      receiptCount: receiptIds.length,
      proofCount: proofHashes.length,
      completedWithWarnings: Boolean(report.completedWithWarnings),
      generatedAt:
        report.generatedAt ?? (row.completed_at as string | null) ?? new Date(0).toISOString(),
      href: `/agent-runner/${row.id as string}`,
    } satisfies HostedFinalReportSummary];
  });
}
