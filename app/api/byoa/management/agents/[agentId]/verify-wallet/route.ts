import { NextRequest, NextResponse } from "next/server";
import { verifyMessage, type Hex } from "viem";
import { requireAllowedOrigin } from "@/lib/byoa/config";
import { byoaErrorResponse, jsonBody, requireOwnerSession } from "@/lib/byoa/http";
import {
  activateAgentWallet,
  ByoaError,
  consumeWalletChallenge,
  getOwnerAgent,
  getWalletChallenge,
} from "@/lib/byoa/service";

type Context = { params: Promise<{ agentId: string }> };
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, { params }: Context) {
  try {
    const owner = requireOwnerSession(request);
    const origin = requireAllowedOrigin(request.url, request.headers.get("origin"));
    const { agentId } = await params;
    const agent = await getOwnerAgent(owner.wallet, agentId);
    const body = await jsonBody(request);
    if (typeof body.challengeId !== "string" || typeof body.message !== "string" || typeof body.signature !== "string") {
      throw new ByoaError("Challenge ID, message, and signature are required.", "invalid_signature");
    }
    const row = await getWalletChallenge(body.challengeId);
    if (row.action !== "bind_agent_wallet" || row.agent_id !== agent.id || row.origin !== origin) {
      throw new ByoaError("Wallet challenge does not match this agent.", "challenge_mismatch", 401);
    }
    if (!/^0x[0-9a-f]+$/i.test(body.signature)) {
      throw new ByoaError("Wallet signature is invalid.", "invalid_signature", 401);
    }
    const valid = await verifyMessage({
      address: row.wallet as `0x${string}`,
      message: body.message,
      signature: body.signature as Hex,
    });
    if (!valid) throw new ByoaError("Agent wallet signature is invalid.", "invalid_signature", 401);
    await consumeWalletChallenge({ row, message: body.message, origin });
    return NextResponse.json(
      { agent: await activateAgentWallet(owner.wallet, agent.id) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return byoaErrorResponse(error);
  }
}
