# 应用内帮助

[返回浏览、设置与统计](browser-stats.md)

中文正文位于 `entry/src/main/resources/base/element/string.json`，英文位于 `entry/src/main/resources/en_US/element/string.json`。资源名是稳定定位入口；同一功能的标签、帮助、目录摘要需一起检查。当前行为以 UI 调用链及锁定的 Anki Core 为准，不能直接复制其他客户端的菜单位置、输入格式或功能承诺。

## 帮助入口与弹窗规范

公共入口是 `components/common/HelpLabel.ets`、`HelpButton.ets` 与 `components/字段帮助面板.ets`，索引见 [公共 UI](../../entry/src/main/ets/components/common/README.md)。更改时搜索 `HelpLabel|HelpButton|showHelp:|帮助标题:|字段帮助对话框`，同时扫描旧资源 `field_help_button`、文字 `ⓘ / ℹ / ?` 和 `info_circle` 等替代实现。不能只检查截图所在页。

- 字段、设置分组、统计标题和弹窗标题：帮助紧随所解释的文字，垂直居中；开关、范围条、选择器留在右侧。标题和帮助作为一组分配剩余行宽，标题允许两行并收缩，按钮不压缩。
- 批量操作原来把孤立帮助塞进第一排按钮，现在使用“批量操作 + 帮助”的标题行，两排操作仍保留。兑换说明同样紧随领取主题提示，并保留原有资格说明、群号和复制功能。
- 浏览卡片信息是针对一条记录的独立动作，行尾位置是有意保留的语义差异；多选时隐藏。它仍复用 HelpButton，不改变原卡片信息、FSRS 及复习记录内容。术语列表继续使用整行可点击的 DisclosureChevron；不是图标帮助，不强行改成 ⓘ。
- 原生帮助图标只在 HelpButton 内使用 `sys.symbol.info_circle`，18vp 绘制、44×44vp 点击区、透明底及 `text_secondary`，保留原生按压反馈。标题提供完整无障碍名称，按钮附加“查看帮助说明”朗读说明；禁用同时限制原生控件与回调。`monopolizeEvents(true)` 独占点击，避免触发父级设置操作或卡片编辑。

几何责任：HelpLabel 的标题与按钮之间没有额外 Row space、margin、padding 或 Blank。44vp 点击框内居中 18vp 图标，默认文字外缘到图标绘制框为 13vp（系统符号内部光学留白不在此计算内）；图标中心在按钮 (22,22)。外部 `layoutWeight` 只分配整个标题组宽度，不扩张内部文字。页面/卡片负责组外留白和安全区，宽/窄密度与有/无安全区不会再次改变标题到帮助的局部间距。较长说明行使用最小高度，不以原来的 28vp 帮助按钮或 36vp 分组头限制 44vp 点击区。最终字形和大字体仍须设备验收。

帮助正文保留中英资源及参数，在点击时读取动态笔记类型说明。所有只读说明通过字段帮助面板组合 DialogFrame / DialogHeader：居中限宽、正文限高滚动、固定右上“完成”、外部关闭，关闭不写入下层草稿。页面已有根 Stack 继续拥有显隐及最上层返回；不把弹层塞进设置卡片或统计分区。

旧版导出兼容说明、牌组选项编辑器和兑换富说明通过同文件的 `字段帮助对话框` 适配 CustomDialogController。原生弹窗覆盖窗口且原生 mask 透明，磨砂遮罩只由 DialogBackdrop 提供一次；系统返回由顶层原生弹窗消费。生命周期归属分别为数据迁移面板、DeckOptionField 与 RedemptionPanel，离开宿主关闭帮助；牌组选项先关帮助再关编辑器。牌组选项不再在表单里展开说明，编辑草稿与校验错误保留到确认/取消。富说明通过 Builder 插槽呈现，仍沿用同一外壳。

