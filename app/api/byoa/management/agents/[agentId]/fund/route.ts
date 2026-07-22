import { NextRequest, NextResponse } from "next/server";
import { byoaErrorResponse, jsonBody, requireOwnerSession } from "@/lib/byoa/http";
import { ByoaError, getAgentManagementDetail } from "@/lib/byoa/service";
import { buildFundingIntent, getAgentWalletUsdcBalance, type FundingMethod } from "@/lib/byoa/funding";

type Context = { params: Promise<{ agentId: string }> };
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, { params }: Context) {
  try {
    const owner = requireOwnerSession(request);
    const { agentId } = await params;
    const body = await jsonBody(request);

    const method = body.method as FundingMethod;
    const amountUsdc = String(body.amountUsdc ?? "");

    if (!["arc_transfer", "cctp_bridge", "gateway_deposit"].includes(method)) {
      throw new ByoaError("Invalid funding method.", "invalid_funding_method");
    }

    const detail = await getAgentManagementDetail(owner.wallet, agentId);
    if (!detail.agent?.agentWallet) {
      throw new ByoaError("External agent wallet is not configured for this agent.", "agent_wallet_missing");
    }

    // Hardcoded recipient = agent.agentWallet (cannot be overridden by input)
    const intent = buildFundingIntent({
      agentId,
      agentWallet: detail.agent.agentWallet,
      method,
      amountUsdc,
    });

    let currentAgentBalance = "0.000000";
    try {
      currentAgentBalance = await getAgentWalletUsdcBalance(detail.agent.agentWallet);
    } catch (err) {
      console.warn("[byoa-funding] Could not fetch live agent balance:", err);
    }

    return NextResponse.json(
      { intent, supported: intent.supported, currentAgentBalance },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return byoaErrorResponse(error);
  }
}
