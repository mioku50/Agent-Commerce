import { NextRequest, NextResponse } from "next/server";
import { requireAllowedOrigin } from "@/lib/byoa/config";
import { byoaErrorResponse, jsonBody } from "@/lib/byoa/http";
import { createOwnerSessionChallenge } from "@/lib/byoa/service";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const origin = requireAllowedOrigin(request.url, request.headers.get("origin"));
    const body = await jsonBody(request);
    const challenge = await createOwnerSessionChallenge(body.wallet, origin);
    return NextResponse.json({ challenge }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return byoaErrorResponse(error);
  }
}
