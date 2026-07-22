# Phase 28.1 — BYOA Test Console Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform the `/my-agents` page into a complete BYOA Test Console where users can verify owner wallets, register external agent wallets, manage spending policy, issue credentials, run live BYOA workflows with browser wallet x402 payment signatures on Arc Testnet, view proofs and receipts, and verify idempotency replays.

**Architecture:** 
- Frontend `/my-agents` (React + Next.js App Router) split into sequential steps: Step 1 (Owner Session), Step 2 (Register Agent & Role Clarification), Step 3 (One-time Credential Management & sessionStorage), Step 4 (Test Console & x402 Browser Wallet Runner), and Agent Management Panel.
- `useArcWallet` hook augmented with `signTypedData` (EIP-712) for browser x402 Gateway payment authorizations.
- Backend `lib/byoa/service.ts` and `/api/byoa/management/agents/[agentId]` extended with agent status updates (suspend, reactivate, revoke) and policy revalidation.
- New test suite `scripts/byoa-console-tests.mts` and npm script `byoa:console-test`.

**Tech Stack:** Next.js 16 (React 19), viem, @circle-fin/x402-batching, Tailwind CSS, Lucide icons, Supabase, Arc Testnet (chain 5042002).

## Global Constraints

- Do not modify `lib/x402.ts`, existing Gateway settlement, seller payment core, and AgentCommerceProofRegistry.
- Do not open registration for everyone (`BYOA_PUBLIC_REGISTRATION_ENABLED=false` remains).
- Access to console allowed via canary allowlist verified owner wallets.
- Private keys are NEVER requested, sent to server, or stored.
- Owner wallet is used ONLY for management; External agent wallet is used for signing aggregate workflow payment.
- Credential displayed ONCE, stored in browser ONLY in memory or `sessionStorage`, NOT in `localStorage`.
- Arc Testnet only (chain ID 5042002).
- Hard maximum policy limits: 0.005 USDC per run, 0.02 USDC daily spend, 10 daily calls.

---

### Task 1: Extend Backend Service & API for Agent Status Management & Allowance Accounting

**Files:**
- Modify: `lib/byoa/service.ts`
- Modify: `lib/byoa/types.ts`
- Modify: `app/api/byoa/management/agents/[agentId]/route.ts`

**Interfaces:**
- Produces: `updateAgentStatus(ownerWallet: Address, agentId: string, status: "active" | "suspended" | "revoked")` in `lib/byoa/service.ts`.
- Produces: `PATCH /api/byoa/management/agents/[agentId]` endpoint accepting `{ status: "active" | "suspended" | "revoked" }`.

- [ ] **Step 1: Implement `updateAgentStatus` in `lib/byoa/service.ts`**

Add function `updateAgentStatus` to `lib/byoa/service.ts` to allow owner wallets to suspend, reactivate, or revoke their registered agents in Supabase.

- [ ] **Step 2: Add PATCH handler in `app/api/byoa/management/agents/[agentId]/route.ts`**

Add `PATCH` method to `app/api/byoa/management/agents/[agentId]/route.ts` calling `updateAgentStatus` with proper `requireOwnerSession` check.

- [ ] **Step 3: Run existing BYOA tests to ensure no regressions**

Run: `npm run byoa:test`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add lib/byoa/service.ts lib/byoa/types.ts app/api/byoa/management/agents/[agentId]/route.ts
git commit -m "feat(byoa): add agent status update API and service layer"
```

---

### Task 2: Enhance `useArcWallet` Hook with EIP-712 `signTypedData` Support & Strict Account-Switch Listeners

**Files:**
- Modify: `components/wallet/use-arc-wallet.ts`

**Interfaces:**
- Produces: `signTypedData(params)` method on `useArcWallet()` return object.
- Consumes: Injected EVM provider (`window.ethereum`) via `eth_signTypedData_v4`.

- [ ] **Step 1: Add `signTypedData` method to `useArcWallet` in `components/wallet/use-arc-wallet.ts`**

Implement `signTypedData` callback in `useArcWallet()` accepting domain, types, primaryType, and message, invoking `provider.request({ method: "eth_signTypedData_v4", params: [address, JSON.stringify(params)] })`.

- [ ] **Step 2: Ensure account switch & chain switch event callbacks reset error and trigger state listeners**

Verify `accountsChanged` and `chainChanged` correctly update state and emit events for consumer components to react immediately.

- [ ] **Step 3: Test linting & TypeScript type checking**

Run: `npm run lint`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add components/wallet/use-arc-wallet.ts
git commit -m "feat(wallet): add EIP-712 signTypedData to useArcWallet hook"
```

