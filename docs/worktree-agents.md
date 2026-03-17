# Worktree Agents

This file is the static coordination guide for parallel agent execution in this repository.
Use it to define ownership, startup order, merge order, and the shared hub workflow.

Repository docs are the stable rule source.
The shared hub is the live message bus.

## Purpose

- Split the remaining work into clear ownership boundaries.
- Keep shared docs and merge order under control.
- Provide one restartable workflow for five independent Codex CLI agents.
- Move live handoffs out of branch-local files and into one shared hub.

## Read Order

Every new agent must read these sources before changing anything:

1. `AGENTS.md`
2. `docs/status.md`
3. `docs/plan.md`
4. `docs/log.md`
5. `docs/architecture.md`
6. `docs/agents.md`
7. `docs/worktree-agents.md`
8. `/home/dungloi/Workspaces/codex-feishu-bridge-hub/views/<your-agent>.md` when the task is part of a multi-agent effort

## Worktree Naming

Recommended worktree and branch names:

- `../codex-feishu-bridge-coordinator` on branch `agent/coordinator`
- `../codex-feishu-bridge-runtime` on branch `agent/runtime`
- `../codex-feishu-bridge-feishu` on branch `agent/feishu`
- `../codex-feishu-bridge-desktop` on branch `agent/desktop`
- `../codex-feishu-bridge-qa` on branch `agent/qa`

Recommended creation pattern:

```bash
git worktree add ../codex-feishu-bridge-runtime -b agent/runtime
```

## Shared Hub

Live coordination no longer happens through branch-local markdown files.
All runtime handoffs, blockers, acknowledgements, and completion notices go through the shared hub:

```text
/home/dungloi/Workspaces/codex-feishu-bridge-hub
```

Hub layout:

```text
codex-feishu-bridge-hub/
├── README.md
├── config.json
├── broadcast.jsonl
├── mailbox/
│   ├── coordinator-agent.jsonl
│   ├── runtime-agent.jsonl
│   ├── feishu-agent.jsonl
│   ├── desktop-agent.jsonl
│   └── qa-agent.jsonl
├── views/
│   ├── broadcast.md
│   ├── coordinator-agent.md
│   ├── runtime-agent.md
│   ├── feishu-agent.md
│   ├── desktop-agent.md
│   └── qa-agent.md
└── artifacts/
```

Rules:

- `broadcast.jsonl` and `mailbox/*.jsonl` are append-only machine truth.
- `views/*.md` are readable mirrors for agents.
- Do not hand-edit hub `jsonl` files.
- Use `node scripts/hub-cli.mjs ...` or the matching `npm run hub:*` script for all writes.
- Stable project memory still lives in repo docs, not in the hub.

## Startup and Resume Workflow

Use these commands when launching or relaunching the agent set.

### Initialize the Hub

Run this once before restarting the agent set into the shared hub workflow:

```bash
cd /home/dungloi/Workspaces/codex-feishu-bridge
npm run hub:init
```

### First Launch

Recommended startup order:

1. `@coordinator-agent`
2. `@runtime-agent`
3. `@desktop-agent`
4. `@feishu-agent`
5. `@qa-agent`

Recommended approval and sandbox defaults:

- `@coordinator-agent`: `-a never -s workspace-write`
- `@runtime-agent`: `-a never -s danger-full-access`
- `@desktop-agent`: `-a never -s workspace-write`
- `@feishu-agent`: `-a never -s danger-full-access`
- `@qa-agent`: `-a never -s workspace-write`

Launch commands:

```bash
cd /home/dungloi/Workspaces/codex-feishu-bridge-coordinator && codex -a never -s workspace-write
cd /home/dungloi/Workspaces/codex-feishu-bridge-runtime && codex -a never -s danger-full-access
cd /home/dungloi/Workspaces/codex-feishu-bridge-desktop && codex -a never -s workspace-write
cd /home/dungloi/Workspaces/codex-feishu-bridge-feishu && codex -a never -s danger-full-access
cd /home/dungloi/Workspaces/codex-feishu-bridge-qa && codex -a never -s workspace-write
```

### Resume After Exit

