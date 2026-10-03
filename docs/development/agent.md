# 应用内 Agent

[返回任务索引](../../PROJECT_CONTEXT.md)

- 本页只描述产品运行时的应用内 Agent，不描述负责修改仓库的编程 Agent；编程 Agent 规则见 [编程 Agent](coding-agent.md) 和根 [AGENTS.md](../../AGENTS.md)。
- 代码路径以下均相对 `entry/src/main/ets/`。
- 责任链：UI → 会话/Runner → 读取与提案；用户确认 → DraftExecutor / ActionExecutor → Service 或受控存储。
- 快速反馈：`npm test -- agent`；完整验收见 [验证说明](verification.md)。
- `execute_code` 已接入本地纯计算：QuickJS-NG + wasmi、独立异步 NAPI、固定资源预算及贯通取消，不获得卡库或工具权限。入口与验收见[沙箱模块](../../native/agent-sandbox/README.md)，当前验证范围见[决策记录](../decisions/2026-09-30-agent-local-sandbox.md)。

## 助手身份与产品表述

### 软件界面认知

`get_app_structure` 默认返回界面目录，指定 `surface` 才展开条目，详细设置再传 `sectionId`。`AppInterface.ts` 共用于主页/新建、牌组详情/展开/预览范围、浏览/更多/视图选项、学习/更多、JIDE/历史、提醒/编辑、统计分区和笔记新增/编辑；菜单列表、顺序与禁用判定由实际 UI 和 JIDE 共用，浏览筛选/排序直接观察 UI 真实选项。工具的 surface enum 从目录生成。`SettingsNavigation.ts`、`SettingsStructure.ts` 共同拥有设置目录、卡片顺序、名称与显隐。

`backend/AppInterfaceService.ets` 唯一拥有观察；组件挂载登记、Watch 更新、销毁移除，菜单关闭清理。`foregroundSurface` 来自 Navigation/NavDestination 显隐回调，迟到的旧页 hide 不清除新页；应用后台返回空值。`observations` 是挂载状态，可能属于被遮住的页面；指定 surface 只返回该界面观察。包括选中项、禁用项、忙碌、牌组名称/说明/计数、浏览模式/结果数量及学习阶段，不包含凭证或卡面正文。主页行、父牌组候选、浏览结果 ID 各最多100项，`optionsTotal` 表示总数。`coverage` 之外的目的地详情未知，空前台值表示未知/后台，不猜测像素或未登记内容。

能力来自本轮实际 `functionTools`，设置读写入口与当前声明取交集；知道入口不授予执行权限。结构与静态标签每次读取重建，不存长期记忆。默认目录只带挂载界面的选择/忙碌/总数摘要，`observationDetailsIncluded=false`；控件、选项和值在指定 surface 后展开，不修改原观察。工具清单不重复 schema/规则。

JIDE 页发布当前模式、历史/对话分区、发送/停止、文件解析和输入可用状态；历史组件发布实际会话名称和选中项，提醒页发布时间/标题及独立开关，编辑组件发布真实24小时/60分钟选项与新建/编辑、保存/删除状态。历史和文件名称、提醒列表均最多100项；用户名称最多160字符，`optionsTotal` 保留总数。聊天、文件正文、错误正文和表单草稿不复制到观察，仅登记数量、长度或存在状态。提醒的占位符标签目前在忙碌时仍可点击，观察保持实际行为。

统计页遍历 `STATS_INTERFACE_SECTIONS`，显隐和难度标题由 `statsInterfaceSections` 决定；`stats_sections` 描述实际分区，`stats_<分区ID>` 由原图表组件发布真实范围选项、选中项和空数据状态，重载时保留的图表明确禁用。新增/编辑笔记发布真实字段、类型选项和保存/返回状态；字段显示复用 `NoteTypePresentation` / `NoteTypeText`，图片遮盖只列实际标题/额外输入。候选最多100项，正文、草稿和媒体 URI 不进入观察。表单与加载页分别拥有 `edit_note_form` / `edit_note`，不覆盖彼此状态。

