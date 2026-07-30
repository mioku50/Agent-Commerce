# P2.0 — Agent Commerce Machine API & Governance Hotfix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the Machine API contract (`/api/agent/v1/*`) enabling external AI agents to discover workflows, create quotes, launch runs (sponsored or paid), poll status, and retrieve verified structured JSON reports with Arc proof trails. Also apply the semantic hotfix for governance text in `github-due-diligence.ts`.

---

### Machine API Contract & Endpoints Overview

1. **`GET /api/agent/v1/workflows`**: List available workflow templates, schemas, list prices, and Arc network metadata. Requires Bearer token credential (`workflows:read`).
2. **`POST /api/agent/v1/quotes`**: Create an immutable quote. Requires Bearer token (`quotes:create`) and `Idempotency-Key` header.
3. **`POST /api/agent/v1/runs`**: Launch workflow execution (sponsored or paid with x402 payload). Requires Bearer token (`runs:create`) and `Idempotency-Key` header.
4. **`GET /api/agent/v1/runs/[runId]`**: Poll run execution status (`queued`, `running`, `completed`, `completed_with_warnings`, `failed`, `expired`). Requires Bearer token (`runs:read`).
5. **`GET /api/agent/v1/reports/[reportId]`**: Retrieve structured JSON final report with Arc verification proof metadata. Requires Bearer token (`reports:read`). Scoped to credential/owner.

---

### Task 1: Governance Text Semantic Hotfix & Credential Auth Engine

**Files:**
- Modify: `lib/agent/github-due-diligence.ts`
- Create/Modify: `lib/api/machine-auth.ts`
- Create/Modify: `lib/api/machine-errors.ts`
- Test: `scripts/github-due-diligence-tests.mts`

- [ ] **Step 1: Apply Governance Text Semantic Hotfix in `lib/agent/github-due-diligence.ts`**

Change governance text when governance files (LICENSE, SECURITY, CONTRIBUTING, CODEOWNERS) are absent:
```typescript
const govSignal =
  docStatus === "strong"
    ? "comprehensive governance documentation"
    : hasSec || hasLicense
    ? "standard repository governance"
    : "standard repository structure and CI automation";
```

- [ ] **Step 2: Create `lib/api/machine-errors.ts` for Unified API Error Format**

Define machine error structure:
```typescript
export type MachineErrorCode =
  | "invalid_repository"
  | "repository_not_found"
  | "repository_inaccessible"
  | "credential_missing"
  | "credential_revoked"
  | "scope_denied"
  | "workflow_disabled"
  | "quote_expired"
  | "quote_already_used"
  | "payment_required"
  | "payment_invalid"
  | "spending_limit_exceeded"
  | "run_not_found"
  | "report_not_ready"
  | "provider_unavailable"
  | "rate_limited"
  | "internal_error";

export function createMachineErrorResponse(
  code: MachineErrorCode,
  message: string,
  status = 400,
  retryable = false,
  requestId?: string,
): NextResponse
```
Returns `{ error: { code, message, retryable, requestId: requestId || generateRequestId() } }`.

- [ ] **Step 3: Create `lib/api/machine-auth.ts` for Bearer Credential Verification**

- Extract Bearer token from `Authorization` header.
- Compute SHA-256 hash in constant-time.
- Verify credential exists in DB/active state, checks expiration, revocation, daily call limit, allowed workflows, and required scopes (`workflows:read`, `quotes:create`, `runs:create`, `runs:read`, `reports:read`).
- Returns `MachineAuthContext` containing `credential`, `agentId`, `ownerWallet`, `spendingPolicy`, `allowedWorkflows`.

- [ ] **Step 4: Commit Task 1**

```bash
git add lib/agent/github-due-diligence.ts lib/api/machine-errors.ts lib/api/machine-auth.ts scripts/github-due-diligence-tests.mts
git commit -m "fix(hotfix): update governance summary wording and implement Machine API auth engine"
```

---

### Task 2: Implement Machine API Workflows & Quotes Endpoints

**Files:**
- Create: `app/api/agent/v1/workflows/route.ts`
- Create: `app/api/agent/v1/quotes/route.ts`
- Create: `lib/api/machine-idempotency.ts`
- Test: `scripts/machine-api-tests.mts`

- [ ] **Step 1: Implement `GET /api/agent/v1/workflows`**

- Requires Bearer token with `workflows:read` scope.
- Returns list of active workflow templates (`github_due_diligence`), input JSON schemas, list prices in USDC, and Arc Testnet network metadata (`chainId: 5042002`).

- [ ] **Step 2: Create `lib/api/machine-idempotency.ts` & Implement `POST /api/agent/v1/quotes`**

- Requires `Idempotency-Key` header.
- Reuses existing `createHostedWorkflowQuote` and policy checks.
- Returns immutable quote object `{ quoteId, workflow, repository, totalUsdc, sponsored, expiresAt, requiredPayment }`.
- Deduplicates identical request with same idempotency key + credential without creating double quotes.

- [ ] **Step 3: Commit Task 2**

```bash
git add app/api/agent/v1/workflows/route.ts app/api/agent/v1/quotes/route.ts lib/api/machine-idempotency.ts scripts/machine-api-tests.mts
git commit -m "feat(api): implement Machine API v1 workflows and quotes endpoints with idempotency"
```

---

