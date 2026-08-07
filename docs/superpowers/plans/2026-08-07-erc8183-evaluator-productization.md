# P5.1 — Veyra ERC-8183 Evaluator Productization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Productize Veyra ERC-8183 Evaluator on Arc Testnet into a public capability with `/evaluators` landing page, `/evaluators/erc8183` profile, `/evaluations` explorer, enhanced verification receipt, developer API metadata, SDK methods, machine-readable manifest capabilities, and comprehensive test suite (`npm run erc8183:product-test`).

**Architecture:** Maintain existing canonical evaluator contract (`0x0d2c04580e081e222bbe5bf9818af337e2633eb7`) and commerce contract (`0x0747EEf0706327138c69792bF28Cd525089e4583`). Build public frontend capability pages, public Explorer & Receipts, API metadata endpoint `GET /api/erc8183/v1/evaluator`, manifest capability export, and SDK bindings.

**Tech Stack:** Next.js 16 (App Router), React, TypeScript, Viem 2.x, Tailwind / Vanilla CSS design system, Foundry (`forge`).

## Global Constraints

- Arc Testnet Chain ID: `5042002`
- ERC-8183 Commerce Address: `0x0747EEf0706327138c69792bF28Cd525089e4583`
- Veyra ERC-8183 Evaluator Address: `0x0d2c04580e081e222bbe5bf9818af337e2633eb7`
- Policy Version: `structured-deliverable-v1`
- Never expose private keys, secrets, or internal database IDs.
- All tasks must pass `npm run erc8183:contract-test`, `npm run erc8183:test`, `npm run erc8183:product-test`, `npm run lint`, and `npm run build`.

---

### Task 1: Developer API Metadata & Manifest Capability Export

**Files:**
- Create: `app/api/erc8183/v1/evaluator/route.ts`
- Modify: `app/api/byoa/manifest/route.ts`
- Modify: `lib/erc8183/types.ts`

**Interfaces:**
- Consumes: Canonical addresses and policy identifier from `lib/erc8183/types.ts`
- Produces: `GET /api/erc8183/v1/evaluator` returning standard metadata JSON

- [ ] **Step 1: Define evaluator metadata types**

Update `lib/erc8183/types.ts`:
```ts
export interface EvaluatorMetadata {
  standard: "ERC-8183";
  network: "arc-testnet";
  chainId: 5042002;
  status: "active" | "paused";
  evaluatorAddress: `0x${string}`;
  commerceAddress: `0x${string}`;
  policy: "structured-deliverable-v1";
}
```

- [ ] **Step 2: Create API Route `app/api/erc8183/v1/evaluator/route.ts`**

```ts
import { NextResponse } from "next/server";
import type { EvaluatorMetadata } from "@/lib/erc8183/types";

export async function GET() {
  const metadata: EvaluatorMetadata = {
    standard: "ERC-8183",
    network: "arc-testnet",
    chainId: 5042002,
    status: "active",
    evaluatorAddress: (process.env.NEXT_PUBLIC_VEYRA_ERC8183_EVALUATOR_ADDRESS || "0x0d2c04580e081e222bbe5bf9818af337e2633eb7") as `0x${string}`,
    commerceAddress: (process.env.NEXT_PUBLIC_ARC_ERC8183_COMMERCE_ADDRESS || "0x0747EEf0706327138c69792bF28Cd525089e4583") as `0x${string}`,
    policy: "structured-deliverable-v1",
  };

  return NextResponse.json(metadata, {
    headers: {
      "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
    },
  });
}
```

- [ ] **Step 3: Update `app/api/byoa/manifest/route.ts` to include evaluator capability**

Add `erc8183_evaluation` to capabilities list:
```ts
capabilities: [
  ...existingCapabilities,
  {
    capability: "erc8183_evaluation",
    standard: "ERC-8183",
    network: "arc-testnet",
    chainId: 5042002,
    evaluator: "0x0d2c04580e081e222bbe5bf9818af337e2633eb7",
    commerce: "0x0747EEf0706327138c69792bF28Cd525089e4583",
    policy: "structured-deliverable-v1",
  }
]
```

- [ ] **Step 4: Commit**

```bash
git add app/api/erc8183/v1/evaluator/route.ts app/api/byoa/manifest/route.ts lib/erc8183/types.ts
git commit -m "feat(erc8183): add evaluator metadata endpoint and manifest capability"
```