`titleKey` 支持页面/表单实际标题随模式变化；`controlsComplete` 只表示发布者已列全该界面的当前**声明控件**，据此将未出现的声明项标记隐藏，不声称已发现嵌套消息卡等未登记区域。部分观察不允许推断未列条目隐藏。同步、导入和嵌套媒体/遮罩/帮助弹层等剩余界面仍需各自 UI 状态拥有者接入，不维护另一份手写功能说明。

改版先改共同声明与原组件，新增页面由其状态拥有者登记；特殊锚点保留原布局和回调。`ai-agent-app-structure.test.mjs`、`ai-agent-page-awareness.test.mjs` 执行真实菜单/页面/表单观察及当前语言资源，覆盖状态变化、清理、隔离、模式、绑定和目录摘要；`ai-agent-app-settings.test.mjs` 验证真实 Registry 读取且零写入。学习/编辑生命周期等原回归通过 `app-interface-harness.mjs` 补入生产观察依赖；`agent-page-lifecycle.test.mjs` 执行真实批量保存与观察方法，验证首个进度回调前的忙碌状态、完成恢复和离页后继续已接受写入。未登记的手写 UI 不会自动被发现；HAP 与设备验收仍分别验证平台和实际展示。

- `AgentSessionContext.AGENT_IDENTITY_INSTRUCTIONS` 是助手身份的唯一提示来源，普通对话、带上下文的制卡/改卡入口和兼容制卡服务共用。只保留简短正向事实：助手 JIDE 属于记得闪卡；官网为 https://jidecards.com；应用面向 HarmonyOS、基于 Anki Core；原生界面和 AI 功能由记得闪卡实现，受益于 Anki 开源社区；助手通过应用工具协助学习与管理。身份段不含官方关系免责声明、模型与引擎对比、固定自我介绍示例或额外的说话约束。
- 产品与上游事实以[项目说明](../../README.md)和 [UPSTREAM.lock](../../UPSTREAM.lock) 为依据：记得闪卡基于 Anki Rust Core 的集合、模板渲染、调度和同步基础，提供 HarmonyOS 原生界面与应用内 AI 工具，受益于上游作者和开源社区贡献。
- 每轮按当前宿主生成系统指令，包括旧历史恢复后的继续和 Runner 的工具接续；旧回复里的“Anki 助手”仅保留为历史数据，不能覆盖当前身份。回归见 `ai-agent-v2-runtime.test.mjs` 与 `ai-agent-notetype-foundation.test.mjs`，执行真实提示构建与 Runner/Session 接续；提示注入正确不等于真实模型一定按要求表述。

## 统一 AI 对话入口

- 回复期间输入框可继续编辑下一条消息，发送按钮仍显示停止；本轮请求在发送时取得快照并清空已发送草稿，回复完成不清空随后输入的内容。等待澄清时仍使用既有澄清入口。
- 首页新建牌组菜单移除 AI 制卡和 AI 改卡；“更多”只保留一个名称为“JIDE”的入口，仍遵循已有开发者开关、同步等待和配置预检。该入口以 `assistant` 模式打开既有 `AiCardPage`，对话区为空，不默认选择目标或先选制卡/改卡模式。牌组详情、浏览和学习页保留带上下文的既有快捷操作。
- `assistant` 在同一 Runner/Registry 注册制卡、改卡和读取工具；普通聊天不要求草稿。素材、目的不明确时使用既有澄清；缺少制卡目标时 `request_create_target` 通过澄清暂停协议弹出已有 `DialogFrame` / `AgentSetupCard`。模型只提供问题，不提供选择框候选 ID，页面读取真实牌组和笔记类型。
- 用户确认选择后经既有 `configure_create_target` 校验真实目标，再接续同一会话。关闭选择框恢复此前目标，不持久化未确认的选择；“新建笔记类型”清空类型后让 Agent 提案，经既有确认执行器创建并取得真实 ID。改卡复用 `list_notetypes`、`search_cards` / `search_notes`、`get_note_context` 和改卡草稿；制卡与改卡继续使用原有预览及写入确认。
- 统一入口的历史列表可读取已有制卡/改卡会话，带上下文入口仍按原模式筛选。直接回归见 `ai-agent-v2-runtime.test.mjs`、`agent-history-coordinator.test.mjs` 与 `ai-agent-entry-contract.test.mjs`；模拟模型工具序列验证实际工具和接续逻辑，不代表真实模型决策质量或设备布局已验收。
- 2026-10-01 验收：完整 `npm run verify` 通过（1772 项 Node 测试、原生/沙箱/RPC 门禁、clean 签名 HAP，既有警告 268、新增 0）。SLG-W50 平板覆盖安装成功，原有牌组可见；设备确认新建菜单移除两个旧入口、“更多”只有一个“AI”、进入为空白对话且输入栏可用。本次未向真实模型发送验收请求，目标接续、建类型和改卡预览数据由实际 Runner/Registry 行为回归验证。模拟器因签名身份不一致拒绝覆盖，本次不计入统一界面的设备验收。

