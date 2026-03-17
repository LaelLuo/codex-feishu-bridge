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
- The bridge daemon, VSCode frontend, Feishu bridge, manual import flow, and recovery hardening are implemented in the local development path.
- `docs/plan.md` is the only execution-plan source for the repository.
- The current implementation focus is live validation, not new surface-area expansion.
- Multi-agent live validation now uses a sibling shared hub instead of branch-local handoff docs.

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

6. Build and test the implemented slices inside Docker:

```bash
npm run build:daemon
npm run test:daemon
npm run build:extension
npm run test:extension
```

7. Use the bridge CLI wrapper from the development container:

```bash
BRIDGE_BASE_URL=http://bridge-runtime:8787 npm run bridge:cli -- list
BRIDGE_BASE_URL=http://bridge-runtime:8787 npm run bridge:cli -- import
BRIDGE_BASE_URL=http://bridge-runtime:8787 npm run bridge:cli -- resume <task-id>
```

8. Run the read-only live runtime probe inside the development container:

```bash
npm run validate:runtime:container
```

9. Load `apps/vscode-extension` in VSCode to use the desktop task view and commands.

## Shared Hub Workflow

Use the shared hub when multiple Codex CLI agents are running in separate worktrees:

1. Initialize the sibling hub once:

```bash
npm run hub:init
```

2. Check hub health and current thread status:

```bash
npm run hub:doctor
npm run hub:status
```

3. Read one agent inbox view directly:

```bash
npm run hub:read -- --agent feishu-agent
```

4. Send a direct handoff:

```bash
npm run hub:post -- --from coordinator-agent --to feishu-agent --kind handoff --summary "Validate live webhook flow" --body "Use the real callback URL and report blocked conditions."
```

5. Send a whole-team broadcast:

```bash
npm run hub:broadcast -- --from coordinator-agent --summary "Hub cutover is active" --body "Read your inbox view before resuming work."
```

6. Acknowledge and close a thread:

```bash
node scripts/hub-cli.mjs ack --agent feishu-agent --thread <thread-id> --summary "Accepted"
node scripts/hub-cli.mjs done --agent feishu-agent --thread <thread-id> --summary "Completed"
```

The default hub path is `/home/dungloi/Workspaces/codex-feishu-bridge-hub`.
Override it with `CODEX_FEISHU_BRIDGE_HUB_ROOT` when needed.

## Live Validation Workflow

Use this sequence for the next end-to-end pass:

1. Start `bridge-runtime` with `CODEX_RUNTIME_BACKEND=stdio`.
2. If you want Docker to reuse a real host login state and host `codex` binary, set:

```bash
export HOST_CODEX_HOME=/home/you/.codex
export HOST_CODEX_BIN_DIR=/path/to/codex-bin-dir
export BRIDGE_CODEX_HOME=/codex-home
export CODEX_APP_SERVER_BIN=/opt/host-codex-bin/codex
export CODEX_RUNTIME_BACKEND=stdio
```

3. Start the runtime container with those overrides in scope:

```bash
docker compose -f docker/compose.yaml --env-file docker/.env.example up -d bridge-runtime
```

4. Verify auth endpoints before creating tasks:

```bash
curl http://127.0.0.1:8787/health
curl http://127.0.0.1:8787/auth/account
curl http://127.0.0.1:8787/auth/rate-limits
```

5. Run the read-only runtime helper:

```bash
npm run validate:runtime
```

6. If you want a no-prompt thread creation and resume check, run:

```bash
npm run validate:runtime -- --create-thread --workspace-root /workspace/codex-feishu-bridge
```

If you are running inside `workspace-dev`, use `BRIDGE_BASE_URL=http://bridge-runtime:8787` or the shortcut:

```bash
npm run validate:runtime:container
BRIDGE_BASE_URL=http://bridge-runtime:8787 npm run validate:runtime -- --create-thread --workspace-root /workspace/codex-feishu-bridge
```

