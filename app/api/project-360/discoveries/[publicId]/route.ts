import { NextRequest, NextResponse } from "next/server";
import { requireOwnerSession } from "@/lib/byoa/http";
import { project360ErrorResponse } from "@/lib/project-360/http";
import { getBrowserProject360Discovery } from "@/lib/project-360/service";

type RouteContext = { params: Promise<{ publicId: string }> };

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, { params }: RouteContext) {
  try {
    const owner = requireOwnerSession(request);
    const { publicId } = await params;
    const discovery = await getBrowserProject360Discovery({
      publicId,
      ownerWallet: owner.wallet,
    });
    return NextResponse.json({ discovery }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return project360ErrorResponse(error);
  }
}
