import { NextRequest, NextResponse } from "next/server";
import { requireOwnerSession } from "@/lib/byoa/http";
import { project360ErrorResponse } from "@/lib/project-360/http";
import { createOwnerProject360MonitorQuote } from "@/lib/project-360/monitoring-service";

type RouteContext = { params: Promise<{ monitorId: string }> };
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: NextRequest, { params }: RouteContext) {
  try {
    const owner = requireOwnerSession(request);
    const { monitorId } = await params;
    const result = await createOwnerProject360MonitorQuote({
      publicId: monitorId,
      ownerWallet: owner.wallet,
      idempotencyKey: request.headers.get("idempotency-key") ?? "",
      forwardedFor: request.headers.get("x-forwarded-for"),
      userAgent: request.headers.get("user-agent"),
    });
    return NextResponse.json(result, {
      status: result.created ? 201 : 200,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return project360ErrorResponse(error);
  }
}
