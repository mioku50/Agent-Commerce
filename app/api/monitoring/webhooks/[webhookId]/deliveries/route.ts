import { NextRequest, NextResponse } from "next/server";
import { requireOwnerSession } from "@/lib/byoa/http";
import { trustMonitoringErrorResponse } from "@/lib/monitoring/http";
import { listWebhookDeliveries } from "@/lib/monitoring/webhooks";

type Context = { params: Promise<{ webhookId: string }> };
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, { params }: Context) {
  try {
    const owner = requireOwnerSession(request);
    const { webhookId } = await params;
    return NextResponse.json(
      {
        deliveries: await listWebhookDeliveries(
          { ownerWallet: owner.wallet },
          webhookId,
        ),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return trustMonitoringErrorResponse(error);
  }
}
