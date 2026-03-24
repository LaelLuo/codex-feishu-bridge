# 收缩剩余-Bun-first-工具链残留

## 目标

- 清理已不再需要的 Bun-first 迁移残留，同时保留 VSCode extension 的 Node 平台约束

## 范围

### In

- package.json
- tests/integration/bun-first-workflow.test.mjs

### Out

- 未在创建时指定

## 验收标准

- 根 package.json 不再保留未使用的 tsx 依赖
- bun-first 集成测试覆盖该残留已移除
- bun run test 与 bun run typecheck 继续通过
