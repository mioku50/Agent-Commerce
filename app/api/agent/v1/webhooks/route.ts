import { NextRequest, NextResponse } from "next/server";
import { authenticateMachineRequest } from "@/lib/api/machine-auth";
import { monitoringMachineError } from "@/lib/monitoring/machine-http";
import {
  createWebhookSubscription,
  listWebhooks,
} from "@/lib/monitoring/webhooks";

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

export async function GET(request: NextRequest) {
  const auth = await authenticateMachineRequest(request, "webhooks:read");
  if (!auth.ok) return auth.response;
  try {
    return NextResponse.json(
      { webhooks: await listWebhooks(tenant(auth.context)) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return monitoringMachineError(error, "/api/agent/v1/webhooks");
  }
}

export async function POST(request: NextRequest) {
  const auth = await authenticateMachineRequest(request, "webhooks:write");
  if (!auth.ok) return auth.response;
  try {
    const body = (await request.json()) as Record<string, unknown>;
    return NextResponse.json(
      await createWebhookSubscription(tenant(auth.context), body),
      { status: 201, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return monitoringMachineError(error, "/api/agent/v1/webhooks");
  }
}
