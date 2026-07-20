# Agent-Commerce — Agent Instructions

Agent-Commerce is a workflow-first hosted agent commerce and verification layer on Arc Testnet.

The primary product is not a generic API marketplace demo. A user selects a workflow, submits real non-sensitive input, receives an immutable quote, uses sponsored quota or confirms one workflow-level USDC payment, and receives a Final Report, aggregate workflow receipt, and Arc proof trail after the hosted agent purchases allowlisted x402 services.

Legacy API Store, Agent Launch, Agent Setup, and local CLI surfaces remain available under Developer Tools.

## Required orchestration workflow

For non-trivial development, use the project skill:

```text
.agents/skills/opus-gemini-golova-ruki/SKILL.md
```

Role split:

```text
Claude Opus 4.6 (Thinking)
= head
= decisions
= issue-spec
= final acceptance

Gemini 3.1 Pro (High)
= fresh scout
= coding executor
= CLI / git / gh
= tests and commits
= fresh DoD verifier
= fresh adversarial reviewer
```

Canonical pipeline:

```text
fresh Gemini scout
→ Opus issue-spec
→ fresh Gemini executor
→ fresh Gemini DoD verifier
→ fresh Gemini adversarial reviewer
→ Opus final acceptance
```

The final verdict always belongs to Opus.

All Antigravity processes in this workflow must be launched through the repository commands:

```bash
npm run agy:head
npm run agy:worker -- <scout|executor|verifier|reviewer> <prompt-file> [report-file]
npm run agy:run:new -- <task-slug>
```

The launchers always include:

```text
--dangerously-skip-permissions
```

Do not bypass the wrappers or remove that flag in this workflow.

Because permissions are auto-approved, every agent must still obey the repository safety rules below.

## Required MCP usage

Before Arc-specific development, verify that the Arc Docs MCP server is available.

Arc Docs MCP:

- name: `arc-docs`
- URL: `https://docs.arc.io/mcp`

Use Arc Docs MCP for current Arc-specific facts, APIs, contract addresses, standards, and developer flows.

Use Circle MCP for current Circle SDK and API details:

- name: `circle`
- URL: `https://api.circle.com/v1/codegen/mcp`

If required live documentation is unavailable, stop and report the limitation before making Arc-, Circle-, payment-, or contract-specific decisions. Local `docs.md` is fallback context only.

## Local skills

Before changing Arc, Circle, USDC, Gateway, x402, agent-wallet, payment, or contract behavior, use the relevant skills under `.agents/skills`.

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

## Product invariants

Preserve these boundaries unless the accepted issue-spec explicitly changes them:

- browser-hosted workflow execution is the primary product;
- the user sees one immutable workflow quote before checkout;
- sponsored authorization and paid checkout remain separate paths;
- user payment accounting remains separate from downstream x402 provider payments;
- downstream purchases use the project-owned hosted payer;
- service selection stays allowlisted and budget-bounded;
- idempotency, cooldown, rate limiting, and active-job controls remain enforced;
- successful provider calls remain linked to receipts, reports, passports, seller analytics, and Arc proofs;
- deterministic fallback remains valid when optional LLM synthesis fails;
- public surfaces never persist full prompts, secrets, authorization headers, raw provider errors, or raw provider payloads;
- Arc is testnet-only and contracts are not presented as audited.

## Safety rules

Even with `--dangerously-skip-permissions`, agents must never:

- read, print, copy, commit, or expose `.env`, `.env.*`, private keys, wallet secrets, Circle keys, entity secrets, bearer tokens, cookies, seed phrases, or signing material;
- run `git reset --hard`, `git clean -fd`, destructive database commands, destructive contract operations, or mass deletion;
- push, force-push, merge, deploy, publish, send transactions, fund wallets, or mutate production without the user's explicit instruction for that exact action;
- edit outside the repository;
- overwrite unrelated dirty-tree work;
- install dependencies unless the issue-spec allows it;
- rewrite payment, Gateway, x402, wallet, proof, or Supabase logic unless the issue-spec explicitly requires it.

Before implementation, run:

```bash
git status -sb
git diff --stat
git branch --show-current
```

Prefer small, reviewable changes. Run the issue-spec checks after implementation. Do not push without explicit user approval.
