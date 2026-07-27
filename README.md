# Arc Agent Commerce

A workflow commerce platform where people and autonomous agents can purchase structured data and analysis workflows, receive shareable reports, and verify results on Arc Testnet.

## Live App

- [Public App](https://agent-commerce-six.vercel.app)
- [Agent Developer Console](https://agent-commerce-six.vercel.app/console)
- [Machine API documentation](https://agent-commerce-six.vercel.app/console/agent-api)

## What It Does

Arc Agent Commerce provides a public workflow marketplace for people and a Machine API for autonomous agents.

- Choose a workflow and provide real, non-sensitive input.
- Review the final workflow price before checkout.
- Pay in USDC on Arc Testnet when sponsored access is unavailable.
- Receive a structured, shareable report.
- Verify supported results through Arc verification data.
- Integrate external agents through the Machine API.

GitHub Project Due Diligence is the flagship workflow of Arc Agent Commerce. It combines live public repository data with evidence-backed analysis of project activity, maintainability, governance, releases, contributor structure, and adoption risks.

## Available Workflows

| Workflow | Purpose |
| --- | --- |
| GitHub Project Due Diligence | Repository intelligence and adoption-risk analysis |
| Market Context Brief | Provider-backed market context |
| Sentiment & Tone Report | Text sentiment and tone analysis |
| Builder Update Summary | Structured summaries of project updates |

Open the [Public App](https://agent-commerce-six.vercel.app/agent-runner) to run a workflow.

## Machine API

The Machine API lets external AI agents and automated systems:

- discover available workflows;
- create immutable quotes;
- start workflow runs;
- poll execution status;
- retrieve JSON or Markdown reports.

Reference material:

- [Machine API developer guide](docs/agent-api.md)
- [OpenAPI specification](public/openapi/agent-commerce-v1.json)

## Quick Start

```bash
git clone https://github.com/mioku50/Agent-Commerce.git
cd Agent-Commerce
pnpm install
cp .env.example .env.local
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

## Core Stack

Next.js, TypeScript, Supabase, Arc Testnet, USDC, GitHub API, and Vercel.

## Testing

```bash
pnpm lint
pnpm build
pnpm run review:smoke
pnpm run machine:api-test
```

## Testnet Notice

Arc Agent Commerce currently operates on Arc Testnet. It is experimental software and should not be treated as a production security audit or investment recommendation.

## License and Attribution

Arc Agent Commerce is licensed under the [Apache License 2.0](LICENSE). Redistributions and derivative works must retain the required license and attribution notices and identify modified files.

The Arc Agent Commerce project name, original branding, logo, screenshots, and visual identity are not licensed for reuse. Do not present a fork as the original product or imply endorsement by its author.

Copyright © 2026 Sergio Romanov ([@mioku50](https://github.com/mioku50)).
