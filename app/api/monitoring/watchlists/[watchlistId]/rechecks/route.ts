import { NextRequest, NextResponse } from "next/server";
import { requireOwnerSession } from "@/lib/byoa/http";
import { trustMonitoringErrorResponse } from "@/lib/monitoring/http";
import {
  createTrustMonitoringQuote,
  requireOwnerWatchlist,
} from "@/lib/monitoring/service";

type RouteContext = { params: Promise<{ watchlistId: string }> };

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: NextRequest, { params }: RouteContext) {
  try {
    const owner = requireOwnerSession(request);
    const { watchlistId } = await params;
    const watchlist = await requireOwnerWatchlist(watchlistId, owner.wallet);
    const result = await createTrustMonitoringQuote({
      watchlist,
      trigger: "manual",
      idempotencyKey: request.headers.get("idempotency-key") ?? "",
      forwardedFor: request.headers.get("x-forwarded-for"),
      userAgent: request.headers.get("user-agent"),
    });
    return NextResponse.json(
      {
        recheckId: result.recheck.public_id,
        quote: result.quote,
        sponsoredAuthorizationMessage: result.sponsoredAuthorizationMessage,
        created: result.created,
      },
      {
        status: result.created ? 201 : 200,
        headers: { "Cache-Control": "no-store" },
      },
    );
  } catch (error) {
    return trustMonitoringErrorResponse(error);
  }
}
