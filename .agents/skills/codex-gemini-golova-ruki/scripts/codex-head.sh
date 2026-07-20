#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$REPO_ROOT"

if ! command -v codex >/dev/null 2>&1; then
  echo "Error: codex is not available on PATH." >&2
  exit 127
fi

if [[ ! -f "$HOME/.codex/config.toml" ]]; then
  echo "Warning: ~/.codex/config.toml was not found; Codex will use its defaults." >&2
fi

cat <<'EOF'
Starting Codex as the Agent-Commerce head.
Model and reasoning settings come from the active Codex configuration.
Use the codex-gemini-golova-ruki skill and dispatch Gemini workers only through npm run codex:worker.
EOF

exec codex "$@"
