# P5.2 — Veyra ERC-8004 Identity, Reputation & Validation Bridge Design Spec

## Executive Summary

P5.2 integrates the Veyra ERC-8183 Evaluator with the official **ERC-8004** Registries on Arc Testnet (Chain ID `5042002`). This establishes Veyra as a portable, onchain-verifiable **Trust Identity** with an official ERC-8004 Agent ID, machine-readable metadata, reputation history reading, and an ERC-8004 Validation Bridge that translates ERC-8183 evaluation reports into ERC-8004 validation responses.

---

## Canonical Registries & Contracts (Arc Testnet)

| Contract | Address |
|---|---|
| **IdentityRegistry** | `0x8004A818BFB912233c491871b3d84c89A494BD9e` |
| **ReputationRegistry** | `0x8004B663056A597Dffe9eCcC1965A193B7388713` |
| **ValidationRegistry** | `0x8004Cb1BF31DAf7788923b405b754f57acEB4272` |
| **Veyra Evaluator Contract** | `0x0d2c04580e081e222bbe5bf9818af337e2633eb7` |
| **Agentic Commerce Contract** | `0x0747EEf0706327138c69792bF28Cd525089e4583` |

---

## Architectural Invariants & Security Rules

1. **Non-custodial & Fail-closed**: Validation responses strictly reflect deterministic ERC-8183 evaluation policy outcomes (`100` = passed, `0` = failed).
2. **No Self-Feedback**: Veyra NEVER calls `giveFeedback` on its own `agentId`. Self-reputation is prohibited.
3. **No Hardcoded Agent ID**: `agentId` is minted once via `IdentityRegistry.register(metadataURI)` and dynamically recovered from `Transfer` events and `erc8004_agent_identity` table.
4. **Validation Request-Response Bound**: Veyra responds ONLY to explicit `validationRequest` calls addressed to Veyra's validator address.
5. **No Secret Leaks**: RPC keys, relayer private keys, and session secrets are never exposed in public endpoints, logs, or UI.

---

## System Architecture Flow

```
+------------------+         1. register(metadataURI)          +----------------------+
| Veyra Owner      | ----------------------------------------> | IdentityRegistry     | -> ERC-721 Agent ID
+------------------+                                           +----------------------+

+------------------+         2. validationRequest(...)        +----------------------+
| Client / Agent   | ----------------------------------------> | ValidationRegistry   |
+------------------+                                           +----------------------+
         |                                                                ^
         | 3. Submit Deliverable for ERC-8183 Job                         |
         v                                                                | 5. validationResponse(...)
+------------------+         4. Deterministic Verification     +----------------------+
| Veyra Engine     | ----------------------------------------> | Veyra Validator      |
+------------------+                                           +----------------------+
```

---

## Machine-Readable Capability & Metadata

Metadata is published at: `GET /.well-known/veyra-agent.json`

```json
{
  "name": "Veyra Trust Evaluator",
  "description": "Independent trust and deliverable evaluator for agentic commerce on Arc Testnet.",
  "version": "1.0.0",
  "network": "arc-testnet",
  "chainId": 5042002,
  "identity": {
    "standard": "ERC-8004",
    "registry": "0x8004A818BFB912233c491871b3d84c89A494BD9e"
  },
  "evaluator": {
    "standard": "ERC-8183",
    "address": "0x0d2c04580e081e222bbe5bf9818af337e2633eb7",
    "commerce": "0x0747EEf0706327138c69792bF28Cd525089e4583"
  },
  "capabilities": [
    "erc8004_identity",
    "erc8183_evaluation",
    "erc8004_validation",
    "project_due_diligence",
    "trust_monitoring"
  ],
  "services": {
    "profile": "https://agent-commerce-six.vercel.app/agents/veyra",
    "evaluatorProfile": "https://agent-commerce-six.vercel.app/evaluators/erc8183",
    "metadataApi": "https://agent-commerce-six.vercel.app/api/erc8004/v1/agent"
  }
}
```

---

## Data Model & Tables

### 1. `erc8004_agent_identity`
- `id` (uuid, PK)
- `agent_id` (text, unique)
- `registry_address` (text)
- `chain_id` (int8)
- `owner_address` (text)
- `metadata_uri` (text)
- `registration_tx` (text)
- `created_at` (timestamptz)

### 2. `erc8004_validation_links`
- `id` (uuid, PK)
- `request_hash` (text, unique)
- `agent_id` (text)
- `evaluation_public_id` (text, FK/reference to `erc8183_evaluations.public_id`)
- `canonical_report_hash` (text)
- `response` (int2, 100 or 0)
- `response_hash` (text)
- `response_tx` (text)
- `status` (text, e.g. "pending", "submitted", "confirmed")
- `tag` (text)
- `created_at` (timestamptz)

---

## Public Endpoints & APIs

- `GET /.well-known/veyra-agent.json` (Canonical ERC-8004 Metadata)
- `GET /api/erc8004/v1/agent` (Public Agent Identity metadata)
- `GET /api/erc8004/v1/reputation` (External feedback summary)
- `GET /api/erc8004/v1/validations` (List validation responses)
- `GET /api/erc8004/v1/validations/[requestHash]` (Single validation response)
- `POST /api/erc8004/v1/validations/prepare` (Prepare validation response payload)
- `POST /api/erc8004/v1/validations/respond` (Authenticated submission)

---

## User Interfaces

1. `/agents/veyra` — Public Veyra Agent Identity Profile with Hero, ERC-8004 Agent ID badge, Registry links, Validations history, Reputation metrics, and Capabilities grid.
2. `/evaluations/[publicId]` — Enhanced evaluation receipt with ERC-8004 Validator Identity & Validation proof link.
3. `/console/erc8183` / Developer Tools — ERC-8004 Trust Identity management card.
