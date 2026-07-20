import { NextRequest, NextResponse } from "next/server";
import { bearerToken, verifyOwnerSession, BYOA_OWNER_SESSION_COOKIE } from "./auth.ts";
import { ByoaConfigAccessError } from "./config.ts";
import { authenticateAgentCredential, ByoaError, safeByoaError } from "./service.ts";
import type { ByoaScope } from "./types.ts";

export function requireOwnerSession(request: NextRequest) {
  const session = verifyOwnerSession(request.cookies.get(BYOA_OWNER_SESSION_COOKIE)?.value);
  if (!session) throw new ByoaError("A verified owner-wallet session is required.", "owner_session_required", 401);
  return session;
}

export function requireAgentCredential(request: NextRequest, scope: ByoaScope) {
  let token: string;
  try {
    token = bearerToken(request.headers.get("authorization"));
  } catch {
    throw new ByoaError("A BYOA Bearer credential is required.", "credential_required", 401);
  }
  return authenticateAgentCredential(token, scope);
}

export function byoaErrorResponse(error: unknown) {
  const known = error instanceof ByoaError || error instanceof ByoaConfigAccessError;
  const status = known ? error.status : 500;
  const reason = known ? error.reason : "internal_error";
  return NextResponse.json(
    { error: error instanceof ByoaConfigAccessError ? error.message : safeByoaError(error), reason },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

export async function jsonBody(request: Request) {
  try {
    const value = await request.json();
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error("object required");
    }
    return value as Record<string, unknown>;
  } catch {
    throw new ByoaError("Request body must be a JSON object.", "invalid_json");
  }
}
