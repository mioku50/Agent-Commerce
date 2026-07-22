# Phase 29.2 — Funding Transaction Proof Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Empirically prove that Direct Send USDC executes an explicit ERC-20 `transfer(agentWallet, atomicAmount)` contract call to the Arc USDC contract `0x3600000000000000000000000000000000000000` with `value: 0` and correct `callData`, verified by onchain tx receipt & balance delta.

**Architecture:**
- `components/wallet/use-arc-wallet.ts`:
  - Exposed `sendTransaction({ to, data, value: "0x0" })` on `useArcWallet`.
- `app/my-agents/my-agents-client.tsx`:
  - `executeFundingTransaction()` issues `sendTransaction` with `to: ARC_TESTNET_USDC_ADDRESS`, `data: fundingIntent.callData`, `value: "0x0"`.
  - Refetches updated balance from `/api/byoa/management/agents/[agentId]/fund`.
  - NO fallback fake hex hash generators.
- `scripts/byoa-funding-tests.mts`:
  - Encodes and decodes calldata using `decodeFunctionData` to verify function `transfer(agentWallet, atomicAmount)` for 0.01 USDC (10000 atomic units).
- Documentation:
  - Document honestly in README that Direct Send USDC executes `eth_sendTransaction` via connected wallet to the Arc USDC ERC-20 contract with `0xa9059cbb` `transfer(agentWallet, amount)` calldata and zero native value (`value: 0x0`).

---

### Verification Checklist

- [x] **Step 1: Check `sendTransaction` interface on `useArcWallet`**
- [x] **Step 2: Check `executeFundingTransaction` parameters in `my-agents-client.tsx`**
- [x] **Step 3: Run `npm run byoa:funding-test`**
- [x] **Step 4: Run `npm run byoa:funding-e2e`**
- [x] **Step 5: Run `npm run byoa:funding-canary`**
- [x] **Step 6: Run `npm run lint`**
- [x] **Step 7: Run `npm run build`**
- [x] **Step 8: Run `forge test`**