### Task 3: Implement Machine API Runs & Status Endpoints

**Files:**
- Create: `app/api/agent/v1/runs/route.ts`
- Create: `app/api/agent/v1/runs/[runId]/route.ts`
- Test: `scripts/machine-api-tests.mts`

- [ ] **Step 1: Implement `POST /api/agent/v1/runs`**

- Requires `Idempotency-Key` header and `runs:create` scope.
- Accepts `{ quoteId, paymentAuthorization? }`. Handles both sponsored quota and paid x402 payment.
- Idempotency protection: Duplicate calls return original `runId` and status without charging payment or creating duplicate jobs.
- Returns `{ runId, status: "queued", pollAfterMs: 2000 }`.

- [ ] **Step 2: Implement `GET /api/agent/v1/runs/[runId]`**

- Scoped to credential/owner. Returns 404 or 403 `run_not_found` / `scope_denied` if trying to read another credential's run.
- Returns status (`queued`, `running`, `completed`, `completed_with_warnings`, `failed`, `expired`), progress, and `reportId` when completed.

- [ ] **Step 3: Commit Task 3**

```bash
git add app/api/agent/v1/runs/route.ts app/api/agent/v1/runs/[runId]/route.ts scripts/machine-api-tests.mts
git commit -m "feat(api): implement Machine API v1 runs launch and status polling endpoints"
```

---

### Task 4: Implement Machine API Structured Reports Endpoint & Format Negotiation

**Files:**
- Create: `app/api/agent/v1/reports/[reportId]/route.ts`
- Test: `scripts/machine-api-tests.mts`

- [ ] **Step 1: Implement `GET /api/agent/v1/reports/[reportId]`**

- Scoped to credential/owner.
- Checks `reports:read` scope. Returns 404 `report_not_found` if not ready or owned by another credential.
- Supports `Accept: application/json` (default) and `Accept: text/markdown`.
- JSON Response schema:
  - `reportId`, `workflow`, `repository` (`fullName`, `canonicalUrl`), `status`, `executiveSummary`, `projectPurpose`, `technology`, `activity`, `strengths`, `risks`, `questionsBeforeAdoption`, `confidence`, `verification` (`status`, `network`, `proofs`).

- [ ] **Step 2: Commit Task 4**

```bash
git add app/api/agent/v1/reports/[reportId]/route.ts scripts/machine-api-tests.mts
git commit -m "feat(api): implement Machine API v1 structured JSON report endpoint"
```

---

### Task 5: Developer Console UI, OpenAPI Spec & TypeScript/Python Examples

**Files:**
- Create: `public/openapi/agent-commerce-v1.json`
- Create: `docs/agent-api.md`
- Create: `examples/agent-api/typescript.ts`
- Create: `examples/agent-api/python.py`
- Modify: `app/console/developer-tools/page.tsx` (or `app/console/agent-api/page.tsx`)

- [ ] **Step 1: Create OpenAPI v1 Specification (`public/openapi/agent-commerce-v1.json`)**

Document all 5 machine endpoints, security schemes (Bearer), idempotency headers, request/response bodies, and error codes.

- [ ] **Step 2: Create TypeScript & Python Client Examples**

Create runnable end-to-end examples in `examples/agent-api/typescript.ts` and `examples/agent-api/python.py` demonstrating:
`authenticate -> list workflows -> create quote -> launch run -> poll status -> print structured report -> verify Arc proofs`.

- [ ] **Step 3: Update Developer Console UI**

Add `Agent API` tab under Developer Console with credentials management, API quickstart, OpenAPI download link, and code snippets.

- [ ] **Step 4: Commit Task 5**

```bash
git add public/openapi/agent-commerce-v1.json docs/agent-api.md examples/agent-api/ app/console/
git commit -m "docs(api): add OpenAPI spec, TypeScript and Python SDK examples, and Developer Console API tab"
```

---

### Task 6: Full Verification Suite & End-to-End Machine Test

**Files:**
- Create: `scripts/machine-api-tests.mts`

- [ ] **Step 1: Create Comprehensive Machine API Test Suite (`scripts/machine-api-tests.mts`)**

Test cases:
1. Successful sponsored GitHub run via Machine API.
2. Successful paid x402 run via Machine API.
3. Duplicate quote idempotency.
4. Duplicate run idempotency without double payment.
5. Revoked credential rejection (`credential_revoked`).
6. Missing scope rejection (`scope_denied`).
7. Daily call limit / spending limit exceeded.
8. Expired quote rejection.
9. Polling loop until completed.
10. Retrieving structured JSON report.
11. Reading another credential's report returns 404/403.
12. Partial provider failure produces `completed_with_warnings`.
13. No internal secrets or stack traces in responses.
14. OpenAPI spec validity test.

- [ ] **Step 2: Execute full verification suite (all 13 test commands)**

Run:
```bash
npm run lint
npm run build
npm run frontend:ux-test
npm run frontend:responsive-test
npm run ui:cleanliness-test
npm run hosted:workflow-test
npm run hosted:checkout-test
npm run github:ref-test
npm run github:analysis-test
npm run github:provider-test
npm run github:workflow-test
npm run machine:api-test
npm run review:smoke
```

- [ ] **Step 3: Commit Task 6**

```bash
git add scripts/machine-api-tests.mts package.json
git commit -m "test(api): add comprehensive Machine API v1 regression test suite"
```
