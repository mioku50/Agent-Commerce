# P1.5 — Accuracy Calibration & Report Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Calibrate GitHub Due Diligence accuracy, eliminate false or overly optimistic claims (e.g. operational maturity with 0 releases, raw HTML in README purpose summaries, bots counted as human maintainers), fetch recursive repository tree structure, separate human vs bot contributors, and add category data confidence levels (`high`, `medium`, `low`).

**Architecture:**
1. **README Sanitizer & Purpose Extractor (`lib/providers/github.ts`):** `extractProjectSummaryFromReadme(readme: string): string | null` strips HTML tags, badge/shields URLs, markdown headers/images/tables, and extracts the first clean prose paragraph (40–500 chars).
2. **Recursive Git Tree API & Nested Entrypoints (`lib/providers/github.ts`):** Query `/repos/{owner}/{name}/git/trees/{branch}?recursive=1` (max 1000 paths, max depth 6). Detect nested entrypoints (`src/main.py`, `app/main.py`, `cmd/server/main.go`, `packages/*/server.ts`).
3. **Precise Windowed Commit Metrics (`lib/providers/github.ts`):** Query 30d, 90d, 180d windows separately with 500-commit pagination bound. Set `isLowerBound: true` and display `500+` when cap is reached.
4. **Bot Detection & Contributor Separation (`lib/providers/github.ts` & `lib/agent/github-due-diligence.ts`):** Detect bots (`login.endsWith("[bot]")`, `type === "Bot"`). Calculate `sampledHumanContributorCount`, `topHumanContributorShare`, `botContributionShare`. Perform team risk evaluation using human accounts only.
5. **Assessment Rules & Operational Maturity Calibration (`lib/agent/github-due-diligence.ts`):**
   - Operational Maturity cannot be `strong` unless releases, automation, testing, documentation, and deployment are all non-weak.
   - Missing license forces overall status to `review_needed` (or `high_attention`).
   - Single `requirements.txt` without dev separation evaluates to `moderate`.
   - Add `confidence: "high" | "medium" | "low"` to each `GitHubCategoryAssessment`.
6. **Executive Summary Prioritization & Tri-State UI (`app/agent-runner/hosted-job-result.tsx`):**
   - Prioritize `assessment?.overallSummary` over technical payment strings.
   - Render human vs bot contributor separation, nested entrypoints, and category confidence badges.

---

### Task 1: README Sanitizer & Recursive Git Tree Inspection

**Files:**
- Modify: `lib/providers/github-types.ts`
- Modify: `lib/providers/github.ts`
- Test: `scripts/github-provider-tests.mts`

- [ ] **Step 1: Implement `extractProjectSummaryFromReadme` in `lib/providers/github.ts`**

