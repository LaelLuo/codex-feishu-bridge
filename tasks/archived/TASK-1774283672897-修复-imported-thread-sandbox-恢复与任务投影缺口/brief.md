# 修复 imported thread sandbox 恢复与任务投影缺口

## 目标

- 定位并修复 imported/manual-import 任务在 bridge 状态恢复或 /tasks/:id 投影中丢失 sandbox 的原因，确保任务详情与真实执行环境一致。

## 范围

### In

- 仅覆盖 imported/manual-import 线程的 executionProfile 恢复、状态持久化、任务详情投影与相关测试；可复用现有 sandbox 透传修复。

### Out

- 不改 Feishu 交互、不改普通新建任务默认 profile、不顺手扩展其他 execution profile 字段。

## 验收标准

- 对于具备 sandbox 元数据的 imported thread，/tasks/:id 返回应稳定包含 executionProfile.sandbox；补充覆盖导入、恢复与详情读取链路的测试；明确区分状态恢复问题与 runtime.startTurn 透传问题。
