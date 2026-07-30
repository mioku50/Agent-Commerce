# P2.0.1 — Machine API Production Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hardening Machine API for production serverless execution (durable DB idempotency, strict quote ownership, verified Arc proof checks, unified report view model, accurate payment terminology, separate rate limits, and sanitized production errors).

---

### Tasks & Responsibilities Breakdown

#### Task 1: Supabase Database Migration & Persistent DB Idempotency (`lib/api/machine-idempotency.ts`, `supabase/migrations/`)
- Create migration `supabase/migrations/20260724140000_add_machine_api_idempotency.sql`.
- Update `lib/api/machine-idempotency.ts` to perform atomic reservation in Supabase DB `machine_api_idempotency` table with canonical JSON hash sorting.
- Return `409 idempotency_conflict` when key is reused with a different request payload.
- Fallback to memory store only for local testing when DB is omitted.

#### Task 2: Strict Quote Ownership & Payment Terminology (`app/api/agent/v1/quotes/route.ts`, `app/api/agent/v1/runs/route.ts`)
- Save `byoa_agent_id`, `machine_credential_id`, and `owner_wallet` on created quotes.
- On `POST /api/agent/v1/runs`, check `storedQuote.byoa_agent_id === context.agentId && storedQuote.machine_credential_id === context.credential.id`. Return `404 quote_not_found` on mismatch.
- Update quote response schema with `checkout` (`mode: "sponsored" | "arc_transaction"`, `asset: "USDC"`, `network: "arc-testnet"`) and `downstreamSettlement: "server_side_x402"`.

#### Task 3: Arc Proof Verification Integrity (`app/agent-runner/hosted-job-result.tsx`, `app/api/agent/v1/runs/[runId]/route.ts`)
- Remove any receipt-only fallback for `verified` status!
- Single source of truth: Arc proof records where `status === "verified"`.
- Require 2 actual verified proof records for `Verified 2 of 2`.

#### Task 4: Unified Report View Model (`lib/reports/github-public-report.ts`)
- Create `lib/reports/github-public-report.ts` as the single shared report builder for Public UI, Machine JSON API, Markdown API, and future MCP Server.
- Include all 15 evidence sections and preserve numeric metric structures `{ value, isLowerBound, confidence }`.

#### Task 5: Separate Rate Limits & Error Code Sanitization (`lib/api/machine-auth.ts`, `lib/api/machine-errors.ts`)
- Separate authentication from creation policies (`enforceQuoteCreationPolicy()`, `enforceRunCreationPolicy()`, `enforceReadRateLimit()`).
- Exceeding daily creation limit does NOT block `GET /workflows`, `GET /runs/{id}`, or `GET /reports/{id}`.
- Replace `credential_missing` with `idempotency_key_missing` when `Idempotency-Key` is absent. Add `idempotency_conflict`, `invalid_request`, `quote_not_found`, `verification_pending`.
- Sanitize 500 internal errors: log details to runtime log, return generic `{ error: { code: "internal_error", message: "The request could not be completed.", retryable: true, requestId } }`.

#### Task 6: SDK Quickstarts, OpenAPI Spec & Full Verification Suite (`examples/agent-api/`, `public/openapi/`, `scripts/machine-api-tests.mts`)
- Update TypeScript & Python quickstart examples to handle both sponsored and paid modes (stopping gracefully for paid mode if `PAYMENT_TX_HASH` is missing).
- Update `public/openapi/agent-commerce-v1.json` to match hardened response schemas and error codes.
- Add comprehensive production hardening unit tests in `scripts/machine-api-tests.mts`.
- Run full 13-command verification suite.

---

### Step-by-Step Task Instructions

- [ ] **Task 1: Supabase Migration & DB Idempotency**
  - Create `supabase/migrations/20260724140000_add_machine_api_idempotency.sql`.
  - Update `lib/api/machine-idempotency.ts` with DB atomic reservation and payload hash verification (`409 idempotency_conflict`).

- [ ] **Task 2: Strict Quote Ownership & Payment Terminology**
  - Update quote model & route (`app/api/agent/v1/quotes/route.ts`) to store agent & credential IDs, and return `checkout` and `downstreamSettlement`.
  - Update run route (`app/api/agent/v1/runs/route.ts`) to verify quote ownership and return `404 quote_not_found` on mismatch.

- [ ] **Task 3: Arc Proof Verification Integrity**
  - Update proof evaluation in `app/api/agent/v1/runs/[runId]/route.ts` and `app/agent-runner/hosted-job-result.tsx` to strictly require verified Arc proof records.

- [ ] **Task 4: Unified Report View Model**
  - Create `lib/reports/github-public-report.ts` and integrate in `app/api/agent/v1/reports/[reportId]/route.ts` and UI.

- [ ] **Task 5: Separate Rate Limits & Error Code Sanitization**
  - Refactor `lib/api/machine-auth.ts` and `lib/api/machine-errors.ts` for policy separation, sanitized 500 logs, and exact error codes (`idempotency_key_missing`, `idempotency_conflict`, `quote_not_found`, `verification_pending`).

- [ ] **Task 6: SDK Examples, OpenAPI & Full Verification**
  - Update `examples/agent-api/typescript.ts` and `examples/agent-api/python.py`.
  - Update `public/openapi/agent-commerce-v1.json`.
  - Update `scripts/machine-api-tests.mts` and run full 13-command verification suite.
