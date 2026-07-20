---
name: opus-gemini-hands
description: "Antigravity CLI orchestration for Agent-Commerce. Claude Opus 4.6 is the head that resolves decisions, writes the issue-spec, and performs final acceptance. Fresh Gemini 3.1 Pro High workers do scouting, implementation, tests, commits, DoD verification, and adversarial review. Use for non-trivial repository work that benefits from strict model routing and independent verification."
---

# Opus Gemini Hands

Use this skill only in an Antigravity CLI session running:

```text
Claude Opus 4.6 (Thinking)
```

The worker model is always:

```text
Gemini 3.1 Pro (High)
```

## Role map

```text
Claude Opus 4.6
= head
= goal interpretation
= product / architecture / UX decisions
= issue-spec
= conflict resolution
= final acceptance

Fresh Gemini 3.1 Pro High
= read-only scout
= repository reading
= implementation
= file edits
= git / gh / CLI
= lint / build / tests
= commit
= fresh DoD verifier
= fresh adversarial reviewer
```

Opus is the head. Gemini is the hands.

## Non-negotiable routing

Opus must not:

- deeply read the whole repository when a scout can collect the facts;
- implement production code;
- perform routine file edits, git mechanics, tests, or commits;
- accept the executor report as proof of completion;
- delegate unresolved product or architecture decisions to Gemini.

Gemini workers must not:

- change product direction or architecture without a resolved decision in the spec;
- expand scope beyond the spec;
- push to a remote;
- expose, print, copy, or commit secrets;
- modify `.env*`, private keys, wallet secrets, Circle credentials, entity secrets, or bearer tokens;
- rewrite payment, Gateway, x402, Arc, wallet, or Supabase logic unless the issue-spec explicitly requires it.

Do not use one Gemini context for more than one independent role. Scout, executor, verifier, and reviewer must be fresh `agy -p` sessions.

## Pipeline

```text
Gemini read-only scout
→ Opus resolves decisions
→ Opus writes issue-spec
→ fresh Gemini executor
→ fresh Gemini DoD verifier
→ fresh Gemini adversarial reviewer
→ Opus final acceptance
→ next issue
```

Work sequentially when roles may touch or inspect the same files. Never run two write-capable workers against the same working tree at the same time.

## Run directory

Every task receives a unique run directory:

```text
.agent-runs/<YYYYMMDD-HHMMSS>-<short-task-name>/
```

The run directory contains:

```text
scout-task.md
scout-report.md
issue-spec.md
executor-report.md
verifier-report.md
reviewer-report.md
acceptance.md
```

Transient run directories are ignored by git. The launcher and documentation remain tracked.

## 1. Preflight

Before dispatching a worker, Opus asks the current session to run only the minimal repository-state checks:

```bash
git status -sb
git diff --stat
git branch --show-current
```

If the tree is dirty:

- do not reset;
- do not clean;
- do not overwrite unrelated work;
- identify which changes belong to the current task;
- keep the issue-spec explicit about pre-existing changes;
- ask the user before stashing or creating a WIP commit.

Before the first worker dispatch in a session, confirm that both models are available:

```bash
agy models
```

Expected names:

```text
Claude Opus 4.6 (Thinking)
Gemini 3.1 Pro (High)
```

## 2. Scout

Opus writes a narrow investigation request to:

```text
.agent-runs/<run-id>/scout-task.md
```

Good scout questions:

- map the exact files involved in one feature;
- locate existing patterns that implementation should reuse;
- identify contracts, routes, schemas, props, and data flow;
- inspect the current diff for objective regressions;
- determine the exact checks already available in the repository.

Avoid broad prompts such as “study the whole repository.”

Dispatch:

```bash
bash .agent-runs/bin/run-gemini-worker.sh scout \
  .agent-runs/<run-id>/scout-task.md \
  <run-id>
```

Scout report requirements:

```markdown
## Facts
- file:line — fact

## Relevant files
- path — why it matters

## Contracts
- exact route / function / type / schema / data shape

## Checks
- command → result

## Risks
- file:line — objective risk

## Unknowns
- what could not be verified and why
```

Scout recommendations are not decisions. Opus re-evaluates the facts.

## 3. Issue-spec

Opus writes the source of truth to:

```text
.agent-runs/<run-id>/issue-spec.md
```

The spec must contain:

```markdown
# <Task title>

## Goal
One sentence describing the completed user-visible result.

## Context
Relevant files, existing behavior, pre-existing diff, and constraints.

## Resolved decisions
- Decision → rationale.

## Contracts
Exact routes, functions, types, schemas, events, props, and data formats.

## Implementation steps
1. File-specific step.
2. File-specific step.

## Boundaries
What must not be changed.

## Safety
Secrets, payment, wallet, x402, Arc, Circle, Supabase, and network constraints.

## DoD
- Observable result.
- Required checks.
- Failure conditions.

## Commit
Conventional commit message to use after checks pass.
```

