# Refinements & Fixes for GitHub Due Diligence Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement all 9 fixes requested by the user to ensure private repositories are strictly rejected, `Verified on Arc` requires actual verified proofs, cache hits preserve original `fetchedAt`, partial failures cover all optional endpoints, contributor concentration risk relies on sufficient commit sampling, unchecked data claims are eliminated, deterministic rules strictly align with the spec, template pricing displays exact list prices on Home, and GitHub error parsing relies on typed errors.

**Architecture:**
1. **Server Security & Private Repos (`lib/providers/github.ts`):** Check `repoData.private === true` immediately after fetching repository metadata and throw `github_repository_inaccessible` (HTTP 403).
2. **Arc Proof Badge Integrity (`app/agent-runner/hosted-job-result.tsx`):** Require `view.proofs.length > 0 && view.proofs.every(p => p.status === "verified")` for `Verified on Arc`. Render `Verification pending` if proofs are in-progress, or `Verification unavailable` if none exist.
3. **Cache Timestamp Preservation (`lib/providers/github.ts`):** Keep `cached.snapshot.source.fetchedAt` immutable on cache hits, recalculating only `cacheAgeSeconds`.
4. **Comprehensive Partial Failure Tracking & Warnings (`lib/providers/github.ts`, `lib/agent/github-due-diligence.ts`):** Track all failed optional sub-fetches (workflows, README, SECURITY.md, CONTRIBUTING.md, governance files) in `source.warnings`. If `source.partial === true`, set overall assessment status to `limited_data`.
5. **Sample-Bounded Contributor Concentration & Checked Data Precision (`lib/providers/github.ts`, `lib/agent/github-due-diligence.ts`, `hosted-job-result.tsx`):** Rename properties to `sampledCount` and `sampledTopContributorShare`. Only trigger concentration risk if `commitsSampled >= 10 && topContributorShare >= 80`. Add explicit fetches/checks for `.github/SECURITY.md`, `.github/CONTRIBUTING.md`, `CODEOWNERS`, `.github/CODEOWNERS`, open PRs, and open issues so no claims are unverified.
6. **Deterministic Rule Alignment (`lib/agent/github-due-diligence.ts`):**
   - No Releases -> Status `unknown` + info risk.
   - 1 medium risk -> Overall status `healthy_signals`.
   - 2+ medium risks -> Overall status `review_needed`.
   - `partial === true` -> Overall status `limited_data`.
   - Do NOT use star count as a strength.
7. **Per-Template Public Price on Home (`app/page.tsx`):** Render `From ${template.estimatedSpendUsdc.toFixed(4)} USDC` dynamically per workflow template instead of hardcoding `From 0.002 USDC` for all cards.
8. **Typed GitHub Error Classification (`lib/providers/github-repository-ref.ts`, `app/api/provider/github/repository-intelligence/route.ts`, `lib/errors/humanize-error.ts`):** Export `InvalidGitHubRepositoryError` class and check `err instanceof InvalidGitHubRepositoryError` rather than matching fragile error message text.

---

### Task 1: Server-Side Private Repository Rejection & Typed Error Parsing

**Files:**
- Modify: `lib/providers/github-repository-ref.ts`
- Modify: `lib/providers/github.ts`
- Modify: `app/api/provider/github/repository-intelligence/route.ts`
- Test: `scripts/github-provider-tests.mts`

- [ ] **Step 1: Export `InvalidGitHubRepositoryError` in `lib/providers/github-repository-ref.ts`**

```typescript
export class InvalidGitHubRepositoryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidGitHubRepositoryError";
  }
}
```
Throw `InvalidGitHubRepositoryError` inside `parseGitHubRepositoryInput()`.

- [ ] **Step 2: Add explicit private repo rejection in `lib/providers/github.ts`**

Right after fetching main repo metadata:
```typescript
if (repoData.private === true) {
  throw new ProviderError("github_repository_inaccessible", {
    httpStatus: 403,
    upstreamStatus: 403,
  });
}
```

- [ ] **Step 3: Update `app/api/provider/github/repository-intelligence/route.ts`**

Check `if (err instanceof InvalidGitHubRepositoryError)` to return status 400 `{ error: err.message, reason: "invalid_github_repository" }` cleanly.

- [ ] **Step 4: Update provider tests in `scripts/github-provider-tests.mts`**

Add unit test verifying private repository (`private: true`) throws `github_repository_inaccessible` (403).

- [ ] **Step 5: Run provider tests & commit Task 1**

```bash
node --experimental-transform-types --no-warnings scripts/github-provider-tests.mts && npm run build
git add lib/providers/github-repository-ref.ts lib/providers/github.ts app/api/provider/github/repository-intelligence/route.ts scripts/github-provider-tests.mts
git commit -m "fix(github): enforce private repository rejection and use typed parser errors"
```

---

### Task 2: Cache Timestamp Preservation & Complete Partial Warning Tracking

**Files:**
- Modify: `lib/providers/github.ts`
- Modify: `lib/providers/github-types.ts`
- Test: `scripts/github-provider-tests.mts`

- [ ] **Step 1: Fix cache hit timestamp logic in `lib/providers/github.ts`**

On cache hit:
```typescript
const fetchedAtTime = new Date(cached.snapshot.source.fetchedAt).getTime();
const cacheAgeSeconds = Math.max(0, Math.floor((now - fetchedAtTime) / 1000));

return {
  ...cached.snapshot,
  source: {
    ...cached.snapshot.source,
    cacheStatus: "cached",
    cacheAgeSeconds,
  },
};
```
Do NOT overwrite `fetchedAt`.

- [ ] **Step 2: Track optional endpoint failures & governance files**

