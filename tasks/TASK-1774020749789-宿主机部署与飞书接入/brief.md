# 宿主机部署与飞书接入

## 目标

- 在当前 Windows 宿主机上完成 codex-feishu-bridge 部署，并接通 Feishu long-connection，使用户可在本机直接运行和验证。

## 范围

### In

- 使用 host-native 或必要的本机运行路径启动 bridge-daemon
- 补齐并验证 Feishu App 凭据与默认群配置
- 使用 Playwright 打开有头浏览器辅助用户登录 Feishu 并完成控制台操作

### Out

- 未在创建时指定

## 验收标准

- bun run start:host 或等效本机启动方式可稳定运行
- /health 与 /auth/account 可返回正常结果
- Feishu long-connection 所需配置补齐并完成至少一次联通验证
