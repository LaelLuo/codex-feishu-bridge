# Task Log

- 2026-03-21T13:35:27.327Z [agent] 初始化任务目录。
- 2026-03-21T13:35:27.327Z [agent] 根据用户决策，将“语言配置”从整体飞书交互改造中拆成独立任务，并作为当前优先执行项。
- 2026-03-21T06:27:27.2539051Z [agent] 为 shared 配置层新增 `FEISHU_UI_LANGUAGE`，支持 `en-US` / `zh-CN`，默认回退到 `en-US`。
- 2026-03-21T06:27:27.2539051Z [agent] 在 `apps/bridge-daemon` 新增正式 i18n 资源层，并把 draft/task/activity/status/inspection/archive 卡片及首批交互通知接入本地化。
- 2026-03-21T06:27:27.2539051Z [agent] 更新 `README.md`、`docs/README.en.md`、`docs/architecture.md`，补充 `FEISHU_UI_LANGUAGE` 的公开配置说明。
- 2026-03-21T06:27:27.2539051Z [agent] 已完成验证：`packages/shared` 测试通过，`apps/bridge-daemon` 飞书卡片与长连接测试通过，shared 与 bridge-daemon 类型检查通过。
