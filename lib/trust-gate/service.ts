import { evaluateTrustDecision } from "./decision.ts";
import type { TrustDecisionRequest, TrustDecision } from "./types.ts";

export async function processTrustDecision(request: TrustDecisionRequest): Promise<TrustDecision> {
  try {
    return await evaluateTrustDecision(request);
  } catch (error) {
    console.error("Trust decision evaluation failed:", error);
    // Return DENY on failure
    throw new Error("Trust decision evaluation failed");
  }
}
