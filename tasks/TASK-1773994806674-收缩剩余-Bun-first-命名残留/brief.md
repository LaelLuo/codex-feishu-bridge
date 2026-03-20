# 收缩剩余-Bun-first-命名残留

## 目标

- 移除根工作区的 Node 命名/配置残留，同时保留 VSCode extension 的 Node 平台约束

## 范围

### In

- package.json
- docker/compose.yaml
- tests/integration/bun-first-workflow.test.mjs

### Out

- 未在创建时指定

## 验收标准

- 根 package.json 不再声明 engines.node
- compose 不再使用 workspace-node-modules 命名
- bun run test 与 bun run typecheck 继续通过
