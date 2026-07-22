import { NextRequest, NextResponse } from "next/server";
import { byoaErrorResponse, jsonBody, requireOwnerSession } from "@/lib/byoa/http";
import { ByoaError, getAgentManagementDetail, updateAgentStatus } from "@/lib/byoa/service";

type Context = { params: Promise<{ agentId: string }> };
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, { params }: Context) {
  try {
    const owner = requireOwnerSession(request);
    const { agentId } = await params;
    return NextResponse.json(await getAgentManagementDetail(owner.wallet, agentId), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return byoaErrorResponse(error);
  }
}

export async function PATCH(request: NextRequest, { params }: Context) {
  try {
    const owner = requireOwnerSession(request);
    const { agentId } = await params;
    const body = await jsonBody(request);
    const status = body.status;
    if (typeof status !== "string" || !["active", "suspended", "revoked"].includes(status)) {
      throw new ByoaError("Invalid status.", "invalid_status");
    }
    const updated = await updateAgentStatus(owner.wallet, agentId, status as "active" | "suspended" | "revoked");
    return NextResponse.json({ agent: updated }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return byoaErrorResponse(error);
  }
}
