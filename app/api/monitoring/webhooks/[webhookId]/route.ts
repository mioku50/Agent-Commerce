import { NextRequest, NextResponse } from "next/server";
import { requireOwnerSession, jsonBody } from "@/lib/byoa/http";
import { trustMonitoringErrorResponse } from "@/lib/monitoring/http";
import {
  deleteWebhookSubscription,
  updateWebhookSubscription,
} from "@/lib/monitoring/webhooks";

type Context = { params: Promise<{ webhookId: string }> };
export const dynamic = "force-dynamic";

export async function PATCH(request: NextRequest, { params }: Context) {
  try {
    const owner = requireOwnerSession(request);
    const { webhookId } = await params;
    return NextResponse.json(
      await updateWebhookSubscription(
        { ownerWallet: owner.wallet },
        webhookId,
        await jsonBody(request),
      ),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return trustMonitoringErrorResponse(error);
  }
}

export async function DELETE(request: NextRequest, { params }: Context) {
  try {
    const owner = requireOwnerSession(request);
    const { webhookId } = await params;
    return NextResponse.json(
      await deleteWebhookSubscription({ ownerWallet: owner.wallet }, webhookId),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return trustMonitoringErrorResponse(error);
  }
}
