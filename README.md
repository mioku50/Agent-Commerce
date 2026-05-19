# Arc Agent Commerce / API Store Demo

Arc Agent Commerce is an early builder prototype for an x402-powered API Store where AI agents can discover paid services, pay with USDC on Arc, and receive API responses instantly.

The project direction expands the official Arc Nanopayments sample from a premium endpoint demo into an agent-commerce marketplace pattern: API discovery, per-request payments, buyer-agent reasoning, seller analytics, Gateway balance visibility, and spending policy controls.

## Vision

AI agents are becoming real users of APIs. They need a way to buy useful services without human account setup, card billing, subscriptions, or long-lived API keys.

Arc Agent Commerce explores a simpler flow:

1. An agent discovers a service.
2. It inspects the endpoint, category, price, and expected result.
3. It pays a small amount in USDC through x402/nanopayments on Arc.
4. It receives the API response immediately.
5. The purchase is logged for budget, reasoning, and seller analytics.

## Problem

Traditional API billing is optimized for companies and human operators:

- create an account
- add a billing card
- manage API keys
- choose a subscription tier
- reconcile invoices
- monitor usage separately from the product workflow

That model is awkward for autonomous agents that need to buy small units of utility while completing a task.

## Solution

Arc Agent Commerce presents an API Store where services can be priced per request and protected by x402 payment requirements.

The demo is shaped around three surfaces:

- **API Store**: a service catalog that agents and builders can inspect.
- **Buyer Agent**: a local agent flow that chooses and buys services with a spending policy.
- **Seller Dashboard**: a seller view for API revenue, agent purchases, Gateway balance, and withdrawals.

## Why Arc

Arc is a strong fit for agent commerce because USDC is the native gas token. Builders can design payment flows where both the purchase amount and transaction fees are denominated in USDC.

Arc Testnet chain config for this project:

| Field | Value |
| --- | --- |
| Network | Arc Testnet |
| Chain ID | `5042002` |
| Hex Chain ID | `0x4CEF52` |
| Native Currency | USDC |
| RPC URL | `https://rpc.testnet.arc.network` |
| WebSocket URL | `wss://rpc.testnet.arc.network` |
| Explorer | `https://testnet.arcscan.app` |
| Faucet | `https://faucet.circle.com` |
| CCTP Domain | `26` |
| ERC-20 USDC | `0x3600000000000000000000000000000000000000` |
| ERC-20 USDC Decimals | `6` |

Important implementation note: Arc native gas uses 18 decimals, while ERC-20 USDC uses 6 decimals.

## Why x402 / Nanopayments

x402 gives paid APIs a web-native payment handshake. Instead of requiring a separate account or billing relationship, an endpoint can describe the payment required for access, the buyer can satisfy it, and the API can return the protected response.

For AI agents, this creates a useful primitive:

- discover a paid endpoint
- understand price before calling
- pay only when needed
- keep a purchase log
- stop when policy limits are reached

Nanopayments make low-value, per-request services practical, especially for mocked data, routing signals, small analysis jobs, and utility APIs.

## Demo Concept

The first version is a compact API marketplace for agents. The API Store starts with five demo services:

| Service | Endpoint | Price | Purpose |
| --- | --- | --- | --- |
| Premium Quote | `/api/premium/quote` | 0.001 USDC | Simple paid response test |
| Market Snapshot | `/api/premium/dataset` | 0.01 USDC | Mock market data |
| Text Analyzer | `/api/premium/compute` | 0.0003 USDC | Analyze submitted text |
| Weather Signal | `/api/store/weather-signal` | 0.002 USDC | Planned weather signal |
| Agent Task | `/api/premium/agent-task` | 0.03 USDC | Multi-step task for a buyer agent |

The service registry is the source of truth for the API Store. It maps live services to existing premium x402 endpoints and includes planned services for future expansion. Existing premium endpoints are intentionally retained.

## Phase 2 — API Store

`/store` is now a marketplace-style UI for agent-buyable APIs. Each service is described in `lib/services/registry.ts` with pricing, method, endpoint, schemas, examples, and an agent reasoning hint.

The public discovery endpoint `GET /api/store/services` exposes the registry as machine-readable JSON so future buyer-agent flows can discover services dynamically.

