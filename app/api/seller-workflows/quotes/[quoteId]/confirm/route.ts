import { after, NextRequest, NextResponse } from "next/server";
import { safeHostedError, validateIdempotencyKey } from "@/lib/agent/hosted-policy";
import { getHostedAgentJob } from "@/lib/agent/hosted-jobs";
import { confirmHostedWorkflowQuoteInput, getHostedWorkflowQuote, HostedCheckoutPolicyError } from "@/lib/commerce/workflow-checkout";
import { canonicalSellerInput, getSellerServiceRowById } from "@/lib/seller/marketplace";
import { runSellerAgentJob, sellerQuoteRequestHash } from "@/lib/seller/workflow";

type RouteContext = { params: Promise<{ quoteId: string }> };

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(request: NextRequest, { params }: RouteContext) {
  const { quoteId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(quoteId)) {
    return NextResponse.json({ error: "Seller workflow quote was not found." }, { status: 404 });
  }
  try {
    const body = await request.json() as Record<string, unknown>;
    const quote = await getHostedWorkflowQuote(quoteId);
    if (!quote?.seller_service_id || !quote.seller_service_version) {
      return NextResponse.json({ error: "Seller workflow quote was not found." }, { status: 404 });
    }
    const service = await getSellerServiceRowById(quote.seller_service_id);
    if (!service || quote.seller_id !== service.seller_id) {
      return NextResponse.json({ error: "Seller workflow quote was not found." }, { status: 404 });
    }
    validateIdempotencyKey(request.headers.get("idempotency-key"));
    const inputText = canonicalSellerInput(body.input);
    const expectedRequestHash = sellerQuoteRequestHash({
      workflowType: quote.workflow_type,
      payload: body.input,
      serviceId: service.id,
      serviceVersion: quote.seller_service_version,
      priceUsdc: quote.estimated_provider_cost_usdc,
    });
    if (expectedRequestHash !== quote.request_hash) {
      return NextResponse.json({ error: "Seller workflow quote was not found." }, { status: 404 });
    }
    const result = await confirmHostedWorkflowQuoteInput({
      quoteId,
      idempotencyHash: quote.idempotency_hash,
      requestHash: quote.request_hash,
      inputText,
      transactionHash: typeof body.transactionHash === "string" ? body.transactionHash : null,
      signature: typeof body.signature === "string" ? body.signature : null,
    });
    if (!result.jobId) {
      return NextResponse.json({
        error: result.reason === "credit_issued"
          ? "Payment was converted into a workflow credit."
          : "Seller workflow checkout could not be finalized.",
        reason: result.reason,
        creditIssued: result.reason === "credit_issued",
      }, { status: result.reason === "credit_issued" ? 202 : 409 });
    }
    const job = await getHostedAgentJob(result.jobId);
    if (job?.status === "queued") {
      after(async () => {
        try {
          await runSellerAgentJob(result.jobId!, body.input);
        } catch (error) {
          console.error(`[seller-workflow] background launch failed for job=${result.jobId}: ${safeHostedError(error)}`);
        }
      });
    }
    return NextResponse.json({
      jobId: result.jobId,
      created: result.created,
      idempotent: result.reason === "idempotent",
      status: job?.status ?? "queued",
      statusUrl: `/api/hosted-agent/jobs/${result.jobId}`,
      hostedRunUrl: `/agent-runner/${result.jobId}`,
      workflowReceiptUrl: `/workflow-receipts/${result.jobId}`,
    }, { status: result.created ? 202 : 200, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof HostedCheckoutPolicyError) {
      return NextResponse.json({ error: "Checkout idempotency conflict.", reason: error.reason }, { status: 409 });
    }
    const message = safeHostedError(error);
    return NextResponse.json(
      { error: /payment|transaction|reverted/i.test(message) ? message : "Unable to confirm seller workflow checkout." },
      { status: /payment|transaction|reverted/i.test(message) ? 402 : 400 },
    );
  }
}
