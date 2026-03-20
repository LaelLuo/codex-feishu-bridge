# Architecture

## 总体原则

- `Codex CLI + codex app-server` 是真实运行后端
- VSCode 扩展是桌面图形前端，不是运行真身
- Feishu 是手机端线程和远程控制入口
- Docker 是默认的 Bun and TypeScript 开发环境
- 对仓库使用者可见的默认工作流保持 bun-first：依赖安装、脚本入口、测试链路和开发容器都优先使用 Bun
- 剩余的 Node 相关项只保留在平台或兼容层：例如 VSCode extension 的 Node 宿主约束、`node:*` 标准库导入、类型定义和上游包名；这些不改变 bun-first 默认路径

## 四层拓扑

### Codex Runtime

- `codex app-server` 由 `bridge-daemon` 管理
- 认证、线程、turn、审批和事件流都从这里读取和写入
- 共享的 Codex home 用于保存登录态和线程存储
- Live validation can mount a host Codex binary directory into `/opt/host-codex-bin`
- Live validation can mount a host Codex home into `/codex-home` to reuse an existing ChatGPT login state
- Host-native 模式下，`bridge-daemon` 与 `codex app-server` 都直接运行在宿主机，不经过容器
- Host-native 默认不再向 child 进程强制注入 `CODEX_HOME`；bridge 只保留一个名义上的默认 home 路径用于状态读取与路径解释
- Host-native 默认不会因为本机登录态文件、realpath 或同步链接指向 `OneDrive\Codex` 就把该目录当成隐式运行时 home
- 只有在显式设置 `BRIDGE_CODEX_HOME` / `CODEX_HOME` 时，host-native 才会把该目录作为运行时 home 传给 `codex app-server`
- 当 `CODEX_RUNTIME_BACKEND=socket-proxy` 时，真正执行任务的 `codex app-server` 由一个宿主机 sidecar 托管，并通过项目 `.tmp/` 下的 Unix socket 暴露给容器内 daemon
- 当 `CODEX_RUNTIME_BACKEND=tcp-proxy` 时，真正执行任务的 `codex app-server` 同样由宿主机 sidecar 托管，但 daemon 通过 `host:port` 连接，适合 Windows 宿主机 + Linux 容器组合
- 代理模式用于 imported host threads：绑定 Feishu 后仍保留宿主机原始文件视野，而不需要把整个 daemon 裸跑到宿主机

### Bridge Daemon

- 默认是容器内常驻服务，也支持 host-native 直接运行
- 在默认 `stdio` 模式下直接管理 `codex app-server` 子进程
- 在 `socket-proxy` 模式下改为连接宿主机 sidecar 暴露的 Unix socket
- 在 `tcp-proxy` 模式下改为连接宿主机 sidecar 暴露的 TCP 端点
- 代理模式下 Feishu、HTTP、WebSocket、状态持久化仍然留在 daemon 这一侧
- 负责任务镜像、事件广播、审批状态机、uploads、Feishu 路由
- 负责状态文件持久化、重启恢复对账、过期审批清理
- 对外暴露 localhost HTTP 和 WebSocket

### VSCode Frontend

- 负责任务列表、编辑器页监视器、任务详情、diff 面板、审批队列、登录状态页
- 负责桌面文本、图片、文件输入和 daemon 交互
- 主监视器通过 `Open Monitor` 命令以 Webview editor tab 打开，而不是常驻侧栏
- VSCode 调试启动项通过 `preLaunchTask` 复用根脚本的一键启动流程，并在 Extension Development Host 里自动打开 monitor
- 监视器页内置任务列表、Conversation、Desktop Composer，以及本地任务多选批量清理
- Desktop Composer 可直接设置后续 turn 的 `model`、`effort`、`planMode`，并附加本地照片或文件
- 监视器页支持对未绑定任务一键 `Bind to New Feishu Topic`，在默认飞书群里创建新话题并立刻绑定当前任务
- 监视器页支持直接重命名任务；这会更新 bridge task 标题，并同步到任何已绑定的 Feishu 主任务卡
- 任务卡片同时显示任务启动来源标签和当前 Feishu 绑定标签，例如 `VSCODE + FEISHU`、`CLI + FEISHU`
- 监视器页可切换“Feishu 在运行中发来的消息是直接 steer 当前 turn，还是 queue 到下一轮”
- 暴露 `openMonitor`、`newTask`、`resumeTask`、`importThreads`、`sendMessage`、`interruptTask`、`approve*`、`retryTurn`、`openDiff`
- 只与本地 daemon 通信，不依赖 OpenAI VSCode 扩展私有实现

### Feishu Frontend

