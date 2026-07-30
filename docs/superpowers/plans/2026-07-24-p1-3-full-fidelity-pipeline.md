# P1.3 & P1.4 — Full-Fidelity GitHub Analysis Pipeline & Rich Intelligence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the inter-service data pipeline so that full, untruncated GitHub snapshots are passed between paid services in memory (bypassing truncated UI preview strings), construct rich ecosystem/dependency/architecture intelligence from repository files (README, `requirements.txt`, `package.json`, trees), enforce tri-state evidence indicators (`present`, `missing`, `unavailable`), and update Arc proof verification badges for multi-step workflows.

**Architecture:**
1. **Un-truncated Runtime Map (`lib/agent/execution.ts`):** Maintain `runtimeServiceOutputs = new Map<string, unknown>()` in memory during workflow execution. `requestBodyForService` retrieves raw outputs directly from `runtimeServiceOutputs` without reading truncated preview strings.
2. **Snapshot Runtime Guard (`lib/providers/github-types.ts` & `lib/agent/execution.ts`):** Export `isGitHubRepositorySnapshot(value: unknown): value is GitHubRepositorySnapshot`. Preflight step aborts service 2 with `github_snapshot_unavailable` (without charging payment or gateway) if service 1 did not return a valid snapshot.
3. **Workflow Artifacts & Final Report Model (`lib/agent/hosted-workflows.ts` & `lib/agent/execution.ts`):** Store `githubRepositorySnapshot` and `githubDueDiligenceAssessment` inside `BuyerAgentExecutionResult.workflowArtifacts` and pass directly to `HostedFinalReport.workflowData` (version 4).
4. **Rich P1.4 Intelligence Engine (`lib/providers/github.ts`, `lib/agent/github-due-diligence.ts`):**
   - Parse `requirements.txt`, `package.json`, `Cargo.toml`, `pyproject.toml` for `dependencyProfile` and `detectedCapabilities` (API server, Telegram bot, Vector memory, LLM integration, ML, Testing).
   - Infer `projectPurpose` (purpose, capabilities, target users, development stage).
   - Scan structure paths for `sourceDirectories`, `testDirectories`, `dockerFiles`, `entrypoints`.
   - Add Engineering Quality categories (Testing, Dependency Hygiene, Documentation Depth, Deployment Readiness).
5. **Tri-State UI & Coverage-Based Verification Badge (`app/agent-runner/hosted-job-result.tsx`):**
   - Implement `EvidenceState = "present" | "missing" | "unavailable"`. Never display "0" or "Missing" when data is `unavailable`.
   - Require BOTH required services paid AND both proofs verified on-chain for `Verified on Arc`. Show `Partially verified · 1 of 2 steps` when only 1 step is verified.

---

### Task 1: Un-truncated Runtime Map & Snapshot Type Guard

**Files:**
- Modify: `lib/providers/github-types.ts`
- Modify: `lib/agent/execution.ts`
- Test: `scripts/github-workflow-tests.mts`

**Interfaces:**
- Export `isGitHubRepositorySnapshot(value: unknown): value is GitHubRepositorySnapshot`
- Update `requestBodyForService(service, request, runtimeServiceOutputs)`

- [ ] **Step 1: Add `isGitHubRepositorySnapshot` in `lib/providers/github-types.ts`**

```typescript
export function isGitHubRepositorySnapshot(value: unknown): value is GitHubRepositorySnapshot {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return (
    item.version === 1 &&
    Boolean(item.ref && typeof item.ref === "object") &&
    Boolean(item.repository && typeof item.repository === "object") &&
    Boolean(item.activity && typeof item.activity === "object") &&
    Boolean(item.documentation && typeof item.documentation === "object") &&
    Boolean(item.stack && typeof item.stack === "object") &&
    Boolean(item.source && typeof item.source === "object")
  );
}
```

- [ ] **Step 2: Update `lib/agent/execution.ts` runtime outputs map**