The executor must be able to implement from the issue-spec without repeating broad repository research.

## 4. Executor

Dispatch a fresh Gemini worker using the issue-spec as its task file:

```bash
bash .agent-runs/bin/run-gemini-worker.sh executor \
  .agent-runs/<run-id>/issue-spec.md \
  <run-id>
```

Executor rules:

- read `AGENTS.md` first;
- use relevant `.agents/skills/*/SKILL.md` files;
- work strictly within the issue-spec;
- stop and report if repository reality contradicts the spec;
- do not touch unrelated files;
- do not install dependencies unless the spec and user explicitly allow it;
- run the DoD checks in the specified order;
- commit only after required checks pass;
- use the exact conventional commit message from the spec;
- never push.

Executor report requirements:

```markdown
## Changed files
- path — change

## Checks
- command → result

## Commit
- sha / message, or why no commit was created

## Deviations
- none, or exact discrepancy

## Noticed but did not touch
- objective observation
```

## 5. Fresh DoD verifier

Dispatch a new Gemini context:

```bash
bash .agent-runs/bin/run-gemini-worker.sh verifier \
  .agent-runs/<run-id>/issue-spec.md \
  <run-id>
```

The verifier must:

- read the issue-spec;
- inspect repository state and the relevant diff or commit;
- run available DoD checks;
- verify every DoD item;
- make no code changes;
- return one verdict: `passed`, `failed`, or `not verifiable`.

A truthful `not verifiable` is better than a false green result.

## 6. Fresh adversarial reviewer

Dispatch another new Gemini context:

```bash
bash .agent-runs/bin/run-gemini-worker.sh reviewer \
  .agent-runs/<run-id>/issue-spec.md \
  <run-id>
```

The reviewer searches for:

- security regressions;
- payment or wallet boundary violations;
- x402 / Arc / Circle mistakes;
- broken error handling;
- hidden assumptions;
- missing tests;
- accidental scope expansion;
- unrelated files in the commit;
- secrets or generated artifacts;
- UX and API contract regressions.

The reviewer does not edit code.

## 7. Rework

If verification or review fails:

1. Opus decides which findings are valid.
2. Opus writes a focused `rework-spec.md` inside the same run directory.
3. Dispatch a fresh Gemini executor with that rework spec.
4. Repeat fresh verification and fresh adversarial review.
5. Stop after two failed rework loops and report the blocker to the user.

Do not let Gemini decide whether a finding changes product direction. That decision belongs to Opus.

## 8. Final acceptance

Only Opus performs final acceptance.

Opus reads:

- issue-spec;
- executor report;
- verifier report;
- reviewer report;
- final git status and diff summary.

Opus writes:

```text
.agent-runs/<run-id>/acceptance.md
```

Acceptance format:

```markdown
# Acceptance

## Verdict
accepted / rejected / blocked

## Evidence
- DoD item → evidence

## Residual risks
- risk or none

## Repository state
- branch
- commit
- push status

## Next step
- one concrete next action
```

An executor commit is not accepted until Opus explicitly returns `accepted`.

## 9. Git and GitHub safety

- Never run `git reset --hard` or `git clean -fd` without explicit user approval.
- Never push without explicit user approval.
- Never commit `.env*`, keys, secrets, local database dumps, generated traces, or unrelated artifacts.
- Use small conventional commits.
- Do not use `fixes #N` or `closes #N` before the verifier and reviewer pass.
- `gh` mutations must be explicitly required by the issue-spec.

## 10. Agent-Commerce checks

Use checks that already exist in the repository. Preferred order:

1. targeted unit tests;
2. TypeScript/typecheck;
3. lint;
4. build;
5. broader tests;
6. manual checklist;
7. browser/E2E only when already configured and relevant.

For Arc-specific work, follow `AGENTS.md`: verify Arc Docs MCP availability and use the local Circle/Arc skills.

## 11. Permissions

Workers are launched with Antigravity terminal sandboxing enabled. Do not add `--dangerously-skip-permissions` by default.

The launcher supports explicit opt-in only:

```bash
AGY_DANGEROUS_AUTO_APPROVE=1 \
  bash .agent-runs/bin/run-gemini-worker.sh executor <spec> <run-id>
```

This auto-approves tool requests and must only be used after the user has configured a restrictive permission policy and understands the risk.

## 12. User communication

Keep status updates compact:

```text
done
in progress
blocked
next
```

Do not paste entire worker reports into chat. Give Opus’s decision and the most important evidence.