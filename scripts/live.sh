#!/usr/bin/env bash
set -euo pipefail
umask 077
# Serialize all lifecycle commands, including first-run initialization.
case "${1:-}" in start|stop|status) ;; *) echo 'Usage: bash scripts/live.sh start [offline-source-folder] | stop | status'; exit 1;; esac
live_dir="$(realpath -m "${LEDGER_LIVE_DIR:-$HOME/ledger-live/live}")"
export LEDGER_LIVE_DIR="$live_dir"
mkdir -p "$(dirname "$live_dir")"
# Parse this whole block before node runs: an update may replace this file.
{
  code=0
  flock --close -n -E 75 "${live_dir}.lock" node "$(dirname "$(realpath "$0")")/live/main.mjs" "$@" || code=$?
  if [[ $code == 75 ]]; then echo 'Another live-instance command is running; try again shortly.'; fi
  exit "$code"
}
