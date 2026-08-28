#!/bin/zsh
set -eu
cd "$(dirname "$0")"

if [[ -x "./runtime/node" ]]; then
  wetware_node="./runtime/node"
elif command -v node >/dev/null 2>&1; then
  wetware_node="$(command -v node)"
else
  osascript -e 'display alert "Wetware cannot start" message "The bundled Node runtime is missing and Node.js is not installed." as critical'
  exit 1
fi

"$wetware_node" scripts/verify-bundle.js
"$wetware_node" server.js &
wetware_server_pid=$!
trap 'kill "$wetware_server_pid" 2>/dev/null || true' EXIT INT TERM

wetware_ready=0
for wetware_attempt in {1..40}; do
  if curl -fsS http://localhost:4173/api/status >/dev/null 2>&1; then
    wetware_ready=1
    break
  fi
  sleep 0.25
done

if [[ "$wetware_ready" -ne 1 ]]; then
  osascript -e 'display alert "Wetware server did not start" message "Check this Terminal window for the error. Port 4173 may already be in use." as critical'
  exit 1
fi

open http://localhost:4173/operator/
wait "$wetware_server_pid"
