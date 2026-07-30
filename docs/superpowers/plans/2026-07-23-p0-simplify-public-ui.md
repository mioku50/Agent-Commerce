# P0 — Simplification of Public UI Arc Agent Commerce Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform Arc Agent Commerce public interface into a clean, intuitive consumer product for creating verified reports in 5 simple steps (Choose workflow → Add input → Connect wallet → See total → Generate report → View result) while moving all developer/operator functions (My Agents, Seller, Developer Tools, Passports, Proofs, Receipts) to a dedicated Developer Console (`/console`).

**Architecture:** 
1. **Public / Console Layout Separation:** Split navigation in `lib/navigation/sidebar.ts` and `components/layout/` so public pages (`/`, `/agent-runner`, `/results`) use a minimal 3-item sidebar and topbar with a "Developer Console" button, while `/console` hosts advanced tools. Existing routes (`/my-agents`, `/seller`, `/developer-tools`, `/runs`, `/proofs`, `/agents`, `/receipts`) remain functional as Console views or sub-routes.
2. **Server-Enforced Task & Budget:** Update `/api/hosted-agent/quotes` and `hosted-agent-runner.tsx` so `task` and `budget` are calculated on the server from allowlisted workflow templates rather than exposed as client editable inputs.
3. **Progress & Error Humanization:** Introduce `lib/errors/humanize-error.ts` to map raw error codes (`policy_denied`, `wallet_already_registered`, etc.) to clear user titles, messages, and action CTAs. Simplify execution progress stages to consumer-friendly labels.
4. **Clean Information Hierarchy:** Hide technical metadata (payer address, treasury, hashes, raw costs, proof counts, phase numbers, canary badges) behind closed "Technical details" disclosures on public pages while keeping them accessible in Audit / Developer Console mode.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS v4, Lucide Icons, Viem, Arc Testnet.

## Global Constraints

- **Public Navigation:** Public sidebar has exactly 3 items (`Home`, `New Report`, `My Reports`). Topbar includes "Developer Console" link; no "Seller Login" on public topbar.
- **Console Routes:** `/console` handles Agents, Seller, Developer Tools, and Audit & Verification. Existing routes (`/my-agents`, `/seller`, etc.) must not 404.
- **Server Enforcement:** Task and budget are set by server templates in public runner. Client payload cannot override task or budget.
- **Error Mapping:** Raw error codes (`policy_denied`, `wallet_already_registered`, etc.) must be humanized in main alerts.
- **Consumer Copy:** No visible strings for `Phase 28`, `Canary only`, `project-owned payer`, `treasury`, `SHA-256`, `idempotency`, `provider cost`, `platform fee`, `policy_denied`, `wallet_already_registered` on public top-level UI.
- **Backend Safety:** Do not break existing API endpoints, verification logic, x402 payments, receipts, Arc proofs, or BYOA integration.

---

### Task 1: Humanized Error Mapper (`lib/errors/humanize-error.ts`)

**Files:**
- Create: `lib/errors/humanize-error.ts`
- Test: `scripts/frontend-ux-tests.mts`

**Interfaces:**
- Produces: `humanizeError(rawError: string | Error | unknown): HumanizedError`

- [ ] **Step 1: Create humanize-error utility**

Create `lib/errors/humanize-error.ts`:

