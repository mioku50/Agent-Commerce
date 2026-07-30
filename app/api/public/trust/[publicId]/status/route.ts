import { NextResponse } from "next/server";
import { getPublicTrustStatus } from "@/lib/monitoring/service";
import {
  publicTrustCacheHeaders,
  trustStatusEtag,
} from "@/lib/monitoring/public-status";
import { trustMonitoringErrorResponse } from "@/lib/monitoring/http";

type Context = { params: Promise<{ publicId: string }> };
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request, { params }: Context) {
  try {
    const { publicId } = await params;
    const status = await getPublicTrustStatus(publicId);
    if (request.headers.get("if-none-match") === trustStatusEtag(status)) {
      return new NextResponse(null, {
        status: 304,
        headers: publicTrustCacheHeaders(status),
      });
    }
    return NextResponse.json(status, {
      headers: publicTrustCacheHeaders(status),
    });
  } catch (error) {
    return trustMonitoringErrorResponse(error);
  }
}
