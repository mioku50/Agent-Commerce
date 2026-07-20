import { NextRequest, NextResponse } from "next/server";
import { requireAllowedOrigin } from "@/lib/byoa/config";
import { byoaErrorResponse, requireOwnerSession } from "@/lib/byoa/http";
import { createAgentBindingChallenge } from "@/lib/byoa/service";

type Context = { params: Promise<{ agentId: string }> };
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, { params }: Context) {
  try {
    const owner = requireOwnerSession(request);
    const origin = requireAllowedOrigin(request.url, request.headers.get("origin"));
    const { agentId } = await params;
    const challenge = await createAgentBindingChallenge(owner.wallet, agentId, origin);
    return NextResponse.json({ challenge }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return byoaErrorResponse(error);
  }
}