In `lib/providers/github.ts`:
- Include `.github/SECURITY.md`, `.github/CONTRIBUTING.md`, `CODEOWNERS`, `.github/CODEOWNERS` in content checks.
- Add GET `/repos/{owner}/{name}/pulls?state=open&per_page=1` and GET `/repos/{owner}/{name}/issues?state=open&per_page=1` via `Promise.allSettled()`.
- Append warnings to `source.warnings` if contents, workflows, README, SECURITY, CONTRIBUTING, or PR endpoints fail (e.g. `"workflows_unavailable"`, `"security_policy_unavailable"`, `"pull_requests_unavailable"`).
- Set `source.partial = true` if `warnings.length > 0`.

- [ ] **Step 3: Run provider tests & commit Task 3**

```bash
node --experimental-transform-types --no-warnings scripts/github-provider-tests.mts && npm run build
git add lib/providers/github-types.ts lib/providers/github.ts scripts/github-provider-tests.mts
git commit -m "fix(github): preserve cached fetchedAt timestamp and track all optional endpoint warnings"
```

---

### Task 3: Contributor Concentration & Deterministic Due Diligence Rule Alignment

**Files:**
- Modify: `lib/providers/github-types.ts`
- Modify: `lib/agent/github-due-diligence.ts`
- Test: `scripts/github-due-diligence-tests.mts`

- [ ] **Step 1: Update contributor field naming in `github-types.ts`**

Rename properties in snapshot schema:
- `sampledCount`: number of sampled contributors
- `sampledTopContributorShare`: percentage share among sampled contributors

- [ ] **Step 2: Update deterministic rules in `lib/agent/github-due-diligence.ts`**

- **Release Discipline:** No releases -> status `unknown` + `no_github_releases` info finding (instead of `weak`).
- **Contributor Concentration Risk:** Only create `single_contributor_concentration` risk if `commitsSampled >= 10 && topContributorShare >= 80`.
- **Overall Status Calculation:**
  - `limited_data`: if `snapshot.source.partial === true` or required metadata incomplete.
  - `high_attention`: if at least 1 `high` risk.
  - `review_needed`: if at least 2 `medium` risks (`mediumRisks.length >= 2`).
  - `healthy_signals`: if 0 `high` risks and fewer than 2 `medium` risks (`mediumRisks.length < 2`).
- **Strengths:** Remove `stars` count as a strength. Include actual verified evidence (e.g. active commits, releases, governance files).

- [ ] **Step 3: Run due diligence engine tests & commit Task 3**

```bash
node --experimental-transform-types --no-warnings scripts/github-due-diligence-tests.mts && npm run build
git add lib/providers/github-types.ts lib/agent/github-due-diligence.ts scripts/github-due-diligence-tests.mts
git commit -m "fix(github): align deterministic rules, overall status thresholds, and sample-bounded concentration risk"
```

---

### Task 4: Arc Proof Badge Integrity & GitHub Report UI Precision

**Files:**
- Modify: `app/agent-runner/hosted-job-result.tsx`
- Test: `scripts/frontend-ux-tests.mts`

- [ ] **Step 1: Fix `Verified on Arc` badge condition in `hosted-job-result.tsx`**

```typescript
const isVerifiedOnArc =
  view.proofs.length > 0 &&
  view.proofs.every((proof) => proof.status === "verified");

const isVerificationPending =
  view.proofs.length > 0 &&
  view.proofs.some((proof) => proof.status === "pending" || proof.status === "submitted");
```

Render badge appropriately:
- `Verified on Arc` (emerald badge) if `isVerifiedOnArc` is true.
- `Verification pending` (amber badge) if `isVerificationPending` is true.
- `Verification unavailable` (muted badge) if no proofs exist or proof status failed.

- [ ] **Step 2: Update contributor concentration UI copy & verified data claims**

- Contributor card UI: display `"Based on sampled contributor data"`.
- Verify no false claims exist for unchecked endpoints.

- [ ] **Step 3: Run build & UX tests & commit Task 4**

```bash
npm run frontend:ux-test && npm run build
git add app/agent-runner/hosted-job-result.tsx scripts/frontend-ux-tests.mts
git commit -m "fix(ui): enforce verified proof requirement for Arc badge and clarify sampled contributor data"
```

---

### Task 5: Per-Template Public List Price Display on Home

**Files:**
- Modify: `app/page.tsx`
- Test: `scripts/frontend-ux-tests.mts`

- [ ] **Step 1: Update price rendering in `app/page.tsx`**

Replace hardcoded `From 0.002 USDC` in `app/page.tsx`:
```tsx
<p className="text-sm font-semibold text-primary">
  From {template.estimatedSpendUsdc.toFixed(4)} USDC
</p>
```
Displays `From 0.0020 USDC` for GitHub Due Diligence and `From 0.0013 USDC` for standard 2-service workflows.

- [ ] **Step 2: Run build & commit Task 5**

```bash
npm run frontend:ux-test && npm run build
git add app/page.tsx
git commit -m "fix(home): display template-specific public list price on home workflow cards"
```

---

### Task 6: Full Verification & Cleanliness Suite

**Files:**
- Modify: `scripts/verify-public-ui-cleanliness.mts`
- Modify: `scripts/github-provider-tests.mts`
- Modify: `scripts/github-due-diligence-tests.mts`

- [ ] **Step 1: Run full verification suite**

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

- [ ] **Step 2: Commit Task 6**

```bash
git add scripts/verify-public-ui-cleanliness.mts scripts/github-provider-tests.mts scripts/github-due-diligence-tests.mts
git commit -m "test(github): verify all 9 refinements across full test suite"
```
