# Production Hardening — Veyra Paid API Quality Report Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Perform comprehensive production hardening of the `paid_api_quality` workflow, enforcing fail-closed storage (no silent in-memory fallback in production), corrective SQL migrations for nullable fields, strict RLS policy blocking public table reads, mathematically accurate null metric denominators, independent monitoring test suites, dedicated `api-quality-finalizer` provider service, and full security verification.

---

### Key Requirements & Changes

1. **Fail-Closed Production Storage (`lib/providers/api-quality.ts`)**:
   - Memory fallback allowed ONLY if `process.env.NODE_ENV === "test"` or `process.env.API_QUALITY_ALLOW_MEMORY_STORE === "true"`.
   - If Supabase query fails in production mode, return `{ ok: false, unavailable: true }` and throw/return HTTP 503 `api_quality_observation_store_unavailable`.
   - Do not generate reports, quotes, proofs, or alerts on non-persistent data in production.

2. **Corrective SQL Migration & Nullable Model (`supabase/migrations/20260730235900_fix_api_quality_observations_nullable.sql`, `lib/providers/api-quality-types.ts`)**:
   - Create migration converting `completed_at` to nullable `TIMESTAMPTZ NULL`.
   - Ensure `completedAt`, `latencyMs`, `quotedPriceUsdc`, `paidAmountUsdc`, `responseSchemaValid`, `responseWithinSizeLimit`, `paymentAuthorized`, `paymentSettled` are nullable types.
   - Do not coerce `null` to `false` or `0`.

3. **Strict RLS Policy & Service Exposure (`supabase/migrations/20260730235900_fix_api_quality_observations_nullable.sql`, `lib/providers/api-quality.ts`)**:
   - Drop public read RLS policy `public_read_observations`.
   - Allow only `service_role` to read/write `api_quality_observations`.
   - Sanitize all outputs to public UI and Machine API.
   - Never expose private, draft, disabled, or internalOnly services; return HTTP 404 `api_quality_service_not_found` identically for unknown or private services.

4. **Mathematically Accurate Denominators (`lib/providers/api-quality.ts`, `app/agent-runner/hosted-job-result.tsx`)**:
   - If 0 eligible observations -> metric is `null` (not 0% or 100%).
   - 0 payment attempts -> `paymentSuccessPercent = null`.
   - 0 authorized payments -> `settlementSuccessPercent = null`.
   - UI displays `N/A`, `No observations`, or `Insufficient evidence`.
   - Quality Score evaluated ONLY when eligible observations >= 10.

5. **Independent Test Suites (`package.json`, `scripts/api-quality-tests.mts`, `scripts/monitoring-tests.mts`)**:
   - `npm run api-quality:test` runs `scripts/api-quality-tests.mts`.
   - `npm run monitoring:test` runs `scripts/monitoring-tests.mts`.

6. **Dedicated `api-quality-finalizer` Provider Service (`lib/agent/hosted-workflows.ts`, `app/api/provider/api-quality-finalizer/route.ts`)**:
   - Replace `text-analyzer` and `premium-quote` in `paid_api_quality` planner.
   - Create internalOnly provider service `api-quality-finalizer` with transparent pricing, canonical report hash calculation, and Arc proof publication.

7. **Regression Tests & Verification**:
   - Update test suites covering DB 503 fail-closed behavior, anon RLS denial, null preservation, timeout latency null, N/A payment rendering, private service 404, and separate test execution.
   - Run lint, build, test suites, and review smoke. Do NOT commit or push until complete.

---

### Task Breakdown & Responsibilities

#### Task 1: Fail-Closed Production Storage & Corrective SQL Migration
- Create `supabase/migrations/20260730235900_fix_api_quality_observations_nullable.sql`.
- Update `lib/providers/api-quality-types.ts` and `lib/providers/api-quality.ts`.

#### Task 2: Strict RLS & Private Service Protection
- Revoke public RLS read policy on `api_quality_observations`.
- Enforce strict 404 for private/disabled/unknown services.

#### Task 3: Mathematical Denominators & UI Null Formatting
- Update `computeApiQualityMetrics` in `lib/providers/api-quality.ts`.
- Update UI components in `app/agent-runner/hosted-job-result.tsx`.

#### Task 4: Dedicated `api-quality-finalizer` Provider Service
- Create `app/api/provider/api-quality-finalizer/route.ts`.
- Update `paid_api_quality` planner in `lib/agent/hosted-workflows.ts`.

#### Task 5: Independent Test Suites Restoration & Regression Testing
- Create `scripts/monitoring-tests.mts` and update `scripts/api-quality-tests.mts`.
- Update `package.json`.

#### Task 6: Audit Execution & Final Verification
- Run all 7 verification commands. Present SQL migration, smoke outputs, and RLS denial verification.

---

### Step-by-Step Instructions

- [ ] **Task 1: SQL Migration & Fail-Closed Storage**
  - Create `supabase/migrations/20260730235900_fix_api_quality_observations_nullable.sql`.
  - Update `lib/providers/api-quality.ts` with `isMemoryFallbackAllowed()`.

- [ ] **Task 2: RLS Denial & Private Service Protection**
  - Update RLS policies and service lookup in `lib/providers/api-quality.ts`.

- [ ] **Task 3: Null Denominators & UI Formatting**
  - Update `computeApiQualityMetrics` and `hosted-job-result.tsx`.

- [ ] **Task 4: Dedicated Finalizer Provider**
  - Create `app/api/provider/api-quality-finalizer/route.ts` and update planner.

- [ ] **Task 5: Independent Test Suites & Regressions**
  - Create `scripts/monitoring-tests.mts` and update `scripts/api-quality-tests.mts`.

- [ ] **Task 6: Audit Execution & Final Report**
  - Run test commands, verify RLS denial, and summarize findings.
