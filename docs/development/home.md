# 首页任务与外部入口

[返回任务索引](../../PROJECT_CONTEXT.md)

- 代码路径以下均相对 `entry/src/main/ets/`。
- 责任链：首页映射 UI → HomeWorkCoordinator / HomeStartupSequence / HomeSyncPolicy 决策 → HomeDataRepository / HomeDeckCommands / 既有 Service。
- 快速反馈：`npm test -- home`；完整验收见 [验证说明](verification.md)。

## 页面操作边界扩展点

首页 `homeActivity()` 只映射占用；`HomeWorkCoordinator` 拥有合并唤醒、外部导入串行消费与任务优先级（外部文件 → 待执行导航 → 手动同步 → 公告 → 引导），每次效果后重查占用。新增集合任务/弹层在映射处登记，释放时触发 `homeActivityChanged`；State 用 Watch，普通字段收尾显式唤醒。`HomeStartupSequence` 拥有云端引导/入门的待展示和读取中状态；销毁禁止迟到展示，已接受导入仍完成并释放队列。公告网络结果经 `HomeAnnouncementController` 暂存，首页安全空闲时再展示，导航/后台不丢待展示项。`CloudDeckFeature` 拥有目录、选择、进度、重试、配额落盘和退出确认；`CloudDeckImportController` 编排串行下载/导入。首页只持有显示目标、忙碌及配额摘要，接收刷新与关闭通知，配额写入完成才释放忙碌。

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
- `model/HomeSyncController.ts` 拥有同步检查定时器、最后一次待执行导航、同步后刷新和待展示 FSRS 提醒。首页通过 `homeSyncHost()` 提供事实与 UI 效果；集合预留先于面板挂载，导航仅等待同步集合占用/刷新，普通首页占用只阻止同步启动。销毁和取消定时器使旧回调失效。
- `model/HomeBackupController.ts` 拥有自动备份延迟任务和配置读取期间的占用；`homeBackupHost()` 与后端工厂隔离 Kit。后台/销毁取消尚未接受的任务，已开始的备份继续由 `BackupCoordinator` 持锁至结束；Core 决定归档间隔和保留数量。读取配置失败进入日志回调，不产生未处理 Promise 拒绝。
- `backend/HomeDeckCommands.ets` 创建并记住牌组、写入别名与背景；`CreateDeckFeature.ets` 和 `DeckCustomizationFeature.ets` 分别拥有表单忙碌态、校验错误及已接受写入的收尾，页面只装配弹层、刷新和提示。背景失败单独反馈，已落盘别名保留；刷新失败不会把已成功写入重新标成可重试写入。
- `components/home/DeckOptionsFeature.ets` 持有表单和校验错误，`model/DeckOptionsDraft.ets` 从表单构造有效草稿；`model/home/DeckOptionsSession.ts` 拥有读取代次、原配置和提交状态，经 `backend/AnkiDeckOptions.ets` 调用服务。`DeckConfigSave.ts` 复制配置、分离共享预设并冻结请求。首页只持有打开目标与占用；失败保留草稿，成功不可重复提交，离页后的已接受写入仍广播 FSRS/首页刷新。
- `model/home/DataTransferSession.ts` 是首页与设置页共用的数据迁移入口，拥有弹层、选择器占用、整库替换二次确认、进度和错误。页面只观察一个状态快照；`components/home/DataTransferFeature.ets` 绑定面板与会话，`backend/AnkiDataTransfer.ets` 适配选择器、导入/替换及 `DataExportWorkflow`。系统入口直接调用 `importUri`，选择器结果在离页后不得启动新写入，已接受写入仍完成并广播，提交后刷新失败不可诱导重复导入。
- 同步的挂载状态、认证和账号由首页传入 `components/同步面板.ets`；任务调度与占用分别由 `model/AutoSyncScheduler.ts`、`model/SyncSettings.ts` 管理。创建牌组和定制弹层的局部状态由各自 Feature 持有，首页只保留显示目标和跨功能占用事实。
- 控制器直接行为测试：`home-sync-controller.test.mjs`、`home-backup-controller.test.mjs`；既有页面集成测试继续覆盖同步、学习、公告和弹层的组合时序。
- 扩展这些功能时沿上述现用调用链修改；历史 Phase 2/3 的独立 store 方案未接入，已移除，不作为待补实现或新功能入口。
- 回归入口：`home-data-repository`、`home-work-coordinator`、`page-domain-models`、`page-repositories`、`deck-config-save`、`deck-options-session`、`home-transfer-session`、`cloud-deck-feature`；平台模块测试注入底层服务，不复制生产编排。

首页的 `build()` 仅排列布局、菜单、功能弹层与提示层；布局仍依赖页面快照，留在同文件 Builder。功能新增状态应进入对应 Feature/Session，不把拆出的表单状态重新挂回首页。已删除两个仅转发参数的旧协调器，设置页也使用同一数据迁移入口。
