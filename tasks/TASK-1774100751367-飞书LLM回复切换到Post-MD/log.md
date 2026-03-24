# Task Log

- 初始化任务目录。
- 2026-03-21T13:45:51.367Z [agent] 根据用户新要求，单独创建“飞书 LLM 回复切换到 post + md”任务，先完成任务落盘，不立即进入实现。
- 2026-03-24T12:27:00.000Z [agent] 任务状态更新为 in_progress：按 TDD 将 Feishu 普通 agent 回复从 text/card 混合策略切到 `post + md`，同时保留 bridge 自身文本回执继续走 `text`。
- 2026-03-24T12:35:00.000Z [agent] 先补回归测试：long-connection 与 webhook 两条链路统一断言 agent 普通回复走 `msg_type=post` + `md`，并新增超长回复拆分为多条 post 的覆盖。
- 2026-03-24T12:43:00.000Z [agent] 实现完成：新增 agent 回复专用 `replyWithAgentMessage()`；只让 `extractAgentReplies()` 产出的普通 LLM 回复走 `post + md`；slash/status/help/错误等 bridge 文本回执继续复用 `replyToMessage(text)`。
- 2026-03-24T12:50:00.000Z [agent] 补充架构记录：Feishu 普通 agent 回复默认使用 `post + md`，交互控件仍保留卡片；超长回复按双换行/单换行/硬切安全拆分。
- 2026-03-24T13:28:00.000Z [agent] reviewer 复审后追加修正：保留 `/bind <taskId>` 的显式跨线程迁移语义；长 markdown 回复改为按 code point 安全拆分，并在跨消息切开 fenced code block 时自动补闭合和续开。
- 2026-03-24T13:36:00.000Z [agent] 验证完成：`bun test apps/bridge-daemon/tests/feishu-long-connection.test.ts`、`bun test apps/bridge-daemon/tests/feishu-webhook.test.ts`、`bun run typecheck:daemon` 通过；任务状态更新为 done。
