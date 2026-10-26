#!/bin/sh
set -eu

ROOT=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)
cd "$ROOT"
. "$ROOT/scripts/common.sh"

stop_local_server

if ! command -v docker >/dev/null 2>&1; then
  echo "App stopped."
  exit 0
fi

if docker info >/dev/null 2>&1; then
  compose down --remove-orphans
fi

echo "App stopped."
