# P1 — GitHub Project Due Diligence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement **GitHub Project Due Diligence** (`github_due_diligence`) as the flagship primary workflow for Arc Agent Commerce, allowing users to analyze any public GitHub repository for evidence-backed activity, release discipline, documentation completeness, and project risks in a single 2-step paid workflow (`github-repository-intelligence` -> `github-due-diligence-analysis`) with Arc verification, while resolving the two P0 UX debt items.

**Architecture:**
1. **P0 UX Debt Cleanup:** Update Home template cards to display `From 0.002 USDC` and benefit labels (`Text analysis · Shareable report · Arc verification`), and clean `/results` report cards (removing `Input preview`, converting title/subtitle to crisp product format).
2. **GitHub Repository Reference Parser (`lib/providers/github-repository-ref.ts`):** Strictly parse and validate `owner/repo`, `github.com/owner/repo`, `https://github.com/owner/repo`, normalizing to canonical `GitHubRepositoryRef`. Reject non-GitHub hosts, private repos, or invalid path formats without performing network calls.
3. **GitHub Upstream Client & Provider Service (`lib/providers/github.ts` & `app/api/provider/github/repository-intelligence/route.ts`):** Build a server-side client for `https://api.github.com` using optional `GITHUB_TOKEN` and 5-minute cache. Collect repository metadata, sampled commits (max 100), releases, contributors, languages, manifests, and governance file presence without executing code or downloading binaries.
4. **Deterministic Due Diligence Engine (`lib/agent/github-due-diligence.ts` & `app/api/premium/github/due-diligence/route.ts`):** Implement transparent assessment categories (Development Activity, Maintenance, Documentation, Release Discipline, Contributor Distribution, Automation) and severity-coded risk rules (`high`, `medium`, `low`, `info`) without opaque trust scores or security/investment claims.
5. **Workflow & Data Model Integration (`lib/agent/workflow-templates.ts`, `lib/agent/hosted-workflows.ts`):** Register `github_due_diligence` as the first/default workflow. Update `HostedWorkflowRequest` with `repository: GitHubRepositoryRef | null` and update Final Report model (version 4) with `workflowData`.
6. **Flagship UI & Specialized Report Renderer:** Redesign Home hero to feature GitHub repository input. Build dedicated GitHub report view in `app/agent-runner/hosted-job-result.tsx` with executive summary, health signal cards, activity breakdown, release discipline, governance files, strengths, risks, questions, and collapsible payment & verification details.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS v4, Lucide Icons, Viem, Arc Testnet.

## Global Constraints

- **Flagship Workflow:** `github_due_diligence` must be the first item in `HOSTED_WORKFLOW_TYPES` and default on `/agent-runner`.
- **Commerce Core:** Maintain single user payment (0.002 USDC list price), max 3 paid calls, x402 downstream payments, receipts, Arc proof registry, and idempotency guarantees.
- **Upstream Safety:** Fetch strictly from `https://api.github.com`. Never execute repository code, download archives/binaries, or fetch user-supplied URLs. Never expose `GITHUB_TOKEN`.
- **No False Claims:** Report must explicitly state: "This is a repository health and activity report, not a security audit or investment recommendation." Never use "Safe/Unsafe", "Legit/Scam", or "Investment grade" labels.
- **Consumer Public UI:** Keep receipts, proofs, provider costs, and execution details inside collapsible `<details>` blocks.

---

### Task 1: P0 UX Debt Fixes (Home Template Cards & Reports Card Redesign)

**Files:**
- Modify: `app/page.tsx`
- Modify: `app/results/page.tsx`
- Modify: `lib/agent/workflow-templates.ts`
- Test: `scripts/frontend-ux-tests.mts`

**Interfaces:**
- `hostedWorkflowTemplates` benefit labels for public view.

- [ ] **Step 1: Fix Home workflow templates pricing & service benefit text (`app/page.tsx`)**

In `app/page.tsx`:
- Change price label from `est. 0.0013 USDC` to `From 0.002 USDC` (or `See final price`).
- Change service labels from internal names (`Text Analyzer + Premium Quote`) to user-facing benefits (`Text analysis · Shareable report · Arc verification`).

- [ ] **Step 2: Clean `/results` report cards (`app/results/page.tsx`)**

