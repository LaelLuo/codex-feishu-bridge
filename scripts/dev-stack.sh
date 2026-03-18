#!/usr/bin/env bash

set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
compose_file="${repo_root}/docker/compose.yaml"
env_example="${repo_root}/docker/.env.example"
env_file="${repo_root}/docker/.env"
workspace_dir="/workspace/codex-feishu-bridge"
extension_dev_path="${repo_root}/apps/vscode-extension"
runtime_proxy_dir="${repo_root}/.tmp/runtime-proxy"
runtime_proxy_pid_file="${runtime_proxy_dir}/codex-runtime-proxy.pid"
runtime_proxy_log_file="${runtime_proxy_dir}/codex-runtime-proxy.log"
runtime_proxy_default_socket="${workspace_dir}/.tmp/codex-runtime-proxy.sock"
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

require_host_node() {
  if ! command -v node >/dev/null 2>&1; then
    echo "node is required when CODEX_RUNTIME_BACKEND=socket-proxy." >&2
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

read_env_value() {
  local key="$1"
  if [[ ! -f "${env_file}" ]]; then
    return
  fi

  sed -n "s/^${key}=//p" "${env_file}" | tail -n 1
}

read_runtime_backend() {
  local backend=""
  backend="$(read_env_value CODEX_RUNTIME_BACKEND)"
  echo "${backend:-mock}"
}

runtime_proxy_enabled() {
  [[ "$(read_runtime_backend)" == "socket-proxy" ]]
}

hash_file() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{print $1}'
    return
  fi

  shasum -a 256 "$1" | awk '{print $1}'
}

resolve_code_bin() {
  if [[ -n "${CODEX_FEISHU_BRIDGE_CODE_BIN:-}" ]]; then
    if command -v "${CODEX_FEISHU_BRIDGE_CODE_BIN}" >/dev/null 2>&1; then
      echo "${CODEX_FEISHU_BRIDGE_CODE_BIN}"
      return
    fi

    echo "Configured CODEX_FEISHU_BRIDGE_CODE_BIN was not found: ${CODEX_FEISHU_BRIDGE_CODE_BIN}" >&2
    exit 1
  fi

  local candidate
  for candidate in code code-insiders; do
    if command -v "${candidate}" >/dev/null 2>&1; then
      echo "${candidate}"
      return
    fi
  done

  echo ""
}

load_env_file() {
  ensure_env_file
  set -a
  # shellcheck disable=SC1090
  source "${env_file}"
  set +a
}

resolve_host_path_from_workspace() {
  local current="${1:-}"
  if [[ -z "${current}" ]]; then
    echo ""
    return
  fi

  if [[ "${current}" == "${workspace_dir}"* ]]; then
    echo "${repo_root}${current#${workspace_dir}}"
    return
  fi

  echo "${current}"
}

resolve_runtime_proxy_socket_host_path() {
  local current="${1:-}"
  if [[ -z "${current}" ]] || [[ "${current}" == "${runtime_proxy_default_socket}" ]]; then
    echo "${repo_root}/.tmp/codex-runtime-proxy.sock"
    return
  fi

  resolve_host_path_from_workspace "${current}"
}

resolve_host_codex_home() {
  local current="${1:-}"
  if [[ -n "${HOST_CODEX_HOME:-}" ]]; then
    echo "${HOST_CODEX_HOME}"
    return
  fi

  if [[ -z "${current}" ]] || [[ "${current}" == "/codex-home" ]] || [[ "${current}" == "${workspace_dir}/.tmp/codex-home" ]]; then
    echo "${HOME}/.codex"
    return
  fi

  resolve_host_path_from_workspace "${current}"
}

resolve_host_codex_bin() {
  local current="${1:-}"
  if [[ -n "${HOST_CODEX_BIN_DIR:-}" ]]; then
    echo "${HOST_CODEX_BIN_DIR}/bin/codex.js"
    return
  fi

  if [[ -z "${current}" ]] || [[ "${current}" == "/opt/host-codex-bin/bin/codex.js" ]]; then
    echo "codex"
    return
  fi

  echo "${current}"
}

runtime_proxy_pid() {
  if [[ -f "${runtime_proxy_pid_file}" ]]; then
    cat "${runtime_proxy_pid_file}"
  fi
}

runtime_proxy_is_running() {
  local pid
  pid="$(runtime_proxy_pid)"
  [[ -n "${pid}" ]] && kill -0 "${pid}" >/dev/null 2>&1
}

cleanup_runtime_proxy_pid_file() {
  rm -f "${runtime_proxy_pid_file}"
}

stop_runtime_proxy() {
  local pid
  pid="$(runtime_proxy_pid)"
  if [[ -z "${pid}" ]]; then
    cleanup_runtime_proxy_pid_file
    return
  fi

  if ! kill -0 "${pid}" >/dev/null 2>&1; then
    cleanup_runtime_proxy_pid_file
    return
  fi

  kill "${pid}" >/dev/null 2>&1 || true
  for _ in $(seq 1 50); do
    if ! kill -0 "${pid}" >/dev/null 2>&1; then
      cleanup_runtime_proxy_pid_file
      return
    fi
    sleep 0.2
  done

  kill -9 "${pid}" >/dev/null 2>&1 || true
  cleanup_runtime_proxy_pid_file
}

