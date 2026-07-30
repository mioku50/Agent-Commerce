import { NextRequest, NextResponse } from "next/server";
import { requireOwnerSession, jsonBody } from "@/lib/byoa/http";
import {
  listTrustAlerts,
  markAllTrustAlertsRead,
} from "@/lib/monitoring/alert-service";
import { trustMonitoringErrorResponse } from "@/lib/monitoring/http";
import type {
  AlertState,
  TrustAlertEventType,
} from "@/lib/monitoring/types";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const owner = requireOwnerSession(request);
    const params = request.nextUrl.searchParams;
    return NextResponse.json(
      await listTrustAlerts({
        ownerWallet: owner.wallet,
        profileId: params.get("profileId"),
        eventType: params.get("type") as TrustAlertEventType | null,
        state: params.get("state") as AlertState | null,
      }),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return trustMonitoringErrorResponse(error);
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const owner = requireOwnerSession(request);
    const body = await jsonBody(request);
    if (body.action !== "mark_all_read") {
      return NextResponse.json(
        { error: { code: "invalid_request", message: "Unsupported alert action." } },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }
    return NextResponse.json(await markAllTrustAlertsRead(owner.wallet), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return trustMonitoringErrorResponse(error);
  }
}
