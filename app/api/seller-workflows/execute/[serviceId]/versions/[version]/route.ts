import { NextRequest, NextResponse } from "next/server";
import { getHostedWorkflowQuote } from "@/lib/commerce/workflow-checkout";
import { issueExternalFulfillmentCredit } from "@/lib/seller/recovery";
import { decryptSellerEndpointSecret } from "@/lib/seller/endpoint-secret";
import {
  canonicalSellerInput,
  getSellerAccountById,
  getSellerServiceRowByPublicId,
  getSellerServiceVersion,
  safeSellerResult,
  validateSellerWorkflowInput,
  validateSellerWorkflowOutput,
} from "@/lib/seller/marketplace";
import {
  executeExternalSellerProxy,
  ExternalProxyError,
} from "@/lib/seller/proxy";
import type { ApiService } from "@/lib/services/registry";
import { hostedWorkflowInputMetadata } from "@/lib/agent/hosted-workflows";
import { withGateway } from "@/lib/x402";

type RouteContext = {
  params: Promise<{ serviceId: string; version: string }>;
};

function externalVersionService(input: {
  publicId: string;
  serviceVersion: number;
  name: string;
  description: string;
  category: string;
  method: "GET" | "POST";
  priceUsdc: string | number;
  inputSchema: unknown;
  outputSchema: unknown;
  fulfillmentUrl: string;
  sellerWallet: string;
  timeoutMs: number;
  maxResponseSizeBytes: number;
}): ApiService {
  const price = Number(input.priceUsdc);
  return {
    id: input.publicId,
    slug: input.publicId,
    name: input.name,
    shortDescription: input.description,
    longDescription: input.description,
    category: input.category,
    method: input.method,
    endpoint: `/api/seller-workflows/execute/${input.publicId}/versions/${input.serviceVersion}`,
    priceLabel: `${price.toFixed(6).replace(/\.?0+$/, "")} USDC`,
    priceUsd: price,
    status: "live",
    sourceType: "external_seller",
    isPaid: true,
    inputSchema: input.inputSchema,
    outputSchema: input.outputSchema,
    exampleRequest: {},
    exampleResponse: {},
    exampleUseCase: input.description,
    agentReasoningHint: "Execute the immutable external seller service version.",
    fulfillmentUrl: input.fulfillmentUrl,
    sellerWallet: input.sellerWallet,
    expectedNetwork: "eip155:5042002",
    expectedAsset: "0x3600000000000000000000000000000000000000",
    maxTimeoutMs: input.timeoutMs,
    maxResponseSizeBytes: input.maxResponseSizeBytes,
    walletVerificationStatus: "verified",
    endpointVerificationStatus: "verified",
  };
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  if (process.env.EXTERNAL_SELLER_FULFILLMENT_ENABLED !== "true") {
    return NextResponse.json({ error: "external_seller_fulfillment_disabled" }, { status: 503 });
  }

  const { serviceId, version: rawVersion } = await params;
  const serviceVersion = Number(rawVersion);
  if (!/^svc_[a-f0-9]{20}$/.test(serviceId) || !Number.isInteger(serviceVersion) || serviceVersion < 1) {
    return NextResponse.json({ error: "seller_workflow_not_found" }, { status: 404 });
  }

  let body: { quoteId?: unknown; jobId?: unknown; input?: unknown };
  try {
    body = await request.clone().json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  if (typeof body.quoteId !== "string" || typeof body.jobId !== "string") {
    return NextResponse.json({ error: "seller_workflow_not_found" }, { status: 404 });
  }

  try {
    const [service, quote] = await Promise.all([
      getSellerServiceRowByPublicId(serviceId),
      getHostedWorkflowQuote(body.quoteId),
    ]);
    if (
      !service || !quote || quote.job_id !== body.jobId ||
      quote.seller_service_id !== service.id ||
      Number(quote.seller_service_version) !== serviceVersion ||
      quote.seller_id !== service.seller_id ||
      !["consumed", "completed"].includes(quote.status)
    ) {
      return NextResponse.json({ error: "seller_workflow_not_found" }, { status: 404 });
    }
    if (service.status !== "active" || service.archived_at) {
      return NextResponse.json({ error: "seller_service_unavailable" }, { status: 409 });
    }
    const immutableVersion = await getSellerServiceVersion(service.id, serviceVersion);
    const seller = await getSellerAccountById(service.seller_id);
    if (!immutableVersion) {
      return NextResponse.json({ error: "seller_service_version_mismatch" }, { status: 409 });
    }
    if (seller?.status !== "active") {
      return NextResponse.json({ error: "seller_service_unavailable" }, { status: 409 });
    }
    validateSellerWorkflowInput(body.input, immutableVersion.input_schema);
    const canonicalInput = canonicalSellerInput(body.input);
    if (hostedWorkflowInputMetadata(canonicalInput).sha256 !== quote.input_hash) {
      return NextResponse.json({ error: "seller_workflow_not_found" }, { status: 404 });
    }

    const serviceSnapshot = externalVersionService({
      publicId: service.public_id,
      serviceVersion,
      name: immutableVersion.name,
      description: immutableVersion.short_description,
      category: immutableVersion.category,
      method: immutableVersion.method,
      priceUsdc: immutableVersion.price_usdc,
      inputSchema: immutableVersion.input_schema,
      outputSchema: immutableVersion.output_schema,
      fulfillmentUrl: immutableVersion.fulfillment_url,
      sellerWallet: service.seller_wallet,
      timeoutMs: immutableVersion.max_timeout_ms,
      maxResponseSizeBytes: immutableVersion.max_response_size_bytes,
    });
    const trustedAuthorization = immutableVersion.endpoint_auth_ciphertext
      ? `Bearer ${decryptSellerEndpointSecret(immutableVersion.endpoint_auth_ciphertext)}`
      : undefined;

    const handler = async (paidRequest: NextRequest) => {
      try {
        const result = await executeExternalSellerProxy({
          service: serviceSnapshot,
          method: immutableVersion.method,
          body: immutableVersion.method === "POST" ? body.input : undefined,
          trustedAuthorization,
        });
        validateSellerWorkflowOutput(result.data, immutableVersion.output_schema);
        return NextResponse.json(safeSellerResult(result.data), {
          status: 200,
          headers: {
            "Cache-Control": "no-store",
            "X-Agent-Commerce-Source": "external_seller",
            "X-Agent-Commerce-Service-Version": String(serviceVersion),
          },
        });
      } catch (error) {
        let creditIssued = false;
        const paymentSignature = paidRequest.headers.get("payment-signature");
        if (paymentSignature) {
          try {
            await issueExternalFulfillmentCredit({
              paymentSignature,
              serviceId: service.public_id,
              endpoint: serviceSnapshot.endpoint,
              amountUsdc: Number(immutableVersion.price_usdc),
              reason: error instanceof Error ? error.message : "External seller execution failed",
            });
            creditIssued = true;
          } catch {
            return NextResponse.json(
              { error: "seller_recovery_persistence_failed" },
              { status: 500, headers: { "Cache-Control": "no-store" } },
            );
          }
        }
        const status = error instanceof ExternalProxyError ? error.statusCode : 502;
        return NextResponse.json(
          { error: "seller_execution_failed", retryable: status >= 500, creditIssued },
          { status, headers: { "Cache-Control": "no-store" } },
        );
      }
    };

    return withGateway(
      handler,
      `$${Number(immutableVersion.price_usdc)}`,
      serviceSnapshot.endpoint,
    )(request);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Seller workflow validation failed.";
    const status = /input|schema/i.test(message) ? 400 : 503;
    return NextResponse.json(
      { error: status === 400 ? message : "seller_workflow_unavailable" },
      { status, headers: { "Cache-Control": "no-store" } },
    );
  }
}