---

### Task 2: TypeScript SDK & OpenAPI Specification

**Files:**
- Modify: `lib/erc8183/sdk.ts` (or `lib/sdk/erc8183.ts`)
- Modify: `public/openapi.json`

**Interfaces:**
- Consumes: `lib/erc8183/client.ts`, `lib/erc8183/evaluator.ts`
- Produces: SDK functions `veyra.erc8183.getEvaluator()`, `prepareDeliverable()`, `evaluate()`, `getEvaluation()`

- [ ] **Step 1: Implement SDK methods**

In `lib/erc8183/sdk.ts`:
```ts
export const erc8183Sdk = {
  async getEvaluator() {
    const res = await fetch("/api/erc8183/v1/evaluator");
    if (!res.ok) throw new Error("Failed to fetch evaluator metadata");
    return res.json();
  },
  async prepareDeliverable(params: any) {
    const res = await fetch("/api/erc8183/v1/deliverables/prepare", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    });
    if (!res.ok) throw new Error("Failed to prepare deliverable");
    return res.json();
  },
  async evaluate(params: any) {
    const res = await fetch("/api/erc8183/v1/evaluations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    });
    if (!res.ok) throw new Error("Failed to submit evaluation");
    return res.json();
  },
  async getEvaluation(evaluationId: string) {
    const res = await fetch(`/api/erc8183/v1/evaluations/${evaluationId}`);
    if (!res.ok) throw new Error("Evaluation not found");
    return res.json();
  },
};
```

- [ ] **Step 2: Update OpenAPI Spec (`public/openapi.json`)**

Add `/api/erc8183/v1/evaluator` GET operation schema and update request/response schemas for `/api/erc8183/v1/evaluations`.

- [ ] **Step 3: Commit**

```bash
git add lib/erc8183/sdk.ts public/openapi.json
git commit -m "feat(erc8183): add SDK methods and update OpenAPI specification"
```

---

### Task 3: Public Landing Page `/evaluators` & Profile `/evaluators/erc8183`

**Files:**
- Create: `app/evaluators/page.tsx`
- Create: `app/evaluators/erc8183/page.tsx`

**Interfaces:**
- Consumes: Evaluator metadata and policy rules
- Produces: Public capability landing page and detailed trust/capability profile page

- [ ] **Step 1: Create `/evaluators` Landing Page (`app/evaluators/page.tsx`)**

Features:
- Hero: "Veyra Evaluators" — *"Independent evaluation for agentic commerce"*
- Subtitle: *"Use Veyra as an ERC-8183 evaluator to independently verify agent deliverables before settlement."*
- Featured Card: Veyra ERC-8183 Evaluator (`0x0d2c04580e081e222bbe5bf9818af337e2633eb7`), Arc Testnet, Status Active, Policy `structured-deliverable-v1`.
- CTAs: "View on Arcscan", "View Evaluations", "Use Veyra as Evaluator".

- [ ] **Step 2: Create `/evaluators/erc8183` Profile Page (`app/evaluators/erc8183/page.tsx`)**

Sections:
- **Overview**: Explanation of Veyra's role as an independent evaluator.
- **Contract Specs**: Evaluator address, Network, Chain ID (`5042002`), Commerce address, Deployment Tx, Active state.
- **Human-Readable Policy Breakdown**: Itemized 10 policy checks for `structured-deliverable-v1`.
- **How Settlement Works**: Visual flow diagram.
- **Public Statistics**: Aggregated evaluations count, completed, rejected, completion rate, median time, verified canary badge.
- **Integration Code Block**: Multi-tab code snippets (TypeScript, Solidity, Machine API / cURL) with actual Arc ERC-8183 ABI.

- [ ] **Step 3: Commit**

```bash
git add app/evaluators/page.tsx app/evaluators/erc8183/page.tsx
git commit -m "feat(erc8183): create public /evaluators landing and /evaluators/erc8183 profile pages"
```

---

### Task 4: Public Explorer `/evaluations` & Enhanced Receipt `/evaluations/[publicId]`

**Files:**
- Modify: `app/evaluations/page.tsx`
- Modify: `app/evaluations/[publicId]/page.tsx`

**Interfaces:**
- Consumes: Evaluation records API / store
- Produces: Searchable, filterable evaluations list and canonical verification receipts

