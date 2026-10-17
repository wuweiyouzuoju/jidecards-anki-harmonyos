# 应用内 Agent

[返回任务索引](../../PROJECT_CONTEXT.md)

恢复/结果反馈面、按钮真实状态和手动菜单/轮盘的共同认知声明见 [交互恢复与局部动效](interaction-feedback.md#jide-与维护边界)。反馈观察不提供新的助手代操作许可。

- 本页只描述产品运行时的应用内 Agent，不描述负责修改仓库的编程 Agent；编程 Agent 规则见 [编程 Agent](coding-agent.md) 和根 [AGENTS.md](../../AGENTS.md)。
- 代码路径以下均相对 `entry/src/main/ets/`。
- 责任链：UI → 会话/Runner → 读取、导航排队与提案；成功回复收尾 → 首页 Navigation；用户确认 → DraftExecutor / ActionExecutor → Service 或受控存储。
- 快速反馈：`npm test -- agent`；完整验收见 [验证说明](verification.md)。

## 卡库与应用操作接入（2026-10-11）

新增操作以 `model/agent/AgentOperations.ts` 为唯一声明、严格参数及风险目录，进入 assistant/create/edit 三种模式；`AgentOperationTools` 注册并验证 Scope、批量数量和已发现目标。`CoreAgentOperations.ts` 适配现有 Core 服务，`AppAgentOperations.ets` 适配本机存储和原界面宿主；不新增任意 RPC、文件路径或凭证入口。

| 范围 | 接通行为 |
| --- | --- |
| 卡片与笔记 | 暂停/恢复暂停、埋藏/取消埋藏、重置、到期日、新卡定位、立即评分、旗标；标签追加/移除/整体替换、级联改名/删除、清除未用标签、字段查找替换 |
| 当前学习 | 真实卡片与正反面读取、翻面、重播、四档评分，交原学习页与 StudySessionController；选择题、编辑、恢复、后台、内容待刷新或状态变化时拒绝；音频失败回传实际错误 |
| 维护 | 当前撤销/重做、数据库检查/修复、空卡报告、现有重复笔记扫描器；媒体检查/报告分页、未用媒体回收、缺失媒体标记、回收站恢复/清空 |
| 牌组与类型 | 新建/清空/重建筛选牌组、自定义学习含状态/标签；预设改名/复制/删除/分配、当前/全部预设 FSRS 优化、自定义调度脚本；类型改名/复制和字段增删改名/重排 |
| 本机显示与提醒 | 牌组隐藏/别名/全部色调/背景选图裁剪及清除、旗标名、学习提醒创建/完整修改/删除/启停 |
| 数据与同步 | 本机备份创建/恢复、完整 COLPKG 导出、APKG/CSV/集合导入、同步状态/发起、原表单登录、注销/服务器修改 |
| 设置 | `AgentPreferenceSettings.agentWritablePreferenceIds()` 的全部可配置项；语言、学习快捷操作和图表偏好；全局复习的跨日时间、提前学习、时间盒及剩余/间隔显示 |

写操作只生成 `app_operation` 草稿，沿用 DraftExecutor 确认，高风险双重确认。进程内登记完整指纹，准备、执行前重读基线；接受内容被冻结且只消费一次。恢复历史不恢复许可，失败/未知结果不提供自动重试。全局操作、共享预设和类型字段确认展示相应范围；筛选/自定义学习展示候选范围，实际卡片由 Core 的排序与限额决定。新卡顺移包括暂停的新卡。混合恢复不会误解除另一种状态。

原流程负责权限、文件选择、CSV 映射、集合覆盖、同步冲突、登录和图片裁剪；等待用户操作不算完成，取消和部分失败如实返回。提醒落盘成功而通知发布失败返回 `partial`。媒体维护使用最近一次确认检查的有效分页快照，集合或媒体变化即要求重新检查。FSRS 优化返回真实参数与 `saved=false`，参数保存继续使用现有牌组选项提案，不隐式保存或重排。`system_dark`、`media_sync_pending` 保持只读观察。

执行结果写入聊天记录，并可用 `get_operation_result(name=draftId, offset, limit)` 分页读取本会话已发现操作的完整 JSON；按字符拼接 `resultText` 后解析。结果仅保存在进程内，会被后续结果淘汰，进程重启或历史恢复不恢复执行许可。失败或未知结果必须先核实当前状态，不自动重试写入。

行为验证：`ai-agent-operations.test.mjs` 覆盖 Core 适配与确认执行器；`ai-agent-operation-workflows.test.mjs` 覆盖平台适配、原迁移会话、目标发现/分析预算、提醒持久化、同步凭证和设置分派。主机测试不替代系统选择器、通知权限、联网同步及 ArkUI 真机验收。决策与验证记录见 [操作接入](../decisions/2026-10-11-jide-operation-integration.md)。
- `execute_code` 已接入本地纯计算：QuickJS-NG + wasmi、独立异步 NAPI、固定资源预算及贯通取消，不获得卡库或工具权限。入口与验收见[沙箱模块](../../native/agent-sandbox/README.md)，当前验证范围见[决策记录](../decisions/2026-09-30-agent-local-sandbox.md)。

浏览普通菜单的搜索工具、显示设置和更多分组由 `AppInterface` 的共同声明生成；`BrowserMoreMenu` 按实际展开状态发布 `browser_search_tools`、`browser_display_settings`、`browser_more_settings`。搜索选项与最近搜索使用独立声明和原弹窗组件。学习/浏览旗标颜色朝主菜单方向覆盖时，保留标记及已展开的卡片操作侧面板观察、移除被覆盖的主菜单观察；颜色层只登记实际七色与清除选项，不增加返回控件；名称认识及状态观察不增加未注册的点击权限。回归见 `browser-more-menu.test.mjs`、`ai-agent-app-structure.test.mjs`。

制卡/编辑目标牌组与记忆范围统一使用[公共目录树](appearance.md#公共目录树)，按稳定牌组 ID 或 `deck:id` scope 回传。当前目录的查询、完整路径、选中及可操作状态由真实组件经宿主登记 `directory_tree`，多个目录观察按 owner 独立释放；原静态业务声明与已接通能力保留，观察不授予新的代操作许可。

### 全软件操作覆盖复核（2026-10-11）

当前 JIDE 已覆盖上表的主要卡库业务，但不能表述为“全部按钮都能代点”或“整个软件都能无人参与操作”。复核以 `agentFunctionTools(100, 'assistant')` 的实际工具、`APP_INTERFACE_SURFACES` / `SETTINGS_GROUPS` 的共同声明及领域执行入口对照；界面条目、工具数量和测试通过率均不能换算为全软件操作覆盖率。当前能力仍以这些声明和真实注册为准，不另维护一份完整工具清单。

| 范围 | 尚未接通或受限的操作 | 现有能力及责任入口 |
| --- | --- | --- |
| 编辑器中的未保存内容 | 读取/修改当前光标和选区、接管未保存表单、点击编辑轮盘、编辑器局部撤销/重做 | 已保存笔记的 HTML 字段可经 `read_note_field` / `propose_update_notes` 修改，包含富文本、公式和挖空；不能把这些内容修改误列为缺失。表单归原编辑页及 `NoteFieldEditing` |
| 图片遮罩与书画 | 没有源图导入及遮罩几何、分组的专用提案，也不能控制制卡画布、笔迹和学习白板工具 | `图片遮罩服务`、`图片遮罩编辑器`、`NoteDrawing` / `StudyWhiteboard` 拥有原流程；能写字段字符串不等于已接通遮罩业务。现有书画/白板观察不提供执行权限 |
| 媒体写入与播放 | 没有把会话上传图片、视频或取帧结果直接写入卡库的工具；没有录音、音频导入/转写、视频播放/定位控制 | `AgentNoteMediaTools` 将已有图片/视频读成会话资料，`AgentDocuments` 可 OCR / 采样画面；新图片附件由 `search_images` 候选经 `AgentDraftExecutor` 写入。已有媒体引用可在字段中复用，不能据此声称可新建任意媒体文件 |
| 学习会话 | 不提交选择题选项或输入题文本，不接管时间盒/调度警告确认及当前会话的自动前进弹窗 | `propose_study_command` 仅翻面、重播和四档评分；`AppAgentOperations` / 学习页拒绝选择题、恢复或被阻塞的状态。牌组选项中的自动前进配置已可改，不能与当前弹窗混同 |
| 全部统计数据 | 没有直接读取统计页全部原始图表桶和全历史数据的工具 | `get_learning_overview` 返回概览、最多90天历史及30天预测；`get_card_statistics` 返回有界单卡历史。`AgentLearningOverview` 未输出新增、逐小时、评分分布、间隔/稳定性/难度等全部图表数据。统计偏好写入已接通 |
| JIDE 自身设置及聊天管理 | 不代改 Provider、模型、视觉能力、批量上限、搜索服务/开关或密钥，也不代选、删除、切换历史聊天 | `agent_settings` 观察提供非敏感表单事实；手动配置归 `AgentSettingsStore` / `AgentSecretStore`，历史正文只读检索归 `AgentHistoryToolSession` / `AgentHistoryRepository`，手动恢复仍归 `AgentHistoryCoordinator`。长期记忆读写与当前任务计划已有独立工具，不能一起列为缺失 |
| 其他面板及外部入口 | 导航只支持 `APP_NAVIGATION_ACTIONS` 的固定语义动作，没有任意弹层/控件点击、兑换码提交、外部商店/群/注册页操作工具 | `AppNavigation` 保护现有编辑与学习页面；权益与外部动作仍由原 UI 拥有。云端直链牌组的下载/导入未接入 JIDE，且当前 `ReleaseFeatures.CLOUD_DECK_CHANNEL_ENABLED=false`，不能当成当前已发布入口 |

已接通但仍需要用户参与的流程：同步登录表单、同步覆盖/冲突方向、系统文件选择/保存、CSV 映射、集合覆盖及背景选图裁剪。它们返回实际完成、取消或失败状态；打开面板不等于完成，也不能把保留用户步骤全部算成“没有接入”。一般写入仍需草稿确认，高风险操作双重确认；学习操作还依赖当前有效会话，批量修改及大型内容分析保留原范围/额度边界。

本次主机复核：`npm test -- agent` 的713项回归通过；另核对了上述实际工具参数、共同 UI 声明和执行分支。原 `propose_update_browser_preferences` 的“忽略重音只能手动修改”说明已修正为使用独立 `propose_set_ignore_accents`。本轮未安装设备、运行真实模型任务或验收系统选择器/权限/联网流程；测试通过不证明所有场景均可操作。

### 已确认的下一阶段计划

历史检索已接入，当前范围见下文“历史记录管理与检索”；完整统计数据及 JIDE 开启/关闭联网提案仍在[开发计划](../decisions/2026-10-11-jide-history-stats-web-plan.md)中待实现。默认保存500个会话已实施，消息数/正文截断及模型请求预算继续保留，不能称为无限或完整历史存储。

专属选择题制题路线已取消；[旧格式](../choice-apkg-v1.md)和[旧工具](../choice-authoring.md)仅作既有兼容维护，不作为 JIDE 新能力或后续待办。已有题库读取和学习行为保留。

### 历史记录管理与检索（2026-10-11）

- 全局 AI 设置和 JIDE 设置复用 `AgentHistorySettingsSection`：默认500个会话，可选择100/500/1000，显示会话数量及正文文件用量，支持搜索、逐条删除和清空。达到上限会淘汰最早更新的会话；降低上限导致删除、逐条删除和清空均先确认，确认期间历史版本变化则拒绝旧确认。取消不写入，已接受写入不随UI销毁取消。删除当前会话会重置聊天而保留设置编辑器；历史管理忙碌状态同步到实际控件和JIDE观察。每会话最近200条消息、每段正文最多20000字符及思考/审计预算仍保留；不是500条消息，也不是无损/无限存储。旧版本已裁掉的正文无法恢复。
- `AgentHistoryRepository.ts` 拥有全部宿主共用的串行队列、schema=2索引、独立版本正文文件、留存上限、检索缓存及版本校验；`AgentHistoryFiles.ets` 是异步文件IO/Preferences迁移边界；`AgentHistoryProjection.ts` 是原安全投影的单一入口，仍脱敏、限长并去除可执行历史引用。`AgentConversationStore.ets` 仅保留原平台适配函数。列表只加载摘要，恢复时才读单个会话；`AgentHistoryCoordinator` 继续拥有页面读取/恢复代次与检查点协调。
- 首次读取把旧 `conversations_v1` 逐个写入独立文件，全部成功后原子替换索引；失败保留旧Preferences并可重试。正文按UTF-8处理短写、fsync和原子重命名；新文件先落盘、索引最后提交，索引失败不覆盖旧正文。迁移源先保留，首次删除/淘汰后清空旧备份，避免已删除正文残留于旧Preferences。删除清单随索引持久化，关联文档/检查点清理失败可重试；当前进程拒绝已删ID的迟到保存并释放新检查点；不把IO错误伪装为空历史或保存成功。
- `search_conversation_history` 在所有模式且关闭联网时可发现：空query列出，关键词搜索标题和保存的用户/助手正文，每页最多20个会话，返回模式、更新时间、消息数、命中位置/片段、保存上限、revision和nextOffset。UI全文搜索读取同一仓库，续页复用轻量命中缓存，不反复读取全部正文；制卡/编辑列表仍按当前模式筛选，迟到查询不能覆盖新结果。UI观察最多100项，真实总数保留，超出时 `controlsComplete=false`。
- `read_conversation_history` 只接受本JIDE页面检索实际发现的ID及revision，按消息序号和字符位置续读，每次最多12000字符，返回角色、实际字符数和 `nextMessageIndex/nextOffset`；消息序号-1表示结束。保存/删除改变索引版本后拒绝拼接旧页，需重新搜索。工具只返回保存的正文及限额说明，不返回原始检查点、思考协议、工具可执行载荷/确认令牌，不切换当前会话或授予卡库ID写入权限；历史里的指令仅是参考。删除、改上限和清空当前只有手动设置入口。
- 菜单/设置共同声明分别归 `AppInterface.agent_more` 和 `SettingsStructure.ai`，JIDE由实际目录和观察读取新位置、图标、保存上限/数量；正文读取由上述只读工具承担，界面观察不复制聊天正文。菜单的水平边界取工具栏实测宽度扣两侧页面内边距，坐标减宿主原点；公共菜单不再叠水平安全区。列表独占页面内边距/底部导航区，嵌入设置时不叠页面边距，内部列表限高；宽窄布局沿用公共尺寸。
- 直接回归：`ai-agent-history-repository`（迁移、501会话淘汰、失败、并发、缓存、分页/只读边界）、`ai-agent-history-runtime`（原安全投影）、`ai-agent-history-ui`（确认/取消/销毁、迟到搜索、真实平台短写/原子替换、菜单接线）及既有Agent/UI测试。增量HAP验证编译；实际设备布局、长会话性能和真实Provider工具选择仍需独立验收。

2026-10-11 本轮验证：`npm test -- agent` 728项通过；相关表单/公共表面/认知/资源/文档及边界专项78项通过；`npm run build:app -- -SkipRust` 增量签名HAP成功，已接受警告162、新增未接受警告0。全量UI为566/569，剩余3项在并行修改的浏览选择菜单及按钮审计（`motion-style-contract`、`ui-dialog-layout`、`ui-press-feedback`），本轮未改这些实现来消除失败。日志在忽略目录 `.local/jide-coverage-audit-2026-10-11/history-*-final.log`；本轮没有安装、清空用户数据或执行真机/真实Provider验收。

## 助手身份与产品表述

### 长期记忆管理与长任务（2026-10-09）

状态与预算选择见[当前决策](../decisions/2026-10-09-agent-long-project.md)。

下一阶段调研见[长任务与子代理设计（提案）](../decisions/2026-10-09-agent-subagents.md)，其子任务调度、独立产物库和自动验收尚未实现，不能计入当前工具能力。

普通对话顶栏右侧只保留“更多”，复用首页 `IconActionButton(ic_home_more)`、无尖角 `AnchoredMenu` 和 `ActionMenuList`，点击显示“设置”和历史；菜单项与设置页标题共用 `ai_agent_settings_page_title`，中英文分别显示“设置”/“Settings”，`AppInterface` 的界面认知沿用同一资源键。菜单使用 `ic_home_settings`、回转时钟 `ic_common_history` 的既有灰色填充图标，顶栏仍使用描边。历史页右侧仅为“＋”。长期记忆只从 JIDE 设置页进入，顶栏不再设独立记忆入口。`AgentMemoryPanel` 负责搜索、范围筛选、新增/编辑/删除、未保存退出和真实界面观察，返回管理列表、设置、原聊天或历史按层级处理，保留原聊天及输入。`AgentMemoryManager` 拥有读取代次和手动提交；复用页面已有 `AgentWorkspaceStore` 的队列、`applyAgentMemoryChange` 的旧快照校验及本机存储，不调用模型、不修改卡库。AI 记忆提案和手动入口读写同一份数据；保存失败保留编辑内容，过期修改被拒绝，退出后已接受的提交仍完成。范围显示真实牌组名称，牌组删除后需重新选择范围或删除记忆；页面上的范围选择器显式传 `surface_card`，复用公共白底（深色随主题），卡片内部的内嵌选择器仍沿用公共默认底色。`AppInterface` 同时声明入口顺序、管理界面和实际控件状态；界面观察不额外授予写入权限。

JIDE 设置直接组合全局设置的 `components/settings/AIAgent设置分组.ets` 与其中的 `AgentWebSettingsSection`，查看/编辑模型服务、模型、API 密钥、自定义服务视觉能力、单批制卡上限和联网搜索设置，仍经原 `AgentSettingsStore` / `AgentSecretStore` 保存。长期记忆在设置正文顶部单独占一栏，与下方 AI 配置分组分开；复用 `设置分组卡片(showHeader: false)` 和 `SettingsActionRow`，标题由操作行提供，卡片间距归 `应用尺寸.页面分组间距`，窄版8vp、宽版12vp。设置表单在打开长期记忆期间保留挂载和草稿，隐藏时释放自己的界面观察，返回后恢复；顶栏返回和系统返回统一委托设置分组的忙碌/未保存退出守卫。保存成功回调刷新当前页面 Provider 配置，后续请求使用新值。表单读取使用严格模式，读取失败禁用模型配置提交，避免以默认值覆盖已有设置；迟到读取与销毁回调由原组件代次隔离。设置正文独占12vp水平边距和8/12vp密度顶部间距，卡片内部边距仍归既有设置卡片，导航安全区只在正文底部追加一次。

`agent_settings` 的配置名称/条件直接复用 `SettingsStructure.SETTINGS_GROUPS` 的 `ai` 分组，真实表单发布加载、忙碌、可用控件与非敏感当前值；密钥与自定义 URL 不进入观察。长期记忆父级为 `agent_settings`，不新增助手代操作权限。回归在 `ai-agent-settings-contract.test.mjs`、`ai-agent-web-settings.test.mjs` 和 `ai-agent-app-structure.test.mjs`，按 [分级验证](verification.md#按变更路径选择验证)检查相关测试及增量 HAP；设备外观、键盘和交互单独验收，既有记忆页的历史设备结论不覆盖新设置页面。

`AgentMemory.buildAgentMemoryContext` 每次请求优先纳入当前目标下近期的完整已确认记忆，序列化条目预算16000字符；未进入窗口的偏好仍保留在存储，可通过 `search_memory` 查阅。不会裁剪单条偏好或把未纳入上下文当作已删除。

长期记忆 UI 参考 `AgentHistoryList` 的页面边距与空状态排版，滚动正文显式顶部对齐，短内容不在剩余页面中居中。筛选与编辑范围共用 `DirectorySelect` / `DirectoryTree`，“全部记忆”仅用于查看所有范围，“通用记忆”对应适用于所有牌组的 `global` 范围；筛选、编辑和提案复用同一名称资源，表单说明同时解释通用与牌组记忆。牌组范围按层级展开/搜索，搜索/编辑输入与辅助按钮沿用既有表单样式和公共按钮；同级控件间距归 `FormRowLayout.rowGap`。面板独占12vp水平边距和8/12vp密度顶部间距，底部仅追加一次由页面传入的导航条高度，顶栏继续拥有状态栏安全区；空状态仅增加上下16vp，不重复缩进左右边界。长牌组名由共享选择行限宽并保留完整下拉内容，保存、冲突和退出策略沿用原模型。此次布局调整的主机检查与设备验证分别报告。

新增入口为长期记忆页顶栏右侧的“＋”，复用 `IconActionButton.toolbarStyle` 与 `ic_home_new`，列表不再显示大号新增按钮。顶栏只传递创建请求，真实加载、忙碌和编辑状态由 `AgentMemoryPanel.onCreateAvailability` 发布，禁止重复打开。新增与修改共用 `AgentMemoryEditorDialog`，原生窗口由 `NativeDialogHost` 字段工厂创建，布局、遮罩、安全区和键盘限高复用 `DialogFrame`，关闭与保存复用 `DialogHeader`。面板继续拥有草稿、校验和存储，通过编译器支持的 `@Link` 传入表单；关闭图标、遮罩、系统返回均委托同一 `requestClose`，未保存确认取消和保存失败保留输入，成功后只关闭弹窗并刷新原列表。销毁关闭窗口且隔离旧回调，已接受写入仍由原管理器完成。`AppInterface` 同步登记顶栏入口与 `agent_memory_editor` 表单，并从真实拥有者发布可用状态；不额外授权模型写入。

每张记忆卡片顶部左侧为修改图标、右侧为删除图标，复用 `IconActionButton.toolbarStyle` 和既有 `ic_study_edit` / `ic_study_delete`，沿用44vp点击区、主题描边及完整本地化无障碍名称。操作栏在正文上方独占一行，卡片内边距仍为10vp，不与长文本重叠。加载和忙碌时禁止点击，删除继续经过原确认与旧快照校验；实际界面观察按当前筛选结果发布每条记忆的图标和可用状态，编辑态不发布列表操作。图标布局的设备外观与点击验收另行记录，不沿用下方此前页面布局的设备结论。

2026-10-09 布局验收：相关 Agent/认知、公共选择行/状态、资源刷新、ArkTS 字段及文档检查通过；增量签名 HAP 成功，新增警告为0。现有手机模拟器保留数据覆盖安装成功，安装前后 UID、首次安装时间、appIdentifier 和 debug/none 类型一致。长期记忆页的真实布局快照确认正文距顶栏8vp、左右12vp、选择行与新增按钮间8vp、选择框限宽且无重叠。因模拟器在校验期间被其他操作切换，未完成稳定截图及编辑/键盘、宽屏/大字体/深色和真机验收；证据保存在忽略的 `.local/memory-ui-2026-10-09/`，不能把坐标检查描述为全部视觉验收。

长任务使用 `get_task_plan` / `update_task_plan` 管理当前会话目标、有序步骤和接续笔记，最多100步、最多一个进行中步骤、笔记最多8000字符，并以 `baseRevision` 拒绝旧版本覆盖。计划是模型整理的会话资料，不是操作完成证据、长期偏好或卡库权限。状态归 `AgentScope.taskPlan`，新会话清除，`AgentSessionController` 的检查点保存/恢复同一快照；恢复后的请求会收到当前计划，也可重新读取。聊天上方显示简要计划进度。辅助工具目录、Schema、Registry、运行指令共用声明。

`AgentRunner` 在每次模型请求前及无待确认提案的工具完成后发布检查点。Session 对检查点副本补齐尚未返回工具的中断结果，不改正在执行的协议；原始思考保持完整，已接受写入不会从历史重新授权或重放。页面冻结并排队保存历史，同时原子写入现有检查点文件；持久化失败停止本轮，不能伪装成应用工具失败继续执行。检查点只描述已到达的边界，崩溃发生在实际副作用与检查点之间时仍需核实实际状态。

默认单轮额度由8次模型/16次工具提高到32次模型/96次工具。`AgentExecutionBudget` 为当前内置 DeepSeek 两个模型使用768000序列化字符和131072输出token；自定义及其他接口维持240000字符/32768输出token。`ProviderProtocol` 与 Runner 拷贝共用该请求预算，不把字符额度冒充模型token窗口，不改变图片、Scope、草稿确认或批次写入边界。服务端仍可根据模型真实窗口拒绝请求。DeepSeek公开模型参数见[官方模型列表](https://api-docs.deepseek.com/api/list-models)和[官方规格](https://api-docs.deepseek.com/quick_start/pricing/)；本轮未进行付费模型评测。

回归见 `ai-agent-long-project.test.mjs`、`ai-agent-v2-runtime.test.mjs`、原上下文预算及界面认知回归：覆盖超旧轮次任务、批内中断结果配对、恢复计划、IO失败停止、手动/AI修改冲突、大量记忆的有界请求及未保存退出。主机与设备验证分别记录；编译不证明真机布局和真实模型执行质量。

2026-10-08：`get_browser_preferences` 读取真实集合浏览偏好、最近搜索、Core 列目录与忽略重音值。`propose_update_browser_preferences` 只接受模式、排序、副标题和 Cards/Notes 各自有序显示列的局部修改；未知配置键、无效列、当前模式不支持的排序被拒绝。确认卡显示前后值，`AgentActionExecutor` 与手动菜单共用 `BrowserPreferencesStore`，执行前核对旧快照，保存后读回。忽略重音由手动搜索选项和独立 propose_set_ignore_accents 提案共用保存入口；浏览偏好不修改笔记或调度。`AppInterface` 同步声明全选、清空、所选预览/导出/评分、列配置、搜索选项、快捷键、并排编辑和查找替换目标，各实际拥有者发布忙碌、作用范围与选项。界面观察不授予任意点击能力，实际修改仍走已注册领域入口。行为与确认回归见 `ai-agent-maintenance`、`browser-desktop-ui`。

2026-10-07：`get_filtered_deck` 读取已发现筛选牌组的真实 Core 配置；`propose_update_filtered_deck` 仅准备搜索条件、数量/顺序、重新调度和预览延迟白名单修改。`FilteredDeckCommands` 是 UI/JIDE 的共同入口；确认卡显示前后值，执行前核对旧 protobuf 配置，保留未知字段与 v1 延迟，接受写入后独立于页面生命周期完成。搜索条件、数量上限、排序方式各自成行，不显示原始配置 JSON；未变值只显示一次，两组搜索以序号区分，移除项显示未设置。`FilteredDeckOptions` 的排序值/名称同时供手动表单和 JIDE 使用。普通牌组被拒绝，过期提案不提交，更新后重建并返回实际配置/计数。`get_advanced_settings` / `propose_update_collection_preferences` 同时读写隐藏音频按钮和翻面中断偏好。导入结果、音频设置和筛选菜单发布真实界面状态，不仅更新提示词。回归见 `filtered-deck-commands`，设备与 Core 证据见[本轮验收](ankidroid-high-priority-2026-10-07.md)。

### JIDE 专用高级能力（2026-10-04）

以下能力仅通过 JIDE 的实际工具暴露，不增加设置、浏览器菜单或学习菜单入口。声明来自 `model/agent/AgentMaintenanceTools.ts`，三个模式共用；`backend/agent/AgentMaintenanceTools.ets` 在页面实际注册，只负责读取和准备提案。现有确认卡展示前后值、范围及风险，执行仍由 `AgentActionExecutor` / `AgentDraftExecutor` 消费应用登记的确认，不接受模型传入确认凭证。

| 工具 | 实际能力与边界 |
| --- | --- |
| `get_advanced_settings` | collection 读取真实 Core FSRS 高级偏好和历史备份策略；study 读取本机学习操作配置，不读取凭证 |
| `propose_update_collection_preferences` | 修改负担均衡、带步骤的短期调度、每日/每周/每月备份保留数与最小间隔，单位为数量/分钟。共用 `ReviewPreferencesStore` 队列，确认时检查旧值，仅修改白名单 wire 字段，保留未知字段；不主动重排卡片 |
| `propose_update_study_controls` | 常亮、旧手势模式、实验版完整手势和键盘完整绑定。gestureConfig 支持四向滑动、双击、四区/九宫格、2/3/4 指与摇动，按卡面绑定同一学习动作目录，未绑定无操作；仅实验版可编辑和生效，简洁版保留已有配置，读工具返回 gestureInputs/gestureActions、gestureEditable/effectiveGestureConfig，确认预览展示布局、手势、卡面与动作。与“设置→复习→学习快捷键”共用校验和保存队列；keyboard 支持任意可识别物理键、精确 Ctrl/Shift/Alt、多个绑定及题目/答案面，空 bindings 禁用；旧 keys 兼容默认覆盖。评分只在答案面，系统返回不可重绑；读取同时返回 effectiveKeyboard 与共同动作目录，确认预览含卡面和组合键 |
| `propose_export_subset` | 已发现的精确 notes/cards ID 子集导出 APKG/文本，最多1000项；notes 包含兄弟卡，cards 由 Core 决定相关笔记。确认时复查卡片/笔记及关联内容，Core 导出结束后释放集合再打开保存选择器，取消不会报告已保存 |
| `propose_duplicate_note` | 已发现笔记复制为新增草稿，保留字段、标签和媒体引用；确认时检查来源和类型未变，Core 分配新身份，不复制调度/日志 |
| `propose_update_notetype_fields` | 修改 sticky、rtl、font、size、description、plainText、collapsed、excludeFromSearch 及排序字段；保留名称、顺序、身份和未知属性，展示跨牌组完整影响数量，高风险双重确认，不改变结构 |
| `propose_restore_notetype` | 调用真实 Core 标准恢复，先展示当前/目标字段与模板，明确额外字段内容及模板卡片可能删除。完整影响范围和类型 JSON 在确认时复查，受批量上限约束；禁止 normal/cloze 互换，恢复后校验标准结构、模板定义与 CSS |

写入失败、保存未确认、保存完成但应用失败、文件取消分别返回实际状态，旧提案和重复确认不能写入。大量共享类型影响 ID 留在应用侧，工具只返回完整数量。没有通用 RPC、任意配置键或文件路径权限。高级设置不存在手动入口，因此 JIDE 应引用工具能力，不能教用户寻找不存在的开关。

平台常亮及输入规则见[学习与媒体](study-media.md#jide-专用学习操作配置2026-10-04)，子集文件语义见[数据导出](import-data.md#jide-子集导出2026-10-04)。通用字段增删/改名/重排后的未保存结构渲染仍不支持，不能把标准恢复的结构说明当作该渲染能力；当前 Core 未保存模板接口仍使用已保存类型的字段结构。

验证入口：`ai-agent-maintenance.test.mjs` 直接执行 Registry、提案和确认执行器；`study-maintenance-controls.test.mjs` 检查真实平台适配和实际页面方法；真实 Core 偏好、字段属性、恢复及子集导出见 `native/rsharmony/tests/jide_maintenance.rs`。这些验证不代替真机常亮、硬件输入、ArkUI 确认布局或系统保存选择器验收。

### 软件界面认知

系统外部 APKG 打开能力通过 `get_app_structure.externalDeckOpen` 读取 `ExternalDeckOpen.EXTERNAL_DECK_OPEN_SUPPORT`，与真实接收校验及 manifest 契约共用文件格式、专用/兜底类型和确认边界，并纳入能力指纹。该字段说明接收系统授权的文件后进入导入选项，不弹文件选择器，也不允许 COLPKG 整库替换；它不授予 JIDE 任意 URI 读取或主动文件打开能力。真机候选与读取授权验收范围见[首页系统打开入口](home.md#apkg-系统打开入口)。

纯图标入口仍保留完整资源名称，`AppInterfaceItem.iconKey` 和观察中的同名字段表明实际图标资源；`get_app_structure` 同步返回图标和语义名称。设置顶栏由 `AppInterface.SETTINGS_HEADER_ITEMS` 与 `settingsHeaderItems/Controls` 同时供 UI 和 JIDE 使用，当前模式切换入口按真实 `simple_mode` 选择叶子/烧瓶；`AgentAppStructure.settingsHeader` 提供该声明，设置壳发布菜单打开态并随模式变化更新观察，观察的拷贝不丢图标。能力指纹包含顶栏声明；图标替换不增加助手操作权限。普通弹窗确认/保存/完成的勾号及保留文字的语义边界，由 UI 和 JIDE 共用 `InteractionFeedback.DIALOG_ACTION_PRESENTATION`；`get_app_structure.interactionFeedback.dialogActions` 返回图标资源名、默认呈现、文字例外原因和保留完整名称的约定，能力指纹随该声明更新。草稿、禁用、忙碌与提交仍由原宿主及真实观察负责；此呈现规则不增加未登记的弹窗操作能力。

`model/navigation/AppNavigation.ts` 是页面名称与 JIDE 导航动作的共同声明，`HomeDestinations` 用它映射真实目的地。`AgentAppStructure` 每次从页面、菜单、设置和**本轮过滤后的可用工具目录**重建 `revision`、`destinations`、`actions`；Runner 每次请求自动加入当前目录与能力指纹，恢复的旧历史不能覆盖当前版本。目录按模式、挂载能力和联网开关过滤，区别于按需加载的定义窗口；加载/移出定义不改变能力指纹。共同声明、设置项或工具协议变化都会改变指纹，无须清空会话或手工更新长期记忆。指纹不含用户实时状态，不是应用版本号或安全签名；未登记的 UI 仍不能自动发现。

`destinations.detailed` 明确区分真实页面入口与已接通的界面详情。`actions.available` 只表示当前宿主注册了导航工具，执行时还需满足前台、草稿、集合占用等条件；读到界面控件不自动得到任意点击权限。入口、显隐与状态仍从共同声明和实际观察获得，不使用另一份手写软件说明。

`get_app_structure` 默认返回界面目录，指定 `surface` 才展开条目，详细设置再传 `sectionId`。`AppInterface.ts` 共用于主页/新建/牌组搜索、牌组详情/展开/预览范围、浏览/更多/视图选项、学习/更多、JIDE/历史、提醒/编辑、统计分区和笔记新增/编辑；菜单列表、顺序与禁用判定由实际 UI 和 JIDE 共用，浏览筛选/排序直接观察 UI 真实选项。工具的 surface enum 从目录生成。`SettingsNavigation.ts`、`SettingsStructure.ts` 共同拥有设置目录、卡片顺序、名称与显隐。

应用操作教学也存放在共同界面声明中：`AppInterfaceSurface.instructionsKey` 指向当前中英文 `string.json` 的说明正文，`AgentAppStructure` 每次读取资源生成 `surfaces.instructions`，默认目录和指定界面都能读取。主页排序仅登记 `deck_reorder`，正文键为 `deck_reorder_instructions`，覆盖长按 → 选择拖动排序 → 同级/顶级拖动、本机保存范围，以及牌组详情 → 更多 → 调整牌组层级。排序的升级/降级菜单已移除，不登记该界面或操作。固定教学说明不证明排序当前打开或控件可用，仍须读取实际观察的 `enabled`。该说明属于应用自身知识，不能用 Anki 上游手册推断原生 UI，也不靠会话记忆或仅供开发者阅读的 Markdown。当前排序目录和观察回归见 `home-deck-order.test.mjs`；真实 Registry 读取中英文正文且零写入的回归见 `ai-agent-app-settings.test.mjs`。

`backend/AppInterfaceService.ets` 唯一拥有观察；组件挂载登记、Watch 更新、销毁移除，菜单关闭清理。`foregroundSurface` 来自 Navigation/NavDestination 显隐回调，迟到的旧页 hide 不清除新页；应用后台返回空值。`observations` 是挂载状态，可能属于被遮住的页面；指定 surface 只返回该界面观察。包括选中项、禁用项、忙碌、牌组名称/说明/计数、浏览模式/结果数量及学习阶段，不包含凭证或卡面正文。主页行、父牌组候选、浏览结果 ID 各最多100项，`optionsTotal` 表示总数。`coverage` 之外的目的地详情未知，空前台值表示未知/后台，不猜测像素或未登记内容。

能力来自本轮实际 `functionTools`，设置读写入口与当前声明取交集；知道入口不授予执行权限。结构与静态标签每次读取重建，不存长期记忆。默认目录只带挂载界面的选择/忙碌/总数摘要，`observationDetailsIncluded=false`；控件、选项和值在指定 surface 后展开，不修改原观察。工具清单不重复 schema/规则。

学习布局的 `smart`（智感握姿）与 UI 共用 `StudyLayout.STUDY_LAYOUT_MODES`，当前保存值由原 `AgentPreferenceReader` 读取；`study_layout` 未开放 JIDE 写入。学习观察中的 `study_layout`、`grip_availability`、`grip_side` 来自学习页和浮动栏：能力结果表示最近订阅是否可用，不能据此宣称系统开关已开启。普通闪卡、选择题/白板差异与窗口空间降级见[学习布局](study-media.md#智感握姿学习布局2026-10-04)。直接认知回归包含于 `study-grip-layout.test.mjs`。

手写白板优先使用华为 Pen Kit 完整套件，不可用或初始化失败时自动回退原版透明覆盖白板。`study_whiteboard` 共用控件目录，中英 `study_whiteboard_instructions` 说明两种引擎、原版布局与回退规则。观察中的 `engine` 区分 `huawei_pen_kit` 和 `local_canvas`：官方仅发布支持/初始化/布局/失败/缩放与宿主按钮，`initialized` 表示 SDK 回调，`layout_ready` 表示画布获得有效尺寸，`ready=true` 要求两者成立，但不表示工具栏外观或实际书写已验收；工具栏内部笔刷、颜色、笔宽、弹窗和历史未通过公开接口接入，保持 `controlsComplete=false`。原版发布真实 `fallback_reason`、笔刷选择、工具设置、历史可用性和是否有笔迹，`controlsComplete=true`，只展示当前可用的控件。回退原因区分系统能力缺失、官方不支持的已知仿真环境、上下文缺失、加载失败、Controller 创建/画布构建失败、初始化超时与 SDK 已初始化但布局未就绪的超时，不能仅据原版界面声称真机不支持，也不能以代码测试或编译成功声称官方套件实际运行成功。不能据静态说明声称可读取或修改官方内部状态。两种白板的笔迹和文字均未接入内容识别与 JIDE 工具，不能读取或判题。认知边界与真实结构生成回归见 `study-whiteboard.test.mjs`、`study-whiteboard-local.test.mjs`，实现入口见[手写白板](study-media.md#手写白板)。

JIDE 页发布当前模式、历史/对话分区、发送/停止、文件解析和输入可用状态；历史组件发布实际会话名称和选中项，提醒页发布时间/标题及独立开关，编辑组件发布真实24小时/60分钟选项与新建/编辑、保存/删除状态。历史和文件名称、提醒列表均最多100项；用户名称最多160字符，`optionsTotal` 保留总数。聊天、文件正文、错误正文和表单草稿不复制到观察，仅登记数量、长度或存在状态。提醒的占位符标签目前在忙碌时仍可点击，观察保持实际行为。

统计页遍历 `STATS_INTERFACE_SECTIONS`，显隐和难度标题由 `statsInterfaceSections` 决定；`stats_sections` 描述实际分区，`stats_<分区ID>` 由原图表组件发布真实范围选项、选中项和空数据状态，重载时保留的图表明确禁用。新增/编辑笔记发布真实字段、类型选项和保存/返回状态；字段显示复用 `NoteTypePresentation` / `NoteTypeText`，图片遮盖只列实际标题/额外输入。候选最多100项，正文、草稿和媒体 URI 不进入观察。表单与加载页分别拥有 `edit_note_form` / `edit_note`，不覆盖彼此状态。

牌组选项由 `DeckOptionsFeature` 发布 `deck_options` 的加载/错误/表单入口、目标和预设 ID、提交/FSRS 占用；`牌组选项面板` 发布 `deck_options_form` 的标题栏、预设操作、简洁模式和真实校验/忙碌状态；`presentation=page` 及 `preset_management_expanded` 对应独立全屏页与真实展开状态，管理动作只在展开后发布。`deck_options_discard` 发布真实放弃确认的取消/放弃控件。完整模式的 `deck_options_group_<id>` 从 `DeckOptionsCatalog.ts` 共用字段名称、调度器显隐及分组，真实组件发布上限范围等状态。观察不含牌组/预设名称、字段草稿或错误正文，也不将打开表单标记为已有未保存改动。FSRS 工具仍由自己的组件发布状态；帮助正文与未登记编辑器控件保留 `controlsComplete=false`。结构认知和 Core 字段修改是两条明确接通的能力，不能推断任意按钮可点击。

`titleKey` 支持页面/表单实际标题随模式变化；`controlsComplete` 只表示发布者已列全该界面的当前**声明控件**，据此将未出现的声明项标记隐藏，不声称已发现嵌套消息卡等未登记区域。部分观察不允许推断未列条目隐藏。同步指示器、媒体管理与制卡书画已有各自的真实状态发布；未登记的弹层与内部控件仍需各自 UI 状态拥有者接入，静态目录条目不等于实时观察，不维护另一份手写功能说明。

改版先改共同声明与原组件，新增页面由其状态拥有者登记；特殊锚点保留原布局和回调。`ai-agent-app-structure.test.mjs`、`ai-agent-page-awareness.test.mjs` 执行真实菜单/页面/表单观察及当前语言资源，覆盖状态变化、清理、隔离、模式、绑定和目录摘要；`ai-agent-app-settings.test.mjs` 验证真实 Registry 读取且零写入。学习/编辑生命周期等原回归通过 `app-interface-harness.mjs` 补入生产观察依赖；`agent-page-lifecycle.test.mjs` 执行真实批量保存与观察方法，验证首个进度回调前的忙碌状态、完成恢复和离页后继续已接受写入。未登记的手写 UI 不会自动被发现；HAP 与设备验收仍分别验证平台和实际展示。

- `AgentSessionContext.AGENT_IDENTITY_INSTRUCTIONS` 是助手身份的唯一提示来源，普通对话、带上下文的制卡/改卡入口和兼容制卡服务共用。只保留简短正向事实：助手 JIDE 属于记得闪卡；官网为 https://jidecards.com；应用面向 HarmonyOS、基于 Anki Core；原生界面和 AI 功能由记得闪卡实现，受益于 Anki 开源社区；助手通过应用工具协助学习与管理。身份段不含官方关系免责声明、模型与引擎对比、固定自我介绍示例或额外的说话约束。
- 产品与上游事实以[项目说明](../../README.md)和 [UPSTREAM.lock](../../UPSTREAM.lock) 为依据：记得闪卡基于 Anki Rust Core 的集合、模板渲染、调度和同步基础，提供 HarmonyOS 原生界面与应用内 AI 工具，受益于上游作者和开源社区贡献。
- 每轮按当前宿主生成系统指令，包括旧历史恢复后的继续和 Runner 的工具接续；旧回复里的“Anki 助手”仅保留为历史数据，不能覆盖当前身份。回归见 `ai-agent-v2-runtime.test.mjs` 与 `ai-agent-notetype-foundation.test.mjs`，执行真实提示构建与 Runner/Session 接续；提示注入正确不等于真实模型一定按要求表述。

图片和视频附件共用原图片图标与 `NOTE_FIELD_MEDIA_TOOLS` 的能力声明；`note_visual_manage` 的中英文教学及真实草稿观察由管理弹层拥有，包含分类数量、忙碌、错误与替换/删除可用性。原生视频播放控制未接入 JIDE；已有图片/视频内容通过下述资料读取工具接通，观察如实保留 `controlsComplete=false`，不把界面知识解释为自动选取/播放能力。当前源码与回归入口见[媒体管理](browser-stats.md#编辑媒体预览与独立管理2026-10-01)。

制卡书画入口和图片笔形动作由同一媒体观察发布，`note_drawing_editor` 登记共同操作说明及真实引擎、文字数量/选择、字形选框模式、实际八方向缩放手柄、忙碌、错误和工具可用性。手柄列表与 UI 共用 `DRAWING_TEXT_HANDLES`，操作说明跟随共同资源。文字、图片、笔迹与文件路径不进入认知；SDK 内部工具及直接画布操作未接通执行，保持 `controlsComplete=false`。保存为可再次编辑的 PNG 属于用户媒体草稿，不是 JIDE 内容读取权限；回归与边界见[制卡图片书画](browser-stats.md#制卡图片书画2026-10-09)。

### 软件升级时的认知同步

软件更新后，JIDE 从当前共同声明、工具和真实状态生成认知，旧会话继续也使用当前运行代码。编程 Agent 的接入责任、设置开发步骤及漏登记检查统一见[软件升级时的认知同步](coding-agent.md#软件升级时的认知同步)。任意手写 UI 仍需开发接入，不承诺运行时自动理解全部新界面。

### 自动页面操作

`navigate_app` 的动作及必需/可选参数由 `AppNavigation.APP_NAVIGATION_ACTIONS` 唯一声明；参数校验、工具 action enum/参数说明和 `get_app_structure.actions.requiredArguments/optionalArguments` 同时从它生成。后续改动这份声明即可更新 JIDE 的当前认知和工具契约，不维护另一份动作参数表。每轮 Provider 接续仍重新生成当前目录和能力指纹，恢复旧会话也使用新代码的声明。

`actions.available` 保留“导航工具已注册”的含义；`executionState` / `blockedReason` 每次结构读取调用当前 Session，从宿主前台、占用、导航栈和本轮排队事实重算。`ready` 仅表示已知宿主检查通过，真实目标、用户意图和最终执行仍另行验证；`blocked` 附阻止原因，未提供完整宿主事实为 `unknown`，工具未接通为 `unavailable`。动态忙碌不改变能力指纹；共同声明、参数或真实工具变化会改变指纹。读取就绪状态不查询卡库目标、不消耗导航许可、不执行动作。

现有动作包括 `start_study`、`open_browser`、`open_settings`、`open_stats`、`open_reminders`、`open_add_note`、`open_home`、`open_edit_note`、`open_card_preview`、`open_deck_details`、`open_deck_options`。开始学习、添加笔记和牌组详情/选项需要会话已发现的真实 `deckId`；浏览可指定牌组、搜索和笔记模式，牌组搜索由 `did:<ID>` 与用户查询组合，避免仅传页面 deckId 却未限定结果。设置通过 `sectionId` 展开当前模式可见的分组，复用设置面板的 `openSection`，不写设置。

打开编辑需要 `search_notes` 等已发现的 `noteId`，只把 ID 交给原 `EditNotePage`；用户手动修改和保存继续由原页面拥有。卡片预览需要已发现的 `cardId`，通过 `cid:<ID>` 和 `initialPreviewCardId` 进入原浏览预览，不复制预览页面、不调用复习评分；初始搜索失败、目标不在结果、模式改变、读取过期或页面销毁时不会自动打开预览。返回首页复用根 Navigation 清栈与首页刷新；下层存在编辑/新增表单时拒绝清栈，保留用户输入。

牌组详情复用首页 `选择牌组`，展开父级路径并保留原选择记忆；手机打开原详情层，宽屏选择已有详情区域。牌组选项清栈后进入共同目录登记的独立 `DeckOptionsPage`，由原 `DeckOptionsFeature` 持有表单和退出保护，只导航，不改配置或保存。根宿主在副作用前核对首页快照目标和已有选项表单/占用，目标尚未进入首页快照或已有选项表单时拒绝切换。所有 `resetsStack=true` 动作通过共同的 `appNavigationStackBlockReason` 保护下层编辑/新增/牌组选项表单，Session 与首页使用同一规则。异步读取前后均重查模式和栈，避免读取期间条件改变后仍排队/执行。

`AgentAppNavigationSession` 独占当前 JIDE 页的一次性导航队列与读取代次；Registry 用独立的 `navigation` 类别注册，不能伪装成只读、卡库草稿或确认动作。只根据当前新用户消息的导航/开始学习意图接受请求；介绍用法、历史/附件、取消和自动恢复接续不能独立触发导航。一轮只接受一个目的地，`queued/completed=false` 表示排队而非已进入页面。成功回复保存历史后，页面才执行队列；模型失败、预算暂停、等待确认/澄清、取消、被遮住或离页会丢弃请求。

接受与执行均检查页面可见、应用前台、文件解析/目标弹窗/确认内容及卡库占用；回复期间新输入的未发送消息也阻止跳转。牌组/笔记/卡片 ID 必须在只读 Scope 内，`readNavigationTarget` 两次读取真实对象，不把正文写进导航结果，也不提升写入权限；牌组删除后拒绝执行，改名后使用当前名称。旧轮次收尾不能消费新轮次队列。首页是 Navigation 唯一执行宿主，经类型化回调接收语义意图，保留返回后的数据刷新，不把页面实例或 NavPathStack 交给后端工具。已有学习页时拒绝再建学习会话；开始学习只进入原学习页，队列、每日限额、完成判定和评分继续由 `StudySessionController` / Anki Core 拥有。

主机回归：`ai-agent-navigation.test.mjs` 直接执行 Session、Registry、平台适配器、真实首页导航/牌组选择及隐藏回调，并覆盖逐动作就绪状态、异步模式/栈变化、宽窄屏分支、浏览初始搜索、未发送输入、声明变化后的指纹/参数更新；`ai-agent-app-settings.test.mjs` 验证真实结构工具读到变化且零写入，`ai-agent-page-awareness.test.mjs` 执行牌组选项加载会话及原表单观察，覆盖校验、忙碌、嵌套遮挡和退出后的迟到回调。`ai-agent-v2-runtime.test.mjs` 用真实 Runner/Session/Registry 发现牌组、笔记和卡片并完成工具接续，`home-composition.test.mjs` 验证页面路由都映射真实页面及参数。新增动作必须接通根宿主分支，现有逐声明行为回归会拦截缺失分支；新增页面同时接入 `HomeDestinations` 和自己的界面观察。未登记 UI 不会自动被发现，任意按钮、评分、删除、同步、表单保存没有获得通用点击权限。真实模型规划、Navigation 动画及设备交互须单独验收。边界选择见[导航决策](../decisions/2026-10-03-agent-app-navigation.md)。

## 统一 AI 对话入口

- 回复期间输入框可继续编辑下一条消息，发送按钮仍显示停止；本轮请求在发送时取得快照并清空已发送草稿，回复完成不清空随后输入的内容。等待澄清时仍使用既有澄清入口。
- 首页新建牌组菜单移除 AI 制卡和 AI 改卡；统计卡旁的独立纯图标 JIDE 按钮打开对话，更多菜单不再包含 JIDE，仍遵循已有开发者开关、同步等待和配置预检。该入口以 `assistant` 模式打开既有 `AiCardPage`，对话区为空，不默认选择目标或先选制卡/改卡模式。牌组详情、浏览和学习页保留带上下文的既有快捷操作。
- `assistant` 在同一 Runner/Registry 注册制卡、改卡和读取工具；普通聊天不要求草稿。素材、目的不明确时使用既有澄清；缺少制卡目标时 `request_create_target` 通过澄清暂停协议弹出已有 `DialogFrame` / `AgentSetupCard`。模型只提供问题，不提供选择框候选 ID，页面读取真实牌组和笔记类型。
- 用户确认选择后经既有 `configure_create_target` 校验真实目标，再接续同一会话。关闭选择框恢复此前目标，不持久化未确认的选择；“新建笔记类型”清空类型后让 Agent 提案，经既有确认执行器创建并取得真实 ID。改卡复用 `list_notetypes`、`search_cards` / `search_notes`、`get_note_context` 和改卡草稿；制卡与改卡继续使用原有预览及写入确认。
- 统一入口的历史列表可读取已有制卡/改卡会话，带上下文入口仍按原模式筛选。直接回归见 `ai-agent-v2-runtime.test.mjs`、`agent-history-coordinator.test.mjs` 与 `ai-agent-entry-contract.test.mjs`；模拟模型工具序列验证实际工具和接续逻辑，不代表真实模型决策质量或设备布局已验收。
- 2026-10-01 验收：完整 `npm run verify` 通过（1772 项 Node 测试、原生/沙箱/RPC 门禁、clean 签名 HAP，既有警告 268、新增 0）。SLG-W50 平板覆盖安装成功，原有牌组可见；设备确认新建菜单移除两个旧入口、“更多”只有一个“AI”、进入为空白对话且输入栏可用。本次未向真实模型发送验收请求，目标接续、建类型和改卡预览数据由实际 Runner/Registry 行为回归验证。模拟器因签名身份不一致拒绝覆盖，本次不计入统一界面的设备验收。

## JIDE 空会话提示

- 统一 `assistant` 入口在消息为空时显示 `components/agent/AgentEmptySuggestions.ets`；有消息或打开历史后卸载。制卡/改卡的目标配置保持原入口。页面只提供 NavDestination 可见状态和纯建议读取回调，组件拥有轮换、手势、剪贴板及计时器释放，不发送请求、不填写输入框。
- `model/agent/AgentSuggestions.ts` 交错轮换十类、共60条本地化建议，中英文内容在资源中。每条停留10秒，300ms淡出后切换并淡入；首次随机起点，完整循环前不重复。文案覆盖已接通的设置、学习统计、资料识别、制卡改卡、类型外观与偏好记忆，按用户要求排除联网搜索、网页读取和在线配图。
- 中央仅显示一句文字；中文显示包裹“”引号，英文使用对应双引号，显示格式归本地化资源。长按500ms复制不含装饰引号的完整原句，方便直接作为请求发送；成功提示“已复制”，失败使用已有复制失败提示。按住、鼠标悬停、复制中或目的地隐藏时取消轮换及切换任务，恢复后重新停留10秒；卸载与代次校验阻止迟到任务修改文案。
- 组件居中于顶栏和输入区之间的剩余区域，水平留白由组件独占20vp，文字最多560vp、随窄屏换行，不叠加消息流内边距。上下安全区仍由现有顶栏/输入区拥有；键盘RESIZE时在剩余空间重新居中。提示使用主题文字色，辅助复制说明仅供无障碍读取。
- 验证入口：`tools/tests/agent-suggestions.test.mjs` 执行组件真实计时、复制与销毁逻辑，校验60条中英文覆盖和联网文案排除；ArkUI观察更新、宽窄屏/深浅色、键盘、长按和悬停的最终效果须另做设备验收。

### 当前场景与主动建议

`model/agent/AgentAppRecommendations.ts` 是建议声明、条件和能力筛选的唯一入口。`buildAgentAppRecommendations` 只消费实际工具及已登记 UI 观察，同用于 `get_app_structure.recommendations` 和空会话提示，不请求模型、扫描卡面或读取数据库。`AppInterfaceTracker` 独占最近非 JIDE 页的 `contextPage`：页面隐藏保留上下文，销毁时 `leave` 清除；前台不是 JIDE 时只使用真正的当前页。返回的 `contextSurface` 说明进入助手前的页面，不把隐藏页面当成前台。未知/后台不生成建议。

建议至多三条，附 `sourceSurface`、`contextSurface`、有限数值 `evidence`、`requiredTools` 和可选导航 `action`。附件只登记数量；牌组名、说明、正文、草稿和凭证不复制进建议。首页需牌组详情与首页选中 ID 一致且计数有效；学习读取实际 question/answer/done，浏览只在 list 阶段判断空结果。忙碌、错误、缺失和非法数字不伪装成零。已有学习/新增/编辑页时不推荐再开学习。零剩余仅建议核对统计和选项，不推断到期状态、调度结果或每日限额原因。

工具缺失时移除相关建议，导航动作还需存在于 `APP_NAVIGATION_ACTIONS`。建议目录参与能力指纹，当前工具与声明变化会刷新指纹，用户计数不参与。建议不是用户命令、发现 ID 或授权；后续执行仍先发现真实对象，服从原 Scope、导航和确认边界。`AgentSessionContext` 让 JIDE 在用户询问下一步时读取当前结构；只有帮助本次目标时才补充一条建议，不必每轮推荐，已拒绝方向由当前对话约束。提示规则不保证真实模型一定采纳。

空会话有场景建议时从它们开始，再接原60条通用提示；显示/重新进入和轮播切换时重新读取，不新增计时器或订阅。按住、悬停、复制及隐藏仍暂停切换，长按复制当前本地化请求。最多在下一次轮播切换更新场景，通用文案保留原入口。

新增场景：先让实际 UI 状态拥有者发布必要语义事实，再在 `AGENT_APP_RECOMMENDATIONS` 登记所需工具与资源键，并在同文件条件分支消费这些事实；无需新增工具、后端注册或页面业务分支。中英文资源同步，行为回归在 `ai-agent-app-recommendations.test.mjs`；该测试执行真实牌组详情发布者、目录变化与上下文释放，`ai-agent-app-settings.test.mjs` 执行真实 Registry 零写入读取，`agent-suggestions.test.mjs` 执行显示/刷新/复制生命周期。未登记界面仍需接入原观察入口，不能声称自动识别全部手写 UI。

本轮场景建议验收：`npm test -- agent`、资源/文档/架构/公共边界/组件字段检查及 `npm run build:app -- -SkipRust` 通过，增量警告门禁新增为零。原生源码未由本任务改动，复用已构建的双架构静态库；主机回归不证明真实模型会采纳建议，也不代替设备的 NavDestination 回调顺序、主题/尺寸、附件解析后提示刷新和长按体验。未安装设备、未调用真实提供商、未执行全库集成验收。

## 学习概览与复习负担

- `get_learning_overview` 在 assistant/create/edit 共用读取目录、Schema 和 `CardAgentTools` 注册，参数为 `query`（最多2000字符，空串表示全库）、`days`（含今天1–90天）、`forecastDays`（含今天1–30天）。与搜索工具一致，生成目标不限制读取，结果回传实际 query；不登记发现 ID、不推进正文读取计数、不授予写入或分析许可。
- 统计来自既有 `统计服务.获取图表统计` / Anki Core；请求历史回看 `max(1, days-1)`，避免一天请求误用 `0=全部历史`。`AgentLearningOverview` 复用 `DeckStudyHistory` 的负历史日桶聚合与 `StatsOverview.dueOverview` 的积压口径，不另算调度；首页仍默认七天。窗口最多返回90个历史日和30个预测日，Map 转为有界数组。
- history 是答题事件次数及毫秒耗时，按集合 rolloverHour 划分学习日，不是不同卡片数量。卡片状态保留含/不含 inactive 两种 Core 口径；它们和记忆率是当前快照，不受历史天数限定。无 FSRS 或无记忆状态卡片时平均记忆率为 null；有数据的0%保留为0。
- forecast 的 dueThroughToday 已含 overdue；scheduledInWindow 只合计今天至预测窗口末日，不含积压。预测未应用新卡/复习每日限额，不能当作实际可学队列；解释限额时读取 `get_deck_options`。缺少可选统计保留 null，缺少历史次数/耗时则失败，不虚报零或成功。
- 快速验证：`npm test -- agent`；直接行为回归 [ai-agent-learning-overview.test.mjs](../../tools/tests/ai-agent-learning-overview.test.mjs) 覆盖真实 protobuf 负日桶、聚合边界、Schema、Registry、Scope、失败及无授权提升；首页共用回归 [deck-study-history.test.mjs](../../tools/tests/deck-study-history.test.mjs)。Node 不证明真实模型调用或设备统计，完整构建与设备验收独立记录。

## 应用设置读取与修改

- `model/agent/AgentSettingsTools.ts` 声明设置目录、参数与示例；`backend/agent/AgentAppSettingsTools.ets` 注册真实工具。助手、制卡、改卡共用 `list_settings`、`get_settings`、`get_deck_options`、`list_theme_colors`，以及已有深浅色切换和主题色/FSRS 修改提案。目录只展示实际已接通能力，新读取项追加目录即可，不为每个开关新增工具。
- `get_settings` 的支持项由 `AgentSettingsTools.agentSettingDefinitions()` 生成：深浅色、系统颜色、主题色、全库 FSRS、简洁模式、首页今日进度、触觉反馈、卡片字号、牌组列表宽度、学习布局、主题背景动效与动效风格、自动备份、自动同步、媒体同步及待同步状态、统计小时/历史窗口、语言、学习快捷操作和图表偏好。语义 ID 与范围来自目录；持久化键和默认值白名单在 `AgentPreferenceSettings.ts`，平台只读适配在 `AgentPreferenceReader.ets`。默认值仅用于不存在的保存项，IO/类型失败上抛；不枚举任意 preference/RPC，不返回密钥、同步凭证或兑换码。偏好不等于设备能力、已登录、备份数量或正在同步，跨项读取也不是事务快照。
- 幻彩启动提醒、锁定领赠弹窗、速览宣传及兑换庆祝已移除；JIDE 没有这些弹窗的入口或操作声明。主题目录、当前权益可用状态与原兑换边界仍由既有入口提供，不把弹窗移除当作主题已解锁。
- 主题读取区分持久化 `themeMode/colorTheme`、内存 `activeMode/activeColorTheme` 与实际 `effectiveDark`；`list_theme_colors` 返回合法 ID、种子色及当前权益可用状态。快捷操作共用设置页的兼容解析与保存队列，读取不广播 UI；图表偏好来自 Core。`graph_preferences` 写入只接受 `calendarFirstDayOfWeek`、`cardCountsSeparateInactive`、`futureDueShowBacklog` 三项完整 JSON；读取附带的 `browserLinksSupported` 是只读能力，提案和执行校验均拒绝提交该字段。`GraphPreferencesCommands` 的共享队列仅比较三项可写偏好，发送 Core 请求时保留最新能力值，避免部分保存后误报失败。
- `get_deck_options` 由 Scope 校验真实 ID；保留共享预设使用数量、牌组零限额、今日覆盖开关、父预设 ID 与全局 FSRS。`AgentDeckSettings.ts` 明确列出全部公开预设字段，包含学习/重学步骤、FSRS 参数/保留率、调度顺序/间隔/限额、兄弟卡埋藏、音频、计时器和自动推进；未知原始字节不发送。数组最多 64 项、文字最多 2000 字符，`truncatedFields` 明确标记局部结果。不能把预设上限称为今日实际排程数量，也不推断调度算法。
- `propose_update_deck_options` 在助手、制卡、改卡共用真实注册，字段白名单由 `DeckOptionsCatalog.ts` 生成；`AgentDeckOptionsDraft.ets` 与 UI 共用字段编辑、校验和草稿构造。JIDE 先读取已发现的牌组，给出前后值、共享预设数量和作用范围；应用确认后经 `AgentDeckOptionsTools.ets` → `DeckOptionsSession` → `AnkiDeckOptions` 直接保存 Core，无需手动跳转。`preset` 修改共享预设，`deck` 在默认或共享预设字段变化时克隆；手动牌组选项同样默认单牌组隔离，完整模式的作用范围入口与真实 `save_scope` / `preset_use_count` 由 `AppInterface` 发布；牌组/今日覆盖只作用于当前牌组，全局开关在两种范围下都影响全库。简洁模式隐藏字段不影响这项已接通能力。
- JIDE 参数使用 Core 单位：保持率为小数，SM-2 易度/倍率为倍数，步骤支持 s/m/h/d 或分钟，轻松日按周一至周日提交七个 0/0.5/1；未编辑的原有轻松日中间值仍保留。空覆盖清除，零每日限额禁用。确认执行核对登记载荷、真实配置指纹，并在共享队列内提交前重新读取；过期、篡改、重复确认或保存失败不能报告成功。只有执行结果 `completed` 且 `saved=true` 才可声称保存。未知协议字段保留在应用内，不给模型；工具不接受原始 RPC、自定义调度脚本或预设删除。
- `get_deck_options.customScheduling` 来自真实集合配置和 `CustomScheduling.ts` 共同能力声明，报告是否配置、同步运行时、异步限制、脚本大小上限和 Agent 写入边界；UI 完整模式可编辑脚本，JIDE 写入白名单继续排除 `script`。实际失败面板报告支持状态、执行失败和用户可选动作。执行与直接回归见[自定义调度](../decisions/2026-10-07-custom-scheduling.md)。
- 确认卡显示目标牌组、预设及共享范围，保持率使用百分比，开关和枚举使用共同目录的本地化名称，轻松日逐星期显示最低/减少/正常，清除显示未设置；确认展示不改变登记的 Core 参数。`ai-agent-deck-options.test.mjs` 执行真实 Registry、确认执行器、会话及请求编解码，覆盖 SM-2 轻松日、单牌组克隆、零限额/清除、全局范围、未知字段保留、过期及失败。Core 在该测试中是注入边界，测试不证明设备保存或真实模型规划；HAP 和设备验收单独记录。升级依据及门禁见[牌组选项与 Core 升级](browser-stats.md#牌组选项与-core-升级)。
- `propose_set_theme_color` 与 `propose_set_fsrs` 风险为 `write`，只生成 `setting_change` 动作。确认卡复用 `AgentActionCard`，显示前后值和范围；FSRS 开启说明全库重新调度，关闭不恢复原排程。`AgentActionExecutor` 消费登记的同一载荷，再校验设置 ID/类型及原值，主题权益在提交时重查。过期、篡改、重复确认失败；失败后的新提案须先重新读取，不盲目重试。
- `propose_set_setting` 在 assistant/create/edit 共用一个严格工具，只支持 `AgentPreferenceSettings.agentWritablePreferenceIds()` 中已接通的设置：`card_text_size`（50–200 的整数百分比）、`deck_list_style`（single_wide / single_narrow / double_wide / double_narrow）、`study_haptics`（开关）和 `motion_style`（restrained 克制 / lively 灵动，两档均无翻卡动画，与动态背景和震动独立）。参数 `value` 使用规范字符串，例如 `"130"`、`"true"`；同时支持简洁模式、首页进度、学习布局、主题背景动效、自动备份/同步、媒体同步、统计窗口、语言、快捷操作和图表偏好；只有系统颜色和待同步状态是只读观察。它读取当前值后生成既有 `setting_change`，确认卡显示共同资源的本地化名称、选项、前后值及本机范围，确认前零写入。
- 本机修改复用设置页的 `saveCardTextSize`、`saveDeckListStyle`、`saveStudyHaptics` 和 `saveMotionStyle`。`utils/LocalPreferenceWrite.ets` 拥有这些键的共享串行队列，保存函数接受可选原值；确认执行在队列内重查原值，同状态不落盘，flush 与回读成功后才广播。助手读取等待已接受的保存。字号控件订阅公共值，学习/预览、牌组列表和触感继续消费既有 AppStorage 键；不改模板、调度或设备振动能力。牌组样式从旧宽窄键迁移，当前值与写入共用唯一存储入口；双列隐藏牌组计数，所有牌组名称允许两行，单/双列同密度等高，窄版仅在原字号名称需要两行且有描述时缩小字号，窄样式保留页面密度联动。`AgentPreferenceSettings` 的真实设置描述同步该规则，设置读取及确认仍消费原值与入口。
- 本机偏好结果区分 `saved/applied`：保存未确认或回读失败返回 `partial, saved=false`，已确认保存但广播失败返回 `partial, saved=true, applied=false`；只恢复偏好缓存，不声称磁盘已回滚。失败确认已消费，须重新读取再提案。`ai-agent-app-settings.test.mjs` 执行真实 Registry、读取适配、确认执行器及已接通保存入口；`ai-agent-local-preference-write.test.mjs` 覆盖手动写入与确认的竞争、读取等待和回读失败。Node 不证明真实模型选择工具、ArkUI 观察更新或设备交互，需独立验收。
- `AppThemeService` 的 `ThemeColorSession` 是设置页与助手共用的串行保存/回读/应用入口，深浅色与主题色使用不同键并在应用时读取另一维度；结果区分 `saved/applied/completed/partial`，部分成功保留失败状态。全库 FSRS 共用 `FSRS控制器.ets` 的串行变更入口，保留其余配置与未知协议字节，保存后回读、通知页面；同状态请求不写入、不重排。后台初始化与手动/助手切换共用队列。
- `set_theme_mode` 风险为 `setting_write`，不能注册为 read、普通草稿或卡库写入。明确切换指令来自页面传入的本轮原始用户意图，不扫描模板、附件、记忆或 Provider 上下文。许可仅本轮一次使用；问题、否定、引用和卡片模板请求不授予直接写入。历史恢复、暂停继续和旧澄清回放不恢复许可；识别不到时要求明确切换命令。
- `backend/AppThemeService.ets` 拥有共享 `ThemeModeSession`。设置页与助手共用串行保存、回读、应用资源主题、广播色板与桌面推送入口；已接受设置不随离页取消。各页面通过 `themeMode` 订阅当前模式。启动读取仍可回退，修改与助手读取采用严格存储接口。
- 结果区分 `saved`、`applied` 和 `completed/partial`。未确认保存时不应用主题、不声称回滚；应用失败时明确偏好已保存。系统栏与桌面推送是尽力同步，结果不保证桌面卡片已经刷新。主题反馈及原生撤销按钮归属执行 `set_theme_mode` 的那条回复，不放在输入区、不复制到后续聊天；撤销结果也更新同一气泡，并以会话/消息 ID 防止迟到结果污染新会话。凭据仅在当前进程有效，后续助手主题修改会移除旧气泡的撤销按钮，其他公共主题修改仍由撤销前的共享队列与持久化回读校验。历史只展示审计，不恢复按钮或授权。
- 新能力采用最小契约：明确业务意图、输入类型和范围、读取/会话/持久化效果、目标及共享影响、授权策略、真实结果和错误、唯一业务入口及行为测试。定义由领域维护并汇总到既有工具目录；统一调用语义，不统一所有领域的载荷或确认执行器。
- 回归：`ai-agent-app-settings.test.mjs`、`ai-agent-preference-reader.test.mjs`、`ai-agent-fsrs-controller.test.mjs`、`theme-color-session.test.mjs` 与 `theme-mode-session.test.mjs` 执行真实队列、存储适配、Registry 与确认执行器，覆盖只读目录、边界截断、权限、确认前零写入、篡改/重复/过期确认、同状态无重排、持久化/应用失败与撤销冲突。Node 不证明 ArkUI 观察和实际系统主题；HAP 与设备范围分别记录。决策见 [设置能力与 Agent-first](../decisions/2026-10-01-agent-app-settings.md)。

## 闪卡外观与共享模板

多牌组删除的独立入口见 [多牌组删除](#多牌组删除)，不沿用共享模板只接受一个笔记类型的限制。

- 生成目标只是默认设置，不是硬性题型约束。Agent 在生成前判断内容与真实模板是否匹配；普通多行知识解释/富文本优先普通字段显示，输入练习才使用 `{{type:字段}}`，填空依赖 Core 声明的 cloze 字段。用户明确指定类型时尊重指定，冲突才澄清，不擅改现有共享模板。
- `NotetypeMessages` 从 Core protobuf 解码模板 ord/name/q_format/a_format；`获取笔记类型能力` 和任务配置携带 `templateCount`、`templatePreviews`，系统策略只提供数量及读取规则，不把不可信模板原文写进系统指令。预览最多 4 个模板，每面最多 500 字符，`truncated` 标记单模板截断；预览缺失或数量不足时用既有 `get_notetype_details` 分页检查，不按本地化名称或 normal/cloze 二分猜测输入行为。没有新增 RPC，也没有改 Anki 渲染语义。
- 不合适时 Agent 可以 `list_notetypes` → `get_note_type_capabilities` → `configure_create_target` 主动切换已有类型；无合适类型才 `propose_create_note_type`。新建仍必须确认执行得到真实 ID 后才能制卡；切换目标只影响后续草稿，不转换旧笔记。默认选择与已有牌组偏好保持不变。回归覆盖改名的输入模板、混合模板、有界预览、真实目标切换与确认后建卡；模拟模型工具序列不代表真实模型决策质量已验收。

- `AgentToolCatalog.ts` 在制卡、改卡两种模式都声明 `propose_update_card_style` 和 `propose_update_note_type_templates`；页面始终调用 `HighRiskAgentTools.register(registry, mode)`。删除、变更类型等其他高风险工具仍只在改卡注册。工具声明和实际 Registry 执行由 `ai-agent-style-runtime.test.mjs` 联合验证。
- 简单外观走 `AgentCardStyle.ts`：背景、文字和深色颜色只接受 `#RRGGBB`，字号、行距、对齐有明确边界。补丁只替换应用自己的样式块，保留外部 CSS、脚本、模板及类型元数据；重复修改保留上次未提及的属性。新建类型的 `propose_create_note_type.style` 复用同一实现。内部元素自带颜色/背景仍可能覆盖继承值，不承诺改写任意导入模板的所有元素。
- 原模板工具兼容原参数，`templateJson`/`css` 改为至少提交一个，省略部分保留原值，显式空 CSS 表示清空。模板数组须非空且包含有效名称、正反面与原始 ord（新模板可用 null）；不能把 `[]` 当“保持模板”的占位符。
- `AgentNotetypeImpact.ets` 用锁定 Core 支持的 `mid:<id>` 搜索一次笔记、一次卡片，计算跨牌组的完整影响；不按名称通配、不逐笔记发 RPC。纯 CSS 更新是一次共享类型写入，不受逐卡 batchLimit/1000 张上限约束；真正模板变更仍保留原上限。两者均是高风险草稿，保留原确认协议，不能自动保存。
- `AgentDraftExecutor` 在准备及执行时同时核对原类型 JSON 与完整受影响 ID 集合；卡片新增/删除或模板变化均使确认失效。写入后回读 CSS，未验证保存结果不报告成功。读回失败时可能已经写入，不能声称已回滚。
- `AgentStylePreview.ets` 为新建类型和外观草稿提供同一配色/排版示意；实际模板内部样式仍保留，示意不是整张卡的渲染截图。历史的纯 CSS 草稿没有结构化示意，仍显示原有差异信息。
- 高风险提案只在成功生成后登记 draftId；失败可用同一 ID 重试，成功 ID 不可重复。共享类型操作的执行重试保留原完整影响范围。Registry 只把共享模板草稿 ID、摘要、类型 ID 和数量返回模型，完整受影响 ID 集合仍在应用草稿中。Runner 区分 `failureStage=arguments/execution`，保留真实参数字段、后端 message/nativeStatus/kind/context，诊断文本统一脱敏；执行失败不再统一要求模型重写参数。空 receivedKeys 不能被解释为未收到调用，缩短 CSS 不能解决集合/范围/后端异常。
- 回归：`npm test -- agent`；`ai-agent-style-runtime.test.mjs` 覆盖 2507 张卡、两种模式、确认、失败重试、影响变化和回读；`ai-agent-runner-contract.test.mjs` 覆盖错误原因传回模型。真实 CSS 层叠使用 `node --experimental-transform-types --import ./tools/tests/register-ts-hook.mjs tools/test-card-colors-browser.mjs`（本机需 Playwright，可通过 `PLAYWRIGHT_MODULE` 指定模块）。HAP 和设备验证仍按验证入口执行。

## Agent 过程展示

2026-10-01 验收范围：完整 `npm run verify` 通过，包含真实三参数滚动回归与签名 HAP；思考滚动修复包已保留数据覆盖安装到 SLG-W50 并重启。实际设备已确认“更多”的 JIDE 入口与页面标题、七列表格的独立单元格及横向滑动、精简身份段产生的回复。新笔记类型确认卡的最终外观，以及修复后长思考的来回翻阅和流式阅读位置，由用户接手真机验收；编程 Agent 按用户要求停止平板操作，不将逻辑测试或安装成功记作这些手势已验收。

思考区与整页的原生 `Scroll.onDidScroll` 必须完整接收 `(xOffset, yOffset, scrollState)`，以第二个参数判断纵向阅读方向，不能把横向偏移或纵向数值当作滚动状态。用户向上翻阅时清除两层待执行的跟随任务，并通过 `onReadingOlder` 暂停宿主整页跟随；实际向下滚回思考末尾时组件通过 `onFollowingLatest` 通知宿主，只有最新回复且整页仍在末尾才恢复整页跟随，不能让历史思考区拉走当前阅读位置。整页实际向下滚回末尾也恢复整页跟随；水平和 Idle 控制器帧不改变用户阅读意图。嵌套滚动双向 SELF_FIRST，先滚思考内容，再由外层接续边界手势。`ai-agent-process-ui.test.mjs` 执行组件与页面的真实非渲染方法，覆盖两层暂停/恢复、旧回复、页面释放和真实三参数元组。

整页与思考区共用 `model/ScrollTailFollower.ts`，统一拥有跟随状态、合并任务、暂停/恢复与释放；宿主只提供滚动回调、当前可见性和原生手势事实，各实例独立，旧任务在取消后不得滚动或覆盖新任务。它与 `ExpansionReveal.ets` 分别负责持续跟随和展开后单次滚动：牌组详情“更多”与添加笔记“高级/标签”继续共用后者。公共行为回归见 `ui-shell-scroll-follow.test.mjs`，宿主接线回归见 `ai-agent-process-ui.test.mjs` 与 `ai-agent-timeline.test.mjs`。

整页跟随由 `AI制卡页.ets` 的 `更新消息` 唯一状态回写入口触发：最新消息的正文、思考、工具参数、行动状态、草稿预览和结束状态更新都排入同一个50ms合并任务；内容高度变化作为布局后的补充触发。思考区内部以32ms合并追加更新。不能只依赖 `onAreaChange`，思考区达到200vp限高或工具仅改变状态时外层高度可能不变。暂停后状态继续更新但不排滚动任务，历史消息修改也不触发整页跟随。逻辑测试与签名 HAP 不证明真机布局时机，流式思考、连续行动、上翻及回到底部的实际手势仍由用户验收。

AI 正文统一经 `components/agent/AgentMarkdownText.ets` 显示，顺序时间线与旧历史共用入口；图片仍由原 `agentContentParts` 按正文位置分段。`model/agent/AgentMarkdown.ts` 只解析管道表格，支持表头、列对齐、转义管道、代码片段中的管道、缺列流式行和多段表格；不完整分隔行、代码块和 HTML 保留为文字。文字与单元格复用 `AgentTextFormatting` 加粗规则，不执行回复中的 HTML。无公式内容使用原生文字/横向 Scroll，含公式的整段文字与表格共用一个离线文档，详见下文公式入口。稳定身份与当前组件状态引用保持流式更新，不靠内容长度重挂载。此入口不声称支持完整 Markdown。

JIDE 无公式正文与表格单元格在 `AgentMarkdownText` 的统一 Text 入口设置 `CopyOptions.LocalDevice`，无公式思考、用户消息及旧历史来源文字同样支持系统长按选择复制。原生表格按单元格选择；含公式整段文档使用 ArkWeb 的文本选择。构建与既有 Agent/UI 回归不替代真机长按、选区拖动及流式更新时的选区体验；本次具体平板操作由用户验收。

辅助提案 `AgentActionCard` 使用 surface_card 与明确的主题文字色。新笔记类型展示名称、问答/填空类型、有序字段和正反面布局；布局复用 `AgentStylePreview` 的内容插槽，填空示意区分隐藏与答案，背面保留正面及补充字段，与 `AgentNotetypeDesign` 的模板语义对应。预览只展示字段占位，不写入类型。确认复用 `PrimaryActionButton`，取消复用支持 `fillWidth` 的 `按下态按钮`，纵向满宽避免窄屏长文案挤压；公共按钮和提案入口均守卫禁用状态，非 pending 动作不触发确认/取消。解析、流式状态和动作守卫回归见 `ai-agent-markdown-ui.test.mjs`；实际文字换行、横向手势与外观须另做设备验收。

澄清选项由 `AgentClarificationCard.ets` 统一呈现：原生 Radio、标题和说明组成整行点击区，固定2vp边框与20vp标记，选中不改变几何；推荐不等于默认选中，仍需显式继续。选项内边距10vp由行拥有，行间距10vp由问题容器拥有；长文本自然换行。继续复用 `PrimaryActionButton`，状态和提交仍由页面负责。Agent 补充说明和消息输入共用 `FormTextAreaStyle`；制卡字段和普通改字段草稿直接复用 `NoteFieldEditor`，保留粗体、荧光、字号、标题和换行的可视编辑、源码回退及 HTML 序列化，不另建富文本解析或写入入口。已保存/忙碌卡片和非 pending 变更不可编辑。输入内部四边10vp，消息输入高度仍等于右侧两个按钮及其8vp间隔。回归入口 `ai-agent-form-controls.test.mjs`；键盘与安全区仍由页面 RESIZE 和导航条高度处理。

输入区导入/发送在各自Stack内调用同一个 `composerLabelWidth`，用 `AppInterface.agentComposerLabelKeys` 的导入、解析、发送、取消全部本地化文案测量最大宽度；透明测量文字不进入无障碍朗读，语言切换按语言重建。实际文字独立居中；发送状态用12vp图标、14vp槽绝对定位到已有16vp左内边距，不参加横向排版，idle不绘制。两按钮保留44vp高度、16vp水平内边距和8vp竖向间距，并贡献相同1vp边框；发送使用透明边框保留实底外观。输入区10vp横向间隔及页面安全区仍归原宿主；中英、解析/请求/取消及结果切换不挤动输入框。标签、显隐、可用状态和JIDE观察仍共用原声明，不新增动作或权限。几何/标签覆盖回归见 `ui-action-status-layout.test.mjs`；键盘、大字体、窄/宽屏最终渲染须设备验收。

2026-10-10：公共UI回归、状态布局专项、文档/依赖边界及增量签名HAP通过，构建新增警告为0。手机模拟器覆盖安装后，导入/发送按钮外缘均为 `[1055,1279]`、宽224px，两行文字均为 `[1114,1220]`、水平中心1167px；输入为空/有文字时一致。安装前后UID、首次安装时间和debug签名类型一致；测试输入已清除并返回首页。宽屏模拟器只验收覆盖安装及首页启动，未进入其未启用的JIDE。模拟器未成功调出软键盘，真实请求中的状态图标、设备中英切换/大字体、宽屏聊天及真机未验收；状态分支与图标/内边距几何由专项主机回归覆盖，不能描述为设备全状态通过。截图和布局证据保存于忽略的 `.local/send-button-fix-20261010/`。

思考及摘要默认展开，恢复历史时也按此默认显示；工具详情默认折叠。用户可手动收起思考，展开状态由当前可见消息拥有，不随流式追加或完成重置。每条回复的思考集中到一个 `AgentReasoning` 灰色入口，原始顺序时间线仍完整保存。思考展开最高200vp，内部跟随追加内容，向上阅读暂停，重新打开跳到最新；点击展开或详情暂停整页跟随，避免控件被推走。工具用 `AgentDisclosureCard` 的原生图标、浅边框和 surface_card 紧凑容器，内部参数/输出最高240vp滚动，外框拥有10vp横向内边距，条目间距由回复列拥有。两者共用 `DisclosureChevron`。所有嵌套 builder 以单个对象字面量传当前消息引用，列表 key 只含稳定消息/条目身份，不能靠正文长度、状态或展开值重建控件。AI过程外层不再套聊天气泡；已校验草稿、澄清和确认使用各自业务控件。失败/完成清除未校验参数预览。回归入口 `ai-agent-process-ui`、`ai-agent-conversational-ui-contract`、`ai-agent-timeline`，其中 Node 非渲染逻辑不证明 ArkUI 观察和点击行为。测试模块保持无界面沙箱测试，不提供独立产品预览窗口；设备应验收主应用页面。

首页通用入口和页面标题显示“JIDE”，带上下文的制卡/改卡快捷操作、页面顶部和新会话默认标题使用“JIDE 制卡 / JIDE 改卡”。用户已经保存的历史标题保留原文。DeepSeek 内置目录由 `model/agent/ProviderCatalog.ts` 管理，默认 `deepseek-flash`（V4.1 Flash），保留 `deepseek-v4-pro`；`AgentSettingsStore` 读写时将目录外的旧模型恢复为当前默认，保留有效选择与其他提供商配置。

制卡与改卡共用 `AI制卡页.ets` 的顺序事件流，展示模型为 `model/agent/AgentTimeline.ts`。连续同类文本合并，工具状态在首次出现的位置更新；字段所属图片穿插显示。`tool_progress` 只提供参数生成预览，完整 `tool_call` 才能进入既有执行链。已校验草稿在工具完成时预览，整轮结果接收后才开放原编辑与确认控件；历史只恢复顺序和只读快照。停留底部时跟随流式更新，向上阅读时暂停跟随。

## 执行环境与错误恢复

- 联网意图由 `AgentPolicy.explicitWebSearchRequested` 判断，仅出现“网页 / 网站 / website”不表示要访问网络。用户要求本地 HTML/CSS/JS 交互闪卡时必须进入正常模型请求。代码生成、纯计算沙箱和卡片 Web 预览分别承担不同职责，沙箱不提供 DOM、网络或页面预览。
- JIDE 普通对话、制卡和改卡共用 `web_search` / `read_webpage` 两个本机只读工具，由 `AgentWebTools.ets` 注册到既有 Registry，不新增循环或卡库权限。`AgentWeb.ts` 负责参数边界、URL/跳转校验、正文分页和来源解析；设备适配使用 RCP，GET 读取网页、POST 调用豆包，关闭自动跳转、逐跳验证、解析地址排除内网/保留地址并将校验地址传给 DNS 规则、30 秒请求超时、流式响应最多 2 MiB，并在结束或失败时释放 Session。网页仅提取 HTML/纯文本，不运行脚本、登录或加载页面资源；复用 `AgentDocumentText`，不是浏览器或完整正文识别器。正文默认 12000、最多 24000 字符，`nextOffset=-1` 表示读完；续读重新请求网页，因此动态页面内容可能变化。没有任意网页图片/音频下载工具；已有 `search_images` 返回 Wikimedia 候选，并由 `AgentDraftExecutor` 在草稿确认后下载、校验及写入媒体库。
- 搜索默认豆包搜索 Custom 版，保留 Brave 备选；目录和购买地址在 `AgentSearchProvider.ts`。豆包固定 POST `https://open.feedcoopapi.com/search_api/web_search`，仅发送 Query、SearchType=web、Count、NeedUrl 和 text 格式；凭据仅放 Authorization，解析 Result.WebResults，优先 Summary、回退 Snippet。契约核对火山引擎[官方 API 实现](https://github.com/volcengine/mcp-server/blob/main/server/mcp_server_askecho_search_infinity/src/mcp_server_askecho_search_infinity/api/api_key_auth.py)与[请求结构](https://github.com/volcengine/mcp-server/blob/main/server/mcp_server_askecho_search_infinity/src/mcp_server_askecho_search_infinity/model.py)。两个服务均返回标题、HTTPS URL 和限长摘要，不自动读取全部结果；查询统一限制1至100字符。错误响应不能计为成功检索，零结果仍表示真实执行。网页读取本身不调用搜索服务、不消耗搜索次数。
- 联网开关在 `AgentSettingsStore` 的独立键保存，默认关闭；搜索服务独立保存，缺省豆包。先打开界面开关，才显示服务选择和密钥输入；此时仅打开配置，填写并保存后才生效。空密钥拦截保存，存储入口启用时检查所选服务的已保存密钥，运行时读取开关也检查凭据；旧版本开启但没有对应密钥的配置视为关闭，不影响本地生成。搜索密钥在 Asset Store 的独立 `web.doubao` / `web.brave` 别名保存，既有模型与 Brave 密钥保持原别名，不自动互用。设置复用公共 `SettingsToggleRow` / `SelectStyle` / `FormInputStyle` / `PrimaryActionButton` / `按下态按钮`，不把密钥写入偏好、提示词、历史或工具输出。服务选择框和购买按钮在同一行：选择框拥有剩余宽度，按钮不收缩，间隔8vp由行拥有；其余控件间隔10vp由原容器拥有，不新增外缘间距。豆包按钮打开[官方控制台](https://console.volcengine.com/search-infinity/web-search)，提醒订阅和按量密钥独立；系统浏览器打开失败时复制购买网址，复制也失败则显示网址。关闭时保留密钥；切换服务仅读取相应凭据，迟到结果失效。配置及真实组件非渲染行为回归见 `ai-agent-web-settings.test.mjs`。
- 每轮读取当前开关；用户明确要求不联网时移除两个联网声明，保留其他本地能力。工具执行前再次检查开关，偏好/密钥存储失败保留错误。声明本机联网工具时 Runner 保持 Provider 搜索 `off`，自定义模型也能使用；真实成功工具输出才记录执行及来源，正文中的链接不能替代工具证据。空搜索结果算实际执行，不算存在来源；网络失败不算已搜索。既有来源展示、时间线、预算和取消协议共用。
- JIDE 配置使用应用端开关和服务选择，不恢复旧 Provider 三档搜索界面或读取其历史偏好。Provider 的内置搜索协议保留兼容，主页面固定关闭该路径以避免重复检索；它不代表应用端联网关闭。错误提示分别说明应用开关、检索未完成或来源缺失，不再建议通过切换 DeepSeek/OpenAI 修复本机工具。国内默认接入豆包；Brave 国内直连稳定性尚未验收，未接入 SearXNG。
- 回归入口 `ai-agent-web.test.mjs` 与 `ai-agent-runner-contract.test.mjs` 覆盖豆包 POST / Brave GET、搜索密钥隔离、底层无密钥读取、参数/URL/跳转、文本分页、响应大小、HTTP/内容类型失败、取消和迟到响应、各模式声明、关闭联网后的本地能力、真实 Registry/RCP 适配及自定义 Provider 接续。平台网络 IO 用主机替身，实际设备网络连通性、服务账户额度、网站反爬/脚本页面及设置外观由用户真机验收；本轮不操作真机。
- 2026-10-01 本机联网验收：Agent 领域 355 项、全库 1829 项测试通过；联网代码已完成 clean 签名 HAP 构建，警告门禁 accepted=268、unexpected=0。实现供应用所有受支持设备共用，不检查特定设备 ID 或机型。未使用用户搜索密钥发起付费检索，未操作真机；API 服务连通性和实际外观不由主机替身测试证明。安全存储回归见 `ai-agent-web-storage.test.mjs`，保留既有模型别名，并验证搜索密钥独立替换/清除及存储失败可观察。
- 2026-10-01 豆包接入及默认关闭复验：`npm run verify` 完成原生、沙箱、RPC 和 clean 签名 HAP，警告门禁 accepted=268、unexpected=0；最后的 `npm run verify -- repo` 全库1863项通过。覆盖先打开配置再填密钥保存、服务独立密钥、豆包默认、真实工具 POST 接线、服务选择旁购买地址及打开失败复制回退。未使用真实 API 密钥检索，未购买套餐，未操作真机；宽窄屏、开关/选择框观察更新、浏览器跳转及实际网络由用户验收。

- `AgentSessionContext.buildAgentRuntimeInstructions` 由 Runner 在每次 Provider 请求前按实际工具声明和剩余额度生成，不累积旧环境说明。沙箱存在才声明一次性 JavaScript 函数体、显式 input/return、无文件/网络/卡库权限；计算结果、草稿和确认写入是三个不同阶段。沙箱是执行能力，不是自动规划器，也不保证模型任务质量。
- Registry 在执行任何工具前验证完整 JSON 对象。语法错误保留限长脱敏的解析原因和原始长度，明确未执行；`receivedKeys=[]` 不能被解释为没有传参数。反馈提供契约形状，但不替换用户内容，不自动修补或执行猜测出来的 JSON。
- Runner 不再按连续失败轮数停止已经改变参数的修正。相同工具、完整参数和错误位置第三次重复才触发防循环暂停；总模型/工具预算仍生效。Session 保留调用/错误结果和已有草稿，历史恢复后可显式继续，不自动写入。不同长参数尾部不能因展示截断被误判相同。Responses 重复完成事件不重复执行，也不制造协议错误。
- 已注册草稿工具失败后，没有合法草稿的纯文字回复不能被判作交付。Runner 最多追加一次成果校验提示，保留原错误观察；仍不产生草稿则暂停而非假完成。正常聊天和成功读取后的解释不强制制卡，澄清/确认继续遵守原等待协议。
- `ai-agent-v2-runtime.test.mjs` 使用真实 Runner/Registry/Session/CardAgentTools，验证非法换行、错误 arguments 外壳、修正后原内容草稿、无写入，以及重复失败暂停恢复；这类确定性回归不是模型完成率评测。
- 在线评测入口：`node --experimental-transform-types --import ./tools/tests/register-ts-hook.mjs tools/test-agent-live.mjs --run`。仅显式执行，需 `DEEPSEEK_API_KEY`，可用 `AGENT_EVAL_BASE_URL`/`AGENT_EVAL_MODEL` 覆盖服务和模型，`AGENT_EVAL_REPORT` 指定报告。发送合成材料并产生 API 费用，不读取真机或用户卡库；覆盖基础制卡、引号/反斜杠/换行和受控 JSON 故障后的修正。工具集合明确限于制卡与澄清，不能据此宣称全工具、真机链路、沙箱计算或知识准确率已验收。鉴权失败只说明评测未执行成功。
- 设计对照：[OpenAI 执行循环](https://developers.openai.com/api/docs/guides/agents/running-agents)、[Anthropic 工具契约与评测](https://www.anthropic.com/engineering/writing-tools-for-agents)。保持现有简单循环和确认边界，不为引入框架而替换实现。


## 页面业务边界

- `AgentAuxiliaryTools.ets` 只负责读取、校验目标和生成辅助提案；不持有确认账本或执行提案写入。`AgentSessionController.ets` 拥有 `AgentActionExecutor.ets`，登记和恢复 pending 动作；页面确认入口才调用 `executeConfirmed`。
- `AgentActionExecutor.ets` 消费绑定 ID/种类/载荷的一次性确认，提交前重查牌组/笔记类型重名；记忆变更复用存储基线检查，分析授权只接受已冻结的 ID。`AgentDraftExecutor.ets` 仍负责 ChangeDraft 写入和高风险双确认，两者不是同一个确认协议。
- `ai-agent-v2-runtime.test.mjs` 执行真实会话、工具和辅助执行器，覆盖未确认无写入、重复/取消/篡改确认、名称冲突及崩溃恢复。`architecture-boundaries.test.mjs` 防止 Runner/Registry/工具经字面量模块依赖取得执行器；它不替代运行时权限测试。

- `AgentProviderContext.ts` 负责草稿语义视图；`truncateProviderText` 必须包括截断标记在内遵守额度，字段/操作丢失须标记 truncated。`buildProviderDraftStateContext` 对大量草稿改用真实身份、状态、数量和执行结果，明确正文已省略，避免完整草稿复制进系统指令后占满请求。页面不再按80项/正文字符预裁剪历史或当前材料，发送预算由下面的整包预检统一拥有。
- `AgentCardBatch.ts` 在第一处等待前复制整批选中字段和目标；每张卡仍经页面适配器调用 `AgentDraftExecutor.prepare/executeOrdinary`。单卡失败不中断整批，已保存卡不再创建；操作占用直到整批完成，成功才通知同步。
- 页面通过会话 ID 和消息 ID 回写状态，不能依赖异步开始时的数组索引。离页后执行器继续已接受写入，禁止访问旧 UI 或读取下一张卡的可变字段；错误文案在开始保存前固定。
- `AgentFileImport.ts` 的 `mergeAgentImportedFiles` 统一限制10个文件、160000正文字符；持久资料只提交描述，PDF 按页读取不占这个正文额度。迟到文件解析不得进入另一个会话。
- 历史列表每次打开/关闭都更新读取代次；恢复历史、新建会话和手动选择类型使旧能力响应失效。笔记类型请求还独立去重，迟到失败不能清空新选择。离页后的文件解析及历史删除只完成已接受的存储操作，不回写旧 UI；回归见 `platform-warning-boundaries`。
- `agent-page-models.test.mjs` 直接测试业务规则；`agent-page-lifecycle.test.mjs` 仅保留页面与真实模型的接线验证，覆盖离页、消息替换、整批输入与确认执行器路径。

- `AgentConversationTypes.ts` 定义持久化协议；`AgentConversationView.ts` 负责可见消息复制和恢复，持久化安全投影归 `AgentHistoryProjection.ts`；`AgentConversationStore.ets` 是仓库的薄适配，平台文件和旧偏好迁移归 `AgentHistoryFiles.ets`。工具审计按消息 ID 归属，旧无归属记录独立展示；恢复时复制澄清和操作状态，不恢复写入令牌。
- `components/agent/AgentEditableCard.ets` 只呈现字段、选择和保存状态并上抛事件；`AgentHistoryList.ets` 只呈现历史和打开/删除事件。领域状态与执行器由页面协调，不向子组件传整个页面实例。
- 新边界直接行为测试见 `page-domain-models.test.mjs`；历史恢复覆盖原始 Provider 正文、推理、工具归属、旧记录、可变快照隔离。

## 历史编排入口

`model/agent/AgentHistoryCoordinator.ts` 拥有历史列表读取/恢复代次，协调 `AgentConversationView`、现有会话存储及 CheckpointStore。保存时冻结可见记录，checkpoint 失败不声称已保存；已接受的历史写入按序完成，删除等待先前写入，避免晚到保存重建刚删除的记录。关闭/重开列表、切换上下文、新会话和离页均使旧读取失效。

恢复把 checkpoint 交给既有 `AgentSessionController.restore` 校验，只重建显示、协议及检索进度；不恢复卡片写入令牌，不自动重新执行动作。创建模式校验牌组/类型是否仍存在，页面异步加载类型后再次核对恢复代次；编辑模式仍允许未指定目标。页面继续拥有输入、文件选择、导航与错误呈现。直接回归 `agent-history-coordinator.test.mjs`，页面接线及迟到类型结果回归 `platform-warning-boundaries.test.mjs`。

### 工具按需发现

`AgentToolCatalog.agentFunctionTools` 仍汇总当前模式的完整语义能力，页面继续按联网开关、文档/教程能力和导航挂载过滤，再传给 `AgentAppSettingsTools` 生成完整软件认知。页面为共用 Runner 启用 `ProviderTurnRequest.deferTools`；此标记只在本机传递，不发给模型接口。三个模式及三个提供商共用相同加载边界；直接构造未启用标记的兼容调用保留原显式工具列表。

每次用户发送、澄清/确认后接续或检查点恢复，`AgentRunner` 建立新的 `AgentToolDiscovery`，初始只发送已可用的 `discover_tools`、`get_app_structure`、`request_clarification`。普通聊天可直接回答；业务操作先按简短中英文功能关键词查找，或按准确 `names` 加载工具。搜索只消费原声明的名称和说明，支持 `nextOffset` 分页；每次最多加载6个结果，返回简短名称/说明，完整 schema、示例和规则从下一次模型请求的工具声明取得，不复制到工具结果中。查不到时可换关键词或从软件结构目录取得准确名称，不能凭空猜参数。

同一次执行最多保留12个非核心定义，按实际加载/使用更新最近顺序，超出时移出最久未用定义；核心发现入口始终保留。移出/下一轮重置只影响定义窗口，原对话、读取覆盖、任务计划、草稿、确认账本及执行结果保持原所有权。历史工具名不自动加载，检查点恢复不重放历史调用。业务工具必须在本次请求中已声明，同批发现不能提前执行它；被过滤的联网、模式或平台能力无法通过名称重新开启。发现计入原模型/工具预算与审计，不算联网或业务执行证据，也不取得任何写入许可。

`get_app_structure.tools`、导航能力和推荐仍表示过滤后的可用目录；其工具名未必在当前定义窗口内，调用前需要发现。能力指纹按完整目录计算，不因加载窗口改变而抖动；Runner 的“本轮可用工具”只列当前实际声明。新增领域工具只维护原声明、处理器和权限边界，不维护第二份发现清单。

直接行为回归见 `ai-agent-tool-discovery.test.mjs`；真实 Session/Runner/Registry 的普通聊天、动态加载、同批拒绝、旧检查点、确认后接续、禁用联网和草稿数量回归见 `ai-agent-v2-runtime.test.mjs`。验证命令为 `npm test -- agent`，增量签名 HAP 为 `npm run build:app -- -SkipRust`（仅在原生输入未变且已有对应归档时跳过 Rust）。主机模拟提供商验证实际请求，不代表真实提供商已接受动态工具列表或模型检索质量已验收；未安装设备、未调用真实模型，设备/模型体验仍需分别验收。

2026-10-09 使用 [DeepSeek V4.1 Flash 官方 tokenizer 与提示词渲染器](https://huggingface.co/deepseek-ai/DeepSeek-V4.1-Flash/tree/2cba9e42aa026125f3ed06c6d98c1db82f7ca027) 离线估算：通用助手关闭联网、仅发送“你好”、无历史/记忆/草稿/附件/目标时，完整定义版本约21642 token，按需版本约4485 token（含指令、核心定义与消息封装），减少约79%。实际任务还会加入历史、发现结果及所需定义，不能把基础输入当作整段任务用量；服务端 usage 才是实际计量依据。

### 请求上下文预算（2026-10-06）

工具定义采用按需加载，详见[工具按需发现](#工具按需发现)。完整能力目录留在宿主侧；发送给模型的定义窗口参与整包预算，已执行的历史参数和结果仍按原规则保留。

`ProviderProtocol.ts` 的 `providerRequestFitsContext` 与 `buildResponsesPayload` 共用完整 Responses 序列化和请求的 `contextBudgetChars`：未指定时非图片部分最多240000字符，当前内置 DeepSeek由页面按 `AgentExecutionBudget` 传入768000字符；图片最多8张/12MiB。这是序列化字符额度，不是模型 token 窗口。工具 schema、指令、参数、输出、JSON 转义与原始思考都计入，密钥仍只进请求头；无效协议/schema 不作为可压缩的大小错误。检查点不再以旧240000字符裁剪已接受的单条用户材料。

`AgentRunner` 每次补齐当轮运行指令后调用 `AgentSessionState.fitAgentRequestContext`。能发送的文字保持完整，图片沿用最近两页策略；超限才从旧的长工具输出开始移出正文，保留 noteId、fieldOrd、totalLength、nextOffset、检索覆盖数及执行/草稿状态。需要原文时必须重新读取，工具调用与结果的 ID、顺序和原始思考仍完整配对。仍超限才移出完整旧用户回合，保留有上限且标为参考数据的历史要求摘录和工具进度；再次整理会合并已有进度，不重放旧工具或把历史变成新授权。Scope 的发现 ID、真实读取覆盖和确认账本由原拥有者保留，不因模型窗口整理重置。

最新用户材料和保留回合的原始思考不能按字符截断；它们本身无法容纳时仍明确报错并保存会话进度。失败后发送较短的新要求可以移出那个旧回合，避免短句重试永久卡住。超限前已校验成功的部分草稿由页面正常接收，保留可编辑预览和原确认保存入口，错误本身不触发卡库写入。

直接回归 `ai-agent-context-budget.test.mjs` 覆盖三种入口的8条长字段、转义后的整包限制、正常文字不提前丢弃、滚动进度、巨大草稿状态、非法协议、图片和真实页面的完整输入/部分草稿接收；`ai-agent-v2-runtime.test.mjs` 执行真实 Session/Runner/Registry 的旧超限短句恢复、8条字段读取与检查点恢复，并保持已确认写入只执行一次。编译与签名包使用本任务增量 HAP 验证；未安装设备或调用真实模型，这些测试不代表真机与模型规划已验收。

### 思考协议续接

`ProviderProtocol.ts` 是原始 Responses 续接记录的唯一格式校验入口。带工具的思考模式要求完整回传原始思考记录；页面显示的摘要不能代替它。`AgentSessionState.ts` 的检查点保留完整 `reasoning` 和白名单 `output_item`，包括原始文本、签名/加密字段与其他 Provider 元数据，不按展示文本的字符上限截断或脱敏。鉴权密钥只留在 HTTP 请求头，检查点不包含请求配置；文件正文和页面图片仍按既有规则只留指针/读取说明。原始思考记录保存在应用本地的会话检查点，随会话删除。整个请求仍受 `AgentExecutionBudget` 配置的字符上限约束，超限明确失败，不能发送裁剪过的思考。

`ResponsesEventNormalizer.ts` 同时读取 output_item.done 与 completed/incomplete 的最终 response.output，同一 ID 的最终内容更新原位置，相同内容不重复。Runner 不再丢弃超过64KB的原始续接项；有完整原始思考项时优先回放，空项不能压掉真正的 reasoning_delta，缺完整项时用真实原始 delta 补齐；reasoning_summary 不作为原始思考。兼容模型的 summary/加密思考项保持原结构，不伪造文本。

检查点 `reasoningReplayVersion=1` 标记完整协议保存。无此标记的旧检查点已丢失原始思考，恢复时将旧回复/工具结果转换成明确标注的用户历史资料，保留可见历史、读取范围和待确认动作，不重放残缺 assistant/工具协议。无检查点的旧可见历史采用相同转换，当前用户要求仍是独立消息。旧待确认动作沿原确认账本执行一次，其真实结果作为应用数据接续；不会重新执行历史工具或恢复写入令牌。

同一 Provider 轮次的全部 `function_call` 必须排在该批全部 `function_call_output` 之前。正常执行和 `clarification_must_be_only_tool` 整批拒绝分支遵循相同顺序；交错排列会被 Responses 兼容层拆成多个助手段，后一段不再关联原始思考。整批拒绝仍不执行任何工具，而是让模型单独重发。恢复 v1 检查点时，`AgentSessionState` 仅重新排列连续、ID 唯一且完整配对、结果全部为该拒绝错误的已知旧批次；保留原始思考、参数、结果与边界，不跨消息/思考重排正常历史，不触发工具或写入。

回归入口 `ai-agent-reasoning-replay.test.mjs` 覆盖完整检查点、长思考、加密字段、最终事件、上下文裁剪和旧记录转换；`ai-agent-v2-runtime.test.mjs` 用真实 Session、Runner、Registry、确认执行器及 Responses 序列化请求，模拟提供商按助手段检查原始思考、遇到工具结果结束当前段的规则，缺思考即拒绝。覆盖确认后“选择目标+读取模板”整批拒绝、纠正后继续、恢复旧错误批次及已确认写入只执行一次。主机测试不代表真实提供商已调用成功，安装后的实际会话由用户验收。协议依据：[DeepSeek Responses API](https://api-docs.deepseek.com/api/create-response/)、[Responses 兼容分组](https://api-docs.deepseek.com/guides/responses_api/)与[思考模式](https://api-docs.deepseek.com/guides/thinking_mode/)。

## 对话中的数学与化学公式

- `components/agent/AgentMarkdownText.ets` 是助手正文、历史回复和表格的共用入口；`AgentReasoning.ets` 的含公式思考也接入该入口，无公式思考保留原生文字与22vp行高。三个对话模式共用同一页面与组件，用户输入气泡仍展示原文。
- `model/agent/AgentMath.ts` 先保护代码、转义和已闭合公式，再生成转义后的显示标记；支持 `\(...\)`、`\[...\]`、`$...$`、`$$...$$`，公式内可用 mhchem 的 `\ce` / `\pu`。数学矩阵的反斜杠与公式中的竖线不交给加粗/表格规则改写。未闭合的流式公式和排版失败的公式保留源码。裸 HTML/MathML 仍为文字，不在对话执行任意 HTML、传统 LaTeX 编译或化学结构绘图。
- 含公式整段内容只挂载一个 `AgentMathText.ets`，`model/agent/AgentMathDocument.ts` 用共同表格解析器和逐单元格转义构建文档，不为每个公式单元格加载 Web/MathJax。复用现有固定版本的 `tex-svg-full.js` 与 `CardAssetResponse`，不修改学习/预览的公式配置。对话专用配置启用数学与 mhchem，禁用动态扩展加载；CSP 和资源拦截只允许内置排版脚本，不访问网络/用户媒体，不注册应用动作代理。
- 组件等待 Controller attach 后首次加载，PageEnd 后合并80ms内的流式更新；文档拥有一个进行中的排版和一个最新待处理版本，密集更新覆盖待处理旧版本。复用同源码的已完成公式节点，只排版新增/变更公式，清理移除项；公式和表格保持横向阅读位置。销毁取消未提交timer，迟到尺寸与失败不回写。
- ArkWeb 使用 `NONE` 布局、`SYNC_RENDER` 和显式内容高度，初始24vp；排版完成及宽度变化后通过只含版本、宽度、高度与失败状态的 `onConsole` 回执通知原生。高度测量 `#content.getBoundingClientRect()`，不用包含 viewport 最小值的 `scrollHeight` 或 `FIT_CONTENT`。原生只接受当前版本/宽度的有限尺寸，允许高度增大或减小，失效引擎回退完整源码。宽度为CSS viewport、初始缩放1，对应vp；系统字体缩放已在原生转换。正文不另加边距；文字/表格之间只由文档提供8vp，表格列最小144vp、单元格10vp内边距和1vp边框，横向在文档内滚动；垂直手势优先交父滚动，思考区外层仍最高200vp。表头、表格底色和边框取现有资源主题色。
- 行为回归：`ai-agent-math.test.mjs`、`ai-agent-markdown-ui.test.mjs` 和 `ai-agent-process-ui.test.mjs`。真实离线 Edge 回归：`node --experimental-transform-types --import ./tools/tests/register-ts-hook.mjs tools/test-agent-math-browser.mjs`，需 Playwright/本机 Edge，可用 `PLAYWRIGHT_MODULE` 指定模块；截图和报告输出 `tmp/agent-math/`。覆盖分式、矩阵、积分、多行公式、反应条件、离子/同位素/单位、长公式、代码排除、错误原文、流式接续及窄表单元格，不调用模型或设备。
- 2026-10-02 浏览器四组窄/宽屏与深浅色通过，无额外资源请求；共享工作树的 `npm test` 全部通过。`npm run verify` 的原生、沙箱与 RPC 阶段通过，后续 `npm run build:app -- -SkipRust -Clean` 完成 ArkTS 与签名，本任务组件无新增警告；完整警告门禁仍由当前其他会话协议代码的异常声明诊断阻止，按用户要求不修改其他任务。主机结果不证明真机 ArkWeb 的高度观察、嵌套手势、公式选择复制或系统主题切换，未安装或操作设备。
- 长输出回归额外覆盖13行含公式表格，第8行空考点和第9行极值题的自然行高、窄/宽视口与高度缩回短内容；真实 MathJax 排版阻塞期间连续100次更新只继续最新版本，保留未变化的公式节点。回执解析和组件真实非渲染逻辑覆盖错误/旧版本/旧宽度/释放后的回写隔离。浏览器结果不代表 ArkWeb 真机布局与手势，设备仍须验收长思考、工具密集输出、表格横滑及长按选择。
- 2026-10-02 长输出修复的完整 `npm run verify` 通过（1964 项 Node 测试、原生/沙箱/RPC、clean 签名 HAP，268 项既有警告、新增0）；文档更新后的 `npm run verify -- repo` 再次通过。离线 Edge 共6组页面通过，长表格各行自然高度，短内容回执为21vp，不受844px viewport撑高；100次排版积压只新增两次必要排版且保留已有公式。此项仍不证明真机长输出流畅度或嵌套手势。
- 本次设备覆盖安装尝试：连接的SLG-W50执行 `hdc -t <connect-key> install -r <signed-hap>` 被拒绝，错误9568322（签名验证失败，应用来源不受信任）。未更换签名、卸载或清数据，未重启旧应用；修复尚未安装，实际思考显示、高度与手势未验收。生成包为 `entry/build/default/outputs/default/entry-default-signed.hap`，后续需处理设备对既有本机签名配置的信任再覆盖安装。

## Anki 官方教程按需读取

JIDE 优先用已有官方资料解释 Anki 概念、学习、FSRS、搜索和模板。`search_anki_help` 只搜索章节标题、小节和中英文检索别名；空 query 分页列目录。`read_anki_help` 按返回的 topicId、可选 sectionId 读取原文，offset 相对所选范围，默认6000、最多12000字符，nextOffset=-1 仅表示该范围读完。先搜索再读有关段落，不预装整本手册，不把目录数量当阅读覆盖。

- 单一资料来源是 [Anki 主仓库的官方手册](https://github.com/ankitects/anki/tree/main/docs-site/manual)，在线入口为 [Anki Docs](https://anki.mintlify.app/manual/intro)。旧 anki-manual 仓库正在迁移；当前选章与中文检索别名在 `tools/anki-manual-topics.json`，官方英文 MDX 原字节保存在 `resources/rawfile/anki-manual/topics/`。正文未翻译或改写，由 JIDE 用用户语言解释并引用返回的链接。
- `index.json` 记录完整 Git revision、提交日期、原文 SHA-256、章节范围、来源链接及 CC BY-SA 4.0 许可证。NOTICE 和完整 LICENSE 随资源打包；原文、许可证或索引不一致时离线检查失败。图片与外链资源未打包，MDX 只作为文本参考，不运行组件或脚本。
- `model/agent/AgentAnkiHelp.ts` 拥有参数、搜索、分页、读取代次和工具声明；`backend/agent/AgentAnkiHelpTools.ets` 只适配 ResourceManager。assistant/create/edit 共用两个只读工具，离线可用，不依赖联网开关。无能力上下文时页面不向模型声明它们；资源错误保留为工具失败。
- 每次调用读取当前随包索引并返回 revision，恢复会话不冻结旧资料版本；每轮运行时指令要求旧引用重新核对。官方手册描述上游桌面 Anki，本应用界面、动作与设置支持仍从当前 `get_app_structure` / 工具声明读取。教程文字不授予操作权限。

后续发布需要更新资料时，从官方 Git checkout 执行 `node tools/vendor-anki-manual.mjs --write --source-dir <checkout>`；脚本读取该 checkout 的已提交 HEAD 原文，不读取工作区改稿、不更新 Anki Core 锁、不隐式联网。默认校验使用显式 `--check`，更新流程见 [工具入口](../../tools/README.md)。快照随应用更新，不承诺运行时自动抓取公网最新内容。

验证：`ai-agent-anki-help.test.mjs` 检查真实资源完整性、中文/英文查询、分段续读、取消、损坏失败和真实 ResourceManager/Registry 适配；`ai-agent-v2-runtime.test.mjs` 执行真实 Runner/Session 的搜索→读取→回复，以及恢复后读取新版 revision。新平台接口需增量 HAP；模型是否主动选择合适章节、真机读取与中文解释质量需另做验收。

## 文件资料与按页制卡

输入区上方的文件状态卡片共用左右12vp内边距，成功、不支持和解析失败状态使用同一布局；右侧“移除”保留紧凑行内操作，卡片负责与边框的距离，输入区外层负责页面和底部安全区留白。

JIDE 的文件入口沿用 `AgentFileImportService.ets`，支持格式以 `AgentFileImport.ts` 为准：PDF、DOCX、PPTX、XLSX、OpenDocument、电子书、文本、图片和视频。Word 等已有解析器继续负责转文本，不承诺保留原版式。图片/文档单文件最大20MiB，视频最大64MiB，单批最多10个文件；文本/压缩文档仍保留原有大小和截断提示。新 PDF 资料按需逐页读取，不使用旧一次性提取的120页/30页 OCR 上限。

- `AgentDocumentStore.ets` 在选择器授权期复制原文件到 `filesDir/agent-documents/<conversationId>/<documentId>`。PDF 导入只验证文件和页数，不预先 OCR 全书。提交后的资料在恢复会话时仍可用，删除会话时删除所属资料；未提交的暂存资料不会被模型列出。
- `AgentDocuments.ts` 提供 `list_documents`、`read_document_page`、`ocr_document_page`、`save_document_notes`，校验会话范围、页号、实际读取与取消代次。文本每次最多12000字符，返回 nextOffset/nextPage。原文、OCR 文本和 modelNotes 分开，笔记是模型解释，不作为原文或长期偏好。大任务受既有轮次预算控制，可继续读取；不能仅凭页数声称完整覆盖。
- PDF 文字提取使用 API 12 的 `getGraphicsObjects()`；不调用 API 23 的 `getTextContent()`。渲染、图像编码和系统 OCR 均使用 API 21 可用接口，兼容 SDK 不提升。OCR 无需视觉模型；失败返回真实工具错误，原文件和既有缓存保留，模型可换读法。复杂布局的文字顺序和公式不保证无误。
- 当前模型支持视觉时可 includeImage 读取单页；自定义提供商在设置中启用视觉支持，文字模型走 OCR。Responses 的 function_call_output 使用 input_text/input_image 数组，适用于兼容服务，不绑定 DeepSeek。切换文字模型时 Runner 去除历史图片。渲染最长边2400、缩放最多3倍、JPEG最多2MiB；Provider 限制8张/12MiB，常规上下文保留最近两张页面图片，最新视频批次可完整保留最多四帧。历史保存文件页指针，不写 base64，恢复后按工具重新读取。
- `create_flashcards.cards[].sources` 接受实际读取的资料页；CardAgentTools 把经过转义的文件名和页码加入最后一个字段，用户可在既有草稿预览中编辑。原来的目标选择、草稿确认与卡库写入边界继续适用。

直接测试：`npm test -- agent`，重点为 `ai-agent-documents.test.mjs` 和 `ai-agent-v2-runtime.test.mjs`，实际运行 Store/Registry/Runner/Session；平台支架故意不提供 API 23 方法。完整验证：`npm run verify`。原生合成 PDF/OCR 测试：先覆盖安装当前主 HAP，`npm run build:app -- -SkipRust -Test` 后 `node tools/test-agent-documents-device.mjs <connect-key>`（通过 DEVECO_HOME 定位 SDK）；测试不调用模型、不访问卡库。此次用户要求仅安装，具体平板操作交由用户，未验收真机 OCR 准确率、API 21 真机或真实提供商制卡效果。决策见 [按页资料读取](../decisions/2026-10-01-agent-document-reading.md)。

## 已有图片与视频制卡

- `AgentNoteMedia.ts` 统一已有笔记图片、标准 sound 视频及 HTML video/source 引用解析和工具定义。`list_note_media` 仅列出已发现笔记的字段/媒体序号；`import_note_media` 核对原文件名与当前引用、拒绝路径/外链/符号链接、检查实际文件大小，再由 `AgentNoteMediaTools.ets` 复制选中媒体到当前会话资料区。它不修改卡库、原媒体或操作 UI，返回的 documentId 继续使用现有会话授权和删除生命周期。
- 已有图片使用 `read_document_page(includeImage=true)` 或 `ocr_document_page` 读取后制卡。OCR 无需视觉模型；图表/物体理解需要视觉模型。读取快照保留原文件，后续卡片修改不改变已经提交的会话资料。新草稿沿用目标选择、真实笔记字段和用户确认保存。
- 本地视频也可从原“导入”入口提交。`read_video_frames` 支持显式 timestampsSeconds 或 startSeconds/endSeconds/frameCount，每次最多4帧；省略范围时在全时长均匀取样。`AgentVideoReader.ets` 用 API 12 的 AVImageGenerator 和 API 11 的 AVMetadataExtractor，两个实例各自拥有文件描述符，先释放实例再关闭描述符；PixelMap 由资料服务释放。帧最长边1600，JPEG沿用2MiB上限。
- 视觉模型接收独立 input_image，文字模型对视频帧做系统 OCR。结果标注请求时间、真实时长、逐帧成功/失败及 audioRead=false。取的是最近关键帧，时间并非精确逐帧定位；少量采样不能代表连续画面或全视频阅读。声音转写未接入，讲解声音需由用户另行提供字幕/文本。解码失败、全部取帧失败和 OCR 失败返回真实错误；部分失败保留可读帧供重试，取消/换会话不发布旧结果。
- `cards[].sources` 的视频来源使用 documentId/page=1/timestampSeconds，只允许引用本会话真正读到的时间；草稿标注约略时间，不能引用失败或虚构的帧。视频资料笔记复用页1，重新取帧会返回 modelNotes。图片和视频 base64 不保存到磁盘 JSON/历史/检查点，恢复后重新读取。

主机回归入口：`tools/tests/ai-agent-media-reading.test.mjs`，执行真实 Scope/Registry、媒体快照 IO、资料服务、平台取帧适配、Provider 图像协议和制卡草稿；`npm test -- agent` 检查既有会话/确认行为。新增平台 API 必须增量 HAP。平台替身不证明设备解码、OCR 准确率和实际模型制卡质量；这些须用真实图片/视频与已配置模型独立验收。

2026-10-11 主机验收：`npm test -- agent`、`npm test -- media`、`npm test -- repo` 均通过；`npm run build:app -- -SkipRust` 增量签名 HAP 通过且新增警告为0。实际 Runner/Session 回归确认四帧不会在下一次模型请求前丢失，并生成带时间来源的 pending 草稿，确认前不写卡库。此次未安装设备、未调用真实模型服务；视频解码/OCR准确率和实际制卡质量不计为已验收。平台接口依据：[鸿蒙视频取帧指导](https://developer.huawei.com/consumer/cn/doc/harmonyos-guides/avimagegenerator)。

## 牌组层级操作

`propose_rename_deck(deckId, name)` 通过 `list_decks` 发现真实 ID 后提出改名，`name` 只允许当前层名称，移动父级用层级提案。工具必须单独调用，准备阶段只读；确认卡显示所选牌组及全部后代的前后路径。`AgentActionExecutor` 消费原确认账本的单次许可，将同一 `DeckRenamePlan` 交给手动入口共用的 `DeckHierarchyCommands.executeRename`，校验过期、冲突和同步占用后只调用一次 Core RenameDeck。取消、伪造、重复确认不会写入；旧计划不能覆盖刚发生的层级变化。改名支持集合撤销，本机别名保持不变。`AppInterface` 共用菜单说明及 `deck_rename` / `deck_customize` 实际状态；详情同时发布真实名称与别名，不能把别名当 Core 路径。回归为 `home-deck-rename.test.mjs`、`ai-agent-v2-runtime.test.mjs` 和真实 Core `deck_rename.rs`；手动交互见[真实改名](home.md#牌组真实改名与本机显示名称)。

JIDE 与主页拖动排序共用 `DeckHierarchyCommands.ets` 和原本机牌组顺序偏好。`get_deck_order(parentId)` 读取实际同级顺序和完整路径（含隐藏牌组），将直接子牌组 ID 登记到 Scope；0 表示顶级，其他父级必须先发现。`propose_reorder_decks` 提交该父级全部直接子牌组的一次完整排列，不能缺失、重复或混入其他父级；确认卡展示前后顺序与本机保存范围。提案只读，必须单独调用；确认执行时重查父级路径、直接子牌组与本机顺序指纹，单次保存后明确返回 `scope=device` / `synced=false`。存储失败、过期或伪造确认不返回成功。层级仍使用下述明确父级的提案；排序不提供层级写入。共同声明和真实首页发布的 `deck_reorder` 包含当前行序及可用状态。回归见 `home-deck-order.test.mjs`、`ai-agent-v2-runtime.test.mjs` 的读取 → 提案 → 确认链。

`propose_reparent_decks` 接受已发现的 `deckIds` 和 `parentId`，父级为 0 表示提升至顶级；其他目标 ID 也必须由 `list_decks` 等读取进入 Scope。这是已有牌组的层级调整，区别于 `propose_move_cards` 移动卡片和 `propose_create_deck` 新建牌组。工具通过 `AgentExtensionTools` 同时声明参数、示例和确认风险，当前工具目录与能力指纹自动更新；不能在一轮中与其他工具并发调用。

`AgentAuxiliaryTools` 只调用纯模型 `DeckReparent.planDeckReparent` 读取和准备 `reparent_decks` 提案，不持有确认执行器。确认卡显示完整前后路径及包含子牌组的说明；不以本机显示别名充当 Core 路径。用户确认后，`AgentActionExecutor` 消费绑定载荷的一次性许可，再交给与手动界面共用的 `DeckHierarchyCommands.execute` 重查子树/目标、冲突和同步占用，最终只调用一次 Core ReparentDecks。恢复 pending 提案重新登记原载荷，执行前仍校验当前层级；executing 崩溃恢复保持结果未知，不重放写入。拒绝、取消、过期及失败都不能宣称移动成功。

手动入口与当前候选、忙碌和按钮可用状态由 `AppInterface` / `DeckReparentFeature` 发布；读取到 UI 控件不赋予任意点击权限。行为和返回/退出边界见[首页](home.md#牌组展开记忆与手机详情)。`ai-agent-v2-runtime.test.mjs` 执行真实 Registry / Runner / Session / 确认执行器，覆盖读取发现、父子重叠、批量提案、确认、防伪造、过期、取消和单独调用；Core 保留卡片与记录、撤销的验证在 `native/rsharmony/tests/deck_reparent.rs`。真实模型与设备交互单独验收。

## 多牌组删除

`propose_delete_deck.deckIds` 接受非空的多个已发现 ID，一次生成一份 pending 高风险草稿；不是逐牌组强制拆成多个工具调用。`HighRiskAgentTools` 先校验每个 ID，再由 `AgentDeckDeletion.ts` 合并重复和父子重叠选择，仅为独立根生成删除操作。缺失、空数组或非法 ID 的参数错误给出 deckIds/数组索引；未发现或已经消失的 ID 给出具体 ID 和刷新建议，不再把多项请求笼统报作 invalid_tool_arguments。笔记类型删除仍是单个类型，schema 与诊断明确该限制。

`AgentDeckDeletionImpact.ets` 是只读影响计算的共同入口：从真实树收集子牌组 ID，使用 Core 的 did: 查询，不按牌组名称通配。普通牌组的影响包括借入筛选牌组的卡片（锁定 Core 的 storage/deck/cards_for_deck.sql）；删除筛选牌组将卡片归还，默认牌组由 Core 保留并重置。这些语义继续由既有牌组 Service/Core 执行，应用内 Agent 不实现自己的删除引擎。

影响数量按多个根的全部卡片、笔记和子牌组去重，合计卡片数仍受配置批次限制及1000张硬上限。每个 delete_deck 操作保留 before 树快照及 after 影响 ID 快照；AgentDraftExecutor 在准备和执行前重新校验，卡片 ID/笔记 ID 或树变化使确认失效，包括数量相同但卡片换入的情况。已有 after 为空的历史草稿兼容原树校验。写入继续要求两份不同的确认令牌；一部分操作失败时，AgentDraftRetry 仅保留失败根及其完整子牌组/卡片/笔记影响，不重做成功删除。

新草稿同时保存完整牌组路径，祖先改名也使确认失效。过程和确认预览显示完整名称，并区分普通删除、筛选牌组归还与默认牌组重置；内部影响快照用于校验，不作为“修改后内容”展示。预览文字支持系统长按复制。

回归入口：`npm test -- agent`，`ai-agent-deck-deletion-runtime.test.mjs` 直接运行真实 Registry、HighRiskAgentTools、Runner、确认执行器及重试模型；覆盖1/2/9/10个牌组、空牌组、父子重叠、批次合计、具体错误路径、确认、影响变化和部分失败。最终 `npm run verify` 验证全部主机测试及签名 HAP。设备仅覆盖安装；真实模型规划和删除交互由用户验收，不为测试删除用户资料。


JIDE 目标澄清的“选择”、目标弹窗的“新建笔记类型”、主题结果的“撤销”及联网配置的购买入口使用 LabeledActionRow，说明/状态左侧可换行、辅助按钮右侧限宽省略。联网提供商使用 FormSelectRow，额度购买说明单独一行，避免标签/提供商/购买按钮三者互挤。处理、目标加载、撤销及服务加载的禁用条件与原业务回调保留；纯布局改变不触发提供商请求。

## FSRS 评价与逐日模拟（2026-10-05）

共同声明在 [AgentFsrsTools.ts](../../entry/src/main/ets/model/agent/AgentFsrsTools.ts)，运行时在 [AgentFsrsTools.ets](../../entry/src/main/ets/backend/agent/AgentFsrsTools.ets)。三个模式使用同一声明、风险登记与真实注册；get_app_structure 的工具清单和指纹自动包含这些能力。

- `evaluate_fsrs`：评价给定的17/19/21个参数或已存参数；空数组使用 Core 默认。走 EvaluateParamsLegacy，返回历史拟合 log loss/RMSE 与实际参数、预设、搜索、截止日期。不是独立测试或健康检查，不保存参数。
- `get_fsrs_history_count`：沿用同一预设/paramSearch 和历史日期，返回 included/total，单位是非新卡卡片数。
- `compute_fsrs_memory_state`：只读计算已发现卡片的历史状态；state=null 表示无可用历史。标记 computed_from_history/saved=false。
- `propose_simulate_fsrs`：只创建提案，1–365 天，可以覆盖保持率和新卡/复习限额。原确认卡显示范围、天数和情景；AgentActionExecutor 确认后复查配置快照并调用真实 Core，逐日返回复习数、新卡数、秒数及记忆量。Core 模拟可能补存缺失 memory_state，因此不注册成只读；不保存情景参数或修改到期日。卡片/历史在提案后仍可自然变化，结果反映执行时集合；配置变化拒绝旧提案。

原 FSRS 手动面板增加单次草稿评价，直接复用 FsrsService 和集合占用、离页代次。`deck_options_fsrs` 共同 UI 声明与真实挂载观察发布当前搜索、日期、计数和评价结果；不会把待计算显示成零。字段编辑支持在 get_app_structure.noteEditing 读取，plainText 明确为默认 HTML 源码模式，字体仅使用已安装字体和系统回退。音频顺序在 cardRendering.avOrder 声明。

## 类型级 LaTeX 配置（2026-10-05）

复杂源码配置通过 JIDE 提供，复用原双重确认卡，不新增配置页面。先用 `get_notetype_details` 读取已发现类型的真实 JSON；`propose_update_notetype_latex` 接受 `notetypeId`、可选 `latexPre/latexPost/latexSvg` 与草稿理由，至少修改一项。源码各最多30000字符，省略保留，显式空串清空，false 保留为明确关闭。锁定 Core 的旧版 JSON 使用 `latexPre/latexPost/latexsvg`，工具的 `latexSvg` 映射最后一项，不能写成旧盘点中的全小写 latexpre/latexpost。

`AgentNotetypeLatex.ts` 拥有补丁、差异和回读比较；`AgentMaintenanceTools` 只读取快照及跨牌组影响、准备高风险草稿。确认卡显示真实源码及 SVG 前后值。`AgentDraftExecutor` 提交前重查完整类型快照、笔记和卡片 ID 集合，双重确认后走既有 UpdateNotetypeLegacy 并回读；未保存、回读不一致或 Core 拒绝均报告失败。字段、模板、CSS、身份及未知属性从真实原始类型保留。修改配置不会提供设备 TeX 编译或生成图片预览，已有 MathJax 与外部生成图片使用原路径。

回归见 `ai-agent-maintenance.test.mjs`：无写入提案、空串/false、两次确认、过期类型、影响变化、重复执行、失败回读、中英文差异和失败重试范围。真实 Core 往返用 `native/rsharmony/tests/notetype_text_export.rs` 验证配置、身份、未知属性及卡片调度；本轮主机执行结果见 [实施验收](../decisions/2026-10-04-ankicore-ui-routing.md#实施验收)。

回归：`ai-agent-fsrs-tools.test.mjs`、`deck-options-fsrs.test.mjs`、`deck-options-fsrs-protocol.test.mjs`、`ai-agent-app-structure.test.mjs`；真实 Core 见 `native/rsharmony/tests/fsrs.rs`，设备验收独立记录。
