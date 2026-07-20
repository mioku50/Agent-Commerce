import { NextResponse } from "next/server";
import { getSellerAnalytics } from "@/lib/seller/analytics";
import { requireSellerAuth } from "@/lib/seller/session";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function GET(request: Request, { params }: RouteContext) {
  const authReject = requireSellerAuth(request);
  if (authReject) return authReject;

  const { id } = await params;

  try {
    const analytics = await getSellerAnalytics({ serviceId: id });
    return NextResponse.json(analytics);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
