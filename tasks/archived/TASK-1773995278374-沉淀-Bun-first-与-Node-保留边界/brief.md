# 沉淀-Bun-first-与-Node-保留边界

## 目标

- 把 Bun-first 默认路径与允许保留的 Node 平台约束写入 architecture.md，减少后续重复判断

## 范围

### In

- docs/architecture.md

### Out

- 未在创建时指定

## 验收标准

- architecture.md 明确说明 Bun-first 默认路径
- architecture.md 明确说明 VSCode extension 的 Node 宿主等保留边界
- docs-only 变更完成后工作区干净