After hub cutover, reopen the same conversation state with `resume --last`:

```bash
cd /home/dungloi/Workspaces/codex-feishu-bridge-coordinator && codex -a never -s workspace-write resume --last
cd /home/dungloi/Workspaces/codex-feishu-bridge-runtime && codex -a never -s danger-full-access resume --last
cd /home/dungloi/Workspaces/codex-feishu-bridge-feishu && codex -a never -s danger-full-access resume --last
cd /home/dungloi/Workspaces/codex-feishu-bridge-desktop && codex -a never -s workspace-write resume --last
cd /home/dungloi/Workspaces/codex-feishu-bridge-qa && codex -a never -s workspace-write resume --last
```

### Operator Notes

- Use one terminal per worktree.
- Start `@coordinator-agent` first so shared docs and broadcasts have a single intake point.
- Prefer `resume --last` over starting a fresh session when the agent already has context.
- Reopen any agent that should stop asking for `Y` approvals with `-a never`.
- Keep runtime and Feishu sessions on `danger-full-access` only when the task truly needs host-level freedom.
- After restart, every agent should read its hub view before resuming implementation.

## Shared Rules

- One agent owns one worktree and one primary capability area at a time.
- Keep commits focused to one independently verifiable slice.
- Use Docker for Node and TypeScript work unless the task explicitly targets host runtime behavior.
- Do not edit another agent's owned feature files without a logged hub handoff or explicit reassignment.
- Shared coordination files are reserved to `@coordinator-agent` by default:
  - `docs/status.md`
  - `docs/plan.md`
  - `docs/log.md`
  - `docs/worktree-agents.md`
  - `AGENTS.md`
  - `docs/agents.md`
- Feature agents may propose edits to shared docs, but dynamic requests and blockers must travel through the hub first.

## Ownership Matrix

### @coordinator-agent

- Owns:
  - `docs/status.md`
  - `docs/plan.md`
  - `docs/log.md`
  - `docs/worktree-agents.md`
  - `AGENTS.md`
  - `docs/agents.md`
- May touch:
  - `README.md`
  - `docs/architecture.md`
- Must not expand into feature implementation unless the user explicitly reassigns scope.
- Primary duties:
  - track overall phase progress
  - resolve ownership conflicts
  - collect blockers from other agents
  - decide merge order and readiness
  - publish broadcasts and direct handoffs in the shared hub

### @runtime-agent

- Owns:
  - `apps/bridge-daemon/src/runtime/**`
  - `apps/bridge-daemon/src/service/**`
  - `packages/protocol/**` when runtime-driven schema changes are required
  - `docker/**` when runtime mounting or launch behavior changes
  - `scripts/live-runtime-check.mjs`
- May touch:
  - `apps/bridge-daemon/tests/**`
  - `docs/architecture.md` for runtime interface updates through coordinator handoff
- Must not lead:
  - Feishu product behavior changes
  - VSCode UI work
- Current focus:
  - finish daemon-driven live thread and turn control validation

### @feishu-agent

- Owns:
  - `apps/bridge-daemon/src/feishu/**`
  - Feishu-related webhook handling in `apps/bridge-daemon/src/server/http.ts`
- May touch:
  - `apps/bridge-daemon/tests/feishu-*`
  - `README.md` Feishu setup sections through coordinator handoff
- Must not lead:
  - runtime adapter changes unrelated to Feishu payload needs
  - VSCode UI behavior
- Current focus:
  - real app credential flow
  - webhook verification
  - threaded message routing

### @desktop-agent

- Owns:
  - `apps/vscode-extension/**`
  - `.vscode/launch.json`
- May touch:
  - `README.md` desktop workflow sections through coordinator handoff
  - `docs/architecture.md` desktop UI sections through coordinator handoff
- Must not lead:
  - daemon runtime protocol changes unless blocked by the desktop flow
  - Feishu ingress behavior
- Current focus:
  - Extension Development Host validation
  - task tree, detail panel, diff, approvals, and upload live pass

### @qa-agent

- Owns:
  - validation scripts under `scripts/**` when they are cross-cutting
  - cross-module acceptance notes and test matrices
  - execution reports requested by coordinator
