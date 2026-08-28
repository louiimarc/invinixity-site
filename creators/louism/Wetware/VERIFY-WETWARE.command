#!/bin/zsh
set -eu
cd "$(dirname "$0")"
if [[ -x "./runtime/node" ]]; then
  wetware_node="./runtime/node"
else
  wetware_node="$(command -v node)"
fi
"$wetware_node" scripts/verify-bundle.js
"$wetware_node" --test
echo ""
echo "WETWARE OFFLINE BUNDLE VERIFIED"
read "?Press Return to close."
