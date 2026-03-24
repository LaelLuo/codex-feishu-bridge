# 正式切换-Docker-开发基底到-Bun

## 目标

- 把默认开发 Docker 基底从 Node 切到 Bun，并同步 compose/env/docs 与 bun-first 验证

## 范围

### In

- docker/images/dev.Dockerfile
- docker/compose.yaml
- docker/.env.example
- tests/integration/bun-first-workflow.test.mjs
- README.md
- docs/architecture.md

### Out

- VSCode extension 的 Node 宿主运行时

## 验收标准

- 默认 Docker 构建参数与示例环境变量不再要求 NODE_IMAGE，改为 Bun 基底
- bun-first 集成测试覆盖 Docker 默认基底与相关配置
- 本地与官方 oven/bun:debian 验证继续通过
