#!/usr/bin/env bash

set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
compose_file="${repo_root}/docker/compose.yaml"
env_example="${repo_root}/docker/.env.example"
env_file="${repo_root}/docker/.env"
workspace_dir="/workspace/codex-feishu-bridge"
command="${1:-up}"

compose() {
  docker compose -f "${compose_file}" --env-file "${env_file}" "$@"
}

require_docker() {
  if ! command -v docker >/dev/null 2>&1; then
    echo "docker is required for this project." >&2
    exit 1
  fi
}

ensure_env_file() {
  if [[ -f "${env_file}" ]]; then
    return
  fi

  cp "${env_example}" "${env_file}"
  echo "[setup] Created docker/.env from docker/.env.example"
}

read_bridge_port() {
  local port=""
  if [[ -f "${env_file}" ]]; then
    port="$(sed -n 's/^BRIDGE_PORT=//p' "${env_file}" | tail -n 1)"
  fi
  echo "${port:-8787}"
}

hash_file() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{print $1}'
    return
  fi

  shasum -a 256 "$1" | awk '{print $1}'
}

start_workspace_dev() {
  echo "[setup] Starting workspace-dev container..."
  compose up -d --build workspace-dev
}

install_dependencies() {
  local lock_hash
  lock_hash="$(hash_file "${repo_root}/package-lock.json")"

  echo "[setup] Checking npm dependencies inside workspace-dev..."
  compose exec -T -e LOCK_HASH="${lock_hash}" workspace-dev bash -lc "
    set -euo pipefail
    cd '${workspace_dir}'
    marker='node_modules/.codex-feishu-bridge-lock-hash'
    current=''
    if [[ -f \"\${marker}\" ]]; then
      current=\"\$(cat \"\${marker}\")\"
    fi

    if [[ ! -d node_modules ]] || [[ \"\${current}\" != \"\${LOCK_HASH}\" ]]; then
      echo '[setup] Installing npm dependencies...'
      npm install
      mkdir -p node_modules
      printf '%s\n' \"\${LOCK_HASH}\" > \"\${marker}\"
    else
      echo '[setup] npm dependencies already up to date.'
    fi
  "
}

build_artifacts() {
  echo "[setup] Building shared packages, daemon, and VSCode extension..."
  compose exec -T workspace-dev bash -lc "
    set -euo pipefail
    cd '${workspace_dir}'
    npm run build:shared
    npm run build:protocol
    npm run build:daemon
    npm run build:extension
  "
}

start_runtime() {
  echo "[setup] Starting bridge-runtime..."
  compose up -d --force-recreate bridge-runtime
}

wait_for_health() {
  local port
  local url
  local attempt

  port="$(read_bridge_port)"
  url="http://127.0.0.1:${port}/health"

  echo "[setup] Waiting for bridge health at ${url}..."
  for attempt in $(seq 1 60); do
    if command -v curl >/dev/null 2>&1; then
      if curl -sf "${url}" >/dev/null 2>&1; then
        echo "[setup] Bridge runtime is healthy."
        return
      fi
    else
      if compose exec -T bridge-runtime node -e "
        fetch('${url}')
          .then((response) => process.exit(response.ok ? 0 : 1))
          .catch(() => process.exit(1));
      " >/dev/null 2>&1; then
        echo "[setup] Bridge runtime is healthy."
        return
      fi
    fi

    sleep 1
  done

  echo "bridge-runtime did not become healthy in time." >&2
  exit 1
}

print_summary() {
  local port
  port="$(read_bridge_port)"

  cat <<EOF

[ready] codex-feishu-bridge is up.
- Health: http://127.0.0.1:${port}/health
- Start the VSCode extension with F5 on "Codex Feishu Bridge Extension"
- The Extension Development Host will open the monitor automatically
EOF
}

command_up() {
  require_docker
  ensure_env_file
  mkdir -p "${repo_root}/.tmp"
  start_workspace_dev
  install_dependencies
  build_artifacts
  start_runtime
  wait_for_health
  print_summary
}

command_down() {
  require_docker
  ensure_env_file
  compose down
}

command_status() {
  local port
  local url

  require_docker
  ensure_env_file
  port="$(read_bridge_port)"
  url="http://127.0.0.1:${port}/health"

  compose ps
  echo
  if command -v curl >/dev/null 2>&1 && curl -sf "${url}" >/dev/null 2>&1; then
    curl -sf "${url}"
    echo
  else
    echo "Health endpoint is not reachable at ${url}."
  fi
}

command_logs() {
  require_docker
  ensure_env_file
  compose logs -f bridge-runtime
}

case "${command}" in
  up)
    command_up
    ;;
  down)
    command_down
    ;;
  status)
    command_status
    ;;
  logs)
    command_logs
    ;;
  *)
    echo "Usage: scripts/dev-stack.sh [up|down|status|logs]" >&2
    exit 1
    ;;
esac
