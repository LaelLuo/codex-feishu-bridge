# Task Log

- 2026-03-21T13:35:27.327Z [agent] 初始化任务目录。
- 2026-03-21T13:35:27.327Z [agent] 根据用户要求，将飞书交互改造拆成独立任务，等待语言配置切片完成后继续收敛设计与实现。
- 2026-03-21T08:37:45.4347345Z [agent] 语言配置任务已完成，解除当前任务阻塞并转为 in_progress。
- 2026-03-21T08:37:45.4347345Z [agent] 先落地一个高性价比交互改进：检测到 LLM 回复包含明显 Markdown 结构时，不再发 plain text，而是改发只读 Markdown 卡片。
- 2026-03-21T08:37:45.4347345Z [agent] 已验证 webhook/long-connection 路径：Markdown 回复走卡片，普通回复继续保持文本消息。
- 2026-03-21T11:50:00.000Z [agent] 新增 unbound draft card 的 `More -> Import Existing Thread`：可在飞书里直接输入现有 `threadId`，导入宿主机已有 Codex 会话并绑定到当前话题。
- 2026-03-21T11:50:00.000Z [agent] 采用测试先行补充长连接交互用例，覆盖 More 打开导入卡、提交 `threadId`、把原 draft card 转换为 bound task card 的完整路径。
- 2026-03-21T11:50:00.000Z [agent] 已验证 `feishu-cards`、`feishu-long-connection`、`feishu-webhook` 三组相关测试与 `apps/bridge-daemon` TypeScript 检查均通过。
- 2026-03-21T12:10:00.000Z [agent] 修复长连接按钮“实际成功但飞书提示超时失败”的问题：对 rename/import/status/inspection 等卡片动作改为先同步返回 card payload，再在后台完成回复卡 follow-up。
- 2026-03-21T12:10:00.000Z [agent] 已补充长连接测试，要求这些动作不再返回 `undefined`，从而覆盖“即时响应”这条契约。
