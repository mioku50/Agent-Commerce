# Phase 29 — App Kit Agent Funding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add secure, gas-abstracted USDC funding for external agent wallets through Circle App Kit and direct EVM transfers on Arc Testnet without altering the existing BYOA/x402 workflow payment flow.

**Architecture:**
- Create `lib/byoa/funding.ts` with utilities to estimate fees, build fixed-recipient transfer parameters for Arc USDC (`0x3600000000000000000000000000000000000000`), CCTP bridge, and Gateway deposits, and query agent wallet balances.
- Add POST `/api/byoa/management/agents/[agentId]/fund` endpoint to generate immutable funding intents with hardcoded recipient = `agent.agent_wallet`.
- Update `app/my-agents/my-agents-client.tsx` with a "Fund Agent Wallet" modal allowing users to choose funding paths ("Send USDC on Arc", "Bridge USDC to Arc", "Gateway Unified Deposit"), inspect a pre-signature preview card, execute via browser wallet, and view post-transaction balance updates.
- Create automated test suite (`byoa:funding-test`, `byoa:funding-e2e`, `byoa:funding-canary`).

**Tech Stack:** Next.js 16 (React 19), viem, Circle App Kit / CCTP / Gateway, Arc Testnet (chain 5042002).

## Global Constraints

- App Kit / funding is used ONLY for funding the agent wallet balance.
- x402 workflow payment remains signed by Agent Wallet.
- Owner Wallet does NOT automatically become workflow payer.
- Do NOT modify `lib/x402.ts`, Gateway settlement, or Proof Registry.
- Recipient MUST be hardcoded to `agentWallet` and cannot be tampered with via browser inputs.
- Funding transactions are logged separately from workflow receipts and Arc proofs.

---

### Task 1: Funding Service & Intent Builder (`lib/byoa/funding.ts`)

**Files:**
- Create: `lib/byoa/funding.ts`

**Interfaces:**
- `buildFundingIntent(params)`: Returns immutable route preview, fixed recipient, amount, fee, and contract call data for `arc_transfer`, `cctp_bridge`, and `gateway_deposit`.
- `getAgentWalletUsdcBalance(address)`: Queries ERC-20 USDC balance on Arc Testnet via `viem`.

- [ ] **Step 1: Implement `lib/byoa/funding.ts`**

Define types:
```ts
export type FundingMethod = "arc_transfer" | "cctp_bridge" | "gateway_deposit";

export type FundingIntent = {
  agentId: string;
  agentWallet: string;
  method: FundingMethod;
  amountUsdc: string;
  amountAtomic: string;
  sourceChain: string;
  destinationChain: string;
  recipientFixed: string;
  contractTarget: string;
  callData?: string;
  estimatedFeeUsdc: string;
  previewSummary: string;
};
```

Implement `buildFundingIntent`:
- Hardcodes `recipientFixed` to `agentWallet`.
- Formats `arc_transfer`: target contract `0x3600000000000000000000000000000000000000`, function `transfer(to, amount)`.
- Formats `cctp_bridge`: target TokenMessenger, domain 26 (Arc).
- Formats `gateway_deposit`: Gateway deposit contract target.
- Returns immutable intent.

- [ ] **Step 2: Implement Balance Query Utility**

`getAgentWalletUsdcBalance(walletAddress: string)`: Uses public client to query `balanceOf(walletAddress)` on `0x3600000000000000000000000000000000000000` (Arc Testnet USDC).

- [ ] **Step 3: Commit**

```bash
git add lib/byoa/funding.ts
git commit -m "feat(byoa): add funding service and intent builder"
```

---

### Task 2: Funding API Route (`POST /api/byoa/management/agents/[agentId]/fund`)

**Files:**
- Create: `app/api/byoa/management/agents/[agentId]/fund/route.ts`

**Interfaces:**
- `POST /api/byoa/management/agents/[agentId]/fund`: Validates owner session, fetches agent row, and returns immutable funding intent with hardcoded recipient.

- [ ] **Step 1: Implement Route Handler**

In `app/api/byoa/management/agents/[agentId]/fund/route.ts`:
- Require owner session (`requireOwnerSession(request)`).
- Extract `agentId` and request body (`{ method, amountUsdc }`).
- Fetch agent detail (`getAgentManagementDetail(owner.wallet, agentId)`).
- Verify `agent` exists and `agent.agent_wallet` is valid.
- Call `buildFundingIntent` with fixed recipient `agent.agent_wallet`.
- Return JSON `{ intent: fundingIntent }`.

- [ ] **Step 2: Commit**

```bash
git add app/api/byoa/management/agents/[agentId]/fund/route.ts
git commit -m "feat(byoa): add agent funding intent API route with fixed recipient enforcement"
```

