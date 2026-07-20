import { NextRequest, NextResponse } from "next/server";
import { byoaErrorResponse, jsonBody, requireOwnerSession } from "@/lib/byoa/http";
import { createRegisteredAgent, listOwnerAgents } from "@/lib/byoa/service";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const owner = requireOwnerSession(request);
    return NextResponse.json(
      { agents: await listOwnerAgents(owner.wallet) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return byoaErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const owner = requireOwnerSession(request);
    const body = await jsonBody(request);
    const agent = await createRegisteredAgent({
      ownerWallet: owner.wallet,
      displayName: body.displayName,
      agentWallet: body.agentWallet,
    });
    return NextResponse.json({ agent }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return byoaErrorResponse(error);
  }
}