Each service detail page under `/store/[slug]` documents the endpoint contract, example request and response, cURL call, and the fact that unpaid direct calls to live services return HTTP 402 until the x402 payment requirement is satisfied.

Phase 3 connects buyer-agent reasoning and purchase timelines to this registry.

## Phase 3 — Buyer Agent Reasoning + Purchase Timeline

The buyer-agent now discovers services from `GET /api/store/services` instead of running a hardcoded endpoint loop.

The default `scripted` planner chooses services from the task and budget, records why each service was selected or skipped, pays selected live endpoints through the existing x402/Gateway flow, and saves a public timeline to Supabase.

Public timeline views:

- `/runs`: recent agent runs
- `/runs/[id]`: ordered reasoning and purchase timeline for one run

Usage:

```bash
npm run agent -- --task "Prepare a market context report" --limit 0.05
```

Reuse an existing funded Gateway balance:

```bash
AGENT_PRIVATE_KEY=0x... AGENT_SKIP_FUNDING=1 AGENT_SKIP_DEPOSIT=1 npm run agent -- --task "Prepare a market context report" --limit 0.02
```

For a full run including Agent Task, Gateway balance must be large enough. Quote + dataset + compute + agent-task costs about `0.0413 USDC`.

Supabase stores the public run timeline, service choices, reasoning, request IDs, and response previews. It does not store private keys, bearer tokens, or full signed payment authorizations. Local `.agent-runs/` logs remain available for debugging and wallet retry flows.

## Phase 4 — Seller Creator Mode

Builders can now create API service listings from `/seller`. Seller-created services are stored in Supabase, merged into `/store`, and included in the machine-readable `GET /api/store/services` discovery response.

Phase 4 intentionally uses safe MVP fulfillment:

- `seller_mock` services return a protected mock response from stored metadata.
- `external_placeholder` services can be listed, but external fulfillment is not enabled.
- the app does not proxy arbitrary external URLs.
- private keys and signed payment authorizations are not stored in Supabase.
- the existing x402/Gateway payment core remains unchanged.

Seller flow:

1. Open `/seller`.
2. Create a service listing.
3. Mark it `live`.
4. Open `/store` and inspect the listing.
5. Run the buyer-agent with a task that matches the listing.

Buyer-agent discovery now includes seller-created services. The scripted planner skips coming-soon, disabled, and external-placeholder listings, and only selects live `seller_mock` services when the task matches the listing metadata and the price fits the remaining budget.

## Phase 5 — Agent Identity + Reputation Passport

Agent wallets now get public off-chain Agent Passports derived from real run and purchase history.

Public passport views:

- `/agents`: recent buyer-agent wallet profiles
- `/agents/[wallet]`: one wallet's Agent Passport, usage stats, trust score, recent runs, and reputation events
- `GET /api/agents`: machine-readable agent profile list
- `GET /api/agents/[wallet]`: profile detail, recent runs, and reputation events

Each completed buyer-agent run recalculates the wallet profile from `agent_runs` and `agent_purchase_steps`. The profile tracks total runs, completed runs, paid requests, skipped requests, failed requests, total USDC spent, seller-created services used, official services used, and a deterministic demo trust score.

The trust score is intentionally simple for the prototype: completed runs, paid requests, seller-created service usage, and budget-respected runs increase the score; failed requests and failed runs reduce it. Reputation events are written idempotently per wallet/run/status so retries do not duplicate events.

No private keys, payment signatures, bearer tokens, or service role keys are stored in Agent Passport tables. This phase is an off-chain identity and reputation layer; ERC-8004 agent identity remains a future phase.

Recovery command: if a post-run Agent Passport update fails because Supabase or the network times out, rebuild profiles from historical run data:

```bash
npm run agents:rebuild
npm run agents:rebuild -- --wallet 0x...
```

## Phase 6 — Seller Analytics + Revenue Dashboard

Sellers now have a public/demo analytics surface for seeing how API Store services perform.

Seller analytics views:

- `/seller/analytics`: screenshot-friendly analytics dashboard
- `GET /api/seller/analytics`: aggregate JSON for seller-created and official service usage
- `GET /api/seller/services/[id]/analytics`: service-scoped analytics JSON

The dashboard aggregates from existing tables:

