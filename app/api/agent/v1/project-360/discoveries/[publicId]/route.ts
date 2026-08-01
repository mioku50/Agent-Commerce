import { NextRequest, NextResponse } from "next/server";
import { authenticateMachineRequest } from "@/lib/api/machine-auth";
import {
  createMachineErrorResponse,
  handleMachineInternalError,
  type MachineErrorCode,
} from "@/lib/api/machine-errors";
import {
  getMachineProject360Discovery,
  Project360Error,
} from "@/lib/project-360/service";

type RouteContext = { params: Promise<{ publicId: string }> };

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, { params }: RouteContext) {
  const auth = await authenticateMachineRequest(request, "results:read");
  if (!auth.ok) return auth.response;
  try {
    const { publicId } = await params;
    return NextResponse.json(
      {
        discovery: await getMachineProject360Discovery({
          publicId,
          ownerWallet: auth.context.ownerWallet,
          machineCredentialId: auth.context.credential.id,
        }),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof Project360Error) {
      return createMachineErrorResponse(
        error.code as MachineErrorCode,
        error.message,
        error.status,
        error.retryable,
      );
    }
    return handleMachineInternalError(
      error,
      "/api/agent/v1/project-360/discoveries/[publicId]",
      auth.context.agentId,
    );
  }
}
