#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat >&2 <<'EOF'
Usage:
  agy-worker.sh <scout|executor|verifier|reviewer> <prompt-file> [report-file]

Examples:
  agy-worker.sh scout .agent-runs/run/scout-prompt.md .agent-runs/run/scout-report.md
  agy-worker.sh executor .agent-runs/run/executor-prompt.md .agent-runs/run/executor-report.md
EOF
}

if [[ $# -lt 2 || $# -gt 3 ]]; then
  usage
  exit 2
fi

ROLE="$1"
PROMPT_FILE="$2"
REPORT_FILE="${3:-}"

case "$ROLE" in
  scout|executor|verifier|reviewer) ;;
  *)
    echo "Error: unsupported role '$ROLE'." >&2
    usage
    exit 2
    ;;
esac

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$REPO_ROOT"

if ! command -v agy >/dev/null 2>&1; then
  echo "Error: agy is not available on PATH." >&2
  exit 127
fi

if [[ ! -f "$PROMPT_FILE" ]]; then
  echo "Error: prompt file not found: $PROMPT_FILE" >&2
  exit 2
fi

PROMPT_ABS="$(realpath "$PROMPT_FILE")"
case "$PROMPT_ABS" in
  "$REPO_ROOT"/*) ;;
  *)
    echo "Error: prompt file must be inside the repository." >&2
    exit 2
    ;;
esac

if [[ -z "$REPORT_FILE" ]]; then
  mkdir -p .agent-runs
  REPORT_FILE=".agent-runs/$(date -u +%Y%m%dT%H%M%SZ)-${ROLE}-report.md"
fi

mkdir -p "$(dirname "$REPORT_FILE")"
REPORT_ABS="$(realpath -m "$REPORT_FILE")"
case "$REPORT_ABS" in
  "$REPO_ROOT"/*) ;;
  *)
    echo "Error: report file must be inside the repository." >&2
    exit 2
    ;;
esac

MODEL="Gemini 3.1 Pro (High)"
TIMEOUT="${AGY_PRINT_TIMEOUT:-30m}"

case "$ROLE" in
  scout)
    ROLE_RULES=$(cat <<'EOF'
You are a fresh Gemini repository scout.
Operate read-only even though tool permissions are auto-approved.
Do not edit, create, delete, rename, commit, push, install dependencies, mutate GitHub, or make product decisions.
Return objective facts with file:line coordinates, relevant contracts, current-diff observations, risks, checks, and unknowns.
EOF
)
    ;;
  executor)
    ROLE_RULES=$(cat <<'EOF'
You are a fresh Gemini coding executor.
Work strictly from the supplied issue-spec and preserve unrelated dirty-tree changes.
Do not make unresolved product or architecture decisions. Stop and report contradictions.
Never read or expose secrets. Never reset or clean the repository. Never push, deploy, publish, send transactions, or mutate production unless the issue-spec contains the user's explicit instruction for that exact action.
Run the required checks and return changed files, checks, commits, deviations, and noticed-but-untouched items.
EOF
)
    ;;
  verifier)
    ROLE_RULES=$(cat <<'EOF'
You are a fresh Gemini DoD verifier.
Operate read-only even though tool permissions are auto-approved.
Read the issue-spec and current diff, run allowed checks, and verify every DoD item independently.
Do not edit code, repair failures, commit, push, install dependencies, or make product decisions.
Return passed, failed, or not verifiable for every criterion with concrete evidence.
EOF
)
    ;;
  reviewer)
    ROLE_RULES=$(cat <<'EOF'
You are a fresh Gemini adversarial reviewer.
Operate read-only even though tool permissions are auto-approved.
Inspect the issue-spec and current diff for security, payment/accounting, x402, Gateway, wallet, Arc proof, Supabase, idempotency, replay, race-condition, partial-failure, scope-creep, testing, and misleading-claim risks.
Do not edit code, repair findings, commit, push, install dependencies, or make product decisions.
Return prioritized findings with file:line evidence and a clear severity.
EOF
)
    ;;
esac

TASK_PROMPT="$(cat "$PROMPT_FILE")"
COMBINED_PROMPT=$(cat <<EOF
Working directory: $REPO_ROOT
Role: $ROLE
Model contract: Gemini 3.1 Pro (High) hands for the Opus-Gemini Golova-Ruki workflow.

$ROLE_RULES

Repository-wide non-negotiable rules:
- Never read, print, copy, or expose .env files, private keys, wallet secrets, API keys, bearer tokens, cookies, seed phrases, or signing material.
- Never use git reset --hard or git clean -fd.
- Never touch files outside the repository.
- Preserve unrelated existing changes.
- Use relevant local skills under .agents/skills and required MCP documentation for Arc/Circle/payment facts.

Task:
$TASK_PROMPT
EOF
)

{
  printf '# Gemini %s report\n\n' "$ROLE"
  printf '_Model: %s_\n\n' "$MODEL"
  printf '_Generated: %s_\n\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)"

  agy \
    --dangerously-skip-permissions \
    --model "$MODEL" \
    --print-timeout "$TIMEOUT" \
    --print "$COMBINED_PROMPT"
} | tee "$REPORT_FILE"