- `store_services` for seller-created listings
- `agent_runs` for buyer-agent wallets and run links
- `agent_purchase_steps` for selected, skipped, failed, and paid service decisions
- `payment_events` when a paid step can be linked to a settled x402 payment

Metrics include total services, live services, seller-created services, paid calls, skipped calls, failed calls, estimated USDC revenue, top services, recent purchases, buyer-agent wallets, source type breakdown, request IDs, run timeline links, and Agent Passport links.

Payment event linking is best-effort and non-blocking. New runs try to store `payment_event_id` directly; analytics and timeline pages also retro-match older paid steps by endpoint, buyer wallet, amount, and run time window. If no match is available, the UI keeps showing the paid request and request ID with the payment event as `n/a`.

No private keys, signed payment authorizations, Circle secrets, or service role keys are exposed. The x402/Gateway verification and settlement core remains unchanged.

## Phase 7 — Buyer Agent Control Center

`/agent-control` adds a safe web planning surface for configuring a buyer-agent run before executing the local CLI agent.

Control Center features:

- task input
- budget in USDC
- preferred category filters
- max service price guardrail
- seller-created service toggle
- official sample service toggle
- dry-run / local-command mode
- copyable local command

The planning API `POST /api/agent/plan` fetches the same API Store services that the CLI agent discovers, applies the selected policy, and returns selected/skipped services with deterministic reasoning and estimated spend.

No paid request happens in the browser. The route does not receive or store private keys, does not move funds, does not deposit into Gateway, and does not call protected x402 endpoints. Live payments still run through:

```bash
AGENT_MAX_IN_FLIGHT=1 npm run agent -- --task "Analyze the sentiment and tone of an Arc Agent Commerce demo" --limit 0.005
```

`agent.mts` and `/api/agent/plan` now share the same scripted planner helper, so CLI runs and web dry-runs make consistent service-selection decisions.

## Phase 8 — Public Commerce Receipts / Audit Trail

Paid agent purchases now produce public commerce receipts derived from existing run-step and payment metadata.

Receipt views:

- `/receipts`: recent paid API purchase receipts
- `/receipts/[id]`: one shareable receipt for a paid purchase step
- `GET /api/receipts`: machine-readable recent receipts
- `GET /api/receipts/[id]`: one receipt as JSON

Each receipt links together the buyer-agent wallet, Agent Passport, service purchased, official or seller-created source type, method, endpoint, price paid, request ID, run timeline, matched payment event when available, timestamp, and safe response preview.

Receipts are an audit-trail projection over public metadata in `agent_purchase_steps`, `agent_runs`, `payment_events`, and `store_services`. They do not store private keys, payment signatures, bearer tokens, Circle secrets, or service role keys. The existing x402/Gateway verification and settlement core remains unchanged.

## Phase 9 — UI Polish and Global Navigation

The app now has a consistent top navigation bar, shared cream/off-white and blue-accent styling, and cleaner page structure across the public and seller surfaces.

Polished surfaces include:

- landing page
- `/store` and service detail pages
- `/agent-control`
- `/runs` and run details
- `/agents` and Agent Passports
- `/receipts` and receipt details
- `/seller`, `/seller/analytics`, and seller service forms
- `/login`

Seller auth remains email/password. The login page is positioned as the protected seller entrypoint, while public pages remain publicly readable.

## Phase 10 — Wallet Connect and Arc Token UX

Browser wallet support now lets users connect an injected EVM wallet, inspect the connected address and current network, switch/add Arc Testnet, and view Arc Testnet balances.

Wallet UX features:

- Arc Testnet chain config in `lib/wallet/arc.ts`
- connect wallet button and connected wallet badge
- network status and switch-to-Arc action
- native gas USDC balance
- ERC-20 USDC balance
- quick links to Circle faucet, Arc explorer, Agent Passport, and related receipts

This phase is read/display/navigation focused. It does not move private keys into the browser, does not replace the CLI buyer-agent payment flow, and does not modify x402/Gateway settlement logic.

## Phase 11 — Wallet-Funded Agent Launch

`/agent-launch` adds a safe funding bridge between a user's browser wallet and the existing local buyer-agent CLI flow.

The page lets a user:

