# Veyra Agent API v1

Veyra Agent API v1 is the agent-native path for running the same curated,
verifiable paid workflows available in the Public App.

An external agent can:

1. discover curated workflows and input schemas;
2. create an immutable quote;
3. launch exactly one sponsored or paid run;
4. poll until the run reaches a terminal state;
5. retrieve structured JSON or Markdown with Arc Testnet proof metadata.
6. save trust watchlists and trigger repeat checks with deterministic deltas.

Production base URL:

```text
https://agent-commerce-six.vercel.app
```

OpenAPI:

```text
https://agent-commerce-six.vercel.app/openapi/agent-commerce-v1.json
```

## Credential onboarding

Credentials are created in the Veyra Developer Console and shown once.

1. Open `/console/agents`, connect the owner wallet, and complete owner
   verification.
2. Register and activate an agent namespace. Enable only the curated workflows
   that the agent is allowed to run.
3. Open `/console/agent-api#credentials`.
4. Select the active agent and choose **Create Veyra Agent API Credential**.
5. Copy the `aac_...` secret immediately and store it in a secret manager.

The credential is bound to one agent namespace and one closed scope set:

| Scope | Purpose |
| --- | --- |
| `workflows:read` | Discover workflow schemas and prices |
| `quotes:create` | Create immutable, idempotent quotes |
| `runs:create` | Launch a quoted run |
| `results:read` | Poll runs and retrieve reports |

Veyra Agent API credentials are separate from legacy BYOA workflow credentials. Never
send a credential in a query string or commit it to the repository.

## TypeScript SDK

The dependency-free SDK lives in `sdk/typescript`. Build it with:

```bash
npm run machine:sdk-build
```

Minimal usage:

```ts
import { AgentCommerceClient } from "@arc-agent-commerce/sdk";

const client = new AgentCommerceClient({
  baseUrl: "https://agent-commerce-six.vercel.app",
  credential: process.env.ARC_AGENT_COMMERCE_API_KEY!,
});

const { report } = await client.executeWorkflow({
  workflow: "github_due_diligence",
  repository: "circlefin/developer-controlled-wallets-web-sdk",
});

console.log(report.verdict);
console.log(report.verification);
```

The complete production-ready agent example is
`examples/machine-agent/github-due-diligence-agent.ts`:

```bash
ARC_AGENT_COMMERCE_API_KEY='aac_...' \
  npm run machine:agent-example -- circlefin/developer-controlled-wallets-web-sdk
```

The example never prints the credential. Persist explicit quote and run
idempotency keys when an agent process must survive restarts.

### Agent Trust Report

`agent_trust_report` accepts at least one of `agentId`, `agentWallet`, or
`repositoryUrl`. `contractAddress` and `serviceEndpoint` add optional public
evidence. The endpoint must be public HTTPS; localhost, private networks,
redirects, credentials, and DNS-rebinding targets are blocked.

```ts
const { report } = await client.executeWorkflow({
  workflow: "agent_trust_report",
  input: {
    agentWallet: "0x0000000000000000000000000000000000000001",
    repositoryUrl: "circlefin/developer-controlled-wallets-web-sdk",
    serviceEndpoint: "https://api.example.com/health",
  },
}, {
  quoteIdempotencyKey: "trust-quote-001",
  runIdempotencyKey: "trust-run-001",
});

console.log(report.trustScore, report.verification);
```

Full TypeScript and Python examples are in
`examples/agent-api/agent-trust-report.ts` and
`examples/agent-api/agent_trust_report.py`. The JSON and Markdown report
represent the same canonical result. Numeric scores are deterministic; optional
LLM synthesis cannot change them. Missing evidence is excluded rather than
treated as a negative signal, and fewer than two scorable categories produces
`overall: null` with `limited_data`.

The final internal x402 step costs `0.0001 USDC` and binds the deterministic
`reportHash` to the proof registry response hash. `verifiedOnArc` becomes true
only when that exact report-hash proof is verified; unrelated service receipt
proofs cannot upgrade the report badge.

### Continuous Trust Monitoring

