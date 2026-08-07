# Design Specification: P5.3 — Veyra Evidence-Weighted Agent Reputation Engine

## 1. Executive Overview

Veyra Evidence-Weighted Agent Reputation Engine calculates a deterministic, explainable, evidence-backed trust score (0–100) for AI agents operating on Arc Testnet. 

Unlike conventional subjective review systems or linear rating averages, Veyra reputation is built directly on top of cryptographically verified infrastructure:
- **ERC-8004 Agent Identity & Validation**
- **ERC-8183 Escrowed Job Lifecycles & Veyra Deliverable Evaluations**
- **x402 Economic Settlement & Payment Receipts**
- **Arc Onchain Proof Registries**
- **Veyra Verification Products (Agent Trust, API Quality, Treasury Health, Project 360)**

---

## 2. Architecture & Data Flow

```
                      ┌───────────────────────────────────────────────┐
                      │ Veyra Evidence-Weighted Agent Reputation      │
                      └───────────────────────┬───────────────────────┘
                                              │
        ┌─────────────────────────────────────┼─────────────────────────────────────┐
        ▼                                     ▼                                     ▼
 ┌──────────────┐                      ┌──────────────┐                      ┌──────────────┐
 │ Identity &   │                      │ Job &        │                      │ Economic &   │
 │ Registries   │                      │ Evaluation   │                      │ Verification │
 └──────┬───────┘                      └──────┬───────┘                      └──────┬───────┘
        │ ERC-8004 Identity                   │ ERC-8183 Job Completion             │ x402 Settlement
        │ ERC-8004 Validation                 │ Veyra Deliverable Verdict           │ Agent Trust Report
        │ ERC-8004 Reputation                 │ Settlement Authorization            │ Arc Proof Registry
        └─────────────────────────────────────┼─────────────────────────────────────┘
                                              ▼
                                 ┌─────────────────────────┐
                                 │ Reputation Evidence Pool│
                                 └────────────┬────────────┘
                                              ▼
                                 ┌─────────────────────────┐
                                 │ Anti-Sybil & Self-Rating│
                                 │ Heuristic Filter        │
                                 └────────────┬────────────┘
                                              ▼
                                 ┌─────────────────────────┐
                                 │ Temporal Decay &        │
                                 │ Log Economic Weighting  │
                                 └────────────┬────────────┘
                                              ▼
                                 ┌─────────────────────────┐
                                 │ 6-Dimension Score Engine│
                                 │ (Normalized Weights)    │
                                 └────────────┬────────────┘
                                              ▼
                                 ┌─────────────────────────┐
                                 │ Veyra Trust Score (0-100)│
                                 │ + Coverage & Snapshot   │
                                 └────────────┬────────────┘
                                              ▼
                      ┌───────────────────────┴───────────────────────┐
                      ▼                                               ▼
          ┌──────────────────────┐                        ┌──────────────────────┐
          │ Public Profile & API │                        │ Monitoring & Webhooks│
          │ /agents/[agentId]    │                        │ Alerting & Push      │
          └──────────────────────┘                        └──────────────────────┘
```

---

## 3. Core Data Structures & Models

### 3.1 Canonical Identity Anchor
```typescript
export type CanonicalAgentIdentity = {
  agentId: string;
  chainId: 5042002;
  identityRegistry: string;
  owner: string;
  metadataUri?: string;
  veyraPublicId?: string;
  verifiedOnchain: boolean;
};
```

### 3.2 Reputation Evidence Item
```typescript
export type ReputationEvidenceType =
  | "erc8004_feedback"
  | "erc8004_validation"
  | "erc8183_job_completed"
  | "erc8183_job_rejected"
  | "erc8183_evaluation"
  | "x402_payment_success"
  | "x402_payment_failure"
  | "veyra_agent_trust"
  | "api_quality"
  | "treasury_health"
  | "project_360"
  | "arc_proof";

export type ReputationEvidenceTier = 0 | 1 | 2 | 3 | 4;

export type SybilRiskLevel = "none" | "low" | "medium" | "high";

export type ReputationEvidence = {
  evidenceId: string;
  agentId: string;
  type: ReputationEvidenceType;
  tier: ReputationEvidenceTier;
  sourceId: string;
  sourceHash?: string;
  score?: number; // 0..100
  positive: boolean;
  confidence: number; // 0..1
  economicValueUsdc?: number;
  counterpartyAddress?: string;
  verifiedOnchain: boolean;
  arcProofVerified: boolean;
  sybilRisk: SybilRiskLevel;
  reason?: string;
  observedAt: string;
  canonicalHash: string;
};
```

---

## 4. Weighting, Decay, Anti-Sybil & Self-Rating Rules

### 4.1 Dimension Weights
```typescript
export const AGENT_REPUTATION_WEIGHTS = {
  identity: 0.15,
  execution: 0.25,
  validation: 0.20,
  economicReliability: 0.20,
  serviceQuality: 0.10,
  reputation: 0.10,
} as const;
```
*Missing Dimensions Rule*: If a dimension has zero evidence items, its weight is omitted, and the remaining active dimensions are dynamically normalized to sum to 100%.

