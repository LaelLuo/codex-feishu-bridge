# Architecture

## 总体原则

- `Codex CLI + codex app-server` 是真实运行后端
- VSCode 扩展是桌面图形前端，不是运行真身
- Feishu 是手机端线程和远程控制入口
- Docker 是默认的 Node and TypeScript 开发环境

## 四层拓扑

### Codex Runtime

- `codex app-server` 由 `bridge-daemon` 管理
- 认证、线程、turn、审批和事件流都从这里读取和写入
- 共享的 Codex home 用于保存登录态和线程存储
- Live validation can mount a host Codex binary directory into `/opt/host-codex-bin`
- Live validation can mount a host Codex home into `/codex-home` to reuse an existing ChatGPT login state

### Bridge Daemon

- 容器内常驻服务
- 负责 `codex app-server` 子进程管理
- 负责任务镜像、事件广播、审批状态机、uploads、Feishu 路由
- 负责状态文件持久化、重启恢复对账、过期审批清理
- 对外暴露 localhost HTTP 和 WebSocket

### VSCode Frontend

- 负责任务列表、任务详情、diff 面板、审批队列、登录状态页
- 负责桌面图片输入和 daemon 交互
- 暴露 `newTask`、`resumeTask`、`importThreads`、`sendMessage`、`interruptTask`、`approve*`、`retryTurn`、`openDiff`
- 只与本地 daemon 通信，不依赖 OpenAI VSCode 扩展私有实现

### Feishu Frontend

- 一个工作群作为入口
- 每个 bridge task 绑定一个 Feishu 线程或回复链
- 负责展示步骤、摘要、diff 摘要、审批和控制命令

### Shared Agent Hub

- 仓库外 sibling 目录 `/home/dungloi/Workspaces/codex-feishu-bridge-hub`
- 负责多 worktree agent 之间的动态 handoff、blocked、ack、done 和 broadcast
- `jsonl` 文件是机器真源，`views/*.md` 是 agent 直接阅读的人类友好镜像
- 只承载实时协作，不替代 repo 内的稳定状态文档

## 目录结构

- `apps/vscode-extension`: VSCode task dashboard and desktop actions
- `apps/bridge-daemon`: daemon runtime, Codex app-server adapter, Feishu bridge
- `packages/protocol`: shared bridge task, event, approval, and transport contracts
- `packages/shared`: config, filesystem, transport, and utility helpers
- `docker/`: runtime image, compose, env templates
- `docs/`: product, architecture, plan, status, logs, lessons, and agent manual
- `.agent/`: templates and checkpoints for long-running agent work

## 多 agent 通信模型

- `docs/worktree-agents.md` 是静态协议真源
- shared hub 是动态交接真源
- branch-local worktree 文件不再承担实时消息总线职责
- `coordinator-agent` 通过 hub 发起 broadcast 和 direct handoff
- worker agents 每轮开始前先读自己的 hub view，再继续实现工作

## 任务与线程模型

- `taskId` is the primary bridge identifier
- `threadId` is the Codex thread identifier
- `taskId = threadId` for bridge-managed tasks
- `manual-import` tasks retain the imported `threadId` and are normalized into the same task model
- One Feishu thread binds to one bridge task

## 核心数据结构

- `BridgeTask`
  - `taskId`, `threadId`, `mode`, `title`, `workspaceRoot`, `status`, `activeTurnId`, `feishuBinding`
- `BridgeEvent`
  - `seq`, `taskId`, `kind`, `timestamp`, `payload`
- `QueuedApproval`
  - `requestId`, `taskId`, `turnId`, `kind`, `reason`, `state`
- `ImageAsset`
  - `assetId`, `localPath`, `mimeType`, `createdAt`
- `DesktopClientState`
  - `clientId`, `kind`, `connectedAt`, `lastSeenAt`

## 输入输出边界

### Daemon HTTP

- `/health`
- `/auth/login/start`
- `/auth/account`
- `/auth/rate-limits`
- `/tasks`
- `/tasks/:id`
- `/tasks/:id/resume`
- `/tasks/:id/messages`
- `/tasks/:id/interrupt`
- `/tasks/:id/uploads`
- `/tasks/:id/approvals/*`
- `/tasks/:id/feishu/bind`
- `/tasks/import`
- `/feishu/webhook`

### Daemon WebSocket

- `snapshot` frame: full daemon snapshot for tasks, account, and rate limits
- `event` frame: bridge event delta with `kind`, `taskId`, `payload`, `seq`, and `timestamp`

## 图片与 uploads 流程

1. VSCode frontend receives a local image input.
2. Frontend posts the base64 payload to `/tasks/:id/uploads`.
3. Daemon writes the file into a persistent uploads directory.
4. Daemon passes the resulting local image reference into the target Codex thread.

## 恢复与持久化

- `BridgeService` 将任务状态持久化到 `stateDir/tasks.json`
- 重启时先加载持久化快照，再用 runtime 当前线程列表对账
- 若 runtime 已回到 `idle/completed/failed/interrupted` 而本地仍有 `pending` approval，会自动转成 `expired`
- Feishu webhook event id 持久化到 `stateDir/feishu-events.json`，用于重复回调去重

## CLI 包装器

- 根脚本 `scripts/bridge-cli.mjs` 提供 `list`、`import`、`resume`、`send`
- 在 `workspace-dev` 容器里使用时，daemon 地址默认应设为 `BRIDGE_BASE_URL=http://bridge-runtime:8787`

## Shared Hub CLI

- 根脚本 `scripts/hub-cli.mjs` 提供 `init`、`post`、`broadcast`、`read`、`ack`、`done`、`status`、`doctor`、`render`
- 默认 hub 目录是 `/home/dungloi/Workspaces/codex-feishu-bridge-hub`
- `CODEX_FEISHU_BRIDGE_HUB_ROOT` 可覆盖默认 hub 路径
- `CODEX_HUB_AGENT` 可在 `read`、`ack`、`done` 中作为默认 agent 身份

## Shared Hub File Contracts

- `broadcast.jsonl`: 全局广播真源
- `mailbox/<agent>.jsonl`: 单 agent 可见线程事件真源
- `views/<agent>.md`: agent 直接阅读的 inbox 镜像
- `views/broadcast.md`: operator 和 coordinator 阅读的广播视图
- `config.json`: hub 版本、agent 集合、默认路径
- `artifacts/`: 交接附件引用目录

## 容器规范

- Compose services stay `workspace-dev` and `bridge-runtime`
- Devcontainer default workspace stays `/workspace/codex-feishu-bridge`
- `bridge-runtime` mounts a shared Codex home path and an uploads directory
- `bridge-runtime` can also mount `${HOST_CODEX_HOME}` to `/codex-home` and `${HOST_CODEX_BIN_DIR}` to `/opt/host-codex-bin`
- Live `stdio` validation should set `BRIDGE_CODEX_HOME=/codex-home`, `CODEX_RUNTIME_BACKEND=stdio`, and `CODEX_APP_SERVER_BIN=/opt/host-codex-bin/codex`
- Host-native Node and TypeScript are optional; container is the default path

## 代码规范

- 默认使用 ASCII
- 包名统一使用 `@codex-feishu-bridge/*`
- 公共接口变更同步更新本文档
- 重要决策同步记录到 `docs/log.md`
- 不把 OpenAI VSCode 扩展私有实现重新引入主路径
