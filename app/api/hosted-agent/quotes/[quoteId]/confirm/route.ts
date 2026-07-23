import { after, NextRequest, NextResponse } from "next/server";
import { getHostedAgentJob, runHostedAgentJob } from "@/lib/agent/hosted-jobs";
import {
  getHostedRunnerConfig,
  hostedIdempotencyHash,
  hostedIdempotencyRequestHash,
  safeHostedError,
  validateIdempotencyKey,
} from "@/lib/agent/hosted-policy";
import {
  hashHostedWorkflowInput,
  validateHostedWorkflowRequest,
} from "@/lib/agent/hosted-workflows";
import {
  confirmHostedWorkflowQuote,
  getHostedWorkflowQuote,
  HostedCheckoutPolicyError,
} from "@/lib/commerce/workflow-checkout";

type RouteContext = { params: Promise<{ quoteId: string }> };

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(request: NextRequest, { params }: RouteContext) {
  const { quoteId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(quoteId)) {
    return NextResponse.json({ error: "Invalid workflow quote ID." }, { status: 400 });
  }
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const storedQuote = await getHostedWorkflowQuote(quoteId);
    if (!storedQuote) {
      return NextResponse.json(
        { error: "Hosted workflow quote was not found.", reason: "quote_not_found" },
        { status: 404 },
      );
    }
    const serverEnforcedBody = {
      workflowType: storedQuote.workflow_type,
      inputText: body.inputText,
      marketSymbol: body.marketSymbol ?? storedQuote.planner_snapshot?.marketSymbol,
      task: storedQuote.task,
      budgetUsdc: storedQuote.budget_usdc,
    };
    const workflowRequest = validateHostedWorkflowRequest(serverEnforcedBody);
    const idempotencyKey = validateIdempotencyKey(
      request.headers.get("idempotency-key"),
    );
    const config = getHostedRunnerConfig();
    const inputSha256 = hashHostedWorkflowInput(workflowRequest.inputText);
    const result = await confirmHostedWorkflowQuote({
      quoteId,
      idempotencyHash: hostedIdempotencyHash(config.rateLimitSecret, idempotencyKey),
      requestHash: hostedIdempotencyRequestHash({
        secret: config.rateLimitSecret,
        workflowType: workflowRequest.workflowType,
        inputSha256,
        task: workflowRequest.task,
        marketSymbol: workflowRequest.marketSymbol,
        budgetUsdc: workflowRequest.budgetUsdc,
      }),
      request: workflowRequest,
      transactionHash:
        typeof body.transactionHash === "string" ? body.transactionHash : null,
      signature: typeof body.signature === "string" ? body.signature : null,
    });

    if (!result.jobId) {
      if (result.reason === "credit_issued") {
        return NextResponse.json({
          jobId: null,
          userPaymentId: result.userPaymentId,
          creditIssued: true,
          error:
            "The payment settled, but the hosted workflow could not start. A workflow credit was issued for the full workflow price.",
        }, { status: 202 });
      }
      const status = result.reason === "active_job" || result.reason === "idempotency_conflict"
        ? 409
        : result.reason === "quote_expired" || result.reason === "sponsored_quota_exhausted"
          ? 409
          : 400;
      return NextResponse.json({
        error:
          result.reason === "sponsored_quota_exhausted"
            ? "Sponsored quota was used by another quote. Create a new paid quote."
            : result.reason === "quote_expired"
              ? "The immutable workflow quote expired. Create a new quote before paying."
              : "Workflow checkout could not be finalized.",
        reason: result.reason,
        retryAfterSeconds: result.retryAfterSeconds,
      }, { status });
    }

    const job = await getHostedAgentJob(result.jobId);
    if (job?.status === "queued") {
      after(async () => {
        try {
          await runHostedAgentJob(result.jobId!, workflowRequest.inputText);
        } catch (error) {
          console.error(
            `[hosted-checkout] background launch failed for job=${result.jobId}: ${safeHostedError(error)}`,
          );
        }
      });
    }

    return NextResponse.json({
      jobId: result.jobId,
      userPaymentId: result.userPaymentId,
      created: result.created,
      idempotent: result.reason === "idempotent",
      status: job?.status ?? "queued",
      statusUrl: `/api/hosted-agent/jobs/${result.jobId}`,
      hostedRunUrl: `/agent-runner/${result.jobId}`,
      workflowReceiptUrl: `/workflow-receipts/${result.jobId}`,
    }, { status: result.created ? 202 : 200 });
  } catch (error) {
    if (error instanceof HostedCheckoutPolicyError) {
      return NextResponse.json({ error: "Checkout idempotency conflict.", reason: error.reason }, { status: 409 });
    }
    const message = safeHostedError(error);
    console.error(`[hosted-checkout] confirmation failed: ${message}`);
    return NextResponse.json(
      { error: message.includes("transaction") ? message : "Unable to confirm hosted workflow checkout." },
      { status: message.includes("reverted") || message.includes("does not match") ? 402 : 400 },
    );
  }
}
