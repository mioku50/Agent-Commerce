import { NextRequest, NextResponse } from "next/server";
import { byoaErrorResponse, jsonBody, requireOwnerSession } from "@/lib/byoa/http";
import { createAgentCredential, getAgentManagementDetail } from "@/lib/byoa/service";

type Context = { params: Promise<{ agentId: string }> };
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, { params }: Context) {
  try {
    const owner = requireOwnerSession(request);
    const { agentId } = await params;
    const detail = await getAgentManagementDetail(owner.wallet, agentId);
    return NextResponse.json({ credentials: detail.credentials }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return byoaErrorResponse(error);
  }
}

export async function POST(request: NextRequest, { params }: Context) {
  try {
    const owner = requireOwnerSession(request);
    const { agentId } = await params;
    const result = await createAgentCredential(owner.wallet, agentId, await jsonBody(request));
    return NextResponse.json(
      { ...result, warning: "Copy this credential now. The plaintext token is never stored and cannot be shown again." },
      { status: 201, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return byoaErrorResponse(error);
  }
}
