import { NextRequest, NextResponse } from "next/server";
import { jsonBody, requireOwnerSession } from "@/lib/byoa/http";
import { project360ErrorResponse } from "@/lib/project-360/http";
import {
  deleteOwnerProject360Monitor,
  getOwnerProject360Monitor,
  updateOwnerProject360Monitor,
} from "@/lib/project-360/monitoring-service";

type RouteContext = { params: Promise<{ monitorId: string }> };
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, { params }: RouteContext) {
  try {
    const owner = requireOwnerSession(request);
    const { monitorId } = await params;
    return NextResponse.json(
      { monitor: await getOwnerProject360Monitor(monitorId, owner.wallet) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return project360ErrorResponse(error);
  }
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  try {
    const owner = requireOwnerSession(request);
    const { monitorId } = await params;
    const body = await jsonBody(request);
    return NextResponse.json({ monitor: await updateOwnerProject360Monitor({
      publicId: monitorId,
      ownerWallet: owner.wallet,
      label: body.label,
      cadence: body.cadence,
      visibility: body.visibility,
      status: body.status,
    }) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return project360ErrorResponse(error);
  }
}

export async function DELETE(request: NextRequest, { params }: RouteContext) {
  try {
    const owner = requireOwnerSession(request);
    const { monitorId } = await params;
    return NextResponse.json(
      await deleteOwnerProject360Monitor(monitorId, owner.wallet),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return project360ErrorResponse(error);
  }
}
