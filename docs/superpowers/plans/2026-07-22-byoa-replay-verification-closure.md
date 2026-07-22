# Phase 28.1.2 — Replay Verification Closure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate all hardcoded `true` flags in idempotency replay verification by calculating proof metrics strictly from empirical pre/post replay data, emit explicit `accountsChanged` events during Playwright wallet switching, and introduce a production canary runner `npm run byoa:two-wallet-canary` alongside `npm run byoa:two-wallet-test`.

**Architecture:**
- Update `app/my-agents/my-agents-client.tsx` replay logic to snapshot baseline `jobId`, `paymentId`, `receiptIds`, `proofHashes`, `dailySpentUsdc`, `remainingDailyUsdc`, and `dailyCallCount` before replay, re-query results and agent policy after replay, and compute 6 explicit boolean flags dynamically without any hardcoded `true`.
- Update `scripts/byoa-two-wallet-e2e.mts` Playwright mock EIP-1193 provider to trigger `accountsChanged` event listeners upon wallet switching (`ownerAccount` -> `agentAccount`).
- Create `scripts/byoa-two-wallet-canary.mts` for running real canary tests against production (Vercel) using allowlisted private keys (`BYOA_CANARY_OWNER_PRIVATE_KEY` & `BYOA_CANARY_AGENT_PRIVATE_KEY`) and register `"byoa:two-wallet-canary"` in `package.json`.

**Tech Stack:** Next.js 16 (React 19), Playwright, viem, Arc Testnet (chain 5042002).

## Global Constraints

- Do not modify Gateway settlement, `lib/x402.ts`, and Proof Registry.
- Do not perform duplicate payment execution.
- No hardcoded `true` values in replay metrics calculation.
- Public registration remains canary-only.

---

### Task 1: Empirical Replay Data Comparison in `my-agents-client.tsx`

**Files:**
- Modify: `app/my-agents/my-agents-client.tsx`

**Interfaces:**
- Pre-replay baseline state captured from `testResult` and `detail.policy`.
- Post-replay state fetched from `finalResultData` and fresh `getAgentManagementDetail`.
- Computes `sameJobId`, `noDuplicatePayment`, `noNewReceipts`, `noNewProofs`, `allowancePreserved`, and `callCountPreserved` by comparing actual values.

- [ ] **Step 1: Capture Pre-Replay Baseline Metrics**

In `runWorkflowExecution(isReplay)`:
If `isReplay`:
Record:
```ts
const baselineJobId = testResult?.job?.id;
const baselinePaymentId = testResult?.aggregateWorkflowPayment?.id;
const baselineReceiptIds = (testResult?.internalReceiptIds ?? []).map(String).sort();
const baselineProofHashes = (testResult?.proofs ?? []).map((p: any) => String(p.transactionHash ?? "")).filter(Boolean).sort();
const baselineDailySpent = detail?.policy?.dailySpentUsdc ?? "0";
const baselineRemainingUsdc = detail?.policy?.remainingDailyUsdc ?? "0";
const baselineDailyCalls = detail?.policy?.dailyCallCount ?? 0;
```

- [ ] **Step 2: Compare Post-Replay Data Dynamically**

After receiving `finalResultData` for replay, fetch updated agent detail via `jsonFetch(`/api/byoa/management/agents/${selected.id}`)`.
Extract:
```ts
const replayJobId = finalResultData?.job?.id;
const replayPaymentId = finalResultData?.aggregateWorkflowPayment?.id;
const replayReceiptIds = (finalResultData?.internalReceiptIds ?? []).map(String).sort();
const replayProofHashes = (finalResultData?.proofs ?? []).map((p: any) => String(p.transactionHash ?? "")).filter(Boolean).sort();
const updatedDailySpent = updatedDetail?.policy?.dailySpentUsdc ?? "0";
const updatedRemainingUsdc = updatedDetail?.policy?.remainingDailyUsdc ?? "0";
const updatedDailyCalls = updatedDetail?.policy?.dailyCallCount ?? 0;
```

