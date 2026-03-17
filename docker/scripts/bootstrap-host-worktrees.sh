#!/usr/bin/env bash

set -euo pipefail

workspace_root="${WORKSPACE_PATH:-/workspace/codex-feishu-bridge}"
git_file="${workspace_root}/.git"
mirror_root="/opt/host-workspaces"

if [[ -f "${git_file}" && -r "${git_file}" && -d "${mirror_root}" ]]; then
  gitdir_path="$(sed -n 's/^gitdir: //p' "${git_file}" | head -n 1)"
  if [[ "${gitdir_path}" == /* ]]; then
    repo_root="$(dirname "$(dirname "$(dirname "${gitdir_path}")")")"
    host_workspaces_root="$(dirname "${repo_root}")"
    if [[ ! -e "${host_workspaces_root}" ]]; then
      mkdir -p "$(dirname "${host_workspaces_root}")"
      ln -s "${mirror_root}" "${host_workspaces_root}"
    fi
  fi
fi

exec "$@"