```typescript
export function extractProjectSummaryFromReadme(readme: string): string | null {
  if (!readme) return null;
  // 1. Remove HTML blocks/tags (<div ...>, <picture ...>, <img>, <a>, <span>, comments)
  let text = readme
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ");

  // 2. Remove markdown images, links, headers, badges, horizontal rules, TOCs
  text = text
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "") // images
    .replace(/\[!\[[^\]]*\]\([^)]*\)\]\([^)]*\)/g, "") // badge links
    .replace(/https?:\/\/\S+/g, "") // raw URLs
    .replace(/^#{1,6}\s+.*$/gm, "") // headers
    .replace(/^[-*=_]{3,}$/gm, "") // horizontal rules
    .replace(/^>.*$/gm, "") // blockquotes
    .replace(/```[\s\S]*?```/g, "") // code blocks
    .replace(/`[^`]+`/g, ""); // inline code

  // 3. Split into paragraphs and find first clean prose paragraph (40..500 chars)
  const paragraphs = text
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter((p) => p.length >= 40 && !p.startsWith("|") && !p.startsWith("-"));

  if (paragraphs.length === 0) return null;
  const chosen = paragraphs[0];
  return chosen.length > 500 ? chosen.slice(0, 497) + "..." : chosen;
}
```

- [ ] **Step 2: Add Git Tree API recursive directory scanning in `lib/providers/github.ts`**

- Call `GET /repos/{owner}/{name}/git/trees/{defaultBranch}?recursive=1` (with fallback to root contents if call fails or tree is too large).
- Bounded to 1000 paths, max depth 6.
- Detect entrypoints:
  - Python: `main.py`, `app.py`, `server.py`, `src/main.py`, `app/main.py`, `**/__main__.py`
  - Node/TS: `index.ts`, `server.ts`, `src/index.ts`, `src/server.ts`, `app/page.tsx`, `packages/*/index.ts`
  - Go: `main.go`, `cmd/*/main.go`
  - Rust: `src/main.rs`, `src/lib.rs`
- Detect source directories (`src`, `lib`, `app`, `pkg`, `packages`), test directories (`tests`, `test`, `spec`, `__tests__`), docker files (`Dockerfile`, `docker-compose.yml`), entrypoints, and config files.

- [ ] **Step 3: Run provider tests & commit Task 1**

```bash
node --experimental-transform-types --no-warnings scripts/github-provider-tests.mts && npm run build
git add lib/providers/github-types.ts lib/providers/github.ts scripts/github-provider-tests.mts
git commit -m "feat(github): add README sanitizer and recursive git tree scanning"
```

---

### Task 2: Precise Windowed Commit Metrics & Bot Contributor Separation

**Files:**
- Modify: `lib/providers/github-types.ts`
- Modify: `lib/providers/github.ts`
- Modify: `lib/agent/github-due-diligence.ts`
- Test: `scripts/github-provider-tests.mts`

- [ ] **Step 1: Update commit window metrics in `lib/providers/github.ts`**

- Fetch commits for 30d, 90d, 180d windows separately with 500 pagination bound.
- If total fetched === 500: set `isLowerBound = true`.
- Return `commitCount30d`, `commitCount90d`, `commitCount180d`, `commitCount30dIsLowerBound`, `commitCount90dIsLowerBound`, `commitCount180dIsLowerBound`.

- [ ] **Step 2: Add Bot Detection & Contributor Separation**

- Bot check: `login.endsWith("[bot]")` or `type === "Bot"` or known bot logins (`google-labs-jules[bot]`, `devin-ai-integration[bot]`, `dependabot[bot]`, `renovate[bot]`).
- Separate:
  - `sampledHumanContributorCount`
  - `sampledBotContributorCount`
  - `topHumanContributorShare`
  - `botContributionShare`
- Use `human` accounts only when evaluating maintainer concentration and team risk rules in `lib/agent/github-due-diligence.ts`.
- Add neutral signal `Automation-heavy contribution history` when `botContributionShare > 50%`.

- [ ] **Step 3: Run due diligence tests & commit Task 2**

```bash
node --experimental-transform-types --no-warnings scripts/github-due-diligence-tests.mts && npm run build
git add lib/providers/github-types.ts lib/providers/github.ts lib/agent/github-due-diligence.ts scripts/github-provider-tests.mts
git commit -m "feat(github): implement windowed commit bounds and bot contributor separation"
```

---

### Task 3: Assessment Calibration & Category Data Confidence

**Files:**
- Modify: `lib/providers/github-types.ts`
- Modify: `lib/agent/github-due-diligence.ts`
- Test: `scripts/github-due-diligence-tests.mts`

- [ ] **Step 1: Add `confidence` field to `GitHubCategoryAssessment`**

```typescript
export type DataConfidence = "high" | "medium" | "low";