---

### Task 3: Agent Funding Modal & UI Integration in `my-agents-client.tsx`

**Files:**
- Modify: `app/my-agents/my-agents-client.tsx`

**Interfaces:**
- Adds "Fund Agent Wallet" button to agent card.
- Opens Funding Modal with 3 tabs: "Send USDC on Arc", "Bridge USDC to Arc", "Gateway Deposit".
- Displays fixed recipient notice (`Recipient: 0xAgent... (Fixed)`).
- Displays Pre-signature Route Preview card.
- Executes transfer using connected wallet (`useArcWallet()`).
- Shows post-transaction result badge with Source, Destination Chain, Amount, Tx Hash, and Updated Agent USDC Balance.

- [ ] **Step 1: Add Funding Modal Component & State**

State variables:
- `isFundingOpen`: boolean
- `fundingMethod`: "arc_transfer" | "cctp_bridge" | "gateway_deposit"
- `fundingAmount`: string (default "1.0")
- `fundingIntent`: FundingIntent | null
- `fundingResult`: { txHash: string; updatedBalance: string } | null

- [ ] **Step 2: Add "Fund Agent Wallet" Button & Modal UI**

In Step 2 / Agent Card:
- Add `<Button onClick={() => openFundingModal(agent)}>Fund Agent Wallet</Button>`.
- Render Modal containing:
  - Tab selector for funding method.
  - Amount input.
  - Notice: "Recipient is locked to registered agent wallet `0xAgent...`."
  - Button "Preview Funding Intent".
  - Pre-signature Route Preview breakdown (Source Wallet, Recipient, Amount, Destination Chain: Arc Testnet, Estimated Gas).
  - Button "Confirm & Execute Transfer".
  - Result card displaying Tx Hash link on Arc Explorer and refreshed Agent USDC balance.

- [ ] **Step 3: Commit**

```bash
git add app/my-agents/my-agents-client.tsx
git commit -m "feat(byoa): add Fund Agent Wallet modal and execution UI"
```

---

### Task 4: Automated Testing & Production Canary Scripts

**Files:**
- Create: `scripts/byoa-funding-tests.mts`
- Create: `scripts/byoa-funding-e2e.mts`
- Create: `scripts/byoa-funding-canary.mts`
- Modify: `package.json`

**Interfaces:**
- `npm run byoa:funding-test`: Unit/integration tests for funding intent builder & recipient immutability.
- `npm run byoa:funding-e2e`: Playwright E2E browser test verifying funding flow UI against `http://localhost:3000`.
- `npm run byoa:funding-canary`: Production canary runner targeting `--base-url=https://agent-commerce-six.vercel.app`.

- [ ] **Step 1: Create `scripts/byoa-funding-tests.mts`**

Tests:
- Funding intent builder hardcodes recipient.
- Rejects invalid amounts (amount <= 0 or non-numeric).
- Generates valid ERC-20 transfer calldata for Arc USDC `0x3600000000000000000000000000000000000000`.
- Validates Gateway deposit intent.

- [ ] **Step 2: Create `scripts/byoa-funding-e2e.mts`**

Playwright test:
- Connects Owner Wallet, registers Agent Wallet.
- Clicks "Fund Agent Wallet".
- Previews intent.
- Executes transfer with mock wallet on Arc Testnet.
- Verifies post-transaction result badge, tx hash, and updated balance.

- [ ] **Step 3: Create `scripts/byoa-funding-canary.mts`**

Production canary script running against Vercel.

- [ ] **Step 4: Register NPM Scripts in `package.json`**

Add:
```json
"byoa:funding-test": "node --experimental-transform-types --no-warnings --env-file-if-exists=.env.local scripts/byoa-funding-tests.mts",
"byoa:funding-e2e": "node --experimental-transform-types --no-warnings --env-file-if-exists=.env.local scripts/byoa-funding-e2e.mts",
"byoa:funding-canary": "node --experimental-transform-types --no-warnings --env-file-if-exists=.env.local scripts/byoa-funding-canary.mts"
```

- [ ] **Step 5: Commit**

```bash
git add scripts/byoa-funding-tests.mts scripts/byoa-funding-e2e.mts scripts/byoa-funding-canary.mts package.json
git commit -m "test(byoa): add unit, Playwright E2E, and canary scripts for agent funding"
```

---

### Task 5: Full Suite Verification

- [ ] **Step 1: Execute test suite**

Run:
1. `npm run byoa:funding-test`
2. `npm run byoa:funding-e2e`
3. `npm run byoa:console-test`
4. `npm run byoa:two-wallet-test`
5. `npm run lint`
6. `npm run build`
7. `forge test`
8. `git diff --check`

Expected: ALL PASS cleanly!