- 一个工作群作为入口
- 每个 bridge task 绑定一个 Feishu 线程或回复链
- `FEISHU_DEFAULT_CHAT_ID` / `FEISHU_DEFAULT_CHAT_NAME` 只决定 bridge 主动新建飞书话题时默认落到哪个群，例如 VSCode monitor 的 `Bind to New Feishu Topic`；入站消息路由仍以事件里的真实 `chat_id` 为准
- 负责移动端对话、审批和控制命令
- 未绑定线程先进入 draft card；draft 与已绑定任务卡都可设置 `model`、`effort`、`planMode`
- Feishu 的文本、图片、文件消息都可以进入同一个 task；图片走原生图像输入，文件作为本地路径附件交给 Codex
- 私聊可以直接发送普通 `text`；群聊应在话题模式里 `@` 机器人，Feishu 常会把这类消息投递为 `post` 富文本，bridge 会先提取可见正文再继续按文本消息路由
- 已绑定任务卡提供 `Rename Task`、`Archive Task`、`Unbind Thread` 和 `More` 查询入口
- `Rename Task` 会先下发一张独立的重命名卡；提交后会更新共享 task 标题，并同步回 VSCode monitor 与 Feishu 主任务卡
- 任意一条 Feishu 文本、图片、文件消息都会立即回一张独立的 `Task Activity` 卡，说明这条消息是直接开始 turn、注入当前 turn、还是排队到下一轮
- 当消息因任务忙碌而排队时，独立 `Task Activity` 卡会提供 `Withdraw This Message` 和 `Run This Message Now` / `Interrupt + Run This Message Now`
- `More` 菜单里的状态、任务、健康度、账号、额度查询都通过新的只读快照卡回复，而不是覆盖主任务卡
- `Archive Task` 会终结当前 Feishu 话题的 bridge 绑定能力；后续同话题里的文本、图片、文件不会再继续同步到主机任务

## 目录结构

- `apps/vscode-extension`: VSCode task dashboard and desktop actions
- `apps/bridge-daemon`: daemon runtime, Codex app-server adapter, Feishu bridge
- `packages/protocol`: shared bridge task, event, approval, and transport contracts
- `packages/shared`: config, filesystem, transport, and utility helpers
- `docker/`: runtime image, compose, env templates
- `docs/`: product, architecture, plan, status, logs, lessons, and agent manual
- `.agent/`: templates and checkpoints for long-running agent work

## 任务与线程模型

- `taskId` is the primary bridge identifier
- `threadId` is the Codex thread identifier
- `taskId = threadId` for bridge-managed tasks
- `manual-import` tasks retain the imported `threadId` and are normalized into the same task model
- One Feishu thread binds to one bridge task
- 手动重命名后的 `title` 会被 bridge 持久化，并优先于后续 runtime thread name 同步结果，直到再次显式重命名

## 核心数据结构

- `BridgeTask`
  - `taskId`, `threadId`, `mode`, `taskOrigin`, `title`, `titleLocked`, `workspaceRoot`, `status`, `activeTurnId`, `feishuBinding`, `feishuRunningMessageMode`, `queuedMessageCount`
- `BridgeEvent`
  - `seq`, `taskId`, `kind`, `timestamp`, `payload`
- `QueuedApproval`
  - `requestId`, `taskId`, `turnId`, `kind`, `reason`, `state`
- `TaskAsset`
  - `assetId`, `kind`, `displayName`, `localPath`, `mimeType`, `createdAt`
- `DesktopClientState`
  - `clientId`, `kind`, `connectedAt`, `lastSeenAt`

## 输入输出边界

### Daemon HTTP

- `/health`
- `/auth/login/start`
- `/auth/account`
- `/auth/rate-limits`
- `/models`
- `/tasks`
- `/tasks/:id`
- `/tasks/:id/resume`
- `/tasks/:id/messages`
- `/tasks/:id/title`
- `/tasks/:id/interrupt`
- `/tasks/:id/uploads`
- `/tasks/:id/approvals/*`
- `/tasks/:id/feishu/bind`
- `/tasks/:id/feishu/topic`
- `/tasks/import`
- `/feishu/webhook`

### Daemon WebSocket

- `snapshot` frame: full daemon snapshot for tasks, account, and rate limits
- `event` frame: bridge event delta with `kind`, `taskId`, `payload`, `seq`, and `timestamp`

## 附件与 uploads 流程

1. VSCode frontend or Feishu bridge receives a local image/file input.
2. Frontend posts the base64 payload to `/tasks/:id/uploads`.
3. Daemon writes the file into a persistent uploads directory.
4. 图片附件会作为 `localImage` 输入项直接传给 Codex。
5. 通用文件附件会记录为 task asset，并在用户消息里附带本地文件路径提示，让 Codex 通过工具从磁盘读取。

