import { NextRequest, NextResponse } from "next/server";
import { authenticateMachineRequest } from "@/lib/api/machine-auth";
import { updateTrustAlertState } from "@/lib/monitoring/alert-service";
import { monitoringMachineError } from "@/lib/monitoring/machine-http";

type Context = { params: Promise<{ alertId: string }> };
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, { params }: Context) {
  const auth = await authenticateMachineRequest(request, "alerts:write");
  if (!auth.ok) return auth.response;
  try {
    const { alertId } = await params;
    return NextResponse.json(
      await updateTrustAlertState({
        ownerWallet: auth.context.ownerWallet,
        byoaAgentId: auth.context.agentId,
        machineCredentialId: auth.context.credential.id,
        alertId,
        state: "read",
      }),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return monitoringMachineError(
      error,
      "/api/agent/v1/alerts/[alertId]/read",
    );
  }
}