Machine credentials can create tenant-isolated watchlists and recheck them
through the same immutable quote/run flow:

```ts
const watch = await client.createWatchlist({
  label: "Payments Agent",
  input: {
    agentId: "agt_...",
    repositoryUrl: "owner/repository",
  },
  cadence: "weekly",
  visibility: "public",
});

const { report, history } = await client.recheckWatchlist(watch.id, {
  recheckIdempotencyKey: "payments-agent-recheck-001",
  runIdempotencyKey: "payments-agent-run-001",
});

console.log(history.currentDelta?.changes);
console.log(history.history[0]?.proofUrl);
console.log(watch.profileId);
const publicProfile = await client.getPublicTrustProfile(watch.profileId);
```

`manual`, `daily`, and `weekly` are valid cadences. A Machine API recheck first
creates an immutable quote at
`POST /api/agent/v1/watchlists/{watchlistId}/rechecks`, then launches that quote
through the existing run endpoint. Sponsored and paid checkout remain separate;
Machine API never receives an implicit payment authorization.

Machine-created watchlists are private unless `visibility: "public"` is
explicitly supplied. Published subjects resolve through the unauthenticated
`GET /api/monitoring/public/{profileId}` endpoint and the shareable
`/trust/{profileId}` page. Private and unknown profiles intentionally return
the same `404 Trust profile not found` response. Public payloads contain safe
trust signals and Arc proofs, never the owner wallet, machine credential,
schedule, cron, quote, or internal payment records.

Each snapshot stores the canonical Agent Trust Report hash and the exact Arc
proof transaction. Deltas are deterministic comparisons between two snapshots:
Trust Score movement, new/resolved risks, repository activity, agent status,
service health, endpoint availability, contract signals, and Arc verification
coverage.

## HTTP quickstart

Every request uses:

```http
Authorization: Bearer aac_your_secret
```

Mutating requests also require:

```http
Idempotency-Key: a-stable-key-for-this-exact-operation
```

### 1. Discover

```bash
curl 'https://agent-commerce-six.vercel.app/api/agent/v1/workflows' \
  -H "Authorization: Bearer $ARC_AGENT_COMMERCE_API_KEY"
```

### 2. Quote

```bash
curl -X POST \
  'https://agent-commerce-six.vercel.app/api/agent/v1/quotes' \
  -H "Authorization: Bearer $ARC_AGENT_COMMERCE_API_KEY" \
  -H 'Content-Type: application/json' \
  -H 'Idempotency-Key: github-quote-2026-07-28-001' \
  -d '{
    "workflow": "github_due_diligence",
    "repository": "circlefin/developer-controlled-wallets-web-sdk"
  }'
```

The response freezes workflow, normalized input, selected services, total USDC
price, checkout mode, and expiry.

### 3. Run

Sponsored:

```bash
curl -X POST \
  'https://agent-commerce-six.vercel.app/api/agent/v1/runs' \
  -H "Authorization: Bearer $ARC_AGENT_COMMERCE_API_KEY" \
  -H 'Content-Type: application/json' \
  -H 'Idempotency-Key: github-run-2026-07-28-001' \
  -d '{"quoteId":"QUOTE_ID"}'
```

Paid:

```json
{
  "quoteId": "QUOTE_ID",
  "paymentAuthorization": {
    "type": "arc_transaction",
    "payload": "0x..."
  }
}
```

The transaction must be the exact Arc Testnet checkout described by the quote.
The project-owned hosted payer performs downstream x402 purchases separately.

### 4. Poll

```bash
curl \
  'https://agent-commerce-six.vercel.app/api/agent/v1/runs/RUN_ID' \
  -H "Authorization: Bearer $ARC_AGENT_COMMERCE_API_KEY"
```

Terminal statuses are `completed`, `completed_with_warnings`, `failed`, and
`expired`.

### 5. Report

JSON:

```bash
curl \
  'https://agent-commerce-six.vercel.app/api/agent/v1/reports/REPORT_ID' \
  -H "Authorization: Bearer $ARC_AGENT_COMMERCE_API_KEY" \
  -H 'Accept: application/json'
```

Markdown:

