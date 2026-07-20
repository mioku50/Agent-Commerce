# Opus Gemini Golova-Ruki

Project-local Antigravity CLI orchestration for Agent-Commerce.

## Models

- **Head:** `Claude Opus 4.6 (Thinking)`
- **Hands:** `Gemini 3.1 Pro (High)`

Every Antigravity process is launched with:

```text
--dangerously-skip-permissions
```

## Start the head

```bash
npm run agy:head
```

Then activate the `opus-gemini-golova-ruki` skill and give the Opus head the task.

## Create a run workspace

```bash
npm run agy:run:new -- my-task
```

The command prints a directory such as:

```text
.agent-runs/20260720T120000Z-my-task
```

`.agent-runs/` is ignored by Git.

## Launch workers

```bash
npm run agy:worker -- scout \
  .agent-runs/<run>/scout-prompt.md \
  .agent-runs/<run>/scout-report.md

npm run agy:worker -- executor \
  .agent-runs/<run>/executor-prompt.md \
  .agent-runs/<run>/executor-report.md

npm run agy:worker -- verifier \
  .agent-runs/<run>/verifier-prompt.md \
  .agent-runs/<run>/verifier-report.md

npm run agy:worker -- reviewer \
  .agent-runs/<run>/reviewer-prompt.md \
  .agent-runs/<run>/reviewer-report.md
```

## Pipeline

```text
fresh Gemini scout
→ Opus issue-spec
→ fresh Gemini executor
→ fresh Gemini DoD verifier
→ fresh Gemini adversarial reviewer
→ Opus final acceptance
```

The executor may edit. Scout, verifier, and reviewer are instructed to remain read-only. The Opus head owns all unresolved decisions and the final verdict.

## Warning

`--dangerously-skip-permissions` auto-approves tool permissions. The skill and launchers therefore enforce repository-only operation, secret protection, dirty-tree preservation, no destructive Git commands, and no push/deploy/transaction actions without explicit user instruction.
