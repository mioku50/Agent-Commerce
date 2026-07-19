# Arc Agent Commerce

> Submit real input → a hosted agent selects and purchases paid APIs through x402 → optionally synthesizes an AI-assisted Final Report → creates receipts → registers verified proofs on Arc.

**Arc Agent Commerce is no longer positioned primarily as an API marketplace demo.**
The workflow-first product direction is a hosted agent execution and verification layer:

1. a user chooses a workflow and submits real non-sensitive input in the browser;
2. the hosted agent previews and selects up to three allowlisted paid APIs;
3. a project-owned server wallet pays through x402 and Circle Gateway;
4. actual service responses become a shareable Final Report;
5. paid calls become public activity, receipts, Passport and seller analytics updates;
6. compact proofs are registered in the app-owned contract on Arc Testnet.

The API Store, Agent Launch, Agent Setup, and local CLI remain available under **Developer Tools**. They are secondary advanced/operator surfaces, while browser-hosted workflow execution is the primary product.

## Live Product

| Surface | Link |
| --- | --- |
| Production app | https://agent-commerce-six.vercel.app |
| Run Workflow | https://agent-commerce-six.vercel.app/agent-runner |
| Workflow Templates | https://agent-commerce-six.vercel.app/workflows |
| Hosted Final Reports | https://agent-commerce-six.vercel.app/results |
| Arc Proofs | https://agent-commerce-six.vercel.app/proofs |
| Developer Tools | https://agent-commerce-six.vercel.app/developer-tools |
| Reviewer status | https://agent-commerce-six.vercel.app/review |
| Activity | https://agent-commerce-six.vercel.app/runs |
| Commerce receipts | https://agent-commerce-six.vercel.app/receipts |
| Agent Passports | https://agent-commerce-six.vercel.app/agents |
| Public status API | https://agent-commerce-six.vercel.app/api/review/status |

**Network:** Arc Testnet  
**Chain ID:** `5042002`  
**Status:** experimental testnet prototype; contracts are not audited.

## Why This Product Exists

Autonomous agents should not need a human to create an account, enter card details, purchase a subscription, and manually provision an API key before every service can be used.

Arc Agent Commerce explores a different model:

- services publish a price per request;
- the agent sees the cost before purchasing;
- payment is made in USDC through the x402 HTTP flow;
- the protected response is returned immediately;
- the purchase leaves a shareable receipt and a verifiable Arc proof;
- spending limits and service allowlists are enforced by the operator.

For the end user, the hosted flow requires no repository clone, no private key, and no local CLI setup.

## One-Click Hosted Flow

