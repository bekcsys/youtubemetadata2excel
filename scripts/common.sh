compose() {
  if docker compose version >/dev/null 2>&1; then
    docker compose "$@"
  else
    docker-compose "$@"
  fi
}

require_docker() {
  if ! command -v docker >/dev/null 2>&1; then
    echo "Docker is not installed. Install Docker Desktop, then run make run again." >&2
    exit 1
  fi
  if ! docker info >/dev/null 2>&1; then
    echo "Docker is not running. Start Docker Desktop, then run make run again." >&2
    exit 1
  fi
}

stop_local_server() {
  if ! command -v lsof >/dev/null 2>&1; then
    return 0
  fi

  pids=$(lsof -nP -iTCP:3000 -sTCP:LISTEN -t 2>/dev/null || true)
  for pid in $pids; do
    cwd=$(lsof -a -p "$pid" -d cwd -Fn 2>/dev/null | awk '/^n/ { print substr($0, 2); exit }')
    if [ "$cwd" = "$ROOT" ]; then
      echo "Stopping the local server on port 3000."
      kill "$pid" 2>/dev/null || true
    fi
  done

  i=0
  while [ "$i" -lt 25 ]; do
    still_ours=0
    pids=$(lsof -nP -iTCP:3000 -sTCP:LISTEN -t 2>/dev/null || true)
    for pid in $pids; do
      cwd=$(lsof -a -p "$pid" -d cwd -Fn 2>/dev/null | awk '/^n/ { print substr($0, 2); exit }')
      if [ "$cwd" = "$ROOT" ]; then
        still_ours=1
      fi
    done
    if [ "$still_ours" -eq 0 ]; then
      return 0
    fi
    i=$((i + 1))
    sleep 0.2
  done
}

port_in_use() {
  if ! command -v lsof >/dev/null 2>&1; then
    return 1
  fi
  lsof -nP -iTCP:3000 -sTCP:LISTEN >/dev/null 2>&1
}
