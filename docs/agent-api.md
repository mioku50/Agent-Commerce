# Arc Agent Commerce — Machine API v1 Developer Guide

The **Machine API v1** allows autonomous AI agents and automated external systems to interact directly with Arc Agent Commerce on Arc Testnet. 

Without needing browser user interfaces, external agents can discover available workflow templates, generate binding quotes, launch sponsored or paid workflow runs via x402, poll execution progress, and retrieve structured JSON reports with verifiable Arc testnet proof trails.

---

## Key Features

- **Standardized Machine Auth:** Bearer credential tokens (`aac_...`) bound specifically to Machine API operations.
- **Idempotency Safeguards:** Mandatory `Idempotency-Key` headers on mutating requests (`POST /quotes`, `POST /runs`) preventing duplicate charges or accidental re-executions.
- **Dual Checkout Modes:** Native support for both sponsored daily quota and explicit paid x402 USDC transactions.
- **Format Negotiation:** Retrieve reports in high-fidelity structured JSON (`application/json`) or clean human-readable Markdown (`text/markdown`).
- **Verifiable Proof Trails:** Every report is backed by Arc Testnet transaction proofs linked to allowlisted x402 service purchases.

---

## Authentication & Credential Scopes

Include your API credential token in the `Authorization` header of all HTTP requests:

```http
Authorization: Bearer aac_your_credential_secret_here
```

Machine API credentials are distinct from BYOA Workflow credentials and cannot be used under `/api/byoa/*`. Their permission set is fixed:

### Machine Credential Scopes

| Scope | Description | Allowed Endpoints |
| :--- | :--- | :--- |
| `workflows:read` | Inspect available workflows, list prices, and schemas | `GET /api/agent/v1/workflows` |
| `quotes:create` | Generate binding execution quotes | `POST /api/agent/v1/quotes` |
| `runs:create` | Launch sponsored or paid workflow executions | `POST /api/agent/v1/runs` |
| `results:read` | Poll runs and download reports with Arc proofs | `GET /api/agent/v1/runs/[runId]`, `GET /api/agent/v1/reports/[reportId]` |

> **Note:** Machine API credentials can be generated and managed in **Agent Developer Console -> Agent API**. The full secret is shown once.

---

## API Endpoints Reference

### 1. List Available Workflows
**`GET /api/agent/v1/workflows`**

Returns active workflow templates, input schemas, estimated prices in USDC, and Arc Testnet chain metadata.

**Headers:**
- `Authorization: Bearer <token>`

**Response (`200 OK`):**
```json
{
  "version": "1",
  "workflows": [
    {
      "id": "github_due_diligence",
      "name": "GitHub Due Diligence",
      "shortName": "GitHub Diligence",
      "description": "Comprehensive technical due diligence for open-source GitHub repositories.",
      "task": "Evaluate repository health, architecture, security, activity, and risks",
      "estimatedUsdc": 0.05,
      "inputSchema": {
        "type": "object",
        "properties": {
          "repository": {
            "type": "string",
            "description": "GitHub repository in owner/repo format or full URL"
          }
        },
        "required": ["repository"]
      },
      "arc": {
        "chainId": 5042002,
        "network": "arc-testnet",
        "asset": "USDC",
        "tokenAddress": "0x36F174a7A8dCA44E72dF88fE8C349C3eDFAe61A7"
      }
    }
  ]
}
```

---

### 2. Create Workflow Quote
**`POST /api/agent/v1/quotes`**

Generates an immutable quote containing list pricing and payment requirements.

**Headers:**
- `Authorization: Bearer <token>`
- `Idempotency-Key: <unique-uuid-or-hash>` *(Required)*

**Request Body:**
```json
{
  "workflow": "github_due_diligence",
  "repository": "circlefin/agent-commerce"
}
```

**Response (`201 Created` / `200 OK`):**
```json
{
  "quoteId": "qte_9f81a2b3c4d5",
  "workflow": "github_due_diligence",
  "repository": {
    "fullName": "circlefin/agent-commerce",
    "canonicalUrl": "https://github.com/circlefin/agent-commerce"
  },
  "totalUsdc": 0.05,
  "sponsored": true,
  "expiresAt": "2026-07-24T22:15:00.000Z",
  "requiredPayment": {
    "network": "arc-testnet",
    "asset": "USDC",
    "amount": 0.0,
    "treasuryAddress": "0x742d35Cc6634C0532925a3b844Bc454e4438f44e",
    "chainId": 5042002
  }
}
```

---

### 3. Launch Workflow Run
**`POST /api/agent/v1/runs`**

Launches workflow execution for a valid quote.

**Headers:**
- `Authorization: Bearer <token>`
- `Idempotency-Key: <unique-uuid-or-hash>` *(Required)*

**Request Body (Sponsored Mode):**
```json
{
  "quoteId": "qte_9f81a2b3c4d5"
}
```

**Request Body (Paid Mode):**
```json
{
  "quoteId": "qte_9f81a2b3c4d5",
  "paymentAuthorization": {
    "type": "arc_transaction",
    "payload": "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef"
  }
}
```

**Response (`201 Created`):**
```json
{
  "runId": "job_01h9a8b7c6d5",
  "status": "queued",
  "pollAfterMs": 2000
}
```

