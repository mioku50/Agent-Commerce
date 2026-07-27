import { NextRequest, NextResponse } from "next/server";
import { byoaManifest, safeByoaError } from "@/lib/byoa/service";
import { listPublicSellerWorkflows } from "@/lib/seller/marketplace";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const sellerWorkflows = await listPublicSellerWorkflows();
    return NextResponse.json(byoaManifest(request.nextUrl.origin, sellerWorkflows), {
      headers: { "Cache-Control": "public, max-age=60" },
    });
  } catch (error) {
    return NextResponse.json({ error: safeByoaError(error) }, { status: 503 });
  }
}
