import { NextRequest, NextResponse } from "next/server";
import { authenticateMachineRequest } from "@/lib/api/machine-auth";
import { createMachineErrorResponse, handleMachineInternalError } from "@/lib/api/machine-errors";
import {
  getPublicTrustHistory,
  requireMachineWatchlist,
  TrustMonitoringError,
} from "@/lib/monitoring/service";

type RouteContext = { params: Promise<{ watchlistId: string }> };

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, { params }: RouteContext) {
  const auth = await authenticateMachineRequest(request, "results:read");
  if (!auth.ok) return auth.response;
  try {
    const { watchlistId } = await params;
    await requireMachineWatchlist({
      publicId: watchlistId,
      ownerWallet: auth.context.ownerWallet,
      byoaAgentId: auth.context.agentId,
      machineCredentialId: auth.context.credential.id,
    });
    return NextResponse.json(await getPublicTrustHistory(watchlistId), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    if (error instanceof TrustMonitoringError) {
      return createMachineErrorResponse(
        error.code as Parameters<typeof createMachineErrorResponse>[0],
        error.message,
        error.status,
        error.retryable,
      );
    }
    return handleMachineInternalError(
      error,
      "/api/agent/v1/watchlists/{watchlistId}",
      auth.context.agentId,
    );
  }
}
