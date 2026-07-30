# Veyra

Verified workflows for people and AI agents.

Veyra lets people and autonomous agents run paid data and analysis workflows,
receive structured reports, and verify results on Arc.

[Run a workflow](https://agent-commerce-six.vercel.app/agent-runner) ·
[Browse reports](https://agent-commerce-six.vercel.app/results) ·
[Veyra Agent API](https://agent-commerce-six.vercel.app/console/agent-api)

## Flagship workflow

GitHub Project Due Diligence turns a public repository URL into an
evidence-backed report with:

- live repository, activity, release, contributor, and governance data;
- deterministic engineering-quality and adoption-risk analysis;
- a clear verdict with confidence and evidence coverage;
- JSON and Markdown export plus a shareable report URL;
- receipts and Arc Testnet proof links for paid workflow steps.

The verdict is repository-health guidance, not a security audit or investment
recommendation.

## Two product paths

People use the Public App:

```text
workflow → immutable quote → sponsored or USDC checkout → report → Arc proof
```

AI agents use Veyra Agent API v1:

```text
discover → quote → idempotent run → poll → structured report
```

The Veyra Agent API includes a typed dependency-free TypeScript SDK, normalized
errors, strict credential isolation, an OpenAPI specification, and a runnable
GitHub Due Diligence agent example.

- [Veyra Agent API guide](docs/agent-api.md)
- [TypeScript SDK](sdk/typescript)
- [Production-ready agent example](examples/machine-agent/github-due-diligence-agent.ts)
- [OpenAPI specification](public/openapi/agent-commerce-v1.json)

## Curated workflows

| Workflow | Result | Starting provider cost |
| --- | --- | ---: |
| GitHub Project Due Diligence | Repository-health verdict and evidence report | 0.002 USDC |
| Market Context Brief | Live provider-backed market snapshot | 0.0013 USDC |
| Sentiment & Tone Report | Structured sentiment and tone signals | 0.0013 USDC |
| Builder Update Summary | Delivery summary, signals, and next steps | 0.0013 USDC |

External seller commerce remains an internal capability. It is not the primary
catalog or product positioning.

## Local development

```bash
git clone https://github.com/mioku50/Agent-Commerce.git
cd Agent-Commerce
npm install
cp .env.example .env.local
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Common verification:

```bash
npm run lint
npm run machine:sdk-build
npm run github:analysis-test
npm run machine:api-test
npm run operations:test
npm run build
```

## Operations and safety

The production console aggregates execution failures, provider latency,
checkout failures, and Arc proof delays. Paid provider calls are never blindly
retried; quote/run idempotency and existing payment records are reconciled
before recovery.

Public surfaces do not publish full prompts, credentials, authorization
headers, raw provider errors, or raw provider payloads.

Veyra currently runs on Arc Testnet (`5042002`). Contracts are
experimental and are not presented as audited.

## Stack

Next.js, TypeScript, Supabase, Arc Testnet, USDC, x402, GitHub API, and Vercel.

## License and attribution

Licensed under the [Apache License 2.0](LICENSE). Redistributions and derivative
works must retain required notices and identify modified files.

The project name, original branding, logo, screenshots, and visual identity are
not licensed for reuse. Do not present a fork as the original product or imply
endorsement by its author.

Copyright © 2026 Sergio Romanov
([@mioku50](https://github.com/mioku50)).