自动验证：`ui-help-entry.test.mjs` 扫描所有 ArkTS 文件（包括新文件和兼容组件），拦截散写符号和局部按钮尺寸覆盖，执行禁用、当前说明读取、返回与销毁回调；`deck-option-dialog.test.mjs` 执行草稿/校验/确认行为；已有 `ui-dialog-layout.test.mjs` 覆盖设置、浏览、统计和牌组选项的返回顺序。扫描与主机方法测试不能证明 ArkUI 渲染、事件竞争或原生弹窗栈行为。

本轮未完成的真机验收项（2026-09-28）：

- 手机竖屏/横屏与宽屏、宽/窄密度、系统安全区有/无，中英长标题及大字体：帮助紧随标题、按钮完整可点、右侧选择器/开关无重叠；重点检查查找替换、笔记类型、统计范围条和弹窗标题。
- 浅色、深色与幻彩切换后的图标对比度、按压/禁用反馈、读屏名称与焦点返回。
- 每类帮助的完成、外部点击、系统返回/边缘手势；长正文滚动时操作栏可见，背景不响应点击。
- 帮助点击不触发数据库检查、开关切换、正则选择或卡片编辑；多选模式卡片信息入口隐藏。
- 修改牌组选项后开关帮助，草稿与错误仍在；取消不保存、确认仍校验；旧版兼容/兑换说明关闭只退一层，离页不残留，兑换群号复制可用。

## 编辑工具首次学习与当前界面文案

- 帮助必须使用用户当前看得到的名称和操作。中文界面不夹带未显示的 Front / Back / Add Reverse；原始字段名和协议值留在数据层。控件从文本改成开关时，标签、ⓘ、首次学习及中英资源一起修改，不再指导填写“非空内容”。自定义类型按真实字段与模板说明，不承诺不存在的标准行为。
- 编辑器每种工具首次点击显示简短用途与操作方法；这次点击不改草稿、不切换格式。关闭或返回后再次点击才执行，已读状态由 `utils/NoteEditingHints.ets` 持久保存；失败可见且仍可重试。新增、浏览、学习共用同一已读状态。
- `NoteFieldEditor` 的加粗/斜体/下划线/荧光支持可视输入：无选区时切换后续输入格式，选区操作仅作用于选区，不改变持续输入状态。公式和挖空仍为一次插入标记，学习卡面负责公式渲染。可视模式 Enter 与“换行”都保存为 HTML 换行；源码模式的普通回车只是源码换行。
- 标准可选双向类型展示为“问答题（可选双向）”，第三字段使用“同时生成反向卡”开关；已有笔记说明关闭不会删除已生成卡片，可通过当前“查找空卡”入口处理。标准模板以 `NoteTypePresentation.ts` 检查；被自定义的模板保留原字段输入，不用开关覆盖有意义的字段内容。
- `note_editor_hint_*` 是按名称读取的资源族，不因没有静态引用而删除。回归入口 `tools/tests/note-rich-editor.test.mjs`，Core 生成/保留行为见 `native/rsharmony/tests/note_editing.rs`。
- 挖空按钮说明 `note_editor_hint_cloze_next` / `note_editor_hint_cloze_same` 与类型帮助 `add_note_notetype_cloze_help` 同步解释编号、卡片数量和隐藏内容：新挖空新增编号，同组挖空沿用当前最大编号，没有挖空时均从 c1 开始。正文用“北京是中国的首都”的 c1/c2 示例说明两张卡各隐藏一处和同一张卡同时隐藏两处；编号规则以 `model/NoteFieldEditing.ts` 的 `nextClozeNumber` 为准。

## 术语与过时内容维护

界面统一使用“撤销”“同笔记卡片”“筛选牌组”“今日跳过（埋藏）”“可回忆率”。SM-2 的 ease 称“易度”，FSRS difficulty 称“难度”，避免把易度升序误写成难度升序。目标记忆保持率是 FSRS 调度目标；实际记忆保留率按合格记录计算；评分通过率把非 Again 评分计为通过，不能当作选择题答对率。首页与桌面卡片的 `t(中文, 英文)` 文案也属于审计范围，不能只更新 string.json。内部字段和协议键保持稳定。

