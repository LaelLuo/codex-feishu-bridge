# 修复-dev-stack-Windows-换行阻塞

## 目标

- 修复 scripts/dev-stack.sh 在 Windows 工作区被 CRLF 签出后无法执行的问题，并补齐回归测试

## 范围

### In

- scripts/dev-stack.sh
- tests/integration/bootstrap-host-worktrees.test.mjs

### Out

- 未在创建时指定

## 验收标准

- dev-stack.sh 的工作区换行被约束为 LF
- 针对 dev-stack.sh 的 LF 回归测试存在
- bun run start:stdio 在本机不再因 CRLF 直接失败
