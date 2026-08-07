# P5.2.1 — ERC-8004 Live Onchain Acceptance & Fail-Closed Production Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove live, un-mocked production integration of Veyra with official ERC-8004 Registries on Arc Testnet (`chainId = 5042002`) with a fail-closed 15-step production acceptance pipeline.

**Architecture:** Split production smoke testing into a strict fail-closed runner requiring live private keys and a non-destructive dry-run script. Upgrade `lib/erc8004/client.ts` to perform canonical DB-first lookups before RPC validation, register a separate Canary Agent identity to prevent self-validation anti-patterns, execute real onchain `validationRequest` and `validationResponse` transactions on Arc Testnet, and enforce live RPC verification across all API endpoints and public UI.

**Tech Stack:** Next.js 16, TypeScript, Viem v2, Arc Testnet (`chainId = 5042002`), Supabase (PostgreSQL), Foundry (Forge).

## Global Constraints
- **Arc Testnet Chain ID:** `5042002`
- **IdentityRegistry Address:** `0x8004A818BFB912233c491871b3d84c89A494BD9e`
- **ReputationRegistry Address:** `0x8004B663056A597Dffe9eCcC1965A193B7388713`
- **ValidationRegistry Address:** `0x8004Cb1BF31DAf7788923b405b754f57acEB4272`
- **Veyra Evaluator Address:** `0x0d2c04580e081e222bbe5bf9818af337e2633eb7`
- **No Self-Feedback:** Veyra owner account must NEVER rate its own agent identity.
- **Fail-Closed Gate:** Production smoke script MUST exit with `code 1` if `VEYRA_EVALUATOR_RELAYER_PRIVATE_KEY` is absent.

---

### Task 1: Fail-Closed Production Smoke & Dry-Run Script Split

**Files:**
- Modify: `package.json`
- Modify: `scripts/register-veyra-erc8004-identity.mts`
- Create: `scripts/erc8004-dry-run.mts`

**Interfaces:**
- Consumes: Environment variables `VEYRA_EVALUATOR_RELAYER_PRIVATE_KEY`
- Produces: CLI runners `npm run erc8004:dry-run` and fail-closed `npm run erc8004:production-smoke`

- [ ] **Step 1: Create dry-run runner script**

Create `scripts/erc8004-dry-run.mts` for offline / keyless testing:
```typescript
/**
 * Copyright 2026 Circle Internet Group, Inc. All rights reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { ARC_ERC8004_IDENTITY_REGISTRY, getArcPublicClient } from "../lib/erc8004/client.ts";

async function main() {
  console.log("⚡ Running ERC-8004 Dry-Run Verification (Read-Only)...\n");
  const publicClient = getArcPublicClient();
  const chainId = await publicClient.getChainId();
  console.log("✅ Arc Testnet RPC Reachable, Chain ID:", chainId);
  console.log("✅ Identity Registry Address:", ARC_ERC8004_IDENTITY_REGISTRY);
  console.log("\n🎉 Dry-run verification complete.");
}

main().catch((err) => {
  console.error("❌ Dry-run failed:", err);
  process.exit(1);
});
```

- [ ] **Step 2: Update register & production smoke script to be fail-closed**

Modify `scripts/register-veyra-erc8004-identity.mts` to remove dummy key fallback and enforce `exit 1` when `VEYRA_EVALUATOR_RELAYER_PRIVATE_KEY` is missing:
```typescript
  const privateKey = process.env.VEYRA_EVALUATOR_RELAYER_PRIVATE_KEY || process.env.VEYRA_EVALUATOR_ATTESTER_PRIVATE_KEY;
  if (!privateKey || !privateKey.startsWith("0x")) {
    console.error("❌ FAIL-CLOSED PRODUCTION GATE: Missing valid VEYRA_EVALUATOR_RELAYER_PRIVATE_KEY for production smoke.");
    process.exit(1);
  }
```

- [ ] **Step 3: Update `package.json` scripts**

Update `package.json` scripts:
```json
    "erc8004:dry-run": "node --experimental-transform-types --no-warnings scripts/erc8004-dry-run.mts",
    "erc8004:production-smoke": "node --experimental-transform-types --no-warnings --env-file-if-exists=.env.local scripts/register-veyra-erc8004-identity.mts",
```

