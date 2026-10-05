# 模块责任与边界

[返回任务索引](../../PROJECT_CONTEXT.md)

这张表是编程 Agent 判断“应该从哪里开始、代码应该放哪里、改完验证什么”的当前入口。更细的行为规则以源码和对应领域文档为准。

## `entry`

JIDE 通用空会话文案顺序归 `model/agent/AgentSuggestions.ts`，场景建议规则与能力筛选归 `AgentAppRecommendations.ts`，文字归中英文资源。`AppInterfaceTracker` 独占最近非 JIDE 页的上下文与销毁释放；结构工具和提示共用纯建议模型。`AgentEmptySuggestions.ets` 独占轮换、手势和剪贴板，页面只装配可见状态与读取回调。入口与验证见 [空会话提示](agent.md#jide-空会话提示)。

应用内 Agent 的数学/化学显示由 `model/agent/AgentMath.ts` 拥有分隔符、转义、排版队列和尺寸回执校验，`AgentMathDocument.ts` 用共同 Markdown 解析器组合整段安全表格文档，`components/agent/AgentMathText.ets` 拥有单个 ArkWeb 生命周期与内容高度；正文、表格与含公式思考经 `AgentMarkdownText` 组合。沿用学习/预览的离线资源响应，保持各自输入信任边界。入口、验证与设备范围见 [对话公式](agent.md#对话中的数学与化学公式)。

| 路径 | 唯一责任 | 不应承担 |
| --- | --- | --- |
| `entry/src/main/ets/pages/` | 页面装配、展示和用户输入 | 跨页面业务状态、协议编码、持久化细节 |
| `entry/src/main/ets/components/` | 可复用 UI 和局部交互 | 直接拥有跨页面数据或绕过编排层写入 |
| `entry/src/main/ets/model/` | `.ts` 为可直接测试的模型/编排/协议使用方；既有 `.ets` 为主题与存储等平台适配 | 纯模型引入 Kit/UI、未声明所有者的全局状态 |
| `entry/src/main/ets/backend/` | 网络、平台和外部服务边界 | 把平台失败伪装成成功、依赖页面实例 |
| `entry/src/main/ets/stores/` | 明确声明的持久化状态和读取协调 | 成为所有模块的无边界共享状态 |
| `entry/src/main/ets/proto/`、`entry/src/main/cpp/types/`、`native/napi_bridge/` | 跨 ArkTS/Native 的协议、声明和桥接 | 在页面或工具脚本中复制协议定义 |

页面密度定义归 `model/AppLayoutState.ts`，持久化仍归 DeckListAppearanceStore；前后台键归 `model/AppLifecycleState.ts`，发布者是 EntryAbility；主题动画键归 ThemeCatalog，保存入口保持 RedemptionStore。公共组件直接依赖与既有业务 UI 迁移例外由 `common-boundary.test.mjs` 管理，索引见 [公共 UI](../../entry/src/main/ets/components/common/README.md)。

### 状态所有者

牌组层级调整的 ID、路径快照和父子合并规则归 `model/DeckReparent.ts`；同级排列、升级/降级目标与展开子树重排归 `model/DeckReorder.ts`。`backend/DeckHierarchyCommands.ets` 串行层级/排序写入，独占提交前重查、同步占用、Core ReparentDecks 和原本机顺序存储入口。`DeckReparentFeature` 拥有手动选择/预览与返回策略；首页拥有排序模式、保存占用和唯一右侧层级菜单行 ID，`牌组列表项` 复用既有 Popup/MenuSurface/ActionMenuList。JIDE 仍通过原 `AgentAuxiliaryTools` 读取/提案和 `AgentActionExecutor` 确认执行。菜单及当前表单状态与 JIDE 共用 AppInterface；见[首页](home.md#牌组展开记忆与手机详情)及[牌组层级操作](agent.md#牌组层级操作)。

白板宿主 `components/学习手写白板层.ets` 拥有引擎选择、原版 `StudyWhiteboard` 草稿、官方初始化代次与超时；套件缺失、不可访问、加载失败或超时自动回退原版，当前学习会话内不反复尝试失败的套件。官方笔迹、笔刷、擦除、套索和历史归 `HandwriteComponent`；`StudyPenCanvas.ets` 每个实例拥有一个 Controller，`StudyPenCanvasHost.ets` 拥有动态加载和 BuilderNode 创建/释放，参数共用 `StudyPenCanvasParameters.ts`。`backend/StudyPenKitAvailability.ets` 在导入前检查 SysCap 与系统 HSP 映射，防止缺包引起原生 abort。原版 `model/StudyWhiteboard.ts` 只管理笔迹与有界历史，`StudyLocalWhiteboard.ets` 拥有 Canvas、触摸和工具 UI。学习页拥有挂载、显隐、按键和下一题通知；收起/翻面保留画布，下一题清空，完成/退出释放。JIDE 共用 `AppInterface.WHITEBOARD_INTERFACE_ITEMS`，各渲染器发布自身真实状态，官方内部值与两种引擎的笔迹内容均不冒充可读取。入口与检查边界见[手写白板](study-media.md#手写白板)。

Anki 官方教程的选章与检索别名归 `tools/anki-manual-topics.json`，原文/版本/许可证由 `tools/vendor-anki-manual.mjs` 从官方已提交版本生成到 rawfile。`model/agent/AgentAnkiHelp.ts` 独占检索、分段范围和读取代次，`backend/agent/AgentAnkiHelpTools.ets` 适配 ResourceManager；不借用用户附件授权或持久会话缓存，不持有写入执行器。更新与验证见 [官方教程](agent.md#anki-官方教程按需读取)。

笔记类型管理/编辑的草稿和读取代次由对应设置组件拥有；`model/NotetypeManagement.ts` 独占模板身份序列化、克隆及集合保护下的写入会话，Core 负责生成/移除卡片。预览经共用 `NoteDraftPreview`，文本导出经原有 `DataTransferSession` 和 `DataExportWorkflow`；详见[浏览与编辑](browser-stats.md)和[数据迁移](import-data.md)。

未保存预览由 `model/NoteDraftPreview.ts` 拥有冻结输入、Core 模板/Cloze 选择、读取代次和退出后收尾；`backend/AnkiNoteDraftPreview.ets` 独占临时 cache 媒体及清理。`components/common/NoteDraftPreview.ets` 映射状态，`NotetypeTemplatePreview.ets` 复用 CardWebView/HTML/媒体和 CardAudioSession，不执行笔记写入。直接行为见 `note-draft-preview*.test.mjs`，真实 Core 只读性、身份和学习记录回归见 `native/rsharmony/tests/note_draft_preview.rs`。

界面结构由 `model/AppInterface.ts`、`SettingsNavigation.ts` 和 `SettingsStructure.ts` 共同声明；UI 的菜单/设置卡片枚举与 JIDE 的只读结构工具共用入口。`backend/AppInterfaceService.ets` 独占已挂载界面的语义观察，组件更新/离开负责登记/释放；不承载业务写入或凭证。当前覆盖和扩展方式见 [软件界面认知](agent.md#软件界面认知)。

页面标识、JIDE 导航动作、动作参数和清栈约束由 `model/navigation/AppNavigation.ts` 共同声明，`HomeDestinations` 使用真实目的地，`AgentAppStructure` / `AgentSessionContext` 重建本次能力目录与指纹。`AgentAppNavigationSession` 拥有单页导航队列、代次与当前宿主就绪状态读取，结构工具不缓存占用事实；`AgentAppNavigationTools.readNavigationTarget` 适配真实对象读取，Scope 保持只读，成功回复收尾后通过类型化回调交给首页 Navigation 执行。编辑复用 `EditNotePage`，卡片预览复用浏览页的初始搜索和原预览，牌组详情/选项复用首页选择与原 `DeckOptionsFeature`；导航不持有页面或卡库写入执行器，不替代学习调度与表单保存。行为与扩展见[自动页面操作](agent.md#自动页面操作)。

平面动作菜单的条目渲染与选择守卫由 [ActionMenuList](../../entry/src/main/ets/components/common/ActionMenuList.ets) 负责，复用 `AnchoredMenuItem` 的行样式和默认主题色；定位/表面仍归 `AnchoredMenu` / `MenuSurface`。首页两菜单负责 registry 显隐、本地化、图标语义和业务回调，公共列表不依赖首页模型或全局业务状态。回归入口：`ui-shell-action-menu-list.test.mjs`；范围与设备验收见 [首页](home.md)。

原生中性轮廓只由 [SurfaceBorder](../../entry/src/main/ets/utils/SurfaceBorder.ets) 和 `surface_border` 明暗资源拥有；菜单表面、统计/详情/设置/字段卡片、弹窗、输入框、下拉框与玻璃按钮共用边框参数，分隔线和设置色板共用颜色入口。宿主继续拥有底色、圆角、布局、输入行为与选中状态；图片灰底可传对应轮廓色。回归入口：`ui-surface-border.test.mjs`、`ui-shell-controls.test.mjs`、`ui-select-layout.test.mjs`、`theme-text.test.mjs`；边界与合理差异见 [界面](appearance.md)。

卡片缩放、牌组样式和触感的写入分别经 `CardTextSizeStore`、`DeckListAppearanceStore`、`StudyHaptics`；`utils/LocalPreferenceWrite.ets` 拥有三项共享保存队列、原值校验和保存后广播，设置页与 JIDE 共用。助手支持项在 `AgentPreferenceSettings.agentWritablePreferenceIds()`，提案/确认仍归 `AgentAppSettingsTools` / `AgentActionExecutor`。入口与行为测试见 [应用内 Agent 设置](agent.md#应用设置读取与修改)。

应用主题修改由 `backend/AppThemeService.ets` 中的 `appThemeSession` 唯一串行处理，纯策略在 `model/settings/ThemeModeSession.ts`；设置页、应用内 Agent 和撤销共用入口。主题色的 `appThemeColorSession` / `ThemeColorSession.ts` 同样由设置页与助手共用；FSRS 初始化和修改归 `model/FSRS控制器.ets` 的串行入口。系统颜色通知和启动初始化继续由 EntryAbility/首页负责。助手能力目录与单轮许可在 `AgentSettingsTools.ts` / `AgentAppSettingsTools.ets`，不持有卡库确认执行器。验证入口：`theme-mode-session.test.mjs`、`ai-agent-app-settings.test.mjs`；行为说明见 [应用内 Agent 设置](agent.md#应用设置读取与修改)。

学习手势由 `model/StudyGestures.ts` 唯一识别和映射；`model/实验性功能存储.ets` 拥有互斥的本机快捷答题模式与四象限引导已读状态；学习页拥有当前卡面代次和教学显隐，提交评分仍归 `StudySessionController`。入口与验证见 [学习手势与四象限引导](study-media.md#学习手势与四象限引导)。

下面按实际状态定位，不要求为每个函数另建抽象。页面拥有导航、跨功能占用和页面数据快照；功能组件拥有局部可观察状态，纯会话通过回调发布结果。

| 状态或资源 | 所有者 / 生命周期 | 直接验证入口 |
| --- | --- | --- |
| 标签层级、三态选择与批量差量 | [NoteTags](../../entry/src/main/ets/model/NoteTags.ts) 拥有完整路径和选择基线；[TagPicker](../../entry/src/main/ets/components/common/TagPicker.ets) 拥有读取代次与临时草稿；宿主拥有保存，浏览提交归 BrowserOperationController | [browser-note-tags](../../tools/tests/browser-note-tags.test.mjs)、[Core 标签](../../native/rsharmony/tests/note_tags.rs)；[标签边界](browser-stats.md#标签选择与管理) |
| 首页牌组展开记忆 | [HomeDeckExpansion](../../entry/src/main/ets/model/HomeDeckExpansion.ts) 协调 ID；[HomeDeckExpansionStore](../../entry/src/main/ets/utils/HomeDeckExpansionStore.ets) 唯一偏好入口，串行落盘独立于页面生命周期 | [home-deck-expansion](../../tools/tests/home-deck-expansion.test.mjs)；手机透明详情的底层显隐见 [首页](home.md#牌组展开记忆与手机详情) |
| 首页目的地与详情装配 | [HomeDestinations](../../entry/src/main/ets/pages/navigation/HomeDestinations.ets)、[HomeDeckDetails](../../entry/src/main/ets/components/home/HomeDeckDetails.ets)；页面栈、选择及动作仍由首页持有 | [home-composition](../../tools/tests/home-composition.test.mjs) |
| 首页导航转场 | [HomeNavigationTransition](../../entry/src/main/ets/utils/HomeNavigationTransition.ets)；持有代次、淡入顺序与背景冻结回调 | [iridescent-rendering](../../tools/tests/iridescent-rendering.test.mjs) |
| 首页删除交互与媒体二次确认 | [HomeDeckDeletion](../../entry/src/main/ets/components/home/HomeDeckDeletion.ets)；Core 提交后交回首页协调选择、刷新与同步，媒体清理由 DeckMediaCleanup 校验 | [home-deletion-runtime](../../tools/tests/home-deletion-runtime.test.mjs)、[deck-media-cleanup](../../tools/tests/deck-media-cleanup.test.mjs) |
| 弹窗外壳与返回层级 | `DialogFrame` / `DialogBackdrop` 只拥有展示几何和主题；宿主拥有显隐，功能组件拥有草稿与忙碌状态，`backRequest` 沿已挂载的最上层传递并消费 | [ui-dialog-layout](../../tools/tests/ui-dialog-layout.test.mjs)，ArkUI 的观察更新、键盘和布局另需设备验收 |
| 媒体检查、报告续读与清理 | [MediaMaintenanceSession](../../entry/src/main/ets/model/settings/MediaMaintenanceSession.ts)；原生快照随 backend/面板释放，已接受写入独立完成 | [media-maintenance-session](../../tools/tests/media-maintenance-session.test.mjs)、Rust media_snapshot 测试 |
| 浏览查询结果、游标与分页占用 | [BrowserSearchSession](../../entry/src/main/ets/model/BrowserSearchSession.ts)；新查询使旧分页失效 | [browser-search-pagination](../../tools/tests/browser-search-pagination.test.mjs) |
| 公告节流与延迟任务 | [HomeAnnouncementController](../../entry/src/main/ets/model/HomeAnnouncementController.ts)；暂停/销毁失效旧 timer | [home-announcement-scheduling](../../tools/tests/home-announcement-scheduling.test.mjs) |
| 幻彩赠送提醒与锁定入口 | HomeStartupSequence 持有启动优先级/待展示状态，IridescentGiftStore 读取验签权益及保存确认，IridescentGiftPanel 共用领赠与复制；外观分组只在可用时发起主题切换 | [theme-iridescent-gift](../../tools/tests/theme-iridescent-gift.test.mjs)、[home-work-coordinator](../../tools/tests/home-work-coordinator.test.mjs) |
| 迁移文件描述符与目录树 IO | [DataTransferFiles](../../entry/src/main/ets/backend/DataTransferFiles.ts)；每次复制独占描述符并 await 完成/释放 | [data-transfer-files](../../tools/tests/data-transfer-files.test.mjs) |
| 设置中的数据库检查和标签清理 | [CollectionMaintenanceSession](../../entry/src/main/ets/model/settings/CollectionMaintenanceSession.ts)；操作独立完成，面板挂载时订阅快照 | [settings-maintenance](../../tools/tests/settings-maintenance.test.mjs) |
| 牌组选项草稿、加载和提交 | DeckOptionsFeature / [DeckOptionsSession](../../entry/src/main/ets/model/home/DeckOptionsSession.ts)；表单随弹层销毁，已接受提交继续 | [deck-options-session](../../tools/tests/deck-options-session.test.mjs)、[deck-config-save](../../tools/tests/deck-config-save.test.mjs) |
| FSRS 参数草稿、批量结果与模拟 | DeckOptionsSession 拥有计算占用与跨实例队列，FsrsOptions 映射 Core 输入，FsrsService 只转发；复用选项保存，不另写算法 | [直接行为](../../tools/tests/deck-options-fsrs.test.mjs)、[协议](../../tools/tests/deck-options-fsrs-protocol.test.mjs)、[真实 Core](../../native/rsharmony/tests/fsrs.rs)；见 [FSRS 领域说明](browser-stats.md#fsrs-参数优化与学习负担模拟) |
| 文件选择、整库确认及导入导出进度 | [DataTransferSession](../../entry/src/main/ets/model/home/DataTransferSession.ts)；首页与设置页复用，读取结果禁止离页启动写入 | [home-transfer-session](../../tools/tests/home-transfer-session.test.mjs) |
| 云端目录、选择和下载引导 | [CloudDeckFeature](../../entry/src/main/ets/components/home/CloudDeckFeature.ets)；配额与清理先于释放占用，销毁后禁止 UI 回写 | [cloud-deck-feature](../../tools/tests/cloud-deck-feature.test.mjs) |
| 浏览类型映射草稿和读取代次 | [BrowserNotetypeSession](../../entry/src/main/ets/model/browser/BrowserNotetypeSession.ts)；随功能销毁，输出冻结请求 | [browser-notetype-session](../../tools/tests/browser-notetype-session.test.mjs) |
| 首页同步定时器、待执行导航、刷新收尾 | [HomeSyncController](../../entry/src/main/ets/model/HomeSyncController.ts)；页面销毁使旧回调失效 | [home-sync-controller](../../tools/tests/home-sync-controller.test.mjs) |
| 自动备份延迟与配置读取 | [HomeBackupController](../../entry/src/main/ets/model/HomeBackupController.ts)；已接受备份由 BackupCoordinator 持有至结束 | [home-backup-controller](../../tools/tests/home-backup-controller.test.mjs) |
| 同步租约与集合等待 | [SyncActivity](../../entry/src/main/ets/model/SyncSettings.ts)；持有者释放，取消请求不等于 IO 已结束 | [sync-settings](../../tools/tests/sync-settings.test.mjs) |
| 单次同步任务、冲突与媒体终态 | [SyncSession](../../entry/src/main/ets/model/SyncSession.ts) 持有 RPC、轮询、取消和租约收尾；AnkiSyncSession 适配平台效果，同步面板只展示快照 | [sync-disposal](../../tools/tests/sync-disposal.test.mjs)、[sync-media-ownership](../../tools/tests/sync-media-ownership.test.mjs)；支架直接构造真实会话 |
| 新增笔记初始化、连续提交与固定字段 | [NoteCreationSession](../../entry/src/main/ets/model/NoteCreationSession.ts) 持有读取代次、冻结提交及成功后的下一张内容；AnkiNoteCreation 拥有标准类型恢复、Core 字段索引与永久媒体导入；页面拥有表单与未编辑基线，固定配置只写类型现有 sticky | [note-creation-session](../../tools/tests/note-creation-session.test.mjs)、[note-continuation](../../tools/tests/note-continuation.test.mjs)；[连续制卡边界](browser-stats.md#手工连续制卡) |
| 手动新增重复警告与字段查重 | [NoteCreationSession](../../entry/src/main/ets/model/NoteCreationSession.ts) 冻结一次确认；[NoteDuplicateSession](../../entry/src/main/ets/model/NoteDuplicateSession.ts) 拥有扫描代次、进度、取消及分组，AnkiNoteDuplicates 适配 Core 搜索和本地批次 RPC；严格添加契约保持不变 | [note-duplicates](../../tools/tests/note-duplicates.test.mjs)、[真实 Core](../../native/rsharmony/tests/note_duplicates.rs)；[行为边界](browser-stats.md#重复笔记与字段查重2026-10-02) |
| 统计查询、偏好写入与桌面快照 | [StatsSession](../../entry/src/main/ets/model/StatsSession.ts) 拒绝旧读取；[StatsWidgetPublisher](../../entry/src/main/ets/backend/StatsWidgetPublisher.ets) 统一首页、统计页与 FSRS 的聚合/发布队列，接受的推送完整结束 | [stats-session](../../tools/tests/stats-session.test.mjs)、[stats-entry-runtime](../../tools/tests/stats-entry-runtime.test.mjs) |
| 关于分组外链和弹窗 | [AboutSettings](../../entry/src/main/ets/components/settings/AboutSettings.ets) 拥有反馈/赞赏弹窗与复制操作，好评复用现有好评引导；设置壳只持有导航 | [settings-about-runtime](../../tools/tests/settings-about-runtime.test.mjs) |
| 应用内 Agent 历史读取/恢复代次 | [AgentHistoryCoordinator](../../entry/src/main/ets/model/agent/AgentHistoryCoordinator.ts) 协调列表、checkpoint、冻结的历史保存和删除；不拥有卡片写入令牌或重新执行动作 | [agent-history-coordinator](../../tools/tests/agent-history-coordinator.test.mjs)、[platform-warning-boundaries](../../tools/tests/platform-warning-boundaries.test.mjs) |
| 应用内 Agent 思考续接与旧检查点兼容 | [ProviderProtocol](../../entry/src/main/ets/model/agent/ProviderProtocol.ts) 校验原始输出格式；[AgentSessionState](../../entry/src/main/ets/model/agent/AgentSessionState.ts) 完整保存协议及转换旧记录；Session/Runner 拥有实际续接与确认结果 | [协议与保存](../../tools/tests/ai-agent-reasoning-replay.test.mjs)、[真实续接链路](../../tools/tests/ai-agent-v2-runtime.test.mjs)；[领域入口](agent.md#思考协议续接) |
| 持续内容的滚动跟随 | [ScrollTailFollower](../../entry/src/main/ets/model/ScrollTailFollower.ts) 拥有独立跟随状态与滚动任务；JIDE 整页和思考区提供可见性、原生手势与滚动，布局各自负责；展开后单次滚动仍由 ExpansionReveal 负责 | [公共控制器](../../tools/tests/ui-shell-scroll-follow.test.mjs)、[两层接线](../../tools/tests/ai-agent-process-ui.test.mjs)；[行为与设备范围](agent.md#agent-过程展示) |
| 学习卡片/队列代次与接受后的操作 | [StudySessionController](../../entry/src/main/ets/model/StudySessionController.ts)；过期读取不得覆盖新会话 | [study-session-controller](../../tools/tests/study-session-controller.test.mjs) |
| 同卡翻面的 Web 文档与脚本执行 | [CardWebSession](../../entry/src/main/ets/model/CardWebSession.ts) 拥有文档、卡面版本和更新队列；[CardWebView](../../entry/src/main/ets/utils/CardWebView.ets) 适配 ArkWeb，学习/预览共同使用；新卡或编辑重新加载时隔离旧全局状态 | [card-web-session](../../tools/tests/card-web-session.test.mjs)、[真实浏览器翻面](../../tools/test-card-flip-browser.mjs)；设备范围见 [学习与媒体](study-media.md#卡片模板脚本与样式) |
| 浏览批量快照与操作占用 | [BrowserOperationController](../../entry/src/main/ets/model/BrowserOperationController.ts)；离页禁止 UI 回写但不取消已接受写入 | [browser-operation-model](../../tools/tests/browser-operation-model.test.mjs) |
| 浏览暂停、今日跳过的整组选中状态切换 | [BrowserCardState](../../entry/src/main/ets/model/BrowserCardState.ts) 读取全部最新 queue，决定解除或统一设置；BrowserSelection 展开笔记兄弟卡，服务适配仍归页面，Core 独占恢复队列与调度 | [状态切换](../../tools/tests/browser-card-state.test.mjs)、[真实 Core 恢复](../../native/rsharmony/tests/scheduler_restore.rs)；[浏览边界](browser-stats.md) |
| 笔记编辑读取、草稿快照与写入代次 | [NoteEditorSession](../../entry/src/main/ets/model/NoteEditorSession.ts)；EditNotePage 持有读取/写入会话，AnkiNoteUpdate 适配媒体和更新；来源只传 ID，关闭/离页不撤销已接受写入 | [note-editor-session](../../tools/tests/note-editor-session.test.mjs) |
| 图片遮罩图形、原始片段与撤销历史 | [图片遮罩模型](../../entry/src/main/ets/model/图片遮罩模型.ts) 持有无损序列化及独立快照；图形编辑器只回传草稿，已有笔记复用 NoteEditorSession，学习/预览共用 ImageOcclusionRendering | [编辑行为](../../tools/tests/图片遮罩编辑器.test.mjs)、[渲染](../../tools/tests/image-occlusion-rendering.test.mjs)、[真实 Core](../../native/rsharmony/tests/image_occlusion_editing.rs) |
| 笔记媒体预览与管理弹层 | NoteFieldCard 组合预览与固定新增入口；NoteMediaParts 负责无损识别和位置替换，NoteMediaSession 拥有弹层副本，NoteMediaDialog 拥有忙碌/退出；完成后宿主重新分配附件 ID 并保留其他字段 | [note-media-management](../../tools/tests/note-media-management.test.mjs)；[媒体管理边界](browser-stats.md#编辑媒体预览与独立管理2026-10-01) |
| 笔记音频附件、试听与录音 | 表单拥有 NoteFieldAudio[] 和 NoteAudioPreview；NoteAudioField 拥有局部录音交互，NoteAudioRecorder 拥有 recorder/fd；NoteAudioImport 负责缓存与永久导入，保存仍由既有会话持有写入保护 | [note-audio](../../tools/tests/note-audio.test.mjs)；[行为与设备范围](browser-stats.md#笔记音频编辑2026-10-01) |
| 学习页普通计时与自动推进 | [StudyTimerController](../../entry/src/main/ets/model/StudyTimerController.ts)；页面提供当前卡片、音频和阻塞事实，控制器不拥有评分或后端写入 | [study-timer-controller](../../tools/tests/study-timer-controller.test.mjs) |
| 首页创建牌组与牌组定制表单 | [CreateDeckFeature](../../entry/src/main/ets/components/home/CreateDeckFeature.ets)、[DeckCustomizationFeature](../../entry/src/main/ets/components/home/DeckCustomizationFeature.ets)；页面只装配弹层、刷新和导航 | [home-deck-features](../../tools/tests/home-deck-features.test.mjs) |
| 应用内 Agent 会话、检索范围与辅助确认账本 | [AgentSessionController](../../entry/src/main/ets/backend/agent/AgentSessionController.ets) 拥有会话状态和 ActionExecutor；Scope 拥有稳定 ID | [ai-agent-v2-runtime](../../tools/tests/ai-agent-v2-runtime.test.mjs) |
| 应用内 Agent 文件资料、分页与 OCR | [AgentDocumentStore](../../entry/src/main/ets/backend/agent/AgentDocumentStore.ets) 拥有原文件/页缓存及原生资源；[AgentDocuments](../../entry/src/main/ets/model/agent/AgentDocuments.ts) 拥有提交范围、读取授权及来源校验 | [ai-agent-documents](../../tools/tests/ai-agent-documents.test.mjs)、[ai-agent-v2-runtime](../../tools/tests/ai-agent-v2-runtime.test.mjs)；[领域入口](agent.md#文件资料与按页制卡) |
| 卡库 ChangeDraft 提交 | [AgentDraftExecutor](../../entry/src/main/ets/backend/agent/AgentDraftExecutor.ets)；独立于辅助动作确认协议，调用方保持批次占用 | [agent-page-models](../../tools/tests/agent-page-models.test.mjs)、[草稿媒体回归](../../tools/tests/ai-agent-draft-media-runtime.test.mjs) |
| 应用内 Agent 多牌组删除范围 | [AgentDeckDeletion](../../entry/src/main/ets/model/agent/AgentDeckDeletion.ts) 合并父子选择并保存逐操作影响；[AgentDeckDeletionImpact](../../entry/src/main/ets/backend/agent/AgentDeckDeletionImpact.ets) 为提案和确认前校验提供相同只读计算 | [真实提案与确认回归](../../tools/tests/ai-agent-deck-deletion-runtime.test.mjs)；[领域入口](agent.md#多牌组删除) |

可执行边界见 [architecture-boundaries.test.mjs](../../tools/tests/architecture-boundaries.test.mjs)：字面量模块依赖不得有环或无法解析的相对引用；下层不反向依赖页面/组件；`model/**/*.ts`、`proto/**/*.ts` 只依赖这两层的 `.ts`；Runner/Registry/工具不得传递依赖确认执行器。它不是完整语言解析器或运行时权限证明，不能替代真实模块行为测试与 HAP 编译。

## `native`

| 路径 | 唯一责任 | 关键边界 |
| --- | --- | --- |
| `native/` | Rust/C/C++ 核心、FFI 和上游适配 | 保留工具链、锁定协议、错误语义和生命周期 |
| [native/agent-sandbox](../../native/agent-sandbox/README.md) | 本地纯计算；Rust 拥有唯一任务槽位、Store、预算和取消，NAPI 异步交接，C 适配 QuickJS | 不持有卡库/工具/确认能力；正式构建校验锁定引擎，host/probe/ohosTest 分层验证 |
| `third_party/` | 锁定的上游源码副本 | 只按 `UPSTREAM.lock` 更新，不把本地临时修复当源码事实 |

## `tools`

| 路径 | 唯一责任 | 关键边界 |
| --- | --- | --- |
| `tools/tests/` | 可重复的 Node 行为和结构契约测试 | 新增业务规则优先测试真实模块，不锁死无意义源码形状 |
| `tools/test.mjs`、`test-suites.mjs` | 测试发现和领域筛选 | 完整测试不依赖手写测试文件总表 |
| `tools/verify.mjs` | 分阶段仓库、原生和 HAP 门禁 | 不把设备验收伪装成构建通过 |
| [test-core-interop.mjs](../../tools/test-core-interop.mjs) / [Core 回归](../../native/rsharmony/tests/core_interop.rs) | 隔离集合、包往返和报告；恢复运行真实文件/恢复模块 | 不读取用户集合/账号、不操作设备；[范围与交接](core-interop.md) |
| `tools/change-impact.mjs` | 变更路径收集与最低验证计划 | 只读、不代替依赖分析，不宣称验证已执行 |
| `.github/workflows/` | CI 调用稳定验证入口 | 不复制只在 CI 可运行的隐藏逻辑 |

## `docs` 与规则

| 路径 | 唯一责任 | 关键边界 |
| --- | --- | --- |
| `AGENTS.md`、`.agents/` | 编程 Agent 的当前约束 | 不写产品运行时 Agent 行为，不引用历史计划作为命令源 |
| `docs/development/` | 当前领域入口、事实来源和验证路径 | 不复制未经验证的动态统计 |
| `docs/decisions/` | 当前长期决策及其影响 | 不替代源码、测试或临时排查记录 |
| `docs/superpowers/`、发布记录 | 历史背景和归档材料 | 不发出当前执行指令 |

首页首行布局归 `HomeSummaryHeader` / `HomeHeaderLayout`，统计数据和菜单状态归首页；更多/新建组件仅提供 ActionMenuList 正文，原生尖角锚点归首行。搜索筛选归纯模型 `HomeDeckSearch`，输入和实际候选观察归 `HomeDeckSearchDialog`，选择复用首页。握姿复用 StudyGripSession 和可指定能力键的 StudyGripSensor，不修改学习偏好或导航契约；见[首页](home.md)。
