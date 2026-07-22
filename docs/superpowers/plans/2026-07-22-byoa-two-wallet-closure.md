# Phase 28.1.1 — BYOA Two-Wallet Closure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the production BYOA flow fully operational for distinct Owner Wallet and External Agent Wallet, ensuring HttpOnly owner management session persistence during wallet switching, same-origin allowlisted `resourceUrl` validation, comprehensive idempotency replay data comparison, and a dedicated Playwright two-wallet E2E test.

**Architecture:**
- Update `app/my-agents/my-agents-client.tsx` so that connected wallet switching (from Owner to Agent wallet) preserves the HttpOnly owner management session and agent selection while verifying that the connected wallet matches the agent wallet for binding & payment signing.
- Update `lib/byoa/x402-client.ts` to strictly validate `resourceUrl` against same-origin allowlisted BYOA execute routes (`/api/byoa/v1/quotes/.../execute`).
- Update idempotency replay verification in `app/my-agents/my-agents-client.tsx` to compare real payment ID, receipt IDs, proof hashes, and allowance data.
- Create Playwright two-wallet end-to-end test script `scripts/byoa-two-wallet-e2e.mts` and package.json script `"byoa:two-wallet-test"`.

**Tech Stack:** Next.js 16 (React 19), Playwright, viem, @circle-fin/x402-batching, Arc Testnet (chain 5042002).

## Global Constraints

- Do not modify Gateway settlement, `lib/x402.ts`, and Proof Registry.
- Owner session — HttpOnly management authorization (`byoa_owner_session` cookie).
- Agent wallet — used ONLY for binding signature and x402 payment signature.
- Private keys are NEVER requested, sent to server, or stored.
- Public registration remains canary-only (`BYOA_PUBLIC_REGISTRATION_ENABLED=false`).
- `resourceUrl` must be restricted to same-origin allowlisted execute route.

---

### Task 1: Update Frontend Session State & Wallet Switch Logic for Two-Wallet Flow

**Files:**
- Modify: `app/my-agents/my-agents-client.tsx`

**Interfaces:**
- Keeps HttpOnly owner session intact when switching connected wallet from Owner Wallet (`0xOwner`) to Agent Wallet (`0xAgent`).
- Displays distinct status badges for Verified Owner Wallet, Connected Browser Wallet, and Registered Agent Wallet.

- [ ] **Step 1: Discouple Owner Session Invalidation from Connected Wallet Switching**

Update `app/my-agents/my-agents-client.tsx` so that when `wallet.address` changes (e.g. user switches browser wallet to `0xAgent`), the HttpOnly owner session cookie remains active on the backend. Do NOT clear `ownerWallet`, `agents`, or `selectedId` if the management session is still authenticated. Only end management session if `DELETE /api/byoa/management/session` is explicitly called or server session check returns unauthenticated.

- [ ] **Step 2: Add Clear Status Badges for Two-Wallet Flow**

Show:
- Owner Session: `Verified (0xOwner...)`
- Connected Wallet: `0xConnected...`
- Target Agent Wallet: `0xAgent...`
Show clear helper notice when connected wallet matches `0xAgent`: "Connected wallet matches external agent wallet. Ready to sign binding & x402 payments."

- [ ] **Step 3: Commit**

```bash
git add app/my-agents/my-agents-client.tsx
git commit -m "feat(byoa): support two-wallet flow in my-agents client without session drop"
```

---

### Task 2: Validate `resourceUrl` Same-Origin Allowlist in `lib/byoa/x402-client.ts`

**Files:**
- Modify: `lib/byoa/x402-client.ts`

**Interfaces:**
- Produces: Strict URL validation enforcing same-origin allowlisted route `/api/byoa/v1/quotes/*/execute` on `resourceUrl` before initiating x402 payment signing.

- [ ] **Step 1: Add `resourceUrl` Validation in `signAndSendByoaX402Payment`**

In `lib/byoa/x402-client.ts`, parse `resourceUrl` using `new URL(input.resourceUrl, window.location.origin)`.
Enforce:
1. Origin matches `window.location.origin` (same-origin).
2. Pathname matches `/^ \/api\/byoa\/v1\/quotes\/[0-9a-f-]{36}\/execute$/i`.
If invalid, throw `Error("resourceUrl must be a same-origin allowlisted BYOA execute route.")`.

