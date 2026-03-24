# 迁移包级测试到-bun-test

## 目标

- 迁移各 workspace 的 test 脚本到 bun test，并验证纯 Bun 容器下 test/build/typecheck 可运行

## 范围

### In

- tests/integration/bun-first-workflow.test.mjs
- packages/shared/package.json
- packages/protocol/package.json
- apps/bridge-daemon/package.json
- apps/vscode-extension/package.json

### Out

- docker/images/dev.Dockerfile 正式切基底

## 验收标准

- bun-first 集成测试显式断言各 workspace test 脚本使用 bun test 且不再使用 tsx --test
- 本地 bun run test 与 bun run typecheck 完成验证
- 官方 oven/bun:debian 容器内 bun run build、bun run test、bun run typecheck 完成验证
