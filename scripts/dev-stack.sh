#!/usr/bin/env bash

set -euo pipefail

# Keep this script LF-only so host bash and Linux containers execute it consistently.

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
runtime_proxy_default_host="host.docker.internal"
runtime_proxy_default_port="8788"
runtime_proxy_default_bind_host="0.0.0.0"
runtime_proxy_launch_script="${runtime_proxy_dir}/launch-runtime-proxy.sh"
command="${1:-up}"
requested_backend="${2:-}"
created_env_file=0
autofilled_entries=()

compose() {
  local docker_compose_file="${compose_file}"
  local docker_env_file="${env_file}"

  ensure_env_file
  if command -v cygpath >/dev/null 2>&1; then
    docker_compose_file="$(cygpath -w "${compose_file}")"
    docker_env_file="$(cygpath -w "${env_file}")"
  fi

  docker compose -f "${docker_compose_file}" --env-file "${docker_env_file}" "$@"
}

require_docker() {
  if ! command -v docker >/dev/null 2>&1; then
    echo "docker is required for this project." >&2
    exit 1
  fi
}

validate_requested_backend() {
  case "${requested_backend}" in
    ""|stdio|socket-proxy|tcp-proxy)
      ;;
    *)
      echo "Unsupported runtime mode: ${requested_backend}" >&2
      echo "Expected one of: stdio, socket-proxy, tcp-proxy" >&2
      exit 1
      ;;
  esac
}

require_host_bun() {
  if ! command -v bun >/dev/null 2>&1; then
    echo "bun is required when CODEX_RUNTIME_BACKEND uses a host runtime proxy." >&2
    exit 1
  fi
}

escape_sed_replacement() {
  printf '%s' "$1" | sed -e 's/[&|\\]/\\&/g'
}

record_env_update() {
  autofilled_entries+=("$1=$2")
}

set_env_value() {
  local key="$1"
  local value="$2"
  local escaped_value

  escaped_value="$(escape_sed_replacement "${value}")"
  if grep -q "^${key}=" "${env_file}"; then
    sed -i "s|^${key}=.*|${key}=${escaped_value}|" "${env_file}"
  else
    printf '%s=%s\n' "${key}" "${value}" >> "${env_file}"
  fi
}