export type GitHubCategoryAssessment = {
  category: string;
  label: string;
  status: AssessmentStatus;
  confidence: DataConfidence;
  evidence: string[];
  findings: string[];
};
```

- Set category confidence:
  - `high`: direct complete data (e.g. Activity, Documentation checklist).
  - `medium`: sampled data or heuristic inference (e.g. Contributor Distribution, Operational Maturity, Dependency Hygiene).
  - `low`: partial/incomplete data or fallback.

- [ ] **Step 2: Calibrate Assessment Rules**

- **Operational Maturity Calibration:**
  - Operational Maturity cannot be `strong` unless `releaseDiscipline === "strong"`, `automation === "strong"`, `testing !== "weak"`, `documentation !== "weak"`, and `deploymentReadiness !== "weak"`.
  - Summary template builds strictly from confirmed category strengths. Never claims "strong release management and governance" if 0 releases or no governance files exist.
- **Dependency Hygiene Calibration:**
  - Single `requirements.txt` without dev separation -> `moderate` ("dependency manifest detected").
  - `strong` only when separate dev manifest, lockfile, or explicit dev dependency section exists.
- **Overall Status Calibration:**
  - Missing license forces overall status to `review_needed` (or `high_attention`).

- [ ] **Step 3: Run due diligence tests & commit Task 3**

```bash
node --experimental-transform-types --no-warnings scripts/github-due-diligence-tests.mts && npm run build
git add lib/providers/github-types.ts lib/agent/github-due-diligence.ts scripts/github-due-diligence-tests.mts
git commit -m "fix(assessment): calibrate operational maturity rules and add category data confidence"
```

---

### Task 4: Executive Summary Prioritization & UI Calibration

**Files:**
- Modify: `app/agent-runner/hosted-job-result.tsx`
- Modify: `scripts/frontend-ux-tests.mts`

- [ ] **Step 1: Update Executive Summary rendering in `hosted-job-result.tsx`**

```typescript
const publicExecutiveSummary =
  assessment?.overallSummary ??
  report?.summary ??
  "Repository analysis is unavailable.";
```
Display `publicExecutiveSummary` at the top of the report card. Move payment API count strings ("completed 2 of 2 paid API calls") strictly to `<details><summary>Payment & verification details</summary>`.

- [ ] **Step 2: Update UI rendering for Commit Bounds, Contributor Types, and Confidence Badges**

- Display `500+` when `isLowerBound` is true.
- Display separate `Human Maintainers` count and `Automation Accounts` count.
- Render `High confidence` / `Medium confidence` / `Low confidence` badges on category cards.
- Render sanitized README project purpose (free of HTML `<div align="center">`).

- [ ] **Step 3: Run UX tests & commit Task 4**

```bash
npm run frontend:ux-test && npm run ui:cleanliness-test && npm run build
git add app/agent-runner/hosted-job-result.tsx scripts/frontend-ux-tests.mts
git commit -m "fix(ui): prioritize public executive summary, render bot separation, and display data confidence"
```

---

### Task 5: Comprehensive Verification & `magda-agent` Fixture Test Suite

**Files:**
- Modify: `scripts/github-due-diligence-tests.mts`
- Modify: `scripts/github-provider-tests.mts`

- [ ] **Step 1: Add `magda-agent` comprehensive fixture test**

Fixture setup:
- README starts with `<div align="center"><img src="..." /><h1>magda-agent</h1></div>`.
- 100+ commits in 90 days (`commitCount90dIsLowerBound: true`).
- 2 bots (`google-labs-jules[bot]`, `devin-ai-integration[bot]`) and 1 human contributor.
- `app/main.py` entrypoint.
- 0 releases, missing license, missing SECURITY.md.

Assert:
- `extractProjectSummaryFromReadme` ignores `<div align="center">` and extracts clean paragraph.
- `commitCount90dDisplay` evaluates to `500+` (or `100+`).
- `sampledHumanContributorCount` === 1, `sampledBotContributorCount` === 2.
- `operationalMaturity` status is NOT `strong`.
- Overall status is `review_needed` due to missing license.
- Nested entrypoint `app/main.py` is detected.
- `publicExecutiveSummary` describes the project rather than API calls.

- [ ] **Step 2: Execute full verification suite (all 12 commands)**

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
git add scripts/github-due-diligence-tests.mts scripts/github-provider-tests.mts
git commit -m "test(github): add magda-agent accuracy calibration regression tests and verify full suite"
```
