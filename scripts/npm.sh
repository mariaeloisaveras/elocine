#!/usr/bin/env bash
set -euo pipefail
project_root="$(cd "$(dirname "$0")/.." && pwd)"
if [[ -x "$project_root/.tools/node/bin/node" ]]; then
  export PATH="$project_root/.tools/node/bin:$PATH"
fi
if ! command -v npm >/dev/null; then
  echo 'Execute: .venv/bin/python scripts/setup_node.py' >&2
  exit 1
fi
cd "$project_root"
exec npm "$@"
