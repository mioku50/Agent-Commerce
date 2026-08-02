import { NextRequest, NextResponse } from "next/server";
import { requireOwnerSession } from "@/lib/byoa/http";
import { project360ErrorResponse } from "@/lib/project-360/http";
import { dismissProject360MonitorSuggestion } from "@/lib/project-360/monitoring-service";

type RouteContext = { params: Promise<{ suggestionId: string }> };
export const dynamic = "force-dynamic";

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  try {
    const owner = requireOwnerSession(request);
    const { suggestionId } = await params;
    return NextResponse.json(
      await dismissProject360MonitorSuggestion({ publicId: suggestionId, ownerWallet: owner.wallet }),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return project360ErrorResponse(error);
  }
}
