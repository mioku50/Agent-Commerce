import { NextRequest, NextResponse } from "next/server";
import { authenticateMachineRequest } from "@/lib/api/machine-auth";
import { monitoringMachineError } from "@/lib/monitoring/machine-http";
import { listWebhookDeliveries } from "@/lib/monitoring/webhooks";

type Context = { params: Promise<{ webhookId: string }> };
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, { params }: Context) {
  const auth = await authenticateMachineRequest(request, "webhooks:read");
  if (!auth.ok) return auth.response;
  try {
    const { webhookId } = await params;
    return NextResponse.json(
      {
        deliveries: await listWebhookDeliveries(
          {
            ownerWallet: auth.context.ownerWallet,
            byoaAgentId: auth.context.agentId,
            machineCredentialId: auth.context.credential.id,
          },
          webhookId,
        ),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return monitoringMachineError(
      error,
      "/api/agent/v1/webhooks/[webhookId]/deliveries",
    );
  }
}
