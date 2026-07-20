import { NextRequest, NextResponse } from "next/server";
import { verifyMessage, type Hex } from "viem";
import {
  BYOA_OWNER_SESSION_COOKIE,
  createOwnerSession,
  verifyOwnerSession,
} from "@/lib/byoa/auth";
import { requireAllowedOrigin } from "@/lib/byoa/config";
import { byoaErrorResponse, jsonBody } from "@/lib/byoa/http";
import {
  ByoaError,
  consumeWalletChallenge,
  getWalletChallenge,
} from "@/lib/byoa/service";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const session = verifyOwnerSession(request.cookies.get(BYOA_OWNER_SESSION_COOKIE)?.value);
    return NextResponse.json(
      { authenticated: Boolean(session), ownerWallet: session?.wallet ?? null, expiresAt: session ? new Date(session.exp * 1_000).toISOString() : null },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return byoaErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const origin = requireAllowedOrigin(request.url, request.headers.get("origin"));
    const body = await jsonBody(request);
    if (typeof body.challengeId !== "string" || typeof body.message !== "string" || typeof body.signature !== "string") {
      throw new ByoaError("Challenge ID, message, and signature are required.", "invalid_signature");
    }
    const row = await getWalletChallenge(body.challengeId);
    if (row.action !== "owner_session" || row.origin !== origin || row.agent_id !== null) {
      throw new ByoaError("Wallet challenge cannot create an owner session.", "challenge_mismatch", 401);
    }
    if (!/^0x[0-9a-f]+$/i.test(body.signature)) {
      throw new ByoaError("Wallet signature is invalid.", "invalid_signature", 401);
    }
    const valid = await verifyMessage({
      address: row.wallet as `0x${string}`,
      message: body.message,
      signature: body.signature as Hex,
    });
    if (!valid) throw new ByoaError("Owner wallet signature is invalid.", "invalid_signature", 401);
    await consumeWalletChallenge({ row, message: body.message, origin });
    const session = createOwnerSession(row.wallet as `0x${string}`);
    const response = NextResponse.json({ authenticated: true, ownerWallet: session.payload.wallet });
    response.cookies.set(BYOA_OWNER_SESSION_COOKIE, session.value, {
      httpOnly: true,
      sameSite: "strict",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: session.payload.exp - session.payload.iat,
    });
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (error) {
    return byoaErrorResponse(error);
  }
}

export async function DELETE() {
  const response = NextResponse.json({ authenticated: false });
  response.cookies.set(BYOA_OWNER_SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
  return response;
}