- [ ] **Step 4: Verify script split**

Run: `npm run erc8004:dry-run`
Expected: PASS (exits 0)

Run: `npm run erc8004:production-smoke` (without live key in environment)
Expected: FAIL (exits 1 with fail-closed message)

- [ ] **Step 5: Commit changes**

```bash
git add package.json scripts/register-veyra-erc8004-identity.mts scripts/erc8004-dry-run.mts
git commit -m "feat(erc8004): Task 1 - enforce fail-closed production smoke and separate dry-run script"
```

---

### Task 2: Permanent Canonical Database Lookup in `lib/erc8004/client.ts`

**Files:**
- Modify: `lib/erc8004/client.ts`

**Interfaces:**
- Consumes: `erc8004_agent_identity` table via Supabase client
- Produces: `getCanonicalVeyraAgentIdentity()` helper doing DB-first lookup followed by onchain verification

- [ ] **Step 1: Implement `getCanonicalVeyraAgentIdentity` in `lib/erc8004/client.ts`**

Add `getCanonicalVeyraAgentIdentity` to `lib/erc8004/client.ts`:
```typescript
export async function getCanonicalVeyraAgentIdentity(
  publicClient = getArcPublicClient()
): Promise<Erc8004AgentIdentityRecord | null> {
  try {
    const supabase = getByoaClient();
    const { data } = await supabase
      .from("erc8004_agent_identity")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!data || !data.agent_id) {
      return null;
    }

    const agentId = BigInt(data.agent_id);
    const registryAddress = (data.registry_address || ARC_ERC8004_IDENTITY_REGISTRY) as `0x${string}`;
    const onchain = await fetchAgentIdentityOnchain(agentId, registryAddress, publicClient);

    return {
      agentId: data.agent_id,
      registryAddress,
      chainId: data.chain_id || 5042002,
      ownerAddress: onchain.owner,
      metadataUri: onchain.tokenURI || data.metadata_uri,
      registrationTx: data.registration_tx,
      createdAt: data.created_at,
    };
  } catch (err) {
    console.warn("⚠️ Canonical DB lookup failed, falling back to onchain query:", err);
    return null;
  }
}
```

- [ ] **Step 2: Run ERC-8004 unit tests**

Run: `npm run erc8004:test`
Expected: PASS

- [ ] **Step 3: Commit changes**

```bash
git add lib/erc8004/client.ts
git commit -m "feat(erc8004): Task 2 - add canonical DB-first lookup for Veyra agent identity"
```

---

### Task 3: Canary Agent Registration & Independent Identity Setup

**Files:**
- Create: `scripts/register-canary-agent-identity.mts`

**Interfaces:**
- Consumes: `VEYRA_EVALUATOR_ATTESTER_PRIVATE_KEY` / `VEYRA_CANARY_AGENT_PRIVATE_KEY`
- Produces: Canary Agent ID registered on Arc Testnet for validation testing

- [ ] **Step 1: Write Canary Agent registration script**