In `lib/agent/execution.ts`:
- Maintain `const runtimeServiceOutputs = new Map<string, unknown>();`
- After each successful paid service call: `runtimeServiceOutputs.set(service.slug, result.data);`
- Update `requestBodyForService` signature to accept `runtimeServiceOutputs: ReadonlyMap<string, unknown>`.
- For `github-due-diligence-analysis`:
  ```typescript
  if (service.slug === "github-due-diligence-analysis") {
    const snapshot = runtimeServiceOutputs.get("github-repository-intelligence");
    if (!isGitHubRepositorySnapshot(snapshot)) {
      throw new WorkflowDependencyError(
        "github_snapshot_unavailable",
        "GitHub repository intelligence did not produce a valid snapshot.",
      );
    }
    return { repository, snapshot };
  }
  ```
- Before calling `preflightPaymentRequirement()` for `github-due-diligence-analysis`, check if `isGitHubRepositorySnapshot` is valid; if not, mark step as dependency failure without calling payment gateway.

- [ ] **Step 3: Run workflow tests & commit Task 1**

```bash
node --experimental-transform-types --no-warnings scripts/github-workflow-tests.mts && npm run build
git add lib/providers/github-types.ts lib/agent/execution.ts scripts/github-workflow-tests.mts
git commit -m "fix(execution): use untruncated runtime map and snapshot guard for inter-service pipeline"
```

---

### Task 2: Workflow Artifacts & Final Report Model Integration

**Files:**
- Modify: `lib/agent/execution.ts`
- Modify: `lib/agent/hosted-workflows.ts`

- [ ] **Step 1: Update `BuyerAgentExecutionResult` in `lib/agent/execution.ts`**

Add `workflowArtifacts` to `BuyerAgentExecutionResult`:
```typescript
export type BuyerAgentWorkflowArtifacts = {
  githubRepositorySnapshot?: GitHubRepositorySnapshot;
  githubDueDiligenceAssessment?: GitHubDueDiligenceAssessment;
};
```

During execution:
- After `github-repository-intelligence`: set `artifacts.githubRepositorySnapshot = result.data`.
- After `github-due-diligence-analysis`: set `artifacts.githubDueDiligenceAssessment = result.data.assessment`.

- [ ] **Step 2: Update `buildHostedFinalReport` in `lib/agent/hosted-workflows.ts`**

Construct `workflowData` directly from `executionResult.workflowArtifacts`:
```typescript
workflowData: executionResult.workflowArtifacts.githubRepositorySnapshot
  ? {
      kind: "github_due_diligence",
      repository: request.repository!,
      snapshot: executionResult.workflowArtifacts.githubRepositorySnapshot,
      assessment: executionResult.workflowArtifacts.githubDueDiligenceAssessment ?? null,
    }
  : null,
```

- [ ] **Step 3: Run build & workflow tests & commit Task 2**

```bash
npm run hosted:workflow-test && npm run build
git add lib/agent/execution.ts lib/agent/hosted-workflows.ts
git commit -m "feat(report): pass workflow artifacts directly from execution result to final report"
```

---

### Task 3: Rich P1.4 Ecosystem, Dependency, and Structure Intelligence

**Files:**
- Modify: `lib/providers/github-types.ts`
- Modify: `lib/providers/github.ts`
- Modify: `lib/agent/github-due-diligence.ts`
- Test: `scripts/github-provider-tests.mts`
- Test: `scripts/github-due-diligence-tests.mts`

- [ ] **Step 1: Extend `GitHubRepositorySnapshot` schema in `github-types.ts`**

Add:
- `projectPurpose`: `{ summary: string; capabilities: string[]; targetUsers: string; developmentStage: string }`
- `dependencyProfile`: `{ manifests: string[]; productionDependencies: string[]; developmentDependencies: string[]; detectedCapabilities: string[] }`
- `repositoryStructure`: `{ sourceDirectories: string[]; testDirectories: string[]; entrypoints: string[]; dockerFiles: string[]; configFiles: string[] }`

- [ ] **Step 2: Implement Dependency & Purpose parsing in `lib/providers/github.ts`**