## JIDE 空会话提示

- 统一 `assistant` 入口在消息为空时显示 `components/agent/AgentEmptySuggestions.ets`；有消息或打开历史后卸载。制卡/改卡的目标配置保持原入口。页面只提供 NavDestination 的可见状态，组件拥有轮换、手势、剪贴板及计时器释放，不发送请求、不填写输入框。
- `model/agent/AgentSuggestions.ts` 交错轮换十类、共60条本地化建议，中英文内容在资源中。每条停留10秒，300ms淡出后切换并淡入；首次随机起点，完整循环前不重复。文案覆盖已接通的设置、学习统计、资料识别、制卡改卡、类型外观与偏好记忆，按用户要求排除联网搜索、网页读取和在线配图。
- 中央仅显示一句文字；中文显示包裹“”引号，英文使用对应双引号，显示格式归本地化资源。长按500ms复制不含装饰引号的完整原句，方便直接作为请求发送；成功提示“已复制”，失败使用已有复制失败提示。按住、鼠标悬停、复制中或目的地隐藏时取消轮换及切换任务，恢复后重新停留10秒；卸载与代次校验阻止迟到任务修改文案。
- 组件居中于顶栏和输入区之间的剩余区域，水平留白由组件独占20vp，文字最多560vp、随窄屏换行，不叠加消息流内边距。上下安全区仍由现有顶栏/输入区拥有；键盘RESIZE时在剩余空间重新居中。提示使用主题文字色，辅助复制说明仅供无障碍读取。
- 验证入口：`tools/tests/agent-suggestions.test.mjs` 执行组件真实计时、复制与销毁逻辑，校验60条中英文覆盖和联网文案排除；ArkUI观察更新、宽窄屏/深浅色、键盘、长按和悬停的最终效果须另做设备验收。

## 学习概览与复习负担

- `get_learning_overview` 在 assistant/create/edit 共用读取目录、Schema 和 `CardAgentTools` 注册，参数为 `query`（最多2000字符，空串表示全库）、`days`（含今天1–90天）、`forecastDays`（含今天1–30天）。与搜索工具一致，生成目标不限制读取，结果回传实际 query；不登记发现 ID、不推进正文读取计数、不授予写入或分析许可。
- 统计来自既有 `统计服务.获取图表统计` / Anki Core；请求历史回看 `max(1, days-1)`，避免一天请求误用 `0=全部历史`。`AgentLearningOverview` 复用 `DeckStudyHistory` 的负历史日桶聚合与 `StatsOverview.dueOverview` 的积压口径，不另算调度；首页仍默认七天。窗口最多返回90个历史日和30个预测日，Map 转为有界数组。
- history 是答题事件次数及毫秒耗时，按集合 rolloverHour 划分学习日，不是不同卡片数量。卡片状态保留含/不含 inactive 两种 Core 口径；它们和记忆率是当前快照，不受历史天数限定。无 FSRS 或无记忆状态卡片时平均记忆率为 null；有数据的0%保留为0。
- forecast 的 dueThroughToday 已含 overdue；scheduledInWindow 只合计今天至预测窗口末日，不含积压。预测未应用新卡/复习每日限额，不能当作实际可学队列；解释限额时读取 `get_deck_options`。缺少可选统计保留 null，缺少历史次数/耗时则失败，不虚报零或成功。
- 快速验证：`npm test -- agent`；直接行为回归 [ai-agent-learning-overview.test.mjs](../../tools/tests/ai-agent-learning-overview.test.mjs) 覆盖真实 protobuf 负日桶、聚合边界、Schema、Registry、Scope、失败及无授权提升；首页共用回归 [deck-study-history.test.mjs](../../tools/tests/deck-study-history.test.mjs)。Node 不证明真实模型调用或设备统计，完整构建与设备验收独立记录。

