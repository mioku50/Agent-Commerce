# P4.0 — Veyra Paid API Quality Report Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the `paid_api_quality` workflow ("Paid API Quality Report") to analyze, benchmark, and compare paid APIs using real Veyra observation telemetry (uptime, latency P50/P95, response validity, payment execution success, settlement success, cost efficiency, and Arc proof trails).

---

### Key Product & Technical Specifications

1. **Workflow Type & Constants (`lib/agent/hosted-workflows.ts`, `lib/byoa/types.ts`)**:
   - Workflow type identifier: `paid_api_quality`.
   - Name: `Paid API Quality Report`.
   - Description: `Evaluate and compare paid APIs using observed pricing, latency, availability, response validity, payment execution, and settlement history.`
   - Integrated into `HOSTED_WORKFLOW_TYPES`, `CURATED_HOSTED_WORKFLOW_TYPES`, workflow templates, templates home cards, Machine API v1, BYOA policies, OpenAPI spec (`public/openapi/agent-commerce-v1.json`), and SDKs.

2. **Report Modes**:
   - Single Service Review: `{ serviceId: string, observationWindowDays: 7 | 30 | 90 }`.
   - Service Comparison: `{ serviceIds: string[], observationWindowDays: 7 | 30 | 90 }` (min 1, max 5 services).
   - Only public/live seller services. Unknown, private, or internal services return HTTP 404 `api_quality_service_not_found` without leaking tenant presence.

3. **Canonical Observation Data Model (`lib/providers/api-quality-types.ts`, `supabase/migrations/20260730220000_add_api_quality_observations.sql`)**:
   - Table `public.api_quality_observations`:
     `observation_id`, `service_id`, `seller_public_id`, `started_at`, `completed_at`, `quoted_price_usdc`, `paid_amount_usdc`, `latency_ms`, `http_status_class` ("2xx"|"4xx"|"5xx"|"timeout"|"network_error"), `endpoint_reached`, `response_schema_valid`, `response_within_size_limit`, `payment_required`, `payment_authorized`, `payment_settled`, `execution_completed`, `arc_proof_verified`, `error_category` ("none"|"timeout"|"network"|"invalid_response"|"payment_failed"|"settlement_failed"|"execution_failed"|"verification_failed"), `source` ("real_paid_execution"|"scheduled_probe"|"historical_execution").
   - Never stores credentials, Authorization headers, private bodies, or full response bodies.

4. **Metrics Calculation & Quality Score (0–100)**:
   - **Metrics**: `uptimePercent`, `executionSuccessPercent`, `paymentSuccessPercent`, `settlementSuccessPercent`, `validResponsePercent`, `latencyP50Ms`, `latencyP95Ms`, `latencyMaxMs`, `quotedPriceMinUsdc`, `quotedPriceMedianUsdc`, `quotedPriceMaxUsdc`, `costPerSuccessfulResultUsdc`, `firstObservedAt`, `lastObservedAt`.
   - **Score Weights**: Availability (25), Execution Reliability (20), Response Validity (15), Payment Success (15), Settlement Success (15), Latency Consistency (10).
   - **Statuses**: `Excellent` (90–100), `Reliable` (75–89), `Mixed signals` (55–74), `High attention` (0–54).
   - **Sample Bounds**: Minimum 10 eligible observations required for definitive score. `< 10` displays `Insufficient data` / `Limited observation data`.

5. **Unified Report View Model (`lib/reports/api-quality-report.ts`)**:
   - Shared across Public UI, Machine API JSON, Markdown API, and MCP Server.
   - Includes all 15 report sections: Executive Summary, Services Compared, Price and Cost Efficiency, Availability, Latency Distribution, Response Quality, Payment and Settlement Reliability, Observed Failures, Quality Score and Confidence, Evidence-Backed Strengths, Risks and Review Items, Questions Before Integration, Evidence and Observation Window, Limitations, Payment & Arc Verification Details, plus Side-by-Side Comparison for multi-service reports.
   - Numeric metrics formatted as `{ value, isLowerBound, confidence: "high" | "medium" | "low" }`.

