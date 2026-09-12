# jidecards 文档导航

## 当前文档

- [项目 README](../README.md)：产品、当前源码版本、构建入口。
- [开发状态与后续工作](DEVELOPMENT_PLAN.md)：SDK/上游基线、发布限制、验证门和真实后续项。
- [离线公式渲染](math-chemistry-rendering.md)：数学、化学和旧式 LaTeX 导入兼容计划与验收。
- [当前架构](architecture.md)：模块边界、主要数据流和稳定不变量。
- [Agent 设计](agent-2-design.md)：源码中保留的 Agent 能力、安全边界与 2.3.6 发布状态。
- [云端牌组托管](cloud-deck-hosting.md)：公开目录协议和发布操作。
- [官方公告托管](official-announcement-hosting.md)：公告协议、发布、停用与送达语义。
- [源码架构长文](CSDN-记得闪卡项目全解.md)：面向贡献者的完整源码导读与已验证边界。

## 历史材料

- [3.0.0 未发布草案](releases/3.0.0.md)：历史发布文案草案，不是已发布版本。
- [一次性设计与执行记录](superpowers/README.md)：按日期保留的 plan/spec 归档。

## 事实优先级

发生冲突时按以下顺序判断：

1. 可执行源码、`AppScope/app.json5`、`build-profile.json5`、`UPSTREAM.lock` 和测试。
2. 本页列出的当前文档。
3. 带日期的发布记录、设计稿、执行计划、决策日志和测试截图。

历史文档中的未勾选任务不等于当前待办，历史测试数量也不代表当前测试结果。
