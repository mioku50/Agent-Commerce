import { NextRequest, NextResponse } from "next/server";
import { byoaErrorResponse, requireOwnerSession } from "@/lib/byoa/http";
import { getAgentManagementDetail } from "@/lib/byoa/service";

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