stop_runtime_proxy_if_running() {
  if runtime_proxy_is_running; then
    echo "[setup] Stopping host Codex runtime proxy..."
    stop_runtime_proxy
  else
    cleanup_runtime_proxy_pid_file
  fi
}

wait_for_socket() {
  local socket_path="$1"

  echo "[setup] Waiting for host Codex runtime proxy socket at ${socket_path}..."
  for _ in $(seq 1 60); do
    if [[ -S "${socket_path}" ]]; then
      echo "[setup] Host Codex runtime proxy is ready."
      return
    fi
    sleep 1
  done

  echo "host Codex runtime proxy did not become ready in time." >&2
  if [[ -f "${runtime_proxy_log_file}" ]]; then
    echo "--- host Codex runtime proxy log ---" >&2
    tail -n 40 "${runtime_proxy_log_file}" >&2 || true
  fi
  exit 1
}

start_runtime_proxy_if_needed() {
  if ! runtime_proxy_enabled; then
    stop_runtime_proxy_if_running
    return
  fi

  require_host_node
  stop_runtime_proxy_if_running

  local runtime_proxy_socket
  runtime_proxy_socket="$(resolve_runtime_proxy_socket_host_path "$(read_env_value CODEX_RUNTIME_PROXY_SOCKET)")"

  echo "[setup] Starting host Codex runtime proxy..."
  mkdir -p "${runtime_proxy_dir}" "$(dirname "${runtime_proxy_socket}")" "${repo_root}/.tmp"
  (
    cd "${repo_root}"
    load_env_file
    export WORKSPACE_PATH="${repo_root}"
    export CODEX_RUNTIME_PROXY_SOCKET="${runtime_proxy_socket}"
    export BRIDGE_CODEX_HOME="$(resolve_host_codex_home "${BRIDGE_CODEX_HOME:-}")"
    export CODEX_HOME="${BRIDGE_CODEX_HOME}"
    export CODEX_APP_SERVER_BIN="$(resolve_host_codex_bin "${CODEX_APP_SERVER_BIN:-}")"
    : > "${runtime_proxy_log_file}"
    nohup node "${repo_root}/apps/bridge-daemon/dist/runtime-socket-proxy.js" </dev/null >> "${runtime_proxy_log_file}" 2>&1 &
    disown "$!" >/dev/null 2>&1 || true
    printf '%s\n' "$!" > "${runtime_proxy_pid_file}"
  )

  wait_for_socket "${runtime_proxy_socket}"
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
  if runtime_proxy_enabled && [[ -f "${runtime_proxy_log_file}" ]]; then
    echo "--- host Codex runtime proxy log ---" >&2
    tail -n 40 "${runtime_proxy_log_file}" >&2 || true
  fi
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

  if runtime_proxy_enabled; then
    local runtime_proxy_socket
    runtime_proxy_socket="$(resolve_runtime_proxy_socket_host_path "$(read_env_value CODEX_RUNTIME_PROXY_SOCKET)")"
    cat <<EOF
- Host Codex runtime proxy: ${runtime_proxy_socket}
EOF
  fi
}

open_monitor() {
  local code_bin
  code_bin="$(resolve_code_bin)"

  if [[ -z "${code_bin}" ]]; then
    echo "VSCode CLI was not found. Install the 'code' command or set CODEX_FEISHU_BRIDGE_CODE_BIN." >&2
    exit 1
  fi

  echo "[setup] Launching monitor through ${code_bin}..."
  (
    cd "${repo_root}"
    CODEX_FEISHU_BRIDGE_AUTO_OPEN_MONITOR=1 \
      "${code_bin}" \
      --new-window \
      "${repo_root}" \
      --extensionDevelopmentPath="${extension_dev_path}" \
      --disable-extensions >/dev/null 2>&1
  ) &
  disown || true
}

command_up() {
  require_docker
  ensure_env_file
  mkdir -p "${repo_root}/.tmp"
  start_workspace_dev
  install_dependencies
  build_artifacts
  start_runtime_proxy_if_needed
  start_runtime
  wait_for_health
  print_summary
}

command_monitor() {
  command_up
  open_monitor
}

command_down() {
  require_docker
  ensure_env_file
  compose down
  stop_runtime_proxy_if_running
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

  if runtime_proxy_enabled || [[ -f "${runtime_proxy_pid_file}" ]]; then
    local runtime_proxy_socket
    runtime_proxy_socket="$(resolve_runtime_proxy_socket_host_path "$(read_env_value CODEX_RUNTIME_PROXY_SOCKET)")"
    echo
    if runtime_proxy_is_running; then
      echo "Host Codex runtime proxy: running (pid $(runtime_proxy_pid))"
    else
      echo "Host Codex runtime proxy: stopped"
    fi
    echo "Socket: ${runtime_proxy_socket}"
    echo "Log file: ${runtime_proxy_log_file}"
  fi
}

command_logs() {
  require_docker
  ensure_env_file
  if runtime_proxy_enabled || [[ -f "${runtime_proxy_pid_file}" ]]; then
    echo "[info] Host Codex runtime proxy log: ${runtime_proxy_log_file}" >&2
  fi
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
  monitor)
    command_monitor
    ;;
  *)
    echo "Usage: scripts/dev-stack.sh [up|down|status|logs|monitor]" >&2
    exit 1
    ;;
esac
