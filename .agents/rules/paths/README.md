# 目录级编程 Agent 规则

这些规则按变更路径补充根 `AGENTS.md`，只在 Agent 修改对应目录时读取。它们不能降低根规则的优先级，也不能把历史材料变成当前指令。

| 变更路径 | 局部规则 | 主要责任表 | 默认验证 |
| --- | --- | --- | --- |
| `entry/` | [entry.md](entry.md) | [模块责任与边界](../../../docs/development/ownership.md#entry) | 资源或相关行为检查；新增编译边界补增量 HAP |
| `native/` | [native.md](native.md) | [模块责任与边界](../../../docs/development/ownership.md#native) | 受影响 Core/沙箱测试；协议、FFI 或升级补集成 |
| `tools/`、`.github/` | [tools.md](tools.md) | [模块责任与边界](../../../docs/development/ownership.md#tools) | 对应工具测试与受影响命令 |
| `docs/`、`.agents/` | [docs.md](docs.md) | [知识维护规则](../context.md) | 文档契约检查 |

同时修改多个区域时合并所有对应验证范围；无法执行的范围必须在任务报告中明确说明。

`npm run impact` 按实际变更路径列出以上规则和相关领域文档。这些文件不会被所有编程工具自动按路径加载；根 `AGENTS.md` 要求编程 Agent 按输出主动读取。