```typescript
/**
 * Copyright 2026 Circle Internet Group, Inc. All rights reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

export type HumanizedError = {
  title: string;
  message: string;
  actionLabel?: string;
  actionHref?: string;
  technicalCode?: string;
};

export function humanizeError(raw: unknown): HumanizedError {
  const messageStr = raw instanceof Error ? raw.message : String(raw ?? "");

  // Wallet already registered
  if (messageStr.includes("wallet_already_registered") || messageStr.includes("already registered")) {
    return {
      title: "Wallet already connected",
      message: "This wallet is already assigned to an agent. Open the existing agent or use another wallet.",
      actionLabel: "Open Agent",
      actionHref: "/console/agents",
      technicalCode: "wallet_already_registered",
    };
  }

  // Policy denied subcases
  if (messageStr.includes("policy_denied") || messageStr.includes("Policy denied")) {
    if (messageStr.includes("workflow_not_allowed") || messageStr.includes("not enabled")) {
      return {
        title: "Workflow disabled",
        message: "This workflow is not enabled for the selected agent.",
        actionLabel: "Open Spending Policy",
        actionHref: "/console/agents",
        technicalCode: "policy_denied:workflow_not_allowed",
      };
    }
    if (messageStr.includes("service_type_not_allowed") || messageStr.includes("Live Data")) {
      return {
        title: "Required service unavailable",
        message: "This workflow requires Live Data, but Live Data is disabled in the agent policy.",
        actionLabel: "Enable Live Data",
        actionHref: "/console/agents",
        technicalCode: "policy_denied:service_type_not_allowed",
      };
    }
    if (messageStr.includes("max_run_exceeded") || messageStr.includes("maximum amount per run")) {
      return {
        title: "Price exceeds agent limit",
        message: "This report costs more than the agent's maximum amount per run.",
        actionLabel: "Update Limit",
        actionHref: "/console/agents",
        technicalCode: "policy_denied:max_run_exceeded",
      };
    }
    if (messageStr.includes("daily_spend_exceeded") || messageStr.includes("daily USDC limit")) {
      return {
        title: "Daily spending limit reached",
        message: "The agent has reached its daily USDC limit. Increase the limit or try again tomorrow.",
        actionLabel: "Update Limit",
        actionHref: "/console/agents",
        technicalCode: "policy_denied:daily_spend_exceeded",
      };
    }
    if (messageStr.includes("daily_calls_exceeded") || messageStr.includes("allowed calls for today")) {
      return {
        title: "Daily run limit reached",
        message: "The agent has used all allowed calls for today.",
        actionLabel: "Update Limit",
        actionHref: "/console/agents",
        technicalCode: "policy_denied:daily_calls_exceeded",
      };
    }
    return {
      title: "Action denied by agent policy",
      message: "The selected action violates the agent's active spending policy.",
      actionLabel: "Open Spending Policy",
      actionHref: "/console/agents",
      technicalCode: "policy_denied",
    };
  }

  // Wallet mismatch
  if (messageStr.includes("wallet") && (messageStr.includes("differs") || messageStr.includes("mismatch") || messageStr.includes("not the registered"))) {
    return {
      title: "Switch wallet to continue",
      message: "The connected wallet is not the registered agent payment wallet.",
      actionLabel: "Switch Wallet",
      technicalCode: "wallet_mismatch",
    };
  }

  // Wrong network
  if (messageStr.includes("network") || messageStr.includes("chain") || messageStr.includes("Arc Testnet")) {
    return {
      title: "Switch to Arc Testnet",
      message: "This action requires Arc Testnet.",
      actionLabel: "Switch Network",
      technicalCode: "wrong_network",
    };
  }

  // Quote expired
  if (messageStr.includes("quote expired") || messageStr.includes("Price expired") || messageStr.includes("expired")) {
    return {
      title: "Price expired",
      message: "Refresh the price before continuing. No payment has been made.",
      actionLabel: "Refresh Price",
      technicalCode: "quote_expired",
    };
  }

  // Credential missing or revoked
  if (messageStr.includes("credential") || messageStr.includes("Credential")) {
    return {
      title: "Active credential required",
      message: "Create a new API credential before running this external agent.",
      actionLabel: "Create Credential",
      actionHref: "/console/agents",
      technicalCode: "credential_missing",
    };
  }

  // Generic fallback
  return {
    title: "Something went wrong",
    message: messageStr.replace(/\s*\([a-z0-9_]+\)$/i, "") || "The request could not be completed. Try again.",
    actionLabel: "Try Again",
    technicalCode: "generic_error",
  };
}
```

- [ ] **Step 2: Add error mapper assertion in frontend UX tests**

Update `scripts/frontend-ux-tests.mts` to import `humanizeError` and test mappings for `wallet_already_registered`, `policy_denied`, and wallet mismatch.

- [ ] **Step 3: Run UX tests to verify error mapper**

Run: `npm run frontend:ux-test`
Expected: PASS

- [ ] **Step 4: Commit Task 1**

```bash
git add lib/errors/humanize-error.ts scripts/frontend-ux-tests.mts
git commit -m "feat(ui): add humanized error mapper for consumer interface"
```

---

### Task 2: Navigation & Layout Architecture (Public vs Console)

**Files:**
- Modify: `lib/navigation/sidebar.ts`
- Modify: `components/layout/sidebar.tsx`
- Modify: `components/layout/topbar.tsx`
- Modify: `components/layout/layout.tsx`

**Interfaces:**
- Exports: `publicSidebarNavigation`, `consoleSidebarNavigation` from `lib/navigation/sidebar.ts`

- [ ] **Step 1: Update navigation configuration in `lib/navigation/sidebar.ts`**

Update `lib/navigation/sidebar.ts`:

