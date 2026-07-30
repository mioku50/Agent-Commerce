import { NextRequest, NextResponse } from "next/server";
import { authenticateMachineRequest } from "@/lib/api/machine-auth";
import { monitoringMachineError } from "@/lib/monitoring/machine-http";
import { rotateWebhookSecret } from "@/lib/monitoring/webhooks";

type Context = { params: Promise<{ webhookId: string }> };
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, { params }: Context) {
  const auth = await authenticateMachineRequest(request, "webhooks:write");
  if (!auth.ok) return auth.response;
  try {
    const { webhookId } = await params;
    return NextResponse.json(
      await rotateWebhookSecret(
        {
          ownerWallet: auth.context.ownerWallet,
          byoaAgentId: auth.context.agentId,
          machineCredentialId: auth.context.credential.id,
        },
        webhookId,
      ),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return monitoringMachineError(
      error,
      "/api/agent/v1/webhooks/[webhookId]/rotate-secret",
    );
  }
}
