# 修复 Docker 启动脚本换行

## 目标

- 修复 bootstrap-host-worktrees.sh 的 CRLF shebang 问题，恢复容器启动可执行性

## 范围

### In

- 复现 /usr/bin/env: bash\r 错误并确认根因
- 增加针对脚本换行或 shebang 的最小回归检查
- 修复 docker/scripts/bootstrap-host-worktrees.sh 的换行格式

### Out

- 未在创建时指定

## 验收标准

- Docker 运行该脚本时不再报 bash\r 错误
- 存在可重复执行的最小验证命令