```bash
curl \
  'https://agent-commerce-six.vercel.app/api/agent/v1/reports/REPORT_ID' \
  -H "Authorization: Bearer $ARC_AGENT_COMMERCE_API_KEY" \
  -H 'Accept: text/markdown'
```

GitHub reports include a deterministic verdict, evidence coverage, strengths,
risks, adoption questions, receipts, and Arc proof links.

## Idempotency contract

- Reusing a key with the same request returns the same resource and response.
- Reusing a key with different input returns `idempotency_conflict`.
- An in-flight duplicate returns `idempotency_in_progress` and is retryable.
- If durable idempotency storage is unavailable, the API returns
  `idempotency_store_unavailable` before creating a quote, job, or payment.
- Do not generate a new run key merely because a client timed out. Retry the
  same request with the same key first.

## Error model

All errors use:

```json
{
  "error": {
    "code": "provider_unavailable",
    "message": "Required workflow services are temporarily unavailable.",
    "retryable": true,
    "requestId": "req_8f12a45b7e90"
  }
}
```

The SDK exposes these fields through `AgentCommerceApiError`.

| Code | Typical status | Retry guidance |
| --- | ---: | --- |
| `credential_missing` | 401 | Fix or replace the credential |
| `credential_revoked` | 401 | Rotate the credential |
| `scope_denied` | 403 | Use the correct Machine credential |
| `workflow_disabled` | 403 | Update the agent workflow policy |
| `invalid_request` | 400 | Correct structured workflow input |
| `invalid_repository` | 400 | Correct the public GitHub reference |
| `agent_trust_input_required` | 400 | Add Agent ID, agent wallet, or repository |
| `agent_not_found` | 400 | Correct the public Veyra Agent ID |
| `agent_access_denied` | 403 | Use the credential that owns the private agent |
| `agent_registry_unavailable` | 503 | Retry without changing the identifier |
| `agent_trust_service_unavailable` | 503 | Retry after canonical report verification recovers |
| `invalid_wallet` | 400 | Correct the public EVM address |
| `contract_not_found` | 400 | Correct or remove the Arc Testnet contract |
| `contract_provider_unavailable` | 503 | Retry or remove the optional contract |
| `endpoint_invalid` | 400 | Use a public HTTPS URL |
| `endpoint_private_network_blocked` | 400 | Remove localhost/private/internal endpoint |
| `endpoint_unreachable` | 422 | Retry or remove the optional endpoint |
| `endpoint_response_too_large` | 422 | Use a bounded health endpoint |
| `insufficient_trust_evidence` | 422 | Add another public evidence source |
| `idempotency_key_missing` | 400 | Add and persist a key |
| `idempotency_conflict` | 409 | Use the original body or a new operation key |
| `idempotency_in_progress` | 409 | Retry the same body and key |
| `idempotency_store_unavailable` | 503 | Retry the same body and key later |
| `payment_required` | 402 | Submit the exact quoted Arc transaction |
| `payment_invalid` | 400 | Do not retry until transaction details are fixed |
| `spending_limit_exceeded` | 429 | Wait for policy window or adjust policy |
| `watchlist_not_found` | 404 | Use the credential that created the watchlist |
| `watchlist_limit_exceeded` | 429 | Reuse one of the owner wallet's watchlists |
| `recheck_in_progress` | 409 | Poll the existing recheck instead of creating another |
| `monitoring_unavailable` | 503 | Retry the same idempotent request later |
| `report_not_ready` | 400 | Poll the run before retrieving the report |
| `report_generation_failed` | 422 | Review the run failure before retrying |
| `provider_unavailable` | 503 | Retry according to `retryable` |
| `internal_error` | 500 | Log `requestId`; retry only if marked retryable |

## Tenant isolation

Quotes, runs, reports, watchlists, rechecks, and monitoring history are bound to
the exact Machine credential that created them. Another credential receives
`404`, even if it belongs to the same owner. Owner-wallet Public App sessions
can still manage their browser-created watchlists. Secrets, raw authorization
headers, full prompts, and raw provider payloads are not returned by public or
Veyra Agent API report surfaces.