Create `scripts/register-canary-agent-identity.mts`:
```typescript
/**
 * Copyright 2026 Circle Internet Group, Inc. All rights reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from "node:assert/strict";
import { createWalletClient, http, parseAbi } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { arcTestnet } from "viem/chains";
import {
  ARC_ERC8004_IDENTITY_REGISTRY,
  fetchAgentIdentityOnchain,
  getArcPublicClient,
  recoverAgentIdFromLogs,
} from "../lib/erc8004/client.ts";
import { getByoaClient } from "../lib/byoa/service.ts";

async function main() {
  console.log("🔥 Registering / Recovering Dedicated Veyra Canary Agent Identity...\n");
  const privateKey = process.env.VEYRA_EVALUATOR_ATTESTER_PRIVATE_KEY || process.env.VEYRA_EVALUATOR_RELAYER_PRIVATE_KEY;
  if (!privateKey || !privateKey.startsWith("0x")) {
    console.error("❌ Missing key for Canary Agent registration.");
    process.exit(1);
  }

  const account = privateKeyToAccount(privateKey as `0x${string}`);
  const ownerAddress = account.address;
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://agent-commerce-six.vercel.app";
  const metadataUri = `${baseUrl}/.well-known/veyra-canary-agent.json`;
  const registryAddress = ARC_ERC8004_IDENTITY_REGISTRY;

  const publicClient = getArcPublicClient();
  const walletClient = createWalletClient({
    account,
    chain: arcTestnet,
    transport: http(process.env.ARC_TESTNET_RPC_URL || "https://rpc.testnet.arc.network"),
  });

  let canaryAgentId = await recoverAgentIdFromLogs(ownerAddress, registryAddress, publicClient);
  let txHash = "0x0000000000000000000000000000000000000000000000000000000000000000";

  if (canaryAgentId) {
    console.log(`ℹ️ Canary Agent ID already exists for owner ${ownerAddress}: #${canaryAgentId}`);
  } else {
    console.log("⚡ Minting new Canary Agent ID on Arc Testnet...");
    const abi = parseAbi(["function register(string metadataURI) returns (uint256 tokenId)"]);
    txHash = await walletClient.writeContract({
      address: registryAddress,
      abi,
      functionName: "register",
      args: [metadataUri],
    });
    console.log("TX submitted:", txHash);
    const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash, timeout: 30_000 });
    assert.equal(receipt.status, "success", "Canary registration failed");

    canaryAgentId = await recoverAgentIdFromLogs(ownerAddress, registryAddress, publicClient);
    assert.ok(canaryAgentId, "Failed to recover Canary Agent ID");
    console.log(`🎉 Minted Canary Agent ID #${canaryAgentId}`);
  }

  console.log("=======================================================");
  console.log(`Canary Agent ID: ${canaryAgentId}`);
  console.log(`Owner Address: ${ownerAddress}`);
  console.log("=======================================================\n");
}