```typescript
export type SidebarIconName =
  | "activity"
  | "agent"
  | "my-agents"
  | "dashboard"
  | "passport"
  | "proof"
  | "receipt"
  | "results"
  | "seller"
  | "templates"
  | "tools"
  | "console";

export const publicSidebarNavigation = [
  {
    label: "Menu",
    items: [
      { href: "/", label: "Home", icon: "dashboard" as SidebarIconName },
      { href: "/agent-runner", label: "New Report", icon: "agent" as SidebarIconName },
      { href: "/results", label: "My Reports", icon: "results" as SidebarIconName },
    ],
  },
] as const;

export const consoleSidebarNavigation = [
  {
    label: "Developer Console",
    items: [
      { href: "/console", label: "Console Home", icon: "console" as SidebarIconName },
      { href: "/console/agents", label: "Agents", icon: "my-agents" as SidebarIconName },
      { href: "/console/seller", label: "Services / Seller", icon: "seller" as SidebarIconName },
      { href: "/console/developer-tools", label: "Developer Tools", icon: "tools" as SidebarIconName },
      { href: "/console/audit", label: "Audit & Verification", icon: "proof" as SidebarIconName },
    ],
  },
] as const;

export const sidebarNavigation = publicSidebarNavigation;

export const DESKTOP_SIDEBAR_SCROLL_CLASS = "overflow-y-auto overscroll-contain";
export const MOBILE_SIDEBAR_SCROLL_CLASS = "overflow-y-auto overscroll-contain";
```

- [ ] **Step 2: Update `components/layout/sidebar.tsx` to handle public and console modes**

Update `Sidebar` and `MobileSidebar` in `components/layout/sidebar.tsx` to inspect `pathname`. If `pathname.startsWith("/console")`, render `consoleSidebarNavigation`, otherwise render `publicSidebarNavigation`.

- [ ] **Step 3: Update `components/layout/topbar.tsx` for Public vs Console header**

On public pages:
- Logo & title: "Arc Agent Commerce"
- Badge: "Arc Testnet"
- Right items: Connected Wallet / Connect Wallet + "Developer Console" button (`<Button asChild size="sm" variant="outline"><Link href="/console"><Wrench className="size-4" />Developer Console</Link></Button>`).
- Remove separate "Seller Login" button from public topbar.

On console pages (`/console`):
- Logo & title: "Arc Developer Console"
- Badge: "Developer Mode"
- Right items: Connected Wallet + "Back to App" button (`<Link href="/">Public App</Link>`) + Seller Login/Logout form.

- [ ] **Step 4: Update `components/layout/layout.tsx`**

Ensure `CommandCenterLayout` supports both context modes seamlessly.

- [ ] **Step 5: Run tests**

Run: `npm run frontend:ux-test`
Expected: PASS

- [ ] **Step 6: Commit Task 2**

```bash
git add lib/navigation/sidebar.ts components/layout/sidebar.tsx components/layout/topbar.tsx components/layout/layout.tsx
git commit -m "feat(nav): separate Public and Developer Console navigation"
```

---

### Task 3: Developer Console Pages & Route Alias Setup

**Files:**
- Create: `app/console/page.tsx`
- Create: `app/console/agents/page.tsx`
- Create: `app/console/seller/page.tsx`
- Create: `app/console/developer-tools/page.tsx`
- Create: `app/console/audit/page.tsx`
- Modify: `app/my-agents/page.tsx`, `app/seller/page.tsx`, `app/developer-tools/page.tsx`, `app/runs/page.tsx`, `app/proofs/page.tsx`, `app/agents/page.tsx`, `app/receipts/page.tsx` (Ensure compatibility)

**Interfaces:**
- `/console` route with sub-navigation for Agents, Seller, Developer Tools, Audit & Verification.

- [ ] **Step 1: Create `/console/page.tsx` Overview Dashboard**

Create `app/console/page.tsx` rendering Developer Console Home with cards linking to:
- Agents (`/console/agents`)
- Services / Seller (`/console/seller`)
- Developer Tools (`/console/developer-tools`)
- Audit & Verification (`/console/audit`)

- [ ] **Step 2: Create `/console/agents/page.tsx`**

Render or import the agent management interface (`MyAgentsClient` from `app/my-agents/my-agents-client.tsx`).

- [ ] **Step 3: Create `/console/seller/page.tsx`**

Render seller services management interface.

- [ ] **Step 4: Create `/console/developer-tools/page.tsx`**

Render developer tools & local CLI setup guides.

