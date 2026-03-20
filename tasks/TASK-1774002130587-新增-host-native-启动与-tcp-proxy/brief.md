# 新增-host-native-启动与-tcp-proxy

## 目标

- 为 codex-feishu-bridge 增加正式的 bun run start:host 启动路径，并新增跨平台 tcp-proxy 后端，同时保留现有 socket-proxy。

## 范围

### In

- 新增 host-native 启动脚本与根命令入口
- 新增 tcp-proxy 运行时与配置解析
- 补充测试覆盖 runtime backend 选择与 tcp-proxy 通信
- 更新 README 与 architecture 文档说明 Windows/容器路径

### Out

- 删除现有 socket-proxy

## 验收标准

- bun run start:host 可在宿主机直接启动 bridge-daemon
- CODEX_RUNTIME_BACKEND=tcp-proxy 时 bridge-daemon 可通过 host:port 连到宿主机 sidecar
- 相关 bun test 通过且文档说明清楚三种运行方式