## 应用设置读取与修改

- `model/agent/AgentSettingsTools.ts` 声明设置目录、参数与示例；`backend/agent/AgentAppSettingsTools.ets` 注册真实工具。助手、制卡、改卡共用 `list_settings`、`get_settings`、`get_deck_options`、`list_theme_colors`，以及已有深浅色切换和主题色/FSRS 修改提案。目录只展示实际已接通能力，新读取项追加目录即可，不为每个开关新增工具。
- `get_settings` 支持 20 项：深浅色、系统颜色、主题色、全库 FSRS、简洁模式、首页今日进度、触觉反馈、卡片字号、牌组列表宽度、学习布局、主题动效、自动备份、自动同步、媒体同步及待同步状态、统计小时/历史窗口、语言、学习快捷操作和图表偏好。语义 ID 与范围来自目录；持久化键和默认值白名单在 `AgentPreferenceSettings.ts`，平台只读适配在 `AgentPreferenceReader.ets`。默认值仅用于不存在的保存项，IO/类型失败上抛；不枚举任意 preference/RPC，不返回密钥、同步凭证或兑换码。偏好不等于设备能力、已登录、备份数量或正在同步，跨项读取也不是事务快照。
- 主题读取区分持久化 `themeMode/colorTheme`、内存 `activeMode/activeColorTheme` 与实际 `effectiveDark`；`list_theme_colors` 返回合法 ID、种子色及当前权益可用状态。快捷操作共用设置页的兼容解析与保存队列，读取不广播 UI；图表偏好来自 Core。
- `get_deck_options` 由 Scope 校验真实 ID；保留共享预设使用数量、牌组零限额、今日覆盖开关、父预设 ID 与全局 FSRS。`AgentDeckSettings.ts` 明确列出全部公开预设字段，包含学习/重学步骤、FSRS 参数/保留率、调度顺序/间隔/限额、兄弟卡埋藏、音频、计时器和自动推进；未知原始字节不发送。数组最多 64 项、文字最多 2000 字符，`truncatedFields` 明确标记局部结果。不能把预设上限称为今日实际排程数量，也不推断调度算法。
- `propose_set_theme_color` 与 `propose_set_fsrs` 风险为 `write`，只生成 `setting_change` 动作。确认卡复用 `AgentActionCard`，显示前后值和范围；FSRS 开启说明全库重新调度，关闭不恢复原排程。`AgentActionExecutor` 消费登记的同一载荷，再校验设置 ID/类型及原值，主题权益在提交时重查。过期、篡改、重复确认失败；失败后的新提案须先重新读取，不盲目重试。
- `propose_set_setting` 在 assistant/create/edit 共用一个严格工具，只支持 `AgentPreferenceSettings.agentWritablePreferenceIds()` 中已接通的三项：`card_text_size`（50–200 的整数百分比）、`deck_list_narrow` 和 `study_haptics`（开关）。参数 `value` 使用规范字符串，例如 `"130"`、`"true"`；其余设置仍只读。它读取当前值后生成既有 `setting_change`，确认卡显示本地化名称、百分比或宽/窄、前后值及本机范围，确认前零写入。
- 三项修改复用设置页的 `saveCardTextSize`、`saveDeckListNarrow`、`saveStudyHaptics`。`utils/LocalPreferenceWrite.ets` 拥有这些键的共享串行队列，保存函数接受可选原值；确认执行在队列内重查原值，同状态不落盘，flush 与回读成功后才广播。助手读取等待已接受的保存。字号控件订阅公共值，学习/预览、牌组列表和触感继续消费既有 AppStorage 键；不改模板、调度、设备振动能力或存储协议。已有手动调用签名兼容。
- 本机偏好结果区分 `saved/applied`：保存未确认或回读失败返回 `partial, saved=false`，已确认保存但广播失败返回 `partial, saved=true, applied=false`；只恢复偏好缓存，不声称磁盘已回滚。失败确认已消费，须重新读取再提案。`ai-agent-app-settings.test.mjs` 执行真实 Registry、读取适配、确认执行器及三项保存入口；`ai-agent-local-preference-write.test.mjs` 覆盖手动写入与确认的竞争、读取等待和回读失败。Node 不证明真实模型选择工具、ArkUI 观察更新或设备交互，需独立验收。
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

