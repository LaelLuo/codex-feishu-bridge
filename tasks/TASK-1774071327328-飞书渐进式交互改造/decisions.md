# Decisions

- 2026-03-21T13:35:27.327Z [agent] 该任务依赖“飞书交互语言配置”先落地，避免在交互文案尚未抽离前同时改两层结构。
- 2026-03-21T08:37:45.4347345Z [agent] 在完整首卡瘦身前，先单独修复“LLM 回复 Markdown 不可读”的痛点：检测到 Markdown 时升级为只读卡片回复，而不是尝试继续塞进 plain text。
- 2026-03-21T11:50:00.000Z [agent] 对“导入已有会话”采用卡片优先交互：在 unbound draft card 的 `More` 中暴露 `Import Existing Thread`，并使用独立表单卡输入 `threadId`，而不是新增 slash command。
