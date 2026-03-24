# Decisions

- 暂无。
- 2026-03-20T05:17:57.374Z [agent] 对容器风格的 /workspace/... 路径不能直接交给宿主 OS 的 path.resolve；当 workspaceRoot 是 POSIX 绝对路径且不是 Windows 盘符/UNC 路径时，统一使用 path.posix.resolve。
- 2026-03-20T05:22:21.576Z [agent] helper CLI 属于用户入口层，既然根脚本与文档已切 bun-first，就应连 shebang 和 usage 文案一起切换，避免仓库内部帮助信息继续把 node 当默认路径。
- 2026-03-20T05:37:16.212Z [agent] socket-proxy 的配置值仍保留逻辑上的 .sock 路径，但在 Windows 运行时实际监听/连接到 named pipe；这样既不破坏现有配置语义，也能让当前宿主测试环境通过。
- 2026-03-20T05:37:16.469Z [agent] Feishu 跟进消息测试不应只盯着 conversation 长度增长；当前实现允许消息被立即开始、steer 到当前 turn，或在忙碌时先 queue，因此断言需要覆盖这些合法路径。
