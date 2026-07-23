import { NextRequest, NextResponse } from "next/server";
import { previewHostedWorkflow } from "@/lib/agent/hosted-jobs";
import {
  HOSTED_AGENT_MAX_BUDGET_USDC,
  getHostedRunnerConfig,
  hostedIdempotencyHash,
  hostedIdempotencyRequestHash,
  hostedRequesterFingerprint,
  optionalRequesterWallet,
  safeHostedError,
  validateIdempotencyKey,
} from "@/lib/agent/hosted-policy";
import {
  hashHostedWorkflowInput,
  isHostedWorkflowType,
  validateHostedWorkflowRequest,
} from "@/lib/agent/hosted-workflows";
import { getHostedWorkflowTemplate } from "@/lib/agent/workflow-templates";
import {
  createHostedWorkflowQuote,
  HostedCheckoutPolicyError,
  sponsoredWorkflowAuthorizationMessage,
} from "@/lib/commerce/workflow-checkout";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const template = isHostedWorkflowType(body.workflowType)
      ? getHostedWorkflowTemplate(body.workflowType)
      : undefined;
    const serverEnforcedBody = {
      ...body,
      task: template?.task ?? body.task,
      budgetUsdc: HOSTED_AGENT_MAX_BUDGET_USDC,
    };
    const workflowRequest = validateHostedWorkflowRequest(serverEnforcedBody);
    const requesterWallet = optionalRequesterWallet(body.requesterWallet);
    if (!requesterWallet) {
      return NextResponse.json(
        { error: "Connect a requester wallet before creating a workflow quote." },
        { status: 400 },
      );
    }
    const idempotencyKey = validateIdempotencyKey(
      request.headers.get("idempotency-key"),
    );
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
      budgetUsdc: workflowRequest.budgetUsdc,
    });
    const plan = await previewHostedWorkflow(workflowRequest);
    const result = await createHostedWorkflowQuote({
      idempotencyHash,
      requestHash,
      requesterFingerprint: hostedRequesterFingerprint({
        secret: config.rateLimitSecret,
        forwardedFor: request.headers.get("x-forwarded-for"),
        userAgent: request.headers.get("user-agent"),
      }),
      requesterWallet,
      request: workflowRequest,
      plan,
    });
    return NextResponse.json(
      {
        quote: result.quote,
        created: result.created,
        sponsoredAuthorizationMessage:
          result.quote.paymentMode === "sponsored"
            ? sponsoredWorkflowAuthorizationMessage(result.quote)
            : null,
      },
      {
        status: result.created ? 201 : 200,
        headers: { "Cache-Control": "no-store" },
      },
    );
  } catch (error) {
    if (error instanceof HostedCheckoutPolicyError) {
      const status = error.reason === "idempotency_conflict" || error.reason === "active_job"
        ? 409
        : 429;
      return NextResponse.json(
        {
          error:
            error.reason === "idempotency_conflict"
              ? "This Idempotency-Key is already bound to a different workflow input."
              : error.reason === "active_job"
                ? "The hosted payer is already running another workflow. No payment was requested."
                : "Hosted checkout rate policy is temporarily limiting this requester.",
          reason: error.reason,
          retryAfterSeconds: error.retryAfterSeconds,
        },
        {
          status,
          headers: error.retryAfterSeconds
            ? { "Retry-After": String(error.retryAfterSeconds) }
            : undefined,
        },
      );
    }
    const message = safeHostedError(error);
    return NextResponse.json(
      {
        error: message.includes("not configured")
          ? "Hosted workflow checkout is unavailable."
          : message,
      },
      { status: message.includes("not configured") ? 503 : 400 },
    );
  }
}
