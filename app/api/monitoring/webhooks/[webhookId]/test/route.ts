import { after, NextRequest, NextResponse } from "next/server";
import { requireOwnerSession } from "@/lib/byoa/http";
import { trustMonitoringErrorResponse } from "@/lib/monitoring/http";
import {
  createTestWebhookEvent,
  deliverDueWebhooks,
} from "@/lib/monitoring/webhooks";

type Context = { params: Promise<{ webhookId: string }> };
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, { params }: Context) {
  try {
    const owner = requireOwnerSession(request);
    const { webhookId } = await params;
    const result = await createTestWebhookEvent(
      { ownerWallet: owner.wallet },
      webhookId,
    );
    after(() => deliverDueWebhooks(10).catch(() => undefined));
    return NextResponse.json(result, {
      status: 202,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return trustMonitoringErrorResponse(error);
  }
}
