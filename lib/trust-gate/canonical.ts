import { keccak256, toBytes } from "viem";
import type { TrustDecision } from "./types.ts";

export function computeCanonicalDecisionHash(decision: TrustDecision): string {
  const payload = {
    decisionId: decision.decisionId,
    decision: decision.decision,
    subjectAgentId: decision.subject.agentId,
    trustSnapshotHash: decision.trust.snapshotHash,
    requestAction: decision.request.action,
    requestRequestedValueUsdc: decision.request.requestedValueUsdc,
    policyVersion: decision.policy.version,
    policyMaxValueUsdc: decision.policy.maxValueUsdc,
    issuedAt: decision.issuedAt,
    expiresAt: decision.expiresAt,
  };

  const sortedKeys = Object.keys(payload).sort();
  const sortedPayload: Record<string, any> = {};
  for (const key of sortedKeys) {
    sortedPayload[key] = (payload as any)[key];
  }

  const jsonString = JSON.stringify(sortedPayload);
  return keccak256(toBytes(jsonString));
}
