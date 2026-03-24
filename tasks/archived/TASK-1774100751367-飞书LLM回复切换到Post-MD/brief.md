# 飞书LLM回复切换到Post-MD

## 目标

- 将飞书中的 Codex/LLM 普通回复从 text/card 混合策略调整为默认使用 post + md；超长回复拆分为多条 post；仅保留带操作控件的消息继续使用卡片。

## 范围

### In

- 仅覆盖 Codex/agent 普通回复同步到飞书的出站链路
- 支持 post 富文本中的 md 标签承载 Markdown 内容
- 超长回复按安全边界拆分为多条连续 post 回复

### Out

- 不改 slash 命令、status/health、错误提示等 bridge 自身文本回执
- 不改 task control、approval、rename、import 等交互卡片

## 验收标准

- 普通 LLM 回复默认不再发送 interactive 卡片
- 包含标题、列表、代码块等 Markdown 内容的回复可通过 post + md 正常显示
- 超过单条 post 限制时会拆分成多条 post，而不是退回卡片
