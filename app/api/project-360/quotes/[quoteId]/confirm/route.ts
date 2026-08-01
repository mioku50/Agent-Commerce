import { after, NextRequest, NextResponse } from "next/server";
import { jsonBody, requireOwnerSession } from "@/lib/byoa/http";
import {
  PROJECT_360_MAX_BUDGET_USDC,
  validateIdempotencyKey,
} from "@/lib/agent/hosted-policy";
import { getHostedAgentJob, runHostedAgentJob } from "@/lib/agent/hosted-jobs";
import { validateHostedWorkflowRequest } from "@/lib/agent/hosted-workflows";
import { confirmHostedWorkflowQuote } from "@/lib/commerce/workflow-checkout";
import { project360ErrorResponse } from "@/lib/project-360/http";
import {
  project360IdempotencyHash,
  requireBrowserProject360Quote,
} from "@/lib/project-360/service";

type RouteContext = { params: Promise<{ quoteId: string }> };

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(request: NextRequest, { params }: RouteContext) {
  try {
    const owner = requireOwnerSession(request);
    const body = await jsonBody(request);
    const { quoteId } = await params;
    if (!/^[0-9a-f-]{36}$/i.test(quoteId)) {
      return NextResponse.json(
        { error: { code: "quote_not_found", message: "Project 360 quote was not found.", retryable: false } },
        { status: 404 },
      );
    }
    const idempotencyKey = validateIdempotencyKey(
      request.headers.get("idempotency-key"),
    );
    const stored = await requireBrowserProject360Quote({
      quoteId,
      ownerWallet: owner.wallet,
    });
    const idempotencyHash = project360IdempotencyHash({
      tenant: owner.wallet,
      idempotencyKey,
      purpose: "quote",
    });
    const result = await confirmHostedWorkflowQuote({
      quoteId,
      idempotencyHash,
      requestHash: stored.quote.request_hash,
      request: validateProjectRequest(stored.canonicalInput),
      transactionHash: typeof body.transactionHash === "string" ? body.transactionHash : null,
      signature: typeof body.signature === "string" ? body.signature : null,
    });
    if (!result.jobId) {
      return NextResponse.json(
        {
          error: {
            code: result.reason,
            message: result.reason === "credit_issued"
              ? "Payment settled, but execution could not start. A full workflow credit was issued."
              : "Project 360 checkout could not be finalized.",
            retryable: false,
          },
          userPaymentId: result.userPaymentId,
        },
        { status: result.reason === "credit_issued" ? 202 : 409 },
      );
    }
    const job = await getHostedAgentJob(result.jobId);
    if (job?.status === "queued") {
      after(async () => {
        try {
          await runHostedAgentJob(result.jobId!, stored.canonicalInput);
        } catch {
          // Job state and a sanitized failure are persisted by the hosted runner.
        }
      });
    }
    return NextResponse.json(
      {
        jobId: result.jobId,
        userPaymentId: result.userPaymentId,
        created: result.created,
        idempotent: result.reason === "idempotent",
        status: job?.status ?? "queued",
        statusUrl: `/api/hosted-agent/jobs/${result.jobId}`,
        reportUrl: `/agent-runner/${result.jobId}`,
        workflowReceiptUrl: `/workflow-receipts/${result.jobId}`,
      },
      { status: result.created ? 202 : 200 },
    );
  } catch (error) {
    return project360ErrorResponse(error);
  }
}

function validateProjectRequest(canonicalInput: string) {
  return validateHostedWorkflowRequest({
    workflowType: "project_360",
    inputText: canonicalInput,
    budgetUsdc: PROJECT_360_MAX_BUDGET_USDC,
  });
}