欢迎页采用无硬编码版本号的常驻入门说明；实时公告负责发布消息。直链渠道由发布开关隐藏，其保留说明不得引导到当前不存在的菜单，也不能再宣称应用只能单机使用。备份／许可简介中的数据存储说明需同时承认可选同步。

淘汰的语音设置页、旧首页导航、旧评分引导、旧选项别名和旧 AI 设置文案已按真实调用清理。删除资源前检查 ArkTS/TS、模块与桌面卡片配置以及按名称读取；`browser_action_flag_*` 和 `theme_color_*` 是动态资源族，不能仅凭无字面量引用判断未使用。当前仍展示的 Anki 兼容保留字段标明“不生效”或“仅保存配置”，不改变锁定协议和已有配置数据。

## 正文与事实来源

以下代码路径相对 `entry/src/main/ets/`；Core 路径相对锁定 checkout 的 `rslib/src/`。

| 正文入口 | 当前约束与事实来源 |
| --- | --- |
| `settings_home_today_summary_hint`、`settings_directory_general_hint` | 首页开关控制整个统计区域；`pages/首页.ets`、`components/home/主页摘要分页.ets` 的 Swiper 内容决定可见卡片。 |
| `browser_help_find_replace_body`、`browser_find_scope_all` | 范围是提交时的完整搜索结果快照，包含未加载页；空结果不提交。`pages/浏览页.ets`、`model/BrowserSelection.ts`；Core `findreplace.rs` 只替换字段。 |
| `browser_find_regex_help` | 默认不启用多行模式，逐行锚点需 `(?m)`；Core `search/service/mod.rs`、`findreplace.rs`。 |
| `browser_help_batch_body` | 明确卡片／笔记模式作用范围、删除和替换的会话撤销限制、模板映射可能删除／新增卡片、完整同步双向选择。Core `card/service.rs`、`notetype/notetypechange.rs`。 |
| 同上：到期日／重排位置 | 有 FSRS 记忆状态时不保证保留间隔；随机打乱笔记后按步长分配位置，同笔记卡片共享位置。Core `scheduler/reviews.rs`、`scheduler/new.rs`。 |
| `browser_help_sidebar_body` | 长按标签先开操作菜单；牌组长按直接追加搜索。`components/browser/浏览侧边栏.ets`。 |
| `glossary_delete_help`、`glossary_browser_info_help` | 撤销在学习页“更多”；卡片信息中的类型是模板名，不是队列状态。`pages/学习页.ets`、`components/browser/卡片信息.ets`。 |
| `add_note_notetype_basic_type_answer_help` | 输入框在问题面、比较在答案面；Core `notetype/stock.rs`，前端 `model/StudyAnswerRenderer.ts`。 |
| `deck_learnSteps_help`、`deck_relearnSteps_help`、`settings_fsrs_help` | 当前表单只接收正数分钟，不支持单位后缀，可留空；校验提示同步表单真实范围。`model/牌组配置表单.ets`。SM-2 与 FSRS 的毕业／短期学习不同，Core `scheduler/states/learning.rs`、`review.rs`。 |
| `deck_minimumLapseInterval_help`、`glossary_lapse_help`、`deck_lapseMultiplier_help` | 遗忘间隔系数及最小间隔只作用于 SM-2；0 不会重置为新卡。FSRS 空步骤仍可能自动短期重学。Core `scheduler/states/review.rs`。 |
| `deck_initialEase_help`、`deck_graduatingIntervalEasy_help`、`deck_intervalMultiplier_help`、`deck_maximumReviewInterval_help` | 首次毕业间隔不先乘初始 ease；简单毕业间隔的大小关系是建议；间隔倍率不代表全库所有间隔；到期不等于必定展示。Core `scheduler/states/` 与 `model/DeckConfigSave.ts`。 |
| `deck_reviewOrder_help`、`deck_newCardGatherPriority_help` | 可回忆率递减为高概率先；按牌组收集使用名称顺序，不随首页拖动。Core `storage/card/`、`storage/deck/active_deck_ids_sorted.sql`。 |
| `deck_fsrsParams4_help`、`deck_fsrsParams5_help`、`deck_fsrsParams6_help` | 非空 v6 → v5 → v4 回退；全部空才默认。Core `deckconfig/mod.rs`。 |
| `deck_fsrsEnabled_help`、`deck_paramSearch_help`、`deck_fsrsHealthCheck_help`、`settings_algorithm_deck_options` | 启用后在牌组选项优化当前/全部预设、模拟学习负担，计算结果先保留为草稿，保存后生效。参数搜索决定优化训练范围；健康检查在优化时按开关执行，保留无法评估状态，不是保存时修库。责任与真实 Core 验证见 [FSRS 领域说明](browser-stats.md#fsrs-参数优化与学习负担模拟)。 |
| `deck_historicalRetention_help`、`deck_ignoreRevlogsBeforeDate_help` | 历史保持率为缺失历史的计算假设；日期截止也参与记忆状态初始化／重算，不删除历史，不保证单独改日期立即重算。Core `scheduler/fsrs/`、`scheduler/answering/mod.rs`、`deckconfig/update.rs`。 |
| `deck_desiredRetention_help`、`glossary_fsrs_retention_help` | 目标不是实测通过率，不承诺固定官方范围或实际正确率。 |
| `deck_easyDaysPercentages_help` | 周一到周日；1=正常、0=最低、其余=减少，不解释为连续精确百分比。Core `scheduler/states/load_balancer.rs`。 |
| `deck_reviewToday_help`、`deck_newToday_help`、对应 Active 帮助 | 保存未启用项清除覆盖，0 必须保留；次日回退本牌组再预设。`model/DeckConfigSave.ts`、`proto/messages/DeckConfigMessages.ts`；Core `decks/limits.rs`。 |
| `glossary_siblings_help`、`deck_buryInterdayLearning_help`、`deck_interdayLearningMix_help` | 跨日指跨学习日切换，不是固定超过 24 小时；区分当日与跨日学习。Core `scheduler/answering/learning.rs`、`scheduler/queue/builder/burying.rs`。 |
| `deck_leechAction_help` | 只说明已接入的标签／暂停效果，不承诺未经验证的提示。Core `scheduler/answering/mod.rs`。 |
| `stats_help_retention`、`stats_help_today`、`stats_help_buttons` | 使用提交的评分统计，非 Again 为通过；选择题错误自动 Hard 也计为通过，因此不是选择题答对率。保留率逐条累计，无每日首次去重。Core `stats/graphs/` 与 `model/JideChoice.ts`。 |
| `stats_help_card_counts`、`stats_help_hours` | 暂停可来自难卡处理；小时统计按合格日志次数，不按卡片去重。Core `stats/graphs/card_counts.rs`、`hours.rs`、`buttons.rs`。 |
| `stats_help_ease`、`stats_help_retrievability` | SM-2 易度与 FSRS 难度的轴／颜色方向不同；可提取性只平均有记忆状态的卡，笔记掌握量另算。`components/stats/`；Core `stats/graphs/retrievability.rs`。 |
| `stats_help_forecast`、`stats_help_added` | 长范围多天合并一柱；预测是当前排期汇总，不是后续复习过程模拟。`components/stats/预测卡.ets`、`新增卡.ets`。 |
| `glossary_ratings_help`、`glossary_shortcuts_help`、`settings_tap_zones_hint`、自动前进与布局帮助 | 区分普通闪卡与选择题。选择题自动 Good／Hard，不走普通翻面、四档评分、Tap Zones、自动前进与浮动评分工具栏。R 的音频范围遵循跳过问题选项。`pages/学习页.ets`、`model/StudyTiming.ts`。 |
| `transfer_legacy_help` | Legacy2 为 Anki 2.1 兼容格式；牌组／集合决定 apkg／colpkg，文件包不等于增量同步。`backend/DataExportWorkflow.ets`；Core `import_export/package/meta.rs`。 |
| `redemption_contents_eligibility` | 沿用 `docs/REDEMPTION.md` 的 3.0.0 之前老用户赠送政策；补充资格由开发者核实，应用不自动判断使用时间；兑换校验实现不变。 |
| `custom_study_preset_*_hint` | 预览新卡是过去 N 天添加且尚未学习的卡片，按添加顺序收集，不是未来 N 天、也不是每日展示一张。遗忘预习不改原调度；提前复习会重排。Core `scheduler/filtered/custom_study.rs`。 |
| `empty_cards_description`、删除确认 | 按笔记列出空卡，不表示整条笔记都无效；只删除空卡，最后一张卡删除时才删笔记。当前使用可撤销的卡片删除服务，但本页无撤销入口。`components/settings/空卡列表面板.ets`；Core `notetype/emptycards.rs`、`card/service.rs`。 |
| `stats_help_calendar`、`stats_help_interval`、桌面卡片简介 | 年历显示答题次数，不是未来日程；间隔范围是横轴上限／分位点，不是历史时间窗口。桌面卡片实际为八页统计，无旧月历页。`components/stats/日历卡.ets`、`间隔分布卡.ets`、`widget/pages/统计卡片.ets`。 |
| `add_note_notetype_basic_optional_reversed_help`、`glossary_fuzz_help` | 可选反向模板用开关控制；Core 底层仍按字段非空生成卡片。学习随机等待上限为步骤时长的 25% 且不超过 5 分钟。Core `notetype/stock.rs`、`scheduler/answering/learning.rs`。 |

## 验证与维护

行为回归先执行 `npm test -- browser` 与 `npm test -- ui`；限额保存、optional 0 编码和搜索快照另有 `deck-config-save.test.mjs`、`page-operation-boundaries.test.mjs` 直接回归。最终使用 `npm run verify`，包括全部 Node、原生及签名 HAP。不为每句自然语言创建锁死措辞的测试；通用资源检查负责中英键一致性与格式。

`i18n-contract.test.mjs` 检查中英占位符参数与类型一致、键唯一、源码与模块/桌面卡片声明的资源引用可解析，并覆盖当前两组动态名称资源。此检查不能证明自然语言语义或所有计算型资源引用正确；清理资源仍需阅读调用点。

设备验收需分别检查帮助弹层可滚动、中英文切换、首页卡片开关、搜索范围与空结果、今日限额关闭／零值保存及重开。主机测试和 HAP 构建不替代设备行为。


### 公式提示与帮助复核

公式按钮只写入行内分隔符，复用 `rawfile/mathjax/card-math.js` 的既有离线 MathJax 3.2.2、mhchem 和 MathML 输入能力，不是新的计算引擎，也不编译完整 LaTeX 文档。`note_editor_hint_math` 给出数学与化学示例、英文半角与括号规则、行内/独立成行边界和编辑代码/卡面排版差异。既有 `[latex]` 内容依赖已生成的媒体文件，与 MathJax 按代码即时排版不同。参考本地 AnkiDroid `Toolbar.kt` 与 `MathJaxFormat.kt`；它的长按选择三种公式格式尚未在本应用实现。

本轮复核公共帮助调用点与帮助资源（牌组选项、设置/同步、浏览、统计、添加、术语、旧格式导出及兑换说明），修正查找替换中不应固定为 Front/Back 的字段指引，并去掉统计及术语中不必要的英文名称。FSRS/SM-2、实际 leech 标签、搜索表达式、正则和数学语法保留，因为它们是功能或输入本身。此复核针对当前界面文案/接线，不宣称重新验证所有调度数学或每处弹窗真机外观。