6. **Machine API & Arc Proof Integration**:
   - Endpoints `/api/agent/v1/workflows`, `/quotes`, `/runs`, `/reports/[reportId]` updated to support `paid_api_quality`.
   - Verified Arc proof badge requires verified Arc proof record for the canonical report hash.

---

### Task Breakdown & Responsibilities

#### Task 1: Type Definitions, Database Migration & Observation Ingestion Engine
- Create `supabase/migrations/20260730220000_add_api_quality_observations.sql`.
- Create `lib/providers/api-quality-types.ts` & `lib/providers/api-quality.ts`.
- Ingestion engine records observations from real executions, seller endpoint verification, and probes.

#### Task 2: Core Metrics Computation, Quality Score & Comparison Engine
- Implement statistical calculations (P50/P95/Max latency, Uptime %, Execution/Payment/Settlement success %, cost per result).
- Implement 0–100 Quality Score weighting algorithm & confidence level classification (`high`, `medium`, `low`).
- Implement side-by-side comparison matrix builder.

#### Task 3: Centralized Workflow Integration & System Contracts
- Register `paid_api_quality` in `lib/agent/hosted-workflows.ts`, `HOSTED_WORKFLOW_TYPES`, `CURATED_HOSTED_WORKFLOW_TYPES`, BYOA policies, workflow templates, error codes in `lib/api/machine-errors.ts`.
- Update OpenAPI specification `public/openapi/agent-commerce-v1.json`.

#### Task 4: Unified Report View Model (`lib/reports/api-quality-report.ts`)
- Implement `buildApiQualityPublicReport()` generating structured 15-section report.
- Support `Accept: application/json` and `Accept: text/markdown`.

#### Task 5: Public UI Components & Input Form (`app/agent-runner/`, `app/workflows/`, `app/page.tsx`)
- Update Home workflow cards to present Paid API Quality Report.
- Implement UI input form with public service search, 1–5 service selection, window selector (7/30/90 days), and sample size warning.
- Implement side-by-side comparison & single-service review views in `hosted-job-result.tsx`.

#### Task 6: Scheduled Monitoring Probes & Alerts (`app/api/monitoring/`)
- Implement hourly/daily/weekly API Quality Monitoring probe scheduler.
- Separate availability probe from paid execution probe.

#### Task 7: Comprehensive Regression Tests & Full 14-Command Verification Suite
- Create `scripts/api-quality-tests.mts`.
- Register `"api-quality:test"` and `"monitoring:test"` in `package.json`.
- Execute full 14-command verification suite.

---

### Step-by-Step Instructions

- [ ] **Task 1: SQL Migration & Ingestion Engine**
  - Create `supabase/migrations/20260730220000_add_api_quality_observations.sql`.
  - Create `lib/providers/api-quality-types.ts` and `lib/providers/api-quality.ts`.

- [ ] **Task 2: Metrics Computation & Quality Score**
  - Implement metrics & score calculation functions in `lib/providers/api-quality.ts`.

- [ ] **Task 3: Workflow Registration & System Contracts**
  - Update `lib/agent/hosted-workflows.ts`, `lib/byoa/types.ts`, `lib/api/machine-errors.ts`, `public/openapi/agent-commerce-v1.json`.

- [ ] **Task 4: Unified Report View Model**
  - Create `lib/reports/api-quality-report.ts` and integrate in report routes.

- [ ] **Task 5: Public UI & Input Form**
  - Update `app/page.tsx`, `app/agent-runner/hosted-agent-runner.tsx`, `app/agent-runner/hosted-job-result.tsx`.

- [ ] **Task 6: Scheduled Monitoring Probes**
  - Implement monitoring probe route & scheduler in `lib/providers/api-quality.ts`.

- [ ] **Task 7: Regression Tests & Full Suite Verification**
  - Create `scripts/api-quality-tests.mts`, update `package.json`, and run full test suite.
