#!/bin/sh
set -eu

ROOT=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)
cd "$ROOT"
. "$ROOT/scripts/common.sh"

sh "$ROOT/scripts/ensure-env.sh"
require_docker
stop_local_server

if port_in_use; then
  echo "Port 3000 is already in use by another program. Free that port, then run make run again." >&2
  exit 1
fi

build_image() {
  activity="$HOME/.docker/buildx/activity/desktop-linux"
  if [ -e "$activity" ] && [ ! -w "$activity" ]; then
    DOCKER_BUILDKIT=0 COMPOSE_DOCKER_CLI_BUILD=0 compose build
    return
  fi
  if ! compose build; then
    echo "BuildKit could not build the image. Retrying with the legacy builder." >&2
    DOCKER_BUILDKIT=0 COMPOSE_DOCKER_CLI_BUILD=0 compose build
  fi
}

build_image

compose up -d --no-build --remove-orphans
echo "App is running at http://localhost:3000"
echo "Stop it with: make stop"