- [ ] **Step 5: Create `/console/audit/page.tsx`**

Render unified audit page with tabs/links for Activity (`/runs`), Arc Proofs (`/proofs`), Agent Passports (`/agents`), Commerce Receipts (`/receipts`).

- [ ] **Step 6: Ensure backward compatibility for legacy routes**

Keep `/my-agents`, `/seller`, `/developer-tools`, `/runs`, `/proofs`, `/agents`, `/receipts` functional (rendering inside Console layout or wrapping appropriate client component) so direct links and existing test scripts do not 404.

- [ ] **Step 7: Verify routes with `npm run build`**

Run: `npm run build`
Expected: Build succeeds with all `/console` routes compiled.

- [ ] **Step 8: Commit Task 3**

```bash
git add app/console/ app/my-agents/ app/seller/ app/developer-tools/ app/runs/ app/proofs/ app/agents/ app/receipts/
git commit -m "feat(console): add Developer Console routes and maintain backward compatibility"
```

---

### Task 4: Simplify Public Dashboard (`app/page.tsx`)

**Files:**
- Modify: `app/page.tsx`

- [ ] **Step 1: Replace Hero copy**

Update hero section in `app/page.tsx`:
- Title: `Create a verified agent report`
- Description: `Choose a workflow, provide your input, confirm the total price, and receive a shareable report.`
- Primary CTA: `Create Report` (`/agent-runner`)
- Secondary CTA: `View Reports` (`/results`)
- Remove jargon from hero text (`x402`, `project-owned payer`, `downstream payments`, `app-owned registry`, `maximum paid calls`, `local CLI`, `provider wallet address`).

- [ ] **Step 2: Simplify Metric Cards**

Replace technical cards (`Paid calls`, `Arc proofs`, `Tracked spend`) with consumer metrics:
- `Reports generated` (count of reports)
- `Recent Reports` (list of completed reports)

- [ ] **Step 3: Replace Verification Section**

Replace the 5 separate CTA buttons (`Arc Proofs`, `Receipts`, `Passports`, `Developer Tools`, `Seller`) with a single concise line:
`Reports include Arc verification.` -> `View technical details →` (linking to `/console/audit`).

- [ ] **Step 4: Verify build and clean copy**

Run: `npm run build`
Expected: Clean build with no errors.

- [ ] **Step 5: Commit Task 4**

```bash
git add app/page.tsx
git commit -m "feat(dashboard): simplify public hero, metrics, and verification footer"
```

---

### Task 5: Server-Enforced Task & Budget in Hosted Quotes API

**Files:**
- Modify: `app/api/hosted-agent/quotes/route.ts`
- Modify: `lib/agent/hosted-workflows.ts`

- [ ] **Step 1: Update `validateHostedWorkflowRequest` in `lib/agent/hosted-workflows.ts`**

Ensure that when a request arrives, `task` is automatically filled from `defaultWorkflowTask(workflowType)` or template task if not specified, and budget defaults to the template default.

- [ ] **Step 2: Update `app/api/hosted-agent/quotes/route.ts`**

In the public quote endpoint, ignore client-provided `task` and `budgetUsdc` for public requests and always resolve `task` and `budgetUsdc` from the server allowlisted template (`getHostedWorkflowTemplate(body.workflowType)`).

- [ ] **Step 3: Test quote generation**

Run: `npm run hosted:quote-test` or `npm run hosted:workflow-test`
Expected: PASS

- [ ] **Step 4: Commit Task 5**

```bash
git add app/api/hosted-agent/quotes/route.ts lib/agent/hosted-workflows.ts
git commit -m "feat(security): enforce server-defined task and budget for public workflow quotes"
```

---

### Task 6: Simplify Hosted Agent Runner (`app/agent-runner/hosted-agent-runner.tsx`)

**Files:**
- Modify: `app/agent-runner/hosted-agent-runner.tsx`

- [ ] **Step 1: Simplify form inputs in `hosted-agent-runner.tsx`**

Remove from public runner form:
- Editable `Task` textarea.
- Editable `Maximum budget` input.
- `Project-owned payer wallet` card.
- `Payer wallet address`.
- `Max paid calls` & raw internal endpoint notices.

Keep in public runner form:
- Workflow selector cards / dropdown.
- Input text area.
- Market symbol selector (if `market_context`).
- Wallet connection button.
- Total price card.
- Launch CTA button (`Pay 0.002 USDC & Generate Report` or `Generate Sponsored Report`).

