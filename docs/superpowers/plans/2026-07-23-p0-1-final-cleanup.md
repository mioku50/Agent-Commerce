# P0.1 — Final Cleanup of Public App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the UX, copy, error handling, and security hardening of the Public App so that users see only a clean 5-step report generation flow (Home → New Report → Add Input → See Final Price → View Report) with zero technical jargon, receipts, proof counts, spend stats, historical phase strings, or raw error codes on visible public surfaces.

**Architecture:**
1. **Public Copy Sanitization & Helper (`lib/agent/public-report-copy.ts`):** Sanitize historical inputs and summaries (`Phase N`, `FreeModel`) for public view models without modifying database records.
2. **Strict Server-Side Quote Construction (`app/api/hosted-agent/quotes/route.ts` & `[quoteId]/confirm/route.ts`):** Construct server payloads explicitly without spreading browser body; reject browser-supplied `task` and `budgetUsdc`; rely strictly on stored quote data during checkout confirmation.
3. **Structured Error Mapper & Switch Wallet Fix (`lib/errors/humanize-error.ts`):** Map structured error payload (`reason`/`code`) to user-friendly titles, messages, and discrete actions (`switch_network`, `switch_wallet`, `refresh_price`, `open_agent`, `open_policy`, `retry`). Prevent `Switch Wallet` from calling `switchToArc()`.
4. **Navigation & Public Page Polishing:** Rename navigation label from `My Reports` to `Reports`. Clean cards and metrics on `/`, `/agent-runner`, and `/results`. Remove `Recent hosted workflows` block from `/agent-runner`.
5. **Automated Cleanliness & UX Tests (`scripts/verify-public-ui-cleanliness.mts`):** Expand cleanliness regex to detect any `Phase N`, `FreeModel`, receipts, proofs, spend, or jargon on `/`, `/agent-runner`, `/results`, and `/agent-runner/[jobId]`.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS v4, Lucide Icons, Viem, Arc Testnet.

## Global Constraints

- **Navigation:** Public sidebar contains exactly `Home` (`/`), `New Report` (`/agent-runner`), `Reports` (`/results`).
- **Cards & Metrics:** No USDC spend, receipt count, or proof count on level-1 cards on `/` and `/results`. No `Sort by highest spend`.
- **Public Runner:** No `Recent hosted workflows` block on `/agent-runner`. AI notice simplified without `FreeModel` or `deterministic fallback`. Wallet card title: `Payment wallet`. Button copy: `See Final Price`, `Preparing Price…`, `Refresh Price`.
- **Sanitization:** Remove all `Phase N` and `FreeModel` strings from public visible surfaces.
- **Error Mapping:** Match structured `reason`/`code` first. Do NOT classify general network/server errors as `Switch to Arc Testnet`. `Switch Wallet` must not trigger `switchToArc()`.
- **Quote Endpoint:** Never spread browser body or accept client `task`/`budgetUsdc`.
- **No Backend Core Changes:** Do not alter x402 settlement, checkout accounting, idempotency, proof registry, receipts, Seller, BYOA, or Passports.

---

### Task 1: Public Copy Sanitizer & Database Total Count Helper

**Files:**
- Create: `lib/agent/public-report-copy.ts`
- Modify: `lib/agent/hosted-jobs.ts`
- Test: `scripts/frontend-ux-tests.mts`

**Interfaces:**
- Export `sanitizePublicReportText(value: string): string`
- Export `countHostedFinalReports(): Promise<number>`

- [ ] **Step 1: Create `lib/agent/public-report-copy.ts`**

```typescript
/**
 * Copyright 2026 Circle Internet Group, Inc. All rights reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

export function sanitizePublicReportText(value: string): string {
  if (!value) return "";
  return value
    .replace(/\bPhase\s+\d+(?:\.\d+)?\b[:\s-]*/gi, "")
    .replace(/\bFreeModel\b/gi, "AI provider")
    .replace(/\bproject-owned (?:hosted )?payer\b/gi, "payment wallet")
    .replace(/\bdownstream x402\b/gi, "verified data services")
    .replace(/\bdeterministic aggregation\b/gi, "structured analysis")
    .replace(/\s+/g, " ")
    .trim();
}
```

- [ ] **Step 2: Add `countHostedFinalReports()` in `lib/agent/hosted-jobs.ts`**

Add `countHostedFinalReports()` to return the actual total count of completed hosted reports from database/persistence.

- [ ] **Step 3: Add unit tests in `scripts/frontend-ux-tests.mts`**

Assert that `sanitizePublicReportText` strips `"Phase 28: Analyze..."` to `"Analyze..."` and `"FreeModel"` to `"AI provider"`.

- [ ] **Step 4: Run UX test**

Run: `npm run frontend:ux-test`
Expected: PASS

