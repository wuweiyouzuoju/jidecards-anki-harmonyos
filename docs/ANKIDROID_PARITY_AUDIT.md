# AnkiDroid 对照核查

核查日期：2026-09-23

参考源码：`D:\Projects\AnkiDroid`（AnkiDroid `main` 源码快照）

被核查项目：jidecards 当前工作树

## 核查口径

- **已实现**：jidecards 有真实入口和调用链，且有对应源码或行为测试证据。
- **部分实现**：核心语义已有，但缺少 AnkiDroid 的一部分入口、平台能力或完整高级选项。
- **仅底层/未查证**：找到 Core/RPC/协议或历史说明，尚未确认用户入口和完整闭环。
- **设备待验**：本地测试通过，但仍需要 HarmonyOS 真机确认系统组件表现。

本次运行 `npm test -- all`：136 个测试文件、1,314 项断言全部通过。测试证明的是隔离行为和源码契约，不能替代真机交互验收。

## 功能矩阵

| 领域 | AnkiDroid 参考证据 | jidecards 实现证据 | 当前结论 |
|---|---|---|---|
| 牌组树、创建、重命名、删除、排序 | `AnkiDroid/src/main/java/com/ichi2/anki/deckpicker/DeckPickerViewModel.kt`、`DisplayDeckNode.kt` | `pages/首页.ets`、`backend/牌组服务.ts`、`model/牌组层级.ets`；`deck-hierarchy-contract`、`create-deck-contract` | **已实现**；删除后的选择清理和媒体处理有额外闭环 |
| 牌组选项与自定义学习 | `StudyOptionsViewModel.kt`、`filtered/FilteredDeckOptions*` | `牌组选项面板.ets`、`高级牌组选项面板.ets`、`自定义学习对话框.ets`、`DeckMessages.ts`；`deck-options-contract`、`final-deck-options-fix` | **已实现核心流程**；高级配置项仍需按字段逐项对照 |
| 复习调度、四档评分、下一张卡 | `ui/windows/reviewer/ReviewerViewModel.kt`、`AnswerButtons.kt`、`StudyScreenRepository.kt` | `model/StudySessionController.ts`、`backend/StudySessionBackend.ts`、`pages/学习页.ets`；`study-flow-contract`、`study-session-controller`、`study-lifecycle` | **已实现**；调度结果由 Anki Core 决定 |
| 撤销、埋藏、暂停、恢复、完成页 | `reviewer/ReviewerViewModel.kt`、`services/*` | `backend/集合服务.ts`、`学习页.ets`、`undo-flow-contract.test.mjs`、`bury-congrats-contract.test.mjs` | **已实现**；撤销通过 Core 服务索引完成 |
| 自动前进、计时、等待音频、重播和 TTS | `ui/windows/reviewer/autoadvance/*`、`AnswerTimer.kt`、`reviewer/AutomaticAnswer.kt` | `StudyTiming.ts`、`CardAudioSession`、`TTS播放器.ets`；`study-autoplay-backend`、`study-timing`、`card-audio-session`、`native-audio-completion` | **已实现**；真机音频队列和后台行为仍待设备验收 |
| 手势、硬件键、自定义复习动作 | `reviewer/GestureMapper.kt`、`BindingMap.kt`、`preferences/ControlsSettingsFragment.kt` | `ReviewControlsSettings.ets`、`model/PreviewInteraction.ts`、Tap Zones | **部分实现**；已有固定点击区域和部分键盘交互，尚不是 AnkiDroid 的完整可配置映射 |
| 白板/手写 | `ui/windows/reviewer/whiteboard/*` | `components/学习手写白板层.ets`、`study-menu-actions`、`ui-shell-contract` | **已实现核心入口**；笔刷和真机触控体验待设备验收 |
| 卡片 HTML/CSS/模板预览 | `previewer/*`、`cardviewer/*`、`web/*` | `model/学习卡片HTML构建器.ts`、`backend/卡片渲染服务.ts`、`preview-runtime`、`card-template-style` | **已实现**；不承诺兼容所有 Android 插件或 WebView 专属行为 |
| MathJax、化学公式、填空和输入答案 | `noteeditor/MathJaxFormat.kt`、`previewer/TypeAnswer.kt` | `math-rendering`、`cloze-parser`、`type-answer-comparer`、内置 MathJax 资源 | **已实现常用类型**；复杂第三方脚本牌组仍需单独回归 |
| 图片遮罩 | AnkiDroid 源码包含对应笔记/模板能力 | `图片遮罩服务.ts`、`图片遮罩编辑器.ets`；`图片遮罩服务.test.mjs`、`图片遮罩编辑器.test.mjs` | **已实现**；已有 Core RPC、绘制、重排和坐标边界测试 |
| 添加笔记、字段、标签、媒体 | `noteeditor/*`、`multimedia/*`、`instantnoteeditor/*` | `pages/添加笔记页.ets`、`backend/AnkiNoteEditor.ts`、`backend/笔记服务.ts`；`add-note-contract`、`note-image-media`、`note-save-lifecycle` | **已实现核心流程**；字段媒体和失败重试已有测试 |
| 笔记类型、模板和卡片类型管理 | `notetype/*`、`ManageNotetypes.kt` | `backend/笔记类型服务.ts`、`proto/messages/NotetypeMessages.ts`、实验版设置和 Agent 笔记类型工具 | **部分实现**；已有读取、编辑和部分入口，需继续核对完整增删改、模板 CSS 和卡片模板顺序 |
| 浏览搜索、筛选、排序、列和卡片/笔记模式 | `browser/*`、`browser/search/*` | `pages/浏览页.ets`、`BrowserSearchSession.ts`、`BrowserSidebar.ts`、`AnkiBrowserSearch.ets`；`browser-flow-contract`、`browser-presentation` | **已实现核心流程**；复杂搜索语法要以 Core 实际结果继续抽样 |
| 浏览批量操作、查找替换、重新定位 | `FindAndReplaceDialogFragment.kt`、`RepositionCardFragment.kt`、`CardBrowserViewModel.kt` | `BrowserOperationController.ts`、批量操作栏、`browser-batch-runtime`、`page-operation-boundaries` | **已实现**；写入互斥、代次和迟到响应保护已覆盖 |
| 统计、日历、预测、FSRS 统计和桌面卡片 | `pages/Statistics.kt`、Anki Core stats 接口 | `pages/统计页.ets`、`StatsOverview.ts`、`StatsMessages.ts`、`widget/pages/统计卡片.ets`；`stats-entry-runtime`、`stats-calendar-runtime`、`stats-range-selection` | **已实现主要统计**；AnkiDroid 的 PDF 导出和全部统计显示仍未确认等价 |
| AnkiWeb 同步、媒体同步、全量冲突 | `sync/*`、`services/*` | `backend/同步服务.ts`、`components/同步面板.ets`、`AutoSyncScheduler.ts`；`sync-flow`、`sync-automatic`、`sync-settings` | **已实现核心流程**；同步端点、凭证和冲突需要真机/真实账号回归 |
| 自动同步 | AnkiDroid 的同步入口和后台策略 | `AutoSyncScheduler.ts`、`HomeSyncController.ts`、`home-sync-controller`、`sync-automatic` | **已实现**；学习/编辑/导入占用期间的安全门禁已覆盖 |
| APKG/牌组导入导出 | `export/ExportDialogFragment.kt`、AnkiDroid 导入处理 | `backend/数据迁移服务.ts`、`首页.ets`；`import-flow-contract`、`data-transfer-contract`、`external-deck-open` | **已实现核心包格式**；CSV、部分 Android 文件来源和全部导出选项尚未宣称兼容 |
| COLPKG 整库备份恢复 | AnkiDroid 备份设置和恢复流程 | `backend/LocalBackups.ets`、`model/BackupCoordinator.ts`、`备份管理面板.ets`；`backup-parity`、`home-backup-controller` | **已实现**；Core 负责备份策略，应用负责安全时机和恢复入口 |
| 数据库检查、空卡、媒体检查和回收站 | `mediacheck/*`、维护菜单和 Core 检查接口 | `backend/媒体服务.ts`、`components/settings/媒体管理面板.ets`、数据库检查服务；`check-database-contract`、`deck-media-cleanup` | **已实现主要维护流程**；各类异常集合仍需样本验证 |
| 复习提醒和通知 | `reviewreminders/*`、`notifications/*` | `pages/学习提醒页.ets`、`model/学习提醒服务.ets`、提醒编辑面板 | **部分实现**；已有提醒入口，但 Android 通知渠道、后台闹钟语义不能直接等同 |
| 共享牌组下载 | `shareddeck/*`、AnkiWeb shared decks | `云端牌组服务.ets`、云端牌组目录和下载配额；`cloud-deck-catalog`、`cloud-deck-flow-contract` | **部分实现**；已有云端牌组目录/导入闭环，服务来源和 AnkiWeb 共享牌组不是同一实现 |
| 多配置档案 | `preferences/profiles/*`、AnkiDroid profile 切换 | 当前未确认完整数据隔离与账户边界 | **未查证/暂不宣称实现** |
| 完整无障碍、字体和 Android 系统集成 | `preferences_accessibility.xml`、自定义字体和系统设置入口 | 已有卡片字号、主题和基础资源；无独立无障碍审计闭环 | **部分实现** |
| 桌面服务卡片/小组件 | AnkiDroid `widget/*` | `widget/pages/统计卡片.ets`、首页统计快照和 widget 测试 | **部分实现**；已有统计卡片，不等于 AnkiDroid 全部小组件 |
| AI 制卡/改卡、主题兑换、动态背景 | AnkiDroid 无对应标准能力 | jidecards Agent、主题、兑换和动态背景模块 | **jidecards 扩展**；不纳入 AnkiDroid 兼容率 |

## 已确认的高价值兼容基础

目前可以明确视为“已实现并值得继续保持”的兼容基础是：牌组/卡片/笔记的 Core 数据语义、复习评分与调度、模板 HTML/CSS 渲染、媒体引用、APKG/COLPKG、AnkiWeb 同步、浏览批量操作、FSRS 统计、图片遮罩和撤销链路。

## 下一轮应优先核对

1. 笔记类型完整管理：字段、模板、卡片模板顺序、CSS、删除影响范围。
2. 浏览器复杂搜索与保存搜索：用同一批牌组样本与 AnkiDroid 逐项比对结果。
3. 导入导出边界：CSV、媒体、调度信息、重复导入、全量替换和失败恢复。
4. 同步冲突与媒体同步：真实 AnkiWeb 账号、断网、中止、全量上传/下载。
5. 复习高级偏好：学习步骤、剩余计数、按钮间隔、自动播放、屏幕常亮、手势和硬件键。
6. 真机验证：音频/TTS、白板触控、通知提醒、文件打开、桌面卡片和大牌组性能。

每完成一个条目，都应补充对应源码入口、测试命令和真实设备结果；没有完整调用链的 Core RPC 不应标记为“已实现”。
