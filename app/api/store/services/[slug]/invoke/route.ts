import { NextRequest, NextResponse } from "next/server";
import { withGateway } from "@/lib/x402";
import {
  getDynamicStoreServiceRowBySlug,
  rowToApiService,
} from "@/lib/services/store-service-persistence";
import {
  executeExternalSellerProxy,
  ExternalProxyError,
} from "@/lib/seller/proxy";

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
  const row = await getDynamicStoreServiceRowBySlug(slug, { publicOnly: false });

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
  const handler = async (_paidRequest: NextRequest) => {
    if (service.sourceType === "external_seller") {
      let body: unknown;
      if (method === "POST") {
        try {
          body = await _paidRequest.clone().json();
        } catch {
          try {
            body = await _paidRequest.clone().text();
          } catch {}
        }
      }

      try {
        const proxyResult = await executeExternalSellerProxy({
          service,
          method,
          body,
          headers: Object.fromEntries(_paidRequest.headers.entries()),
        });

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
        if (err instanceof ExternalProxyError) {
          return NextResponse.json(
            { error: err.message, status: err.statusCode },
            { status: err.statusCode },
          );
        }
        const message = err instanceof Error ? err.message : String(err);
        return NextResponse.json(
          { error: `External seller execution error: ${message}`, status: 502 },
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