- [ ] **Step 2: Add simplified Quote Preview and collapsible Technical Details disclosure**

Before quote:
`Select a workflow and add your input to see the final price.`

After quote preview:
Card showing:
- Workflow Title (e.g. `Market Context Report`)
- Includes list:
  `✓ Live market data`
  `✓ Text analysis`
  `✓ Shareable report`
  `✓ Verified on Arc`
- `Total: 0.002 USDC` (or `Total: 0 USDC · Sponsored run`)
- Button: `Pay 0.002 USDC & Generate Report` (or `Generate Sponsored Report`)
- Collapsible details disclosure: `<details><summary>Technical details</summary>...` containing raw provider costs, platform fee, payer address, treasury, hashes, and endpoints.

- [ ] **Step 3: Humanize errors in Runner alert**

Use `humanizeError(error)` to display user-friendly title, message, and CTA in runner error alerts.

- [ ] **Step 4: Test runner UI**

Run: `npm run build`
Expected: Clean build.

- [ ] **Step 5: Commit Task 6**

```bash
git add app/agent-runner/hosted-agent-runner.tsx
git commit -m "feat(runner): simplify hosted workflow runner UI with collapsible technical details"
```

---

### Task 7: Simplify Results Page & Final Report View

**Files:**
- Modify: `app/results/page.tsx`
- Modify: `app/agent-runner/hosted-job-result.tsx`

- [ ] **Step 1: Simplify `/results` Card Display**

On `/results`:
- Show: workflow name badge, status, report summary, key findings, date, `View Report` CTA button.
- Remove level-1 card metadata: raw receipt count, proof count, provider payment, platform revenue, transaction hash, block number, registry contract, input SHA-256, idempotency info.

- [ ] **Step 2: Update Progress Stage Labels in `hosted-job-result.tsx`**

Replace technical progress stage names with public stage labels:
1. `Preparing report`
2. `Collecting data`
3. `Analyzing results`
4. `Creating report`
5. `Verifying result`
6. `Completed`

Hide technical terms (`planning`, `purchasing`, `generating_receipt`, `publishing_onchain_proof`, `polling`, `HTTP 402`, `settlement`) from primary progress list.

- [ ] **Step 3: Update Final Report Page Hierarchy**

On individual report view (`hosted-job-result.tsx`):
- Top level: Report title, Summary, Key findings, and a clean `Verified on Arc` badge.
- Bottom section: Collapsible disclosure `<details><summary>Payment & verification details</summary>...` containing user payment breakdown, downstream receipts, Arc proofs, transaction links, registry status, and technical execution timeline.

- [ ] **Step 4: Verify build**

Run: `npm run build`
Expected: Build succeeds.

- [ ] **Step 5: Commit Task 7**

```bash
git add app/results/page.tsx app/agent-runner/hosted-job-result.tsx
git commit -m "feat(results): clean report cards and hide verification details behind disclosure"
```

---

### Task 8: Test Suite Updates & Automated UI Cleanliness Verification

**Files:**
- Modify: `scripts/frontend-ux-tests.mts`
- Modify: `scripts/frontend-responsive-smoke.mts`
- Create: `scripts/verify-public-ui-cleanliness.mts`

- [ ] **Step 1: Update `scripts/frontend-ux-tests.mts`**

Update assertions for `sidebarNavigation` (checking 3 items: `Home`, `New Report`, `My Reports` in public sidebar).

- [ ] **Step 2: Create `scripts/verify-public-ui-cleanliness.mts`**

Write a script that renders or checks pages `/`, `/agent-runner`, and `/results` to verify that top-level HTML/text does not contain disallowed technical jargon strings:
- `Phase 28`
- `Canary only`
- `project-owned payer`
- `treasury`
- `SHA-256`
- `idempotency`
- `provider cost`
- `platform fee`
- `policy_denied`
- `wallet_already_registered`

- [ ] **Step 3: Run full verification suite**

Run:
```bash
npm run lint
npm run build
npm run frontend:ux-test
npm run frontend:responsive-test
npm run hosted:workflow-test
npm run hosted:checkout-test
npm run review:smoke
node --experimental-transform-types --no-warnings scripts/verify-public-ui-cleanliness.mts
```
Expected: All tests pass cleanly!

- [ ] **Step 4: Commit Task 8**

```bash
git add scripts/frontend-ux-tests.mts scripts/frontend-responsive-smoke.mts scripts/verify-public-ui-cleanliness.mts
git commit -m "test(ui): update UX test suite and add public UI cleanliness verification"
```