### 4.2 Evidence Tiers
- **Tier 0 (Weight: 0.10)**: Unverified feedback / metadata-only signals.
- **Tier 1 (Weight: 0.35)**: Verified identity-backed feedback/validation.
- **Tier 2 (Weight: 0.65)**: Veyra product evaluations (Agent Trust, API Quality, Treasury Health, Project 360).
- **Tier 3 (Weight: 0.85)**: Economic transactions (x402 payments, funded escrow jobs).
- **Tier 4 (Weight: 1.00)**: Onchain verified outcomes (ERC-8183 completed job + Veyra evaluation + settlement + Arc proof).

### 4.3 Logarithmic Economic Weighting
```typescript
const baseWeight = tierWeight(evidence.tier);
const econMultiplier = Math.min(2.5, Math.log10(1 + (evidence.economicValueUsdc || 0)));
const finalWeight = baseWeight * (1 + econMultiplier);
```

### 4.4 Diminishing Counterparty Returns
For repeated interactions between the same counterparty pair (Agent A ↔ Counterparty B):
- 1st interaction: 100% (1.00)
- 2nd interaction: 70% (0.70)
- 3rd interaction: 50% (0.50)
- 4th+ interaction: 30% (0.30)

### 4.5 Temporal Decay
- `0–30 days`: 1.00
- `31–90 days`: 0.90
- `91–180 days`: 0.75
- `181–365 days`: 0.55
- `365+ days`: 0.35

### 4.6 Strict Self-Rating & Canary Isolation Rule
If `evidence.counterpartyAddress` matches `identity.owner`, or if evidence is marked as Veyra Canary/test identity:
- `reputationWeight = 0`
- `reason = "self_rating"` or `"canary_isolation"`

---

## 5. Database Schema & RLS

Migration file: `supabase/migrations/20260807180000_p53_agent_reputation.sql`

```sql
CREATE TABLE IF NOT EXISTS public.agent_reputation_evidence (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id TEXT NOT NULL,
    evidence_type TEXT NOT NULL,
    tier INT NOT NULL DEFAULT 0,
    source_id TEXT NOT NULL,
    source_hash TEXT,
    score DOUBLE PRECISION,
    positive BOOLEAN NOT NULL DEFAULT TRUE,
    confidence DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    economic_value_usdc DOUBLE PRECISION DEFAULT 0.0,
    counterparty_address TEXT,
    verified_onchain BOOLEAN NOT NULL DEFAULT FALSE,
    arc_proof_verified BOOLEAN NOT NULL DEFAULT FALSE,
    sybil_risk TEXT NOT NULL DEFAULT 'none',
    observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    canonical_hash TEXT NOT NULL,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_agent_evidence_canonical UNIQUE (agent_id, source_id, canonical_hash)
);

CREATE TABLE IF NOT EXISTS public.agent_reputation_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    snapshot_id TEXT UNIQUE NOT NULL,
    agent_id TEXT NOT NULL,
    trust_score INT NOT NULL,
    identity_score INT NOT NULL,
    execution_score INT NOT NULL,
    validation_score INT NOT NULL,
    economic_reliability_score INT NOT NULL,
    service_quality_score INT NOT NULL,
    reputation_score INT NOT NULL,
    coverage DOUBLE PRECISION NOT NULL,
    confidence TEXT NOT NULL,
    status_label TEXT NOT NULL,
    evidence_count INT NOT NULL,
    economic_evidence_count INT NOT NULL,
    canonical_hash TEXT NOT NULL,
    arc_proof_tx TEXT,
    snapshot_payload JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

## 6. Verification & Test Plan

1. **Unit & Engine Test Suite (`scripts/reputation-tests.mts`)**:
   - Vector A: New agent (Identity only -> Limited evidence)
   - Vector B: Reliable agent (High score with completed jobs & validations)
   - Vector C: Sybil feedback (Zero economic history, repeated counterparties -> low weight)
   - Vector D: High activity but poor execution (Rejections -> Score decreases)
   - Vector E: Self-rating (Owner rating own agent -> Weight = 0)
   - Vector F: Duplicate evidence (Replay attempt -> Score unchanged)
   - Vector G: Stale agent (Temporal decay applied)

2. **Productization Test Suite (`scripts/reputation-product-test.mts`)**:
   - Verifies OpenAPI specification exports `/api/reputation/v1/agents/{agentId}`.
   - Verifies Machine Manifest exports `agent_reputation` capability.
   - Verifies TypeScript SDK bindings (`veyra.reputation.getAgent`, `getHistory`, `getEvidence`).
   - Verifies public API sanitization (no internal DB IDs, secrets, or raw wallet metadata).

3. **Production Acceptance Script (`scripts/reputation-production-smoke.mts`)**:
   - Ingests real onchain ERC-8004 identity & ERC-8183 evaluations.
   - Computes reputation snapshot, generates canonical hash, links Arc proof.
   - Verifies API & Public UI endpoints live on Arc Testnet.
