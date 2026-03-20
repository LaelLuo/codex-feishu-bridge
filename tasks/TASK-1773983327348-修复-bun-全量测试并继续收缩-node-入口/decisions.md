# Decisions

- 暂无。
- 2026-03-20T05:17:57.374Z [agent] 对容器风格的 /workspace/... 路径不能直接交给宿主 OS 的 path.resolve；当 workspaceRoot 是 POSIX 绝对路径且不是 Windows 盘符/UNC 路径时，统一使用 path.posix.resolve。
- 2026-03-20T05:22:21.576Z [agent] helper CLI 属于用户入口层，既然根脚本与文档已切 bun-first，就应连 shebang 和 usage 文案一起切换，避免仓库内部帮助信息继续把 node 当默认路径。