7. Build the extension and launch the Extension Development Host:

```bash
npm run build:extension
```

Then open the repository in VSCode and run the `Codex Feishu Bridge Extension` launch target from [.vscode/launch.json](/home/dungloi/Workspaces/codex-feishu-bridge/.vscode/launch.json).

8. In the Extension Development Host:
- open the `Codex Bridge Tasks` view in Explorer
- run `Codex Bridge: Refresh Tasks`
- run `Codex Bridge: Open Status`
- create or resume a task and verify task state, diffs, approvals, and uploads against the daemon

9. Expose `/feishu/webhook` with a user-provided public URL and validate threaded message creation plus reply routing from a real Feishu chat.

## Multi-Agent Restart Workflow

After hub cutover, restart the five worktree agents and reopen the same conversation state:

```bash
cd /home/dungloi/Workspaces/codex-feishu-bridge-coordinator && codex -a never -s workspace-write resume --last
cd /home/dungloi/Workspaces/codex-feishu-bridge-runtime && codex -a never -s danger-full-access resume --last
cd /home/dungloi/Workspaces/codex-feishu-bridge-feishu && codex -a never -s danger-full-access resume --last
cd /home/dungloi/Workspaces/codex-feishu-bridge-desktop && codex -a never -s workspace-write resume --last
cd /home/dungloi/Workspaces/codex-feishu-bridge-qa && codex -a never -s workspace-write resume --last
```

After restart, each agent should:

1. Read `AGENTS.md`
2. Read the repo docs in the normal order
3. Read `/home/dungloi/Workspaces/codex-feishu-bridge-hub/views/<agent>.md`
4. Use the hub CLI for all dynamic handoffs and blocked states

## Runtime Notes

- `bridge-daemon` is the local bridge orchestrator.
- `codex app-server` is managed by the daemon and provides the thread runtime.
- VSCode connects to the daemon over localhost HTTP and WebSocket.
- Feishu callbacks enter through a user-provided public URL, typically exposed with a local tunnel such as `frp`.
- The daemon now exposes `/tasks`, `/tasks/import`, `/tasks/:id/resume`, `/tasks/:id/messages`, `/tasks/:id/uploads`, `/tasks/:id/approvals/*`, and `/feishu/webhook`.
- The daemon persists task state under `.tmp/` and reconciles recovered tasks on restart.
- Live runtime validation should prefer `CODEX_RUNTIME_BACKEND=stdio` so the daemon manages the real `codex app-server` process directly.
- Reusing a host login state in Docker uses `HOST_CODEX_HOME -> /codex-home`.
- Reusing a host Codex executable in Docker uses `HOST_CODEX_BIN_DIR -> /opt/host-codex-bin`.
- `npm run validate:runtime` is read-only by default.
- `npm run validate:runtime -- --create-thread` creates and resumes a real thread without sending a prompt.

## Feishu Notes

- Set `FEISHU_APP_ID`, `FEISHU_APP_SECRET`, `FEISHU_VERIFICATION_TOKEN`, `FEISHU_ENCRYPT_KEY`, and `FEISHU_DEFAULT_CHAT_ID` in `docker/.env`.
- Each task is mirrored into one Feishu root message plus reply chain.
- Incoming text replies support plain message steering plus control words such as `approve`, `decline`, `cancel`, `interrupt`, and `retry`.

## Repository Map

- `apps/vscode-extension`: desktop frontend for tasks, approvals, diffs, and image inputs
- `apps/bridge-daemon`: daemon runtime that owns Codex sessions and Feishu routing
- `packages/protocol`: shared bridge task, event, approval, and transport contracts
- `packages/shared`: shared config, filesystem, and transport helpers
- `docker/`: compose, images, and environment templates
- `docs/`: agent-facing product, architecture, status, plan, and decision records
- `.agent/`: future agent templates and checkpoints
