# 修复 bun 全量测试并继续收缩 node 入口

## 目标

- 让 bun run test 在当前宿主环境通过，并继续清理仓库中不再需要的直接 node 用户入口，同时保持 VSCode extension 的 Node 宿主边界不变。

## 范围

### In

- 修复 packages/shared 的跨平台路径断言
- 扫描并收缩剩余直接 node 入口

### Out

- 修改 VSCode extension 的 Node 宿主机制
- 重构无关运行时架构

## 验收标准

- bun run test 通过
- 剩余直接 node 调用仅保留产品/平台硬约束