- Parse `requirements.txt` / `pyproject.toml` for Python dependencies (`fastapi`, `uvicorn`, `openai`, `chromadb`, `transformers`, `torch`, `pytest`, `croniter`, `websockets`).
- Parse `package.json` for Node dependencies (`next`, `react`, `express`, `typescript`, `vitest`, `@tanstack/react-query`).
- Extract capabilities (`API server`, `Telegram bot`, `Vector memory`, `LLM integration`, `Machine learning`, `Scheduled jobs`, `Testing`, `WebSockets`).
- Extract directory structure signals from contents listing (`src/`, `lib/`, `tests/`, `test/`, `docker-compose.yml`, `Dockerfile`, `main.py`, `app.py`, `index.ts`).

- [ ] **Step 3: Update `analyzeGitHubDueDiligence` in `lib/agent/github-due-diligence.ts`**

- Include Engineering Quality categories (Testing, Dependency Hygiene, Documentation Depth, Deployment Readiness).
- Generate humanized executive summary incorporating project purpose, stack, and review recommendations.

- [ ] **Step 4: Run provider & due diligence tests & commit Task 3**

```bash
node --experimental-transform-types --no-warnings scripts/github-provider-tests.mts
node --experimental-transform-types --no-warnings scripts/github-due-diligence-tests.mts
npm run build
git add lib/providers/github-types.ts lib/providers/github.ts lib/agent/github-due-diligence.ts scripts/github-provider-tests.mts scripts/github-due-diligence-tests.mts
git commit -m "feat(github): add dependency profiling, repository structure signals, and engineering quality analysis"
```

---

### Task 4: Tri-State UI & Required-Service Proof Coverage Badge

**Files:**
- Modify: `app/agent-runner/hosted-job-result.tsx`
- Modify: `lib/errors/humanize-error.ts`
- Test: `scripts/frontend-ux-tests.mts`

- [ ] **Step 1: Implement `EvidenceState` in `hosted-job-result.tsx`**

```typescript
export type EvidenceState = "present" | "missing" | "unavailable";
```
- Render `Present` (green badge) if file/metric was verified present.
- Render `Missing` (amber badge) if endpoint succeeded and confirmed item is absent.
- Render `Unavailable` (gray badge) if snapshot/endpoint data was not collected or failed. Never display "0" or "Missing" when data is `unavailable`.

- [ ] **Step 2: Update Arc Verification Badge for required services**

For `github_due_diligence`:
- Both required services paid & verified -> `Verified on Arc` (emerald)
- 1 required service paid & verified -> `Partially verified · 1 of 2 steps` (amber)
- Proofs pending -> `Verification pending` (amber)
- Step 2 failed -> `Verification incomplete` (muted)

- [ ] **Step 3: Update Humanized Errors**

Add `github_snapshot_unavailable` -> Title: `Repository analysis unavailable`, Message: `GitHub data was collected, but could not be passed to the analysis step. No charge was made for the failed analysis service.`

- [ ] **Step 4: Run UX tests & commit Task 4**

```bash
npm run frontend:ux-test && npm run build
git add app/agent-runner/hosted-job-result.tsx lib/errors/humanize-error.ts scripts/frontend-ux-tests.mts
git commit -m "fix(ui): add tri-state evidence indicators and multi-step Arc verification coverage"
```

---

### Task 5: End-to-End Chaining & Full Verification Suite

**Files:**
- Modify: `scripts/github-workflow-tests.mts`
- Modify: `package.json`

- [ ] **Step 1: Add large payload (>1600 chars) chaining test in `scripts/github-workflow-tests.mts`**

Add test where GitHub snapshot payload exceeds 1600 characters:
- Verify `responsePreview.truncated === true`
- Verify `github-due-diligence-analysis` receives full untruncated `GitHubRepositorySnapshot` via `runtimeServiceOutputs`
- Verify `workflowData.snapshot` in Final Report contains full README excerpt and `requirements.txt` dependency profile.

- [ ] **Step 2: Execute full verification suite**

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
npm run review:smoke
```

- [ ] **Step 3: Commit Task 5**

```bash
git add scripts/github-workflow-tests.mts package.json
git commit -m "test(github): add large payload chaining regression test and verify full pipeline"
```
