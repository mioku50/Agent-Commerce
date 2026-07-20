---
name: codex-gemini-golova-ruki
description: Multi-model workflow for Agent-Commerce. Codex, authenticated through the user's ChatGPT subscription and configured by ~/.codex/config.toml, is the head that makes decisions, writes the issue-spec, and performs final acceptance. Fresh Gemini 3.1 Pro workers scout, implement, verify DoD, and run adversarial review through Antigravity CLI. Every Gemini worker is launched with --dangerously-skip-permissions.
metadata:
  category: methodology
  project: Agent-Commerce
---

# Codex Gemini Golova-Ruki

Use this skill for non-trivial Agent-Commerce development when Codex should be the head and Gemini 3.1 Pro should perform the hands-on work.

## Role map

```text
Codex via ChatGPT subscription
= Голова
= understands the user goal
= resolves product, architecture, UX, security, and scope decisions
= writes the self-contained issue-spec
= evaluates all evidence
= accepts, rejects, or blocks the result

Gemini 3.1 Pro (High) via Antigravity CLI
= Руки
= fresh repository scout
= coding executor
= CLI / git / gh operator
= tests and build
= fresh DoD verifier
= fresh adversarial reviewer
```

The final verdict always belongs to Codex. Gemini reports are evidence, not acceptance.

Codex uses the model and reasoning settings from the user's active Codex configuration, normally `~/.codex/config.toml`. Do not hardcode a different model unless the user explicitly requests it.

## Mandatory launchers

Start the Codex head only through:

```bash
npm run codex:head
```

Launch every Gemini worker only through:

```bash
npm run codex:worker -- <role> <prompt-file> [report-file]
```

Create the run workspace through:

```bash
npm run codex:run:new -- <task-slug>
```

Every Gemini worker invocation includes:

```text
--dangerously-skip-permissions
```

Do not launch Gemini workers with raw `agy` commands from this workflow. Do not remove, override, or conditionally omit the dangerous-permissions flag.

## Hard safety boundaries

The dangerous Antigravity permission flag auto-approves tool calls. It does not relax repository policy.

No head or worker may:

- read, print, copy, commit, or expose `.env`, `.env.*`, private keys, wallet secrets, API keys, bearer tokens, cookies, seed phrases, or signing material;
- run `git reset --hard`, `git clean -fd`, destructive database commands, destructive contract operations, or mass deletion;
- push, force-push, merge, deploy, publish packages, send transactions, fund wallets, or mutate production without the user's explicit instruction for that exact action;
- edit outside the current repository;
- overwrite, reset, stash, or reformat unrelated dirty-tree work;
- rewrite payment, Circle Gateway, x402, wallet, proof, or Supabase logic unless the accepted issue-spec explicitly requires it;
- install dependencies unless the issue-spec allows it;
- combine unrelated work into one commit.

Before implementation, inspect:

```bash
git status -sb
git diff --stat
git branch --show-current
```

If the tree is dirty, preserve existing work and record relevant changes in the run artifacts.

## Canonical pipeline

```text
fresh Gemini scout
→ Codex issue-spec
→ fresh Gemini executor
→ fresh Gemini DoD verifier
→ fresh Gemini adversarial reviewer
→ Codex final acceptance
→ next issue
```

Use a fresh Antigravity session for every Gemini role. Never reuse the executor context as verifier or reviewer.

Work sequentially when files overlap. Parallel workers are allowed only when Codex explicitly confirms disjoint file ownership.

## Run directory

Every task uses an ignored local run directory:

```text
.agent-runs/<timestamp>-<task-slug>/
```

Create it with:

```bash
npm run codex:run:new -- <task-slug>
```

The run directory contains:

```text
request.md
scout-prompt.md
scout-report.md
issue-spec.md
executor-prompt.md
executor-report.md
verifier-prompt.md
verifier-report.md
reviewer-prompt.md
reviewer-report.md
acceptance.md
STATE.md
```

`issue-spec.md` is the source of truth for implementation. Worker reports are evidence for Codex.

## 1. Codex head preflight

The Codex head must:

1. identify the active run directory;
2. read the exact user request;
3. inspect `git status -sb`, `git diff --stat`, and the current branch;
4. determine which Arc/Circle/x402/payment skills and MCP sources are required;
5. write a narrow scout prompt;
6. launch a fresh Gemini scout through the repository wrapper.

Codex should avoid deep repository reading before scout results unless a small targeted read is required to frame the scout prompt.

## 2. Fresh Gemini scout

Launch:

```bash
npm run codex:worker -- scout \
  .agent-runs/<run>/scout-prompt.md \
  .agent-runs/<run>/scout-report.md
```

Scout duties:

- remain read-only;
- map exact files, routes, components, contracts, schemas, and data flow;
- inspect current status and the relevant existing diff;
- find existing patterns to reuse;
- report objective risks and unknowns with file:line coordinates;
- use relevant `.agents/skills` and required MCP documentation.

