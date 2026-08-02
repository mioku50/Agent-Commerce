import { NextRequest, NextResponse } from "next/server";
import { jsonBody, requireOwnerSession } from "@/lib/byoa/http";
import { project360ErrorResponse } from "@/lib/project-360/http";
import {
  createProject360Monitor,
  listOwnerProject360Monitors,
} from "@/lib/project-360/monitoring-service";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const owner = requireOwnerSession(request);
    return NextResponse.json(
      { monitors: await listOwnerProject360Monitors(owner.wallet) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return project360ErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const owner = requireOwnerSession(request);
    const body = await jsonBody(request);
    const result = await createProject360Monitor({
      ownerWallet: owner.wallet,
      baselineJobId: body.baselineJobId,
      label: body.label,
      cadence: body.cadence,
      visibility: body.visibility ?? "private",
    });
    return NextResponse.json(result, {
      status: result.created ? 201 : 200,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return project360ErrorResponse(error);
  }
}
