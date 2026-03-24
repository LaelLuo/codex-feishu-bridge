# 收缩残余 bun-first 测试入口

## 目标

- 移除测试与 mock 层剩余的 node/npm 默认入口，保持公开工作流继续以 bun 为主

## 范围

### In

- tests/integration/hub-cli.test.mjs, apps/bridge-daemon/tests/fixtures/fake-codex-app-server.mjs, apps/bridge-daemon/src/runtime/mock-codex-runtime.ts, tests/integration/bun-first-workflow.test.mjs

### Out

- VSCode extension Node 宿主、Docker 基础镜像策略

## 验收标准

- hub-cli 集成测试改为 bun 运行；fake app-server fixture 改为 bun shebang；mock runtime 审批示例命令改为 bun test；相关 bun 测试通过
