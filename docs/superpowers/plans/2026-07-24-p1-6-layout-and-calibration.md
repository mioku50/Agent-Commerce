# P1.6 — Layout Polish & Precision Calibration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expand completed GitHub reports to full width, collapse progress into a compact header after completion, fix badge wrapping on cards, clean up phrasing (replace "Human Maintainers" with "Sampled Human Contributors", fix double "Python built with Python"), extract English text from bilingual READMEs, expand Python entrypoint detection, and cap Deployment Readiness to Moderate when no entrypoint is found.

**Architecture:**
1. **Full-Width Completed Report Layout (`app/agent-runner/hosted-agent-runner.tsx` & `app/agent-runner/hosted-job-result.tsx`):**
   - Active execution: render 2-column layout (Live progress on left, report preview on right).
   - Completed execution: collapse progress into a compact top summary banner, and expand report container to full width (`w-full` / single column).
2. **Responsive Badge Wrapping (`app/agent-runner/hosted-job-result.tsx`):**
   - Refactor category assessment card headers to stack title and badges gracefully using `flex-wrap` and separate sub-rows so titles and badges never overlap.
3. **Executive Summary & Risk Wording Precision (`lib/agent/github-due-diligence.ts`):**
   - Change stack summary: `"The project is primarily written in {language} and uses {container} for containerization. A test suite and CI automation were detected."` (no "verified test coverage" claims).
   - Change concentration risk wording: `"One account represents {share}% of the sampled lifetime contributions attributed to human contributors."`
   - Rename UI label `Human Maintainers` to `Sampled Human Contributors`.
4. **Bilingual Purpose Text Extraction (`lib/providers/github.ts`):**
   - In `extractProjectSummaryFromReadme`, if text contains bilingual slash separators (e.g. `English phrase / Русский текст`), extract the English segment prior to `/`.
5. **Entrypoint Detection & Deployment Readiness Calibration (`lib/providers/github.ts` & `lib/agent/github-due-diligence.ts`):**
   - Add entrypoint patterns: `run.py`, `agent.py`, `cli.py`, `bot.py`, `app.py`, `main.py`, `__main__.py`, `cmd/*/main.go`, `src/main.py`, `app/main.py`, `packages/*/index.ts`, `services/*/main.py`, `magda_agent/__main__.py`.
   - Calibration Rule: If `entrypoints.length === 0`, `deploymentReadiness` status CANNOT be `strong` (capped at `moderate`).

---

### Task 1: Full-Width Completed Report Layout & Responsive Card Header Badges

**Files:**
- Modify: `app/agent-runner/hosted-agent-runner.tsx`
- Modify: `app/agent-runner/hosted-job-result.tsx`
- Test: `scripts/frontend-responsive-smoke.mts`
- Test: `scripts/frontend-ux-tests.mts`

- [ ] **Step 1: Update Layout Grid in `hosted-agent-runner.tsx`**

- When `view.job.status !== "completed"`: render 2-column grid (`lg:grid-cols-12`, 4 cols progress, 8 cols report).
- When `view.job.status === "completed"`:
  - Render compact top banner: `<div className="rounded-lg border p-4 bg-card flex flex-wrap items-center justify-between gap-3">...</div>` with workflow status, duration, and receipt links inside a collapsible block.
  - Render Final Report in full-width container (`w-full max-w-5xl mx-auto`).

- [ ] **Step 2: Fix Badge Overlap in `hosted-job-result.tsx`**

- Refactor `renderCategoryCard`:
  ```tsx
  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b pb-3 mb-3">
    <h4 className="font-semibold text-sm text-foreground">{category.label}</h4>
    <div className="flex flex-wrap items-center gap-2">
      {renderConfidenceBadge(category.confidence)}
      {renderStatusBadge(category.status)}
    </div>
  </div>
  ```
- Ensure category title and badges never collide or overflow card boundaries.

- [ ] **Step 3: Run UX and responsive tests & commit Task 1**

