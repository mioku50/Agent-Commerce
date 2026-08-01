import { NextRequest, NextResponse } from "next/server";
import { jsonBody, requireOwnerSession } from "@/lib/byoa/http";
import { validateIdempotencyKey } from "@/lib/agent/hosted-policy";
import { project360ErrorResponse } from "@/lib/project-360/http";
import { createBrowserProject360Discovery } from "@/lib/project-360/service";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const owner = requireOwnerSession(request);
    const body = await jsonBody(request);
    const idempotencyKey = validateIdempotencyKey(
      request.headers.get("idempotency-key"),
    );
    const result = await createBrowserProject360Discovery({
      ownerWallet: owner.wallet,
      idempotencyKey,
      primaryType: body.type,
      primaryValue: body.value,
    });
    return NextResponse.json(result, {
      status: result.created ? 201 : 200,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return project360ErrorResponse(error);
  }
}
