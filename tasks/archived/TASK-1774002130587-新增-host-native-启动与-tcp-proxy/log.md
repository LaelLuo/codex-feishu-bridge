# Task Log

- 初始化任务目录。
- 2026-03-20T10:22:27.095Z [agent] 任务状态更新为 in_progress：开始设计并实现 host-native 启动链与 tcp-proxy 后端。
- 2026-03-20T10:30:44.310Z [agent] TDD 红灯已确认：packages/shared 新增的 tcp-proxy 配置断言因缺少 codexRuntimeProxyHost/Port/BindHost 字段失败；apps/bridge-daemon 与 tests/integration 的新增测试因 runtime-tcp-proxy 与 host-stack.ts 尚未实现而失败。
- 2026-03-20T10:55:05.275Z [agent] 实现完成并验证通过：新增 host-stack.ts、tcp-proxy runtime/client、root start:host/start:tcp-proxy 命令，dev-stack 支持 tcp-proxy 自动补齐与 sidecar 启动；关键 runtime 与集成测试共 22 项通过，另用 fake app-server 冒烟验证 bun run start:host 后 /health 与 /auth/account 可访问。
- 2026-03-20T10:57:31.487Z [agent] 用户要求进行真实 codex app-server 的宿主机真机验证；准备验证 bun run start:host，并在条件允许时补一轮 tcp-proxy 检查。
- 2026-03-20T11:00:04.719Z [agent] 真实宿主机验证暴露两个 Windows 问题：1）host-stack.ts 未尊重显式 CODEX_APP_SERVER_BIN=codex，而是回退到受保护的 codex.exe；2）prepareBridgeDirectories 对已存在的 OneDrive/Codex 目录执行 Bun mkdir(recursive) 时抛 EEXIST。准备修复后重验。
- 2026-03-20T11:03:58.819Z [agent] 已用回归测试锁定并修复两个真实 Windows 宿主机问题：host-stack 现在尊重显式 bare command CODEX_APP_SERVER_BIN=codex；ensureDir 现在能容忍 Bun 在已有目录上抛出的 EEXIST。正在重新跑相关测试并进行真机复验。
- 2026-03-20T14:42:17.129Z [agent] 用户要求 host-native 默认不要再强制使用 .tmp/codex-home，而是尽量忽略 CODEX_HOME 让本地 codex 走默认 home。开始梳理 bridge 对 codexHome 的真实依赖点。
- 2026-03-20T14:50:10.764Z [agent] 已将 host-native 默认策略改为：bridge 以字面量 ~/.codex 作为名义 home，但 child 进程默认不再注入 CODEX_HOME；仅在显式指定 BRIDGE_CODEX_HOME/CODEX_HOME 时才向 child 传递。正在重新构建并跑真实 codex 验证。
- 2026-03-20T14:52:09.127Z [agent] 真实宿主机复验通过：在未设置 CODEX_HOME/BRIDGE_CODEX_HOME/HOST_CODEX_HOME 的情况下，bun run start:host 可用真实 codex 启动；/health 返回 codexHome=C:\\Users\\LaelLuo\\.codex，/auth/account 返回 account.type=apiKey。
- 2026-03-20T15:15:23.032Z [agent] 用户要求同步更新 README 与 architecture：明确 host-native 默认不导出 CODEX_HOME，不再默认使用 .tmp/codex-home，也不再把 OneDrive/Codex 作为默认运行态目录。
- 2026-03-20T23:22:27.5905386+08:00 [agent] README、docs/architecture.md、docs/README.en.md 已同步最终语义：补齐 `start:host`、`tcp-proxy` 说明，明确 host-native 默认不注入 `CODEX_HOME`、不再默认使用 `.tmp/codex-home`、也不会因为登录态 realpath 或同步目录把默认运行时 home 切到 `OneDrive\Codex`；随后用 `rg` 与 `git diff` 完成文档自检。