---

### Task 3: Build Browser x402 Gateway Payment Client Utility

**Files:**
- Create: `lib/byoa/x402-client.ts`

**Interfaces:**
- Produces: `signAndSendByoaX402Payment({ quote, credential, idempotencyKey, requestBody, wallet })` function using `@circle-fin/x402-batching/client`'s `BatchEvmScheme`.

- [ ] **Step 1: Create `lib/byoa/x402-client.ts`**

Implement helper that takes `quote`, `credential`, `idempotencyKey`, `requestBody`, and `wallet` (from `useArcWallet`), instantiates `BatchEvmScheme` with an EVM signer wrapping `wallet.address` and `wallet.signTypedData`, generates the x402 payment payload for GatewayWalletBatched, encodes it to base64, and POSTs to `quote.resourceUrl` with headers `Authorization: Bearer <credential>`, `Idempotency-Key: <key>`, `PAYMENT-SIGNATURE: <base64Payload>`.

- [ ] **Step 2: Commit**

```bash
git add lib/byoa/x402-client.ts
git commit -m "feat(byoa): create client-side x402 browser wallet payment signer"
```

---

### Task 4: Implement BYOA Test Console UI Steps 1-3 & Session Invalidation in `app/my-agents/my-agents-client.tsx`

**Files:**
- Modify: `app/my-agents/my-agents-client.tsx`

**Interfaces:**
- Interactive UX for Step 1 (Owner verification & auto-session invalidation), Step 2 (Register agent with role clarification and explicit same-wallet confirmation), and Step 3 (Credential issuance displayed once and saved in `sessionStorage`).

- [ ] **Step 1: Implement Step 1 (Verify Owner & Auto Invalidation)**

Display connected wallet, verified owner wallet, Arc network (chain 5042002), management session status. If `wallet.address` or `wallet.chainId` changes such that connected wallet ≠ verified owner wallet, automatically delete management session and reset UI.

- [ ] **Step 2: Implement Step 2 (Register Agent & Role Clarification)**

Add role explanation banner ("Owner wallet manages the agent. Agent wallet signs and pays for workflows."). Add inputs for Agent Name, External Agent Wallet, "Use connected wallet" button, and spending policy limits (max/run <= 0.005, daily spend <= 0.02, daily calls <= 10). If connected/owner wallet matches agent wallet, require explicit checkbox confirmation ("I confirm that my owner wallet will also serve as the external agent wallet.").

- [ ] **Step 3: Implement Step 3 (Credential Management)**

Add Issue Credential action. Display token ONCE with "Copy once" button. Save token strictly in `sessionStorage` under `byoa_token_${agentId}` (never `localStorage`). Display credential list with status, prefix, scopes, created & last rotated timestamps. Add Rotate and Revoke buttons.

- [ ] **Step 4: Commit**

```bash
git add app/my-agents/my-agents-client.tsx
git commit -m "feat(byoa): implement Step 1-3 of BYOA Test Console"
```

---

### Task 5: Implement Step 4 (Test Console Browser Runner) & Result Screen with Idempotency Replay in `app/my-agents/my-agents-client.tsx`

**Files:**
- Modify: `app/my-agents/my-agents-client.tsx`

**Interfaces:**
- Test Console panel supporting Market Context Brief (ETH/USD), pre-signature quote breakdown, external agent wallet check, x402 payment signing via browser wallet, polling job result, comprehensive result screen with all proof & receipt links, and idempotency replay verification.

- [ ] **Step 1: Implement Step 4 Pre-Signature Breakdown & Wallet Matching Check**

Add Test Console interface for Market Context Brief (ETH/USD, budget 0.005 USDC). Before signing, fetch quote and show breakdown: workflow name, agent wallet, aggregate price, downstream estimated cost, platform fee, remaining per-run allowance, remaining daily allowance, quote expiration, idempotency key. Block execution if connected wallet in browser does not match registered external agent wallet with error "connected wallet differs from agent wallet".

