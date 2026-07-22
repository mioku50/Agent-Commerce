# Phase 29.1 — Real App Kit Funding Closure Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate all simulations, fake hashes, and incomplete balance checks from Phase 29, replacing them with official `@circle-fin/app-kit` integration, full ERC-20 ABI queries, real transaction receipt verification, and explicit "Unavailable in current environment" notices for unsupported paths.

**Architecture:**
- `@circle-fin/app-kit` & `@circle-fin/adapter-viem-v2` installed in `package.json`.
- `lib/byoa/funding.ts`:
  - Full ERC-20 ABI (`balanceOf`, `decimals`, `symbol`, `transfer`, `approve`, `allowance`).
  - Production-ready `getAgentWalletUsdcBalance(walletAddress)` with fallback RPC error handling.
  - Real Arc USDC transfer intent builder (`arc_transfer`).
  - Honest status for CCTP bridge and Gateway unified balance: returns `supported: false` with notice `Unavailable in current environment` if not fully configured for testnet route.
  - ZERO simulation comments or dummy contract targets.
- `app/api/byoa/management/agents/[agentId]/fund/route.ts`:
  - Enforces `recipientFixed === agentWallet`.
  - Returns `intent`, `supported`, `currentAgentBalance`.
- `app/my-agents/my-agents-client.tsx`:
  - Direct real EVM transfer via connected wallet for `arc_transfer`.
  - NO fallback random hash generator: errors render error card directly.
  - Waits for actual onchain transaction confirmation before showing success.
  - Displays "Unavailable in current environment" badges for unsupported bridge/gateway options.
- `scripts/byoa-funding-tests.mts` & `scripts/byoa-funding-canary.mts`:
  - Canary verifies `balance before` -> `transaction receipt` -> `balance after` on Arc Testnet.

---

### Task 1: Complete ERC-20 ABI & Real Funding Intent Builder (`lib/byoa/funding.ts`)

**Files:**
- Modify: `lib/byoa/funding.ts`

- [ ] **Step 1: Add complete ERC-20 ABI & update `lib/byoa/funding.ts`**

Define full ABI:
```ts
export const ERC20_ABI = [
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "decimals",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint8" }],
  },
  {
    name: "symbol",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "string" }],
  },
  {
    name: "transfer",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "value", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;
```

Update `buildFundingIntent`:
- `arc_transfer`: Real Arc Testnet USDC transfer targeting `0x3600000000000000000000000000000000000000`.
- `cctp_bridge` & `gateway_deposit`: Set `supported: false`, notice `"Unavailable in current environment"`, remove any simulation comments or fake contract targets.

- [ ] **Step 2: Update `getAgentWalletUsdcBalance`**

Query `balanceOf` using full `ERC20_ABI`. If query fails, throw explicit error or log warning without masking ABI defects.

- [ ] **Step 3: Commit**

```bash
git add lib/byoa/funding.ts
git commit -m "feat(byoa): update funding service with full ERC-20 ABI and remove all simulations"
```

---

### Task 2: Update Funding API Route (`POST /api/byoa/management/agents/[agentId]/fund/route.ts`)

**Files:**
- Modify: `app/api/byoa/management/agents/[agentId]/fund/route.ts`

- [ ] **Step 1: Update Route Handler to return support status and live balance**

Check `intent.supported`. If method is unsupported, return `{ intent, supported: false, notice: "Unavailable in current environment", currentAgentBalance }`.

- [ ] **Step 2: Commit**

```bash
git add app/api/byoa/management/agents/[agentId]/fund/route.ts
git commit -m "feat(byoa): return support status and notice from funding route"
```

---

### Task 3: Real Execution & UI Cleanup in `my-agents-client.tsx`

**Files:**
- Modify: `app/my-agents/my-agents-client.tsx`

- [ ] **Step 1: Remove Random Hash Fallback**

In `executeFundingTransaction()`:
- Call `wallet.sendWorkflowPayment()` or App Kit `send()`.
- On error/reject/revert, set `error` state. **DO NOT generate random 32-byte hex hashes!**

- [ ] **Step 2: Add Real Onchain Confirmation Wait**

After obtaining transaction hash:
- Poll or query public client for `getTransactionReceipt(hash)`.
- Re-query `getAgentWalletUsdcBalance`.
- Display Success Card with actual tx hash link to Arc Explorer.

- [ ] **Step 3: Render Unsupported Badges in Modal**

If `fundingMethod` is `cctp_bridge` or `gateway_deposit`, render:
- Badge: `Unavailable in current environment`
- Notice: "CCTP Bridge and Gateway Unified Spend require production crosschain route bindings. Use Direct Send USDC on Arc for testnet top-ups."

- [ ] **Step 4: Commit**

```bash
git add app/my-agents/my-agents-client.tsx
git commit -m "feat(byoa): enforce real transaction hashes and receipt confirmation in funding UI"
```

---

### Task 4: Test Suite & Real Canary (`scripts/byoa-funding-tests.mts` & `canary`)

**Files:**
- Modify: `scripts/byoa-funding-tests.mts`
- Modify: `scripts/byoa-funding-canary.mts`

- [ ] **Step 1: Update `scripts/byoa-funding-tests.mts`**

Assert no simulation comments exist in intent output and `supported: false` is returned for unavailable methods.

- [ ] **Step 2: Update `scripts/byoa-funding-canary.mts`**

Canary flow:
1. Reads `balance before`.
2. Previews intent.
3. Obtains transaction receipt.
4. Reads `balance after`.
5. Verifies `balance after > balance before`.

- [ ] **Step 3: Commit**

```bash
git add scripts/byoa-funding-tests.mts scripts/byoa-funding-canary.mts
git commit -m "test(byoa): update funding tests and canary for real balance before/after verification"
```

---

### Task 5: Full Suite Verification

- [ ] **Step 1: Run all checks**

1. `npm run byoa:funding-test`
2. `npm run byoa:funding-e2e`
3. `npm run byoa:console-test`
4. `npm run byoa:test`
5. `npm run lint`
6. `npm run build`
7. `forge test`
