import { NextRequest, NextResponse } from "next/server";
import { byoaErrorResponse, jsonBody, requireOwnerSession } from "@/lib/byoa/http";
import { revokeAgentCredential, rotateAgentCredential } from "@/lib/byoa/service";

type Context = { params: Promise<{ agentId: string; credentialId: string }> };
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, { params }: Context) {
  try {
    const owner = requireOwnerSession(request);
    const { agentId, credentialId } = await params;
    const result = await rotateAgentCredential(owner.wallet, agentId, credentialId, await jsonBody(request));
    return NextResponse.json(
      { ...result, warning: "Copy the rotated credential now. The plaintext token is never stored." },
      { status: 201, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return byoaErrorResponse(error);
  }
}

export async function DELETE(request: NextRequest, { params }: Context) {
  try {
    const owner = requireOwnerSession(request);
    const { agentId, credentialId } = await params;
    return NextResponse.json(
      { credential: await revokeAgentCredential(owner.wallet, agentId, credentialId) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return byoaErrorResponse(error);
  }
}