澄清选项由 `AgentClarificationCard.ets` 统一呈现：原生 Radio、标题和说明组成整行点击区，固定2vp边框与20vp标记，选中不改变几何；推荐不等于默认选中，仍需显式继续。选项内边距10vp由行拥有，行间距10vp由问题容器拥有；长文本自然换行。继续复用 `PrimaryActionButton`，状态和提交仍由页面负责。Agent 补充说明和消息输入共用 `FormTextAreaStyle`；制卡字段和普通改字段草稿直接复用 `NoteFieldEditor`，保留粗体、荧光和换行的可视编辑、源码回退及 HTML 序列化，不另建富文本解析或写入入口。已保存/忙碌卡片和非 pending 变更不可编辑。输入内部四边10vp，消息输入高度仍等于右侧两个按钮及其8vp间隔。回归入口 `ai-agent-form-controls.test.mjs`；键盘与安全区仍由页面 RESIZE 和导航条高度处理。

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

- `AgentProviderContext.ts` 负责草稿语义上下文与 Provider 历史预算（最多80项、240000正文字符）；`truncateProviderText` 必须包括截断标记在内遵守额度，字段/操作丢失须标记 truncated。
- `AgentCardBatch.ts` 在第一处等待前复制整批选中字段和目标；每张卡仍经页面适配器调用 `AgentDraftExecutor.prepare/executeOrdinary`。单卡失败不中断整批，已保存卡不再创建；操作占用直到整批完成，成功才通知同步。
- 页面通过会话 ID 和消息 ID 回写状态，不能依赖异步开始时的数组索引。离页后执行器继续已接受写入，禁止访问旧 UI 或读取下一张卡的可变字段；错误文案在开始保存前固定。
- `AgentFileImport.ts` 的 `mergeAgentImportedFiles` 统一限制10个文件、160000正文字符；持久资料只提交描述，PDF 按页读取不占这个正文额度。迟到文件解析不得进入另一个会话。
- 历史列表每次打开/关闭都更新读取代次；恢复历史、新建会话和手动选择类型使旧能力响应失效。笔记类型请求还独立去重，迟到失败不能清空新选择。离页后的文件解析及历史删除只完成已接受的存储操作，不回写旧 UI；回归见 `platform-warning-boundaries`。
- `agent-page-models.test.mjs` 直接测试业务规则；`agent-page-lifecycle.test.mjs` 仅保留页面与真实模型的接线验证，覆盖离页、消息替换、整批输入与确认执行器路径。

- `AgentConversationTypes.ts` 定义持久化协议；`AgentConversationView.ts` 负责可见消息复制、历史投影和恢复，平台偏好读写留在 `AgentConversationStore.ets`。历史工具按消息 ID 归属，旧无归属记录独立展示；恢复时复制澄清和操作状态，不恢复写入令牌。
- `components/agent/AgentEditableCard.ets` 只呈现字段、选择和保存状态并上抛事件；`AgentHistoryList.ets` 只呈现历史和打开/删除事件。领域状态与执行器由页面协调，不向子组件传整个页面实例。
- 新边界直接行为测试见 `page-domain-models.test.mjs`；历史恢复覆盖原始 Provider 正文、推理、工具归属、旧记录、可变快照隔离。

