import { NextRequest, NextResponse } from "next/server";
import { jsonBody, requireOwnerSession } from "@/lib/byoa/http";
import { trustMonitoringErrorResponse } from "@/lib/monitoring/http";
import {
  getPublicTrustHistory,
  requireOwnerWatchlist,
  updateOwnerTrustWatchlist,
} from "@/lib/monitoring/service";

type RouteContext = { params: Promise<{ watchlistId: string }> };

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, { params }: RouteContext) {
  try {
    const owner = requireOwnerSession(request);
    const { watchlistId } = await params;
    await requireOwnerWatchlist(watchlistId, owner.wallet);
    return NextResponse.json(await getPublicTrustHistory(watchlistId), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return trustMonitoringErrorResponse(error);
  }
}
export async function PATCH(request: NextRequest, { params }: RouteContext) {
  try {
    const owner = requireOwnerSession(request);
    const { watchlistId } = await params;
    const body = await jsonBody(request);
    const watchlist = await updateOwnerTrustWatchlist({
      publicId: watchlistId,
      ownerWallet: owner.wallet,
      label: body.label,
      cadence: body.cadence,
      status: body.status,
    });
    return NextResponse.json({ watchlist }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return trustMonitoringErrorResponse(error);
  }
}
