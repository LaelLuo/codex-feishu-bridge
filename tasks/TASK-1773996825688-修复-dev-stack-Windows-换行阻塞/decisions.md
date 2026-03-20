# Decisions

- 暂无。
- 2026-03-20T09:50:33.195Z [agent] Windows 主机上的 stdio 开发链改为通过 bun 包装脚本选择可用 bash，并在 bridge 运行时对脚本入口与无执行位 Codex 二进制做兼容处理。
- 2026-03-20T09:50:33.424Z [agent] BRIDGE_CODEX_HOME 在 Windows 本机 stdio 场景下切到工作区 .tmp/codex-home，并在启动阶段同步宿主 auth.json/config.toml，避免 /codex-home 直接复用时的 skills 目录冲突。