- [ ] **Step 2: Implement "Sign and run workflow" Execution & Polling**

On click, invoke `signAndSendByoaX402Payment` using the registered external agent wallet, send payment, retrieve `jobId` and `statusUrl`, and poll `GET /api/byoa/v1/results/${jobId}` until completed.

- [ ] **Step 3: Implement Comprehensive Result Screen**

Display in one unified panel:
- workflow status
- Final Report summary
- aggregate payment transaction link (Arc scan)
- total charged, provider cost, platform fee
- agent run link (`/runs/${agentRunId}`)
- Workflow Receipt link (`/receipts/${receiptId}`)
- downstream receipt links
- aggregate payment proof link (`/proofs/${paymentEventId}`)
- downstream Arc proof links (Arc scan)
- Agent Passport link (`/agents/byoa/${publicId}`)
- remaining daily allowance

- [ ] **Step 4: Implement "Replay with same idempotency key" Button**

Re-execute quote & execute calls with identical Idempotency-Key. Verify response confirms idempotency (`idempotent: true`, same `jobId`, same receipts, same proofs, no double charge) and display proof badges ("No duplicate payment", "No new receipts", "No new proofs", "Allowance preserved").

- [ ] **Step 5: Implement Agent Management Actions**

Add controls for Active / Suspended / Revoked status, Suspend / Reactivate buttons, Edit Policy form with server-side revalidation warning, and credential management shortcuts.

- [ ] **Step 6: Ensure User-Facing Error Messages**

Catch and format clear error cards for: wrong network, connected wallet differs from verified owner, connected wallet differs from agent wallet, expired challenge, invalid or revoked credential, insufficient agent balance, per-run limit exceeded, daily limit exceeded, daily call limit exceeded, quote expired, payment rejected, settlement recovery in progress, workflow partial failure, credential already displayed. Ensure no raw stack traces appear.

- [ ] **Step 7: Commit**

```bash
git add app/my-agents/my-agents-client.tsx
git commit -m "feat(byoa): complete Step 4 Test Console, Result panel, and idempotency replay"
```

---

### Task 6: Create Comprehensive Test Suite `npm run byoa:console-test`

**Files:**
- Create: `scripts/byoa-console-tests.mts`
- Modify: `package.json`

**Interfaces:**
- `npm run byoa:console-test` test script verifying all Phase 28.1 requirements end-to-end.

- [ ] **Step 1: Create `scripts/byoa-console-tests.mts`**

Write test script checking:
1. owner wallet challenge & signature verification
2. session invalidation when wallet/chain changes
3. agent registration with same-wallet confirmation requirement
4. credential issue, rotate, and revoke operations
5. quote reservation with policy enforcement (0.005 max/run, 0.02 daily spend, 10 daily calls)
6. wrong-agent-wallet rejection on quote execution
7. browser EIP-712 / x402 payment signing flow simulation & execution
8. workflow completion and Final Report generation
9. Passport, Receipt, and Proof links validation
10. idempotency replay verification (same job, same receipts, same proofs, no double charge)
11. allowance recovery after failed settlement

- [ ] **Step 2: Add `"byoa:console-test"` script to `package.json`**

Add `"byoa:console-test": "node --experimental-transform-types --no-warnings --env-file-if-exists=.env.local scripts/byoa-console-tests.mts"` to `package.json`.

- [ ] **Step 3: Run `byoa:console-test`**

Run: `npm run byoa:console-test`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add scripts/byoa-console-tests.mts package.json
git commit -m "test(byoa): add npm run byoa:console-test end-to-end test suite"
```

---

### Task 7: Full Test Suite & DoD Verification

**Files:**
- Verification only

- [ ] **Step 1: Execute all required verification commands**

Run:
1. `npm run byoa:console-test`
2. `npm run byoa:test`
3. `npm run byoa:db-test`
4. `npm run byoa:settlement-db-test`
5. `npm run lint`
6. `npm run build`
7. `npm run review:smoke`
8. `forge test`
9. `git diff --check`

Expected: ALL PASS

- [ ] **Step 2: Commit any final fixes if necessary**

```bash
git commit -m "chore(byoa): verify complete test suite passes for Phase 28.1"
```
