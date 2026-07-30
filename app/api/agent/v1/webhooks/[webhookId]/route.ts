import { NextRequest, NextResponse } from "next/server";
import { authenticateMachineRequest } from "@/lib/api/machine-auth";
import { monitoringMachineError } from "@/lib/monitoring/machine-http";
import {
  deleteWebhookSubscription,
  updateWebhookSubscription,
} from "@/lib/monitoring/webhooks";

type Context = { params: Promise<{ webhookId: string }> };
export const dynamic = "force-dynamic";

function tenant(context: {
  ownerWallet: string;
  agentId: string;
  credential: { id: string };
}) {
  return {
    ownerWallet: context.ownerWallet,
    byoaAgentId: context.agentId,
    machineCredentialId: context.credential.id,
  };
}

export async function PATCH(request: NextRequest, { params }: Context) {
  const auth = await authenticateMachineRequest(request, "webhooks:write");
  if (!auth.ok) return auth.response;
  try {
    const { webhookId } = await params;
    return NextResponse.json(
      await updateWebhookSubscription(
        tenant(auth.context),
        webhookId,
        (await request.json()) as Record<string, unknown>,
      ),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return monitoringMachineError(
      error,
      "/api/agent/v1/webhooks/[webhookId]",
    );
  }
}

export async function DELETE(request: NextRequest, { params }: Context) {
  const auth = await authenticateMachineRequest(request, "webhooks:write");
  if (!auth.ok) return auth.response;
  try {
    const { webhookId } = await params;
    return NextResponse.json(
      await deleteWebhookSubscription(tenant(auth.context), webhookId),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return monitoringMachineError(
      error,
      "/api/agent/v1/webhooks/[webhookId]",
    );
  }
}