- May touch:
  - test files across modules with explicit slice boundaries
  - `README.md` validation sections through coordinator handoff
- Must not lead:
  - product behavior changes
  - architectural reassignment
- Current focus:
  - keep live validation repeatable
  - maintain acceptance evidence for runtime, desktop, and Feishu paths

## Shared Hub Commands

The operator and agents use the following command set:

```bash
npm run hub:init
npm run hub:status
npm run hub:doctor
npm run hub:read -- --agent feishu-agent
npm run hub:broadcast -- --from coordinator-agent --summary "Hub cutover is active" --body "Read your hub view before coding."
npm run hub:post -- --from coordinator-agent --to feishu-agent --kind handoff --summary "Validate live webhook flow" --body-file /tmp/body.md
node scripts/hub-cli.mjs ack --agent feishu-agent --thread <thread-id> --summary "Accepted"
node scripts/hub-cli.mjs done --agent feishu-agent --thread <thread-id> --summary "Completed"
```

Supported message kinds:

- `handoff`
- `needs-input`
- `blocked`
- `ack`
- `done`
- `decision-needed`
- `fyi`
- `ready-for-merge`
- `broadcast`

Hub usage rules:

- `post` is for direct agent-to-agent work requests.
- `broadcast` is for whole-team operator or coordinator notices.
- `ack` confirms the receiver has accepted a thread.
- `done` closes a thread and signals the handoff is complete.
- `status` is the coordinator's quick health view across all agent mailboxes.
- `doctor` checks config, lock, parse validity, and missing hub files.

## Merge Order

Recommended merge order for the remaining phase:

1. `@runtime-agent`
2. `@desktop-agent`
3. `@feishu-agent`
4. `@qa-agent`
5. `@coordinator-agent` final docs and status consolidation

Rationale:

- runtime contracts stabilize first
- desktop and Feishu can then validate against the same daemon behavior
- QA consolidates evidence after feature paths settle
- coordinator closes shared docs last

## Bootstrap Prompt Template

Use this as the common prefix for any new agent:

```text
你在 `codex-feishu-bridge` 项目中工作，并且已经被分配到一个独立 git worktree。

在开始前，必须依次阅读：
1. AGENTS.md
2. docs/status.md
3. docs/plan.md
4. docs/log.md
5. docs/architecture.md
6. docs/agents.md
7. docs/worktree-agents.md
8. /home/dungloi/Workspaces/codex-feishu-bridge-hub/views/<你的 agent 名称>.md

硬规则：
- Docker 是默认开发环境。
- 不要把 OpenAI VSCode 扩展重新作为运行真身。
- 你的 commit 必须使用 `gitmoji + conventional prefix`。
- 每个 commit 只包含一个可独立验证的切片。
- 跨边界协作只能通过 shared hub，不要把 repo docs 当实时消息通道。
- 不要静默修改共享协调文档，除非你的角色明确拥有它，或 coordinator 已经交接。

你的目标是：先读取项目记忆，再只在你的职责边界内推进工作；遇到阻塞时，用 hub CLI 发 handoff、blocked、needs-input 或 ack，而不是自己扩大范围。
```

## Post-Cutover Restart Message

Use this as the first operator reminder after all five agents restart:

```text
从现在开始，动态交接和阻塞不再写到各自 worktree 的 docs/worktree-agents.md。

你必须：
1. 先读 AGENTS.md 和 repo docs。
2. 再读 /home/dungloi/Workspaces/codex-feishu-bridge-hub/views/<你的 agent>.md。
3. 动态 handoff / blocked / ack / done 全部通过 hub CLI 完成。
4. repo docs 只用于稳定规则、状态收口和架构沉淀。
```

## Role Prompts

### Prompt for @coordinator-agent