Open [`/agent-runner`](https://agent-commerce-six.vercel.app/agent-runner), choose a workflow, paste real non-sensitive source text, inspect the server-generated plan and estimated price, then launch it.

Available hosted workflows:

- **Sentiment & Tone Report** — paid text analysis and traceable deterministic heuristics, optionally synthesized by FreeModel;
- **Builder Update Summary** — deterministic delivery/risk signals and paid API evidence, optionally synthesized by FreeModel;
- **Market Context Brief** — explicitly selects BTC/USD, ETH/USD, or SOL/USD and combines user context with a normalized live price sourced from Pyth Network;
- **Custom Task** — the shared planner selects relevant services from the fixed server allowlist.

When the server-only `LLM_*` configuration is available, FreeModel generates only the report summary and findings after successful paid API calls. The Final Report is explicitly labeled **AI-generated synthesis**, names `FreeModel` and the configured model, and lists the paid API responses used. Planning, service allowlisting, budgets, idempotency, x402 execution, receipts, and proof registration stay deterministic.

When FreeModel is absent, times out, is rate-limited, returns too much data, or returns an invalid response, the job completes with the existing deterministic report. The UI labels that path as a deterministic fallback; no successful receipt, paid API result, or Arc proof is rolled back.

The application then:

1. validates input type, length, emptiness, and obvious credential/private-key patterns;
2. computes a redacted 240-character preview and SHA-256, then creates a durable Agent DB job without storing the full input;
3. binds idempotency to the key plus workflow, input hash, selected market symbol, task, and budget;
4. applies cooldown, rate-limit, and active-job checks;
5. plans the purchase through the shared agent execution core;
6. calls up to three allowlisted x402-protected services within the `0.005 USDC` total cap, passing ephemeral source text to the Text Analyzer and an allowlisted symbol to the Pyth-backed service;
7. pays with the project-owned Arc Testnet payer wallet;
8. records the Agent Run, purchase step, payment event, and receipt;
9. updates the payer wallet's Agent Passport and seller analytics;
10. publishes a compact post-settlement proof to Arc;
11. optionally sends the validated ephemeral input and successful paid API responses to the external FreeModel provider for bounded synthesis;
12. persists either the explicitly labeled AI synthesis or the deterministic fallback with safe input metadata, reasoning, spend, receipts, and proof transactions;
13. publishes the result at the shareable read-only route `/agent-runner/<job-id>`.

The UI exposes progress states such as:

- queued;
- planning;
- purchasing;
- generating receipt;
- publishing onchain proof;
- completed or failed.

A connected browser wallet is optional and is used only as a requester label. It never pays, signs, or authorizes the hosted purchase.

The original workflow input exists only in the launch request and the in-memory background execution closure, plus the transient FreeModel request when synthesis is configured. The runner warns users before launch that their validated text will be processed by an external LLM provider. Public status, history, result pages, and Agent DB expose only the redacted preview, SHA-256, bounded/redacted model output, and safe synthesis metadata. Full prompts, API keys, authorization headers, raw provider errors, and raw provider payloads are not persisted. Failed pre-payment recovery therefore requires the operator to re-submit the original text from a local file whose hash matches the job.

## Workflow-First Product Surfaces

The primary navigation is organized around the user outcome:

- **Dashboard** — Run Workflow CTA, Workflow Templates, and Recent Results;
- **Run Workflow** — real input, safe plan preview, live hosted execution, and Final Report;
- **Workflow Templates** — supported inputs, selected APIs, prices, and expected report shape;
- **Results** — completed hosted Final Reports rather than low-level database run rows;
- **Activity** — the technical execution and purchase timeline;
- **Arc Proofs** — verified, pending, and failed registry records with receipt, transaction, block, contract, and Arcscan links;
- **Agent Passports** — workflows, reports, successful calls, verified proofs, spent USDC, and success rate;
- **Commerce Receipts** — paid calls linked to workflow results and proof metadata;
- **Developer Tools** — API Store, Agent Control, Agent Launch, and Agent Setup;
- **Seller** — service publishing and seller analytics.

Legacy routes remain live so existing reviewer links, API clients, and smoke tests do not break.

### Template deep links and frontend controls

Workflow templates open the hosted runner with a safe, allowlisted selection already applied:

- `/agent-runner?workflow=sentiment`
- `/agent-runner?workflow=builder_update`
- `/agent-runner?workflow=market_context&symbol=ETH%2FUSD`
- `/agent-runner?workflow=custom`

Market Context accepts only `BTC/USD`, `ETH/USD`, or `SOL/USD`; invalid workflow or symbol query values fall back to the default template. The runner still requires at least 20 input characters before the server can produce a plan. Its launch price comes only from that server-generated plan.

Results search, workflow/status filters, and Newest/Oldest/Highest spend sorting are reflected in the `/results` query string, so filtered views can be bookmarked or shared. Hosted browser wallets are connected through **Connect Identity** and labeled **Requester identity** throughout the workflow UI. **Your wallet will not be charged:** the separate project-owned Arc Testnet payer pays hosted workflow calls, and a connected requester appears as `Requested by 0x…` on the shareable result. Explicit wallet funding lives only under **Developer Tools → Fund Local CLI Agent** for the advanced local/operator flow.

## Verified Production Example

Phase 24 was validated with a real browser-triggered **Market Context Brief** that explicitly selected `ETH/USD`. Arc Agent Commerce charged the hosted buyer-agent through x402; the normalized underlying price came from authenticated Pyth Hermes. The result records the provider confidence interval and price age at fetch. Idempotency replay returned the same job, receipts, and proof transactions without another payment.

| Proof | Value |
| --- | --- |
| Production deployment | `dpl_89Jir9UejcfsBc8WSq5SGn2wmWxC` · [`agent-commerce-six.vercel.app`](https://agent-commerce-six.vercel.app) |
| Hosted result | [`1526513f-fe6b-4060-b2ba-e9104e4904da`](https://agent-commerce-six.vercel.app/agent-runner/1526513f-fe6b-4060-b2ba-e9104e4904da) |
| Agent Run | [`6b5f5120-47f5-4d7e-9686-149030be1f61`](https://agent-commerce-six.vercel.app/runs/6b5f5120-47f5-4d7e-9686-149030be1f61) |
| Pyth receipt | [`046917f0-c2ed-44b5-ab87-cb62d82c4e6b`](https://agent-commerce-six.vercel.app/receipts/046917f0-c2ed-44b5-ab87-cb62d82c4e6b) |
| Symbol | `ETH/USD` |
| Live price | `1871.56876472` |
| Confidence interval | `1870.98407444` – `1872.153455` (`±0.58469028`) |
| Provider publish time | `2026-07-19T14:32:23.000Z` |
| Server fetch time · price age | `2026-07-19T14:32:23.539Z` · `0.539s` |
| Pyth service payment | `0.001 USDC` |
| Total workflow spend | `0.0013 USDC` |
| Pyth Arc proof | [`0xff6ed0d8d4da2abda3bde0ac9e419f997a3d7410f629e9b0a71ffe8f206d5e06`](https://testnet.arcscan.app/tx/0xff6ed0d8d4da2abda3bde0ac9e419f997a3d7410f629e9b0a71ffe8f206d5e06) |
| Registry read | `verified`, block `52622457`, proof ID `0xc1c2…fded`, `isRegistered=true` |
| Idempotency replay | Same job, two receipts, and two proof transactions; no second payment or proof |

The provider receipt appears in Results, the Agent Run timeline, the hosted payer Passport, seller analytics, and Arc Proofs. `GET /api/proofs/046917f0-c2ed-44b5-ab87-cb62d82c4e6b` and `GET /api/proofs/transactions/0xff6e…5e06` both read the same verified registry record from the unchanged app-owned contract.

Historical Phase 21 real-input validation:

Phase 21 was validated with a real browser-submitted **Market Context Brief**. The paid Text Analyzer measured the exact normalized user input (`20` words, `136` characters), while the status API and Agent DB exposed only its safe preview and SHA-256.

| Proof | Value |
| --- | --- |
| Hosted result | [`9a2334b1-d9fd-498d-85d3-339ff340c444`](https://agent-commerce-six.vercel.app/agent-runner/9a2334b1-d9fd-498d-85d3-339ff340c444) |
| Agent Run | [`596938fd-e746-48fd-8ad9-8cd8c071616c`](https://agent-commerce-six.vercel.app/runs/596938fd-e746-48fd-8ad9-8cd8c071616c) |
| Premium Quote receipt | [`f4af1a4c-4629-4567-a352-2bb4b1eead47`](https://agent-commerce-six.vercel.app/receipts/f4af1a4c-4629-4567-a352-2bb4b1eead47) |
| Text Analyzer receipt | [`75d822e0-41cb-4224-98ab-f265928919ab`](https://agent-commerce-six.vercel.app/receipts/75d822e0-41cb-4224-98ab-f265928919ab) |
| Total paid | `0.0013 USDC` |
| Arc proof 1 | [`0xe535b6d38afdfc976dc057bf2a2c70e4d9a912844bb6983b48d76085aef10081`](https://testnet.arcscan.app/tx/0xe535b6d38afdfc976dc057bf2a2c70e4d9a912844bb6983b48d76085aef10081) |
| Arc proof 2 | [`0x3d430763fce9500dbad7d4690c3293f1c6f2c25fa86327fb99b9ffd0c35f0140`](https://testnet.arcscan.app/tx/0x3d430763fce9500dbad7d4690c3293f1c6f2c25fa86327fb99b9ffd0c35f0140) |
| Replay result | Same job and two receipt IDs; no second payment or proof |
| Changed-input replay | `409 idempotency_conflict`; no payment |

Both proofs are registered in the app-owned `AgentCommerceProofRegistry`; the run updated the hosted payer Passport and seller analytics. The production Playwright smoke also confirmed that neither the status response nor the result page publishes the full source input.

Historical Phase 20 two-service validation:

Phase 20 was validated with a real two-service browser workflow and production idempotency replay:

| Proof | Value |
| --- | --- |
| Hosted result | [`2e3db83c-d975-400e-a2b8-33ae34b2dccc`](https://agent-commerce-six.vercel.app/agent-runner/2e3db83c-d975-400e-a2b8-33ae34b2dccc) |
| Agent Run | [`295fb035-387e-4df6-8150-f72f1471dcaf`](https://agent-commerce-six.vercel.app/runs/295fb035-387e-4df6-8150-f72f1471dcaf) |
| Premium Quote receipt | [`3926f005-a4d5-4262-860d-c676fe58bede`](https://agent-commerce-six.vercel.app/receipts/3926f005-a4d5-4262-860d-c676fe58bede) |
| Text Analyzer receipt | [`dc249909-cae6-43a1-afc0-bdb1ffe570f2`](https://agent-commerce-six.vercel.app/receipts/dc249909-cae6-43a1-afc0-bdb1ffe570f2) |
| Total paid | `0.0013 USDC` |
| Arc proof 1 | [`0x8f51a20990b0b9bf74b661fbb86cb28ed6fc9d0d598f6095752047cafb1a01f0`](https://testnet.arcscan.app/tx/0x8f51a20990b0b9bf74b661fbb86cb28ed6fc9d0d598f6095752047cafb1a01f0) |
| Arc proof 2 | [`0x436c769ccdc19677654afe737f85dd7e9a5975e2b71f15a6955137ccf3238766`](https://testnet.arcscan.app/tx/0x436c769ccdc19677654afe737f85dd7e9a5975e2b71f15a6955137ccf3238766) |
| Replay result | Same job and two receipt IDs; no second payment or proof |

The Final Report contains the two actual API responses and is explicitly labeled as deterministic structured aggregation. Both receipt hashes return `true` from `AgentCommerceProofRegistry.isRegistered`.

Historical Phase 19 one-service validation:

Phase 19 was validated with a real browser-triggered production run:

| Proof | Value |
| --- | --- |
| Hosted payer | [`0x7df1b81bB463Ddf263c1c470F7C1f3a68FE30df3`](https://testnet.arcscan.app/address/0x7df1b81bB463Ddf263c1c470F7C1f3a68FE30df3) |
| Hosted job | [`95b0bf32-0b84-4014-bfdb-91c923422c64`](https://agent-commerce-six.vercel.app/agent-runner?job=95b0bf32-0b84-4014-bfdb-91c923422c64) |
| Agent Run | [`c3794f6e-354f-4542-a8b2-923a959fe6c2`](https://agent-commerce-six.vercel.app/runs/c3794f6e-354f-4542-a8b2-923a959fe6c2) |
| Receipt | [`dcbe6294-e3b0-4ea6-b71f-988585a6b17e`](https://agent-commerce-six.vercel.app/receipts/dcbe6294-e3b0-4ea6-b71f-988585a6b17e) |
| Amount paid | `0.001 USDC` |
| Arc proof transaction | [`0xe7332e50d471a73ca1a5943464d96322023921046894c916d14f2aab62cdb3a2`](https://testnet.arcscan.app/tx/0xe7332e50d471a73ca1a5943464d96322023921046894c916d14f2aab62cdb3a2) |
| Proof block | `52412095` |

The production Playwright smoke launched the CTA in Chromium, observed `Verified on Arc`, and replayed the same idempotency key. The replay returned the original job, receipt, and proof transaction without making another payment or registering another proof.

## Core Capabilities

### Hosted buyer-agent

- one-click browser launch;
- durable Agent DB job state;
- shared execution core with the local CLI;
- server-owned Arc Testnet payer wallet;
- public progress and result links;
- plan preview with exact services and estimated cost;
- multi-service execution and honest partial-failure reports;
- shareable deterministic Final Reports;
- explicit recovery for safe pre-payment failures.

### x402 payments on Arc

- HTTP 402 payment challenge;
- USDC-denominated per-request pricing;
- Circle Gateway batching flow;
- protected API response after settlement;
- request ID and payment event persistence.

### Public proof trail

Every successful paid execution can produce:

- an Agent Run timeline;
- one or more commerce receipts;
- payment metadata;
- an Agent Passport update;
- seller analytics updates;
- an onchain receipt proof on Arc Testnet.

### API Store (developer tool)

The API Store remains the service catalog and discovery layer. It explicitly labels **Live Provider**, **Internal deterministic**, and **Seller-created mock** services. `Live Market Price` is the first provider-backed listing: Arc Agent Commerce charges the agent `0.001 USDC` through x402, then obtains and normalizes the underlying market data from Pyth Network. The agent does not pay Pyth directly. Arbitrary URLs, feed IDs, upstream hosts, and external API proxying remain disabled.

### Advanced local mode

Developers can still fund and run their own buyer-agent wallet through the local CLI. This is an advanced operator flow; it is not required for the hosted end-user demo.

## Architecture

```mermaid
flowchart LR
    U[Browser user] --> R[/agent-runner]
    R --> J[Hosted Agent Job API]
    J --> D[(Agent DB)]
    J --> E[Shared Agent Execution Core]
    E --> P[Planner and policy]
    P --> S[Allowlisted API Store service]
    S --> X[x402 + Circle Gateway]
    X --> A[Paid API response]
    X --> H[Arc Agent Commerce Pyth adapter]
    H --> Y[Pyth Hermes authenticated API]
    Y --> A
    A --> L[Optional FreeModel synthesis]
    L --> F[AI-generated Final Report]
    A -. fail-open fallback .-> F2[Deterministic Final Report]
    F2 --> D
    F --> D
    D --> T[Run timeline]
    D --> C[Commerce receipt]
    D --> I[Agent Passport]
    D --> N[Seller analytics]
    A -. post-settlement attestation .-> O[AgentCommerceProofRegistry]
    O --> V[Verified on Arc]
```

Key implementation boundaries:

- `lib/agent/execution.ts` is shared by hosted and local execution;
- `lib/x402.ts` remains the payment foundation;
- Supabase through the Vercel integration is the Agent DB;
- the proof publisher runs only after the paid response is available;
- the proof registry never receives or transfers funds.
- FreeModel receives no authority over planning, spend, settlement, receipts, or proofs and can fail without failing the hosted job.

## Onchain Proof Registry

The app owns a custom `AgentCommerceProofRegistry` deployment on Arc Testnet.

| Field | Value |
| --- | --- |
| Contract | [`0x92dC1aFC126F755ba5d5254e8D697CAe10474851`](https://testnet.arcscan.app/address/0x92dC1aFC126F755ba5d5254e8D697CAe10474851) |
| Network | Arc Testnet |
| Role | Immutable post-settlement receipt proofs |
| Custody | None |

The contract stores compact proof data only:

- receipt hash;
- service hash;
- buyer and seller addresses;
- amount in 6-decimal USDC atomic units;
- request hash;
- response hash;
- block timestamp.

Safety properties:

- only the operator or an approved attester can register proofs;
- every receipt ID can be registered only once;
- duplicate and concurrent retries are rejected;
- proof publication cannot reverse or block an already completed x402 purchase;
- the attester private key remains server-only.

Transient proof failures can be recovered either with `npm run proofs:recover` in an authorized server environment or through the operator-only internal recovery route protected by `AGENT_COMMERCE_PROOF_RECOVERY_TOKEN`. Recovery reads canonical payment data from Agent DB, checks the existing transaction/contract state, and never accepts proof fields from a browser.

Read-only proof APIs:

- `GET /api/proofs/<receipt-step-id-or-proof-id>`
- `GET /api/proofs/transactions/<transaction-hash>`

The registry is an unaudited testnet prototype and must not be treated as production financial infrastructure.

## Hosted Runner Guardrails

The hosted payer is protected by server-side and database-enforced controls:

- exact service slug, endpoint, and HTTP method allowlist;
- no arbitrary URLs;
- `0.005 USDC` maximum spend per job;
- at most three paid calls per job;
- one queued or running job globally for the demo payer;
- requester cooldown;
- rolling rate limit;
- HMAC-protected idempotency keys bound to workflow, normalized input hash, task, and budget;
- an exact replay returns the original job, while key reuse with different input returns `409 idempotency_conflict`;
- recovery is allowed only before payment when recorded spend is zero;
- payer and attester keys are stored only as Vercel Sensitive environment variables.

## Public Surfaces

| Route | Purpose |
| --- | --- |
| `/agent-runner` | Preview and launch useful hosted paid workflows |
| `/agent-runner/<id>` | Shareable read-only progress and Final Report |
| `/store` | Browse agent-buyable services |
| `/agent-control` | Dry-run planning and policy preview |
| `/runs` | Public agent execution timelines |
| `/receipts` | Shareable paid commerce receipts |
| `/agents` | Agent wallet identity and reputation profiles |
| `/review` | Reviewer health, live proof, and technical status |
| `/agent-setup` | Advanced local buyer-agent setup |
| `/seller/analytics` | Protected seller usage and revenue analytics |

Useful public APIs:

| Endpoint | Purpose |
| --- | --- |
| `GET /api/store/services` | Machine-readable service discovery |
| `POST /api/hosted-agent/plan` | Validate input and preview the exact allowlisted plan/cost |
| `POST /api/hosted-agent/jobs` | Create or replay a hosted job |
| `POST /api/provider/pyth/price` | x402-protected normalized Pyth price for BTC/USD, ETH/USD, or SOL/USD |
| `GET /api/hosted-agent/jobs?workflowType=<type>` | Recent hosted workflow history, optionally filtered by workflow |
| `GET /api/hosted-agent/jobs/<id>` | Read hosted job progress and proof links |
| `GET /api/receipts` | Recent commerce receipts |
| `GET /api/receipts/<id>` | One receipt |
| `GET /api/agents` | Agent Passport list |
| `GET /api/agents/<wallet>` | Agent Passport detail |
| `GET /api/review/status` | Public production health and latest proof links |

## Review the Project in Two Minutes

1. Open the [hosted runner](https://agent-commerce-six.vercel.app/agent-runner).
2. Choose Market Context Brief, ask for BTC/USD, ETH/USD, or SOL/USD with real non-sensitive context, preview the two-service `0.0013 USDC` plan, and launch it.
3. Watch the job progress to `completed`, inspect the Final Report, and confirm every receipt is `Verified on Arc`.
4. Open the generated Agent Run, receipt, Passport, and Arcscan transaction.
5. Open the [review page](https://agent-commerce-six.vercel.app/review) for the current production status.
6. Confirm that an unpaid protected request returns HTTP 402:

```bash
curl -i -X POST https://agent-commerce-six.vercel.app/api/provider/pyth/price \
  -H 'Content-Type: application/json' \
  -d '{"symbol":"BTC/USD"}'
```

7. Run the public production smoke:

```bash
npm run review:smoke
```

## Local Development

```bash
git clone https://github.com/mioku50/Agent-Commerce.git
cd Agent-Commerce
npm install
cp .env.example .env.local
npm run dev
```

Open `http://localhost:3000`.

The production hosted flow does not require local setup. Local development and the CLI flow require the relevant public and server environment variables.

### Environment groups

Do not commit `.env.local`, private keys, service-role keys, JWT secrets, or database passwords.

| Group | Important variables |
| --- | --- |
| App and network | `BASE_URL`, `ARC_TESTNET_RPC_URL`, `NEXT_PUBLIC_ARC_CHAIN_ID`, `NEXT_PUBLIC_ARC_EXPLORER_URL` |
| Public Agent DB | `NEXT_PUBLIC_AGENT_DB_SUPABASE_URL`, `NEXT_PUBLIC_AGENT_DB_SUPABASE_PUBLISHABLE_KEY` |
| Server Agent DB | `AGENT_DB_SUPABASE_URL`, `AGENT_DB_SUPABASE_SECRET_KEY` or service-role fallback |
| Database migrations | `AGENT_DB_POSTGRES_URL_NON_POOLING` |
| Proof registry | `AGENT_COMMERCE_PROOF_REGISTRY_ADDRESS`, server-only `AGENT_COMMERCE_PROOF_ATTESTER_PRIVATE_KEY` |
| Proof recovery | server-only `AGENT_COMMERCE_PROOF_RECOVERY_TOKEN` |
| External provider | server-only Vercel Sensitive `PYTH_API_KEY` |
| Optional LLM synthesis | server-only `LLM_PROVIDER=openai-compatible`, `LLM_BASE_URL`, Vercel Sensitive `LLM_API_KEY`, and `LLM_MODEL` |
| Local buyer agent | `AGENT_PRIVATE_KEY`, optional funding and Gateway reuse controls |

The hosted payer key, rate-limit secret, Supabase privileged credentials, proof attester key, `PYTH_API_KEY`, and `LLM_API_KEY` must exist only in server-side Sensitive environment variables. The public status API reports only whether Pyth and FreeModel are configured, the fixed symbol allowlist, protocol, provider name, and model; it never returns keys, base URLs, authorization headers, full prompts, upstream raw responses, or credential-bearing metadata. `OPENAI_API_KEY` is not read or used.

### FreeModel synthesis boundary

The only supported `LLM_PROVIDER` value is `openai-compatible`. The current production target is [FreeModel](https://freemodel.dev/) at `https://api.freemodel.dev/v1` with `gpt-5.4-mini`. The server uses a 30-second per-attempt timeout, at most two attempts with limited backoff for timeouts/rate limits/transient failures, a 900-token completion cap, and a 24 KB response cap. Only validated input, workflow context, and safe projections of successful paid API responses enter the transient prompt. Failed-service errors, provider authorization fields, feed IDs, raw payloads, and secrets are excluded.

### Pyth provider boundary

The authenticated Hermes adapter uses a fixed upstream host and server-side feed mapping for the explicit `BTC/USD`, `ETH/USD`, and `SOL/USD` selection. Browser clients cannot submit feed IDs or upstream URLs. The adapter applies a request timeout, limited retry/backoff for provider failures and rate limits, a five-second server cache, response-shape checks, and a `120s` maximum update age. It publishes only normalized symbol, price, confidence interval, provider/server timestamps, price age, source status, and billing attribution; raw Hermes responses and authorization headers are not persisted. Provider retries happen only inside the already-paid Arc Agent Commerce service request; the buyer's x402 payment is never automatically retried, avoiding duplicate settlement. A provider failure is reported honestly and does not erase useful results from other services.

## Advanced Local Buyer-Agent

The local runner uses the same planning and execution core as the hosted flow:

```bash
AGENT_MAX_IN_FLIGHT=1 npm run agent -- \
  --task "Analyze tone and sentiment for a short builder update" \
  --limit 0.005
```

The local CLI signs payments with a local buyer-agent key and may require operator-level database credentials to persist public timelines, receipts, and Passport data. Never paste a private key into the browser.

## Database Operations

Apply migrations and verify the Agent DB through the linked Vercel production environment:

```bash
npx vercel env run -e production -- npm run db:migrate
npx vercel env run -e production -- npm run db:verify
```

The migration runner applies files in lexical order, records applied versions, and reruns the idempotent demo seed. The unavailable legacy Supabase project is not used and its historical data was not copied.

## Testing and Operations

```bash
# Application
npm run provider:test
npm run llm:test
npm run llm:live-smoke
npm run hosted:workflow-test
npm run frontend:ux-test
npm run lint
npm run build
npm run review:smoke

# Browser responsive/accessibility smoke against a running build
BASE_URL=http://127.0.0.1:3000 npm run frontend:responsive-test

# Hosted runner policy and database tests
npm run hosted:test

# Explicit paid browser smoke; spends Arc Testnet USDC
npx playwright install chromium
npm run hosted:browser-smoke -- --symbol=ETH/USD --confirm-paid-run

# Proof registry
cd contracts && forge test
cd ..
npm run proofs:smoke

# Server-only recovery
npm run hosted:recover -- --job <hosted-job-uuid> --input-file <original-input.txt>
npm run proofs:recover -- --dry-run
```

A paid browser smoke must never run silently. It requires the explicit `--confirm-paid-run` flag.

## Technology

- Next.js 16 App Router;
- React 19 and TypeScript;
- Arc Testnet;
- USDC;
- x402 core and EVM packages;
- Circle x402 batching / Gateway flow;
- authenticated Pyth Hermes provider adapter;
- OpenAI-compatible FreeModel synthesis with deterministic fallback;
- viem;
- Supabase through the Vercel integration;
- Foundry for the proof registry;
- Playwright for browser-level paid smoke tests.

## Current Limitations

- Arc Testnet only;
- hosted purchases use a project-owned payer wallet;
- the hosted service set is allowlisted;
- the registry is custom and unaudited;
- seller-created external API proxying is disabled;
- seller publishing and settlement configuration are still prototype-level;
- FreeModel is an external processor for validated workflow text; users should submit only non-sensitive input;
- model synthesis is bounded and explicitly labeled, while the deterministic report remains the authoritative fallback;
- full source input cannot be recovered from Agent DB by design.

## Next Direction

Phase 25 adds explicitly labeled FreeModel synthesis without granting the model control over commerce execution. Future work can focus on:

- additional low-cost allowlisted data and compute services;
- encrypted, user-controlled prompt/result storage and provider consent controls;
- encrypted, user-controlled private result storage for use cases that should not be public;
- richer service-level proof and cost comparisons;
- production-grade seller authentication and settlement configuration;
- future exploration of ERC-8004 identity and ERC-8183 job coordination.

These items are roadmap targets and are not presented as completed features.

## Built on Arc Nanopayments

Arc Agent Commerce started from the official Circle sample:

- [`circlefin/arc-nanopayments`](https://github.com/circlefin/arc-nanopayments)

The original project demonstrates x402-protected endpoints, Arc USDC payments, Circle Gateway flows, seller balance and withdrawal surfaces, and a local buyer-agent.

This repository preserves that payment foundation and extends it with:

- hosted browser execution;
- durable agent jobs;
- service discovery and planning;
- public run timelines;
- commerce receipts;
- Agent Passports;
- seller analytics;
- an app-owned onchain proof registry;
- idempotent browser and contract verification.

## License

Apache-2.0. See [`LICENSE`](LICENSE).