- [ ] **Step 5: Commit Task 1**

```bash
git add lib/agent/public-report-copy.ts lib/agent/hosted-jobs.ts scripts/frontend-ux-tests.mts
git commit -m "feat(copy): add public report copy sanitizer and total report counter"
```

---

### Task 2: Public Navigation & Home Page Cleanup (`app/page.tsx`)

**Files:**
- Modify: `lib/navigation/sidebar.ts`
- Modify: `app/page.tsx`

- [ ] **Step 1: Rename public navigation in `lib/navigation/sidebar.ts`**

Update `publicSidebarNavigation`:
- `Home` (`/`)
- `New Report` (`/agent-runner`)
- `Reports` (`/results`) (renamed from `My Reports`)

- [ ] **Step 2: Clean `app/page.tsx` Recent Reports cards and metrics**

- Update metric card: `Reports generated` -> uses `await countHostedFinalReports()` (or rename card to `Recent reports` with total count).
- Clean level-1 report cards in Recent Reports section:
  - Remove USDC spend (`report.spentUsdc`), receipt count (`report.receiptCount`), Arc proof count (`report.proofCount`).
  - Show: workflow label, summary (sanitized), generated date, status badge, and CTA link (`View Report →`).
- Update section title & CTA:
  - `Recent Results` -> `Recent Reports`
  - `View all results` -> `View all reports` (`/results`)

- [ ] **Step 3: Run build & UX test**

Run: `npm run frontend:ux-test && npm run build`
Expected: PASS

- [ ] **Step 4: Commit Task 2**

```bash
git add lib/navigation/sidebar.ts app/page.tsx
git commit -m "feat(home): update public navigation to Reports and clean Home report cards"
```

---

### Task 3: Clean Reports Page (`app/results/page.tsx` & `lib/agent/results-filters.ts`)

**Files:**
- Modify: `app/results/page.tsx`
- Modify: `lib/agent/results-filters.ts`

- [ ] **Step 1: Update Hero and remove technical jargon**

In `app/results/page.tsx`:
- Badge: `Generated Reports`
- Title: `Reports`
- Description: `Browse completed reports generated by Arc Agent Commerce.`
- Primary CTA: `Create Report` (`/agent-runner`)

- [ ] **Step 2: Remove technical metric cards & spend sorting**

- Remove `Verified proofs` and `Spent` metric cards. Keep at most `Completed reports`.
- In `lib/agent/results-filters.ts`: remove `Highest spend` sort option.
- In `app/results/page.tsx`: remove `Highest spend` from the `<select name="sort">` dropdown.

- [ ] **Step 3: Clean report cards on `/results`**

On level-1 report cards:
- Show: workflow name badge, status badge (`Completed` / `Completed with warnings`), summary (sanitized via `sanitizePublicReportText`), 2-4 key findings, generated date, and `Open Final Report` button.
- Remove: `spentUsdc`, `receiptCount`, `proofCount`, transaction hash, block number, registry contract, input SHA-256, idempotency text.

- [ ] **Step 4: Run tests**

Run: `npm run frontend:ux-test && npm run build`
Expected: PASS

- [ ] **Step 5: Commit Task 3**

```bash
git add app/results/page.tsx lib/agent/results-filters.ts
git commit -m "feat(results): clean Reports page hero, cards, and remove spend sorting"
```

---

### Task 4: Simplify Hosted Agent Runner Page (`app/agent-runner/hosted-agent-runner.tsx` & `lib/agent/hosted-ui.ts`)

**Files:**
- Modify: `app/agent-runner/hosted-agent-runner.tsx`
- Modify: `lib/agent/hosted-ui.ts`

- [ ] **Step 1: Remove `Recent hosted workflows` section**

Remove the `Recent hosted workflows` card section from `/agent-runner`. Add a clean link below the input form:
`<Link href="/results" className="text-xs text-muted-foreground hover:text-foreground">View previous reports →</Link>`

- [ ] **Step 2: Simplify AI processing notice**

Replace LLM notice box with:
```tsx
<div role="note" className="rounded-md border border-amber-400/30 bg-amber-400/5 p-3 text-xs leading-5 text-amber-100">
  <p className="font-semibold">AI processing</p>
  <p className="mt-1">Your input may be processed by an external AI provider to prepare the report. Do not submit private keys, passwords, API keys, or other secrets.</p>
</div>
```

- [ ] **Step 3: Update Wallet Card in `lib/agent/hosted-ui.ts` & component**

In `lib/agent/hosted-ui.ts`:
- Header: `Payment wallet`
- Copy: `Sponsored reports are free. After the free quota, this wallet confirms the displayed total price.`
- Remove terms: `requester`, `workflow payer`, `hosted payer`, `downstream payment`.

