# Known Gaps

记录需要长期提醒的系统性缺口：

- 目前仓库还没有 `workspace/repos.yaml`，因此 `scripts/task-cli.ts` 只能在无仓库注册表的模式下工作，`related_repos` 无法做项目级校验。
- `scripts/task-cli.ts` 已具备可运行的命令合同，但仓库内还没有对应的自动化测试，当前主要依赖 CLI smoke check 和 `doctor` 自检。
- `.agent/checkpoints/` 与 `.agent/templates/` 仍然只有占位文件，长任务交接模板和检查点模板尚未沉淀。
- 公开文档目前还没有系统介绍任务记忆工作流，新会话主要仍依赖 `AGENTS.md` 与 `docs/governance/agent-operating-model.md` 发现这套机制。

不要记录短期任务步骤或一次性待办。
