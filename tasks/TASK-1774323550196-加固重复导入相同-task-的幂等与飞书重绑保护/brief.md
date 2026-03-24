# 加固重复导入相同 task 的幂等与飞书重绑保护

## 目标

- 修复重复导入相同 threadId 时的非幂等副作用，并阻止飞书重复导入静默覆盖已有 binding。

## 范围

### In

- apps/bridge-daemon/src/service/bridge-service.ts, apps/bridge-daemon/src/feishu/bridge.ts, apps/bridge-daemon/tests

### Out

- 导入与绑定行为更鲁棒；补齐回归测试。

## 验收标准

- 重复导入同一 threadId 不再重复 resume/导入副作用；已绑定 task 被其他飞书线程重复导入时显式报错且保留原绑定。
