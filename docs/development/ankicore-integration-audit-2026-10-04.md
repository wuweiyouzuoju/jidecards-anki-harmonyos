# Anki Core → jidecards 接入盘点（2026-10-04）

[返回文档导航](../README.md) · [当前功能状态](../FEATURE_STATUS.md) · [逐 RPC 明细](ankicore-rpc-inventory-2026-10-04.csv)

本次继续核查 `D:\Projects\jidecards` 实际工作树和本机 `third_party/anki`，结果包含 **22 组剩余功能或接入边界、JIDE 专属能力差距、平台侧后续项，以及全部 232 个 RPC 的明细**。上一轮已经补齐的功能不再列为缺失。P1/P2/P3 是本报告的实施顺序判断，不是已复现故障的严重等级。

最值得优先继续的是：**字段高级属性在本机编辑器中生效、JIDE 批量操作的撤销分组、Core 真正改名、音频全局偏好、导入结果定位**。自定义调度脚本与字段结构草稿预览需要独立方案。

后续入口选择见[UI 复杂度与 JIDE 分工](../decisions/2026-10-04-ankicore-ui-routing.md)：较复杂 UI 的配置/操作通过 JIDE 提供，极简或无需新增 UI 的事项复用现有界面。该分类覆盖下文 22 组以及 JIDE/平台后续项，并维护 2026-10-05 实施进度。下文缺口表和 RPC CSV 保留原盘点快照；G02/G08/G09/G10/G11/G13/G16/G22 的最新实现以决策进度和领域文档为准。

## 基线、范围与判断方法

- 应用基线见 [AppScope/app.json5](../../AppScope/app.json5)，检查时为 2.9.10 / 2991；仓库 HEAD 为 `b14b346`，共享工作树有大量未提交修改。因此以下是当前源码状态，不能直接当作商店版本承诺。
- Core 锁定 Anki 26.05 / `e64c6b1`，本机 checkout 一致，见 [UPSTREAM.lock](../../UPSTREAM.lock)。检查包括本地补丁，没有把新版 Core 或桌面 Qt/Python 功能计入现版本能力。
- 全量编号来自 [rpc-index-baseline.json](../../tools/rpc-index-baseline.json)，和 [服务索引](../../entry/src/main/ets/backend/服务索引.ts)、[映射清单](../../tools/rpc-index-methods.json)交叉核对。随后查 Service、模型、实际 UI/JIDE 调用及原生扩展。
- 统计范围是 22 个有可调用方法的 Backend 服务；桌面 FrontendService 的界面通知和非 RPC 消息不计入。字段、平台行为和生产入口另外核查，不能只看方法覆盖率。
- “没有直接接入”不等于“整个功能不存在”：旧 JSON 接口、新的聚合接口、平台实现和本地扩展可以完成同一用户任务。下文明确记录这些替代路径。
- 本次是源码审查及局部行为回归。设备、真实模型、AnkiWeb 在线账号和实际 AnkiDroid/桌面往返未重新验收；不存在把这些未验收项写成已复现故障的结论。

## 全量 RPC 盘点结果

