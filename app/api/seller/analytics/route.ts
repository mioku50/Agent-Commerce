import { NextRequest } from "next/server";
import { GET as getSellerRevenue } from "../revenue/route";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  return getSellerRevenue(request);
}
