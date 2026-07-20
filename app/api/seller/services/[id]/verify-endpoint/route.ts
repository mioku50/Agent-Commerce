import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server.js";
import { requireSellerAuth } from "../../../../../../lib/seller/session.ts";
import { fetchWithSsrfProtection } from "../../../../../../lib/seller/ssrf.ts";
import {
  getDynamicStoreServiceRowById,
  rowToSellerService,
  updateVerificationStatus,
} from "../../../../../../lib/services/store-service-persistence.ts";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

const ENDPOINT_CHALLENGE_TTL_MS = 10 * 60 * 1000;

async function persistEndpointFailure(id: string) {
  await updateVerificationStatus(id, { endpointVerificationStatus: "failed" });
}

export async function POST(request: Request, { params }: RouteContext): Promise<NextResponse> {
  const authReject = requireSellerAuth(request);
  if (authReject) return authReject as NextResponse;

  const { id } = await params;
  const row = await getDynamicStoreServiceRowById(id);
  if (!row) {
    return NextResponse.json({ error: "Service not found" }, { status: 404 });
  }

  const service = rowToSellerService(row);
  if (service.sourceType !== "external_seller") {
    return NextResponse.json({ error: "Service is not an external_seller" }, { status: 400 });
  }

  if (!service.fulfillmentUrl) {
    return NextResponse.json({ error: "Service has no fulfillmentUrl configured" }, { status: 400 });
  }

  let body: { confirm?: unknown } = {};
  try {
    const text = await request.text();
    if (text && text.trim().length > 0) {
      body = JSON.parse(text);
    }
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const fulfillmentUrl = new URL(service.fulfillmentUrl).toString();
  const wellKnownUrl = new URL(
    "/.well-known/arc-agent-commerce-seller.json",
    new URL(service.fulfillmentUrl).origin,
  ).toString();

  if (!body.confirm || body.confirm !== true) {
    const nonce = randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + ENDPOINT_CHALLENGE_TTL_MS).toISOString();
    try {
      await updateVerificationStatus(id, {
        endpointVerificationNonce: nonce,
        endpointVerificationExpiresAt: expiresAt,
      });
      return NextResponse.json({
        nonce,
        expiresAt,
        wellKnownUrl,
        requiredPayload: {
          serviceId: id,
          nonce,
          fulfillmentUrl,
          sellerWallet: service.sellerWallet,
          expiresAt,
        },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to store nonce";
      return NextResponse.json({ error: msg }, { status: 500 });
    }
  }

  if (!service.endpointVerificationNonce || !service.endpointVerificationExpiresAt) {
    return NextResponse.json({ error: "No endpoint verification nonce active. Generate a nonce first." }, { status: 400 });
  }

  const expectedExpiry = Date.parse(service.endpointVerificationExpiresAt);
  if (!Number.isFinite(expectedExpiry) || expectedExpiry <= Date.now()) {
    try {
      await persistEndpointFailure(id);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to persist endpoint verification failure";
      return NextResponse.json({ error: msg }, { status: 500 });
    }
    return NextResponse.json({ error: "Endpoint verification challenge expired" }, { status: 400 });
  }

  let resp: Response;
  try {
    resp = await fetchWithSsrfProtection(
      wellKnownUrl,
      {
        method: "GET",
        headers: { Accept: "application/json" },
      },
      {
        maxTimeoutMs: 5000,
        maxResponseSizeBytes: 65536,
      },
    );
  } catch (err) {
    try {
      await persistEndpointFailure(id);
    } catch (persistenceError) {
      const msg = persistenceError instanceof Error ? persistenceError.message : "Failed to persist endpoint verification failure";
      return NextResponse.json({ error: msg }, { status: 500 });
    }
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Failed to fetch well-known endpoint: ${msg}` }, { status: 400 });
  }

  if (!resp.ok) {
    try {
      await persistEndpointFailure(id);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to persist endpoint verification failure";
      return NextResponse.json({ error: msg }, { status: 500 });
    }
    return NextResponse.json({ error: `Well-known endpoint returned HTTP ${resp.status}` }, { status: 400 });
  }

  let data: {
    serviceId?: unknown;
    nonce?: unknown;
    fulfillmentUrl?: unknown;
    sellerWallet?: unknown;
    expiresAt?: unknown;
  } | null = null;
  try {
    const text = await resp.text();
    data = JSON.parse(text);
  } catch {
    try {
      await persistEndpointFailure(id);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to persist endpoint verification failure";
      return NextResponse.json({ error: msg }, { status: 500 });
    }
    return NextResponse.json({ error: "Well-known endpoint did not return valid JSON" }, { status: 400 });
  }

  const payloadMatches = Boolean(
    data &&
    data.serviceId === id &&
    data.nonce === service.endpointVerificationNonce &&
    data.fulfillmentUrl === fulfillmentUrl &&
    typeof data.sellerWallet === "string" &&
    typeof service.sellerWallet === "string" &&
    data.sellerWallet.toLowerCase() === service.sellerWallet.toLowerCase() &&
    typeof data.expiresAt === "string" &&
    Date.parse(data.expiresAt) === expectedExpiry,
  );
  if (!payloadMatches) {
    try {
      await persistEndpointFailure(id);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to persist endpoint verification failure";
      return NextResponse.json({ error: msg }, { status: 500 });
    }
    return NextResponse.json(
      { error: "Well-known JSON verification mismatch" },
      { status: 400 },
    );
  }

  try {
    const bothVerified = service.walletVerificationStatus === "verified";
    await updateVerificationStatus(id, {
      endpointVerificationStatus: "verified",
      endpointVerificationNonce: null,
      endpointVerificationExpiresAt: null,
      ...(bothVerified ? { status: "live" } : {}),
    });
    return NextResponse.json({
      ok: true,
      status: bothVerified ? "live" : service.status,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to update verification status";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