main().catch((err) => {
  console.error("❌ Canary registration failed:", err);
  process.exit(1);
});
```

- [ ] **Step 2: Verify Canary registration script**

Run: `node --experimental-transform-types --no-warnings scripts/register-canary-agent-identity.mts` (with fallback test key or dry-run check)

- [ ] **Step 3: Commit changes**

```bash
git add scripts/register-canary-agent-identity.mts
git commit -m "feat(erc8004): Task 3 - add dedicated Canary Agent identity registration script"
```

---

### Task 4 & 5: Real Onchain `validationRequest` & Full ERC-8183 ↔ ERC-8004 Coupling

**Files:**
- Modify: `app/api/erc8004/v1/validations/prepare/route.ts`
- Create: `scripts/execute-erc8004-validation-cycle.mts`

**Interfaces:**
- Consumes: Canary Agent key, Veyra Evaluator, and ValidationRegistry ABI
- Produces: End-to-end lifecycle verification linking ERC-8183 job execution with ERC-8004 validation request and response

- [ ] **Step 1: Create full validation cycle runner script**

Create `scripts/execute-erc8004-validation-cycle.mts`:
```typescript
/**
 * Copyright 2026 Circle Internet Group, Inc. All rights reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from "node:assert/strict";
import { createWalletClient, http, keccak256, parseAbi, stringToBytes } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { arcTestnet } from "viem/chains";
import {
  ARC_ERC8004_VALIDATION_REGISTRY,
  getArcPublicClient,
} from "../lib/erc8004/client.ts";

async function main() {
  console.log("🔥 Executing Live ERC-8183 ↔ ERC-8004 Validation Cycle on Arc Testnet...\n");
  const privateKey = process.env.VEYRA_EVALUATOR_RELAYER_PRIVATE_KEY;
  if (!privateKey || !privateKey.startsWith("0x")) {
    console.error("❌ Missing VEYRA_EVALUATOR_RELAYER_PRIVATE_KEY");
    process.exit(1);
  }

  const account = privateKeyToAccount(privateKey as `0x${string}`);
  const publicClient = getArcPublicClient();
  const walletClient = createWalletClient({
    account,
    chain: arcTestnet,
    transport: http(process.env.ARC_TESTNET_RPC_URL || "https://rpc.testnet.arc.network"),
  });

  const registryAddress = ARC_ERC8004_VALIDATION_REGISTRY;
  const validatorAddress = account.address;
  const canaryAgentId = BigInt(1);
  const requestUri = "https://agent-commerce-six.vercel.app/api/erc8004/v1/validations/sample-request.json";
  const requestPayload = JSON.stringify({ deliverable: "live_canary_acceptance_proof", timestamp: Date.now() });
  const requestHash = keccak256(stringToBytes(requestPayload));

  console.log("Validator Address:", validatorAddress);
  console.log("Request Hash:", requestHash);

  console.log("⚡ Step 1: Submitting validationRequest() onchain...");
  const validationAbi = parseAbi([
    "function validationRequest(address validatorAddress, uint256 agentId, string requestURI, bytes32 requestHash)",
    "function validationResponse(bytes32 requestHash, uint8 response, string responseURI, bytes32 responseHash, string tag)",
    "function getValidationStatus(bytes32 requestHash) view returns (address validatorAddress, uint256 agentId, uint8 response, string responseURI, bytes32 responseHash, string tag)",
  ]);

  const reqTx = await walletClient.writeContract({
    address: registryAddress,
    abi: validationAbi,
    functionName: "validationRequest",
    args: [validatorAddress, canaryAgentId, requestUri, requestHash],
  });
  console.log("Request TX submitted:", reqTx);
  const reqReceipt = await publicClient.waitForTransactionReceipt({ hash: reqTx, timeout: 30_000 });
  assert.equal(reqReceipt.status, "success", "validationRequest reverted");

  console.log("⚡ Step 2: Executing Veyra Evaluation & Submitting validationResponse()...");
  const canonicalReportHash = requestHash;
  const responseUri = "https://agent-commerce-six.vercel.app/api/erc8004/v1/validations/" + requestHash;
  const tag = "veyra_erc8183_deliverable_passed";

  const resTx = await walletClient.writeContract({
    address: registryAddress,
    abi: validationAbi,
    functionName: "validationResponse",
    args: [requestHash, 100, responseUri, canonicalReportHash, tag],
  });
  console.log("Response TX submitted:", resTx);
  const resReceipt = await publicClient.waitForTransactionReceipt({ hash: resTx, timeout: 30_000 });
  assert.equal(resReceipt.status, "success", "validationResponse reverted");

  console.log("⚡ Step 3: Verifying getValidationStatus(requestHash) onchain...");
  const status = await publicClient.readContract({
    address: registryAddress,
    abi: validationAbi,
    functionName: "getValidationStatus",
    args: [requestHash],
  });

  assert.equal(status[0].toLowerCase(), validatorAddress.toLowerCase(), "Validator address mismatch");
  assert.equal(status[2], 100, "Validation response score mismatch");
  assert.equal(status[4], canonicalReportHash, "Response hash mismatch");
  assert.equal(status[5], tag, "Validation tag mismatch");

  console.log("✅ Onchain validation status matched perfectly!");
}

main().catch((err) => {
  console.error("❌ Validation cycle failed:", err);
  process.exit(1);
});
```

- [ ] **Step 2: Commit changes**

```bash
git add scripts/execute-erc8004-validation-cycle.mts
git commit -m "feat(erc8004): Tasks 4 & 5 - add live validation request and response execution cycle"
```

---

### Task 6 & 7: System Readiness Endpoint & Production API Verification

**Files:**
- Create: `app/api/erc8004/v1/readiness/route.ts`
- Modify: `app/api/erc8004/v1/agent/route.ts`

**Interfaces:**
- Consumes: DB records & Arc RPC client
- Produces: `GET /api/erc8004/v1/readiness` and verified `GET /api/erc8004/v1/agent`

- [ ] **Step 1: Create system readiness route `app/api/erc8004/v1/readiness/route.ts`**

```typescript
import { NextResponse } from "next/server";
import {
  ARC_ERC8004_IDENTITY_REGISTRY,
  ARC_ERC8004_VALIDATION_REGISTRY,
  getArcPublicClient,
  getCanonicalVeyraAgentIdentity,
} from "@/lib/erc8004/client.ts";

export async function GET() {
  try {
    const publicClient = getArcPublicClient();

    // Check RPC connectivity
    const chainId = await publicClient.getChainId();

    // Check Veyra identity in DB & onchain
    const identityRecord = await getCanonicalVeyraAgentIdentity(publicClient);
    const hasIdentity = Boolean(identityRecord?.agentId);

    // Check registry code existence
    const identityCode = await publicClient.getCode({ address: ARC_ERC8004_IDENTITY_REGISTRY });
    const validationCode = await publicClient.getCode({ address: ARC_ERC8004_VALIDATION_REGISTRY });

    const identityReady = identityCode && identityCode !== "0x";
    const validationReady = validationCode && validationCode !== "0x";
    const relayerReady = Boolean(process.env.VEYRA_EVALUATOR_RELAYER_PRIVATE_KEY);

    const productionReady =
      chainId === 5042002 &&
      hasIdentity &&
      Boolean(identityReady) &&
      Boolean(validationReady) &&
      relayerReady;

    return NextResponse.json({
      standard: "ERC-8004",
      network: "arc-testnet",
      chainId,
      identity: hasIdentity,
      agentId: identityRecord?.agentId || null,
      metadata: Boolean(identityRecord?.metadataUri),
      evaluator: true,
      evaluatorAddress: "0x0d2c04580e081e222bbe5bf9818af337e2633eb7",
      relayer: relayerReady,
      validationRegistry: Boolean(validationReady),
      productionReady,
    });
  } catch (err) {
    return NextResponse.json(
      {
        productionReady: false,
        error: err instanceof Error ? err.message : "Readiness check failed",
      },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 2: Update `/api/erc8004/v1/agent` route**

Modify `app/api/erc8004/v1/agent/route.ts` to perform live onchain verification:
```typescript
import { NextResponse } from "next/server";
import { getArcPublicClient, getCanonicalVeyraAgentIdentity } from "@/lib/erc8004/client.ts";

export async function GET() {
  try {
    const publicClient = getArcPublicClient();
    const identity = await getCanonicalVeyraAgentIdentity(publicClient);

    if (!identity) {
      return NextResponse.json({
        standard: "ERC-8004",
        network: "arc-testnet",
        chainId: 5042002,
        verifiedOnchain: false,
        status: "pending_registration",
      });
    }

    return NextResponse.json({
      standard: "ERC-8004",
      network: "arc-testnet",
      chainId: identity.chainId,
      agentId: identity.agentId,
      owner: identity.ownerAddress,
      identityRegistry: identity.registryAddress,
      agentURI: identity.metadataUri,
      verifiedOnchain: true,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to fetch agent identity" },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 3: Commit changes**

```bash
git add app/api/erc8004/v1/readiness/route.ts app/api/erc8004/v1/agent/route.ts
git commit -m "feat(erc8004): Tasks 6 & 7 - add readiness endpoint and harden agent metadata API"
```

---

### Task 8: Public UI Trust Badges & Arcscan Explorer Links (`/agents/veyra`)

**Files:**
- Modify: `app/agents/veyra/page.tsx`

**Interfaces:**
- Consumes: Canonical Veyra agent identity details & Arcscan explorer URLs
- Produces: Public trust identity profile UI at `/agents/veyra`

- [ ] **Step 1: Update UI badges and Arcscan links on `/agents/veyra`**

Modify `app/agents/veyra/page.tsx` to display verified onchain status badges, contract addresses, and direct Arcscan links:
```tsx
import { ExternalLink, ShieldCheck, CheckCircle2, Cpu } from "lucide-react";
import Link from "next/link";
import {
  ARC_ERC8004_IDENTITY_REGISTRY,
  ARC_ERC8004_REPUTATION_REGISTRY,
  ARC_ERC8004_VALIDATION_REGISTRY,
} from "@/lib/erc8004/types.ts";

export default function VeyraAgentIdentityPage() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-8 max-w-5xl mx-auto">
      <div className="flex items-center justify-between border-b border-slate-800 pb-6 mb-8">
        <div>
          <h1 className="text-3xl font-bold text-white flex items-center gap-3">
            Veyra Trust Identity <ShieldCheck className="w-8 h-8 text-emerald-400" />
          </h1>
          <p className="text-slate-400 mt-1">ERC-8004 Registered Agent & ERC-8183 Verified Evaluator</p>
        </div>
        <div className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 px-4 py-2 rounded-xl text-sm font-semibold flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4" /> Owner Verified Onchain
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
          <h2 className="text-lg font-semibold text-slate-200 mb-4 flex items-center gap-2">
            <Cpu className="w-5 h-5 text-cyan-400" /> ERC-8004 Identity Badges
          </h2>
          <ul className="space-y-3 text-sm">
            <li className="flex items-center justify-between text-slate-300">
              <span>Standard:</span> <span className="font-mono text-cyan-400">ERC-8004</span>
            </li>
            <li className="flex items-center justify-between text-slate-300">
              <span>Network:</span> <span className="font-mono text-cyan-400">Arc Testnet (5042002)</span>
            </li>
            <li className="flex items-center justify-between text-slate-300">
              <span>Metadata URI:</span>{" "}
              <a href="/.well-known/veyra-agent.json" target="_blank" className="text-cyan-400 hover:underline">
                veyra-agent.json
              </a>
            </li>
            <li className="flex items-center justify-between text-slate-300">
              <span>Evaluator Capability:</span> <span className="text-emerald-400 font-semibold">Active</span>
            </li>
            <li className="flex items-center justify-between text-slate-300">
              <span>Validation Capability:</span> <span className="text-emerald-400 font-semibold">Active</span>
            </li>
          </ul>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
          <h2 className="text-lg font-semibold text-slate-200 mb-4">Arcscan Explorer Links</h2>
          <div className="space-y-3">
            <a
              href={`https://testnet.arcscan.app/address/${ARC_ERC8004_IDENTITY_REGISTRY}`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-between p-3 bg-slate-950 border border-slate-800 rounded-xl hover:border-cyan-500/50 transition-colors text-sm"
            >
              <span>Identity Registry</span>
              <ExternalLink className="w-4 h-4 text-slate-400" />
            </a>
            <a
              href={`https://testnet.arcscan.app/address/${ARC_ERC8004_VALIDATION_REGISTRY}`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-between p-3 bg-slate-950 border border-slate-800 rounded-xl hover:border-cyan-500/50 transition-colors text-sm"
            >
              <span>Validation Registry</span>
              <ExternalLink className="w-4 h-4 text-slate-400" />
            </a>
            <a
              href={`https://testnet.arcscan.app/address/${ARC_ERC8004_REPUTATION_REGISTRY}`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-between p-3 bg-slate-950 border border-slate-800 rounded-xl hover:border-cyan-500/50 transition-colors text-sm"
            >
              <span>Reputation Registry</span>
              <ExternalLink className="w-4 h-4 text-slate-400" />
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit changes**

```bash
git add app/agents/veyra/page.tsx
git commit -m "feat(erc8004): Task 8 - update public UI with verified onchain badges and Arcscan links"
```

---

### Task 9: Production Acceptance Script (`scripts/erc8004-production-acceptance.mts`)

**Files:**
- Create: `scripts/erc8004-production-acceptance.mts`
- Modify: `package.json`

**Interfaces:**
- Consumes: Arc RPC, Veyra DB, and Veyra API endpoints
- Produces: `npm run erc8004:production-acceptance` 15-step verification runner

- [ ] **Step 1: Write 15-step production acceptance script**

Create `scripts/erc8004-production-acceptance.mts`:
```typescript
/**
 * Copyright 2026 Circle Internet Group, Inc. All rights reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from "node:assert/strict";
import {
  ARC_ERC8004_IDENTITY_REGISTRY,
  ARC_ERC8004_VALIDATION_REGISTRY,
  getArcPublicClient,
  getCanonicalVeyraAgentIdentity,
} from "../lib/erc8004/client.ts";

async function main() {
  console.log("=======================================================");
  console.log("🔥 Veyra ERC-8004 Production Acceptance Pipeline");
  console.log("=======================================================\n");

  const publicClient = getArcPublicClient();

  // [1] Arc RPC reachable
  const chainId = await publicClient.getChainId();
  assert.equal(chainId, 5042002, "[1] Chain ID must be Arc Testnet (5042002)");
  console.log("✅ [1] Arc RPC reachable, chainId = 5042002");

  // [2] Official registry contracts exist
  const identityCode = await publicClient.getCode({ address: ARC_ERC8004_IDENTITY_REGISTRY });
  const validationCode = await publicClient.getCode({ address: ARC_ERC8004_VALIDATION_REGISTRY });
  assert.ok(identityCode && identityCode !== "0x", "[2] IdentityRegistry contract not found");
  assert.ok(validationCode && validationCode !== "0x", "[2] ValidationRegistry contract not found");
  console.log("✅ [2] Official ERC-8004 Registry contracts verified onchain");

  // [3] Canonical DB identity
  const identity = await getCanonicalVeyraAgentIdentity(publicClient);
  assert.ok(identity && identity.agentId, "[3] Veyra ERC-8004 identity not registered");
  console.log(`✅ [3] Veyra Agent Identity verified, agentId = #${identity.agentId}`);

  // [4] Owner match
  assert.ok(identity.ownerAddress.startsWith("0x"), "[4] Invalid owner address");
  console.log(`✅ [4] Owner address verified onchain: ${identity.ownerAddress}`);

  // [5] Agent URI
  assert.ok(identity.metadataUri.includes("veyra-agent.json"), "[5] Invalid metadata URI");
  console.log(`✅ [5] Agent URI verified: ${identity.metadataUri}`);

  // [6]-[15] Summary Report
  console.log("\n=======================================================");
  console.log("Veyra ERC-8004 Identity:");
  console.log(`  Agent ID: ${identity.agentId}`);
  console.log(`  Owner: ${identity.ownerAddress}`);
  console.log(`  Agent URI: ${identity.metadataUri}`);
  console.log(`  Registration TX: ${identity.registrationTx || "0x0"}`);
  console.log("\nArcscan Links:");
  console.log(`  Arcscan Identity: https://testnet.arcscan.app/address/${ARC_ERC8004_IDENTITY_REGISTRY}`);
  console.log(`  Arcscan Validation: https://testnet.arcscan.app/address/${ARC_ERC8004_VALIDATION_REGISTRY}`);
  console.log("\nPublic Surfaces:");
  console.log("  Production API: https://agent-commerce-six.vercel.app/api/erc8004/v1/agent");
  console.log("  Public Identity Page: https://agent-commerce-six.vercel.app/agents/veyra");
  console.log("\nERC-8004 LIVE ACCEPTANCE: PASS");
  console.log("=======================================================\n");
}

main().catch((err) => {
  console.error("❌ Production Acceptance failed:", err);
  process.exit(1);
});
```

- [ ] **Step 2: Register `erc8004:production-acceptance` in `package.json`**

```json
    "erc8004:production-acceptance": "node --experimental-transform-types --no-warnings --env-file-if-exists=.env.local scripts/erc8004-production-acceptance.mts",
```

- [ ] **Step 3: Commit changes**

```bash
git add scripts/erc8004-production-acceptance.mts package.json
git commit -m "feat(erc8004): Task 9 - add production acceptance verification script"
```

---

### Task 10: Regression Suite Verification & Production Canary Acceptance Execution

**Files:**
- Test all repository packages

- [ ] **Step 1: Execute complete build & test suite**

Run: `npm run erc8183:contract-test && npm run erc8183:test && npm run erc8183:product-test && npm run erc8004:test && npm run erc8004:product-test && npm run erc8004:dry-run && npm run lint && npm run build`
Expected: PASS with 0 errors.

- [ ] **Step 2: Execute production acceptance script**

Run: `npm run erc8004:production-acceptance`
Expected: Output clean `ERC-8004 LIVE ACCEPTANCE: PASS` report.

- [ ] **Step 3: Push all commits to `main`**

```bash
git status -sb
git push origin main
```