后续修复（2026-10-05）已将媒体路径编码、学习/预览的输入答案比较与填空提取直接接入 Core，并补齐平台 TTS 模板参数。实现与保留平台替代的理由见[Core 渲染语义与平台 TTS](study-media.md#core-渲染语义与平台-tts)；以下 RPC 数量及 CSV 是盘点时快照。

| 层次 | 数量 | 含义 |
| --- | ---: | --- |
| 锁定 Core 的 Backend RPC | 232 | 本次接口全集 |
| 应用方法表已登记 | 164 | 仅说明应用知道编号 |
| 生产 ArkTS/TS 存在方法表成员引用 | 133 | 通常是 Service 内调用；仍须沿调用链核对 |
| 已登记但无上述引用 | 31 | 可能只是预留编号，也可能已有其他路径 |
| 应用方法表未登记 | 68 | 其中大量是旧接口、开发工具、平台专属或已有替代 |

**133 / 232 不是功能覆盖率。** 例如集合重做通过本地原生历史扩展执行；缺失媒体打标通过原生调用 AddNoteTags；浏览批量标签使用一次 UpdateNotes；图片遮罩保存走通用笔记保存；卡片信息的历史来自 CardStats。反过来，AnkiWeb 插件信息虽有 Service 封装，生产中仍无调用者。

[CSV 明细](ankicore-rpc-inventory-2026-10-04.csv)为每个 RPC 保留服务号、方法号、登记状态、方法表引用位置与专项判定。无直接登记/无引用的 99 项另见[接口附录](ankicore-rpc-unwired-2026-10-04.md)，逐项说明补齐价值或替代路径。

## A. 当前仍剩余的 22 组接入事项

| ID / 优先级 | 能力 | 当前实际状态与缺少的环节 | 后续接手入口与验收 |
| --- | --- | --- | --- |
| G01 / P1（兼容） | 自定义调度 JavaScript | 已检测非空脚本、显示脚本并要求确认标准 Core 调度；**脚本仍不执行**。SchedulingContext 在队列解码中跳过，评分仍提交原始 Core 候选状态。提示已补齐，执行兼容仍未完成。 | [SchedulerMessages](../../entry/src/main/ets/proto/messages/SchedulerMessages.ts)、[StudySessionController](../../entry/src/main/ets/model/StudySessionController.ts)、[StudySessionBackend](../../entry/src/main/ets/backend/StudySessionBackend.ts)。需要执行环境、上下文、候选状态校验及异常策略；保留原 oneof 原始透传，测试普通/过滤牌组和带脚本跨端行为。 |
| G02 / P1 | 字段高级属性在本机编辑器生效 | JIDE 已能读取原始类型并保存 `rtl/font/size/description/plainText/collapsed`；但本机 `decodeNotetypeField()` 只读取 `sticky`，NoteFieldCard/NoteFieldEditor 没有这些属性输入，编辑字体使用应用固定字号。因此**保存链已接，新增/编辑显示链未接**。排序字段和 excludeFromSearch 由 Core 使用，sticky 已实现，不算缺失。 | [NotetypeMessages](../../entry/src/main/ets/proto/messages/NotetypeMessages.ts)、[NoteFieldCard](../../entry/src/main/ets/components/common/NoteFieldCard.ets)、[NoteFieldEditor](../../entry/src/main/ets/components/common/NoteFieldEditor.ets)、[AgentNotetypeFields](../../entry/src/main/ets/model/agent/AgentNotetypeFields.ts)。传递属性到新增/编辑/学习内编辑；验证 RTL、字体、纯文本、说明和折叠，同时保留旧媒体/HTML。 |
| G03 / P1–P2 | 一个 JIDE 批量动作对应一次集合撤销 | 首页/浏览器撤销与重做已实现。但 `AddCustomUndoEntry` / `MergeUndoEntries` 未登记；AgentDraftExecutor 对多笔记新增、字段修改、移动和部分删除逐项写入，**一次确认仍可能产生多条 Core 历史**。AddNotes 批量入口同样未接。 | [AgentDraftExecutor](../../entry/src/main/ets/backend/agent/AgentDraftExecutor.ets)、[集合服务](../../entry/src/main/ets/backend/集合服务.ts)、Core collection/notes 协议。优先将适合的同类写入合为一次 RPC，再处理分组；分组并不等于原子事务。测试部分成功、完整/部分撤销和重做，保留逐项失败反馈。 |
| G04 / P2 | Core 真正重命名牌组 | `RenameDeck` 已封装，但没有生产调用者。首页定制明确走本机别名存储，源码注释也说明导出和同步仍使用后端原名。**现有别名功能有效，但未提供同步级改名**；JIDE 也没有真实改名提案。 | [首页](../../entry/src/main/ets/pages/首页.ets)、[HomeDeckCommands](../../entry/src/main/ets/backend/HomeDeckCommands.ets)、[牌组服务](../../entry/src/main/ets/backend/牌组服务.ts)。复用 Core rename、名称冲突/子牌组影响确认与集合撤销；验证导出和跨端同步后的名称。 |
| G05 / P2 | 普通牌组说明的读取和编辑 | Core Deck.Normal 有 description/markdownDescription，应用编解码已有，但没有 GetDeck/UpdateDeck 接入；主页平铺时把 description 固定为空。导入的普通牌组说明没有完整展示和修改流程。 | [DeckMessages](../../entry/src/main/ets/proto/messages/DeckMessages.ts)、[牌组层级](../../entry/src/main/ets/model/牌组层级.ets)、Core decks 协议。只改说明须保留牌组限额、配置、身份及未知数据；Markdown 与 HTML 展示需单独验收。 |
| G06 / P2 | 两项全局音频偏好 | `hide_audio_play_buttons` / `interrupt_audio_when_answering` 未进入 Preferences 解码/编辑白名单，JIDE 也没有工具参数。当前 `[sound:]` 被替换为非交互 ♪ 标记并用工具栏整体重播；CardAudioSession 每次播放先停止旧队列，没有按全局偏好决定翻面中断。**已有自动播放、TTS、整体重播不算缺失**。 | [PreferencesMessages](../../entry/src/main/ets/proto/messages/PreferencesMessages.ts)、[CardAudioSession](../../entry/src/main/ets/model/CardAudioSession.ts)、[卡片 HTML](../../entry/src/main/ets/model/学习卡片HTML构建器.ts)。接入实际值、卡面单项播放按钮及题答队列切换；覆盖自动播放关、手动重播、TTS、换卡、离页及等待音频。 |
| G07 / P2–P3 | Editing 六项全局偏好 | Editing 子消息整体未解码/编辑。`default_search_text` 未用于浏览初始搜索；`paste_images_as_png` / `paste_strips_formatting` 未接粘贴行为；`render_latex` 未成为本机渲染策略。`ignore_accents_in_search` 的已有值由 Core 搜索使用；`adding_defaults_to_current_deck` 涉及 Core DefaultsForAdding，不能直接判定运行失效，但两者都不能在本机查看/修改。 | [PreferencesMessages](../../entry/src/main/ets/proto/messages/PreferencesMessages.ts)、[NoteFieldEditor](../../entry/src/main/ets/components/common/NoteFieldEditor.ets)、[NoteImageImport](../../entry/src/main/ets/backend/NoteImageImport.ets)、[浏览页](../../entry/src/main/ets/pages/浏览页.ets)。先接有实际价值的读取与修改，再接对应客户端行为；详细口径见下表。 |
| G08 / P2 | FSRS 参数评价 | 当前有优化、健康检查、全部预设优化和负担比较；`EvaluateParams` / `EvaluateParamsLegacy` 未登记，**log loss / RMSE 数值评价未接入**，不能用健康检查结果代替。 | [FsrsService](../../entry/src/main/ets/backend/FsrsService.ts)、[FsrsTools](../../entry/src/main/ets/components/home/FsrsTools.ets)、Core scheduler 协议。核对评价使用当前已存参数还是草稿参数、搜索范围和忽略历史日期，验证空历史和失败。 |
| G09 / P3 | FSRS 逐日复习模拟曲线 | 已使用 SimulateFsrsWorkload 比较保持率的总成本、记忆量与复习数。`SimulateFsrsReview` 未接，**每天的新卡数、复习数、时间成本及累计知识曲线**没有接入。现有总负担比较已可用。 | 同 G08，Core SimulateFsrsReviewResponse。需要长期模拟结果的有界呈现及真实参数范围；不是重新实现预测调度。 |
| G10 / P3 | 单卡从复习历史计算 FSRS 记忆状态 | `ComputeMemoryState` 未接。当前 CardStats/卡片数据能显示已有状态和历史，但不等于按历史重新计算缺失的 state/desiredRetention/decay。属于诊断能力缺口，**不影响 Core 正常评分**。 | [统计服务](../../entry/src/main/ets/backend/统计服务.ts)、[卡片信息](../../entry/src/main/ets/components/browser/卡片信息.ets)、Core scheduler 协议。只读诊断，明确当前存储状态与计算结果差异。 |
| G11 / P3 | FSRS 历史截止范围计数 | 忽略早期复习记录的日期配置已支持；`GetIgnoredBeforeCount` 未接，无法在计算前显示 included / total 数量。`GetRetentionWorkload` 也未直接接，但已有负担模拟，不把它再算作整个负担功能缺失。 | [FsrsOptions](../../entry/src/main/ets/model/FsrsOptions.ts)、[FsrsService](../../entry/src/main/ets/backend/FsrsService.ts)、Core deck_config 协议。显示实际预设/搜索范围、截止前后数量；Core 源码确认 included/total 单位为非新卡卡片数，不是复习日志条数（见 deckconfig/service.rs 的 GetIgnoredBeforeCount）。 |
| G12 / P2 | 字段结构改动后的未保存模板预览 | 模板内容/CSS 草稿、未保存笔记、多模板/Cloze 预览均已实现。字段增删、重排、改名后仍由 `previewFieldsUnchanged()` 阻止，要求先保存。新增标准恢复的结构对照也不等于通用草稿渲染。 | [NotetypeManagement](../../entry/src/main/ets/model/NotetypeManagement.ts)、[笔记类型编辑器](../../entry/src/main/ets/components/settings/笔记类型编辑器.ets)、[NoteDraftPreview](../../entry/src/main/ets/model/NoteDraftPreview.ts)。需要安全隔离渲染方案；不能为了预览先写用户类型，升级 Core 也不能无证据承诺解决。 |
| G13 / P3 | 笔记类型 LaTeX 高级配置 | 原始 JSON 可以读取并保留 latexPre/latexPost/latexsvg，但 UI 和现有 JIDE 类型修改工具没有专门写入这些类型级属性。已有 MathJax 与传统 LaTeX 预生成图片读取正常；**设备端 TeX 图片生成仍属独立平台能力**。 | [NotetypeManagement](../../entry/src/main/ets/model/NotetypeManagement.ts)、[卡片渲染服务](../../entry/src/main/ets/backend/卡片渲染服务.ts)、[AgentMaintenanceTools](../../entry/src/main/ets/model/agent/AgentMaintenanceTools.ts)。先决定只支持保真/修改配置还是新增生成后端，避免把 ExtractLatex 误称作 TeX 编译。 |
| G14 / P3 | 浏览显示列的选择和排序 | 已读取 Core 全部列并支持排序，但搜索会话固定激活 question/deck/cardDue/flags/answer，没有用户或 JIDE 自定义显示列及排列入口。**已有浏览列表、Cards/Notes 和完整结果排序**。 | [BrowserSearchSession](../../entry/src/main/ets/model/BrowserSearchSession.ts)、[卡片表格](../../entry/src/main/ets/components/browser/卡片表格.ets)。在原行协议上接列偏好，核对两种模式和宽窄屏；不要复制一套 SQL 列。 |
| G15 / P2–P3 | 指定笔记范围的标签查找替换 | `FindAndReplaceTag` 已封装，无生产调用者。已有标签树、折叠、全局前缀重命名/删除、批量标签选择；但标签内容的 regex / matchCase / 指定 nid 范围替换未接。ReparentTags 未引用，专门父级选择流程也没有；已有 RenameTags 可改变完整前缀，不能说完全不能调整层级。 | [标签服务](../../entry/src/main/ets/backend/标签服务.ts)、[浏览页](../../entry/src/main/ets/pages/浏览页.ets)、[NoteTags](../../entry/src/main/ets/model/NoteTags.ts)。范围预览、空 nid 的全库语义、正则异常和撤销必须明确。 |
| G16 / P3 | 读取 Core 已保存的 APKG 导入选项 | 全部五项导入选项已支持，导入面板从应用 DEFAULT_IMPORT_ANKI_PACKAGE_OPTIONS 初始化；`GetImportAnkiPackagePresets` 未接，不能读取 Core 中上次保存/同步来的导入偏好。属于默认值衔接缺口。 | [ImportExportMessages](../../entry/src/main/ets/proto/messages/ImportExportMessages.ts)、[DataTransferSession](../../entry/src/main/ets/model/home/DataTransferSession.ts)、Core import_export service。采用真实 Core 快照并保留本次修改；失败不静默当成默认值。 |
| G17 / P2 | 导入结果对应笔记定位 | Core 导入日志有 new/updated/duplicate/conflicting/missing 等笔记 ID；应用只计数并跳过逐项内容，因此导入后没有按结果类别查看对应笔记的闭环。本地 compact-import-log 补丁删字段文本但保留 ID；需要接 ID，不应恢复大体量字段文本。 | [ImportExportMessages](../../entry/src/main/ets/proto/messages/ImportExportMessages.ts)、[ImportResult](../../entry/src/main/ets/components/import/ImportResult.ets)、[补丁](../../tools/patches/anki-compact-import-log.patch)。ID 分页与结果类别语义分别处理，失败条目 ID 未必是现库可浏览对象；大型导入、取消与跨端包回归。 |
| G18 / P3（特定场景） | 自定义同步 CA 证书 | 自定义同步服务器已有 UI；`SetCustomCertificate` 已封装但无生产调用者，证书选取、保存/恢复和实际使用流程未接。当前不能因此说自建服务器全部不可用：系统受信证书的 HTTPS 是另一种情况。 | [同步服务](../../entry/src/main/ets/backend/同步服务.ts)、[SyncSettings](../../entry/src/main/ets/model/SyncSettings.ts)。只在需要私有 CA 时接入；验证格式、重启、失效与真实 TLS 连接。 |
| G19 / P3 | Core 错误关联帮助与原生诊断 | BackendErrorInfo 只保留 message/kind/context，help_page/backtrace 跳过；错误后的具体帮助章节和诊断信息没有接到支持流程。普通错误提示、官方教程检索和帮助主页已经存在。 | [BackendMessages](../../entry/src/main/ets/proto/messages/BackendMessages.ts)、[错误类型](../../entry/src/main/ets/backend/错误类型.ts)、[链接服务](../../entry/src/main/ets/backend/链接服务.ts)。帮助链接用 Core 页面标识；回溯只在开发/反馈边界有界处理，不直接暴露全部内部信息给模型。 |
| G20 / P3（可选渠道） | Anki Core JSON 导入 | `ImportJsonFile` / `ImportJsonString` 未登记。现有 APKG/COLPKG/CSV/TSV/TXT 和 JIDE 制卡可以完成常用导入；没有直接接受 Core JSON 导入格式的产品入口。属于可选渠道，不能写成“JSON 一概不能使用”。 | Core import_export 协议、[数据导入](import-data.md)。如果建设，应从受授权文件暂存、验证格式、结果、确认和取消链路接入，而不是开放任意模型文件路径或 RPC。 |
| G21 / P2 | 既有筛选牌组的编辑、清空和重建 | 创建面板只调用 GetOrCreateFilteredDeck(0) 并写入新配置，已有筛选创建/学习和自定义学习。EmptyFilteredDeck/RebuildFilteredDeck 虽有 Service 封装，却无生产业务调用；没有打开已有 ID 的配置编辑流程。**缺的是既有筛选牌组后续维护**，不是完全没有筛选学习。 | [创建过滤牌组面板](../../entry/src/main/ets/components/home/创建过滤牌组面板.ets)、[调度器服务](../../entry/src/main/ets/backend/调度器服务.ts)、[AppInterface](../../entry/src/main/ets/model/AppInterface.ts)。接已有 ID 的配置读取及确认保存、清空归还原牌组、按当前条件重新填充；核对二段搜索及预览延时等高级选项，验证记录/原牌组保持和撤销。 |
| G22 / P2 | 音频和 TTS 混排的原始顺序 | ExtractAvTags 返回统一重复 AvTag；应用解码拆成 soundFiles/ttsItems，再由 CardAudioSession 先播放所有声音、后播放所有 TTS。**Core 混排顺序未接到实际播放队列**。本次生产解码/会话探针输入“声音 A → TTS B → 声音 C”，实际调用顺序是 A → C → B；不涉及真实音频设备。 | [CardRenderingMessages](../../entry/src/main/ets/proto/messages/CardRenderingMessages.ts)、[CardAudioSession](../../entry/src/main/ets/model/CardAudioSession.ts)。保留有序、类型化 AV 项并逐项选择播放器；覆盖声音/TTS 交错、题答重播、取消、失败和自动推进等待。视频由 WebView 播放，其跨播放器顺序边界须另外明确。 |

G04 的本机别名、G14 的固定列等属于当前产品选择；上表记录它们与 Core 能力的差距，并不主张无条件改变现有行为。G01/G12 方案复杂；其他大多数事项现有 Core 已提供基础，无须等待 Core 升级。

## B. Preferences 字段逐项状态

锁定 config.proto 的 Preferences 有 22 个标量字段。当前应用显式解码/编辑 11 项；另外 11 项由以下表格说明。保留未知字段已经实现，未开放不等于保存其他偏好时会清空它们。

| 子消息 | 字段 | 当前接入状态 |
| --- | --- | --- |
| Scheduling | rollover、learn_ahead_secs | 已接 UI 和 Core 保存；Core 执行 |
| Scheduling | new_review_mix、new_timezone、day_learn_first | 未单独开放；包含旧调度器设置。当前队列混排读取牌组配置 new_mix，已具备现代对应选项，不建议照搬旧全局字段 |
| Reviewing | show_remaining_due_counts、show_intervals_on_buttons、time_limit_secs | 已接 UI 和学习行为 |
| Reviewing | load_balancer_enabled、fsrs_short_term_with_steps_enabled | 已接 JIDE；按既定要求没有新增手动 UI |
| Reviewing | hide_audio_play_buttons、interrupt_audio_when_answering | 读取/修改/前端策略未接，见 G06 |
| Editing | adding_defaults_to_current_deck | 未开放查看/修改；已有 DefaultsForAdding，实际目标选择还涉及本机流程，不判为整个新增功能失效 |
| Editing | paste_images_as_png | 未开放且图片导入策略未消费该值；已有图片原格式保留/不支持格式转 PNG，不能称作没有图片导入 |
| Editing | paste_strips_formatting | 未开放且富文本粘贴策略未消费该值；已有富文本和源码编辑 |
| Editing | default_search_text | 未开放，浏览初始查询未读取该值；保存搜索已有，不应混为一项 |
| Editing | ignore_accents_in_search | Core 的搜索 SQL 读取已有值；本机只能继承，不能查看/修改，不能称作搜索完全不支持忽略重音 |
| Editing | render_latex | 未开放，客户端没有按它控制 TeX 生成；MathJax/预生成媒体是已接替代能力 |
| BackupLimits | daily、weekly、monthly、minimum_interval_mins | 已接 JIDE 读取/修改，Core 保留与清理；手动 UI 仍只有原备份管理 |

来源：[Core config.proto](../../third_party/anki/proto/anki/config.proto)、[PreferencesMessages](../../entry/src/main/ets/proto/messages/PreferencesMessages.ts)、[Core preferences](../../third_party/anki/rslib/src/preferences.rs)、[Core 搜索](../../third_party/anki/rslib/src/search/sqlwriter.rs)、[Core 队列](../../third_party/anki/rslib/src/scheduler/queue/builder/mod.rs)。

## C. 应用已有、JIDE 尚未直接操作的能力

JIDE 能通过共同界面目录描述入口、读取已登记界面状态并导航；这不等于能点击所有控件或执行该业务。以下属于 **JIDE 工具覆盖边界**，不能再算为 jidecards 完全未实现，也不能绕过现有确认/Scope 边界补一个万能 RPC。

| 能力组 | JIDE 当前边界 | 后续责任入口 |
| --- | --- | --- |
| 五项基础全局复习偏好 | get_settings / get_advanced_settings 没有直接包含日切、提前窗口、时间盒和两项复习显示的读取/修改字段。已挂载的相关设置组件可以发布部分实际 UI 状态；缺的是稳定的领域读写工具 | ReviewPreferencesStore、AgentSettingsTools、AgentMaintenanceTools |
| 牌组选项和 FSRS 工具 | get_deck_options 已能读选项；没有针对学习步骤、限额、保持率、排序等的修改提案，也没有启动参数优化/评价/模拟的工具。全库 FSRS 开关及两项高级全局开关已经可以改 | DeckOptionsSession、FsrsService、AgentActionExecutor |
| 卡片维护 | 浏览器重置为新卡、设置到期、重新定位、旗标、暂停/恢复、埋藏等已有 UI；当前 JIDE 没有对应调度/状态修改提案。字段/标签修改、移动和删除已有工具 | BrowserOperationController、CardMarking、调度器服务 |
| 集合与媒体维护 | 检查数据库、媒体检查/回收站、缺失笔记打标、空卡/查重、创建/恢复备份、集合撤销/重做均已有产品入口；JIDE 只具备目录/状态认知和部分导航，没有直接启动这些操作的专用工具 | 各维护 Session、CollectionHistorySession、LocalBackups |
| 保存搜索与全局标签树维护 | 可搜索卡片、列标签和提案改笔记标签；没有保存搜索增删改、标签前缀重命名/全局删除/层级调整专用提案。手動 UI 已有多数流程 | BrowserSidebar、标签服务、AgentDraftExecutor |
| 更多本机偏好 | propose_set_setting 仅支持 card_text_size / deck_list_narrow / study_haptics。其余普通偏好多为只读；主题/FSRS/学习控制另有专用工具，因此不能按这三个 ID 判断总能力 | AgentPreferenceSettings、实际共享保存入口 |

来源：[真实工具总表](../../entry/src/main/ets/model/agent/AgentToolCatalog.ts)、[设置工具](../../entry/src/main/ets/model/agent/AgentSettingsTools.ts)、[高级工具](../../entry/src/main/ets/model/agent/AgentMaintenanceTools.ts)、[本机偏好白名单](../../entry/src/main/ets/model/agent/AgentPreferenceSettings.ts)。评分、同步凭证和任意按钮操作仍属于明确权限边界，不当作需自动授予模型的功能。

## D. 平台能力及后续验收

| 项目 | 当前边界 | 归属 |
| --- | --- | --- |
| 多档案 / 多账号集合隔离 | 后端单例直接使用 filesDir/collection.anki2、collection.media、单组同步偏好及备份目录，没有完整档案选择和隔离切换 | 应用架构；集合、媒体、备份、凭证、JIDE 会话必须一起隔离 |
| 字体文件导入与加载 | 已有应用卡片字号/CSS；没有完整字体文件选择、注册与可用性管理。设置字段 font 字符串本身不证明鸿蒙拥有该字体 | HarmonyOS 字体/媒体适配 |
| 更广的输入映射 | JIDE 已接 space/enter/1–4/r/b/s 与 left/right/double、规定命令；更多手势、遥控器/手柄/硬件键尚非通用映射系统 | StudyControls / StudyInputPolicy；已有映射不再标为缺失 |
| 图片遮罩精细编辑 | 已有多形状、分组、移动/步进缩放/旋转、撤销重做；直接变换手柄、画布连续缩放等仍需完善 | 图片遮罩编辑器，属于交互能力，不是 Core RPC 缺失 |
| 设置逐项定位 | 目前搜索分组标题/说明及部分 searchKeys，结果仍返回分组；未提供每个设置项高亮、滚动定位的完整链路 | SettingsNavigation / 设置宿主 |
| 无障碍、通知、音频、文件、桌面卡片 | 已有基础标签、提醒、TTS、文件打开和统计卡片；组合设备审计与异常/后台场景未全验收，不将“尚未验收”写成“没有功能” | HarmonyOS 设备验收 |
| 在线和跨客户端互通 | 有锁定 Core 隔离包回归；真实 AnkiWeb 断网/冲突及实际 AnkiDroid、桌面和 HarmonyOS 应用往返仍须单独验收 | 互通任务和真实账号/设备样本 |

入口：[后端会话](../../entry/src/main/ets/backend/后端会话.ts)、[StudyControls](../../entry/src/main/ets/model/StudyControls.ts)、[图片遮罩编辑器](../../entry/src/main/ets/components/图片遮罩编辑器.ets)、[SettingsNavigation](../../entry/src/main/ets/model/SettingsNavigation.ts)、[核心互通](core-interop.md)。

## E. 本次排除的误报和重复待办

- **上一轮已接入**：首页/浏览器集合撤销与重做、重置为新卡、缺失媒体定位/打标、自定义调度兼容提示。
- **JIDE 已接入，按此前要求不新增手动入口**：FSRS 负担均衡/带步骤短期调度、备份策略、notes/cards 子集 APKG/文本导出、复制笔记、字段高级属性/排序字段、标准恢复、学习常亮和指定输入映射。G02 只列其剩余本机消费边界。
- **有真实替代实现**：标签增删 → UpdateNotes/原生媒体打标；图片遮罩新增/修改 → 通用笔记保存；GetReviewLogs → CardStats.revlog；新式类型写入 → Legacy JSON + Core；全局媒体检查 → 原生快照；TTS → HarmonyOS 平台；拼写比较/挖空 → 本机对应策略；辅助查字段/名字 → 现有类型/树读取。
- **模板高级字段不能误报为全无接入**：UI 草稿只编辑 name/qfmt/afmt，但 JIDE get_notetype_details 返回原始 JSON，propose_update_note_type_templates 校验后保留完整模板对象，并交 Core 更新。bqfmt/bafmt/did/bfont/bsize 有原始 JSON 路径；专门表单/字段化工具不完整，不应因此判定完全不能读写。类型级 LaTeX 配置另见 G13。
- **专属/旧辅助接口不自动建设**：AnkiDroid 原始 DB 分页/调试、AnkiHub 登录、桌面插件更新/GitHub 下载、桌面配色板、旧版牌组/配置 JSON、研究用 FSRS benchmark/dataset、旧最低保持率计算；对照价值与是否产品化分别判断。
- **旧调度迁移不能仅因 UpgradeScheduler 未登记就判为全部缺失**：APKG Core import 内含条件性的 maybe_upgrade_scheduler；其他旧集合迁移场景仍需专用样本，不承诺全部跨版本兼容。

## F. 建议继续顺序

1. **先闭合已承诺的行为**：G02 字段元数据本机生效；G03 批量撤销/写入语义；G06/G22 音频偏好和混排顺序。同时检查 JIDE 的实际效果描述，避免把 Core 保存成功扩写成本机已经应用。
2. **补日常数据管理**：G04 真正改名、G05 牌组说明、G15 标签替换、G17 导入结果定位、G21 既有筛选牌组维护；复用既有写入会话、确认和导航。
3. **补诊断及配置**：G07 Editing 偏好、G08/G11 FSRS 评价/计数、G14 列偏好、G16 导入偏好；其他 P3 按实际需求推进。
4. **单独立项**：G01 自定义调度执行、G12 通用结构草稿渲染、多档案、字体管理及更广的平台输入。需要不同边界和设备验证，不能用升 Core 一项覆盖。

此前高级能力只暴露 JIDE 的约定保持有效；按[当前入口决策](../decisions/2026-10-04-ankicore-ui-routing.md)，较复杂的配置能力通过 JIDE 类型化工具提供，极简入口可复用现有界面。G02/G06 等需要本机显示/播放实际消费配置，单加一个工具不能完成它们。

## G. 本次实际验证

- `node tools/verify-rpc-index.mjs`：通过，22 服务/22 方法表与锁定协议一致。
- 7 个专项文件 **77 项回归全部通过**：ai-agent-maintenance、review-preferences、note-draft-preview、notetype-management、deck-options-fsrs、browser-note-tags、collection-history-session。它们用于复核“已接功能”，没有把测试通过当作剩余缺口消失。
- 两项生产代码探针确认剩余消费缺口：字段消息含 RTL/字体等但 decodeNotetype 结果只保留 sticky；有序 AV 消息经真实解码/会话播放后由 A/TTS-B/C 变为 A/C/TTS-B。播放器为记录调用的替身，不等于真机复现。
- 全量静态盘点扫描生产 `entry/src/main/ets` 与原生源码，接口附录/CSV 使用同一份 232 条数据，核对每服务数量和 68+31+133 分区。
- 文档链接/契约 **10 项通过**；本任务文档差异检查通过。没有业务源码修改，没有重跑全仓库、Rust、HAP，没有安装设备、调用真实模型或改用户集合。
- 专项日志：`.local/anki-integration-focused.log`、`.local/anki-integration-probes.log`、`.local/anki-integration-docs.log`；静态盘点中间结果：`.local/anki-integration-audit.json`。长期交接以本报告、接口附录和 CSV 为准，不依赖临时脚本存在。

## 交接

目标是继续查全接入边界并整理，不是本次实施上述事项。报告按现有锁定 Core 做接口全集核对；业务功能按当前生产调用链复查。下一轮选择具体 G 编号即可沿表中责任入口实施，完成后更新本报告状态及当前领域文档；涉及功能变化时必须同时接通 JIDE 的真实读取/操作/认知。