In `app/results/page.tsx`:
- Remove `Input preview: ...` text from level-1 card.
- Format card header cleanly:
  - Title: Crisp workflow title (e.g. `SOL/USD Market Context` or `Sentiment & Tone Report`).
  - Subtitle / Summary: `Live market snapshot with freshness and confidence analysis.`
  - Footer details: `3 key findings` · `Generated Jul 20, 2026`.

- [ ] **Step 3: Update UX test assertions**

Update `scripts/frontend-ux-tests.mts` to check for benefit labels and crisp report card layout.

- [ ] **Step 4: Run build & UX tests**

Run: `npm run frontend:ux-test && npm run build`
Expected: PASS

- [ ] **Step 5: Commit Task 1**

```bash
git add app/page.tsx app/results/page.tsx lib/agent/workflow-templates.ts scripts/frontend-ux-tests.mts
git commit -m "fix(ux): update home template pricing to public list price and clean results cards"
```

---

### Task 2: GitHub Repository Reference Parser (`lib/providers/github-repository-ref.ts`)

**Files:**
- Create: `lib/providers/github-repository-ref.ts`
- Test: `scripts/github-repository-ref-tests.mts`

**Interfaces:**
- Export `type GitHubRepositoryRef = { owner: string; name: string; fullName: string; canonicalUrl: string; };`
- Export `parseGitHubRepositoryInput(input: unknown): GitHubRepositoryRef`

- [ ] **Step 1: Create `lib/providers/github-repository-ref.ts`**

```typescript
/**
 * Copyright 2026 Circle Internet Group, Inc. All rights reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

export type GitHubRepositoryRef = {
  owner: string;
  name: string;
  fullName: string;
  canonicalUrl: string;
};

export function parseGitHubRepositoryInput(input: unknown): GitHubRepositoryRef {
  if (typeof input !== "string" || !input.trim()) {
    throw new Error("Enter a public GitHub repository URL or owner/repository.");
  }

  let raw = input.trim();
  // Strip protocol and trailing slashes
  raw = raw.replace(/^https?:\/\//i, "").replace(/\/+$/, "");

  // Handle hostname
  if (raw.startsWith("github.com/")) {
    raw = raw.slice("github.com/".length);
  } else if (raw.startsWith("www.github.com/")) {
    raw = raw.slice("www.github.com/".length);
  } else if (raw.includes("://") || raw.includes("/")) {
    if (/^(?:gitlab|bitbucket|example|127\.0\.0\.1|localhost)/i.test(raw)) {
      throw new Error("Only public GitHub repositories (github.com) are supported.");
    }
  }

  // Strip .git suffix
  raw = raw.replace(/\.git$/i, "");

  // Strip path subpages (/tree/main, /blob/main/README.md, etc.)
  const parts = raw.split("/").filter(Boolean);
  if (parts.length < 2) {
    throw new Error("Enter a valid GitHub repository in owner/repository format.");
  }

  const owner = parts[0];
  const name = parts[1];

  // Validation
  if (!/^[a-z0-9_.-]+$/i.test(owner) || !/^[a-z0-9_.-]+$/i.test(name)) {
    throw new Error("Repository owner and name contain invalid characters.");
  }

  const canonicalOwner = owner.toLowerCase();
  const canonicalName = name.toLowerCase();
  const fullName = `${canonicalOwner}/${canonicalName}`;

  return {
    owner: canonicalOwner,
    name: canonicalName,
    fullName,
    canonicalUrl: `https://github.com/${canonicalOwner}/${canonicalName}`,
  };
}
```

- [ ] **Step 2: Create unit tests `scripts/github-repository-ref-tests.mts`**

Test valid inputs:
- `owner/repo`
- `github.com/owner/repo`
- `https://github.com/owner/repo`
- `https://github.com/owner/repo.git`
- `https://github.com/owner/repo/tree/main`

Test rejected inputs:
- `https://gitlab.com/owner/repo`
- `http://127.0.0.1/repo`
- `owner`
- empty string

- [ ] **Step 3: Run ref tests**

Run: `node --experimental-transform-types --no-warnings scripts/github-repository-ref-tests.mts`
Expected: PASS

- [ ] **Step 4: Commit Task 2**

