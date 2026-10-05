# jidecards 文档导航

## 用户与贡献者入口

- [项目 README](../README.md)：下载、功能、兼容范围、数据与构建入口。
- [贡献指南](../CONTRIBUTING.md)：报告问题、开发环境、验证与提交要求。
- [更新记录](../CHANGELOG.md)与[2.9.10 源码变更说明](releases/2.9.10.md)：源码变化及发布边界。
- [使用指南](https://jidecards.com/guides/harmonyos-anki/)：导入牌组、同步与复习入门。

## 当前文档

- [Agent 任务入口](../PROJECT_CONTEXT.md)：按任务读取模块约束与验证入口。
- [本地验证与源码导出](development/verification.md)：领域测试、完整构建和设备验收。
- [数据导入、导出与恢复](development/import-data.md)：APKG 选项、CSV 映射、笔记/卡片文本导出、取消、结果与中断恢复。
- [Anki / AnkiDroid 核心互通回归](development/core-interop.md)：隔离样本、真实 Core 往返、取消与恢复、设备和在线未验证范围。
- [本轮 Anki 补齐成果审查](development/anki-parity-review-2026-10-02.md)：2026-10-02 对七项成果、版本约束、实现问题和验收边界的检查记录。
- [Anki Core 全量接入盘点](development/ankicore-integration-audit-2026-10-04.md)：剩余功能、JIDE/平台边界和全部 232 个 RPC 明细，已排除本轮已补齐事项。
- [剩余接入的 UI 与 JIDE 分工](decisions/2026-10-04-ankicore-ui-routing.md)：较复杂 UI 通过 JIDE 接入，极简或无需新增 UI 的事项单独整理。

- [项目 README](../README.md)：产品、当前源码版本、构建入口。
- [2.7.9 更新说明](releases/2.7.9.md)：相对 2.7.0 的功能、修复和验证边界。
- [开发状态与后续工作](DEVELOPMENT_PLAN.md)：SDK/上游基线、发布限制、验证门和真实后续项。
- [离线公式渲染](math-chemistry-rendering.md)：当前实现入口、验证方法与有日期的历史验收。
- [当前架构](architecture.md)：模块边界、主要数据流和稳定不变量。
- [易混淆功能状态](FEATURE_STATUS.md)：备份/恢复等能力的接入层次、源码入口与功能盘点边界。
- [JIDE 应用内 Agent](development/agent.md)：当前工具、资料/联网/沙箱、运行时边界和验收入口。
- [应用内 Agent 设计](agent-2-design.md)：稳定的会话、提案与确认设计概览。
- [编程 Agent](development/coding-agent.md)：负责修改本仓库的 Agent-first 规则与开发闭环。
- [模块责任与边界](development/ownership.md)：按目录定位代码所有者、修改边界和验证入口。
- [开发任务契约](development/task-contract.md)：让每次开发都可验证、可交接、可被后续 Agent 继续。
- [长期决策](decisions/README.md)：受版本控制的当前决策；不把 `.trae` 当作项目规则来源。
- [云端牌组托管](cloud-deck-hosting.md)：公开目录协议和发布操作。
- [官方公告托管](official-announcement-hosting.md)：公告协议、发布、停用与送达语义。
- [主题兑换](REDEMPTION.md)：发行工具、身份备份与扩展入口。
- [设置能力对照](../entry/src/main/ets/components/settings/SETTINGS_PARITY.md)：设置模式、实际接入和待验收边界。

## 历史材料

- [3.0.0 未发布草案](releases/3.0.0.md)：历史发布文案草案，不是已发布版本。
- [源码架构长文](CSDN-记得闪卡项目全解.md)：2026-09-08 的历史源码导读快照，版本和统计数字不代表当前工作树。
- [一次性设计与执行记录](superpowers/README.md)：按日期保留的 plan/spec 归档。
- [页面间距检查记录](UI_SPACING.md)：2026-09-14 的检查快照；当前尺寸以源码为准。

## 事实优先级

发生冲突时按以下顺序判断：

1. 可执行源码、`AppScope/app.json5`、`build-profile.json5`、`UPSTREAM.lock` 和测试。
2. 本页列出的当前文档与 `docs/decisions/` 中仍有效的决策。
3. 发布记录、已归档或被取代的设计/决策、执行计划和测试截图。

上述顺序用于核对“实现现在是什么”，不用于降低 `AGENTS.md` 的编程 Agent-first 开发优先级。当前决策是否有效由状态及替代关系决定，不由文件是否带日期决定；发现实现违反当前约束时需修复或取得明确的新决策。

历史文档中的未勾选任务不等于当前待办，历史测试数量也不代表当前测试结果。
