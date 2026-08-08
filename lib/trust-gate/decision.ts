import { randomBytes } from "crypto";
import { fetchLatestReputationSnapshot } from "../reputation/db.ts";
import type { ReputationSnapshot } from "../reputation/types.ts";
import type {
  TrustDecisionRequest,
  TrustDecision,
  TrustRiskCode,
} from "./types.ts";
import {
  TRUST_POLICY_VERSION,
  TRUST_DECISION_EXPIRY_SECONDS,
} from "./types.ts";
import { resolvePolicy, POLICY_TIERS, DENY_TIER } from "./policy.ts";
import { computeCanonicalDecisionHash } from "./canonical.ts";

export async function evaluateTrustDecision(
  request: TrustDecisionRequest,
  useInMemorySnapshot?: ReputationSnapshot | null
): Promise<TrustDecision> {
  const snapshot = useInMemorySnapshot !== undefined 
    ? useInMemorySnapshot 
    : (await fetchLatestReputationSnapshot(request.subjectAgentId));

  const issuedAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + TRUST_DECISION_EXPIRY_SECONDS * 1000).toISOString();

  if (!snapshot) {
    const decision: TrustDecision = {
      decisionId: `vtd_${randomBytes(8).toString("hex")}`,
      decision: "DENY",
      subject: { agentId: request.subjectAgentId, wallet: undefined },
      trust: {
        score: 0,
        confidence: 0,
        coverage: 0,
        snapshotHash: "",
        snapshotAgeSeconds: 0,
      },
      request: {
        action: request.action,
        requestedValueUsdc: request.requestedValueUsdc,
        counterparty: request.counterpartyAgentId || request.counterpartyWallet,
      },
      policy: {
        version: TRUST_POLICY_VERSION,
        maxValueUsdc: 0,
        evaluatorRequired: true,
      },
      reasons: ["NO_REPUTATION_DATA"],
      riskSignals: ["NO_REPUTATION_DATA"],
      issuedAt,
      expiresAt,
      canonicalHash: "",
    };
    decision.canonicalHash = computeCanonicalDecisionHash(decision);
    return decision;
  }

  const snapshotAgeSeconds = (Date.now() - new Date(snapshot.createdAt).getTime()) / 1000;

  let confidenceNum = 0;
  if (snapshot.confidence === "High" || snapshot.confidence === "Very High") confidenceNum = 0.9;
  else if (snapshot.confidence === "Medium") confidenceNum = 0.6;
  else if (snapshot.confidence === "Low") confidenceNum = 0.3;

  const riskSignals: TrustRiskCode[] = [];
  
  if (snapshot.dimensions.economicReliability < 50) riskSignals.push("LOW_ECONOMIC_RELIABILITY");
  if (snapshot.dimensions.execution < 50) riskSignals.push("LOW_EXECUTION_RELIABILITY");
  if (snapshot.riskSignals.includes("sybilRisk") || snapshot.riskSignals.includes("SYBIL_RISK")) riskSignals.push("SYBIL_RISK");
  if (snapshot.riskSignals.includes("counterpartyFarming") || snapshot.riskSignals.includes("COUNTERPARTY_FARMING")) riskSignals.push("COUNTERPARTY_FARMING");
  if (!snapshot.arcProofTx) riskSignals.push("ARC_PROOF_UNVERIFIED");

  if (confidenceNum < 0.3) riskSignals.push("LOW_CONFIDENCE");
  if (snapshot.coverage < 0.3) riskSignals.push("INSUFFICIENT_COVERAGE");
  
  if (snapshotAgeSeconds > 3600) {
     riskSignals.push("STALE_REPUTATION");
  }

  let { tier, reasons } = resolvePolicy(
    snapshot.trustScore,
    confidenceNum,
    snapshot.coverage,
    snapshotAgeSeconds,
    riskSignals
  );

  if (request.requestedValueUsdc > tier.maxValueUsdc && tier.level !== "DENY") {
    reasons.push("VALUE_EXCEEDS_TRUST_LIMIT");
    const currentIndex = POLICY_TIERS.findIndex((t) => t.level === tier.level);
    if (currentIndex >= 0 && currentIndex < POLICY_TIERS.length - 1) {
       tier = POLICY_TIERS[currentIndex + 1];
    } else {
       tier = DENY_TIER;
    }
  }

  const decision: TrustDecision = {
    decisionId: `vtd_${randomBytes(8).toString("hex")}`,
    decision: tier.level,
    subject: {
      agentId: request.subjectAgentId,
      wallet: undefined,
    },
    trust: {
      score: snapshot.trustScore,
      confidence: confidenceNum,
      coverage: snapshot.coverage,
      snapshotHash: snapshot.canonicalHash,
      snapshotAgeSeconds,
    },
    request: {
      action: request.action,
      requestedValueUsdc: request.requestedValueUsdc,
      counterparty: request.counterpartyAgentId || request.counterpartyWallet,
    },
    policy: {
      version: TRUST_POLICY_VERSION,
      maxValueUsdc: tier.maxValueUsdc,
      evaluatorRequired: tier.evaluatorRequired,
    },
    reasons: Array.from(new Set(reasons)),
    riskSignals: Array.from(new Set(riskSignals)),
    issuedAt,
    expiresAt,
    canonicalHash: "",
  };

  decision.canonicalHash = computeCanonicalDecisionHash(decision);
  return decision;
}