---

### 4. Poll Run Status
**`GET /api/agent/v1/runs/[runId]`**

Checks the progress of a running workflow job.

**Headers:**
- `Authorization: Bearer <token>`

**Response (`200 OK` - In Progress):**
```json
{
  "runId": "job_01h9a8b7c6d5",
  "status": "running",
  "progress": 0.6,
  "stage": "purchasing",
  "pollAfterMs": 2000
}
```

**Response (`200 OK` - Completed):**
```json
{
  "runId": "job_01h9a8b7c6d5",
  "status": "completed",
  "progress": 1.0,
  "stage": "completed",
  "pollAfterMs": 0,
  "reportId": "job_01h9a8b7c6d5",
  "verification": {
    "status": "verified",
    "verifiedSteps": 2,
    "requiredSteps": 2
  }
}
```

Possible status values: `queued`, `running`, `completed`, `completed_with_warnings`, `failed`, `expired`.

---

### 5. Retrieve Final Report
**`GET /api/agent/v1/reports/[reportId]`**

Downloads the final structured evaluation report and Arc verification proof metadata.

**Headers:**
- `Authorization: Bearer <token>`
- `Accept: application/json` *(default)* or `Accept: text/markdown`

**Response (`200 OK` - `application/json`):**
```json
{
  "reportId": "job_01h9a8b7c6d5",
  "workflow": "github_due_diligence",
  "repository": {
    "fullName": "circlefin/agent-commerce",
    "canonicalUrl": "https://github.com/circlefin/agent-commerce"
  },
  "status": "completed",
  "executiveSummary": "Repository due diligence completed with strong governance and regular commit activity.",
  "projectPurpose": "Hosted AI Agent Commerce layer on Arc Testnet.",
  "technology": {
    "primaryLanguage": "TypeScript",
    "frameworks": ["Next.js", "React"],
    "hasWorkflows": true,
    "workflowCount": 3
  },
  "activity": {
    "commitCount30d": 42,
    "commitCount90d": 120,
    "commitCount180d": 250,
    "lastCommitAt": "2026-07-24T18:00:00Z"
  },
  "strengths": [
    "Comprehensive automated test suite",
    "Active maintainer community"
  ],
  "risks": [
    {
      "code": "low_test_coverage",
      "title": "Moderate Test Coverage",
      "severity": "low",
      "description": "Some internal helper functions lack isolated unit tests.",
      "impact": "Potential edge case bugs in rare error handlers."
    }
  ],
  "questionsBeforeAdoption": [
    "What is the long-term maintenance roadmap?"
  ],
  "confidence": "high",
  "verification": {
    "status": "verified",
    "network": "arc-testnet",
    "proofs": [
      {
        "receiptId": "rcpt_01h9a8b7",
        "txHash": "0xabcd1234ef567890...",
        "status": "verified",
        "explorerUrl": "https://testnet.arcscan.app/tx/0xabcd1234ef567890..."
      }
    ]
  },
  "generatedAt": "2026-07-24T21:05:00.000Z"
}
```

---

## Error Handling Schema

All error responses from Machine API v1 follow a standard structure:

```json
{
  "error": {
    "code": "quote_expired",
    "message": "The quote has expired. Please request a new quote.",
    "retryable": false,
    "requestId": "req_8f12a45b7e90"
  }
}
```

### Common Error Codes

| Code | HTTP Status | Description |
| :--- | :--- | :--- |
| `credential_missing` | 401 | Bearer credential is missing or invalid |
| `idempotency_key_missing` | 400 | Required `Idempotency-Key` header is missing |
| `idempotency_conflict` | 409 | The key is already bound to a different request |
| `idempotency_in_progress` | 409 | An identical mutation with this key is still running; retry later |
| `idempotency_store_unavailable` | 503 | Durable idempotency storage is unavailable; no mutation was started |
| `invalid_repository` | 400 | Malformed repository or JSON input |
| `credential_revoked` | 401 | The API key has been revoked |
| `payment_required` | 402 | Payment transaction hash missing for paid quote |
| `payment_invalid` | 400 | Invalid transaction hash or unconfirmed payment |
| `scope_denied` | 403 | Credential lacks the required scope for this endpoint |
| `workflow_disabled` | 403 | Workflow is not enabled under credential policy |
| `quote_expired` | 404 | Quote is expired or invalid |
| `quote_already_used` | 409 | Quote has already been executed |
| `spending_limit_exceeded`| 429 | Daily call limit or wallet spending limit exceeded |
| `report_not_ready` | 400 | Requested report execution is still running |
| `provider_unavailable` | 503 | Downstream x402 service is temporarily offline |

---

## SDK Code Examples & OpenAPI Spec

- **OpenAPI 3.0.3 Spec:** [public/openapi/agent-commerce-v1.json](file:///home/mioku/Agent-Commerce/public/openapi/agent-commerce-v1.json)
- **TypeScript Example Script:** [examples/agent-api/typescript.ts](file:///home/mioku/Agent-Commerce/examples/agent-api/typescript.ts)
- **Python Example Script:** [examples/agent-api/python.py](file:///home/mioku/Agent-Commerce/examples/agent-api/python.py)
