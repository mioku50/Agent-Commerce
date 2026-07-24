/**
 * Copyright 2026 Circle Internet Group, Inc. All rights reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { after, NextRequest, NextResponse } from "next/server.js";
import { authenticateMachineRequest } from "../../../../../lib/api/machine-auth.ts";
import { createMachineErrorResponse } from "../../../../../lib/api/machine-errors.ts";
import {
  resolveMachineIdempotency,
  saveMachineIdempotency,
} from "../../../../../lib/api/machine-idempotency.ts";
import {
  confirmHostedWorkflowQuote,
  getHostedWorkflowQuote,
} from "../../../../../lib/commerce/workflow-checkout.ts";
import { getHostedWorkflowCheckoutConfig } from "../../../../../lib/agent/workflow-pricing.ts";
import { getByoaClient } from "../../../../../lib/byoa/service.ts";
import { runHostedAgentJob } from "../../../../../lib/agent/hosted-jobs.ts";
import {
  getHostedRunnerConfig,
  hostedIdempotencyHash,
  hostedIdempotencyRequestHash,
} from "../../../../../lib/agent/hosted-policy.ts";
import {
  hashHostedWorkflowInput,
  validateHostedWorkflowRequest,
} from "../../../../../lib/agent/hosted-workflows.ts";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const authResult = await authenticateMachineRequest(request, "runs:create");
  if (!authResult.ok) {
    return authResult.response;
  }
  const { context } = authResult;

  const idempotencyKey =
    request.headers.get("idempotency-key") ||
    request.headers.get("Idempotency-Key");

  if (!idempotencyKey || !idempotencyKey.trim()) {
    return createMachineErrorResponse(
      "credential_missing",
      "Missing required Idempotency-Key header.",
      400,
    );
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return createMachineErrorResponse(
      "invalid_repository",
      "Invalid JSON request body.",
      400,
    );
  }

  const quoteId = body.quoteId;
  if (!quoteId || typeof quoteId !== "string" || !quoteId.trim()) {
    return createMachineErrorResponse(
      "quote_not_found",
      "The specified workflow quote could not be found.",
      404,
    );
  }

  // Idempotency deduplication check
  const idempotencyCheck = await resolveMachineIdempotency(
    idempotencyKey,
    context.credential.id,
    body,
    "/api/agent/v1/runs",
    context.agentId,
  );

  if (idempotencyCheck.conflict) {
    return createMachineErrorResponse(
      "idempotency_conflict",
      "This Idempotency-Key is already bound to a different run request.",
      409,
    );
  }

  if (idempotencyCheck.cachedResponse?.body) {
    return NextResponse.json(idempotencyCheck.cachedResponse.body, {
      status: idempotencyCheck.cachedResponse.status,
      headers: { "Cache-Control": "no-store" },
    });
  }

  // Fetch Quote
  const storedQuote = await getHostedWorkflowQuote(quoteId);
  if (!storedQuote) {
    return createMachineErrorResponse(
      "quote_not_found",
      "The specified workflow quote could not be found.",
      404,
    );
  }

  // Strict Quote Ownership Verification
  const quoteAgentId = storedQuote.byoa_agent_id || (storedQuote.planner_snapshot as any)?.metadata?.byoa_agent_id;
  const quoteCredentialId = storedQuote.machine_credential_id || (storedQuote.planner_snapshot as any)?.metadata?.machine_credential_id;

  if (
    quoteAgentId !== context.agentId ||
    quoteCredentialId !== context.credential.id
  ) {
    return createMachineErrorResponse(
      "quote_not_found",
      "The specified workflow quote could not be found.",
      404,
    );
  }

  // Check Expiration
  if (
    Date.parse(storedQuote.expires_at) <= Date.now() ||
    storedQuote.status === "expired"
  ) {
    return createMachineErrorResponse(
      "quote_expired",
      "The quote has expired. Please request a new quote.",
      404,
    );
  }

  // Check Quote Reuse
  if (
    storedQuote.status === "consumed" ||
    storedQuote.status === "completed" ||
    storedQuote.job_id != null
  ) {
    return createMachineErrorResponse(
      "quote_already_used",
      "This quote has already been executed.",
      409,
    );
  }

  const paymentAuth = body.paymentAuthorization as
    | { type?: string; payload?: string }
    | undefined;

  // Validate Payment Authorization for Paid Mode
  if (storedQuote.payment_mode === "paid") {
    if (!paymentAuth || typeof paymentAuth !== "object") {
      return createMachineErrorResponse(
        "payment_required",
        "Payment authorization is required for paid quotes.",
        402,
      );
    }

    if (
      !paymentAuth.type ||
      !paymentAuth.payload ||
      typeof paymentAuth.payload !== "string"
    ) {
      return createMachineErrorResponse(
        "payment_invalid",
        "Invalid payment authorization type or payload.",
        400,
      );
    }

    const validTypes = ["arc_transaction", "transaction", "arc"];
    if (!validTypes.includes(paymentAuth.type)) {
      return createMachineErrorResponse(
        "payment_invalid",
        `Unsupported payment authorization type '${paymentAuth.type}'.`,
        400,
      );
    }

    if (!/^0x[0-9a-fA-F]{64}$/.test(paymentAuth.payload.trim())) {
      return createMachineErrorResponse(
        "payment_invalid",
        "Invalid payment transaction hash format.",
        400,
      );
    }
  }

  // Prepare workflow request reconstruction from stored quote
  const serverEnforcedBody = {
    workflowType: storedQuote.workflow_type,
    inputText:
      storedQuote.planner_snapshot?.repository?.canonicalUrl ||
      storedQuote.input_preview,
    repositoryUrl: storedQuote.planner_snapshot?.repository?.canonicalUrl,
    marketSymbol: storedQuote.planner_snapshot?.marketSymbol,
    task: storedQuote.task,
    budgetUsdc: storedQuote.budget_usdc,
  };

  let workflowRequest;
  try {
    workflowRequest = validateHostedWorkflowRequest(serverEnforcedBody);
  } catch (err) {
    return createMachineErrorResponse(
      "internal_error",
      err instanceof Error ? err.message : "Failed to reconstruct workflow request.",
      500,
    );
  }

  const runnerConfig = getHostedRunnerConfig();
  const inputSha256 = hashHostedWorkflowInput(workflowRequest.inputText);
  const idempotencyHash = hostedIdempotencyHash(
    runnerConfig.rateLimitSecret,
    idempotencyKey,
  );
  const requestHash = hostedIdempotencyRequestHash({
    secret: runnerConfig.rateLimitSecret,
    workflowType: workflowRequest.workflowType,
    inputSha256,
    task: workflowRequest.task,
    marketSymbol: workflowRequest.marketSymbol,
    repository: workflowRequest.repository,
    budgetUsdc: workflowRequest.budgetUsdc,
  });

  let jobId: string | null = null;

  try {
    if (storedQuote.payment_mode === "sponsored") {
      const checkoutConfig = getHostedWorkflowCheckoutConfig();
      const client = getByoaClient();
      const { data, error } = await client.rpc(
        "launch_hosted_workflow_checkout_v1",
        {
          p_quote_id: storedQuote.id,
          p_idempotency_hash: idempotencyHash,
          p_request_hash: requestHash,
          p_payment_mode: "sponsored",
          p_transaction_hash: null,
          p_block_number: null,
          p_settled_at: null,
          p_sponsored_quota: checkoutConfig.sponsoredQuota,
        },
      );

      if (error) {
        console.error("[runs/route] Sponsored RPC launch error:", error);
        return createMachineErrorResponse(
          "internal_error",
          "Failed to launch sponsored workflow checkout.",
          500,
        );
      }

      const row = (data as Array<{
        job_id: string | null;
        user_payment_id: string | null;
        created: boolean;
        reason: string;
      }> | null)?.[0];

      if (!row || !row.job_id) {
        if (row?.reason === "quote_expired") {
          return createMachineErrorResponse(
            "quote_expired",
            "Quote expired prior to execution.",
            404,
          );
        }
        if (row?.reason === "sponsored_quota_exhausted") {
          return createMachineErrorResponse(
            "spending_limit_exceeded",
            "Sponsored quota has been exhausted.",
            429,
          );
        }
        return createMachineErrorResponse(
          "internal_error",
          `Sponsored checkout failed: ${row?.reason || "unknown_error"}`,
          400,
        );
      }
      jobId = row.job_id;
    } else {
      // Paid mode
      const txHash = (paymentAuth?.payload ?? "").trim();
      const result = await confirmHostedWorkflowQuote({
        quoteId: storedQuote.id,
        idempotencyHash,
        requestHash,
        request: workflowRequest,
        transactionHash: txHash,
      });

      if (!result.jobId) {
        return createMachineErrorResponse(
          "payment_invalid",
          `Paid workflow checkout failed: ${result.reason}`,
          400,
        );
      }
      jobId = result.jobId;
    }

    // Associate Agent ID with job
    if (jobId) {
      await getByoaClient()
        .from("hosted_agent_jobs")
        .update({
          byoa_agent_id: context.agentId,
          byoa_quote_id: storedQuote.id,
        })
        .eq("id", jobId);
    }

    const responsePayload = {
      runId: jobId,
      status: "queued",
      pollAfterMs: 2000,
    };

    await saveMachineIdempotency(
      idempotencyKey,
      context.credential.id,
      body,
      responsePayload,
      {
        agentId: context.agentId,
        route: "/api/agent/v1/runs",
        responseStatus: 201,
        resourceType: "run",
        resourceId: jobId,
      },
    );

    // Launch execution asynchronously
    if (jobId) {
      const inputForRunner = workflowRequest.inputText;
      try {
        after(async () => {
          try {
            await runHostedAgentJob(jobId!, inputForRunner);
          } catch (err) {
            console.error(
              `[runs/route] Async execution failed for job=${jobId}:`,
              err,
            );
          }
        });
      } catch {
        // Fallback for execution outside Next.js request context (e.g. unit tests)
        runHostedAgentJob(jobId, inputForRunner).catch((err) => {
          console.error(
            `[runs/route] Async execution fallback failed for job=${jobId}:`,
            err,
          );
        });
      }
    }

    return NextResponse.json(responsePayload, {
      status: 201,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("[runs/route] Execution launch error:", error);
    const msg = error instanceof Error ? error.message : "Failed to launch run.";
    if (
      msg.includes("payment") ||
      msg.includes("reverted") ||
      msg.includes("does not match") ||
      msg.includes("transaction")
    ) {
      return createMachineErrorResponse("payment_invalid", msg, 400);
    }
    return createMachineErrorResponse("internal_error", msg, 500);
  }
}
