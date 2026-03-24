# Decisions

- 暂无。
- 2026-03-23T17:41:58.591Z [agent] 问题边界限定为 imported thread 的运行态判定与 activeTurnId 清理，不把 sandbox 恢复、普通导入成功路径或 Feishu 卡片文案混入本 task。
- 2026-03-23T18:24:14.845Z [agent] imported thread 的 stale running 判定采用双信号：最近 1 小时内的 rollout 活跃记录仍可维持 running；若 runtime 本身仍回报 running，则继续以 runtime 忙碌态为准，不因旧 rollout 单独降为 idle。
