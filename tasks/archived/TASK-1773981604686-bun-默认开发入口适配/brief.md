# bun 默认开发入口适配

## 目标

- 让仓库以 bun 作为默认开发入口，移除 npm 作为官方主路径，同时保留必要的 Node 底层宿主

## 范围

### In

- 调整根 package.json 与 workspace 脚本到 bun-first
- 调整 dev-stack 与 Docker 启动流程到 bun-first
- 更新 README 与 English README 的开发命令说明

### Out

- 未在创建时指定

## 验收标准

- 仓库文档与脚本默认不再要求 npm
- dev-stack 与常用脚本可通过 bun-first 流程执行
