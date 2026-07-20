import { NextResponse } from "next/server.js";
import { timingSafeEqual } from "node:crypto";
import {
  COOKIE_NAME,
  issueSellerSession,
  sellerSessionCookieOptions,
} from "../../../../lib/seller/session.ts";
import { consumeSellerLoginAttempt } from "../../../../lib/seller/auth-rate-limit.ts";

function passwordMatches(actual: string, expected: string) {
  const actualBytes = Buffer.from(actual, "utf8");
  const expectedBytes = Buffer.from(expected, "utf8");
  if (actualBytes.length !== expectedBytes.length) return false;
  return timingSafeEqual(actualBytes, expectedBytes);
}

export async function POST(request: Request): Promise<NextResponse> {
  let body: { password?: unknown } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const expectedPassword = process.env.SELLER_AUTH_PASSWORD;
  if (!expectedPassword) {
    return NextResponse.json({ error: "Seller authentication is not configured" }, { status: 503 });
  }

  const validPassword =
    typeof body.password === "string" && passwordMatches(body.password, expectedPassword);

  let attempt;
  try {
    attempt = await consumeSellerLoginAttempt(request, validPassword);
  } catch {
    return NextResponse.json({ error: "Seller authentication is temporarily unavailable" }, { status: 503 });
  }

  if (attempt.locked) {
    return NextResponse.json(
      { error: "Too many failed attempts. Try again later." },
      {
        status: 429,
        headers: { "Retry-After": String(attempt.retryAfterSeconds) },
      },
    );
  }
  if (!attempt.allowed || !validPassword) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const token = issueSellerSession();
    const response = NextResponse.json({ ok: true });
    response.cookies.set(COOKIE_NAME, token, sellerSessionCookieOptions);
    return response;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to issue session";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(): Promise<NextResponse> {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(COOKIE_NAME, "", {
    ...sellerSessionCookieOptions,
    maxAge: 0,
    expires: new Date(0),
  });
  return response;
}
