import { NextRequest, NextResponse } from "next/server";
import { requireOwnerSession, jsonBody } from "@/lib/byoa/http";
import { trustMonitoringErrorResponse } from "@/lib/monitoring/http";
import {
  createTrustWatchlist,
  listOwnerTrustWatchlists,
} from "@/lib/monitoring/service";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const owner = requireOwnerSession(request);
    return NextResponse.json(
      { watchlists: await listOwnerTrustWatchlists(owner.wallet) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return trustMonitoringErrorResponse(error);
  }
}
export async function POST(request: NextRequest) {
  try {
    const owner = requireOwnerSession(request);
    const body = await jsonBody(request);
    const result = await createTrustWatchlist({
      ownerWallet: owner.wallet,
      label: body.label,
      subjectInput: body.input,
      cadence: body.cadence,
    });
    return NextResponse.json(result, {
      status: result.created ? 201 : 200,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return trustMonitoringErrorResponse(error);
  }
}
