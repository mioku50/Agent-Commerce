import { NextResponse } from "next/server";
import { COOKIE_NAME, issueSellerSession } from "@/lib/seller/session";

export async function POST(request: Request): Promise<NextResponse> {
  let body: { password?: unknown } = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const expectedPassword = process.env.SELLER_AUTH_PASSWORD?.trim();
  if (!expectedPassword || typeof body.password !== "string" || body.password !== expectedPassword) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const token = issueSellerSession();
    const response = NextResponse.json({ ok: true });
    response.headers.set(
      "Set-Cookie",
      `${COOKIE_NAME}=${token}; HttpOnly; Secure; SameSite=Strict; Path=/api/seller; Max-Age=28800`,
    );
    return response;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to issue session";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
