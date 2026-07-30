import { NextRequest, NextResponse } from "next/server";
import { requireOwnerSession, jsonBody } from "@/lib/byoa/http";
import { updateTrustAlertState } from "@/lib/monitoring/alert-service";
import { trustMonitoringErrorResponse } from "@/lib/monitoring/http";
import type { AlertState } from "@/lib/monitoring/types";

type Context = { params: Promise<{ alertId: string }> };
export const dynamic = "force-dynamic";

export async function PATCH(request: NextRequest, { params }: Context) {
  try {
    const owner = requireOwnerSession(request);
    const body = await jsonBody(request);
    if (!["read", "archived"].includes(String(body.state))) {
      return NextResponse.json(
        { error: { code: "invalid_request", message: "Alert state must be read or archived." } },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }
    const { alertId } = await params;
    return NextResponse.json(
      await updateTrustAlertState({
        ownerWallet: owner.wallet,
        alertId,
        state: body.state as AlertState,
      }),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return trustMonitoringErrorResponse(error);
  }
}
