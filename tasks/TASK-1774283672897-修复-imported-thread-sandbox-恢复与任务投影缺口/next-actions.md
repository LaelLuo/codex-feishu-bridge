# Next Actions

## Open



## Closed

- NA-1774284617257 重启运行中的 host daemon 或用新代码启动 bridge，再用真实 imported thread 验证 /tasks/:id 已返回 executionProfile.sandbox。
  - status: done
  - created_at: 2026-03-23T16:50:17.257Z
  - closed_at: 2026-03-23T17:00:47.736Z
  - closed_by: agent
  - source: agent

- NA-1774283711068 复现一个 imported thread 在 /tasks/:id 中缺失 executionProfile.sandbox 的最小路径，并确认对应 state_5.sqlite 的 threads 记录里是否存在 sandbox_policy。
  - status: done
  - created_at: 2026-03-23T16:35:11.068Z
  - closed_at: 2026-03-23T16:46:49.269Z
  - closed_by: agent
  - source: agent

- NA-1774283711132 补测试覆盖 executionProfile.sandbox 的导入、恢复、持久化与任务详情读取链路，避免只测到 startTurn 透传。
  - status: done
  - created_at: 2026-03-23T16:35:11.132Z
  - closed_at: 2026-03-23T16:46:49.199Z
  - closed_by: agent
  - source: agent

- NA-1774283672914 补充相关上下文引用与 affected repos
  - status: done
  - created_at: 2026-03-23T16:34:32.913Z
  - closed_at: 2026-03-23T16:35:50.847Z
  - closed_by: agent
  - source: agent

- NA-1774283672913 回读 brief.md，确认本轮目标与边界
  - status: done
  - created_at: 2026-03-23T16:34:32.913Z
  - closed_at: 2026-03-23T16:35:50.784Z
  - closed_by: agent
  - source: agent

- NA-1774283672915 开始执行后记录首条实质性进展
  - status: obsolete
  - created_at: 2026-03-23T16:34:32.913Z
  - closed_at: 2026-03-23T16:35:50.723Z
  - source: agent
  - reason: 已补入更具体的执行 next actions，替代初始化占位项。
