import { NextResponse } from "next/server";
import { trustMonitoringErrorResponse } from "@/lib/monitoring/http";
import { getPublicTrustProfile } from "@/lib/monitoring/service";

type RouteContext = { params: Promise<{ publicId: string }> };

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: RouteContext) {
  try {
    const { publicId } = await params;
    return NextResponse.json(await getPublicTrustProfile(publicId), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return trustMonitoringErrorResponse(error);
  }
}