ensure_env_file() {
  if [[ -f "${env_file}" ]]; then
    autofill_env_file
    return
  fi

  cp "${env_example}" "${env_file}"
  created_env_file=1
  echo "[setup] Created docker/.env from docker/.env.example"
  autofill_env_file
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

determine_runtime_backend() {
  local backend=""

  if [[ -n "${requested_backend}" ]]; then
    echo "${requested_backend}"
    return
  fi

  backend="$(read_env_value CODEX_RUNTIME_BACKEND)"
  if [[ -n "${backend}" ]]; then
    if [[ "${created_env_file}" -eq 1 && "${backend}" == "mock" ]]; then
      echo "stdio"
      return
    fi
    echo "${backend}"
    return
  fi

  echo "stdio"
}

runtime_proxy_enabled() {
  local backend
  backend="$(read_runtime_backend)"
  [[ "${backend}" == "socket-proxy" || "${backend}" == "tcp-proxy" ]]
}

runtime_proxy_uses_socket() {
  [[ "$(read_runtime_backend)" == "socket-proxy" ]]
}

runtime_proxy_uses_tcp() {
  [[ "$(read_runtime_backend)" == "tcp-proxy" ]]
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
  local line=""

  ensure_env_file
  while IFS= read -r line || [[ -n "${line}" ]]; do
    if [[ -z "${line}" || "${line}" == \#* ]]; then
      continue
    fi

    export "${line}"
  done < "${env_file}"
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

read_runtime_proxy_host() {
  local current=""
  current="$(read_env_value CODEX_RUNTIME_PROXY_HOST)"
  echo "${current:-${runtime_proxy_default_host}}"
}

read_runtime_proxy_port() {
  local current=""
  current="$(read_env_value CODEX_RUNTIME_PROXY_PORT)"
  echo "${current:-${runtime_proxy_default_port}}"
}

read_runtime_proxy_bind_host() {
  local current=""
  current="$(read_env_value CODEX_RUNTIME_PROXY_BIND_HOST)"
  echo "${current:-${runtime_proxy_default_bind_host}}"
}

runtime_proxy_probe_host() {
  local bind_host="$1"
  if [[ -z "${bind_host}" || "${bind_host}" == "0.0.0.0" || "${bind_host}" == "::" ]]; then
    echo "127.0.0.1"
    return
  fi

  echo "${bind_host}"
}

default_host_codex_home_path() {
  if command -v cygpath >/dev/null 2>&1; then
    cygpath -m "${HOME}/.codex"
    return
  fi

  echo "${HOME}/.codex"
}

detect_host_codex_home() {
  if [[ -n "${HOST_CODEX_HOME:-}" ]] && [[ -d "${HOST_CODEX_HOME}" ]]; then
    echo "${HOST_CODEX_HOME}"
    return
  fi

  default_host_codex_home_path
}

detect_host_codex_bin_dir() {
  local codex_command=""
  local resolved_command=""
  if [[ -n "${HOST_CODEX_BIN_DIR:-}" ]] && [[ -d "${HOST_CODEX_BIN_DIR}" ]]; then
    echo "${HOST_CODEX_BIN_DIR}"
    return
  fi

  codex_command="$(command -v codex 2>/dev/null || true)"
  if [[ -n "${codex_command}" ]]; then
    resolved_command="$(
      readlink -f "${codex_command}" 2>/dev/null \
        || realpath "${codex_command}" 2>/dev/null \
        || printf '%s' "${codex_command}"
    )"
    if [[ "${resolved_command}" == */bin/codex.js ]]; then
      resolved_command="$(dirname "$(dirname "${resolved_command}")")"
      if command -v cygpath >/dev/null 2>&1; then
        cygpath -m "${resolved_command}"
        return
      fi
      echo "${resolved_command}"
      return
    fi
    if [[ "${resolved_command}" == */resources/codex || "${resolved_command}" == */resources/codex.exe ]]; then
      resolved_command="$(dirname "${resolved_command}")"
      if command -v cygpath >/dev/null 2>&1; then
        cygpath -m "${resolved_command}"
        return
      fi
      echo "${resolved_command}"
      return
    fi
  fi

  echo ""
}

resolve_container_codex_bin() {
  local host_dir="$1"

  if [[ -f "${host_dir}/bin/codex.js" ]]; then
    echo "/opt/host-codex-bin/bin/codex.js"
    return
  fi

  if [[ -f "${host_dir}/codex" || -f "${host_dir}/codex.exe" ]]; then
    echo "/opt/host-codex-bin/codex"
    return
  fi

  echo "codex"
}

sync_env_value_from_shell() {
  local key="$1"
  local current=""
  local candidate=""

  current="$(read_env_value "${key}")"
  candidate="${!key:-}"
  if [[ -z "${current}" && -n "${candidate}" ]]; then
    set_env_value "${key}" "${candidate}"
    record_env_update "${key}" "${candidate}"
  fi
}

report_env_autofill() {
  local entry

  if [[ "${#autofilled_entries[@]}" -eq 0 ]]; then
    return
  fi

  echo "[setup] Auto-filled docker/.env:"
  for entry in "${autofilled_entries[@]}"; do
    echo "  - ${entry}"
  done
}

uses_msys_host_path() {
  local current="${1:-}"

  [[ "${current}" =~ ^/[A-Za-z]/ ]]
}

autofill_env_file() {
  local backend=""
  local current=""
  local bridge_codex_home=""
  local default_host_codex_home=""
  local host_codex_home=""
  local host_codex_bin_dir=""

  backend="$(determine_runtime_backend)"
  bridge_codex_home="${workspace_dir}/.tmp/codex-home"
  if ! command -v cygpath >/dev/null 2>&1; then
    bridge_codex_home="/codex-home"
  fi
  default_host_codex_home="$(default_host_codex_home_path)"
  host_codex_home="$(detect_host_codex_home)"
  host_codex_bin_dir="$(detect_host_codex_bin_dir)"

  current="$(read_env_value BRIDGE_CODEX_HOME)"
  if [[ -z "${current}" || "${current}" == "/codex-home" || "${current}" == "${workspace_dir}/.tmp/codex-home" ]]; then
    set_env_value BRIDGE_CODEX_HOME "${bridge_codex_home}"
    record_env_update "BRIDGE_CODEX_HOME" "${bridge_codex_home}"
  fi

  current="$(read_env_value HOST_CODEX_HOME)"
  if [[ -z "${current}" || "${current}" == "../.tmp/codex-home" ]] \
    || uses_msys_host_path "${current}" \
    || [[ "${current}" == "${default_host_codex_home}" && "${host_codex_home}" != "${default_host_codex_home}" ]]; then
    set_env_value HOST_CODEX_HOME "${host_codex_home}"
    record_env_update "HOST_CODEX_HOME" "${host_codex_home}"
  fi

  current="$(read_env_value HOST_CODEX_BIN_DIR)"
  if [[ -n "${host_codex_bin_dir}" ]] && ([[ -z "${current}" || "${current}" == "/tmp" ]] || uses_msys_host_path "${current}"); then
    set_env_value HOST_CODEX_BIN_DIR "${host_codex_bin_dir}"
    record_env_update "HOST_CODEX_BIN_DIR" "${host_codex_bin_dir}"
  fi

  current="$(read_env_value CODEX_RUNTIME_BACKEND)"
  if [[ "${current}" != "${backend}" ]]; then
    set_env_value CODEX_RUNTIME_BACKEND "${backend}"
    record_env_update "CODEX_RUNTIME_BACKEND" "${backend}"
  fi

  current="$(read_env_value CODEX_APP_SERVER_BIN)"
  if [[ -n "${host_codex_bin_dir}" ]] && [[ -z "${current}" || "${current}" == "codex" ]]; then
    current="$(resolve_container_codex_bin "${host_codex_bin_dir}")"
    set_env_value CODEX_APP_SERVER_BIN "${current}"
    record_env_update "CODEX_APP_SERVER_BIN" "${current}"
  fi

  current="$(read_env_value CODEX_RUNTIME_PROXY_SOCKET)"
  if [[ "${backend}" == "socket-proxy" ]] && [[ -z "${current}" ]]; then
    set_env_value CODEX_RUNTIME_PROXY_SOCKET "${runtime_proxy_default_socket}"
    record_env_update "CODEX_RUNTIME_PROXY_SOCKET" "${runtime_proxy_default_socket}"
  fi

  current="$(read_env_value CODEX_RUNTIME_PROXY_HOST)"
  if [[ "${backend}" == "tcp-proxy" ]] && [[ -z "${current}" ]]; then
    set_env_value CODEX_RUNTIME_PROXY_HOST "${runtime_proxy_default_host}"
    record_env_update "CODEX_RUNTIME_PROXY_HOST" "${runtime_proxy_default_host}"
  fi

  current="$(read_env_value CODEX_RUNTIME_PROXY_PORT)"
  if [[ "${backend}" == "tcp-proxy" ]] && [[ -z "${current}" ]]; then
    set_env_value CODEX_RUNTIME_PROXY_PORT "${runtime_proxy_default_port}"
    record_env_update "CODEX_RUNTIME_PROXY_PORT" "${runtime_proxy_default_port}"
  fi

  current="$(read_env_value CODEX_RUNTIME_PROXY_BIND_HOST)"
  if [[ "${backend}" == "tcp-proxy" ]] && [[ -z "${current}" ]]; then
    set_env_value CODEX_RUNTIME_PROXY_BIND_HOST "${runtime_proxy_default_bind_host}"
    record_env_update "CODEX_RUNTIME_PROXY_BIND_HOST" "${runtime_proxy_default_bind_host}"
  fi

  current="$(read_env_value MOCK_AUTO_COMPLETE_LOGIN)"
  if [[ "${backend}" != "mock" ]] && [[ -z "${current}" || "${current}" == "true" ]]; then
    set_env_value MOCK_AUTO_COMPLETE_LOGIN "false"
    record_env_update "MOCK_AUTO_COMPLETE_LOGIN" "false"
  fi

  sync_env_value_from_shell FEISHU_APP_ID
  sync_env_value_from_shell FEISHU_APP_SECRET
  sync_env_value_from_shell FEISHU_VERIFICATION_TOKEN
  sync_env_value_from_shell FEISHU_ENCRYPT_KEY
  sync_env_value_from_shell FEISHU_DEFAULT_CHAT_ID
  sync_env_value_from_shell FEISHU_DEFAULT_CHAT_NAME
  sync_env_value_from_shell PUBLIC_BASE_URL

  report_env_autofill
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
    if [[ -f "${HOST_CODEX_BIN_DIR}/bin/codex.js" ]]; then
      echo "${HOST_CODEX_BIN_DIR}/bin/codex.js"
      return
    fi

    if [[ -f "${HOST_CODEX_BIN_DIR}/codex.exe" ]]; then
      echo "${HOST_CODEX_BIN_DIR}/codex.exe"
      return
    fi

    if [[ -f "${HOST_CODEX_BIN_DIR}/codex" ]]; then
      echo "${HOST_CODEX_BIN_DIR}/codex"
      return
    fi
  fi

  if [[ -z "${current}" ]] || [[ "${current}" == "/opt/host-codex-bin/bin/codex.js" ]] || [[ "${current}" == "/opt/host-codex-bin/codex" ]]; then
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

cleanup_runtime_proxy_socket_file() {
  if runtime_proxy_uses_socket; then
    local runtime_proxy_socket
    runtime_proxy_socket="$(resolve_runtime_proxy_socket_host_path "$(read_env_value CODEX_RUNTIME_PROXY_SOCKET)")"
    rm -f "${runtime_proxy_socket}"
  fi
}

cleanup_runtime_proxy_launch_script() {
  rm -f "${runtime_proxy_launch_script}"
}

stop_runtime_proxy() {
  local pid
  pid="$(runtime_proxy_pid)"
  if [[ -z "${pid}" ]]; then
    cleanup_runtime_proxy_pid_file
    cleanup_runtime_proxy_socket_file
    cleanup_runtime_proxy_launch_script
    return
  fi

  if ! kill -0 "${pid}" >/dev/null 2>&1; then
    cleanup_runtime_proxy_pid_file
    cleanup_runtime_proxy_socket_file
    cleanup_runtime_proxy_launch_script
    return
  fi

  kill "${pid}" >/dev/null 2>&1 || true
  for _ in $(seq 1 50); do
    if ! kill -0 "${pid}" >/dev/null 2>&1; then
      cleanup_runtime_proxy_pid_file
      cleanup_runtime_proxy_socket_file
      cleanup_runtime_proxy_launch_script
      return
    fi
    sleep 0.2
  done

  kill -9 "${pid}" >/dev/null 2>&1 || true
  cleanup_runtime_proxy_pid_file
  cleanup_runtime_proxy_socket_file
  cleanup_runtime_proxy_launch_script
}

stop_runtime_proxy_if_running() {
  if runtime_proxy_is_running; then
    echo "[setup] Stopping host Codex runtime proxy..."
    stop_runtime_proxy
  else
    cleanup_runtime_proxy_pid_file
  fi
}

wait_for_runtime_proxy() {
  local socket_path=""
  local bind_host=""
  local probe_host=""
  local port=""

  if runtime_proxy_uses_socket; then
    socket_path="$(resolve_runtime_proxy_socket_host_path "$(read_env_value CODEX_RUNTIME_PROXY_SOCKET)")"
    echo "[setup] Waiting for host Codex runtime proxy socket at ${socket_path}..."
  else
    bind_host="$(read_runtime_proxy_bind_host)"
    probe_host="$(runtime_proxy_probe_host "${bind_host}")"
    port="$(read_runtime_proxy_port)"
    echo "[setup] Waiting for host Codex runtime proxy tcp endpoint at ${probe_host}:${port}..."
  fi

  for _ in $(seq 1 60); do
    if runtime_proxy_uses_socket; then
      if runtime_proxy_is_running && [[ -S "${socket_path}" ]] && probe_runtime_proxy_socket "${socket_path}"; then
        echo "[setup] Host Codex runtime proxy is ready."
        return
      fi
    else
      if runtime_proxy_is_running && probe_runtime_proxy_tcp "${probe_host}" "${port}"; then
        echo "[setup] Host Codex runtime proxy is ready."
        return
      fi
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

probe_runtime_proxy_socket() {
  local socket_path="$1"

  bun -e '
    const net = require("node:net");
    const socketPath = process.argv[1];
    const client = net.createConnection(socketPath);
    const timer = setTimeout(() => {
      client.destroy();
      process.exit(1);
    }, 750);

    client.once("connect", () => {
      clearTimeout(timer);
      client.end();
      process.exit(0);
    });

    client.once("error", () => {
      clearTimeout(timer);
      process.exit(1);
    });
  ' "${socket_path}" >/dev/null 2>&1
}

probe_runtime_proxy_tcp() {
  local host="$1"
  local port="$2"

  bun -e '
    const net = require("node:net");
    const host = process.argv[1];
    const port = Number(process.argv[2]);
    const client = net.createConnection({ host, port });
    const timer = setTimeout(() => {
      client.destroy();
      process.exit(1);
    }, 750);

    client.once("connect", () => {
      clearTimeout(timer);
      client.end();
      process.exit(0);
    });

    client.once("error", () => {
      clearTimeout(timer);
      process.exit(1);
    });
  ' "${host}" "${port}" >/dev/null 2>&1
}

start_runtime_proxy_if_needed() {
  if ! runtime_proxy_enabled; then
    stop_runtime_proxy_if_running
    return
  fi

  require_host_bun
  stop_runtime_proxy_if_running

  echo "[setup] Starting host Codex runtime proxy..."
  mkdir -p "${runtime_proxy_dir}" "${repo_root}/.tmp"

  local runtime_proxy_socket=""
  local runtime_proxy_host=""
  local runtime_proxy_port=""
  local runtime_proxy_bind_host=""
  local runtime_proxy_script="runtime-socket-proxy.js"

  if runtime_proxy_uses_socket; then
    runtime_proxy_socket="$(resolve_runtime_proxy_socket_host_path "$(read_env_value CODEX_RUNTIME_PROXY_SOCKET)")"
    mkdir -p "$(dirname "${runtime_proxy_socket}")"
  else
    runtime_proxy_host="$(read_runtime_proxy_host)"
    runtime_proxy_port="$(read_runtime_proxy_port)"
    runtime_proxy_bind_host="$(read_runtime_proxy_bind_host)"
    runtime_proxy_script="runtime-tcp-proxy.js"
  fi

  (
    cd "${repo_root}"
    load_env_file
    export WORKSPACE_PATH="${repo_root}"
    export BRIDGE_CODEX_HOME="$(resolve_host_codex_home "${BRIDGE_CODEX_HOME:-}")"
    export CODEX_HOME="${BRIDGE_CODEX_HOME}"
    export CODEX_APP_SERVER_BIN="$(resolve_host_codex_bin "${CODEX_APP_SERVER_BIN:-}")"
    if runtime_proxy_uses_socket; then
      export CODEX_RUNTIME_PROXY_SOCKET="${runtime_proxy_socket}"
    else
      export CODEX_RUNTIME_PROXY_HOST="${runtime_proxy_host}"
      export CODEX_RUNTIME_PROXY_PORT="${runtime_proxy_port}"
      export CODEX_RUNTIME_PROXY_BIND_HOST="${runtime_proxy_bind_host}"
    fi
    : > "${runtime_proxy_log_file}"
    cat > "${runtime_proxy_launch_script}" <<EOF
#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "\$\$" > "${runtime_proxy_pid_file}"
cd "${repo_root}"
export WORKSPACE_PATH="${repo_root}"
export BRIDGE_CODEX_HOME="$(resolve_host_codex_home "${BRIDGE_CODEX_HOME:-}")"
export CODEX_HOME="${BRIDGE_CODEX_HOME}"
export CODEX_APP_SERVER_BIN="$(resolve_host_codex_bin "${CODEX_APP_SERVER_BIN:-}")"
EOF
    if runtime_proxy_uses_socket; then
      cat >> "${runtime_proxy_launch_script}" <<EOF
export CODEX_RUNTIME_PROXY_SOCKET="${runtime_proxy_socket}"
EOF
    else
      cat >> "${runtime_proxy_launch_script}" <<EOF
export CODEX_RUNTIME_PROXY_HOST="${runtime_proxy_host}"
export CODEX_RUNTIME_PROXY_PORT="${runtime_proxy_port}"
export CODEX_RUNTIME_PROXY_BIND_HOST="${runtime_proxy_bind_host}"
EOF
    fi
    cat >> "${runtime_proxy_launch_script}" <<EOF
exec bun "${repo_root}/apps/bridge-daemon/dist/${runtime_proxy_script}" >> "${runtime_proxy_log_file}" 2>&1 < /dev/null
EOF
    chmod +x "${runtime_proxy_launch_script}"
    if command -v setsid >/dev/null 2>&1; then
      setsid "${runtime_proxy_launch_script}" >/dev/null 2>&1 &
    else
      nohup "${runtime_proxy_launch_script}" >/dev/null 2>&1 &
      disown "$!" >/dev/null 2>&1 || true
    fi
  )

  wait_for_runtime_proxy
}

start_workspace_dev() {
  echo "[setup] Starting workspace-dev container..."
  compose up -d --build workspace-dev
}

sync_host_codex_auth_if_needed() {
  local bridge_home=""
  local host_home=""

  bridge_home="$(read_env_value BRIDGE_CODEX_HOME)"
  host_home="$(read_env_value HOST_CODEX_HOME)"

  if [[ -z "${bridge_home}" || "${bridge_home}" == "/codex-home" || -z "${host_home}" ]]; then
    return
  fi

  echo "[setup] Syncing host Codex auth into bridge home..."
  compose exec -T workspace-dev bash -lc "
    set -euo pipefail
    source_home='/codex-home'
    bridge_home='${bridge_home}'
    mkdir -p \"\${bridge_home}\"

    for entry in auth.json config.toml; do
      if [[ -f \"\${source_home}/\${entry}\" ]]; then
        cp \"\${source_home}/\${entry}\" \"\${bridge_home}/\${entry}\"
      fi
    done
  "
}

install_dependencies() {
  local lock_hash
  lock_hash="$(hash_file "${repo_root}/bun.lock")"

  echo "[setup] Checking bun dependencies inside workspace-dev..."
  compose exec -T -e LOCK_HASH="${lock_hash}" workspace-dev bash -lc "
    set -euo pipefail
    cd '${workspace_dir}'
    marker='node_modules/.codex-feishu-bridge-lock-hash'
    current=''
    if [[ -f \"\${marker}\" ]]; then
      current=\"\$(cat \"\${marker}\")\"
    fi

    if [[ ! -d node_modules ]] || [[ \"\${current}\" != \"\${LOCK_HASH}\" ]]; then
      echo '[setup] Installing bun dependencies...'
      bun install --frozen-lockfile
      mkdir -p node_modules
      printf '%s\n' \"\${LOCK_HASH}\" > \"\${marker}\"
    else
      echo '[setup] bun dependencies already up to date.'
    fi
  "
}

build_artifacts() {
  echo "[setup] Building shared packages, daemon, and VSCode extension..."
  compose exec -T workspace-dev bash -lc "
    set -euo pipefail
    cd '${workspace_dir}'
    bun run build:shared
    bun run build:protocol
    bun run build:daemon
    bun run build:extension
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
  local health_json
  local backend

  port="$(read_bridge_port)"
  url="http://127.0.0.1:${port}/health"
  backend="$(read_runtime_backend)"

  echo "[setup] Waiting for bridge health at ${url}..."
  for attempt in $(seq 1 60); do
    if command -v curl >/dev/null 2>&1; then
      health_json="$(curl -sf "${url}" 2>/dev/null || true)"
      if bridge_health_ready "${health_json}" "${backend}"; then
        echo "[setup] Bridge runtime is healthy."
        return
      fi
    else
      health_json="$(
        compose exec -T bridge-runtime bun -e "
          fetch('http://127.0.0.1:${port}/health')
            .then(async (response) => {
              if (!response.ok) {
                process.exit(1);
              }
              process.stdout.write(await response.text());
            })
            .catch(() => process.exit(1));
        " 2>/dev/null || true
      )"
      if bridge_health_ready "${health_json}" "${backend}"; then
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

bridge_health_ready() {
  local health_json="$1"
  local backend="$2"

  if [[ -z "${health_json}" ]] || [[ "${health_json}" != *'"status":"ok"'* ]]; then
    return 1
  fi

  if [[ "${backend}" == "mock" ]]; then
    return 0
  fi

  [[ "${health_json}" == *'"connected":true'* && "${health_json}" == *'"initialized":true'* ]]
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
    if runtime_proxy_uses_socket; then
      local runtime_proxy_socket
      runtime_proxy_socket="$(resolve_runtime_proxy_socket_host_path "$(read_env_value CODEX_RUNTIME_PROXY_SOCKET)")"
      cat <<EOF
- Host Codex runtime proxy: ${runtime_proxy_socket}
EOF
    else
      local runtime_proxy_host
      local runtime_proxy_port
      runtime_proxy_host="$(read_runtime_proxy_host)"
      runtime_proxy_port="$(read_runtime_proxy_port)"
      cat <<EOF
- Host Codex runtime proxy: tcp://${runtime_proxy_host}:${runtime_proxy_port}
EOF
    fi
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
  sync_host_codex_auth_if_needed
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
    echo
    if runtime_proxy_is_running; then
      echo "Host Codex runtime proxy: running (pid $(runtime_proxy_pid))"
    else
      echo "Host Codex runtime proxy: stopped"
    fi
    if runtime_proxy_uses_socket; then
      local runtime_proxy_socket
      runtime_proxy_socket="$(resolve_runtime_proxy_socket_host_path "$(read_env_value CODEX_RUNTIME_PROXY_SOCKET)")"
      echo "Socket: ${runtime_proxy_socket}"
    else
      echo "Endpoint: tcp://$(read_runtime_proxy_host):$(read_runtime_proxy_port)"
      echo "Bind host: $(read_runtime_proxy_bind_host)"
    fi
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
    validate_requested_backend
    command_up
    ;;
  down)
    validate_requested_backend
    command_down
    ;;
  status)
    validate_requested_backend
    command_status
    ;;
  logs)
    validate_requested_backend
    command_logs
    ;;
  monitor)
    validate_requested_backend
    command_monitor
    ;;
  *)
    echo "Usage: scripts/dev-stack.sh [up|down|status|logs|monitor] [stdio|socket-proxy|tcp-proxy]" >&2
    exit 1
    ;;
esac