- connect an Arc Testnet wallet
- inspect source wallet native gas and ERC-20 USDC balances
- enter or prefill a buyer-agent wallet destination from `NEXT_PUBLIC_DEMO_BUYER_ADDRESS`
- send native gas USDC to the buyer-agent wallet
- send ERC-20 USDC to the buyer-agent wallet
- inspect transaction status, tx hash, and explorer links
- copy a local `npm run agent` command after funding
- jump to Agent Control, receipts, and Agent Passport pages

Browser funding actions require user wallet confirmation and only run on Arc Testnet. The browser never receives private keys and never runs paid API purchases. x402 signing, Gateway payment behavior, and service calls remain in the local CLI buyer-agent flow.

## Phase 12 — Demo Story / Guided Showcase

`/demo` turns the technical surfaces into a two-minute guided product story.

The guided demo uses one real scenario:

> An AI agent analyzes the tone and sentiment of a short builder update by discovering paid APIs, selecting useful services, paying with USDC on Arc through x402/Gateway, and producing public receipts and Agent Passport updates.

The page walks through:

1. browsing the API Store
2. planning a buyer-agent run
3. funding the buyer-agent wallet
4. running the local CLI agent
5. inspecting the public timeline
6. inspecting commerce receipts
7. inspecting the Agent Passport
8. inspecting seller analytics

It also shows a copyable demo command:

```bash
AGENT_MAX_IN_FLIGHT=1 npm run agent -- --task "Analyze tone and sentiment for a short builder update" --limit 0.005
```

Live proof cards link to the latest successful run, latest receipt, main Agent Passport, and seller analytics when data is available. If no live data is available, the page shows a helpful empty state instead of failing.

## Core User Flows

### Agent Buyer Flow

The buyer agent should eventually be able to:

- list available paid services
- choose services based on a task
- inspect endpoint price and metadata
- pay with USDC through x402
- receive the protected API response
- log what it bought and why
- stop when a spending policy is reached
- dry-run a task and budget in `/agent-control` before running the local CLI

### Seller Flow

The seller should be able to:

- publish paid API endpoints
- view API revenue
- monitor agent purchases
- check Gateway balance
- withdraw earnings
- understand which services agents buy most often

### Builder Flow

A builder should be able to:

- run the app locally
- open the API Store
- inspect the seller dashboard
- add services to the registry
- extend the sample into real x402-protected APIs

## MVP Scope

The current MVP keeps the payment foundation intact and adds the marketplace layer:

- Arc Agent Commerce naming and metadata
- README and roadmap
- landing page
- typed service registry
- API Store marketplace UI
- public service discovery endpoint
- service detail pages
- light dashboard service-name mapping
- buyer-agent reasoning timeline
- public `/runs` pages
- seller-created service listings
- safe protected mock services for marketplace expansion
- public Agent Passport profiles and reputation events
- seller analytics for paid calls, estimated revenue, buyer wallets, and request IDs
- buyer-agent control center for dry-run planning and command generation
- public commerce receipts for paid x402 API purchases
- global navigation and polished demo styling
- browser wallet connect and Arc Testnet balance visibility
- wallet-funded agent launch for funding the local buyer-agent wallet
- guided demo story with live proof cards

This scope intentionally avoids deep changes to payment verification, Gateway balance, withdrawal, x402 middleware, or Supabase persistence.

## Architecture

Planned architecture:

- **Frontend**: Next.js App Router, TypeScript, API Store UI, seller dashboard.
- **Demo Story**: guided `/demo` page linking the full proof loop.
- **Service Registry**: typed metadata in `lib/services/registry.ts`.
- **Seller Services**: Supabase-backed listings in `store_services`, merged with the static registry for public discovery.
- **API Routes**: x402-protected service endpoints in later phases.
- **Payments**: x402/nanopayments on Arc using USDC.
- **Gateway**: balance and withdrawal flows for seller earnings.
- **Storage**: Supabase for payment events, purchases, agent runs, Agent Passports, reputation events, and dashboard data.
- **Receipts**: public audit trail derived from paid purchase steps, run metadata, service metadata, and matched payment events.
- **Wallet UX**: browser wallet connect, Arc Testnet balance display, and explicit user-confirmed testnet funding actions.
- **Agent**: local buyer-agent script with service selection, x402 payment flow, spending policy, and purchase reasoning log.

Suggested future structure:

