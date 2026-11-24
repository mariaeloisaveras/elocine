#!/usr/bin/env bash
set -euo pipefail
project_root="$(cd "$(dirname "$0")" && pwd)"
cd "$project_root"
if [[ ! -x .venv/bin/python ]]; then
  echo 'Crie o ambiente: python3 -m venv .venv' >&2
  echo 'Instale as dependências: .venv/bin/python -m pip install -r requirements.txt' >&2
  exit 1
fi
built="dist/elocine/browser/index.html"
frontend_needs_build() {
  if [[ ! -f "$built" ]]; then return 0; fi
  local configuration
  for configuration in angular.json tsconfig.json tsconfig.app.json package.json package-lock.json; do
    if [[ "$configuration" -nt "$built" ]]; then return 0; fi
  done
  [[ -n "$(find src public -type f -newer "$built" -print -quit)" ]]
}
if frontend_needs_build; then
  if [[ ! -d node_modules ]]; then
    bash scripts/npm.sh ci
  fi
  bash scripts/npm.sh run build
fi
app_port="${ELOCINE_PORT:-${CINEPLAY_PORT:-8000}}"
if [[ "${IPTV_DEMO:-0}" == 1 ]]; then
  export IPTV_DEMO_MEDIA_URL="http://127.0.0.1:$app_port/api/demo-video"
  if [[ ! -f .tools/demo.mp4 ]]; then .venv/bin/python -m backend.infrastructure.demo_video; fi
fi
echo "Elocine: http://localhost:$app_port"
exec .venv/bin/python -m uvicorn server:app --host 127.0.0.1 --port "$app_port"
