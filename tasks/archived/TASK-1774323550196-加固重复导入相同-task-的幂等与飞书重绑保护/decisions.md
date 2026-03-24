# Decisions

- 暂无。
- 2026-03-24T03:51:58.167Z [agent] 显式重复导入同一 threadId 应视为 refresh 而不是 second import：使用 readThread 刷新 runtime descriptor、hydrate 已有 task，并避免 resume 副作用；Feishu 绑定只允许同 binding 幂等重试，不允许通过重复导入静默覆盖到不同线程。
