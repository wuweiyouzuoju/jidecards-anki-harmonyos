# 2026-09-26：按状态所有权治理跨层风险

## 决策

保留 ArkUI → 业务编排 → Service → protobuf → N-API → Rust → Anki 主干。
优先减少未来编程 Agent 的搜索范围与隐含状态，不以文件行数评价完成度。
既有学习、编辑、表单和应用内 Agent Controller 继续承担原责任，不为统一形式重写。

| 风险 | 唯一入口与处理 | 验证 |
| --- | --- | --- |
| 关闭后旧打开回写状态 | 后端会话 generation 守卫所有异步收尾 | backend-session-lifecycle |
| N-API 入队失败泄漏 | native_module.cpp 在失败分支释放已创建 async work | 原生编译与 HAP；未做平台故障注入 |
| 媒体完整响应跨桥、前端一次持有全文/文件名 | media_snapshot.rs 持有原生快照，报告/文件名有界传输，清理重查后分批 | Rust 十万文件及真实 Core 测试、media-maintenance-session |
| 迁移大 IO 阻塞 | DataTransferFiles Promise IO，迁移服务保留回滚 | data-transfer-files、HAP；设备大集合另验 |
| 首页公告状态分散 | HomeAnnouncementController 统一请求、节流、timer 代次 | home-announcement-scheduling |
| 浏览分页状态分散 | BrowserSearchSession 统一结果、游标、占用、代次 | browser-search-pagination |
| 多语言 RPC 数字手维护 | 锁定分派基线生成 ArkTS、Rust、C++ 常量 | rpc-index-contract、generate-rpc-index --check |
| CI 缺真实 Core/HAP 路线 | test-anki-core 共用入口、可信 Windows runner 定期 HAP | 本地实际执行与远端工作流分别记录 |

## 保留的行为和成本

- 媒体报告始终连续滑动，不新增翻页按钮、文件选择项或删减报告。按需续读只是传输实现；已阅读文本保留供上滑，内存随阅读量增长。
- Core 检查和构造原始响应仍为 O(集合规模)，普通 RPC 保留互斥；本次没有擅自并发访问 Anki collection。
- 牌组删除继续使用删除前后 unused 差集，且确认后重查；不清理历史闲置或已重新引用的文件。
- 集合替换保留完整安全副本，仍需额外磁盘空间。异步 IO 改善响应性，不代表减少复制量或提供杀进程恢复事务。
- HAP workflow 需要预配置的自托管签名主机。工作流文件不能证明远端 runner 存在，也不能替代设备验收。

## 参考与取舍

2026-09-26 查阅的上游资料；不把社区 skill 的流行度当作通用架构权威，也不安装无关框架。

- [OpenAI skill-creator](https://github.com/openai/skills/blob/main/skills/.system/skill-creator/SKILL.md)：采用短入口、按任务加载参考、避免知识重复；落实在现有 PROJECT_CONTEXT/ownership/领域文档，不另建一套规则系统。
- [Refactoring.Guru Extract Class](https://refactoring.guru/extract-class)：移动相关状态与行为，逐步替换调用；沿用本地 architect 与 refactoring-guru-techniques 技能，不为“大页面”引入通用事件总线或基类框架。
- [Node-API async work 生命周期](https://nodejs.org/api/n-api.html#napi_delete_async_work)：创建与排队是独立步骤，失败路径需要释放；实际编译仍以锁定 Harmony SDK 为准。
- HarmonyOS fileIo Promise 签名核对本机 API 23 的 `@ohos.file.fs.d.ts`；SDK 能力优先于泛用 TypeScript 示例。

本决策补充既有首页运行时和编辑/计时/表单边界决策，不替代它们。
当前导航与命令见 [模块责任](../development/ownership.md)、[验证](../development/verification.md)。
