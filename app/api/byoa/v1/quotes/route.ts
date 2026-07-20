import { NextRequest, NextResponse } from "next/server";
import { byoaErrorResponse, jsonBody, requireAgentCredential } from "@/lib/byoa/http";
import { reserveWorkflowQuote } from "@/lib/byoa/service";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAgentCredential(request, "quotes:create");
    const result = await reserveWorkflowQuote({
      auth,
      idempotencyKey: request.headers.get("idempotency-key") ?? "",
      requestBody: await jsonBody(request),
      baseUrl: request.nextUrl.origin,
    });
    return NextResponse.json(result, {
      status: result.created ? 201 : 200,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return byoaErrorResponse(error);
  }
}