```txt
app/
  page.tsx
  demo/
    page.tsx
  agent-control/
    page.tsx
  agent-launch/
    page.tsx
  store/
    page.tsx
  seller/
    page.tsx
    analytics/
      page.tsx
  runs/
    page.tsx
  agents/
    page.tsx
  receipts/
    page.tsx
  dashboard/
    page.tsx
  api/
    agent/
      plan/
      runs/
    receipts/
    store/
      quote/
      market/
      analyze/
      weather/
      agent-task/

lib/
  services/
  x402/
  gateway/
  supabase/
  agent/

agent/
  buyer-agent.mts
  tools/
  prompts/

supabase/
  migrations/
```

## Development Phases

1. **Product Rebrand**: complete.
2. **API Store**: complete.
3. **Buyer Agent Reasoning + Purchase Timeline**: complete.
4. **Seller Creator Mode**: complete / active prototype.
5. **Agent Identity + Reputation Passport**: complete / active prototype.
6. **Seller Analytics + Revenue Dashboard**: complete / active prototype.
7. **Buyer Agent Control Center**: complete / active prototype.
8. **Public Commerce Receipts / Audit Trail**: complete / active prototype.
9. **UI Polish and Global Navigation**: complete / active prototype.
10. **Wallet Connect and Arc Token UX**: complete / active prototype.
11. **Wallet-Funded Agent Launch**: complete / active prototype.
12. **Demo Story / Guided Showcase**: complete / active prototype.
13. **ERC-8004 Agent Identity**: next, anchor agent identity primitives.
14. **ERC-8183 Job / Escrow Flow**: add job-based coordination, escrow, deliverables, and settlement.
15. **Public Demo / Proof Dashboard**: present live proof of purchases, settlement, API usage, reputation, and receipts.
16. **Launch Polish + Arc House Submission**: refine demo quality, narrative, and submission materials.

## Built on Arc Nanopayments

This project is built on top of the official Arc Nanopayments sample app and expands it into an API Store / Agent Commerce use case.

The original sample demonstrates the core payment primitives: x402-protected endpoints, a seller app, buyer-agent payment flow, Circle Gateway balance and withdrawal flows, and payment tracking.

Arc Agent Commerce keeps those primitives as the foundation and shifts the product direction toward:

- multiple paid API services
- a browsable API Store
- service metadata and categories
- buyer-agent reasoning
- spending policy controls
- seller analytics for agent purchases

The goal is not to hide the original sample, but to preserve attribution and show a new product direction for agentic commerce on Arc.

## Local Development

```bash
npm install
npm run dev
```

Then open:

- `http://localhost:3000`
- `http://localhost:3000/demo`
- `http://localhost:3000/agent-control`
- `http://localhost:3000/agent-launch`
- `http://localhost:3000/store`
- `http://localhost:3000/seller`
- `http://localhost:3000/seller/analytics`
- `http://localhost:3000/runs`
- `http://localhost:3000/agents`
- `http://localhost:3000/receipts`
- `http://localhost:3000/dashboard`

Useful checks:

```bash
npm run lint
npm run build
```

## Environment

Copy `.env.example` to `.env.local` when local configuration is needed. Never commit `.env`, `.env.local`, private keys, Circle API keys, entity secrets, wallet secrets, or bearer tokens.

Agent runner examples:

```bash
npm run agent -- --task "Prepare a market context report" --limit 0.05
AGENT_PRIVATE_KEY=0x... AGENT_SKIP_FUNDING=1 AGENT_SKIP_DEPOSIT=1 npm run agent -- --task "Create a small proof of agent commerce" --limit 0.001
```

For the guided sentiment/tone demo:

```bash
AGENT_MAX_IN_FLIGHT=1 npm run agent -- --task "Analyze tone and sentiment for a short builder update" --limit 0.005
```

After a run completes, open `/demo` for the guided proof path, `/runs` for the public timeline, `/agents` or `/agents/<wallet>` for the Agent Passport, and `/receipts` or `/receipts/<paid-step-id>` for shareable commerce receipts.

## Status

Early builder prototype. The project now has a marketplace-style API Store, public service discovery, service detail pages, buyer-agent reasoning timelines, seller-created mock services, public Agent Passports, seller analytics, public commerce receipts, browser wallet visibility/funding UX, and a guided demo story while preserving the upstream x402, Gateway, Supabase payment events, withdrawal, and payment verification layers.
