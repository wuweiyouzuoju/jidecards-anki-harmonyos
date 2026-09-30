# 模块责任与边界

[返回任务索引](../../PROJECT_CONTEXT.md)

这张表是编程 Agent 判断“应该从哪里开始、代码应该放哪里、改完验证什么”的当前入口。更细的行为规则以源码和对应领域文档为准。

## `entry`

| 路径 | 唯一责任 | 不应承担 |
| --- | --- | --- |
| `entry/src/main/ets/pages/` | 页面装配、展示和用户输入 | 跨页面业务状态、协议编码、持久化细节 |
| `entry/src/main/ets/components/` | 可复用 UI 和局部交互 | 直接拥有跨页面数据或绕过编排层写入 |
| `entry/src/main/ets/model/` | `.ts` 为可直接测试的模型/编排/协议使用方；既有 `.ets` 为主题与存储等平台适配 | 纯模型引入 Kit/UI、未声明所有者的全局状态 |
| `entry/src/main/ets/backend/` | 网络、平台和外部服务边界 | 把平台失败伪装成成功、依赖页面实例 |
| `entry/src/main/ets/stores/` | 明确声明的持久化状态和读取协调 | 成为所有模块的无边界共享状态 |
| `entry/src/main/ets/proto/`、`entry/src/main/cpp/types/`、`native/napi_bridge/` | 跨 ArkTS/Native 的协议、声明和桥接 | 在页面或工具脚本中复制协议定义 |

### 状态所有者

