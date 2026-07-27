import { NextRequest, NextResponse } from "next/server";
import { optionalRequesterWallet, hostedRequesterFingerprint, validateIdempotencyKey, safeHostedError, getHostedRunnerConfig } from "@/lib/agent/hosted-policy";
import { getSellerServiceRowByPublicId } from "@/lib/seller/marketplace";
import { createSellerWorkflowQuote } from "@/lib/seller/workflow";
import { HostedCheckoutPolicyError, sponsoredWorkflowAuthorizationMessage } from "@/lib/commerce/workflow-checkout";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as Record<string, unknown>;
    const requesterWallet = optionalRequesterWallet(body.requesterWallet);
    if (!requesterWallet) {
      return NextResponse.json({ error: "Connect a requester wallet before creating a workflow quote." }, { status: 400 });
    }
    if (typeof body.serviceId !== "string") {
      return NextResponse.json({ error: "Seller workflow was not found." }, { status: 404 });
    }
    const service = await getSellerServiceRowByPublicId(body.serviceId);
    if (!service || service.status !== "active") {
      return NextResponse.json({ error: "Seller workflow was not found." }, { status: 404 });
    }
    const idempotencyKey = validateIdempotencyKey(request.headers.get("idempotency-key"));
    const config = getHostedRunnerConfig();
    const result = await createSellerWorkflowQuote({
      service,
      payload: body.input,
      idempotencyKey,
      requesterFingerprint: hostedRequesterFingerprint({
        secret: config.rateLimitSecret,
        forwardedFor: request.headers.get("x-forwarded-for"),
        userAgent: request.headers.get("user-agent"),
      }),
      requesterWallet,
    });
    return NextResponse.json({
      quote: result.quote,
      created: result.created,
      sponsoredAuthorizationMessage: result.quote.paymentMode === "sponsored"
        ? sponsoredWorkflowAuthorizationMessage(result.quote)
        : null,
    }, {
      status: result.created ? 201 : 200,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (error instanceof HostedCheckoutPolicyError) {
      return NextResponse.json({
        error: error.reason === "idempotency_conflict"
          ? "This Idempotency-Key is already bound to different input."
          : "Seller workflow checkout is temporarily limited.",
        reason: error.reason,
        retryAfterSeconds: error.retryAfterSeconds,
      }, { status: error.reason === "idempotency_conflict" ? 409 : 429 });
    }
    return NextResponse.json(
      { error: safeHostedError(error) },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }
}