## 历史编排入口

`model/agent/AgentHistoryCoordinator.ts` 拥有历史列表读取/恢复代次，协调 `AgentConversationView`、现有会话存储及 CheckpointStore。保存时冻结可见记录，checkpoint 失败不声称已保存；已接受的历史写入按序完成，删除等待先前写入，避免晚到保存重建刚删除的记录。关闭/重开列表、切换上下文、新会话和离页均使旧读取失效。

恢复把 checkpoint 交给既有 `AgentSessionController.restore` 校验，只重建显示、协议及检索进度；不恢复卡片写入令牌，不自动重新执行动作。创建模式校验牌组/类型是否仍存在，页面异步加载类型后再次核对恢复代次；编辑模式仍允许未指定目标。页面继续拥有输入、文件选择、导航与错误呈现。直接回归 `agent-history-coordinator.test.mjs`，页面接线及迟到类型结果回归 `platform-warning-boundaries.test.mjs`。

### 思考协议续接

`ProviderProtocol.ts` 是原始 Responses 续接记录的唯一格式校验入口。带工具的思考模式要求完整回传原始思考记录；页面显示的摘要不能代替它。`AgentSessionState.ts` 的检查点保留完整 `reasoning` 和白名单 `output_item`，包括原始文本、签名/加密字段与其他 Provider 元数据，不按展示文本的字符上限截断或脱敏。鉴权密钥只留在 HTTP 请求头，检查点不包含请求配置；文件正文和页面图片仍按既有规则只留指针/读取说明。原始思考记录保存在应用本地的会话检查点，随会话删除。整个请求仍受既有240000字符上限约束，超限明确失败，不能发送裁剪过的思考。

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

## 文件资料与按页制卡

输入区上方的文件状态卡片共用左右12vp内边距，成功、不支持和解析失败状态使用同一布局；右侧“移除”保留紧凑行内操作，卡片负责与边框的距离，输入区外层负责页面和底部安全区留白。

JIDE 的文件入口沿用 `AgentFileImportService.ets`，支持格式以 `AgentFileImport.ts` 为准：PDF、DOCX、PPTX、XLSX、OpenDocument、电子书、文本和图片。Word 等已有解析器继续负责转文本，不承诺保留原版式。单文件最大20MiB，单批最多10个文件；文本/压缩文档仍保留原有大小和截断提示。新 PDF 资料按需逐页读取，不使用旧一次性提取的120页/30页 OCR 上限。

- `AgentDocumentStore.ets` 在选择器授权期复制原文件到 `filesDir/agent-documents/<conversationId>/<documentId>`。PDF 导入只验证文件和页数，不预先 OCR 全书。提交后的资料在恢复会话时仍可用，删除会话时删除所属资料；未提交的暂存资料不会被模型列出。
- `AgentDocuments.ts` 提供 `list_documents`、`read_document_page`、`ocr_document_page`、`save_document_notes`，校验会话范围、页号、实际读取与取消代次。文本每次最多12000字符，返回 nextOffset/nextPage。原文、OCR 文本和 modelNotes 分开，笔记是模型解释，不作为原文或长期偏好。大任务受既有轮次预算控制，可继续读取；不能仅凭页数声称完整覆盖。
- PDF 文字提取使用 API 12 的 `getGraphicsObjects()`；不调用 API 23 的 `getTextContent()`。渲染、图像编码和系统 OCR 均使用 API 21 可用接口，兼容 SDK 不提升。OCR 无需视觉模型；失败返回真实工具错误，原文件和既有缓存保留，模型可换读法。复杂布局的文字顺序和公式不保证无误。
- 当前模型支持视觉时可 includeImage 读取单页；自定义提供商在设置中启用视觉支持，文字模型走 OCR。Responses 的 function_call_output 使用 input_text/input_image 数组，适用于兼容服务，不绑定 DeepSeek。切换文字模型时 Runner 去除历史图片。渲染最长边2400、缩放最多3倍、JPEG最多2MiB；Provider 限制8张/12MiB，常规上下文仅保留最近两张页面图片。历史保存文件页指针，不写 base64，恢复后按工具重新读取。
- `create_flashcards.cards[].sources` 接受实际读取的资料页；CardAgentTools 把经过转义的文件名和页码加入最后一个字段，用户可在既有草稿预览中编辑。原来的目标选择、草稿确认与卡库写入边界继续适用。

