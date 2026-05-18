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
| Weather Signal | `/api/store/weather` | 0.002 USDC | Mock weather insight |
| Agent Task | `/api/premium/agent-task` | 0.03 USDC | Multi-step task for a buyer agent |

The current service registry is metadata-first. It maps to existing premium x402 endpoints where safe and leaves store-native routes for later phases. Existing premium endpoints are intentionally retained.

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

This phase focuses on product identity and initial structure:

- Arc Agent Commerce naming and metadata
- README v0
- landing page
- metadata-only service registry
- basic `/store` route
- light dashboard wording

This phase intentionally avoids deep changes to payment verification, Gateway balance, withdrawal, x402 middleware, or Supabase persistence.

## Architecture

Planned architecture:

- **Frontend**: Next.js App Router, TypeScript, API Store UI, seller dashboard.
- **Service Registry**: typed metadata in `lib/services/registry.ts`.
- **API Routes**: x402-protected service endpoints in later phases.
- **Payments**: x402/nanopayments on Arc using USDC.
- **Gateway**: balance and withdrawal flows for seller earnings.
- **Storage**: Supabase for payment events, purchases, agent runs, and dashboard data.
- **Agent**: local buyer-agent script with service selection, x402 payment flow, spending policy, and purchase reasoning log.

Suggested future structure:

```txt
app/
  page.tsx
  store/
    page.tsx
  dashboard/
    page.tsx
  api/
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

1. **Product Rebrand**: position the app as Arc Agent Commerce / API Store Demo.
2. **Service Registry**: expand service metadata and add detail pages.
3. **x402 Store Endpoints**: protect API Store routes with payment requirements.
4. **Buyer Agent**: add discovery, selection, payment, and reasoning logs.
5. **Seller Analytics**: deepen dashboard metrics for API revenue and purchases.
6. **Gateway Operations**: show nanopayments balance and withdrawal status.
7. **Spending Policy**: enforce per-request and run-level limits for the agent.

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
- `http://localhost:3000/store`
- `http://localhost:3000/dashboard`

Useful checks:

```bash
npm run lint
npm run build
```

## Environment

Copy `.env.example` to `.env.local` when local configuration is needed. Never commit `.env`, `.env.local`, private keys, Circle API keys, entity secrets, wallet secrets, or bearer tokens.

## Status

Early builder prototype. This phase updates product positioning, adds a basic API Store UI, and introduces a typed service registry while preserving the upstream x402, Gateway, Supabase, withdrawal, and payment verification layers.