- [ ] **Step 1: Upgrade `/evaluations` Explorer (`app/evaluations/page.tsx`)**

Features:
- Decision Filters: `All`, `Completed`, `Rejected`, `Retryable`
- Search bar for Public ID, Job ID, or Tx Hash
- Table & Card view displaying Public ID, Job ID, Decision badge, Policy, Timestamp, Canonical Hash, Arc Status.
- Pagination controls.

- [ ] **Step 2: Upgrade `/evaluations/[publicId]` Verification Receipt (`app/evaluations/[publicId]/page.tsx`)**

Sections:
- Decision Badge (`Completed` / `Rejected`)
- ERC-8183 Job Summary (Job ID, Commerce Contract, Provider Address, Evaluator Contract)
- Deliverable Commitment Hash (`deliverableHash`, raw private payload hidden)
- Detailed Policy Evaluation Checklist with pass/fail status for each check
- Cryptographic Proof (Report Hash, EIP-712 Attester/Relayer signatures, Settlement Tx Hash, Arcscan links)

- [ ] **Step 3: Commit**

```bash
git add app/evaluations/page.tsx app/evaluations/[publicId]/page.tsx
git commit -m "feat(erc8183): enhance evaluations explorer and verification receipt page"
```

---

### Task 5: Main Landing Page & Developer Console Updates

**Files:**
- Modify: `app/page.tsx`
- Modify: `app/console/erc8183/page.tsx` (or `app/console/page.tsx`)

- [ ] **Step 1: Update Veyra Homepage (`app/page.tsx`)**

Add dedicated section: *"Trust Infrastructure for Agentic Commerce — Independent ERC-8183 Evaluator"* with description and CTA button *"Explore Evaluator"* linking to `/evaluators`.

- [ ] **Step 2: Update Developer Console (`app/console/erc8183/page.tsx`)**

Display Evaluator tab featuring contract parameters, network status, SDK/API quickstart, recent canary runs, and developer toggle.

- [ ] **Step 3: Commit**

```bash
git add app/page.tsx app/console/erc8183/page.tsx
git commit -m "feat(erc8183): integrate evaluator capability into homepage and developer console"
```

---

### Task 6: Comprehensive Verification Test Suite (`npm run erc8183:product-test`)

**Files:**
- Create: `scripts/erc8183-product-test.mts`
- Modify: `package.json`

- [ ] **Step 1: Create Product Test Script (`scripts/erc8183-product-test.mts`)**

Automated checks:
1. `GET /api/erc8183/v1/evaluator` returns valid JSON with correct standard, chainId (`5042002`), evaluatorAddress, and policy.
2. `GET /api/byoa/manifest` includes `erc8183_evaluation` capability.
3. SDK `veyra.erc8183.getEvaluator()` resolves metadata correctly.
4. Evaluation policy serialization excludes sensitive private data.
5. OpenAPI spec validates evaluator endpoints and schemas.

- [ ] **Step 2: Add npm script to `package.json`**

```json
"erc8183:product-test": "node --experimental-transform-types --no-warnings scripts/erc8183-product-test.mts"
```

- [ ] **Step 3: Run full verification suite**

```bash
npm run erc8183:contract-test
npm run erc8183:test
npm run erc8183:product-test
npm run lint
npm run build
```

- [ ] **Step 4: Commit**

```bash
git add scripts/erc8183-product-test.mts package.json
git commit -m "test(erc8183): add productization test script and pass full verification suite"
```

---

### Task 7: Production Canary Run & Final Report

**Files:**
- Script: `scripts/run-production-canary.mts`

- [ ] **Step 1: Execute production canary script on Arc Testnet**

```bash
node --experimental-transform-types --no-warnings --env-file-if-exists=.env.local scripts/run-production-canary.mts
```

- [ ] **Step 2: Verify output JSON block and onchain completion**

Confirm:
- `evaluatorContractAddress`: `0x0d2c04580e081e222bbe5bf9818af337e2633eb7`
- `completeTx` on Arc Testnet
- `settlementStatus`: `Completed`
- Canonical report hash matches onchain proof.

- [ ] **Step 3: Commit and push to `main`**

```bash
git add .
git commit -m "feat(p5.1): complete Veyra ERC-8183 Evaluator productization and production canary verification"
git push origin main
```
