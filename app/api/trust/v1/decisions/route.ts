import { NextResponse, type NextRequest } from "next/server";
import { evaluateTrustDecision } from "@/lib/trust-gate/decision";
import { signTrustClearance } from "@/lib/trust-gate/sign";
import type { TrustDecisionRequest } from "@/lib/trust-gate/types";
import { isExecutableTrustDecision } from "@/lib/trust-gate/types";
import { trustDecisionsCache } from "../store";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Partial<TrustDecisionRequest>;
    
    if (
      !body.subjectAgentId
      || !body.action
      || typeof body.requestedValueUsdc !== "number"
      || !Number.isFinite(body.requestedValueUsdc)
      || body.requestedValueUsdc < 0
    ) {
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

    if (isExecutableTrustDecision(decision.decision)) {
      const privateKey = process.env.VEYRA_TRUST_ATTESTER_PRIVATE_KEY || process.env.VEYRA_ATTESTER_PRIVATE_KEY;
      const chainId = 5042002;
      const contractAddr = process.env.VEYRA_TRUST_GATE_ADDRESS;

      if (!privateKey || !contractAddr) {
        return NextResponse.json(
          { error: "Trust clearance signing is unavailable." },
          { status: 503 },
        );
      }
      const signed = await signTrustClearance(
        decision,
        chainId,
        contractAddr as `0x${string}`,
        privateKey as `0x${string}`
      );
      clearanceMessage = signed.clearanceMessage;
      signature = signed.signature;
    }

    return NextResponse.json({
      decision,
      clearance: clearanceMessage,
      signature
    });
  } catch {
    return NextResponse.json({ error: "Trust decision evaluation failed." }, { status: 500 });
  }
}