- [ ] **Step 4: Simplify Market Asset Helper & Price Button Copy**

- Market asset helper: `Choose the market asset to include in your report.`
- Button CTA labels:
  - Initial: `See Final Price`
  - Loading: `Preparing Price…`
  - Refresh: `Refresh Price`

- [ ] **Step 5: Add technical details disclaimer**

Inside `<details>` technical details block:
`<p className="mb-2 font-medium text-amber-300/80">These details are intended for developers and auditors.</p>`

- [ ] **Step 6: Run build and tests**

Run: `npm run frontend:ux-test && npm run build`
Expected: PASS

- [ ] **Step 7: Commit Task 4**

```bash
git add app/agent-runner/hosted-agent-runner.tsx lib/agent/hosted-ui.ts
git commit -m "feat(runner): remove recent workflows block, simplify AI notice and price CTAs"
```

---

### Task 5: Structured Error Mapper & Switch Wallet Fix (`lib/errors/humanize-error.ts`)

**Files:**
- Modify: `lib/errors/humanize-error.ts`
- Modify: `app/agent-runner/hosted-agent-runner.tsx`

- [ ] **Step 1: Support structured error payload & discrete action types**

Update `lib/errors/humanize-error.ts`:
```typescript
export type HumanizedErrorAction =
  | "switch_network"
  | "switch_wallet"
  | "refresh_price"
  | "open_agent"
  | "open_policy"
  | "retry";

export type HumanizedError = {
  title: string;
  message: string;
  action?: HumanizedErrorAction;
  actionLabel?: string;
  actionHref?: string;
  technicalCode?: string;
};

export function humanizeError(raw: unknown): HumanizedError {
  let messageStr = "";
  let reasonCode = "";

  if (typeof raw === "object" && raw !== null) {
    const obj = raw as Record<string, unknown>;
    reasonCode = String(obj.reason ?? obj.code ?? "");
    messageStr = String(obj.error ?? obj.message ?? "");
  } else if (raw instanceof Error) {
    messageStr = raw.message;
  } else {
    messageStr = String(raw ?? "");
  }

  // Exact reason code matching first
  if (reasonCode === "wallet_already_registered" || messageStr.includes("already registered")) {
    return {
      title: "Wallet already connected",
      message: "This wallet is already assigned to an agent. Open the existing agent or use another wallet.",
      action: "open_agent",
      actionLabel: "Open Agent",
      actionHref: "/console/agents",
      technicalCode: "wallet_already_registered",
    };
  }

  if (reasonCode === "wrong_network" || reasonCode === "unsupported_chain" || reasonCode === "chain_mismatch" || reasonCode === "arc_network_required" || /wrong network|unsupported chain|chain mismatch/i.test(messageStr)) {
    return {
      title: "Switch to Arc Testnet",
      message: "This action requires Arc Testnet.",
      action: "switch_network",
      actionLabel: "Switch Network",
      technicalCode: "wrong_network",
    };
  }

  if (reasonCode === "wallet_mismatch" || (messageStr.includes("wallet") && (messageStr.includes("differs") || messageStr.includes("mismatch")))) {
    return {
      title: "Switch wallet to continue",
      message: "The connected wallet is not the registered agent payment wallet. Open your wallet extension and select the registered account.",
      action: "switch_wallet",
      actionLabel: "How to Switch Wallet",
      technicalCode: "wallet_mismatch",
    };
  }

  // ... (maintain policy_denied, quote_expired, credential_missing mappings)
  // ...
}
```

- [ ] **Step 2: Update error CTA handler in `hosted-agent-runner.tsx`**

In `hosted-agent-runner.tsx`:
- If `humanized.action === "switch_network"`, call `wallet.switchToArc()`.
- If `humanized.action === "switch_wallet"`, do NOT call `wallet.switchToArc()`. If `wallet.openAccountSelector` exists, call it; otherwise show modal/alert instruction: `"Open your wallet extension (MetaMask/Rabby) and switch to the connected account."`
- If `humanized.action === "refresh_price"`, call `preview()`.
- Render raw code inside error alert details: `<details className="mt-2 text-xs"><summary className="cursor-pointer text-muted-foreground">Technical details</summary><code>{humanized.technicalCode}</code></details>`.

- [ ] **Step 3: Run UX tests**

Run: `npm run frontend:ux-test`
Expected: PASS

- [ ] **Step 4: Commit Task 5**

```bash
git add lib/errors/humanize-error.ts app/agent-runner/hosted-agent-runner.tsx
git commit -m "fix(errors): improve structured error mapping and decouple switch wallet from network switch"
```

---

### Task 6: Secure Public Quote & Confirmation Endpoints

**Files:**
- Modify: `app/api/hosted-agent/quotes/route.ts`
- Modify: `app/api/hosted-agent/quotes/[quoteId]/confirm/route.ts`

