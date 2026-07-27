import { NextResponse } from "next/server";
import { listPublicSellerWorkflows } from "@/lib/seller/marketplace";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(
      { workflows: await listPublicSellerWorkflows() },
      { headers: { "Cache-Control": "public, max-age=30, stale-while-revalidate=60" } },
    );
  } catch {
    return NextResponse.json(
      { workflows: [], warning: "Seller workflows are temporarily unavailable." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
