# P5.1 — Veyra ERC-8183 Evaluator Productization Design Specification

## Overview

The goal of P5.1 is to transform the working Veyra ERC-8183 Evaluator from a technical MVP / Canary into a fully productized public capability on Veyra. 

Third-party developers and AI agents visiting Veyra will be able to:
1. Understand Veyra's role as an independent ERC-8183 evaluator on Arc Testnet.
2. Inspect the live evaluator contract (`0x0d2c04580e081e222bbe5bf9818af337e2633eb7`) and agentic commerce proxy (`0x0747EEf0706327138c69792bF28Cd525089e4583`).
3. View real evaluations in the public Explorer (`/evaluations`).
4. Read the human-readable breakdown of the `structured-deliverable-v1` evaluation policy.
5. Access ready-to-use integration snippets (TypeScript, Solidity, Machine API).
6. Integrate Veyra as their job evaluator on Arc Testnet.
7. Verify evaluation results via canonical report hashes and Arcscan transactions on public receipts (`/evaluations/[publicId]`).

---

## Product & System Invariants

1. **Canonical Implementation**:
   - Arc Chain ID: `5042002` (Arc Testnet)
   - ERC-8183 Agentic Commerce: `0x0747EEf0706327138c69792bF28Cd525089e4583`
   - Veyra ERC-8183 Evaluator: `0x0d2c04580e081e222bbe5bf9818af337e2633eb7`
2. **Evaluation Core**:
   - Pipeline remains: ERC-8183 Job → Provider submit → deliverableHash → Veyra deterministic offchain evaluation → EIP-712 signed verdict → `VeyraERC8183Evaluator.executeVerdict()` → `complete()` / `reject()` on `AgenticCommerce`.
   - Replay protection, EIP-712 verification, evaluator isolation, attester/relayer separation, tenant isolation, and secret redaction remain strictly enforced.
3. **Security Invariants**:
   - Zero private keys, bearer tokens, or internal database IDs exposed on public APIs or UI.
   - Cross-tenant or non-existent evaluation lookups return standard `404 Not Found`.
   - Fail-closed behavior: invalid deliverable, expired job, mismatched policy, or signature failure immediately yields a `reject` verdict or transaction revert.
   - Raw private deliverable payloads are never leaked publicly.

---

## Detailed Components & User Experience

### 1. `/evaluators` (Public Evaluators Landing Page)
- **Hero Section**:
  - Title: **Veyra Evaluators**
  - Main Heading: *Independent evaluation for agentic commerce*
  - Subtitle: *Use Veyra as an ERC-8183 evaluator to independently verify agent deliverables before settlement.*
- **Featured Evaluator Card**:
  - Name: **Veyra ERC-8183 Evaluator**
  - Network: **Arc Testnet** (Chain ID `5042002`)
  - Standard: **ERC-8183**
  - Evaluator Contract: `0x0d2c04580e081e222bbe5bf9818af337e2633eb7`
  - Agentic Commerce Contract: `0x0747EEf0706327138c69792bF28Cd525089e4583`
  - Status: `Active`
  - Policy: `structured-deliverable-v1`
  - Evaluation Engine: Deterministic Policy Engine
  - Settlement Capability: Onchain EIP-712 Authorized Execution (`complete()` / `reject()`)
- **Actions & Navigation**:
  - "View on Arcscan" → Links to Arcscan address `0x0d2...`
  - "View Evaluations" → Navigates to `/evaluations`
  - "Use Veyra as Evaluator" → Navigates to `/evaluators/erc8183#integration`

---

