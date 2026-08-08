import type { PolicyTierConfig, TrustRiskCode } from "./types.ts";

export const POLICY_TIERS: PolicyTierConfig[] = [
  {
    level: "ALLOW",
    minScore: 85,
    minConfidence: 0.8,    // High
    minCoverage: 0.65,
    maxFreshnessSeconds: 3600,
    maxValueUsdc: 100,
    evaluatorRequired: false,
  },
  {
    level: "ALLOW_WITH_LIMITS",
    minScore: 70,
    minConfidence: 0.5,    // Medium
    minCoverage: 0.50,
    maxFreshnessSeconds: 7200,
    maxValueUsdc: 25,
    evaluatorRequired: false,
  },
  {
    level: "REQUIRE_EVALUATOR",
    minScore: 50,
    minConfidence: 0.3,
    minCoverage: 0.30,
    maxFreshnessSeconds: 14400,
    maxValueUsdc: 10,
    evaluatorRequired: true,
  },
  {
    level: "REVIEW_REQUIRED",
    minScore: 30,
    minConfidence: 0.1,
    minCoverage: 0.0,
    maxFreshnessSeconds: Infinity,
    maxValueUsdc: 0,
    evaluatorRequired: true,
  },
];

export const DENY_TIER: PolicyTierConfig = {
  level: "DENY",
  minScore: 0,
  minConfidence: 0,
  minCoverage: 0,
  maxFreshnessSeconds: Infinity,
  maxValueUsdc: 0,
  evaluatorRequired: true,
};

export function resolvePolicy(
  score: number,
  confidence: number,
  coverage: number,
  freshnessSeconds: number,
  riskFlags: TrustRiskCode[]
): { tier: PolicyTierConfig; reasons: TrustRiskCode[] } {
  const criticalFlags: TrustRiskCode[] = [
    "SYBIL_RISK",
    "COUNTERPARTY_FARMING",
    "ARC_PROOF_UNVERIFIED",
  ];
  const hasCriticalRisk = riskFlags.some((flag) => criticalFlags.includes(flag));
  
  if (hasCriticalRisk) {
    return { tier: DENY_TIER, reasons: riskFlags };
  }

  for (const tier of POLICY_TIERS) {
    if (
      score >= tier.minScore &&
      confidence >= tier.minConfidence &&
      coverage >= tier.minCoverage &&
      freshnessSeconds <= tier.maxFreshnessSeconds
    ) {
      return { tier, reasons: riskFlags };
    }
  }

  return { tier: DENY_TIER, reasons: riskFlags };
}
