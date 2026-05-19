import { NextResponse } from "next/server";
import { getSellerAnalytics } from "@/lib/seller/analytics";

export async function GET() {
  try {
    const analytics = await getSellerAnalytics();
    return NextResponse.json(analytics);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
