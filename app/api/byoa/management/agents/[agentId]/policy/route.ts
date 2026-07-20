import { NextRequest, NextResponse } from "next/server";
import { byoaErrorResponse, jsonBody, requireOwnerSession } from "@/lib/byoa/http";
import { getAgentManagementDetail, updateAgentPolicy } from "@/lib/byoa/service";

type Context = { params: Promise<{ agentId: string }> };
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, { params }: Context) {
  try {
    const owner = requireOwnerSession(request);
    const { agentId } = await params;
    const detail = await getAgentManagementDetail(owner.wallet, agentId);
    return NextResponse.json({ policy: detail.policy }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return byoaErrorResponse(error);
  }
}

export async function PUT(request: NextRequest, { params }: Context) {
  try {
    const owner = requireOwnerSession(request);
    const { agentId } = await params;
    const policy = await updateAgentPolicy(owner.wallet, agentId, await jsonBody(request));
    return NextResponse.json({ policy }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return byoaErrorResponse(error);
  }
}
