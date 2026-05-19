import { NextResponse } from "next/server";
import { getSellerAnalytics } from "@/lib/seller/analytics";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

export async function GET(_request: Request, { params }: RouteContext) {
  const { id } = await params;

  try {
    const analytics = await getSellerAnalytics({ serviceId: id });
    return NextResponse.json(analytics);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