```bash
npm run frontend:ux-test && npm run frontend:responsive-test && npm run build
git add app/agent-runner/hosted-agent-runner.tsx app/agent-runner/hosted-job-result.tsx scripts/frontend-ux-tests.mts scripts/frontend-responsive-smoke.mts
git commit -m "fix(ui): expand completed report to full width and wrap card header badges responsively"
```

---

### Task 2: Phrasing Precision, Terminology & Bilingual Cleaning

**Files:**
- Modify: `lib/providers/github.ts`
- Modify: `lib/agent/github-due-diligence.ts`
- Modify: `app/agent-runner/hosted-job-result.tsx`
- Test: `scripts/github-provider-tests.mts`
- Test: `scripts/github-due-diligence-tests.mts`

- [ ] **Step 1: Add bilingual slash extraction in `lib/providers/github.ts`**

In `extractProjectSummaryFromReadme`:
```typescript
// If text has bilingual slash format "English text / Russian text", extract English part
if (chosen.includes(" / ")) {
  const parts = chosen.split(" / ").map(p => p.trim());
  const englishPart = parts.find(p => /^[a-z0-9\s.,!?:;()'"-]+$/i.test(p));
  if (englishPart && englishPart.length >= 20) {
    chosen = englishPart;
  }
}
```

- [ ] **Step 2: Update Executive Summary & Concentration Wording in `lib/agent/github-due-diligence.ts`**

- Stack phrasing: `"The project is primarily written in {language} and uses {container} for containerization. A test suite and CI automation were detected."` (Remove double "Python built with Python" and "verified test coverage").
- Concentration risk: `"One account represents {share}% of the sampled lifetime contributions attributed to human contributors."`
- Contributor terminology: Rename `Human Maintainers` to `Sampled Human Contributors`.

- [ ] **Step 3: Run unit tests & commit Task 2**

```bash
node --experimental-transform-types --no-warnings scripts/github-provider-tests.mts
node --experimental-transform-types --no-warnings scripts/github-due-diligence-tests.mts
npm run build
git add lib/providers/github.ts lib/agent/github-due-diligence.ts app/agent-runner/hosted-job-result.tsx scripts/github-provider-tests.mts scripts/github-due-diligence-tests.mts
git commit -m "fix(calibration): clean bilingual readme strings and refine executive summary phrasing"
```

---

### Task 3: Entrypoint Detection & Deployment Readiness Calibration

**Files:**
- Modify: `lib/providers/github.ts`
- Modify: `lib/agent/github-due-diligence.ts`
- Test: `scripts/github-provider-tests.mts`
- Test: `scripts/github-due-diligence-tests.mts`

- [ ] **Step 1: Expand Entrypoint Patterns in `lib/providers/github.ts`**

Add entrypoint file patterns:
`run.py`, `agent.py`, `cli.py`, `bot.py`, `app.py`, `main.py`, `__main__.py`, `cmd/*/main.go`, `src/main.py`, `app/main.py`, `packages/*/index.ts`, `services/*/main.py`, `magda_agent/__main__.py`, `src/agent.py`, `agent/main.py`.

- [ ] **Step 2: Calibrate Deployment Readiness in `lib/agent/github-due-diligence.ts`**

Rule: If `repositoryStructure.entrypoints.length === 0`, `deploymentReadiness` status CANNOT be `strong` (capped at `moderate` max, even if Docker and CI are present).

- [ ] **Step 3: Run provider and due diligence unit tests & commit Task 3**

```bash
node --experimental-transform-types --no-warnings scripts/github-provider-tests.mts
node --experimental-transform-types --no-warnings scripts/github-due-diligence-tests.mts
npm run build
git add lib/providers/github.ts lib/agent/github-due-diligence.ts scripts/github-provider-tests.mts scripts/github-due-diligence-tests.mts
git commit -m "fix(analysis): expand entrypoint detection and cap deployment readiness when entrypoint is absent"
```

---

### Task 4: Full Verification Suite Execution

**Files:**
- Run full verification suite across all 12 scripts.

- [ ] **Step 1: Execute full test suite**

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

- [ ] **Step 2: Commit Task 4**

```bash
git add .
git commit -m "test(github): verify full-width layout and calibrated entrypoint tests"
```
