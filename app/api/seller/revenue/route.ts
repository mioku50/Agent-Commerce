import { NextRequest, NextResponse } from "next/server";
import { requireOwnerSession, byoaErrorResponse } from "@/lib/byoa/http";
import { listSellerRevenue, listSellerSettlements } from "@/lib/seller/marketplace";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const session = requireOwnerSession(request);
    const [ledger, settlements] = await Promise.all([
      listSellerRevenue(session.wallet),
      listSellerSettlements(session.wallet),
    ]);
    return NextResponse.json(
      { ledger, settlements },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return byoaErrorResponse(error);
  }
}
