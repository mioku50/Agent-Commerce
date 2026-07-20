#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$REPO_ROOT"

if ! command -v agy >/dev/null 2>&1; then
  echo "Error: agy is not available on PATH." >&2
  exit 127
fi

MODEL="Claude Opus 4.6 (Thinking)"

exec agy \
  --dangerously-skip-permissions \
  --model "$MODEL" \
  "$@"
