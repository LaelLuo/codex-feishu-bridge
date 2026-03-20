# Project Summary

记录相对稳定的项目级背景：

- `codex-feishu-bridge` 是一个 CLI-first 的 Codex / VSCode / Feishu 桥接仓库，真实运行时以 `codex app-server` 和 Codex CLI 为准，而不是 OpenAI VSCode 扩展。
- 仓库是 TypeScript monorepo，稳定目录边界为 `apps/`、`packages/`、`docker/`、`docs/`、`.agent/`。
- 主要子系统包括 `apps/bridge-daemon`、`apps/vscode-extension`、`packages/protocol`、`packages/shared`。
- Node 与 TypeScript 相关开发默认在 Docker 中完成；运行时支持容器内 `stdio` 模式与宿主机 `socket-proxy` 模式。
- 项目的公开产品与架构事实以 `README.md`、`docs/prd.md`、`docs/architecture.md` 为主，协作流程约束以 `AGENTS.md` 和 `docs/governance/agent-operating-model.md` 为主。
- 任务模型的稳定共识是 `bridge task` 对应 Codex thread，Feishu 线程按需绑定到同一个 bridge task。

不要在这里记录单个任务进度或会话流水账。
