# Next Actions

## Open

- NA-1774345154670 新增 verify:gate 与 verify:structure|logic|interaction|workflow 入口，并以 verify-gate-script 集成测试、bun run typecheck 通过作为验收
  - status: open
  - created_at: 2026-03-24T09:39:14.671Z
  - source: agent

- NA-1774345155277 实现失败分类与 failure-only JSON 证据输出，并以 failure-report 集成测试通过作为验收
  - status: open
  - created_at: 2026-03-24T09:39:15.277Z
  - source: agent

- NA-1774345155840 实现 structure gate 架构规则测试，并以 bun run verify:structure 与 bun run verify:gate 通过作为验收
  - status: open
  - created_at: 2026-03-24T09:39:15.840Z
  - source: agent

- NA-1774345156399 实现 logic gate 并统一 domain/application/regression 检查范围，并以 bun run verify:logic 与 bun run verify:gate 通过作为验收
  - status: open
  - created_at: 2026-03-24T09:39:16.399Z
  - source: agent

- NA-1774345172992 实现 interaction gate 并固定 HTTP/WS/Feishu/VSCode 兼容性检查，并以 bun run verify:interaction 与 bun run verify:gate 通过作为验收
  - status: open
  - created_at: 2026-03-24T09:39:32.992Z
  - source: agent

- NA-1774345173534 实现 workflow gate 并纳入 task-cli doctor、状态流与恢复流测试，并以 bun run verify:workflow 与 bun run verify:gate 通过作为验收
  - status: open
  - created_at: 2026-03-24T09:39:33.534Z
  - source: agent

- NA-1774345174086 把硬门禁接入 README/architecture/verification 文档，并以文档更新后 bun run verify:gate 通过作为验收
  - status: open
  - created_at: 2026-03-24T09:39:34.086Z
  - source: agent

- NA-1774345174637 完成最终收口验证，并以 bun run verify:gate、bun run typecheck、bun run lint、bun run test 全通过作为验收
  - status: open
  - created_at: 2026-03-24T09:39:34.637Z
  - source: agent

## Closed

- NA-1774345056080 开始执行后记录首条实质性进展
  - status: obsolete
  - created_at: 2026-03-24T09:37:36.078Z
  - closed_at: 2026-03-24T09:38:51.465Z
  - source: agent
  - reason: 开始实施后将按具体阶段 action 记录进展，不保留初始化占位。

- NA-1774345056079 补充相关上下文引用与 affected repos
  - status: obsolete
  - created_at: 2026-03-24T09:37:36.078Z
  - closed_at: 2026-03-24T09:38:50.901Z
  - source: agent
  - reason: 相关上下文已沉淀到 gate spec 与 implementation plan。

- NA-1774345056078 回读 brief.md，确认本轮目标与边界
  - status: obsolete
  - created_at: 2026-03-24T09:37:36.078Z
  - closed_at: 2026-03-24T09:38:50.316Z
  - source: agent
  - reason: 由实施计划中的阶段性 action 替代初始化占位。
