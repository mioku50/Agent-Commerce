/**
 * Copyright 2026 Circle Internet Group, Inc. All rights reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { NextRequest, NextResponse } from "next/server.js";
import { type Address } from "viem";
import { authenticateMachineRequest } from "../../../../../lib/api/machine-auth.ts";
import { createMachineErrorResponse } from "../../../../../lib/api/machine-errors.ts";
import {
  resolveMachineIdempotency,
  saveMachineIdempotency,
} from "../../../../../lib/api/machine-idempotency.ts";
import {
  getHostedRunnerConfig,
  hostedIdempotencyHash,
  hostedIdempotencyRequestHash,
  hostedRequesterFingerprint,
  HOSTED_AGENT_MAX_BUDGET_USDC,
} from "../../../../../lib/agent/hosted-policy.ts";
import {
  hashHostedWorkflowInput,
  isHostedWorkflowType,
  validateHostedWorkflowRequest,
} from "../../../../../lib/agent/hosted-workflows.ts";
import { previewHostedWorkflow } from "../../../../../lib/agent/hosted-jobs.ts";
import { getHostedWorkflowTemplate } from "../../../../../lib/agent/workflow-templates.ts";
import {
  createHostedWorkflowQuote,
  HostedCheckoutPolicyError,
} from "../../../../../lib/commerce/workflow-checkout.ts";
import {
  parseGitHubRepositoryInput,
  InvalidGitHubRepositoryError,
} from "../../../../../lib/providers/github-repository-ref.ts";
import { ARC_TESTNET_CHAIN_ID } from "../../../../../lib/wallet/arc.ts";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const authResult = await authenticateMachineRequest(request, "quotes:create");
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

  // Idempotency deduplication check
  const idempotencyCheck = resolveMachineIdempotency(
    idempotencyKey,
    context.credential.id,
    body,
  );

  if (idempotencyCheck.conflict) {
    return createMachineErrorResponse(
      "invalid_repository",
      "This Idempotency-Key is already bound to a different workflow input.",
      409,
    );
  }

  if (idempotencyCheck.cached && idempotencyCheck.result) {
    return NextResponse.json(idempotencyCheck.result, {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    });
  }

  const workflow =
    (body.workflow as string) ||
    (body.workflowType as string) ||
    "github_due_diligence";

  if (!isHostedWorkflowType(workflow)) {
    return createMachineErrorResponse(
      "workflow_disabled",
      `Unsupported workflow type '${workflow}'.`,
      400,
    );
  }

  const allowedSet = new Set(context.allowedWorkflows || []);
  if (!allowedSet.has("*") && !allowedSet.has(workflow)) {
    return createMachineErrorResponse(
      "workflow_disabled",
      `Workflow '${workflow}' is not enabled for this credential policy.`,
      403,
    );
  }

  const template = getHostedWorkflowTemplate(workflow);
  if (!template) {
    return createMachineErrorResponse(
      "provider_unavailable",
      "Workflow template is unavailable.",
      503,
    );
  }

  let inputText = "";
  let repositoryRef = null;

  if (workflow === "github_due_diligence") {
    const rawRepo =
      (body.input as Record<string, unknown>)?.repository ||
      (body.input as Record<string, unknown>)?.repositoryUrl ||
      body.repository ||
      body.repositoryUrl;

    if (!rawRepo || typeof rawRepo !== "string" || !rawRepo.trim()) {
      return createMachineErrorResponse(
        "invalid_repository",
        "Enter a valid GitHub repository in owner/repository format.",
        400,
      );
    }

    try {
      repositoryRef = parseGitHubRepositoryInput(rawRepo);
      inputText = repositoryRef.canonicalUrl;
    } catch (err) {
      const msg =
        err instanceof InvalidGitHubRepositoryError
          ? err.message
          : "Enter a valid GitHub repository in owner/repository format.";
      return createMachineErrorResponse("invalid_repository", msg, 400);
    }
  } else {
    inputText =
      (body.input as Record<string, unknown>)?.text as string ||
      (body.text as string) ||
      "";
  }

  let workflowRequest;
  try {
    workflowRequest = validateHostedWorkflowRequest({
      workflowType: workflow,
      inputText,
      repositoryUrl: repositoryRef?.canonicalUrl,
      task: template.task,
      budgetUsdc: HOSTED_AGENT_MAX_BUDGET_USDC,
    });
  } catch (err) {
    return createMachineErrorResponse(
      "invalid_repository",
      err instanceof Error ? err.message : "Invalid workflow request input.",
      400,
    );
  }

  try {
    const plan = await previewHostedWorkflow(workflowRequest);

    if (plan.selectedServices.length === 0) {
      return createMachineErrorResponse(
        "provider_unavailable",
        "Required workflow services are temporarily unavailable.",
        503,
      );
    }

    const config = getHostedRunnerConfig();
    const inputSha256 = hashHostedWorkflowInput(workflowRequest.inputText);
    const idempotencyHash = hostedIdempotencyHash(
      config.rateLimitSecret,
      idempotencyKey,
    );
    const requestHash = hostedIdempotencyRequestHash({
      secret: config.rateLimitSecret,
      workflowType: workflowRequest.workflowType,
      inputSha256,
      task: workflowRequest.task,
      marketSymbol: workflowRequest.marketSymbol,
      repository: workflowRequest.repository,
      budgetUsdc: workflowRequest.budgetUsdc,
    });

    const quoteResult = await createHostedWorkflowQuote({
      idempotencyHash,
      requestHash,
      requesterFingerprint: hostedRequesterFingerprint({
        secret: config.rateLimitSecret,
        forwardedFor: request.headers.get("x-forwarded-for"),
        userAgent: request.headers.get("user-agent"),
      }),
      requesterWallet: context.ownerWallet as Address,
      request: workflowRequest,
      plan,
    });

    const responsePayload = {
      quoteId: quoteResult.quote.id,
      workflow: quoteResult.quote.workflowType,
      repository: workflowRequest.repository
        ? {
            fullName: workflowRequest.repository.fullName,
            canonicalUrl: workflowRequest.repository.canonicalUrl,
          }
        : null,
      totalUsdc: quoteResult.quote.pricing.listPriceUsdc,
      sponsored: quoteResult.quote.paymentMode === "sponsored",
      expiresAt: quoteResult.quote.expiresAt,
      requiredPayment: {
        network: "arc-testnet",
        asset: "USDC",
        amount: quoteResult.quote.pricing.amountDueUsdc,
        treasuryAddress: quoteResult.quote.treasuryAddress,
        chainId: quoteResult.quote.chainId || ARC_TESTNET_CHAIN_ID,
      },
    };

    saveMachineIdempotency(
      idempotencyKey,
      context.credential.id,
      body,
      responsePayload,
    );

    return NextResponse.json(responsePayload, {
      status: quoteResult.created ? 201 : 200,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (error instanceof HostedCheckoutPolicyError) {
      if (error.reason === "idempotency_conflict") {
        return createMachineErrorResponse(
          "invalid_repository",
          "This Idempotency-Key is already bound to a different workflow input.",
          409,
        );
      }
      if (error.reason === "active_job") {
        return createMachineErrorResponse(
          "rate_limited",
          "The hosted payer is already running another workflow.",
          409,
        );
      }
      return createMachineErrorResponse(
        "rate_limited",
        "Hosted checkout rate policy is temporarily limiting this requester.",
        429,
      );
    }

    console.error("[quotes/route] Internal Error:", error);
    return createMachineErrorResponse(
      "internal_error",
      error instanceof Error ? error.message : "Failed to create quote.",
      500,
    );
  }
}
