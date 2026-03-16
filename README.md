# codex-feishu-bridge

CLI-first Codex, VSCode, and Feishu bridge for multi-device task monitoring and control.

## Product Shape

This repository is built around three surfaces:

- `Codex CLI + codex app-server` as the real task runtime and auth surface
- `VSCode extension` as the desktop UI for tasks, diffs, approvals, and image inputs
- `Feishu` as the mobile multi-task thread interface

The OpenAI VSCode extension is not the runtime authority for this project.

## Current State

- Docker is the default environment for Node and TypeScript work.
- The monorepo is organized with `npm workspaces`.
- The architecture is locked to a CLI-first runtime.
- Implementation is in progress from a structure-first base.

## Quick Start

1. Copy `docker/.env.example` to `docker/.env` and fill the runtime values you want to use.
2. Start the development container:

```bash
docker compose -f docker/compose.yaml --env-file docker/.env.example up -d workspace-dev
```

3. Enter the development container:

```bash
docker compose -f docker/compose.yaml --env-file docker/.env.example exec workspace-dev bash
```

4. Install workspace dependencies inside the container:

```bash
npm install
```

5. Start the bridge runtime container when working on daemon features:

```bash
docker compose -f docker/compose.yaml --env-file docker/.env.example up -d bridge-runtime
```

## Runtime Notes

- `bridge-daemon` is the local bridge orchestrator.
- `codex app-server` is managed by the daemon and provides the thread runtime.
- VSCode connects to the daemon over localhost HTTP and WebSocket.
- Feishu callbacks enter through a user-provided public URL, typically exposed with a local tunnel such as `frp`.

## Repository Map

- `apps/vscode-extension`: desktop frontend for tasks, approvals, diffs, and image inputs
- `apps/bridge-daemon`: daemon runtime that owns Codex sessions and Feishu routing
- `packages/protocol`: shared bridge task, event, approval, and transport contracts
- `packages/shared`: shared config, filesystem, and transport helpers
- `docker/`: compose, images, and environment templates
- `docs/`: agent-facing product, architecture, status, plan, and decision records
- `.agent/`: future agent templates and checkpoints
