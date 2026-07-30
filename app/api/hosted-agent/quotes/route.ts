import { NextRequest, NextResponse } from "next/server.js";
import { previewHostedWorkflow } from "../../../../lib/agent/hosted-jobs.ts";
import {
  HOSTED_AGENT_MAX_BUDGET_USDC,
  getHostedRunnerConfig,
  hostedIdempotencyHash,
  hostedIdempotencyRequestHash,
  hostedRequesterFingerprint,
  optionalRequesterWallet,
  safeHostedError,
  validateIdempotencyKey,
} from "../../../../lib/agent/hosted-policy.ts";
import {
  hashHostedWorkflowInput,
  isHostedWorkflowType,
  validateHostedWorkflowRequest,
} from "../../../../lib/agent/hosted-workflows.ts";
import { getHostedWorkflowTemplate } from "../../../../lib/agent/workflow-templates.ts";
import {
  createHostedWorkflowQuote,
  HostedCheckoutPolicyError,
  sponsoredWorkflowAuthorizationMessage,
} from "../../../../lib/commerce/workflow-checkout.ts";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    if (!isHostedWorkflowType(body.workflowType)) {
      return NextResponse.json(
        { error: "Unsupported workflow.", reason: "workflow_not_supported" },
        { status: 400 },
      );
    }
    const template = getHostedWorkflowTemplate(body.workflowType);
    if (!template) {
      return NextResponse.json(
        { error: "Workflow configuration is unavailable.", reason: "workflow_template_missing" },
        { status: 503 },
      );
    }
    const serverEnforcedBody = {
      workflowType: body.workflowType,
      inputText: body.inputText,
      repositoryUrl: body.repositoryUrl,
      agentTrustInput: body.agentTrustInput,
      agentId: body.agentId,
      agentWallet: body.agentWallet,
      contractAddress: body.contractAddress,
      serviceEndpoint: body.serviceEndpoint,
      marketSymbol: body.marketSymbol,
      task: template.task,
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
      repository: workflowRequest.repository,
      budgetUsdc: workflowRequest.budgetUsdc,
    });
    const plan = await previewHostedWorkflow(workflowRequest);

    if (plan.selectedServices.length === 0) {
      console.error("[hosted-checkout] workflow has no available services", {
        workflowType: workflowRequest.workflowType,
        allowedServices: getHostedRunnerConfig()
          .serviceAllowlist
          .map((service) => service.slug),
        skippedServices: plan.skippedServices.map((service) => service.slug),
      });

      return NextResponse.json(
        {
          error:
            "This report is temporarily unavailable because its required services are not enabled.",
          reason: "workflow_services_unavailable",
        },
        { status: 503 },
      );
    }

    const REQUIRED_GITHUB_SERVICES = [
      "github-repository-intelligence",
      "github-due-diligence-analysis",
    ] as const;

    if (
      workflowRequest.workflowType === "github_due_diligence" ||
      (workflowRequest.workflowType === "agent_trust_report" &&
        workflowRequest.repository)
    ) {
      const selected = new Set(
        plan.selectedServices.map((service) => service.slug),
      );

      const missing = REQUIRED_GITHUB_SERVICES.filter(
        (slug) => !selected.has(slug),
      );

      if (missing.length > 0) {
        console.error("[hosted-checkout] github workflow configuration incomplete", {
          missing,
          selected: [...selected],
        });

        return NextResponse.json(
          {
            error:
              workflowRequest.workflowType === "agent_trust_report"
                ? "The repository portion of Agent Trust Report is temporarily unavailable because required GitHub analysis services are disabled."
                : "GitHub Project Due Diligence is temporarily unavailable because one or more required analysis services are disabled.",
            reason: "github_workflow_incomplete",
          },
          { status: 503 },
        );
      }
    }

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