```bash
git add lib/providers/github-repository-ref.ts scripts/github-repository-ref-tests.mts
git commit -m "feat(github): add repository reference parser and validation"
```

---

### Task 3: Server-Side GitHub Upstream Client & Provider Service

**Files:**
- Create: `lib/providers/github-types.ts`
- Create: `lib/providers/github.ts`
- Create: `app/api/provider/github/repository-intelligence/route.ts`
- Test: `scripts/github-provider-tests.mts`

**Interfaces:**
- Export `GitHubRepositorySnapshot` schema and types.
- Export `fetchGitHubRepositorySnapshot(ref: GitHubRepositoryRef): Promise<GitHubRepositorySnapshot>`
- Route: `POST /api/provider/github/repository-intelligence` (Service slug: `github-repository-intelligence`, 0.0015 USDC)

- [ ] **Step 1: Create `lib/providers/github-types.ts`**

Define `GitHubRepositorySnapshot` (version 1) containing `repository`, `activity`, `contributors`, `releases`, `collaboration`, `documentation`, `stack`, `excerpts`, `source`.

- [ ] **Step 2: Create `lib/providers/github.ts`**

Implement `fetchGitHubRepositorySnapshot(ref)` fetching from `https://api.github.com` with:
- Required GET `/repos/{owner}/{name}`
- Parallel GETs via `Promise.allSettled()` for `/commits`, `/releases`, `/contributors`, `/languages`, `/contents`, `.github/workflows`
- Excerpt extraction for README, SECURITY.md, LICENSE (bounded to 128KB per file)
- 5-minute server-side in-memory cache keyed by `fullName`
- No GITHUB_TOKEN leakage.

- [ ] **Step 3: Create `app/api/provider/github/repository-intelligence/route.ts`**

Register x402 payment challenge endpoint returning structured `github-repository-intelligence` snapshot.

- [ ] **Step 4: Create `scripts/github-provider-tests.mts`**

Test provider snapshot construction, fallback handling, and secret redaction.

- [ ] **Step 5: Run provider tests**

Run: `node --experimental-transform-types --no-warnings scripts/github-provider-tests.mts`
Expected: PASS

- [ ] **Step 6: Commit Task 3**

```bash
git add lib/providers/github-types.ts lib/providers/github.ts app/api/provider/github/repository-intelligence/route.ts scripts/github-provider-tests.mts
git commit -m "feat(github): add server-side repository intelligence provider service"
```

---

### Task 4: Deterministic Due Diligence Analysis Engine

**Files:**
- Create: `lib/agent/github-due-diligence.ts`
- Create: `app/api/premium/github/due-diligence/route.ts`
- Test: `scripts/github-due-diligence-tests.mts`

**Interfaces:**
- Export `analyzeGitHubDueDiligence(snapshot: GitHubRepositorySnapshot): GitHubDueDiligenceAssessment`
- Route: `POST /api/premium/github/due-diligence` (Service slug: `github-due-diligence-analysis`, 0.0005 USDC)

- [ ] **Step 1: Create `lib/agent/github-due-diligence.ts`**

Implement deterministic assessment categories:
- Development Activity (`strong`, `moderate`, `weak`, `unknown`)
- Maintenance
- Documentation
- Release Discipline
- Contributor Distribution
- Automation

Implement structured risk rules:
- `repository_archived` (`high`)
- `stale_development` (`high`)
- `low_recent_activity` (`medium`)
- `missing_license` (`medium`)
- `missing_readme` (`medium`)
- `single_contributor_concentration` (`medium`)
- `missing_security_policy` (`low`)
- `no_ci_detected` (`low`)
- `repository_is_fork` (`info`)
- `no_github_releases` (`info`)

Implement overall status (`healthy_signals`, `review_needed`, `high_attention`, `limited_data`).

- [ ] **Step 2: Create `app/api/premium/github/due-diligence/route.ts`**

Register `github-due-diligence-analysis` x402 service endpoint accepting `{ snapshot }` and returning `{ assessment }`.

- [ ] **Step 3: Create `scripts/github-due-diligence-tests.mts`**

Verify deterministic rules return exact same outputs for identical snapshots, archived repos trigger high risk, missing license triggers medium risk, etc.

- [ ] **Step 4: Run assessment tests**

