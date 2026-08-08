import type { TrustDecision, TrustDecisionRequest } from "./types.ts";
import { isExecutableTrustDecision } from "./types.ts";

const DEFAULT_BASE_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

export interface TrustDecisionResponse {
  decision: TrustDecision;
  clearance?: any;
  signature?: string;
}

export interface VerifyResponse {
  valid: boolean;
  signer?: string;
  reason?: string;
  onchainValid?: boolean;
}

export interface LimitsResponse {
  agentId: string;
  limits: {
    erc8183_job: { maxUsdc: number; decision: string };
    x402_payment: { maxUsdc: number; decision: string };
  };
}

export const veyra = {
  trust: {
    async evaluate(request: TrustDecisionRequest): Promise<TrustDecisionResponse> {
      const res = await fetch(`${DEFAULT_BASE_URL}/api/trust/v1/decisions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(request),
      });
      if (!res.ok) throw new Error(`Trust evaluation failed: ${res.status}`);
      return res.json();
    },
    async getDecision(decisionId: string): Promise<TrustDecision | null> {
      const res = await fetch(`${DEFAULT_BASE_URL}/api/trust/v1/decisions/${decisionId}`);
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`Failed to fetch decision: ${res.status}`);
      return res.json();
    },
    async verify(clearance: any, signature: string): Promise<VerifyResponse> {
      const res = await fetch(`${DEFAULT_BASE_URL}/api/trust/v1/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clearance, signature }),
      });
      if (!res.ok) throw new Error(`Verification failed: ${res.status}`);
      return res.json();
    },
    async getLimits(agentId: string): Promise<LimitsResponse> {
      const res = await fetch(`${DEFAULT_BASE_URL}/api/trust/v1/agents/${agentId}/limits`);
      if (!res.ok) throw new Error(`Failed to fetch limits: ${res.status}`);
      return res.json();
    },
  },
};

export async function preflightErc8183Job(params: {
  subjectAgentId: string;
  provider: string;
  budget: number;
}): Promise<{ allowed: boolean; decision: TrustDecision; clearance?: any; signature?: string }> {
  const result = await veyra.trust.evaluate({
    subjectAgentId: params.subjectAgentId,
    counterpartyWallet: params.provider,
    action: "erc8183_job",
    requestedValueUsdc: params.budget,
  });
  const allowed = isExecutableTrustDecision(result.decision.decision);
  return { allowed, ...result };
}

export async function preflightX402Payment(params: {
  subjectAgentId: string;
  seller: string;
  amount: number;
  serviceId?: string;
}): Promise<{ allowed: boolean; decision: TrustDecision; clearance?: any; signature?: string }> {
  const result = await veyra.trust.evaluate({
    subjectAgentId: params.subjectAgentId,
    counterpartyWallet: params.seller,
    action: "x402_payment",
    requestedValueUsdc: params.amount,
    serviceId: params.serviceId,
  });
  const allowed = result.decision.decision === "ALLOW" || result.decision.decision === "ALLOW_WITH_LIMITS";
  return { allowed, ...result };
}
