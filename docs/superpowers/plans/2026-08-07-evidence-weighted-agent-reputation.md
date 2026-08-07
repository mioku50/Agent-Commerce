# Implementation Plan: P5.3 — Veyra Evidence-Weighted Agent Reputation

This plan outlines the 10 actionable tasks to build, integrate, test, and verify the Veyra Evidence-Weighted Agent Reputation Engine on Arc Testnet.

---

## User Review Checkpoints
No blocking user checkpoints are required during execution. Work proceeds directly through tasks 1 to 10 with empirical test verification at each step.

---

## Tasks Summary

### Task 1: Supabase Database Migration & Database Client Helpers
- Create `supabase/migrations/20260807180000_p53_agent_reputation.sql`.
- Add tables `agent_reputation_evidence` and `agent_reputation_snapshots` with RLS policies.
- Add database helper functions in `lib/reputation/db.ts` for evidence insertion, snapshot querying, and evidence listing.

### Task 2: Core Reputation Engine Architecture & Types
- Create `lib/reputation/types.ts` containing `CanonicalAgentIdentity`, `ReputationEvidence`, `AgentReputationDimensions`, `ReputationSnapshot`, `ReputationExplanation`.
- Create `lib/reputation/engine.ts` with deterministic calculation logic:
  - Temporal decay calculation.
  - Logarithmic economic weighting.
  - Counterparty diversity diminishing returns.
  - Self-rating zero-weight filter.
  - Sybil risk heuristic filter.
  - 6-dimension scoring with dynamic missing-category normalization.
  - Coverage and confidence calculation.
  - Deterministic explanation generation.

### Task 3: Ingestion Adapters for Veyra Infrastructure
- Create `lib/reputation/ingest.ts`:
  - `ingestErc8004Identity()`: Ingests ERC-8004 identity registration as Tier 1 evidence.
  - `ingestErc8183JobOutcome()`: Ingests ERC-8183 job completions (Tier 4/3) and rejections (negative evidence).
  - `ingestErc8004Validation()`: Ingests ERC-8004 validation responses as Tier 2/1 evidence.
  - `ingestX402Payment()`: Ingests confirmed x402 payment receipts as Tier 3 evidence.
  - `ingestVeyraReport()`: Ingests Agent Trust, API Quality, Treasury Health, and Project 360 reports as Tier 2 evidence.

### Task 4: Snapshot Generation & Arc Proof Anchor
- Create `lib/reputation/snapshot.ts`:
  - Builds canonical JSON payload of reputation state.
  - Computes deterministic `canonicalHash`.
  - Registers snapshot on Arc Testnet via `AgentCommerceProofRegistry` or internal proof engine.
  - Stores immutable snapshot record in `agent_reputation_snapshots`.

### Task 5: REST API Endpoints & Sanitization
- Create/Update `app/api/erc8004/v1/reputation/route.ts`:
  - Enhanced to return full canonical reputation metadata while retaining backward compatibility.
- Create `app/api/reputation/v1/agents/[agentId]/route.ts`:
  - GET endpoint returning reputation overview and explanation.
- Create `app/api/reputation/v1/agents/[agentId]/history/route.ts`:
  - GET endpoint returning immutable snapshot timeline.
- Create `app/api/reputation/v1/agents/[agentId]/evidence/route.ts`:
  - GET endpoint returning sanitized evidence list (no secrets, DB IDs, or private keys).

### Task 6: TypeScript SDK & Machine Manifest Capabilities
- Update `lib/sdk/veyra-sdk.ts`:
  - Add `veyra.reputation.getAgent(agentId)`, `veyra.reputation.getHistory(agentId)`, `veyra.reputation.getEvidence(agentId)`.
- Update `app/api/byoa/manifest/route.ts` to export `"agent_reputation"` capability.
- Update `public/openapi.json` to include Reputation v1 API paths.

### Task 7: Public Agent Reputation Page & UI Components
- Update `app/agents/veyra/page.tsx` and create `app/agents/[agentId]/page.tsx`:
  - Hero header with Trust Score (0-100), Confidence badge, Evidence Coverage %.
  - 6 Dimension Cards (Identity, Execution, Validation, Economic Reliability, Service Quality, External Reputation).
  - Evidence Breakdown section with Arcscan block explorer links for onchain items.
  - Compact Evidence Badges.
  - Reputation Timeline chart/list.

### Task 8: Automated Event Hooks, Monitoring Alerts & Webhooks
- Update ERC-8183 job completion handlers to auto-ingest evidence and trigger snapshot generation.
- Update Continuous Trust Monitoring (`lib/monitoring/service.ts`) to emit alert when Trust Score drops by >= 10 points or severe negative evidence occurs.
- Update webhook dispatcher (`lib/webhooks/service.ts`) to emit `reputation.updated`, `reputation.degraded`, `reputation.recovered`, `evidence.added`, and `erc8183.job_rejected`.

### Task 9: Unit Test Vectors (A-G) & Productization Tests
- Create `scripts/reputation-tests.mts` implementing Test Vectors A through G:
  - Vector A: New agent (Identity only -> Limited evidence)
  - Vector B: Reliable agent (High score with completed jobs & validations)
  - Vector C: Sybil feedback (Zero economic history, repeated counterparties -> low weight)
  - Vector D: High activity but poor execution (Rejections -> Score decreases)
  - Vector E: Self-rating (Owner rating own agent -> Weight = 0)
  - Vector F: Duplicate evidence (Replay attempt -> Score unchanged)
  - Vector G: Stale agent (Temporal decay applied)
- Create `scripts/reputation-product-test.mts` verifying SDK bindings, OpenAPI specs, machine capability, and sanitization.

### Task 10: Production Acceptance Script, Quality Gate & Push
- Create `scripts/reputation-production-smoke.mts` (15-step production acceptance pipeline).
- Register scripts in `package.json`: `"reputation:test"`, `"reputation:product-test"`, `"reputation:production-smoke"`.
- Execute full regression gate (`npm run erc8183:contract-test`, `npm run erc8183:test`, `npm run erc8004:test`, `npm run reputation:test`, `npm run reputation:product-test`, `npm run reputation:production-smoke`, `npm run lint`, `npm run build`).
- Verify clean git status and push to `main`.
