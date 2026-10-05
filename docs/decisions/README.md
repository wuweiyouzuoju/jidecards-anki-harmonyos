# 当前决策

本目录保存会长期影响编程 Agent 和项目结构的当前决策，并随源码一起版本控制。

- 根目录 `AGENTS.md` 是编程 Agent 的最高规则入口。
- `PROJECT_CONTEXT.md` 负责任务路由、全局不变量和唯一事实来源。
- `docs/development/` 保存当前领域说明；`docs/development/coding-agent.md` 只描述编程 Agent。
- `docs/development/agent.md` 和 `docs/agent-2-design.md` 只描述应用内 Agent。
- `docs/superpowers/`、`.trae/` 和发布记录是历史材料，不能发出当前执行指令。

新增决策记录应说明决策、原因、影响范围和验证方式。短期排查过程不必写入本目录。

## 有效决策

- [Anki 剩余接入的 UI 与 JIDE 分工](2026-10-04-ankicore-ui-routing.md)：复杂配置交给 JIDE，简单入口复用原界面；逐项覆盖 22 组剩余事项及平台边界。

- [软件开发同时维护 JIDE 认知](2026-10-04-jide-cognition-sync.md)：普通开发任务默认同步认知，共同声明自动传递升级，设置登记检查与运行时自动发现的边界。

- [多 Agent 的任务归属与失败处理](2026-10-03-multi-agent-ownership.md)：共享文件写入负责人、失败归因、禁止占位过关与集中联合验收。

- [JIDE 当前软件认知与自动导航](2026-10-03-agent-app-navigation.md)：共同页面声明、每轮能力指纹、受控导航队列及原学习流程。

- [旗标与标星冲突默认 JideCards 优先](2026-10-03-marking-sync-priority.md)：社区调查后的兼容兜底、混合客户端及两个 JideCards 的决胜规则与验证边界。

- [JIDE 按页资料读取与 OCR](2026-10-01-agent-document-reading.md)：API 21、通用模型工具链、页笔记与来源引用。

- [首页范围预览使用独立集合快照](2026-10-01-deck-preview-snapshot.md)：四种范围、只读数据边界、锁定 Core 补丁与真实队列验证。

- [应用设置能力与 Agent-first](2026-10-01-agent-app-settings.md)：共享主题入口、最小工具契约、可撤销设置许可与真实结果。

- [同类变更的发现、复用与验证](2026-09-26-consistent-change-coverage.md)：主动查全、公共责任入口、自动防遗漏和交付覆盖证据。

- [按状态所有权治理跨层风险](2026-09-26-agent-first-boundaries.md)：媒体连续滑动、有界传输、异步迁移、会话代次、RPC 生成与集成验证。

- [编程 Agent-first](2026-09-agent-first.md)：开发优先级与知识入口。
- [首页运行时与 RPC 验证边界](2026-09-22-home-runtime-rpc.md)：控制器责任、协议语义门禁与设备验收边界。
- [UI 边界与过期月历清理决策](2026-09-23-ui-boundaries.md)：记录首页月历过期状态、列表生命周期与页面异步边界。
- [可维护性门禁与确认执行边界](2026-09-22-agent-maintainability.md)：提案/提交分离、纯模型依赖与后续接手路径。

后续决策改变既有约定时，在新旧记录中明确替代关系并更新本索引，不让后续 Agent 自行猜测哪份有效。

## 决策索引

- [应用内 Agent 本地代码沙箱：方案与接手入口](2026-09-30-agent-local-sandbox.md)：本地执行范围、候选引擎、工具/确认边界与分阶段验证；已建立独立纯计算原型，尚未接入应用工具。
- [手表端设计计划与官方依据（提案）](2026-09-25-wearable-design.md)：设备覆盖、客户端选型、两档评分、通信及一致性验收；尚未实现。
- [首页运行时与 RPC 验证边界](2026-09-22-home-runtime-rpc.md)：同步/备份的状态所有者、协议基线和验证范围。
- [编辑、计时与首页表单的职责边界](2026-09-24-editor-feature-boundaries.md)：局部 Feature/Session 的状态所有者、异步生命周期和不过度抽象的取舍。
