import { NextResponse, type NextRequest } from "next/server";
import { evaluateTrustDecision } from "@/lib/trust-gate/decision";
import { signTrustClearance } from "@/lib/trust-gate/sign";
import type { TrustDecisionRequest } from "@/lib/trust-gate/types";
import { trustDecisionsCache } from "../store";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Partial<TrustDecisionRequest>;
    
    if (!body.subjectAgentId || !body.action || typeof body.requestedValueUsdc !== "number") {
      return NextResponse.json(
        { error: "Missing required fields: subjectAgentId, action, requestedValueUsdc" },
        { status: 400 }
      );
    }

    const decisionRequest = body as TrustDecisionRequest;
    const decision = await evaluateTrustDecision(decisionRequest);
    trustDecisionsCache.set(decision.decisionId, decision);

    let clearanceMessage;
    let signature;

    if (["ALLOW", "ALLOW_WITH_LIMITS", "REQUIRE_EVALUATOR"].includes(decision.decision)) {
      const privateKey = process.env.VEYRA_TRUST_ATTESTER_PRIVATE_KEY || process.env.VEYRA_ATTESTER_PRIVATE_KEY;
      const chainId = 5042002;
      const contractAddr = process.env.NEXT_PUBLIC_VEYRA_ERC8183_EVALUATOR_ADDRESS || "0x1cD66BCd4FCB73a079c05635840Fde029Ce6BEbB";

      if (privateKey && contractAddr) {
        const signed = await signTrustClearance(
          decision, 
          chainId, 
          contractAddr as `0x${string}`, 
          privateKey as `0x${string}`
        );
        clearanceMessage = signed.clearanceMessage;
        signature = signed.signature;
      }
    }

    return NextResponse.json({
      decision,
      clearance: clearanceMessage,
      signature
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