Compute flags dynamically:
```ts
setReplayProof({
  sameJobId: Boolean(executeResult.idempotent && replayJobId && replayJobId === baselineJobId),
  noDuplicatePayment: Boolean(executeResult.idempotent && replayPaymentId && replayPaymentId === baselinePaymentId),
  noNewReceipts: JSON.stringify(replayReceiptIds) === JSON.stringify(baselineReceiptIds),
  noNewProofs: JSON.stringify(replayProofHashes) === JSON.stringify(baselineProofHashes),
  allowancePreserved: updatedDailySpent === baselineDailySpent && updatedRemainingUsdc === baselineRemainingUsdc,
  callCountPreserved: updatedDailyCalls === baselineDailyCalls,
  jobId: baselineJobId ?? "",
  paymentId: baselinePaymentId ?? "",
  receiptCount: baselineReceiptIds.length,
  proofCount: baselineProofHashes.length,
  dailySpentUsdc: baselineDailySpent,
});
```

- [ ] **Step 3: Render Empirical Replay Proof Card in UI**

Display all 6 computed flags in the UI with explicit metrics:
- Job ID: Matching (`jobId`)
- Payment ID: Matching (`paymentId`)
- Receipts: `${receiptCount}` identical receipts
- Proofs: `${proofCount}` identical proof hashes
- Daily Spent: Unchanged (`${dailySpentUsdc}` USDC)
- Call Count: Unchanged

- [ ] **Step 4: Commit**

```bash
git add app/my-agents/my-agents-client.tsx
git commit -m "feat(byoa): calculate idempotency replay proof strictly from pre/post empirical data"
```

---

### Task 2: Dispatch `accountsChanged` Event in Playwright Mock Provider

**Files:**
- Modify: `scripts/byoa-two-wallet-e2e.mts`

**Interfaces:**
- EIP-1193 mock provider in `scripts/byoa-two-wallet-e2e.mts` dispatches `accountsChanged` event to registered listeners when switching active wallet from `ownerAccount` to `agentAccount`.

- [ ] **Step 1: Add Event Dispatcher to `__arcWalletRequest` / Init Script**

In `scripts/byoa-two-wallet-e2e.mts`:
Expose helper `__switchAccount(address)` or trigger `listeners["accountsChanged"]` whenever `activeAccount` changes.

- [ ] **Step 2: Commit**

```bash
git add scripts/byoa-two-wallet-e2e.mts
git commit -m "test(byoa): dispatch accountsChanged event on wallet switch in Playwright mock"
```

---

### Task 3: Create `byoa:two-wallet-canary` Production Canary Runner

**Files:**
- Create: `scripts/byoa-two-wallet-canary.mts`
- Modify: `package.json`

**Interfaces:**
- `npm run byoa:two-wallet-test`: Local browser E2E test (`http://localhost:3000`).
- `npm run byoa:two-wallet-canary`: Production canary runner targeting `--base-url=https://agent-commerce-six.vercel.app` (or `BASE_URL`) using allowlisted canary owner and agent wallets.

- [ ] **Step 1: Create `scripts/byoa-two-wallet-canary.mts`**

Implement production canary script:
- Accepts `--base-url` or defaults to `https://agent-commerce-six.vercel.app`.
- Reads `BYOA_CANARY_OWNER_PRIVATE_KEY` (or `PHASE26_CHECKOUT_PRIVATE_KEY`) and `BYOA_CANARY_AGENT_PRIVATE_KEY` (or generates ephemeral allowlisted keys when authorized).
- Executes Playwright against production Vercel instance.
- Validates Owner Session, Agent Registration, Wallet Binding, Policy, Credential Issue, Payment Execution (USDC on Arc Testnet), Result, and Idempotency Replay.

- [ ] **Step 2: Register `"byoa:two-wallet-canary"` in `package.json`**

```json
"byoa:two-wallet-test": "node --experimental-transform-types --no-warnings --env-file-if-exists=.env.local scripts/byoa-two-wallet-e2e.mts",
"byoa:two-wallet-canary": "node --experimental-transform-types --no-warnings --env-file-if-exists=.env.local scripts/byoa-two-wallet-canary.mts"
```

- [ ] **Step 3: Commit**

```bash
git add scripts/byoa-two-wallet-canary.mts package.json
git commit -m "feat(byoa): add byoa:two-wallet-canary production canary runner"
```

---

### Task 4: Full Suite Verification

**Files:**
- Verification only

- [ ] **Step 1: Run all test commands**

1. `npm run byoa:console-test`
2. `npm run byoa:test`
3. `npm run byoa:two-wallet-test`
4. `npm run lint`
5. `npm run build`
6. `forge test`
7. `git diff --check`

Expected: ALL PASS cleanly!
