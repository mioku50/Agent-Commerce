import { NextResponse } from "next/server";
import { trustMonitoringErrorResponse } from "@/lib/monitoring/http";
import { getPublicTrustHistory } from "@/lib/monitoring/service";

type RouteContext = { params: Promise<{ watchlistId: string }> };

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: RouteContext) {
  try {
    const { watchlistId } = await params;
    return NextResponse.json(await getPublicTrustHistory(watchlistId), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return trustMonitoringErrorResponse(error);
  }
}