### 2. `/evaluators/erc8183` (Public Evaluator Capability Profile)
- **Trust & Capability Page**:
  - **Overview**: Detailed explanation of how Veyra acts as a non-custodial, deterministic evaluator for AI agent jobs.
  - **Contract Parameters**: Evaluator Address, Network, Chain ID, Commerce Address, Deployment Tx, Active/Paused state.
  - **Human-Readable Policy Breakdown (`structured-deliverable-v1`)**:
    1. ERC-8183 job exists onchain.
    2. Veyra is configured as the official evaluator.
    3. Job status is eligible for evaluation (`Submitted`).
    4. Provider deliverable was submitted onchain.
    5. `deliverableHash` matches evaluated artifact keccak256 hash.
    6. HTTPS protocol required for deliverable content URL.
    7. Schema compliance validation against `veyra.structured-deliverable.v1`.
    8. Content payload size limits enforced.
    9. Expiration checks (job active until timestamp).
    10. Deterministic policy evaluation outcome.
  - **How Settlement Works**: Visual step-by-step diagram:
    `Client → ERC-8183 Job → Provider → Deliverable → Veyra Evaluation → Signed Verdict → complete() → USDC Settlement`
  - **Public Statistics**: Real aggregated metrics:
    - Total Evaluations
    - Completed Count
    - Rejected Count
    - Retryable / Failed Count
    - Completion Rate (%)
    - Median Evaluation Time
    - Verified Canary Badge (`Verified Canary`)
  - **Integration Code Block**: Multi-tab code samples (TypeScript, Solidity, Machine API / cURL) using exact Arc ERC-8183 ABI definitions.

---

### 3. `/evaluations` (Public Evaluations Explorer)
- Interactive table and grid with search input, decision filters (`All`, `Completed`, `Rejected`, `Retryable`), and pagination.
- Table Columns:
  - Evaluation Public ID (e.g. `vev_171197_canary`)
  - ERC-8183 Job ID
  - Decision (`Completed` / `Rejected`)
  - Policy (`structured-deliverable-v1`)
  - Timestamp
  - Canonical Hash
  - Arc Status (`Confirmed`)
- Clicking an evaluation opens the detailed verification receipt at `/evaluations/[publicId]`.

---

### 4. `/evaluations/[publicId]` (Enhanced Verification Receipt)
- **Receipt Cards**:
  - **Status Header**: Large decision badge (`Completed` or `Rejected`) with timestamp.
  - **ERC-8183 Job Details**: Job ID, Commerce Contract, Provider Address, Evaluator Contract.
  - **Deliverable Commitment**: `deliverableHash` (Raw private payload hidden).
  - **Policy Verification Checklist**: Itemized list of policy rules evaluated with pass/fail status indicators.
  - **Canonical Cryptographic Proof**: Veyra report hash, EIP-712 verdict digest, Attester public address, Relayer public address, Settlement Transaction Hash, direct Arcscan transaction link.

---

### 5. `GET /api/erc8183/v1/evaluator` & API Improvements
- New public endpoint returning safe evaluator metadata:
  ```json
  {
    "standard": "ERC-8183",
    "network": "arc-testnet",
    "chainId": 5042002,
    "status": "active",
    "evaluatorAddress": "0x0d2c04580e081e222bbe5bf9818af337e2633eb7",
    "commerceAddress": "0x0747EEf0706327138c69792bF28Cd525089e4583",
    "policy": "structured-deliverable-v1"
  }
  ```
- Expose `erc8183_evaluation` in `GET /api/byoa/manifest`.
- Update OpenAPI schema in `public/openapi.json`.

---

### 6. TypeScript SDK Enhancements
- Update `lib/sdk/erc8183.ts` / `lib/erc8183/sdk.ts`:
  - `veyra.erc8183.getEvaluator()`
  - `veyra.erc8183.prepareDeliverable()`
  - `veyra.erc8183.evaluate()`
  - `veyra.erc8183.getEvaluation()`

---

### 7. Veyra Homepage (`/`) & Developer Console (`/console/erc8183`)
- **Homepage (`/`)**: Added dedicated "Trust Infrastructure for Agentic Commerce — Independent ERC-8183 Evaluator" section with CTA button "Explore Evaluator".
- **Developer Console (`/console/erc8183`)**: Developer hub displaying live contract parameters, metrics, integration guide, API endpoints, and Canary execution controls.

---

## Test Suite & Verification

1. **New Verification Script**: `scripts/erc8183-product-test.mts`
   - Added `package.json` command: `npm run erc8183:product-test`
   - Validates `/api/erc8183/v1/evaluator`, evaluator profile data, explorer filtering, SDK methods, manifest capabilities, OpenAPI schemas, and safe field serialization.
2. **Complete Quality Gates**:
   - `npm run lint`
   - `npm run build`
   - `npm run erc8183:contract-test`
   - `npm run erc8183:test`
   - `npm run erc8183:product-test`
3. **Production Canary Verification**:
   - Execute production Canary execution on Arc Testnet and output the structured JSON result block.
