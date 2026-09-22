# 首页任务与外部入口

[返回任务索引](../../PROJECT_CONTEXT.md)

- 代码路径以下均相对 `entry/src/main/ets/`。
- 责任链：首页映射 UI → HomeWorkCoordinator / HomeStartupSequence / HomeSyncPolicy 决策 → HomeDataRepository / HomeDeckCommands / 既有 Service。
- 快速反馈：`npm test -- home`；完整验收见 [验证说明](verification.md)。

## 页面操作边界扩展点

首页 `homeActivity()` 只映射占用；`HomeWorkCoordinator` 拥有合并唤醒、外部导入串行消费与任务优先级（外部文件 → 待执行导航 → 手动同步 → 公告 → 引导），每次效果后重查占用。新增集合任务/弹层在映射处登记，释放时触发 `homeActivityChanged`；State 用 Watch，普通字段收尾显式唤醒。`HomeStartupSequence` 拥有云端引导/入门的待展示和读取中状态；销毁禁止迟到展示，已接受导入仍完成并释放队列。公告网络结果经 `HomeAnnouncementController` 暂存，首页安全空闲时再展示，导航/后台不丢待展示项。`CloudDeckImportController` 只编排固定的串行下载/导入任务与进度；首页适配 Kit、刷新、配额和启动引导，配额写入完成才释放忙碌。

浏览页所有数据写入经 `runBrowserOperation`，批量选择写入再经 `runBatchOperation`；`BrowserOperationController` 固定模式/ID/视图代次/选择代次，完成仅清理原选择。新增命令先复制额外输入（如映射/日期），不可在 await 后重新读取可变 UI 参数。离页 dispose 只禁止回写 UI，已接受写入保持 `AutoSyncScheduler` 的独立操作占用直至完成，再广播刷新/同步；不得把该占用当作学习完成页。搜索和分页按查询代次失效，分页游标记录消费 ID 数而非成功行数，编辑/映射/卡片信息有独立读取代次。回归入口 `page-operation-boundaries.test.mjs`。


## 首页入门与删除媒体

`HomeIntroPanel` 复用首页启动弹层序列，在公告与首次云端牌组流程后展示；`HomeIntroStore` 用独立内容修订键，只有确认才写入，旧欢迎版本不抑制新介绍。首页“更多 → 应用速览”可重看。说明覆盖闪卡用途、牌组获取渠道（QQ群、Anki 共享牌组、AI 或人工制卡）、外部 Agent 制卡/改卡、APKG 导入复习以及 3.0.0 前老用户进群领取幻彩兑换码；沿用现有签名兑换，不自动赠送或调整应用版本。

删除牌组期间显示忙碌遮罩，自动同步与其他首页操作等待。`DeckMediaCleanup` 比较删除前后 Core 媒体检查的 unused 差集，仅提示此次新增未引用文件；用户单独确认后再次检查，仍 unused 的确认文件才移入媒体回收站，绝不清空全局回收站。媒体同步活动或检查失败时保留媒体，牌组删除成功不回滚、不误报为删除失败。共享引用、原有闲置媒体和筛选牌组归还的卡片受检查保护。行为测试在 `deck-media-cleanup` 与 `home-deletion-runtime`。

牌组色条候选为蓝、紫、绿、黄、红五色和取消色条；绿色/黄色继续使用现有 mint/amber 存储键，历史黑色仍正确显示但不再提供为新候选。定制入口显示“改名 / 自定义背景”，隐藏操作使用正常正文色。

速览中的官方QQ群号在获取渠道与幻彩说明内均可点击复制，Anki共享牌组链接调用系统浏览器；点击链接使用独立蓝色资源以免随幻彩文字变色。`iridescent_preview.png` 为用户提供的实际主题截图，按原始比例展示于说明下方。布局与交互需在设备上验证；覆盖安装保留用户数据。


## APKG 系统打开入口

`module.json5` 注册 `FileOpen` 与 `com.jide.kapian.apkg`，`resources/rawfile/arkdata/utd/utd.json5` 将 `.apkg` 和专用 MIME 映射到自定义 UTD。EntryAbility 的冷/热启动都通过 `ExternalDeckOpen` 校验原始文件 URI 并排队，AppStorage 只广播修订号。首页空闲且集合就绪后，系统入口与文件选择器共用 `importDeckUri`；不再弹选择器或要求再次确认，显示已有进度/错误面板并刷新牌组。学习、编辑、弹层和同步占用期间保留请求；待处理时启动提示与自动同步让路。只自动导入 APKG，不允许 COLPKG 整库替换。同 URI 在队列和导入期间去重，完成后允许主动重新打开。系统入口扩展与队列验证见 `tools/tests/external-deck-open.test.mjs`。

## 数据与牌组修改入口

- `backend/HomeDataRepository.ets` 组装牌组树、用户覆盖、隐藏集合、图表及桌面卡片快照；统计范围和暂停分离口径来自持久化偏好。图表失败降级，桌面卡片保存失败不阻塞牌组列表。
- `model/HomeRefreshQueue.ts` 串行刷新；销毁后不再启动排队读取。`HomeDeckExpansion.ts` 合并展开状态，保留主动折叠，只自动展开新父牌组。
- `model/HomeSyncPolicy.ts` 从首页事实判定丢弃、暂停、等待或启动同步；手动请求越过尚未展示的启动工作，仍等待真实占用。
- `backend/HomeDeckCommands.ets` 创建并记住牌组、写入别名与背景；页面只处理表单、刷新和提示。背景失败单独反馈，已落盘别名保留。
- `model/DeckConfigSave.ts` 负责配置复制、共享预设分离和完整请求快照；配置表单负责校验。首页持有牌组选项弹层与编辑状态，经 `components/home/牌组选项协调器.ets` 接收保存回调，再调用 `backend/牌组配置服务.ts` 提交有效请求。
- 数据迁移的弹层、进度和错误由首页持有，`components/home/数据迁移协调器.ets` 转发用户意图；首页的 `importDeckUri` / `确认个人数据替换` 调用 `backend/数据迁移服务.ts`，导出交给 `backend/DataExportWorkflow.ets`。
- 同步的挂载状态、认证和账号由首页传入 `components/同步面板.ets`；任务调度与占用分别由 `model/AutoSyncScheduler.ts`、`model/SyncSettings.ts` 管理。创建牌组和定制弹层同样由首页持有 UI 状态，写入交给 `HomeDeckCommands`。
- 扩展这些功能时沿上述现用调用链修改；历史 Phase 2/3 的独立 store 方案未接入，已移除，不作为待补实现或新功能入口。
- 回归入口：`home-data-repository`、`home-work-coordinator`、`page-domain-models`、`page-repositories`、`deck-config-save`；平台模块测试注入底层服务，不复制生产编排。
