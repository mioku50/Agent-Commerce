import type {
  EvidenceItem,
  ScoreCategory,
  TrustScore,
} from "./types.ts";

export const AGENT_TRUST_WEIGHTS = {
  codeHealth: 25,
  agentIdentity: 15,
  executionReliability: 20,
  paymentHistory: 10,
  serviceReliability: 15,
  contractTransparency: 15,
} as const;

const CONFIDENCE_FACTOR = {
  high: 1,
  medium: 0.85,
  low: 0.65,
} as const;

function clampScore(score: number) {
  return Math.max(0, Math.min(100, Math.round(score)));
}
export function scoreCategory(input: {
  score: number | null;
  confidence: ScoreCategory["confidence"];
  summary: string;
  positiveSignals?: EvidenceItem[];
  reviewItems?: EvidenceItem[];
}): ScoreCategory {
  const positiveSignals = input.positiveSignals ?? [];
  const reviewItems = input.reviewItems ?? [];
  return {
    score: input.score === null ? null : clampScore(input.score),
    confidence: input.confidence,
    evidenceCount: positiveSignals.length + reviewItems.length,
    summary: input.summary,
    positiveSignals,
    reviewItems,
  };
}

export function calculateTrustScore(
  categories: TrustScore["categories"],
): TrustScore {
  const entries = Object.entries(categories).filter(
    (entry): entry is [keyof typeof AGENT_TRUST_WEIGHTS, ScoreCategory] =>
      entry[0] in AGENT_TRUST_WEIGHTS &&
      Boolean(entry[1]) &&
      entry[1]!.score !== null,
  );
  const excludedCategories = Object.keys(AGENT_TRUST_WEIGHTS)
    .filter((key) => !entries.some(([entryKey]) => entryKey === key));

  if (entries.length < 2) {
    return {
      overall: null,
      status: "limited_data",
      categories,
      excludedCategories,
    };
  }

  const weighted = entries.map(([key, category]) => {
    const effectiveWeight =
      AGENT_TRUST_WEIGHTS[key] * CONFIDENCE_FACTOR[category.confidence];
    return {
      value: (category.score ?? 0) * effectiveWeight,
      weight: effectiveWeight,
    };
  });
  const totalWeight = weighted.reduce((sum, item) => sum + item.weight, 0);
  const overall = clampScore(
    weighted.reduce((sum, item) => sum + item.value, 0) / totalWeight,
  );

  return {
    overall,
    status:
      overall >= 80
        ? "strong_signals"
        : overall >= 60
          ? "review_recommended"
          : "high_attention",
    categories,
    excludedCategories,
  };
}
