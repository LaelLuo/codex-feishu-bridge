# Decisions

- 2026-03-20T10:28:52.901Z [agent] 采用双路径方案：1）新增 bun run start:host 作为 Windows/宿主机正式入口，直接在 host 上运行 bridge-daemon 与 codex app-server；2）新增 tcp-proxy 后端替代 Win+Linux 容器组合下不可靠的 socket-proxy，但保留 socket-proxy 兼容现有 Unix socket 场景。
- 2026-03-20T14:50:10.764Z [agent] host-native 默认运行语义调整为“尽量跟本机直接运行 codex 一致”：bridge 仅保留名义上的默认 home 用于状态读取与路径解释，不再默认向 child 注入 `CODEX_HOME`，也不再因为登录态 realpath 或链接同步目录（如 `OneDrive\Codex`）自动切换运行时 home；只有显式设置 `BRIDGE_CODEX_HOME` / `CODEX_HOME` 时才传递给 child。
