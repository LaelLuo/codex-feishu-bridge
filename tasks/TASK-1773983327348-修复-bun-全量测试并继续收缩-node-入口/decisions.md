# Decisions

- 暂无。
- 2026-03-20T05:17:57.374Z [agent] 对容器风格的 /workspace/... 路径不能直接交给宿主 OS 的 path.resolve；当 workspaceRoot 是 POSIX 绝对路径且不是 Windows 盘符/UNC 路径时，统一使用 path.posix.resolve。
