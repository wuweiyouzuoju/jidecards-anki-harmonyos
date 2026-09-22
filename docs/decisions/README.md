# 当前决策

本目录保存会长期影响编程 Agent 和项目结构的当前决策，并随源码一起版本控制。

- 根目录 `AGENTS.md` 是编程 Agent 的最高规则入口。
- `PROJECT_CONTEXT.md` 负责任务路由、全局不变量和唯一事实来源。
- `docs/development/` 保存当前领域说明；`docs/development/coding-agent.md` 只描述编程 Agent。
- `docs/development/agent.md` 和 `docs/agent-2-design.md` 只描述应用内 Agent。
- `docs/superpowers/`、`.trae/` 和发布记录是历史材料，不能发出当前执行指令。

新增决策记录应说明决策、原因、影响范围和验证方式。短期排查过程不必写入本目录。

## 有效决策

- [编程 Agent-first](2026-09-agent-first.md)：开发优先级与知识入口。
- [首页运行时与 RPC 验证边界](2026-09-22-home-runtime-rpc.md)：控制器责任、协议语义门禁与设备验收边界。
- [可维护性门禁与确认执行边界](2026-09-22-agent-maintainability.md)：提案/提交分离、纯模型依赖与后续接手路径。

后续决策改变既有约定时，在新旧记录中明确替代关系并更新本索引，不让后续 Agent 自行猜测哪份有效。

## 决策索引

- [首页运行时与 RPC 验证边界](2026-09-22-home-runtime-rpc.md)：同步/备份的状态所有者、协议基线和验证范围。