直接测试：`npm test -- agent`，重点为 `ai-agent-documents.test.mjs` 和 `ai-agent-v2-runtime.test.mjs`，实际运行 Store/Registry/Runner/Session；平台支架故意不提供 API 23 方法。完整验证：`npm run verify`。原生合成 PDF/OCR 测试：先覆盖安装当前主 HAP，`npm run build:app -- -SkipRust -Test` 后 `node tools/test-agent-documents-device.mjs <connect-key>`（通过 DEVECO_HOME 定位 SDK）；测试不调用模型、不访问卡库。此次用户要求仅安装，具体平板操作交由用户，未验收真机 OCR 准确率、API 21 真机或真实提供商制卡效果。决策见 [按页资料读取](../decisions/2026-10-01-agent-document-reading.md)。

## 多牌组删除

`propose_delete_deck.deckIds` 接受非空的多个已发现 ID，一次生成一份 pending 高风险草稿；不是逐牌组强制拆成多个工具调用。`HighRiskAgentTools` 先校验每个 ID，再由 `AgentDeckDeletion.ts` 合并重复和父子重叠选择，仅为独立根生成删除操作。缺失、空数组或非法 ID 的参数错误给出 deckIds/数组索引；未发现或已经消失的 ID 给出具体 ID 和刷新建议，不再把多项请求笼统报作 invalid_tool_arguments。笔记类型删除仍是单个类型，schema 与诊断明确该限制。

`AgentDeckDeletionImpact.ets` 是只读影响计算的共同入口：从真实树收集子牌组 ID，使用 Core 的 did: 查询，不按牌组名称通配。普通牌组的影响包括借入筛选牌组的卡片（锁定 Core 的 storage/deck/cards_for_deck.sql）；删除筛选牌组将卡片归还，默认牌组由 Core 保留并重置。这些语义继续由既有牌组 Service/Core 执行，应用内 Agent 不实现自己的删除引擎。

影响数量按多个根的全部卡片、笔记和子牌组去重，合计卡片数仍受配置批次限制及1000张硬上限。每个 delete_deck 操作保留 before 树快照及 after 影响 ID 快照；AgentDraftExecutor 在准备和执行前重新校验，卡片 ID/笔记 ID 或树变化使确认失效，包括数量相同但卡片换入的情况。已有 after 为空的历史草稿兼容原树校验。写入继续要求两份不同的确认令牌；一部分操作失败时，AgentDraftRetry 仅保留失败根及其完整子牌组/卡片/笔记影响，不重做成功删除。

新草稿同时保存完整牌组路径，祖先改名也使确认失效。过程和确认预览显示完整名称，并区分普通删除、筛选牌组归还与默认牌组重置；内部影响快照用于校验，不作为“修改后内容”展示。预览文字支持系统长按复制。

回归入口：`npm test -- agent`，`ai-agent-deck-deletion-runtime.test.mjs` 直接运行真实 Registry、HighRiskAgentTools、Runner、确认执行器及重试模型；覆盖1/2/9/10个牌组、空牌组、父子重叠、批次合计、具体错误路径、确认、影响变化和部分失败。最终 `npm run verify` 验证全部主机测试及签名 HAP。设备仅覆盖安装；真实模型规划和删除交互由用户验收，不为测试删除用户资料。


JIDE 目标澄清的“选择”、目标弹窗的“新建笔记类型”、主题结果的“撤销”及联网配置的购买入口使用 LabeledActionRow，说明/状态左侧可换行、辅助按钮右侧限宽省略。联网提供商使用 FormSelectRow，额度购买说明单独一行，避免标签/提供商/购买按钮三者互挤。处理、目标加载、撤销及服务加载的禁用条件与原业务回调保留；纯布局改变不触发提供商请求。
