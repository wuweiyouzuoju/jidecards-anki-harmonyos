# 首页任务与外部入口

[返回任务索引](../../PROJECT_CONTEXT.md)

- 代码路径以下均相对 `entry/src/main/ets/`。
- 责任链：首页映射 UI → HomeWorkCoordinator / HomeStartupSequence / HomeSyncPolicy 决策 → HomeDataRepository / 既有 Service。
- 首页新建牌组菜单不再提供 AI 制卡/改卡。“更多”通过 `onAgent` → `openAgent` 打开唯一“AI”空白对话入口，配置预检和开发者开关保持在既有责任入口；按需目标选择、改卡搜索与确认见[应用内 Agent](agent.md#统一-ai-对话入口)。
- 平板等直接展示的牌组详情顶部先显示制卡、JIDE、预览的同一行等宽44vp操作，三项共用15fp字号、居中单行文字及对称4vp内部留白，相邻点击区间距沿用常规12vp/紧凑8vp且无额外margin；下方牌组名称独占整行并自然换行；手机详情将三个入口收进右上角“更多”，复用首页更多的无箭头 `AnchoredMenu` 和 `AnchoredMenuItem`，菜单宽度、分隔线、表面、动效和外部关闭层均由公共组件提供，靠右定位于工具栏下方；选择动作前、外部点击、系统返回、退出详情、换牌组或切换布局时关闭菜单。点击预览后显示 `DeckPreviewScopeMenu` 的四种范围，菜单尺寸与牌组长按 Popup 一致；手机保留父菜单中的“预览”行，范围子弹窗锚定该行向左展开；父菜单保留挂载，只有预览范围使用带箭头的 `bindPopup`，选择范围或退出时统一关闭两层菜单。宽屏锚定预览按钮。系统返回先关闭菜单，再退出详情。取卡读取独立集合快照，范围与数据边界见 [只读预览](study-media.md#卡片只读预览)。入口名称为 JIDE，仍进入标题为“JIDE 制卡”的页面。`HomeDeckDetails.onCreateWithAI` 转发到首页既有 `打开AI制卡`，使用当前牌组参数并保留同步等待、配置预检和开发者入口开关；验证见 `ui-shell-deck-actions.test.mjs`、`deck-preview-session.test.mjs`，长标签与长名称的设备观感单独验收。
- 快速反馈：`npm test -- home`；完整验收见 [验证说明](verification.md)。
- 外部 APKG 先确认选项再导入；CSV 映射、结果、取消和中断恢复见[数据导入](import-data.md)。

## 牌组展开记忆与手机详情

首页保留 NavPathStack、选择/快照、刷新与跨功能占用协调。`pages/navigation/HomeDestinations.ets` 只渲染目的地并映射路由参数，导航时机和返回刷新仍由首页负责；`utils/HomeNavigationTransition.ets` 拥有转场代次、淡入与背景冻结顺序，通过宿主回调更新首页透明度。新增页面或调整转场请进入对应模块。

`components/home/HomeDeckDetails.ets` 统一手机详情和宽屏侧栏，复用 `牌组详情面板`；首页 `deckDetails(compact)` 只接一次动作回调和历史刷新 token。详情继续继承首页的 Provide/Consume，不复制选择或快照。`components/home/HomeDeckDeletion.ets` 拥有原生确认、删除服务调用、媒体二次确认和忙碌状态；通过 `onDeleted` 交回首页协调选择、刷新及同步，通过状态回调参与首页占用。已确认写入继续完成，媒体清理提示仍检查前台可见性。

边界回归：`home-composition` 执行真实目的地映射及详情回调，`home-deletion-runtime` 执行真实删除入口与事务收尾，`iridescent-rendering` 执行真实转场实现。移除的首页主题切换、带搜索浏览入口及取消隐藏弹窗均已无调用；现用入口仍分别由设置/浏览模块负责。

`model/HomeDeckExpansion.ts` 负责展开集合与已知 ID 的协调及持久化格式，`utils/HomeDeckExpansionStore.ets` 是本机 `homeDeckExpansion` 偏好的唯一读写入口。首页在启动加载前同步恢复，通过展开集合的 Watch 保存单击、递归切换、显式选择祖先路径和导入后的变化；刷新先更新已知 ID 再触发保存。首次安装默认展开父牌组，已有牌组保留折叠，新 ID 默认展开，删除 ID 在成功刷新时清理。宽屏自动恢复上次选择不展开祖先，避免覆盖折叠记忆。存储快照在调用时冻结，flush 串行且不随页面销毁取消，失败记录日志；读取失败不回写覆盖原偏好。

手机详情仍挂在首页 Stack 内以继承 Provide。`homeLayout` 在 `xs && 显示牌组详情` 时使用 `Visibility.Hidden`，保留列表位置和断点测量，同时禁止底层列表绘制与点击。幻彩页面表面透明，不能仅靠详情背景遮住首页，否则操作区间隙和底部安全区会透出牌组行。宽屏恢复双栏，主题背景继续由根 `ThemeBackground` 提供；预览覆盖页和导航页保留各自已有的生命周期。这里不改变间距：卡片与按钮间距仅由操作区 top padding 贡献，底部由 `操作区底部间距(narrow, navigationBottomInset)` 贡献。

回归入口：`tools/tests/home-deck-expansion.test.mjs`，覆盖重启、全部折叠、新增/删除、连续保存、失败重试、页面接线及手机/宽屏显隐。实际设备仍需检查幻彩/普通主题、宽窄密度、导航条有无、横竖屏、返回列表位置与冷启动恢复；Node 测试不模拟 ArkUI 布局。

`HomeDataRepository.load()` 只读取牌组树、本机展示偏好及隐藏列表；首页完成选择校验后即可放行学习。`loadStatistics()` 单独读取图表，经 `StatsWidgetPublisher` 聚合并 await 桌面卡片保存/推送（与统计页、FSRS 共用），由首页 `statisticsQueue` 持有，不能再串回同步完成/学习入口的等待链。必要牌组刷新仍由 `refreshQueue` 串行；每次实际加载递增代次，统计队列跳过旧代次、已离页或等待导航的任务，已接受的推送完整结束后才执行下一项。返回首页会重新读取统计，迟到结果不覆盖新快照或学习期间的界面。回归：`home-data-repository`、`home-sync-refresh-runtime`；后者覆盖慢推送、导航抢先、销毁和过期代次。

## 页面操作边界扩展点

首页 `homeActivity()` 只映射占用；`HomeWorkCoordinator` 拥有合并唤醒、外部导入串行消费与任务优先级（外部文件 → 待执行导航 → 手动同步 → 公告 → 引导），每次效果后重查占用。新增集合任务/弹层在映射处登记，释放时触发 `homeActivityChanged`；State 用 Watch，普通字段收尾显式唤醒。`HomeStartupSequence` 拥有云端引导/入门的待展示和读取中状态；销毁禁止迟到展示，已接受导入仍完成并释放队列。公告网络结果经 `HomeAnnouncementController` 暂存，首页安全空闲时再展示，导航/后台不丢待展示项。`CloudDeckFeature` 拥有目录、选择、进度、重试、配额落盘和退出确认；`CloudDeckImportController` 编排串行下载/导入。首页只持有显示目标、忙碌及配额摘要，接收刷新与关闭通知，配额写入完成才释放忙碌。

浏览页所有数据写入经 `runBrowserOperation`，批量选择写入再经 `runBatchOperation`；`BrowserOperationController` 固定模式/ID/视图代次/选择代次，完成仅清理原选择。新增命令先复制额外输入（如映射/日期），不可在 await 后重新读取可变 UI 参数。离页 dispose 只禁止回写 UI，已接受写入保持 `AutoSyncScheduler` 的独立操作占用直至完成，再广播刷新/同步；不得把该占用当作学习完成页。搜索和分页按查询代次失效，分页游标记录消费 ID 数而非成功行数，编辑/映射/卡片信息有独立读取代次。回归入口 `page-operation-boundaries.test.mjs`。


## 首页入门与删除媒体

2.9.9 通过 `HomeStartupSequence.gift` 在公告、云端引导（如启用）和入门确认之后展示幻彩赠送提醒；同一首页展示槽位阻止与同步、导入或其他弹窗叠加，后台/离页会延迟结果，销毁后失效。`utils/IridescentGiftStore.ets` 先等待权益验签恢复，已获得幻彩或已确认提醒的用户跳过；独立修订键 `iridescent_gift_notice_299_completed` 只在确认/返回时保存，失败提示并恢复缓存，下次启动重试。`IridescentGiftPanel` 与主题锁定入口共用复制动作。回归：`home-work-coordinator`、`theme-iridescent-gift`。

宽版牌组溢出建议由 `主页牌组列表.onOverflowChange` 报告实际视口是否容得下可见行，经 `HomeWorkCoordinator.presentLayoutSuggestion` 在空闲首页展示；排在现有启动提示之后。确认直接复用宽窄偏好保存入口，处理记录持久化避免反复打扰，见[界面文档](appearance.md)。列表只负责几何事实，不持有弹窗或写设置。

`HomeIntroPanel` 复用首页启动弹层序列，在公告处理后展示（直链渠道暂停时跳过云端牌组流程）；`HomeIntroStore` 用独立内容修订键，只有确认才写入，旧欢迎版本不抑制新介绍。首页“更多 → 速览”可重看。新用户说明明确默认配置即可开始，不要求先探索复杂设置。内容覆盖闪卡用途、牌组获取渠道（QQ群、Anki 共享牌组、AI 或人工制卡）、外部 Agent 制卡/改卡、APKG 导入复习以及 3.0.0 前老用户进群领取幻彩兑换码；沿用现有签名兑换，不自动授予权益。

删除牌组期间显示忙碌遮罩，自动同步与其他首页操作等待。`DeckMediaCleanup` 比较删除前后 Core 媒体检查的 unused 差集，仅提示此次新增未引用文件；用户单独确认后再次检查，仍 unused 的确认文件才移入媒体回收站，绝不清空全局回收站。媒体同步活动或检查失败时保留媒体，牌组删除成功不回滚、不误报为删除失败。共享引用、原有闲置媒体和筛选牌组归还的卡片受检查保护。行为测试在 `deck-media-cleanup` 与 `home-deletion-runtime`。

牌组色条候选为蓝、紫、绿、黄、红五色和取消色条；绿色/黄色继续使用现有 mint/amber 存储键，历史黑色仍正确显示但不再提供为新候选。色条子菜单仅以当前主题色文字标明选中项（幻彩沿用主题文字渐变），不显示勾号。定制入口显示“改名 / 自定义背景”，隐藏操作使用正常正文色。

速览中的官方QQ群号在获取渠道与幻彩说明内均可点击复制，Anki共享牌组链接调用系统浏览器；点击链接使用独立蓝色资源以免随幻彩文字变色。`iridescent_preview.png` 为用户提供的实际主题截图，按原始比例展示于说明下方。布局与交互需在设备上验证；覆盖安装保留用户数据。


## APKG 系统打开入口

`module.json5` 注册 `FileOpen` 与 `com.jide.kapian.apkg`，`resources/rawfile/arkdata/utd/utd.json5` 将 `.apkg` 和专用 MIME 映射到自定义 UTD。EntryAbility 的冷/热启动都通过 `ExternalDeckOpen` 校验原始文件 URI 并排队，AppStorage 只广播修订号。首页空闲且集合就绪后，系统入口与文件选择器共用 `importDeckUri`；不再弹选择器或要求再次确认，显示已有进度/错误面板并刷新牌组。学习、编辑、弹层和同步占用期间保留请求；待处理时启动提示与自动同步让路。只自动导入 APKG，不允许 COLPKG 整库替换。同 URI 在队列和导入期间去重，完成后允许主动重新打开。系统入口扩展与队列验证见 `tools/tests/external-deck-open.test.mjs`。

## 数据与牌组修改入口

- 首页右上角“新建牌组”菜单的顺序由 `AppInterface.ts` 统一定义：普通牌组、导入、可用下载渠道、创建筛选牌组，UI 与 JIDE 共用。“创建筛选牌组”始终位于可见菜单末尾且仅实验版显示（简洁模式为 false），按搜索条件取卡，不隐式绑定当前牌组；长按菜单中的学习入口保留接收当前牌组 ID 的“自定义学习”。`EntryAbility.onCreate` 在发布 Ability 上下文后、创建首屏前调用 `简洁模式存储.initializeSimpleMode`，同步恢复已保存模式到 AppStorage，实验版冷启动不再依赖先打开设置。新用户默认简洁版，读取失败保留已知模式；启动只读取偏好。创建入口由 `components/主页操作面板.ets` 回调至首页，不再经牌组列表逐层转发；回归见 `home-simple-mode.test.mjs` 与 `create-deck-contract.test.mjs`。
- `components/home/自定义学习对话框.ets` 保留单页：六种方式列表下只显示当前方式的说明与输入，状态/标签方式额外显示四种卡片范围和包含/排除标签。整个表单按内容占高、顶部对齐，仅空间不足时收缩滚动，不用纵向 `layoutWeight(1)` 撑满弹窗。
- `components/home/创建过滤牌组面板.ets` 的排序标签与选择框在同一行：标签占剩余宽度，选择框靠右，宽度与长名称省略复用 `SelectStyle.fieldWidth/fieldConstraint`，两者间距为 12vp；排序值、选项及忙碌禁用仍由原表单持有。
- 文案与设置含义对照本地 AnkiDroid `dialogs/customstudy/CustomStudyDialog.kt`、`values-zh-rCN/03-dialogs.xml` 及锁定 Core 的 `custom-study.ftl`：额度默认值用 Core 的 `extendNew/extendReview`，子牌组可用数分列显示；预览是过去 N 天添加的新卡，不重新排程。天数与抽取张数由 `backend/CustomStudyPreferences.ets` 记在本机，读取失败可重试，保存偏好失败不能诱导重复创建。
- `model/CustomStudyOptions.ts` 负责整数校验与默认值；`SchedulerMessages.ts` 的 Cram oneof 7 保留原始标签数组与 Core 枚举，筛选/排序/排程仍由 Core 决定。包含任一标签、排除任一标签、无标签限制均沿用 Core 语义。回归入口 `custom-study-options.test.mjs`、`custom-study-dialog.test.mjs`；设备验收覆盖正常/大字号、键盘、六种方式切换、负增量与状态/标签选择。
- `backend/HomeDataRepository.ets` 组装牌组树、用户覆盖、隐藏集合、图表及桌面卡片快照；统计范围和暂停分离口径来自持久化偏好。图表失败降级，桌面卡片保存失败不阻塞牌组列表。
- `model/HomeRefreshQueue.ts` 串行刷新；销毁后不再启动排队读取。`HomeDeckExpansion.ts` 合并展开状态，保留主动折叠，只自动展开新父牌组。
- `model/HomeSyncPolicy.ts` 从首页事实判定丢弃、暂停、等待或启动同步；手动请求越过尚未展示的启动工作，仍等待真实占用。
- `model/HomeSyncController.ts` 拥有同步检查定时器、最后一次待执行导航、同步后刷新和待展示 FSRS 提醒。首页通过 `homeSyncHost()` 提供事实与 UI 效果；集合预留先于面板挂载，导航仅等待同步集合占用/刷新，普通首页占用只阻止同步启动。销毁和取消定时器使旧回调失效。
- `model/HomeBackupController.ts` 拥有自动备份延迟任务和配置读取期间的占用；`homeBackupHost()` 与后端工厂隔离 Kit。后台/销毁取消尚未接受的任务，已开始的备份继续由 `BackupCoordinator` 持锁至结束；Core 决定归档间隔和保留数量。读取配置失败进入日志回调，不产生未处理 Promise 拒绝。
- `backend/HomeDeckCommands.ets` 创建并记住牌组、写入别名与背景；`CreateDeckFeature.ets` 和 `DeckCustomizationFeature.ets` 分别拥有表单忙碌态、校验错误及已接受写入的收尾，页面只装配弹层、刷新和提示。背景失败单独反馈，已落盘别名保留；刷新失败不会把已成功写入重新标成可重试写入。
- `components/home/DeckOptionsFeature.ets` 持有表单和校验错误，`model/DeckOptionsDraft.ets` 从表单构造有效草稿；`model/home/DeckOptionsSession.ts` 拥有读取代次、原配置和提交状态，经 `backend/AnkiDeckOptions.ets` 调用服务。`DeckConfigSave.ts` 复制配置、分离共享预设并冻结请求。首页只持有打开目标与占用；失败保留草稿，成功不可重复提交，离页后的已接受写入仍广播 FSRS/首页刷新。
- `model/home/DataTransferSession.ts` 是首页与设置页共用的数据迁移入口，拥有弹层、选择器占用、整库替换二次确认、进度和错误。页面只观察一个状态快照；`components/home/DataTransferFeature.ets` 绑定面板与会话，`backend/AnkiDataTransfer.ets` 适配选择器、导入/替换及 `DataExportWorkflow`。系统入口直接调用 `importUri`，选择器结果在离页后不得启动新写入，已接受写入仍完成并广播，提交后刷新失败不可诱导重复导入。
- 同步的挂载状态、认证和账号由首页传入 `components/同步面板.ets`；面板通过 `backend/AnkiSyncSession.ets` 创建 `model/SyncSession.ts`，只展示快照并传递冲突选择/详情显隐。会话拥有集合 RPC、媒体终态轮询和销毁收尾，调度与占用仍分别由 `AutoSyncScheduler`、`SyncActivity` 管理。创建牌组和定制弹层的局部状态由各自 Feature 持有，首页只保留显示目标和跨功能占用事实。
- 控制器直接行为测试：`home-sync-controller.test.mjs`、`home-backup-controller.test.mjs`；既有页面集成测试继续覆盖同步、学习、公告和弹层的组合时序。
- 扩展这些功能时沿上述现用调用链修改；历史 Phase 2/3 的独立 store 方案未接入，已移除，不作为待补实现或新功能入口。
- 回归入口：`home-data-repository`、`home-work-coordinator`、`page-domain-models`、`page-repositories`、`deck-config-save`、`deck-options-session`、`home-transfer-session`、`cloud-deck-feature`；平台模块测试注入底层服务，不复制生产编排。

首页的 `build()` 仅排列布局、菜单、功能弹层与提示层；布局仍依赖页面快照，留在同文件 Builder。功能新增状态应进入对应 Feature/Session，不把拆出的表单状态重新挂回首页。已删除两个仅转发参数的旧协调器，设置页也使用同一数据迁移入口。


公告的并发检查、最近检查时间、延迟任务和取消代次统一归 `HomeAnnouncementController`；首页只传是否允许展示、网络读取、展示效果。暂停后的迟到 timer 不得清除新 timer，销毁后不再调度。直接回归：`home-announcement-scheduling.test.mjs`。

牌组直链渠道通过 `model/ReleaseFeatures.ets` 的 `CLOUD_DECK_CHANNEL_ENABLED` 暂时关闭：开屏跳过云端引导，首页菜单隐藏获取直链牌组，打开方法也检查同一开关。保留下载实现、历史配额与用户内容；恢复时统一调整该开关。

下拉刷新圈由 `主页牌组列表.refreshDecks()` 持有，等待首页 `onRefresh` 返回的 Promise 后在 finally 收起，不依赖父级布尔 Prop 的 Watch。同步占用时立即跳过、加载失败、上下文缺失均须完成收尾；首页的刷新占用另由回调 finally 释放。回归见 `home-pull-refresh.test.mjs`，设备仍需验收连续下拉与同步期间下拉。


筛选牌组的排序方式和自定义学习的卡片范围使用 FormSelectRow；牌组背景选择/替换放到标题右侧，保留预览删除按钮及撤销移除入口。说明、限宽和省略策略归公共选择/辅助行，牌组、自定义学习与定制会话仍持有选值及保存状态。
