import { NextRequest, NextResponse } from "next/server.js";
import { withGateway } from "../../../../../../lib/x402.ts";
import {
  getDynamicStoreServiceRowBySlug,
  rowToApiService,
} from "../../../../../../lib/services/store-service-persistence.ts";
import {
  executePreparedExternalSellerPayment,
  ExternalProxyError,
  prepareExternalSellerRequest,
  type PreparedExternalSellerResult,
} from "../../../../../../lib/seller/proxy.ts";
import { issueExternalFulfillmentCredit } from "../../../../../../lib/seller/recovery.ts";

type RouteContext = {
  params: Promise<{
    slug: string;
  }>;
};

async function invokeSellerService(
  req: NextRequest,
  { params }: RouteContext,
  method: "GET" | "POST",
) {
  const { slug } = await params;
  const row = await getDynamicStoreServiceRowBySlug(slug);

  if (!row) {
    return NextResponse.json({ error: "Service not found" }, { status: 404 });
  }

  if (row.source_type === "external_seller") {
    if (process.env.EXTERNAL_SELLER_FULFILLMENT_ENABLED !== "true") {
      return NextResponse.json(
        { error: "external_seller_fulfillment_disabled" },
        { status: 503 },
      );
    }
    if (row.status !== "live") {
      return NextResponse.json({ error: "service_not_live" }, { status: 403 });
    }
    const walletVerified =
      row.wallet_verification_status === "verified" ||
      (row.raw?.walletVerificationStatus as string) === "verified";
    const endpointVerified =
      row.endpoint_verification_status === "verified" ||
      (row.raw?.endpointVerificationStatus as string) === "verified";
    if (!walletVerified || !endpointVerified) {
      return NextResponse.json({ error: "service_not_verified" }, { status: 403 });
    }
  } else {
    if (row.status !== "live" && row.status !== "verifying") {
      return NextResponse.json(
        { error: "This seller-created service is not live or under verification." },
        { status: 403 },
      );
    }
    if (row.source_type !== "seller_mock") {
      return NextResponse.json(
        { error: "External fulfillment is not enabled in this MVP." },
        { status: 501 },
      );
    }
  }

  if (row.method !== method) {
    return NextResponse.json(
      { error: `Use ${row.method} for this service.` },
      {
        status: 405,
        headers: {
          Allow: row.method,
        },
      },
    );
  }

  const service = rowToApiService(row);
  let requestBody: unknown;
  if (service.sourceType === "external_seller" && method === "POST") {
    try {
      requestBody = await req.clone().json();
    } catch {
      try {
        requestBody = await req.clone().text();
      } catch {
        requestBody = undefined;
      }
    }
  }

  let preparedExternal: PreparedExternalSellerResult | null = null;
  if (service.sourceType === "external_seller") {
    try {
      preparedExternal = await prepareExternalSellerRequest({
        service,
        method,
        body: requestBody,
        headers: Object.fromEntries(req.headers.entries()),
      });
    } catch (error) {
      if (error instanceof ExternalProxyError) {
        return NextResponse.json({ error: error.message }, { status: error.statusCode });
      }
      const message = error instanceof Error ? error.message : String(error);
      return NextResponse.json({ error: `External seller preflight failed: ${message}` }, { status: 502 });
    }
  }

  const handler = async (_paidRequest: NextRequest) => {
    if (service.sourceType === "external_seller") {
      try {
        if (!preparedExternal) throw new ExternalProxyError("External seller request was not prepared.", 500);
        const proxyResult = preparedExternal.kind === "free-response"
          ? preparedExternal.result
          : await executePreparedExternalSellerPayment(preparedExternal);

        const responseHeaders: Record<string, string> = {
          "X-Agent-Commerce-Source": "external_seller",
        };
        if (proxyResult.paidAmountUsdc) {
          responseHeaders["X-Agent-Commerce-Paid-Usdc"] = proxyResult.paidAmountUsdc;
        }

        return NextResponse.json(proxyResult.data, {
          status: proxyResult.status,
          headers: responseHeaders,
        });
      } catch (err) {
        const paymentSignature = _paidRequest.headers.get("payment-signature");
        let creditIssued = false;
        if (service.isPaid && paymentSignature) {
          try {
            await issueExternalFulfillmentCredit({
              paymentSignature,
              serviceId: service.id,
              endpoint: service.endpoint,
              amountUsdc: service.priceUsd,
              reason: err instanceof Error ? err.message : "Downstream external seller fulfillment failed",
            });
            creditIssued = true;
          } catch (creditError) {
            const message = creditError instanceof Error ? creditError.message : "Credit persistence failed";
            console.error(`[external-seller] ${message}`);
            return NextResponse.json(
              { error: "Downstream fulfillment failed and recovery persistence requires operator attention." },
              { status: 500 },
            );
          }
        }
        if (err instanceof ExternalProxyError) {
          return NextResponse.json(
            { error: err.message, status: err.statusCode, creditIssued },
            { status: err.statusCode },
          );
        }
        const message = err instanceof Error ? err.message : String(err);
        return NextResponse.json(
          { error: `External seller execution error: ${message}`, status: 502, creditIssued },
          { status: 502 },
        );
      }
    }

    return NextResponse.json({
      service: {
        id: service.id,
        slug: service.slug,
        name: service.name,
        endpoint: service.endpoint,
        sourceType: service.sourceType,
      },
      data: service.exampleResponse,
      generated_at: new Date().toISOString(),
      source_type: service.sourceType,
    });
  };

  if (!service.isPaid) {
    return handler(req);
  }

  return withGateway(
    handler,
    `$${service.priceUsd}`,
    service.endpoint,
  )(req);
}

export function GET(req: NextRequest, context: RouteContext) {
  return invokeSellerService(req, context, "GET");
}

export function POST(req: NextRequest, context: RouteContext) {
  return invokeSellerService(req, context, "POST");
}
