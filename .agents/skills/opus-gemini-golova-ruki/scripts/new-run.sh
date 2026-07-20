#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "Usage: new-run.sh <task-slug>" >&2
  exit 2
fi

RAW_SLUG="$1"
SLUG="$(printf '%s' "$RAW_SLUG" | tr '[:upper:]' '[:lower:]' | sed -E 's/[^a-z0-9]+/-/g; s/^-+//; s/-+$//')"

if [[ -z "$SLUG" ]]; then
  echo "Error: task slug contains no usable characters." >&2
  exit 2
fi

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$REPO_ROOT"

RUN_ID="$(date -u +%Y%m%dT%H%M%SZ)-$SLUG"
RUN_DIR=".agent-runs/$RUN_ID"
mkdir -p "$RUN_DIR"

cat > "$RUN_DIR/request.md" <<'EOF'
# User request

Paste the exact user request here.
EOF

cat > "$RUN_DIR/scout-prompt.md" <<EOF
# Scout task

Read the user request at:
$RUN_DIR/request.md

Investigate only the repository areas necessary to let the Opus head write a complete issue-spec.
Return facts, relevant files, exact contracts, current-diff observations, risks, checks, and unknowns with file:line coordinates.
Do not edit anything.
EOF

cat > "$RUN_DIR/issue-spec.md" <<'EOF'
# Task title

## Goal

## Context

## Resolved decisions

## Exact contracts

## Implementation steps

## Boundaries

## Security and payment invariants

## DoD

## Required checks

## Commit plan
EOF

cat > "$RUN_DIR/executor-prompt.md" <<EOF
# Executor task

Implement only the accepted issue-spec at:
$RUN_DIR/issue-spec.md

Before editing, inspect git status, git diff, and the current branch. Preserve unrelated work. Run the required checks. Do not push.
EOF

cat > "$RUN_DIR/verifier-prompt.md" <<EOF
# DoD verification task

Verify the implementation against:
$RUN_DIR/issue-spec.md

Inspect the current diff and execute the required checks. Do not edit code. Return a verdict for every DoD item with evidence.
EOF

cat > "$RUN_DIR/reviewer-prompt.md" <<EOF
# Adversarial review task

Review the implementation against:
$RUN_DIR/issue-spec.md

Inspect the current diff for security, payment/accounting, x402, Gateway, wallet, Arc proof, Supabase, idempotency, replay, concurrency, partial-failure, scope, testing, and misleading-claim risks. Do not edit code.
EOF

for file in scout-report.md executor-report.md verifier-report.md reviewer-report.md acceptance.md; do
  : > "$RUN_DIR/$file"
done

cat > "$RUN_DIR/STATE.md" <<EOF
# Run state

- Run: $RUN_ID
- Status: created
- Active phase: scout preparation
- Head model: Claude Opus 4.6 (Thinking)
- Worker model: Gemini 3.1 Pro (High)
- Permission mode: --dangerously-skip-permissions for every agy process
- Push status: not pushed
EOF

printf '%s\n' "$RUN_DIR"
