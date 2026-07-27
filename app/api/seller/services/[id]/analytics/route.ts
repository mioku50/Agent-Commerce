import { NextRequest, NextResponse } from "next/server";
import { requireOwnerSession, byoaErrorResponse } from "@/lib/byoa/http";
import { getOwnedSellerService, listSellerRevenue } from "@/lib/seller/marketplace";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: RouteContext) {
  try {
    const session = requireOwnerSession(request);
    const { id } = await params;
    if (!await getOwnedSellerService(session.wallet, id)) {
      return NextResponse.json({ error: "Service not found" }, { status: 404 });
    }
    const ledger = await listSellerRevenue(session.wallet);
    return NextResponse.json({ ledger: ledger.filter((row) => row.service_id === id) }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return byoaErrorResponse(error);
  }
}