Scout prohibitions:

- no edits, file creation, deletion, or renames;
- no dependency installation;
- no commits, pushes, GitHub mutations, deployments, or transactions;
- no product or architecture decisions.

Required scout report:

```markdown
## Facts
- file:line — fact

## Relevant files
- path — why it matters

## Contracts
- exact route / function / prop / schema / event

## Current diff
- path — relevant existing change

## Risks
- file:line — objective risk

## Checks run
- command → result

## Unknowns
- item — why it could not be verified
```

## 3. Codex issue-spec

After scouting, Codex writes `issue-spec.md`.

Required sections:

```markdown
# <Task title>

## Goal
One sentence describing the user-visible result.

## Context
Current state, relevant files, constraints, and existing changes.

## Resolved decisions
- Decision → rationale.

## Exact contracts
Routes, functions, props, schemas, events, state transitions, and data formats.

## Implementation steps
1. File-specific step.
2. File-specific step.

## Boundaries
What must not change.

## Security and payment invariants
Secrets, wallet, x402, Gateway, Supabase, proof, and transaction rules.

## DoD
Observable acceptance criteria.

## Required checks
Exact commands and expected outcomes.

## Commit plan
Files and conventional commit intent.
```

Codex must resolve forks before executor dispatch. Gemini must not be asked to choose product direction.

## 4. Fresh Gemini executor

Codex writes `executor-prompt.md`, pointing to the accepted `issue-spec.md`, then launches:

```bash
npm run codex:worker -- executor \
  .agent-runs/<run>/executor-prompt.md \
  .agent-runs/<run>/executor-report.md
```

Executor duties:

- work strictly from the issue-spec;
- preserve unrelated dirty-tree changes;
- edit only in-scope files;
- run all required checks;
- create focused conventional commits only when the spec requests commits;
- never push without explicit user instruction;
- stop and report when repository reality contradicts the spec.

Required executor report:

```markdown
## Summary

## Changed files
- path — change

## Checks
- command → result

## Commits
- sha — message

## Deviations
- none, or exact discrepancy

## Noticed but did not touch
- item
```

## 5. Fresh Gemini DoD verifier

Launch a new Gemini context:

```bash
npm run codex:worker -- verifier \
  .agent-runs/<run>/verifier-prompt.md \
  .agent-runs/<run>/verifier-report.md
```

Verifier rules:

- read the issue-spec and current diff;
- run the specified checks;
- verify every DoD item independently;
- do not edit or repair code;
- do not commit, push, deploy, install dependencies, or mutate GitHub;
- return `passed`, `failed`, or `not verifiable` for every criterion.

## 6. Fresh Gemini adversarial reviewer

Launch another fresh Gemini context:

```bash
npm run codex:worker -- reviewer \
  .agent-runs/<run>/reviewer-prompt.md \
  .agent-runs/<run>/reviewer-report.md
```

The reviewer checks for:

- security regressions and secret exposure;
- payment/accounting inconsistencies;
- x402, Gateway, wallet, Arc proof, or Supabase regressions;
- race conditions, replay/idempotency issues, and partial-failure paths;
- hidden scope creep;
- missing or misleading tests;
- misleading UI, README, deployment, audit, or production-safety claims.

The reviewer remains read-only.

## 7. Rework

When verification or review fails:

1. Codex evaluates every finding.
2. Codex updates the issue-spec only when a decision or contract changes.
3. Codex sends concrete accepted findings to a fresh Gemini executor.
4. Run a fresh verifier and fresh reviewer again.
5. Stop after two failed rework cycles and mark the task blocked unless the user directs another attempt.

## 8. Final acceptance

Only Codex writes `acceptance.md`.

Required shape:

```markdown
# Acceptance

## Verdict
accepted | rejected | blocked

## Evidence
- verifier fact
- reviewer fact
- command result

## Remaining risks
- risk or none

## Repository state
- branch
- commit(s)
- push status

## Next step
- one concrete next action
```

Codex must inspect the issue-spec, current diff, executor report, verifier report, reviewer report, and relevant command evidence before accepting.

## Agent-Commerce domain requirements

For Arc, Circle, USDC, Gateway, x402, wallets, contracts, payments, or proof registration:

- use matching skills under `.agents/skills`;
- use Arc Docs MCP and Circle MCP when available;
- preserve the workflow-first hosted product direction;
- keep user checkout accounting separate from downstream provider payments;
- preserve idempotency, spending caps, allowlists, receipt linkage, and proof registration;
- never claim production safety or audit status the project does not have.

## Starting the workflow

From the repository root:

```bash
npm run codex:head
```

Then activate `codex-gemini-golova-ruki`, create a run directory, and execute the canonical pipeline.