```text
你是 `@coordinator-agent`。

你的唯一职责是协调，不是抢实现。

你拥有：
- docs/status.md
- docs/plan.md
- docs/log.md
- docs/worktree-agents.md
- AGENTS.md
- docs/agents.md

你的目标：
- 维护多 agent 并行时的边界、阻塞、交接和合并顺序
- 收拢共享文档
- 追踪哪些工作已经 ready for merge
- 避免多个 agent 同时修改同一类共享文件
- 通过 shared hub 发布 handoff 和 broadcast

你不应该主动承担 runtime、Feishu、VSCode 具体功能实现，除非用户重新分配职责。

开工后先做三件事：
1. 阅读全部项目记忆文档
2. 阅读 /home/dungloi/Workspaces/codex-feishu-bridge-hub/views/coordinator-agent.md
3. 只更新协调文档，不写功能代码
```

### Prompt for @runtime-agent

```text
你是 `@runtime-agent`。

你的职责边界：
- apps/bridge-daemon/src/runtime/**
- apps/bridge-daemon/src/service/**
- packages/protocol/** 当且仅当 runtime schema 变化需要同步
- docker/** 当 runtime 挂载、启动、容器联调方式变化时
- scripts/live-runtime-check.mjs

你的当前目标：
- 完成真实 daemon 驱动下的 `thread/start`
- 完成真实 daemon 驱动下的 `turn/start`
- 完成真实 daemon 驱动下的 `turn/steer`
- 完成真实 daemon 驱动下的 `turn/interrupt`
- 若 live app-server 协议和当前实现不一致，只修适配层和相关测试

你不负责：
- Feishu 产品逻辑
- VSCode 前端交互
- 共享协调文档收口

开工前先读 /home/dungloi/Workspaces/codex-feishu-bridge-hub/views/runtime-agent.md。
如果需要别的 agent 配合，通过 shared hub 发消息，不要改 repo docs 当消息板。
```

### Prompt for @feishu-agent

```text
你是 `@feishu-agent`。

你的职责边界：
- apps/bridge-daemon/src/feishu/**
- apps/bridge-daemon/src/server/http.ts 中与 Feishu webhook 直接相关的部分
- Feishu 相关测试和联调说明

你的当前目标：
- 用真实 `FEISHU_APP_ID / APP_SECRET / VERIFICATION_TOKEN / ENCRYPT_KEY / DEFAULT_CHAT_ID` 准备联调
- 校验签名、回调格式、重复投递去重
- 验证一个 task 对应一条 Feishu 根消息/回复链
- 验证 reply / approve / decline / cancel / interrupt / retry 路由

你不负责：
- runtime 适配器主逻辑
- VSCode UI
- 共享状态文档收口

开工前先读 /home/dungloi/Workspaces/codex-feishu-bridge-hub/views/feishu-agent.md。
缺少公网回调地址或真实凭证时，不要伪造完成；通过 shared hub 标记 blocked。
```

### Prompt for @desktop-agent

```text
你是 `@desktop-agent`。

你的职责边界：
- apps/vscode-extension/**
- .vscode/launch.json
- README.md 中与 Extension Development Host 直接相关的部分

你的当前目标：
- 在真实 daemon 下跑一遍 Extension Development Host
- 验证 task tree、detail panel、diff、login、send message、image upload、approval、retry
- 如果 live daemon 行为暴露 UI 适配问题，只改 VSCode 前端及其测试

你不负责：
- Feishu webhook
- daemon runtime 主适配
- 共享协调文档

开工前先读 /home/dungloi/Workspaces/codex-feishu-bridge-hub/views/desktop-agent.md。
若发现需要 runtime 变更，先通过 shared hub 联系 `@runtime-agent`，不要自行重写 daemon 契约。
```

### Prompt for @qa-agent

```text
你是 `@qa-agent`。

你的职责边界：
- 跨模块验证脚本
- 回归和验收矩阵
- 联调记录和可重复执行步骤

你的当前目标：
- 维护 runtime / desktop / Feishu 的验收清单
- 把已有验证脚本整理成稳定流程
- 明确哪些是 mock 验证，哪些是真实联调验证
- 为 coordinator 提供 merge readiness 证据

你不负责：
- 主导产品逻辑改动
- 擅自重写架构

开工前先读 /home/dungloi/Workspaces/codex-feishu-bridge-hub/views/qa-agent.md。
如果发现某个模块无法验证，要明确指出缺失前提，并通过 shared hub 回传 coordinator。
```
