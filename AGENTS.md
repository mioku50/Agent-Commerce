# Agent-Commerce — Codex Instructions

This repository is building **Arc Agent Commerce / API Store Demo**.

The project is an x402-powered API Store where AI agents can discover paid services, pay with USDC on Arc, and receive API responses instantly.
## Required MCP usage

Before starting any Arc-specific development task, verify that the Arc Docs MCP server is available.

Arc Docs MCP:
- name: `arc-docs`
- URL: `https://docs.arc.io/mcp`

The Arc Docs MCP server must be used for Arc-specific facts, APIs, contract addresses, standards, and developer flows.

Before implementing a phase, run or confirm:
- `codex mcp list`
- `codex mcp show arc-docs`

If MCP is not available, stop and report the issue before making Arc-specific implementation decisions.

Use the local `docs.md` only as fallback context, but prefer live Arc Docs MCP when available.
## Use these skills when relevant

Before making changes related to Arc, Circle, USDC, Gateway, x402, agent wallets, or payments, use the local Circle/Arc skills from `.agents/skills`.

Most relevant skills:

- `use-arc`
- `use-usdc`
- `use-gateway`
- `use-agent-wallet`
- `pay-via-agent-wallet`
- `fund-agent-wallet`
- `agent-wallet-policy`
- `use-smart-contract-platform`
- `use-developer-controlled-wallets`

## Use MCP docs

Use the Arc Docs MCP server for Arc-specific documentation:

- `arc-docs`
- URL: `https://docs.arc.io/mcp`

Use Circle MCP for current Circle SDK/API details:

- `circle`
- URL: `https://api.circle.com/v1/codegen/mcp`

## Project direction

This is not a simple reskin of the official Arc Nanopayments demo.

The goal is to expand the official sample into an API Store / Agent Commerce product direction:

- multiple paid API services
- service registry
- x402-protected endpoints
- AI buyer-agent
- USDC payment flow
- Gateway / Nanopayments balance
- seller analytics dashboard
- purchase reasoning log
- spending policy for the agent

## Safety rules

- Never commit `.env`.
- Never expose private keys, Circle API keys, entity secrets, wallet secrets, or bearer tokens.
- Do not rewrite payment, Gateway, x402, or Supabase logic unless the task explicitly asks for it.
- Prefer small, reviewable changes.
- After each phase, run lint/build if available.
