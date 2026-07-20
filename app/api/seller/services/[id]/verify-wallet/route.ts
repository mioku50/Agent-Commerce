import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server.js";
import { verifyMessage } from "viem";
import { requireSellerAuth } from "../../../../../../lib/seller/session.ts";
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

  let body: { signature?: unknown } = {};
  try {
    const text = await request.text();
    if (text && text.trim().length > 0) {
      body = JSON.parse(text);
    }
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.signature || typeof body.signature !== "string") {
    const nonce = randomBytes(32).toString("hex");
    try {
      await updateVerificationStatus(id, { walletVerificationChallenge: nonce });
      return NextResponse.json({ nonce });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to store challenge";
      return NextResponse.json({ error: msg }, { status: 500 });
    }
  }

  if (!service.sellerWallet) {
    return NextResponse.json({ error: "Service has no registered sellerWallet configured" }, { status: 400 });
  }

  if (!service.walletVerificationChallenge) {
    return NextResponse.json({ error: "No verification challenge active. Generate a challenge first." }, { status: 400 });
  }

  const message = `arc-agent-commerce-verify-wallet:${service.walletVerificationChallenge}:${id}`;
  let isValid = false;
  try {
    isValid = await verifyMessage({
      address: service.sellerWallet as `0x${string}`,
      message,
      signature: body.signature as `0x${string}`,
    });
  } catch {
    isValid = false;
  }

  if (!isValid) {
    await updateVerificationStatus(id, { walletVerificationStatus: "failed" }).catch(() => {});
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  try {
    const bothVerified = service.endpointVerificationStatus === "verified";
    await updateVerificationStatus(id, {
      walletVerificationStatus: "verified",
      walletVerificationChallenge: null,
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
