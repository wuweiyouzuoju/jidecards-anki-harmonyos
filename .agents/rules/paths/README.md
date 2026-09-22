# 目录级编程 Agent 规则

这些规则按变更路径补充根 `AGENTS.md`，只在 Agent 修改对应目录时读取。它们不能降低根规则的优先级，也不能把历史材料变成当前指令。

| 变更路径 | 局部规则 | 主要责任表 | 默认验证 |
| --- | --- | --- | --- |
| `entry/` | [entry.md](entry.md) | [模块责任与边界](../../../docs/development/ownership.md#entry) | 对应领域测试；ArkTS/结构改动补 `npm run verify` |
| `native/` | [native.md](native.md) | [模块责任与边界](../../../docs/development/ownership.md#native) | `npm run verify -- native` |
| `tools/`、`.github/` | [tools.md](tools.md) | [模块责任与边界](../../../docs/development/ownership.md#tools) | `npm run verify -- repo` |
| `docs/`、`.agents/` | [docs.md](docs.md) | [知识维护规则](../context.md) | `npm run verify -- repo` |

同时修改多个区域时合并所有对应验证范围；无法执行的范围必须在任务报告中明确说明。

`npm run impact` 按实际变更路径列出以上规则和相关领域文档。这些文件不会被所有编程工具自动按路径加载；根 `AGENTS.md` 要求编程 Agent 按输出主动读取。
