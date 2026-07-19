# Arc Agent Commerce

> Submit real input → a hosted agent selects and purchases paid APIs through x402 → generates a Final Report → creates receipts → registers verified proofs on Arc.

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

- **Sentiment & Tone Report** — deterministic keyword and punctuation heuristics over user text, plus traceable paid API results;
- **Builder Update Summary** — deterministic delivery/risk signal extraction from a project update;
- **Market Context Brief** — combines user context with a normalized live BTC/USD, ETH/USD, or SOL/USD price sourced from Pyth Network;
- **Custom Task** — the shared planner selects relevant services from the fixed server allowlist.

When no LLM is configured, the result is explicitly labeled **Structured workflow result (no LLM configured)**. The application never presents deterministic aggregation as model-generated analysis.

The application then:

1. validates input type, length, emptiness, and obvious credential/private-key patterns;
2. computes a redacted 240-character preview and SHA-256, then creates a durable Agent DB job without storing the full input;
3. binds idempotency to the key plus workflow, input hash, task, and budget;
4. applies cooldown, rate-limit, and active-job checks;
5. plans the purchase through the shared agent execution core;
6. calls up to three allowlisted x402-protected services within the `0.005 USDC` total cap, passing ephemeral source text to the Text Analyzer and an allowlisted symbol to the Pyth-backed service;
7. pays with the project-owned Arc Testnet payer wallet;
8. records the Agent Run, purchase step, payment event, and receipt;
9. updates the payer wallet's Agent Passport and seller analytics;
10. publishes a compact post-settlement proof to Arc;
11. persists a structured Final Report built from the actual API responses, safe input metadata, reasoning, spend, receipts, and proof transactions;
12. publishes the result at the shareable read-only route `/agent-runner/<job-id>`.

The UI exposes progress states such as:

- queued;
- planning;
- purchasing;
- generating receipt;
- publishing onchain proof;
- completed or failed.

A connected browser wallet is optional and is used only as a requester label. It never pays, signs, or authorizes the hosted purchase.

The original workflow input exists only in the launch request and the in-memory background execution closure. Public status, history, result pages, and Agent DB expose only the redacted preview and SHA-256. Failed pre-payment recovery therefore requires the operator to re-submit the original text from a local file whose hash matches the job.

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

## Verified Production Example

Phase 23 was validated with a real browser-triggered **Market Context Brief** that selected the allowlisted Pyth-backed service. Arc Agent Commerce charged the hosted buyer-agent through x402; the normalized underlying price came from authenticated Pyth Hermes. Idempotency replay returned the same job, receipts, and proof transactions without another payment.

| Proof | Value |
| --- | --- |
| Hosted result | [`e0b9cdd0-314f-4d1a-90e2-6aaaf65632d2`](https://agent-commerce-six.vercel.app/agent-runner/e0b9cdd0-314f-4d1a-90e2-6aaaf65632d2) |
| Agent Run | [`f9a092b5-b418-4fd9-a26f-885b810dbcbd`](https://agent-commerce-six.vercel.app/runs/f9a092b5-b418-4fd9-a26f-885b810dbcbd) |
| Pyth receipt | [`6667cce0-854b-4560-ab39-530dd0e46615`](https://agent-commerce-six.vercel.app/receipts/6667cce0-854b-4560-ab39-530dd0e46615) |
| Symbol | `BTC/USD` |
| Live price · confidence | `64436.01519547` · `±20.9096521` |
| Provider publish time | `2026-07-19T14:00:20.000Z` |
| Server fetch time | `2026-07-19T14:00:20.524Z` |
| Pyth service payment | `0.001 USDC` |
| Total workflow spend | `0.0013 USDC` |
| Pyth Arc proof | [`0xdfb03cf91b61ed07d21bb7d9076cc31b85dc78e60cfae75c606befa9581f82e2`](https://testnet.arcscan.app/tx/0xdfb03cf91b61ed07d21bb7d9076cc31b85dc78e60cfae75c606befa9581f82e2) |
| Registry read | `verified`, block `52618688`, receipt hash `0x4ffd…24a8` |

The provider receipt appears in Results, the Agent Run timeline, the hosted payer Passport, and seller analytics. `GET /api/proofs/6667cce0-854b-4560-ab39-530dd0e46615` and `GET /api/proofs/transactions/0xdfb…f82e2` both return the same verified registry record.

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
    A --> F[Deterministic Final Report]
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
| Local buyer agent | `AGENT_PRIVATE_KEY`, optional funding and Gateway reuse controls |

The hosted payer key, rate-limit secret, Supabase privileged credentials, proof attester key, and `PYTH_API_KEY` must exist only in server-side Sensitive environment variables. The public status API reports only whether Pyth is configured and its fixed symbol allowlist; it never returns the key, authorization header, upstream raw response, or credential-bearing metadata.

### Pyth provider boundary

The authenticated Hermes adapter uses a fixed upstream host and the server-side feed mapping for `BTC/USD`, `ETH/USD`, and `SOL/USD`. It applies a request timeout, limited retry/backoff for provider failures and rate limits, a five-second server cache, response-shape checks, and stale-data detection. Provider retries happen only after the x402 request reaches the Arc Agent Commerce server; the buyer's paid request is never automatically retried, avoiding duplicate settlement. A provider failure is reported honestly and does not erase useful results from other services.

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
npm run lint
npm run build
npm run review:smoke

# Hosted runner policy and database tests
npm run hosted:test

# Explicit paid browser smoke; spends Arc Testnet USDC
npx playwright install chromium
npm run hosted:browser-smoke -- --confirm-paid-run

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
- deterministic aggregation is intentionally limited and does not replace an LLM; Market Context uses a real provider response but does not invent analysis or prices;
- full source input cannot be recovered from Agent DB by design.

## Next Direction

Phase 23 adds the first real external data provider. Future work can focus on:

- optional model-backed synthesis that is explicitly labeled and never implied when unavailable;
- additional low-cost allowlisted data and compute services;
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
