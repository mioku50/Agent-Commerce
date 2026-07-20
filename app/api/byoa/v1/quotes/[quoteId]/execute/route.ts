import { after, NextRequest, NextResponse } from "next/server";
import { runHostedAgentJob } from "@/lib/agent/hosted-jobs";
import { byoaErrorResponse, jsonBody, requireAgentCredential } from "@/lib/byoa/http";
import {
  ByoaError,
  assertHostedExecutionSlotAvailable,
  claimQuoteSettlement,
  consumeSettledQuote,
  findAggregatePaymentEvent,
  getQuoteForAgent,
  maybeFindAggregatePaymentEvent,
  releaseQuoteSettlement,
  validateQuoteRuntimeConfiguration,
  validateQuoteExecutionRequest,
} from "@/lib/byoa/service";
import { withGateway } from "@/lib/x402";

type Context = { params: Promise<{ quoteId: string }> };
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function launchPayload(input: {
  jobId: string | null;
  paymentId: string | null;
  created: boolean;
  reason: string;
}) {
  return {
    jobId: input.jobId,
    aggregatePaymentId: input.paymentId,
    created: input.created,
    idempotent: input.reason === "idempotent",
    creditIssued: input.reason === "credit_issued",
    statusUrl: input.jobId ? `/api/byoa/v1/results/${input.jobId}` : null,
    passportNote: "The registered-agent Passport is updated after downstream execution completes.",
  };
}

function schedule(jobId: string | null, inputText: string) {
  if (!jobId) return;
  after(async () => {
    try {
      await runHostedAgentJob(jobId, inputText);
    } catch (error) {
      console.error(
        `[byoa] background workflow launch failed job=${jobId}: ${error instanceof Error ? error.message : "unknown error"}`,
      );
    }
  });
}

export async function POST(request: NextRequest, { params }: Context) {
  let claimToken: string | null = null;
  let quoteId = "";
  let claimedQuote: Awaited<ReturnType<typeof getQuoteForAgent>> | null = null;
  try {
    const auth = await requireAgentCredential(request, "workflows:execute");
    quoteId = (await params).quoteId;
    const quote = await getQuoteForAgent(auth.agent.id, quoteId);
    const body = await jsonBody(request.clone());
    const workflowRequest = validateQuoteExecutionRequest({
      auth,
      quote,
      idempotencyKey: request.headers.get("idempotency-key") ?? "",
      requestBody: body,
    });
    validateQuoteRuntimeConfiguration(quote);

    if (quote.job_id) {
      schedule(quote.job_id, workflowRequest.inputText);
      return NextResponse.json(
        launchPayload({ jobId: quote.job_id, paymentId: null, created: false, reason: "idempotent" }),
        { headers: { "Cache-Control": "no-store" } },
      );
    }
    if (["expired", "failed", "credited", "cancelled"].includes(quote.status)) {
      throw new ByoaError(`Quote cannot execute in ${quote.status} state.`, quote.status, 409);
    }

    // If settlement succeeded but the response/persistence edge failed, consume
    // the already-recorded payment before ever asking the agent to pay again.
    if (quote.status === "settling" && quote.settle_claim_token) {
      const existingEvent = await maybeFindAggregatePaymentEvent(quote);
      if (existingEvent) {
        const recovered = await consumeSettledQuote({
          quote,
          claimToken: quote.settle_claim_token,
          paymentEventId: existingEvent.id,
        });
        schedule(recovered.jobId, workflowRequest.inputText);
        return NextResponse.json(launchPayload(recovered), {
          status: recovered.created ? 202 : 200,
          headers: { "Cache-Control": "no-store", "X-BYOA-Settlement-Recovered": "true" },
        });
      }
    }

    await assertHostedExecutionSlotAvailable();

    if (!request.headers.get("payment-signature")) {
      const paymentRequired = withGateway(
        async () => NextResponse.json({ error: "Payment signature was required." }, { status: 402 }),
        `$${Number(quote.price_usdc).toFixed(6)}`,
        quote.resource_path,
      );
      return paymentRequired(request);
    }

    const claim = await claimQuoteSettlement(auth, quote.id);
    if (claim.reason === "idempotent" && claim.jobId) {
      schedule(claim.jobId, workflowRequest.inputText);
      return NextResponse.json(
        launchPayload({ jobId: claim.jobId, paymentId: null, created: false, reason: "idempotent" }),
        { headers: { "Cache-Control": "no-store" } },
      );
    }
    if (claim.reason !== "claimed" || !claim.claimToken) {
      throw new ByoaError(`Quote settlement is unavailable: ${claim.reason}.`, claim.reason, 409);
    }
    claimToken = claim.claimToken;
    claimedQuote = claim.quote;
    validateQuoteRuntimeConfiguration(claim.quote);

    const paidHandler = async () => {
      const paymentEvent = await findAggregatePaymentEvent(claim.quote);
      const settled = await consumeSettledQuote({
        quote: claim.quote,
        claimToken: claim.claimToken!,
        paymentEventId: paymentEvent.id,
      });
      schedule(settled.jobId, workflowRequest.inputText);
      return NextResponse.json(launchPayload(settled), {
        status: settled.created ? 202 : 200,
        headers: { "Cache-Control": "no-store" },
      });
    };
    const paidRoute = withGateway(
      paidHandler,
      `$${Number(claim.quote.price_usdc).toFixed(6)}`,
      claim.quote.resource_path,
    );
    const response = await paidRoute(request);
    if (!response.headers.has("payment-response") && response.status >= 400) {
      const settledEvent = await maybeFindAggregatePaymentEvent(claim.quote);
      if (!settledEvent) {
        await releaseQuoteSettlement(claim.quote.id, claim.claimToken);
        claimToken = null;
      }
    }
    return response;
  } catch (error) {
    if (claimToken && quoteId) {
      const settledEvent = claimedQuote
        ? await maybeFindAggregatePaymentEvent(claimedQuote).catch(() => undefined)
        : undefined;
      if (!settledEvent) {
        await releaseQuoteSettlement(quoteId, claimToken).catch(() => false);
      }
    }
    return byoaErrorResponse(error);
  }
}
