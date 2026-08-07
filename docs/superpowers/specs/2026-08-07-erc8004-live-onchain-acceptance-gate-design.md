# P5.2.1 — ERC-8004 Live Onchain Acceptance & Fail-Closed Production Gate Design Specification

## Overview
This specification details the architecture, data model, verification engine, and fail-closed security gates for proving live production integration of Veyra with official ERC-8004 Registries on Arc Testnet (`chainId = 5042002`).

Official Arc Testnet ERC-8004 Registries:
- **IdentityRegistry**: `0x8004A818BFB912233c491871b3d84c89A494BD9e`
- **ReputationRegistry**: `0x8004B663056A597Dffe9eCcC1965A193B7388713`
- **ValidationRegistry**: `0x8004Cb1BF31DAf7788923b405b754f57acEB4272`
- **Veyra Evaluator Contract**: `0x0d2c04580e081e222bbe5bf9818af337e2633eb7`

---

## Key Principles & Design Decisions

### 1. Fail-Closed Production Gate vs Dry-Run
- `npm run erc8004:dry-run`: Read-only, offline-capable verification script for local test environments without requiring private keys.
- `npm run erc8004:production-smoke`: Strict production gate requiring valid `VEYRA_EVALUATOR_RELAYER_PRIVATE_KEY`. Exits with `code 1` immediately if missing. Zero fallback dummy keys (`0x00...0001`) allowed in production mode.

### 2. Permanent Canonical Storage & DB-First Lookup
- Avoid historical log scanning (over 9,900 blocks) for normal production operations.
- `erc8004_agent_identity` table stores:
  - `agent_id`
  - `owner_address`
  - `identity_registry`
  - `registration_tx`
  - `registration_block`
  - `agent_uri`
- Lookup hierarchy:
  `DB record` → `IdentityRegistry.ownerOf(agentId)` & `tokenURI(agentId)` onchain validation → (Log scanning restricted to explicit repair/recovery mode).

### 3. Dedicated Canary Agent Identity
- Veyra cannot act as both agent owner and validator for self-validation canary runs.
- A dedicated test identity (`Veyra ERC-8004 Canary Agent`) owned by a distinct key (`VEYRA_EVALUATOR_ATTESTER_PRIVATE_KEY` / `VEYRA_CANARY_AGENT_PRIVATE_KEY`) triggers `validationRequest(...)`.
- Veyra's dedicated relayer key processes the evaluation and submits `validationResponse(...)`.

### 4. Full ERC-8183 ↔ ERC-8004 Lifecycle Integration
```
ERC-8183 Job Escrowed
         ↓
Deliverable Submitted
         ↓
Veyra Evaluator Verdict & Signed Report
         ↓
ERC-8183 complete() Settlement
         ↓
ERC-8004 validationResponse(requestHash, response=100, responseURI, responseHash, tag)
         ↓
Onchain Verification via getValidationStatus(requestHash)
```

### 5. System Readiness & Public Verification APIs
- `GET /api/erc8004/v1/agent`: Returns actual registered Veyra `agentId`, onchain owner, and metadata status, setting `verifiedOnchain: true` only after live RPC call.
- `GET /api/erc8004/v1/readiness`: Returns readiness status: `{ identity, metadata, evaluator, relayer, validationRegistry, productionReady }`.
- Public UI (`/agents/veyra`): Live badges, contract addresses, and direct Arcscan explorer links for Identity, Evaluator, and Latest Validation transactions.

---

## 15-Step Production Acceptance Pipeline (`npm run erc8004:production-acceptance`)
1. **[1] Arc RPC Reachable**: Verify Arc Testnet (`chainId = 5042002`) connectivity.
2. **[2] Official Registries Verified**: Check code existence at registry contract addresses.
3. **[3] Veyra Agent Identity Exists**: Fetch active Veyra `agentId` from canonical DB storage.
4. **[4] Owner Verified**: Onchain `ownerOf(agentId)` matches Veyra owner account.
5. **[5] Agent URI Reachable**: Fetch `tokenURI(agentId)` (`/.well-known/veyra-agent.json`).
6. **[6] Metadata Valid**: Validate JSON schema and service endpoint declarations.
7. **[7] Evaluator Contract Deployed**: Verify Veyra Evaluator contract bytecode at `0x0d2c...`.
8. **[8] Canary Agent Exists**: Verify Canary Agent ID registered on Arc Testnet.
9. **[9] Validation Request Submitted**: Execute `validationRequest(...)` onchain; capture `requestHash` & `txHash`.
10. **[10] Veyra Evaluation Completed**: Run automated evaluation and produce `canonicalReportHash`.
11. **[11] Validation Response Submitted**: Veyra validator calls `validationResponse(...)` onchain (`response = 100`).
12. **[12] Onchain Status Verified**: Call `getValidationStatus(requestHash)` matching validator address, agentId, and tag.
13. **[13] Hash Match Verified**: Ensure `responseHash == canonicalReportHash`.
14. **[14] Public API Response Verified**: `GET /api/erc8004/v1/agent` returns `verifiedOnchain: true`.
15. **[15] Public Identity UI Reachable**: Verify HTTP 200 on `/agents/veyra`.

---

## Final Acceptance Report Structure
Upon completion, the acceptance script outputs:
```
=======================================================
Veyra ERC-8004 Identity:
  Agent ID: <agentId>
  Owner: <ownerAddress>
  Agent URI: <metadataUri>
  Registration TX: <txHash>

ERC-8183 Evaluator & Lifecycle:
  Evaluator Address: 0x0d2c04580e081e222bbe5bf9818af337e2633eb7
  ERC-8183 Job ID: <jobId>
  Evaluation ID: <publicId>
  Canonical Report Hash: <reportHash>
  Complete TX: <completeTxHash>

Canary Agent & ERC-8004 Validation:
  Canary Agent ID: <canaryAgentId>
  Validation Request Hash: <requestHash>
  Validation Request TX: <requestTxHash>
  Validation Response: 100 (veyra_erc8183_deliverable_passed)
  Validation Response Hash: <responseHash>
  Validation Response TX: <responseTxHash>

Arcscan Links:
  Arcscan Identity: https://testnet.arcscan.app/token/0x8004A818BFB912233c491871b3d84c89A494BD9e/instance/<agentId>
  Arcscan Evaluator: https://testnet.arcscan.app/address/0x0d2c04580e081e222bbe5bf9818af337e2633eb7
  Arcscan Validation TX: https://testnet.arcscan.app/tx/<responseTxHash>

Public Surfaces:
  Production API: https://agent-commerce-six.vercel.app/api/erc8004/v1/agent
  Public Identity Page: https://agent-commerce-six.vercel.app/agents/veyra

ERC-8004 LIVE ACCEPTANCE: PASS
=======================================================
```