学习手势由 `model/StudyGestures.ts` 唯一识别和映射；`model/实验性功能存储.ets` 拥有本机开关与四象限引导已读状态；学习页拥有当前卡面代次和教学显隐，提交评分仍归 `StudySessionController`。入口与验证见 [学习手势与四象限引导](study-media.md#学习手势与四象限引导)。

下面按实际状态定位，不要求为每个函数另建抽象。页面拥有导航、跨功能占用和页面数据快照；功能组件拥有局部可观察状态，纯会话通过回调发布结果。

| 状态或资源 | 所有者 / 生命周期 | 直接验证入口 |
| --- | --- | --- |
| 首页牌组展开记忆 | [HomeDeckExpansion](../../entry/src/main/ets/model/HomeDeckExpansion.ts) 协调 ID；[HomeDeckExpansionStore](../../entry/src/main/ets/utils/HomeDeckExpansionStore.ets) 唯一偏好入口，串行落盘独立于页面生命周期 | [home-deck-expansion](../../tools/tests/home-deck-expansion.test.mjs)；手机透明详情的底层显隐见 [首页](home.md#牌组展开记忆与手机详情) |
| 首页目的地与详情装配 | [HomeDestinations](../../entry/src/main/ets/pages/navigation/HomeDestinations.ets)、[HomeDeckDetails](../../entry/src/main/ets/components/home/HomeDeckDetails.ets)；页面栈、选择及动作仍由首页持有 | [home-composition](../../tools/tests/home-composition.test.mjs) |
| 首页导航转场 | [HomeNavigationTransition](../../entry/src/main/ets/utils/HomeNavigationTransition.ets)；持有代次、淡入顺序与背景冻结回调 | [iridescent-rendering](../../tools/tests/iridescent-rendering.test.mjs) |
| 首页删除交互与媒体二次确认 | [HomeDeckDeletion](../../entry/src/main/ets/components/home/HomeDeckDeletion.ets)；Core 提交后交回首页协调选择、刷新与同步，媒体清理由 DeckMediaCleanup 校验 | [home-deletion-runtime](../../tools/tests/home-deletion-runtime.test.mjs)、[deck-media-cleanup](../../tools/tests/deck-media-cleanup.test.mjs) |
| 弹窗外壳与返回层级 | `DialogFrame` / `DialogBackdrop` 只拥有展示几何和主题；宿主拥有显隐，功能组件拥有草稿与忙碌状态，`backRequest` 沿已挂载的最上层传递并消费 | [ui-dialog-layout](../../tools/tests/ui-dialog-layout.test.mjs)，ArkUI 的观察更新、键盘和布局另需设备验收 |
| 媒体检查、报告续读与清理 | [MediaMaintenanceSession](../../entry/src/main/ets/model/settings/MediaMaintenanceSession.ts)；原生快照随 backend/面板释放，已接受写入独立完成 | [media-maintenance-session](../../tools/tests/media-maintenance-session.test.mjs)、Rust media_snapshot 测试 |
| 浏览查询结果、游标与分页占用 | [BrowserSearchSession](../../entry/src/main/ets/model/BrowserSearchSession.ts)；新查询使旧分页失效 | [browser-search-pagination](../../tools/tests/browser-search-pagination.test.mjs) |
| 公告节流与延迟任务 | [HomeAnnouncementController](../../entry/src/main/ets/model/HomeAnnouncementController.ts)；暂停/销毁失效旧 timer | [home-announcement-scheduling](../../tools/tests/home-announcement-scheduling.test.mjs) |
| 迁移文件描述符与目录树 IO | [DataTransferFiles](../../entry/src/main/ets/backend/DataTransferFiles.ts)；每次复制独占描述符并 await 完成/释放 | [data-transfer-files](../../tools/tests/data-transfer-files.test.mjs) |
| 设置中的数据库检查和标签清理 | [CollectionMaintenanceSession](../../entry/src/main/ets/model/settings/CollectionMaintenanceSession.ts)；操作独立完成，面板挂载时订阅快照 | [settings-maintenance](../../tools/tests/settings-maintenance.test.mjs) |
| 牌组选项草稿、加载和提交 | DeckOptionsFeature / [DeckOptionsSession](../../entry/src/main/ets/model/home/DeckOptionsSession.ts)；表单随弹层销毁，已接受提交继续 | [deck-options-session](../../tools/tests/deck-options-session.test.mjs)、[deck-config-save](../../tools/tests/deck-config-save.test.mjs) |
| 文件选择、整库确认及导入导出进度 | [DataTransferSession](../../entry/src/main/ets/model/home/DataTransferSession.ts)；首页与设置页复用，读取结果禁止离页启动写入 | [home-transfer-session](../../tools/tests/home-transfer-session.test.mjs) |
| 云端目录、选择和下载引导 | [CloudDeckFeature](../../entry/src/main/ets/components/home/CloudDeckFeature.ets)；配额与清理先于释放占用，销毁后禁止 UI 回写 | [cloud-deck-feature](../../tools/tests/cloud-deck-feature.test.mjs) |
| 浏览类型映射草稿和读取代次 | [BrowserNotetypeSession](../../entry/src/main/ets/model/browser/BrowserNotetypeSession.ts)；随功能销毁，输出冻结请求 | [browser-notetype-session](../../tools/tests/browser-notetype-session.test.mjs) |
| 首页同步定时器、待执行导航、刷新收尾 | [HomeSyncController](../../entry/src/main/ets/model/HomeSyncController.ts)；页面销毁使旧回调失效 | [home-sync-controller](../../tools/tests/home-sync-controller.test.mjs) |
| 自动备份延迟与配置读取 | [HomeBackupController](../../entry/src/main/ets/model/HomeBackupController.ts)；已接受备份由 BackupCoordinator 持有至结束 | [home-backup-controller](../../tools/tests/home-backup-controller.test.mjs) |
| 同步租约与集合等待 | [SyncActivity](../../entry/src/main/ets/model/SyncSettings.ts)；持有者释放，取消请求不等于 IO 已结束 | [sync-settings](../../tools/tests/sync-settings.test.mjs) |
| 单次同步任务、冲突与媒体终态 | [SyncSession](../../entry/src/main/ets/model/SyncSession.ts) 持有 RPC、轮询、取消和租约收尾；AnkiSyncSession 适配平台效果，同步面板只展示快照 | [sync-disposal](../../tools/tests/sync-disposal.test.mjs)、[sync-media-ownership](../../tools/tests/sync-media-ownership.test.mjs)；支架直接构造真实会话 |
| 新增笔记初始化与一次提交 | [NoteCreationSession](../../entry/src/main/ets/model/NoteCreationSession.ts) 持有读取代次及冻结提交；AnkiNoteCreation 拥有标准类型恢复、Core 字段索引与永久媒体导入，页面拥有表单输入 | [note-creation-session](../../tools/tests/note-creation-session.test.mjs)、[note-image-media](../../tools/tests/note-image-media.test.mjs) |
| 统计查询、偏好写入与桌面快照 | [StatsSession](../../entry/src/main/ets/model/StatsSession.ts) 拒绝旧读取；[StatsWidgetPublisher](../../entry/src/main/ets/backend/StatsWidgetPublisher.ets) 统一首页、统计页与 FSRS 的聚合/发布队列，接受的推送完整结束 | [stats-session](../../tools/tests/stats-session.test.mjs)、[stats-entry-runtime](../../tools/tests/stats-entry-runtime.test.mjs) |
| 关于分组外链和弹窗 | [AboutSettings](../../entry/src/main/ets/components/settings/AboutSettings.ets) 拥有反馈/赞赏弹窗与复制操作，好评复用现有好评引导；设置壳只持有导航 | [settings-about-runtime](../../tools/tests/settings-about-runtime.test.mjs) |
| 应用内 Agent 历史读取/恢复代次 | [AgentHistoryCoordinator](../../entry/src/main/ets/model/agent/AgentHistoryCoordinator.ts) 协调列表、checkpoint、冻结的历史保存和删除；不拥有卡片写入令牌或重新执行动作 | [agent-history-coordinator](../../tools/tests/agent-history-coordinator.test.mjs)、[platform-warning-boundaries](../../tools/tests/platform-warning-boundaries.test.mjs) |
| 学习卡片/队列代次与接受后的操作 | [StudySessionController](../../entry/src/main/ets/model/StudySessionController.ts)；过期读取不得覆盖新会话 | [study-session-controller](../../tools/tests/study-session-controller.test.mjs) |
| 同卡翻面的 Web 文档与脚本执行 | [CardWebSession](../../entry/src/main/ets/model/CardWebSession.ts) 拥有文档、卡面版本和更新队列；[CardWebView](../../entry/src/main/ets/utils/CardWebView.ets) 适配 ArkWeb，学习/预览共同使用；新卡或编辑重新加载时隔离旧全局状态 | [card-web-session](../../tools/tests/card-web-session.test.mjs)、[真实浏览器翻面](../../tools/test-card-flip-browser.mjs)；设备范围见 [学习与媒体](study-media.md#卡片模板脚本与样式) |
| 浏览批量快照与操作占用 | [BrowserOperationController](../../entry/src/main/ets/model/BrowserOperationController.ts)；离页禁止 UI 回写但不取消已接受写入 | [browser-operation-model](../../tools/tests/browser-operation-model.test.mjs) |
| 笔记编辑读取、草稿快照与写入代次 | [NoteEditorSession](../../entry/src/main/ets/model/NoteEditorSession.ts)；EditNotePage 持有读取/写入会话，AnkiNoteUpdate 适配媒体和更新；来源只传 ID，关闭/离页不撤销已接受写入 | [note-editor-session](../../tools/tests/note-editor-session.test.mjs) |
| 学习页普通计时与自动推进 | [StudyTimerController](../../entry/src/main/ets/model/StudyTimerController.ts)；页面提供当前卡片、音频和阻塞事实，控制器不拥有评分或后端写入 | [study-timer-controller](../../tools/tests/study-timer-controller.test.mjs) |
| 首页创建牌组与牌组定制表单 | [CreateDeckFeature](../../entry/src/main/ets/components/home/CreateDeckFeature.ets)、[DeckCustomizationFeature](../../entry/src/main/ets/components/home/DeckCustomizationFeature.ets)；页面只装配弹层、刷新和导航 | [home-deck-features](../../tools/tests/home-deck-features.test.mjs) |
| 应用内 Agent 会话、检索范围与辅助确认账本 | [AgentSessionController](../../entry/src/main/ets/backend/agent/AgentSessionController.ets) 拥有会话状态和 ActionExecutor；Scope 拥有稳定 ID | [ai-agent-v2-runtime](../../tools/tests/ai-agent-v2-runtime.test.mjs) |
| 卡库 ChangeDraft 提交 | [AgentDraftExecutor](../../entry/src/main/ets/backend/agent/AgentDraftExecutor.ets)；独立于辅助动作确认协议，调用方保持批次占用 | [agent-page-models](../../tools/tests/agent-page-models.test.mjs)、[草稿媒体回归](../../tools/tests/ai-agent-draft-media-runtime.test.mjs) |

可执行边界见 [architecture-boundaries.test.mjs](../../tools/tests/architecture-boundaries.test.mjs)：字面量模块依赖不得有环或无法解析的相对引用；下层不反向依赖页面/组件；`model/**/*.ts`、`proto/**/*.ts` 只依赖这两层的 `.ts`；Runner/Registry/工具不得传递依赖确认执行器。它不是完整语言解析器或运行时权限证明，不能替代真实模块行为测试与 HAP 编译。

## `native`

| 路径 | 唯一责任 | 关键边界 |
| --- | --- | --- |
| `native/` | Rust/C/C++ 核心、FFI 和上游适配 | 保留工具链、锁定协议、错误语义和生命周期 |
| `third_party/` | 锁定的上游源码副本 | 只按 `UPSTREAM.lock` 更新，不把本地临时修复当源码事实 |

## `tools`

| 路径 | 唯一责任 | 关键边界 |
| --- | --- | --- |
| `tools/tests/` | 可重复的 Node 行为和结构契约测试 | 新增业务规则优先测试真实模块，不锁死无意义源码形状 |
| `tools/test.mjs`、`test-suites.mjs` | 测试发现和领域筛选 | 完整测试不依赖手写测试文件总表 |
| `tools/verify.mjs` | 分阶段仓库、原生和 HAP 门禁 | 不把设备验收伪装成构建通过 |
| `tools/change-impact.mjs` | 变更路径收集与最低验证计划 | 只读、不代替依赖分析，不宣称验证已执行 |
| `.github/workflows/` | CI 调用稳定验证入口 | 不复制只在 CI 可运行的隐藏逻辑 |

## `docs` 与规则

| 路径 | 唯一责任 | 关键边界 |
| --- | --- | --- |
| `AGENTS.md`、`.agents/` | 编程 Agent 的当前约束 | 不写产品运行时 Agent 行为，不引用历史计划作为命令源 |
| `docs/development/` | 当前领域入口、事实来源和验证路径 | 不复制未经验证的动态统计 |
| `docs/decisions/` | 当前长期决策及其影响 | 不替代源码、测试或临时排查记录 |
| `docs/superpowers/`、发布记录 | 历史背景和归档材料 | 不发出当前执行指令 |
