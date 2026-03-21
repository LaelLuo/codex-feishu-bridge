# Decisions

- 2026-03-21T13:35:27.327Z [agent] 该任务依赖“飞书交互语言配置”先落地，避免在交互文案尚未抽离前同时改两层结构。
- 2026-03-21T08:37:45.4347345Z [agent] 在完整首卡瘦身前，先单独修复“LLM 回复 Markdown 不可读”的痛点：检测到 Markdown 时升级为只读卡片回复，而不是尝试继续塞进 plain text。
- 2026-03-21T11:50:00.000Z [agent] 对“导入已有会话”采用卡片优先交互：在 unbound draft card 的 `More` 中暴露 `Import Existing Thread`，并使用独立表单卡输入 `threadId`，而不是新增 slash command。
- 2026-03-21T12:10:00.000Z [agent] 对长连接 `card.action.trigger` 优先返回即时 card payload；需要额外发送回复卡的动作改为后台 follow-up，避免飞书客户端把已成功的按钮操作误判为超时失败。
- 2026-03-21T12:41:38.7469736Z [agent] `draft.create` 沿用同一条即时响应契约：同步阶段只回“正在创建”状态卡，最终 task card 与绑定结果通过后台 patch/回复完成，避免创建按钮也被飞书客户端误报超时。
