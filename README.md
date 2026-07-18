# Arc Agent Commerce

> A one-click hosted buyer-agent that purchases x402-protected API services with USDC on Arc and publishes a public, onchain-verifiable proof trail.

**Arc Agent Commerce is no longer positioned primarily as an API marketplace demo.**
The current product direction is a hosted agent execution and verification layer:

1. a user launches an agent from the browser;
2. the agent previews and selects up to three allowlisted paid APIs;
3. a project-owned server wallet pays through x402 and Circle Gateway;
4. the response becomes a public run, receipt, and Agent Passport update;
5. a compact proof is registered in the app-owned contract on Arc Testnet.

The API Store remains the service discovery layer, but the main product is now the complete **task → payment → result → receipt → onchain proof** workflow.

## Live Product

| Surface | Link |
| --- | --- |
| Production app | https://agent-commerce-six.vercel.app |
| One-click hosted agent | https://agent-commerce-six.vercel.app/agent-runner |
| Reviewer status | https://agent-commerce-six.vercel.app/review |
| API Store | https://agent-commerce-six.vercel.app/store |
| Agent runs | https://agent-commerce-six.vercel.app/runs |
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

Open [`/agent-runner`](https://agent-commerce-six.vercel.app/agent-runner), choose a useful workflow, inspect its server-generated plan and estimated price, then launch it.

Available hosted workflows:

- **Sentiment & Tone Report** — deterministic keyword and punctuation heuristics over user text, plus traceable paid API results;
- **Builder Update Analysis** — deterministic delivery/risk signal extraction from a project update;
- **Custom Task** — the shared planner selects relevant services from the fixed server allowlist.

When no LLM is configured, the result is explicitly labeled **Structured workflow result (no LLM configured)**. The application never presents deterministic aggregation as model-generated analysis.

The application then:

1. creates a durable Agent DB job;
2. applies idempotency, cooldown, rate-limit, and active-job checks;
3. plans the purchase through the shared agent execution core;
4. calls up to three allowlisted x402-protected services within the `0.005 USDC` total cap;
5. pays with the project-owned Arc Testnet payer wallet;
6. records the Agent Run, purchase step, payment event, and receipt;
7. updates the payer wallet's Agent Passport and seller analytics;
8. publishes a compact post-settlement proof to Arc;
9. persists a structured Final Report with actual API responses, selected/skipped services, spend, receipts, and proof transactions;
10. publishes the result at the shareable read-only route `/agent-runner/<job-id>`.

The UI exposes progress states such as:

- queued;
- planning;
- purchasing;
- generating receipt;
- publishing onchain proof;
- completed or failed.

A connected browser wallet is optional and is used only as a requester label. It never pays, signs, or authorizes the hosted purchase.

## Verified Production Example

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

### API Store

The API Store remains the service catalog and discovery layer. It includes official sample services and safe seller-created mock services. Arbitrary external API proxying is intentionally disabled.

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
- HMAC-protected idempotency keys;
- replay returns the original job;
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
| `GET /api/hosted-agent/jobs` | Recent hosted workflow history |
| `GET /api/hosted-agent/jobs/<id>` | Read hosted job progress and proof links |
| `GET /api/receipts` | Recent commerce receipts |
| `GET /api/receipts/<id>` | One receipt |
| `GET /api/agents` | Agent Passport list |
| `GET /api/agents/<wallet>` | Agent Passport detail |
| `GET /api/review/status` | Public production health and latest proof links |

## Review the Project in Two Minutes

1. Open the [hosted runner](https://agent-commerce-six.vercel.app/agent-runner).
2. Choose Sentiment & Tone or Builder Update, preview the two-service `0.0013 USDC` plan, and launch it.
3. Watch the job progress to `completed`, inspect the Final Report, and confirm every receipt is `Verified on Arc`.
4. Open the generated Agent Run, receipt, Passport, and Arcscan transaction.
5. Open the [review page](https://agent-commerce-six.vercel.app/review) for the current production status.
6. Confirm that an unpaid protected request returns HTTP 402:

```bash
curl -i https://agent-commerce-six.vercel.app/api/premium/quote
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
| Local buyer agent | `AGENT_PRIVATE_KEY`, optional funding and Gateway reuse controls |

The hosted payer key, rate-limit secret, Supabase privileged credentials, and proof attester key must exist only in server-side Sensitive environment variables.

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
npm run hosted:recover -- --job <hosted-job-uuid>
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
- the current hosted demo proves payment and verification, but richer multi-service user workflows and a composed final report are the next product step.

## Next Direction

The next phase moves from a proof-oriented hosted smoke into useful agent work:

- input-driven workflows such as sentiment analysis and builder update review;
- multiple selected paid services within one budget;
- a structured final report combining purchased responses;
- shareable hosted result pages;
- clearer service-level proof and cost summaries;
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
