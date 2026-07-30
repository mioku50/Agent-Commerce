# P2.0.2 — Fail-Closed Idempotency & Credential Isolation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate silent in-memory fallback in production to guarantee durable fail-closed idempotency, enforce multi-layer credential isolation for Machine API runs and reports (preventing same-wallet cross-agent/credential data access), and add a production DB schema verification script.

---

### Tasks Breakdown

#### Task 1: Fail-Closed Production Idempotency (`lib/api/machine-idempotency.ts`, `lib/api/machine-errors.ts`)
- Add `idempotency_store_unavailable` to `MachineErrorCode`.
- Update `lib/api/machine-idempotency.ts`:
  - Define `allowMemoryFallback`: `process.env.NODE_ENV === "test" || process.env.MACHINE_API_ALLOW_MEMORY_IDEMPOTENCY === "true"`.
  - In production (`allowMemoryFallback === false`), if Supabase is unconfigured or returns an error on SELECT/INSERT/UPSERT, return `{ ok: false, unavailable: true }`.
  - Update `quotes` and `runs` endpoints to return HTTP 503 `idempotency_store_unavailable` when `unavailable: true`.

#### Task 2: Supabase Migration & Job Credential Ownership (`supabase/migrations/20260725160000_add_machine_credential_id_to_jobs.sql`, `lib/agent/hosted-jobs.ts`)
- Create migration adding `machine_credential_id` text column to `public.hosted_agent_jobs`.
- Update `lib/agent/hosted-jobs.ts` and `lib/commerce/workflow-checkout.ts` to store `machine_credential_id` on job creation.

#### Task 3: Strict Multi-Layer Credential Isolation for Runs & Reports (`app/api/agent/v1/runs/[runId]/route.ts`, `app/api/agent/v1/reports/[reportId]/route.ts`)
- Update Machine API run polling and report endpoints:
  - Enforce strict ownership matching: `job.byoa_agent_id === context.agentId && job.machine_credential_id === context.credential.id`.
  - Remove `requester_wallet` as an authorization bypass for Bearer Machine API credentials.
  - Return HTTP 404 `run_not_found` / `report_not_found` on mismatch without revealing resource existence.

#### Task 4: Production Database Schema Verification Script (`scripts/verify-production-machine-schema.mts`, `package.json`)
- Create `scripts/verify-production-machine-schema.mts`.
- Register `"machine:production-verify"` script in `package.json`.
- Validates target DB table structure, columns, RLS policies, unique constraints, and write/delete permissions cleanly.

#### Task 5: Comprehensive Regression Tests & Full Verification Suite (`scripts/machine-api-tests.mts`)
- Add regression tests covering:
  1. Fail-closed production idempotency (503 response when DB fails in prod mode).
  2. Memory adapter allowed in test mode.
  3. Same-wallet Agent 2 receiving 404 when querying Agent 1's run or report.
  4. Same-agent Credential 2 receiving 404 when querying Credential 1's resource.
  5. Same credential querying its own run/report succeeds.
  6. Public App wallet access remains functional.
  7. Internal DB errors are never leaked in HTTP response.
- Execute full 14-command verification suite (`npm run machine:production-verify`, `npm run machine:api-test`, `npm run review:smoke`, etc.).

---

### Step-by-Step Instructions

- [ ] **Task 1: Fail-Closed Production Idempotency**
  - Add `idempotency_store_unavailable` code in `lib/api/machine-errors.ts`.
  - Update `lib/api/machine-idempotency.ts` with `allowMemoryFallback` guard.
  - Update `quotes` and `runs` routes to handle `unavailable: true` with HTTP 503.

- [ ] **Task 2: Supabase Migration & Job Credential Ownership**
  - Create `supabase/migrations/20260725160000_add_machine_credential_id_to_jobs.sql`.
  - Update `lib/agent/hosted-jobs.ts` and `lib/commerce/workflow-checkout.ts` to store `machine_credential_id` on job creation.

- [ ] **Task 3: Multi-Layer Credential Isolation for Runs & Reports**
  - Update `app/api/agent/v1/runs/[runId]/route.ts` and `app/api/agent/v1/reports/[reportId]/route.ts` to check `job.machine_credential_id === context.credential.id` and `job.byoa_agent_id === context.agentId`.

- [ ] **Task 4: Production DB Verification Script**
  - Create `scripts/verify-production-machine-schema.mts` and register `"machine:production-verify"` in `package.json`.

- [ ] **Task 5: Regression Tests & Full Suite Execution**
  - Update `scripts/machine-api-tests.mts` with regression test cases and run full test suite.
