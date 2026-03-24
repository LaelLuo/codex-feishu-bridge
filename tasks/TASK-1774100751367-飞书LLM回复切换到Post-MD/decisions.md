# Decisions

- 2026-03-21T13:45:51.367Z [agent] 该任务仅覆盖 Codex/LLM 普通回复的飞书出站形态：默认使用 `msg_type=post` + `md` 标签，超长时拆分为多条 post；带操作控件的消息继续保留卡片。
- 2026-03-24T12:43:00.000Z [agent] 仅 `extractAgentReplies()` 同步出的普通 agent/LLM 回复切换到 `post + md`；bridge 自己生成的 slash/status/help/错误回执继续保留 `text`，避免误把命令反馈和系统提示也改成卡片或 post。
- 2026-03-24T12:44:00.000Z [agent] 长回复拆分策略以单条安全字符上限为界：优先按 `\n\n`，其次按 `\n`，最后才硬切；目标是尽量保留 Markdown 段落结构，而不是退回 interactive card。
- 2026-03-24T13:28:00.000Z [agent] reviewer 复审后将拆分策略补强为 code point 安全，并在跨消息切开 fenced code block 时自动补闭合与续开；同时保留 `/bind <taskId>` 作为显式迁移既有 Feishu 绑定的通道。
