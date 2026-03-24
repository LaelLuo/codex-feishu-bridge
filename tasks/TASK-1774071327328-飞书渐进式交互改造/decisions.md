# Decisions

- 2026-03-21T13:35:27.327Z [agent] 该任务依赖“飞书交互语言配置”先落地，避免在交互文案尚未抽离前同时改两层结构。
- 2026-03-21T08:37:45.4347345Z [agent] 在完整首卡瘦身前，先单独修复“LLM 回复 Markdown 不可读”的痛点：检测到 Markdown 时升级为只读卡片回复，而不是尝试继续塞进 plain text。
- 2026-03-21T11:50:00.000Z [agent] 对“导入已有会话”采用卡片优先交互：在 unbound draft card 的 `More` 中暴露 `Import Existing Thread`，并使用独立表单卡输入 `threadId`，而不是新增 slash command。
- 2026-03-21T12:10:00.000Z [agent] 对长连接 `card.action.trigger` 优先返回即时 card payload；需要额外发送回复卡的动作改为后台 follow-up，避免飞书客户端把已成功的按钮操作误判为超时失败。
- 2026-03-21T12:41:38.7469736Z [agent] `draft.create` 沿用同一条即时响应契约：同步阶段只回“正在创建”状态卡，最终 task card 与绑定结果通过后台 patch/回复完成，避免创建按钮也被飞书客户端误报超时。
- 2026-03-22T02:33:43.000Z [agent] “导入已有线程”不再放在 draft 卡的 overflow `More` 中；该入口提升为主卡独立按钮，并直接同步返回导入表单卡。原因是已通过真实客户端日志确认 overflow 后续 patch/reply 在飞书上不稳定，即使后端成功调用也可能不可见。
- 2026-03-22T14:04:03+08:00 [agent] 对 import / rename 表单统一采用“真实表单消息 id 持久化”策略：当飞书不回传 `open_message_id` 时，bridge 必须优先更新当前 fallback reply 表单，而不是退回旧 draft / task 主卡；否则用户会看到“已成功但当前表单不刷新/像卡住”。