## 恢复与持久化

- `BridgeService` 将任务状态持久化到 `stateDir/tasks.json`
- 重启时先加载持久化快照，再用 runtime 当前线程列表对账
- 若 runtime 已回到 `idle/completed/failed/interrupted` 而本地仍有 `pending` approval，会自动转成 `expired`
- Feishu webhook event id 持久化到 `stateDir/feishu-events.json`，用于重复回调去重
- Feishu draft card、任务控制卡、逐消息 `Task Activity` 卡和 archived thread 状态也持久化到 `stateDir/feishu-events.json`

## CLI 包装器

- 根脚本 `scripts/bridge-cli.mjs` 提供 `list`、`import`、`resume`、`send`
- 根脚本 `scripts/host-stack.ts` 提供 `start:host` 所需的宿主机原生启动入口：复用 `docker/.env`，自动把容器路径换算成宿主机路径，并在启动前构建 daemon 依赖
- `docker/.env` 中的 `FEISHU_DEFAULT_CHAT_ID` / `FEISHU_DEFAULT_CHAT_NAME` 仅用于 bridge 主动创建新飞书话题时的默认目标群，不作为私聊或群聊入站消息的硬限制
- `start:host` 默认不再复用 Docker `.tmp/codex-home`，也不会因为登录态 realpath 命中 `OneDrive\Codex` 就切换默认目录；它优先让本机 `codex` 按默认 home 语义启动，仅在显式配置时才注入 `CODEX_HOME`
- 根脚本 `scripts/dev-stack.sh` 提供 `up`、`monitor`、`down`、`status`、`logs` 的一键开发环境启动入口，并会在首次运行时自动创建、补齐 `docker/.env`
- `scripts/dev-stack.sh up|monitor` 可选附带 `stdio`、`socket-proxy` 或 `tcp-proxy` 参数，用来显式切换 Docker-host 权限模式
- 根 `package.json` 提供 `start:host`、`start:tcp-proxy`、`monitor:tcp-proxy` 等 bun 包装命令，用于不手改 `.env` 的一键启动
- 当 `CODEX_RUNTIME_BACKEND=socket-proxy` 或 `tcp-proxy` 时，`scripts/dev-stack.sh up` / `monitor` 会先在宿主机启动一个薄的 `codex app-server` proxy，再拉起容器内 `bridge-runtime`
- 在 `workspace-dev` 容器里使用时，daemon 地址默认应设为 `BRIDGE_BASE_URL=http://bridge-runtime:8787`

## Optional Coordination Utilities

- 根脚本 `scripts/hub-cli.mjs` 提供一个本地多-agent 协调工具集
- 默认 hub 目录可由 `CODEX_FEISHU_BRIDGE_HUB_ROOT` 覆盖
- 这些工具不是 bridge 运行时的必需部分，也不是公开产品主路径

## 容器规范

- Compose services stay `workspace-dev` and `bridge-runtime`
- Devcontainer default workspace stays `/workspace/codex-feishu-bridge`
- Default dev image is the official `oven/bun` base, and the devcontainer connects as the `bun` user
- `bridge-runtime` mounts a shared Codex home path and an uploads directory
- `bridge-runtime` can also mount `${HOST_CODEX_HOME}` to `/codex-home` and `${HOST_CODEX_BIN_DIR}` to `/opt/host-codex-bin`
- `bridge-runtime` also receives `CODEX_RUNTIME_PROXY_HOST` / `PORT` / `BIND_HOST` so Docker-side daemon can connect back to a host-side TCP proxy
- Live `stdio` validation should set `BRIDGE_CODEX_HOME=/codex-home`, `CODEX_RUNTIME_BACKEND=stdio`, and `CODEX_APP_SERVER_BIN=/opt/host-codex-bin/bin/codex.js`
- `socket-proxy` validation should keep `bridge-daemon` in Docker, set `CODEX_RUNTIME_BACKEND=socket-proxy`, and let the host sidecar expose `codex app-server` through `.tmp/codex-runtime-proxy.sock`
- `tcp-proxy` validation should keep `bridge-daemon` in Docker, set `CODEX_RUNTIME_BACKEND=tcp-proxy`, and let the host sidecar expose `codex app-server` through `host.docker.internal:<port>`
- Host-native Bun and TypeScript are optional; container is the default path

## 代码规范

- 默认使用 ASCII
- 包名统一使用 `@codex-feishu-bridge/*`
- 公共接口变更同步更新本文档
- 不把 OpenAI VSCode 扩展私有实现重新引入主路径
