# P5.2 — Veyra ERC-8004 Identity, Reputation & Validation Bridge Implementation Plan

This implementation plan details the subtasks required to build, test, and deploy the ERC-8004 Identity, Reputation & Validation Bridge on Arc Testnet for Veyra.

---

## Tasks Overview

- [ ] **Task 1: Canonical Agent Metadata `/.well-known/veyra-agent.json`, Types & DB Schema**
  - Implement `/.well-known/veyra-agent.json` route returning public ERC-8004 metadata.
  - Define TypeScript types in `lib/erc8004/types.ts`.
  - Create Supabase migration / table setup script for `erc8004_agent_identity` and `erc8004_validation_links`.

- [ ] **Task 2: ERC-8004 Client & Identity Registration/Recovery Script**
  - Implement `lib/erc8004/client.ts` with Contract calls to `IdentityRegistry`, `ReputationRegistry`, `ValidationRegistry`.
  - Create `scripts/register-veyra-erc8004-identity.mts` to execute registration, recover `agentId`, verify `ownerOf` / `tokenURI`, and store in database.

- [ ] **Task 3: Public Machine API, Manifest & SDK Bindings**
  - Create API routes `GET /api/erc8004/v1/agent`, `GET /api/erc8004/v1/reputation`, `GET /api/erc8004/v1/validations`, `GET /api/erc8004/v1/validations/[requestHash]`.
  - Export `veyra.erc8004` methods in `lib/erc8004/sdk.ts`.
  - Update `byoaManifest()` in `lib/byoa/service.ts` to include `erc8004` standards and capability details.

- [ ] **Task 4: ERC-8004 Validation Bridge Engine**
  - Implement validation bridge logic linking ERC-8183 evaluation outcomes to ERC-8004 `validationResponse`.
  - Create endpoints `POST /api/erc8004/v1/validations/prepare` and `POST /api/erc8004/v1/validations/respond`.
  - Handle tags: `veyra_erc8183_deliverable_passed`, `veyra_erc8183_deliverable_failed`.

- [ ] **Task 5: External Reputation Reading & Evidence Linkage**
  - Implement reader for external reputation feedback from `ReputationRegistry`.
  - Enforce security boundary: Veyra NEVER writes reputation feedback to itself.
  - Aggregate evidence-linked feedback vs unlinked feedback.

- [ ] **Task 6: Public Trust Identity UI (`/agents/veyra`) & Receipt Links**
  - Build public `/agents/veyra` page displaying Hero, ERC-8004 Agent ID, Registry links, Validations history, Reputation metrics, and Capabilities grid.
  - Update `/evaluations/[publicId]` receipt page to show ERC-8004 Validator Identity & Validation status.
  - Update Developer Console with ERC-8004 Trust Identity card.

- [ ] **Task 7: Test Suite & Quality Gates**
  - Write `scripts/erc8004-tests.mts` and `scripts/erc8004-product-test.mts`.
  - Update `package.json` with `npm run erc8004:test`, `npm run erc8004:product-test`, `npm run erc8004:production-smoke`.
  - Pass full regression suite: `npm run erc8183:contract-test`, `npm run erc8183:test`, `npm run erc8183:product-test`, `npm run erc8004:test`, `npm run erc8004:product-test`, `npm run lint`, `npm run build`.

- [ ] **Task 8: Production Registration & Canary Acceptance**
  - Execute live Arc Testnet identity registration & validation canary.
  - Push all commits to `main`.