- [ ] **Step 1: Harden `/api/hosted-agent/quotes/route.ts`**

Update `POST` handler:
```typescript
if (!isHostedWorkflowType(body.workflowType)) {
  return NextResponse.json(
    { error: "Unsupported workflow.", reason: "workflow_not_supported" },
    { status: 400 },
  );
}

const template = getHostedWorkflowTemplate(body.workflowType);
if (!template) {
  return NextResponse.json(
    { error: "Workflow configuration is unavailable.", reason: "workflow_template_missing" },
    { status: 503 },
  );
}

const serverEnforcedBody = {
  workflowType: body.workflowType,
  inputText: body.inputText,
  marketSymbol: body.marketSymbol,
  task: template.task,
  budgetUsdc: HOSTED_AGENT_MAX_BUDGET_USDC,
};
```
Eliminate `...body` and client `body.task` usage.

- [ ] **Step 2: Harden `/api/hosted-agent/quotes/[quoteId]/confirm/route.ts`**

In the quote confirmation endpoint:
- Use saved quote's stored `request.task` and `request.budgetUsdc`.
- Browser sends only confirmation fields (`transactionHash`, `signature`). Ignore client-supplied `task` or `budgetUsdc` if present in confirmation payload.

- [ ] **Step 3: Test endpoints**

Run: `npm run hosted:workflow-test && npm run hosted:checkout-test`
Expected: PASS

- [ ] **Step 4: Commit Task 6**

```bash
git add app/api/hosted-agent/quotes/route.ts app/api/hosted-agent/quotes/[quoteId]/confirm/route.ts
git commit -m "security(api): enforce strict payload construction for quotes and confirm endpoints"
```

---

### Task 7: Final Report Copy Sanitization (`app/agent-runner/hosted-job-result.tsx`)

**Files:**
- Modify: `app/agent-runner/hosted-job-result.tsx`

- [ ] **Step 1: Sanitize public report summary & findings**

In `hosted-job-result.tsx`:
- Wrap `report.summary` and `reportInput.preview` with `sanitizePublicReportText()`.
- Ensure top-level visible report has badge `Verified on Arc`.
- Keep payment breakdown, receipts, proofs, and technical timeline inside collapsible `<details><summary>Payment & verification details</summary>...`.

- [ ] **Step 2: Run build**

Run: `npm run build`
Expected: PASS

- [ ] **Step 3: Commit Task 7**

```bash
git add app/agent-runner/hosted-job-result.tsx
git commit -m "feat(report): sanitize historical phase strings from public report view"
```

---

### Task 8: Update Automated Cleanliness Test & Full Verification Suite

**Files:**
- Modify: `scripts/verify-public-ui-cleanliness.mts`
- Modify: `scripts/frontend-ux-tests.mts`
- Modify: `scripts/frontend-responsive-smoke.mts`

- [ ] **Step 1: Enhance `scripts/verify-public-ui-cleanliness.mts`**

- Update regex pattern for forbidden terms:
  ```typescript
  const FORBIDDEN_PATTERNS = [
    /\bPhase\s+\d+(?:\.\d+)?\b/i,
    /\bFreeModel\b/i,
    /\breceipts?\b/i,
    /\bArc proofs?\b/i,
    /\bproject-owned payer\b/i,
    /\bhosted payer\b/i,
    /\bworkflow payer\b/i,
    /\bprovider cost\b/i,
    /\bplatform fee\b/i,
    /\btreasury\b/i,
    /\bSHA-256\b/i,
    /\bidempotency\b/i,
    /\bpolicy_denied\b/i,
    /\bwallet_already_registered\b/i,
  ];
  ```
- Exclude `<details>` blocks from body text before testing.
- Check navigation: `Home`, `New Report`, `Reports`.
- Test `/`, `/agent-runner`, `/results`, and a completed report URL if available.
- Check layout constraints for 1440x900 and 390x844 viewports.

- [ ] **Step 2: Update existing UX and responsive smoke tests**

Update assertions in `scripts/frontend-ux-tests.mts` and `scripts/frontend-responsive-smoke.mts` to match the new button labels (`See Final Price`, `Reports`) and wallet card headers (`Payment wallet`).

- [ ] **Step 3: Execute full suite**

Run:
```bash
npm run lint
npm run build
npm run frontend:ux-test
npm run frontend:responsive-test
npm run hosted:workflow-test
npm run hosted:checkout-test
npm run review:smoke
```

- [ ] **Step 4: Commit Task 8**

```bash
git add scripts/verify-public-ui-cleanliness.mts scripts/frontend-ux-tests.mts scripts/frontend-responsive-smoke.mts
git commit -m "test(ui): enhance public UI cleanliness suite and update UX smoke tests"
```
