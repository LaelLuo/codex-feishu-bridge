# 修复 imported thread 残留 running 态导致导入后消息被排队

## 目标

- 定位并修复 imported/manual-import 线程在导入后被 bridge 维持为 running 的条件，确保已结束线程导入后可直接开始新对话；对于真正仍在运行的线程，保留正确的 queue 语义。

## 范围

### In

- 覆盖 imported thread 的 rollout 活动判定、activeTurnId 清理、/tasks 状态投影，以及相关回归测试；基于真实线程 019d0a26-2b8d-7343-9777-1cfd7769b6a4 的现象做最小复现。

### Out

- 不改 sandbox 恢复逻辑、不改 Feishu 卡片文案策略、不顺手重做整个 imported conversation hydrate 机制。

## 验收标准

- 已结束的 imported thread 导入后应为 idle 或 completed，后续消息可直接启动新 turn；真正仍在运行的 imported thread 继续表现为 running 并按 queue 策略处理；补充能区分这两类线程的测试。