- [ ] **Step 2: Commit**

```bash
git add lib/byoa/x402-client.ts
git commit -m "security(byoa): enforce same-origin allowlisted execute route on resourceUrl"
```

---

### Task 3: Enhance Idempotency Replay Real Data Comparison in UI & API

**Files:**
- Modify: `app/my-agents/my-agents-client.tsx`

**Interfaces:**
- Displays real comparison metrics during idempotency replay: matching `jobId`, matching `aggregatePaymentId`, matching `receipt_ids`, matching `proof_transaction_hashes`, and preserved daily allowance.

- [ ] **Step 1: Implement Comprehensive Replay Data Comparison**

When user clicks "Replay with Same Idempotency Key", fetch the new result, compare against initial result:
- `firstResult.job.id === secondResult.job.id`
- `firstResult.aggregateWorkflowPayment.id === secondResult.aggregateWorkflowPayment.id`
- `firstResult.internalReceiptIds` equals `secondResult.internalReceiptIds`
- `firstResult.proofs` equals `secondResult.proofs`
- Agent daily allowance remaining is unchanged.
Display green proof status card with explicit metrics.

- [ ] **Step 2: Commit**

```bash
git add app/my-agents/my-agents-client.tsx
git commit -m "feat(byoa): add real data comparison to idempotency replay UI"
```

---

### Task 4: Create Playwright Two-Wallet End-to-End Test Suite

**Files:**
- Create: `scripts/byoa-two-wallet-e2e.mts`
- Modify: `package.json`

**Interfaces:**
- `npm run byoa:two-wallet-test`: Runs Playwright headless browser test creating distinct Owner and Agent wallets, connecting Owner, registering Agent, switching wallet to Agent, verifying binding, issuing credential, signing x402 payment, and verifying replay.

- [ ] **Step 1: Create `scripts/byoa-two-wallet-e2e.mts`**

Implement Playwright test using `chromium.launch`:
1. Instantiates `ownerAccount` and `agentAccount` via `viem`.
2. Injects custom EIP-1193 provider into Playwright page capable of switching active wallet between `ownerAccount` and `agentAccount`.
3. Navigates to `/my-agents`.
4. Verifies Owner Wallet session with `ownerAccount`.
5. Registers DIFFERENT Agent Wallet (`agentAccount.address`).
6. Switches injected browser wallet to `agentAccount`.
7. Verifies wallet binding challenge signed by `agentAccount`.
8. Configures spending policy and issues API credential.
9. Reserves quote for Market Context Brief (ETH/USD, budget 0.005 USDC).
10. Signs EIP-712 x402 payment authorization with `agentAccount` and sends payment.
11. Polls result until completed; verifies Final Report, Receipts, Arc Proofs, Passport.
12. Performs Idempotency Replay; verifies no duplicate payment, same receipts, same proofs.

- [ ] **Step 2: Add `"byoa:two-wallet-test"` script to `package.json`**

Add `"byoa:two-wallet-test": "node --experimental-transform-types --no-warnings --env-file-if-exists=.env.local scripts/byoa-two-wallet-e2e.mts"` to `package.json`.

- [ ] **Step 3: Run `byoa:two-wallet-test`**

Run: `npm run byoa:two-wallet-test`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add scripts/byoa-two-wallet-e2e.mts package.json
git commit -m "test(byoa): add Playwright two-wallet end-to-end test suite"
```

---

### Task 5: Full Test Suite Verification

**Files:**
- Verification only

- [ ] **Step 1: Execute all required verification commands**

Run:
1. `npm run byoa:two-wallet-test`
2. `npm run byoa:console-test`
3. `npm run byoa:test`
4. `npm run lint`
5. `npm run build`
6. `forge test`
7. `git diff --check`

Expected: ALL PASS

- [ ] **Step 2: Commit any final cleanup**

```bash
git commit -m "chore(byoa): complete Phase 28.1.1 two-wallet closure verification"
```
