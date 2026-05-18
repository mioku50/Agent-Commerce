import { NextRequest, NextResponse } from "next/server";
import { withGateway } from "@/lib/x402";
import {
  getDynamicStoreServiceRowBySlug,
  rowToApiService,
} from "@/lib/services/store-service-persistence";

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

  if (row.status !== "live") {
    return NextResponse.json(
      { error: "This seller-created service is not live." },
      { status: 403 },
    );
  }

  if (row.source_type !== "seller_mock") {
    return NextResponse.json(
      { error: "External fulfillment is not enabled in this MVP." },
      { status: 501 },
    );
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
  const handler = async (_paidRequest: NextRequest) => NextResponse.json({
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
