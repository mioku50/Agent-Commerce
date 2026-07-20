# Codex Gemini Golova-Ruki

Project-local multi-model workflow for Agent-Commerce.

## Roles

- **Head:** Codex authenticated through the user's ChatGPT subscription and configured by `~/.codex/config.toml`
- **Hands:** `Gemini 3.1 Pro (High)` through Antigravity CLI

Every Gemini process is launched with:

```text
--dangerously-skip-permissions
```

## Start the Codex head

```bash
npm run codex:head
```

Then activate `codex-gemini-golova-ruki` and give Codex the task.

## Create a run workspace

```bash
npm run codex:run:new -- my-task
```

The command prints a directory such as:

```text
.agent-runs/20260720T120000Z-my-task
```

`.agent-runs/` is ignored by Git.

## Launch Gemini workers

```bash
npm run codex:worker -- scout \
  .agent-runs/<run>/scout-prompt.md \
  .agent-runs/<run>/scout-report.md

npm run codex:worker -- executor \
  .agent-runs/<run>/executor-prompt.md \
  .agent-runs/<run>/executor-report.md

npm run codex:worker -- verifier \
  .agent-runs/<run>/verifier-prompt.md \
  .agent-runs/<run>/verifier-report.md

npm run codex:worker -- reviewer \
  .agent-runs/<run>/reviewer-prompt.md \
  .agent-runs/<run>/reviewer-report.md
```

## Pipeline

```text
fresh Gemini scout
→ Codex issue-spec
→ fresh Gemini executor
→ fresh Gemini DoD verifier
→ fresh Gemini adversarial reviewer
→ Codex final acceptance
```

Only the executor may modify implementation files. Scout, verifier, and reviewer must remain read-only. Codex owns unresolved decisions and the final verdict.

## Codex model

The launcher intentionally does not hardcode a model. It uses the user's active Codex configuration, so the head follows the model and reasoning settings already available through the user's ChatGPT subscription.

## Warning

`--dangerously-skip-permissions` auto-approves Antigravity tool permissions. The skill and wrapper therefore enforce repository-only operation, secret protection, dirty-tree preservation, no destructive Git commands, and no push/deploy/transaction actions without explicit user instruction.
