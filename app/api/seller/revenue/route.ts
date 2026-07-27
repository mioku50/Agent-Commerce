import { NextRequest, NextResponse } from "next/server";
import { requireOwnerSession, byoaErrorResponse } from "@/lib/byoa/http";
import { listSellerRevenue } from "@/lib/seller/marketplace";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const session = requireOwnerSession(request);
    return NextResponse.json(
      { ledger: await listSellerRevenue(session.wallet) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return byoaErrorResponse(error);
  }
}
