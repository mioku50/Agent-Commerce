import { NextRequest, NextResponse } from "next/server";
import { requireOwnerSession, jsonBody } from "@/lib/byoa/http";
import { trustMonitoringErrorResponse } from "@/lib/monitoring/http";
import {
  createWebhookSubscription,
  listWebhooks,
} from "@/lib/monitoring/webhooks";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const owner = requireOwnerSession(request);
    return NextResponse.json(
      { webhooks: await listWebhooks({ ownerWallet: owner.wallet }) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return trustMonitoringErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const owner = requireOwnerSession(request);
    return NextResponse.json(
      await createWebhookSubscription(
        { ownerWallet: owner.wallet },
        await jsonBody(request),
      ),
      { status: 201, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return trustMonitoringErrorResponse(error);
  }
}