Run: `node --experimental-transform-types --no-warnings scripts/github-due-diligence-tests.mts`
Expected: PASS

- [ ] **Step 5: Commit Task 4**

```bash
git add lib/agent/github-due-diligence.ts app/api/premium/github/due-diligence/route.ts scripts/github-due-diligence-tests.mts
git commit -m "feat(github): add deterministic due diligence analysis engine"
```

---

### Task 5: Register Workflow & Update Commerce Execution Engine

**Files:**
- Modify: `lib/agent/workflow-templates.ts`
- Modify: `lib/agent/hosted-workflows.ts`
- Modify: `lib/agent/execution.ts`
- Modify: `lib/services/registry.ts`
- Modify: `app/api/hosted-agent/quotes/route.ts`
- Test: `scripts/github-workflow-tests.mts`

**Interfaces:**
- `HOSTED_WORKFLOW_TYPES` includes `"github_due_diligence"` as first item.
- `HostedWorkflowRequest` contains `repository: GitHubRepositoryRef | null`.
- Final Report model (version 4) supports `workflowData`.

- [ ] **Step 1: Register `github_due_diligence` in `lib/agent/workflow-templates.ts`**

Put `github_due_diligence` first in `HOSTED_WORKFLOW_TYPES` and `hostedWorkflowTemplates`.

- [ ] **Step 2: Register services in `lib/services/registry.ts`**

Add `github-repository-intelligence` and `github-due-diligence-analysis` to official service registry and allowlist.

- [ ] **Step 3: Update `lib/agent/hosted-workflows.ts` & `lib/agent/execution.ts`**

Update `HostedWorkflowRequest` validation, planner snapshot, request hashing, and execution chaining so `github-repository-intelligence` output is extracted from `paidPreviews` and passed to `github-due-diligence-analysis`.

- [ ] **Step 4: Update `app/api/hosted-agent/quotes/route.ts`**

Support `repositoryUrl` parsing for `github_due_diligence` quotes.

- [ ] **Step 5: Create `scripts/github-workflow-tests.mts`**

Test end-to-end workflow planning, 2-service execution sequence, 0.002 USDC pricing, and idempotency protection.

- [ ] **Step 6: Run workflow tests**

Run: `node --experimental-transform-types --no-warnings scripts/github-workflow-tests.mts`
Expected: PASS

- [ ] **Step 7: Commit Task 5**

```bash
git add lib/agent/workflow-templates.ts lib/agent/hosted-workflows.ts lib/agent/execution.ts lib/services/registry.ts app/api/hosted-agent/quotes/route.ts scripts/github-workflow-tests.mts
git commit -m "feat(workflow): register GitHub Project Due Diligence workflow and execution chaining"
```

---

### Task 6: Flagship Public UI & Dedicated GitHub Report Renderer

**Files:**
- Modify: `app/page.tsx`
- Modify: `app/agent-runner/hosted-agent-runner.tsx`
- Modify: `app/agent-runner/hosted-job-result.tsx`

- [ ] **Step 1: Update Home Hero for GitHub Flagship (`app/page.tsx`)**

- Hero Badge: `GitHub Project Intelligence · Arc Testnet`
- Title: `Understand any GitHub project before you build on it`
- Description: `Paste a public repository and receive an evidence-backed report on activity, maintenance, documentation, releases, and project risks.`
- Form: Repository URL input field (`https://github.com/owner/repository`) with `Analyze Repository` button redirecting to `/agent-runner?workflow=github_due_diligence&repository=...`.

- [ ] **Step 2: Update New Report Runner for GitHub Input (`app/agent-runner/hosted-agent-runner.tsx`)**

- Default selected workflow: `GitHub Project Due Diligence`.
- Render `Repository URL` input field with placeholder `https://github.com/owner/repository` and helper `Public GitHub repositories only.` + `Try Example` link.
- Display normalized repository preview (`owner/name` + `github.com/owner/name`).

- [ ] **Step 3: Create Dedicated GitHub Report Renderer (`app/agent-runner/hosted-job-result.tsx`)**

