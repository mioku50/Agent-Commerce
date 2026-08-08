import type { TrustDecision } from "@/lib/trust-gate/types";

// Global cache to persist across fast refreshes in development
const globalForTrust = globalThis as unknown as {
  trustDecisionsCache: Map<string, TrustDecision> | undefined;
};

export const trustDecisionsCache = globalForTrust.trustDecisionsCache ?? new Map<string, TrustDecision>();

if (process.env.NODE_ENV !== "production") {
  globalForTrust.trustDecisionsCache = trustDecisionsCache;
}
