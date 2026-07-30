import { NextRequest, NextResponse } from "next/server";
import { authenticateMachineRequest } from "@/lib/api/machine-auth";
import { listTrustAlerts } from "@/lib/monitoring/alert-service";
import { monitoringMachineError } from "@/lib/monitoring/machine-http";
import type {
  AlertState,
  TrustAlertEventType,
} from "@/lib/monitoring/types";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await authenticateMachineRequest(request, "alerts:read");
  if (!auth.ok) return auth.response;
  try {
    const params = request.nextUrl.searchParams;
    return NextResponse.json(
      await listTrustAlerts({
        ownerWallet: auth.context.ownerWallet,
        byoaAgentId: auth.context.agentId,
        machineCredentialId: auth.context.credential.id,
        profileId: params.get("profileId"),
        eventType: params.get("type") as TrustAlertEventType | null,
        state: params.get("state") as AlertState | null,
      }),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return monitoringMachineError(error, "/api/agent/v1/alerts");
  }
}
