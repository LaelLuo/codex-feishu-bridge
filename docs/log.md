# Log

## 2026-03-17

- Initialized the `codex-feishu-bridge` repository under `/home/dungloi/Workspaces`.
- Chose a Docker-first setup with `docker/compose.yaml` and `.devcontainer/devcontainer.json`.
- Fixed `npm workspaces` as the monorepo package manager strategy.
- Created agent-facing project memory files under `docs/` and root `AGENTS.md`.
- Reserved `apps/vscode-extension`, `apps/bridge-daemon`, `packages/protocol`, and `packages/shared`.
- Rebased the architecture onto `Codex CLI + codex app-server` instead of the OpenAI VSCode extension runtime.
- Locked the desktop surface to a self-owned VSCode extension and the mobile surface to Feishu threads.
- Chose a user-provided public callback URL for Feishu ingress instead of a built-in public relay.
- Added a repository rule to auto-commit each independently testable major change slice using `gitmoji + prefix`.
