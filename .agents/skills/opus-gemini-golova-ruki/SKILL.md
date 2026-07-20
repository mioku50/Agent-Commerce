---
name: opus-gemini-golova-ruki
description: Multi-model Antigravity CLI workflow for Agent-Commerce. Claude Opus 4.6 is the head that makes decisions, writes the issue-spec, and performs final acceptance. Fresh Gemini 3.1 Pro workers scout the repository, implement, verify DoD, and run adversarial review. Every Antigravity CLI process is launched through repository wrappers with --dangerously-skip-permissions.
metadata:
  category: methodology
  project: Agent-Commerce
---

# Opus Gemini Golova-Ruki

Use this skill for every non-trivial development task in Agent-Commerce when the user wants the multi-model Antigravity workflow.

## Role map

```text
Claude Opus 4.6 (Thinking)
= Голова
= understands the goal
= resolves product, architecture, UX, security, and scope decisions
= writes the self-contained issue-spec
= accepts, rejects, or blocks the result

Gemini 3.1 Pro (High)
= Руки
= fresh repository scout
= coding executor
= CLI / git / gh operator
= tests and build
= fresh DoD verifier
= fresh adversarial reviewer
```

The final verdict always belongs to the Opus head. A Gemini report is evidence, not acceptance.

## Mandatory launcher policy

All Antigravity processes for this workflow MUST be launched through the repository wrappers:

```bash
npm run agy:head
npm run agy:worker -- <role> <prompt-file> [report-file]
```

Every wrapper invocation includes:

```text
--dangerously-skip-permissions
```

Do not launch a head or worker with a raw `agy` command from this workflow. Do not remove, override, or conditionally omit the dangerous-permissions flag.

This flag auto-approves tool permissions. Therefore the workflow boundaries below are mandatory even though the harness will not ask for confirmation.

## Hard safety boundaries

No agent may:

- read, print, copy, commit, or expose `.env`, `.env.*`, private keys, wallet secrets, API keys, bearer tokens, cookies, seed phrases, or signing material;
- run `git reset --hard`, `git clean -fd`, destructive database commands, destructive contract operations, or mass deletion;
- push, force-push, merge, deploy, publish packages, send transactions, fund wallets, or mutate production without the user's explicit instruction for that exact action;
- edit outside the current repository;
- rewrite payment, Circle Gateway, x402, wallet, proof, or Supabase logic unless the issue-spec explicitly requires it;
- install dependencies unless the issue-spec allows it;
- combine unrelated work into the same commit.

Before any implementation, inspect:

```bash
git status -sb
git diff --stat
git branch --show-current
```

If the tree is dirty, preserve existing work. Never reset, clean, stash, or rewrite unrelated changes without an explicit head decision.

## Canonical pipeline

```text
fresh Gemini scout
→ Opus issue-spec
→ fresh Gemini executor
→ fresh Gemini DoD verifier
→ fresh Gemini adversarial reviewer
→ Opus final acceptance
→ next issue
```

Use fresh Gemini sessions for every role. Never reuse the executor context as verifier or reviewer.

Work sequentially when files overlap. Parallel work is allowed only when the Opus head explicitly confirms disjoint file ownership.

## Run directory

Every task uses an ignored local run directory:

```text
.agent-runs/<timestamp>-<task-slug>/
```

Create it with:

```bash
npm run agy:run:new -- <task-slug>
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

The issue-spec is the source of truth for implementation. Reports are evidence for the head.

## 1. Head preflight

The Opus head must:

1. identify the active run directory;
2. read the user's request;
3. inspect `git status -sb`, `git diff --stat`, and the current branch;
4. determine whether Arc/Circle/x402/payment skills or MCP are required;
5. write a narrow scout prompt;
6. launch a fresh Gemini scout through the worker wrapper.

The Opus head must not deeply read the entire repository or start coding before scouting and spec completion.

## 2. Fresh Gemini scout

Launch:

```bash
npm run agy:worker -- scout \
  .agent-runs/<run>/scout-prompt.md \
  .agent-runs/<run>/scout-report.md
```

Scout duties:

- read only;
- map exact files, routes, components, contracts, schemas, and data flow;
- inspect current git status and relevant diff;
- find existing patterns to reuse;
- report objective risks and unknowns with file:line coordinates;
- use relevant `.agents/skills` and required MCP documentation.

Scout prohibitions:

- no edits;
- no dependency installation;
- no commit or push;
- no product or architecture decisions;
- no broad redesign proposals unless requested as alternatives for the head.

Required report shape:

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

## 3. Opus issue-spec

After scouting, the Opus head writes `issue-spec.md`.

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

The spec must resolve forks before executor dispatch. Gemini must not be asked to choose product direction.

## 4. Fresh Gemini executor

The head writes `executor-prompt.md`, pointing to `issue-spec.md`, then launches:

```bash
npm run agy:worker -- executor \
  .agent-runs/<run>/executor-prompt.md \
  .agent-runs/<run>/executor-report.md
```

Executor duties:

- work strictly from the issue-spec;
- preserve unrelated dirty-tree changes;
- edit only in-scope files;
- run required checks;
- create focused conventional commits only when the spec requests commits;
- never push without explicit user instruction;
- stop and report when repository reality contradicts the spec.

Executor report:

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
npm run agy:worker -- verifier \
  .agent-runs/<run>/verifier-prompt.md \
  .agent-runs/<run>/verifier-report.md
```

Verifier rules:

- read the issue-spec and current diff;
- run the specified checks;
- verify every DoD item independently;
- do not edit code;
- do not repair failures;
- return `passed`, `failed`, or `not verifiable` for each item.

## 6. Fresh Gemini adversarial reviewer

Launch another fresh Gemini context:

```bash
npm run agy:worker -- reviewer \
  .agent-runs/<run>/reviewer-prompt.md \
  .agent-runs/<run>/reviewer-report.md
```

The reviewer looks for:

- security regressions;
- leaked secrets or unsafe logging;
- payment/accounting inconsistencies;
- x402, Gateway, wallet, Arc proof, or Supabase regressions;
- race conditions, replay/idempotency issues, and partial-failure paths;
- hidden scope creep;
- untested behavior;
- misleading UI or documentation claims.

The reviewer does not edit code.

## 7. Rework

When verification fails:

1. Opus evaluates each finding.
2. Opus updates the issue-spec when a decision or contract changes.
3. Send concrete accepted findings to a fresh Gemini executor.
4. Re-run a fresh verifier and fresh reviewer.
5. Stop after two failed rework cycles and mark the task blocked unless the user directs another attempt.

## 8. Final acceptance

Only Opus writes `acceptance.md`.

Required verdict:

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

Opus must not accept merely because the executor says the task is complete.

## Agent-Commerce domain requirements

For Arc, Circle, USDC, Gateway, x402, wallets, smart contracts, or payments:

- use the matching local skills under `.agents/skills`;
- use Arc Docs MCP and Circle MCP when available;
- preserve the workflow-first hosted product direction;
- keep user checkout accounting separate from downstream provider payments;
- preserve idempotency, spending caps, allowlists, receipt linkage, and proof registration;
- never claim production safety or audit status that the project does not have.

## Starting the workflow

From the repository root:

```bash
npm run agy:head
```

Then activate this skill and ask the Opus head to create a run directory and execute the canonical pipeline.