Render GitHub Final Report:
1. Header: `GitHub Project Due Diligence` (`owner/name`), Health Status Badge (`Review recommended`), `Verified on Arc`.
2. Executive Summary (2-4 sentences).
3. Project Overview (description, language, license, branch, archived/fork).
4. Health Signal Cards (Activity, Maintenance, Documentation, Releases, Contributors, Automation).
5. Recent Activity Breakdown.
6. Releases & Documentation Checklist (README, LICENSE, SECURITY, CONTRIBUTING, CODEOWNERS, CI).
7. Technology Stack & Manifests.
8. Strengths & Severity-coded Risks (`High attention`, `Review recommended`, `Additional context`).
9. Questions Before Relying on Project.
10. Evidence & Limitations Disclaimer ("This report analyzes public GitHub metadata...").
11. Collapsible `<details><summary>Payment & verification details</summary>...` at bottom.

- [ ] **Step 4: Run build and UX tests**

Run: `npm run frontend:ux-test && npm run build`
Expected: PASS

- [ ] **Step 5: Commit Task 6**

```bash
git add app/page.tsx app/agent-runner/hosted-agent-runner.tsx app/agent-runner/hosted-job-result.tsx
git commit -m "feat(ui): add GitHub flagship hero and specialized report renderer"
```

---

### Task 7: Humanized GitHub Errors & Developer Console Integration

**Files:**
- Modify: `lib/errors/humanize-error.ts`
- Modify: `app/console/seller/page.tsx`
- Modify: `app/console/audit/page.tsx`

- [ ] **Step 1: Add GitHub error mappings in `lib/errors/humanize-error.ts`**

Map error codes:
- `invalid_github_repository` -> Title: `Invalid GitHub repository`, Message: `Enter a public repository in the format owner/repository.`
- `github_repository_not_found` -> Title: `Repository not found`, Message: `Check the repository URL or confirm that the repository is public.`
- `github_repository_inaccessible` -> Title: `Repository unavailable`, Message: `This report currently supports public GitHub repositories only.`
- `github_rate_limited` -> Title: `GitHub data is temporarily unavailable`, Message: `The GitHub data limit has been reached. Try again later.`
- `github_provider_timeout` -> Title: `GitHub took too long to respond`, Message: `No report was generated. Try again.`
- `github_repository_empty` -> Title: `Repository has no activity to analyze`, Message: `The repository exists, but no commits were found on its default branch.`

- [ ] **Step 2: Expose new services in Developer Console**

In Developer Console (`/console/seller`, `/console/audit`), list `github-repository-intelligence` and `github-due-diligence-analysis`.

- [ ] **Step 3: Run UX tests**

Run: `npm run frontend:ux-test`
Expected: PASS

- [ ] **Step 4: Commit Task 7**

```bash
git add lib/errors/humanize-error.ts app/console/seller/page.tsx app/console/audit/page.tsx
git commit -m "feat(console): add humanized GitHub provider errors and console service listings"
```

---

### Task 8: Package Scripts & Automated Full Verification Suite

**Files:**
- Modify: `package.json`
- Modify: `scripts/verify-public-ui-cleanliness.mts`
- Modify: `scripts/frontend-ux-tests.mts`
- Modify: `scripts/frontend-responsive-smoke.mts`

- [ ] **Step 1: Add package scripts in `package.json`**

```json
"github:ref-test": "node --experimental-transform-types --no-warnings scripts/github-repository-ref-tests.mts",
"github:analysis-test": "node --experimental-transform-types --no-warnings scripts/github-due-diligence-tests.mts",
"github:provider-test": "node --experimental-transform-types --no-warnings scripts/github-provider-tests.mts",
"github:workflow-test": "node --experimental-transform-types --no-warnings scripts/github-workflow-tests.mts"
```

- [ ] **Step 2: Update cleanliness test `scripts/verify-public-ui-cleanliness.mts`**

Ensure `github_due_diligence` workflow input and report views are verified clean of forbidden technical jargon (`GITHUB_TOKEN`, `Authorization`, raw header, `provider cost`, `receipt count`, `idempotency`).

- [ ] **Step 3: Execute complete test suite**

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

- [ ] **Step 4: Commit Task 8**

```bash
git add package.json scripts/verify-public-ui-cleanliness.mts scripts/frontend-ux-tests.mts scripts/frontend-responsive-smoke.mts
git commit -m "test(github): add package test scripts and full verification suite for P1"
```
