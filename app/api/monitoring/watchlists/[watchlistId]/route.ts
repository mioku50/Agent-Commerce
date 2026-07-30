import { NextRequest, NextResponse } from "next/server";
import { jsonBody, requireOwnerSession } from "@/lib/byoa/http";
import { trustMonitoringErrorResponse } from "@/lib/monitoring/http";
import {
  deleteOwnerTrustWatchlist,
  getTrustHistoryForWatchlist,
  requireOwnerWatchlist,
  updateOwnerTrustWatchlist,
} from "@/lib/monitoring/service";

type RouteContext = { params: Promise<{ watchlistId: string }> };

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, { params }: RouteContext) {
  try {
    const owner = requireOwnerSession(request);
    const { watchlistId } = await params;
    const watchlist = await requireOwnerWatchlist(watchlistId, owner.wallet);
    return NextResponse.json(await getTrustHistoryForWatchlist(watchlist), {
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
      visibility: body.visibility,
    });
    return NextResponse.json({ watchlist }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return trustMonitoringErrorResponse(error);
  }
}

export async function DELETE(request: NextRequest, { params }: RouteContext) {
  try {
    const owner = requireOwnerSession(request);
    const { watchlistId } = await params;
    return NextResponse.json(
      await deleteOwnerTrustWatchlist({
        publicId: watchlistId,
        ownerWallet: owner.wallet,
      }),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return trustMonitoringErrorResponse(error);
  }
}
