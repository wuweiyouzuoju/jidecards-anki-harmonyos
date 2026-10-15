# 公共 UI 代码索引

`DialogHeader.actionIcon` 允许新建等明确动作复用已有图标；未指定时仍用共享确认勾号。普通图标保持标题两侧的44vp热区；`DialogHeader.isPageToolbar` 供独立牌组选项页复用标题动作，将弹窗底部8vp留白与48vp最小高度切换为页面44vp顶栏，首块内容间距由页面独占；可见文字操作单独排在标题下方，复用可换行、按内容增高的按下态按钮。名称、危险色和忙碌守卫仍由原调用方提供。笔记类型管理的加号通过此入口提供，卡片底部动作沿用按下态按钮。

`按下态按钮.preserveInputFocus` 用于编辑器令牌等辅助输入动作，点击时保留原输入框焦点；默认关闭。`autoHeight` 默认关闭，普通按钮保持44vp；文字标题操作开启后以44vp为最小高度并随换行增高。填满按钮的文字占扣除图标后的剩余宽度，内边距由组件独占。`disclosure/expanded` 复用 `DisclosureChevron` 表达可展开入口及当前展开状态，浏览页模式、状态和排序沿用此入口；持续选中仍走已有 `selectable/selected` 的描边和字色。

`DirectoryTree.searchPlaceholder/emptyLabel` 允许领域适配提供搜索与空状态文案，默认仍为目录文案；搜索几何、输入行为和过滤由树独占。`TagTreeList.searchable` 默认关闭，浏览筛选侧栏开启后与牌组目录共用同一个树内搜索框；宿主分区正文各贡献一次16vp边距，不再在标签外层复制输入框。标签编辑等原外部查询入口保留默认行为。

目录触发入口固定保留右侧 `DisclosureChevron`，文字占剩余空间并省略；内部内容与按钮共用限宽和内边距。圆角必须在 Button.border 之后设置。模拟器布局与交互验收见[公共目录树](../../../../../../docs/development/appearance.md#公共目录树)。

层级候选唯一渲染入口是 [DirectoryTree.ets](DirectoryTree.ets)，表单中的目录选择用 [DirectorySelect.ets](DirectorySelect.ets) 打开同一棵树；内部窗口 [DirectorySelectDialog.ets](DirectorySelectDialog.ets) 只组合 DialogFrame 与目录。目录入口通过 [FormSelectRow.ets](FormSelectRow.ets) 的 `useCustomControl/customControl` 复用已有标签与帮助布局，触发控件和树内单选背景共用 SelectStyle 的字体、16vp圆角、1vp轮廓和选中色；不将单选变成复选框。搜索、临时展开、缩进、44vp 行、虚拟列表和选中状态由公共入口拥有，宿主传稳定 ID、完整路径、真实候选及回调。纯展示契约和折叠策略见 [DirectoryTree.ts](../../model/DirectoryTree.ts)，领域候选/草稿/写入留在原功能。标签薄适配 `TagTreeList` 不再渲染另一套列表。调用检查与行为回归见 `ui-directory-tree.test.mjs` 和 `ui-select-layout.test.mjs`；边距、模式和合理差异见[公共目录树](../../../../../../docs/development/appearance.md#公共目录树)。

界面动效参数共用 [MotionStyle.ts](../../model/MotionStyle.ts) / [AppMotion.ets](../../utils/AppMotion.ets)：菜单表面、弹窗、箭头和 PressFeedback 消费克制/灵动档位；按压由属性修改器即时反馈，不在 modifier 内调用不受支持的 animation。设置保存与 JIDE 接线、导航和卡片内容边界见[界面动效](../../../../../../docs/development/appearance.md#视觉与交互一致性)。

页面栈、设置分组及手机牌组详情的前进/返回共用 [SurfaceTransition.ets](../../utils/SurfaceTransition.ets)；覆盖预览只淡入淡出，常驻宽屏侧栏选项变化不当作导航。普通弹窗与蒙层也由此入口合成，宿主不另包转场；CustomDialogController 使用公共动画参数并每次打开时取当前档位，内部 DialogFrame 传 nativeHost=true 禁用重复效果，由平台拥有窗口几何。详情见上述规范，检查入口为 `motion-style-surfaces.test.mjs`。

导入结果类别复用 `DataActionRow` → [SettingsActionRow.ets](SettingsActionRow.ets)。`showDisclosure=false` 可隐藏没有目标的尾部箭头；`isInteractive` 仍独占点击与禁用守卫，不能用箭头显隐代替操作校验。新增音频设置复用 `SettingsToggleRow`，筛选牌组维护沿用现有详情按钮与 `GlassSurface`、列表的公共菜单行。

`SettingsActionRow` 的尾部默认使用共用箭头；传 `expanded` 时复用同一行和箭头槽位表达展开/收起：与 `AnchoredMenuItem` 一致，收起向右、展开向下，中心为 50%/50%，动效复用 `disclosureAnimation`。未传时保持普通导航方向，标题与正文操作行使用相同水平边距。录音、暂停等直接执行的动作可传 `trailingIcon`，由公共 `ActionIcon` 在相同24vp槽位显示图标，完整行仍拥有点击、按压与禁用守卫。音频录制主行显示当前状态：空闲麦克风、录制中麦克风带声波、暂停后为斜杠麦克风；独立的暂停/继续行显示暂停/播放图标。音频附件右上角的删除复用 `IconActionButton` 的44vp热区；传 `cornerAligned` 将图标靠右上并在热区内留4vp，默认仍居中，不以文字大小缩小点击范围。

菜单图标与文字的对齐责任在 [MenuItem.ets](MenuItem.ets)：同一 Row 按 `labelAlignment` 成组居中或靠左，图文间隔8vp，不另叠图标或用文字 padding 补槽。首页平面菜单默认整组居中；卡片动作菜单显式整组靠左。箭头完整24vp及8vp间隔由公共行右侧预留，居中行对称预留。菜单宽度与10vp左右留白共用 [应用尺寸.ets](../../utils/应用尺寸.ets)，固定宽度各档已统一收紧8vp，44vp点击行高保留。`AnchoredMenu` 的左右边缘与同一限宽工具栏的按钮外缘对齐，不额外叠加外边距。回归：`ui-select-layout.test.mjs`、`ui-shell-contract.test.mjs`。

直接露出的顶栏导航和详情工具用 `IconActionButton.toolbarStyle` 的简笔描边与透明填色；更多/设置等菜单条目用 `ActionIcon` / `MenuItem` 的明暗灰色内填色。两套呈现按所在入口区分，不能将菜单灰色填充带进直接导航；共享同一语义 SVG 不代表共享填色规则。具体几何、主题边界及回归见[直接导航与菜单图标](../../../../../../docs/development/appearance.md#直接导航与菜单图标)。

菜单安全边界由通用纯布局模型 [WindowSafeLayout.ts](../../model/WindowSafeLayout.ts) 计算，EntryAbility 发布系统栏、摄像头挖孔和导航条的实际边缘并集。AnchoredMenu 将顶部位置与滚动高度限制在这个区域内，横屏同时留出侧边挖孔；首页的更多和新建同样复用公共 AnchoredMenu，无尖角。各页面顶栏与菜单锚点的 pageToolbarTop/pageToolbarHeight/pageContentTop 同时消费安全上缘；普通系统栏保留光学校准，额外挖孔从实际边缘加一份分组间距起算。它只处理矩形、尺寸与边界，不依赖业务或平台 IO。DialogFrame 将搜索和表单弹窗居中于实际安全矩形，并按安全高度限制正文滚动；键盘缩小后的内部视口固定从外壳顶部开始，再在该视口内居中卡片，避免父级再次居中后裁切正文底部。遮罩保留覆盖整个窗口。

长字段展开、链接与源码选区动作统一在 `NoteFieldEditor.ets`，复用 `NoteLinkDialog.ets` 的公共弹窗；旋转与握姿布局由 [NoteEditorWheel.ets](../editor/NoteEditorWheel.ets) 拥有，纯几何与工具状态在 [NoteEditorWheel.ts](../../model/NoteEditorWheel.ts)。添加/编辑/Agent 页面 Provide 同一表单会话 `NoteEditorWheelSession`，字段 Consume 后默认首字段、点选切换、失焦保留；7个工具各带图标下方名称，页面隐藏会暂停会话。HTML 选区规则在 [NoteHtmlTools.ts](../../model/NoteHtmlTools.ts)，富文本往返在 [NoteRichText.ts](../../model/NoteRichText.ts)。回归：`note-html-tools.test.mjs`、`note-rich-editor.test.mjs`；[格式与设备边界](../../../../../../docs/development/browser-stats.md#基础字段编辑与草稿保护)。

字段外观配置由 [NoteFieldEditing.ts](../../model/NoteFieldEditing.ts) 的纯类型提供；Core 解码和宿主传递配置，公共组件不直接依赖 protobuf。NoteFieldEditor 消费 RTL、已安装字体/字号、描述和默认 HTML 源码；NoteFieldCard 消费初始折叠。图片遮罩标题/补充字段复用卡片并关闭普通媒体入口；图像与遮罩保持专用输入。


顶栏的返回、更多、新建提醒、新建会话和历史入口统一复用 `IconActionButton` 的 `toolbarStyle` 样式，与主页按钮共用卡片底色、1vp边框、卡片圆角和实时主题色图标：返回箭头、更多省略号、新建加号、历史回转时钟；`NoteEditorHeader` 的返回及 `DialogHeader` 的关闭也走此入口。模式按钮由 `AppInterface.SETTINGS_HEADER_ITEMS` 生成，简洁版为叶子、实验版为烧瓶，实际按钮只显示图标，模式选择菜单保留完整名称和选中态。退出仍调用原忙碌/草稿守卫，完整名称继续供无障碍朗读和 JIDE 使用；普通弹窗的确认、保存、完成和说明已读默认使用右侧勾号，复用同一 `IconActionButton.toolbarStyle` 与左侧叉号对应；完整 `actionLabel` 继续供读屏使用。危险动作自动保留文字，继续/切换、下载/迁移、检查/查找、新建子弹窗、风险确认和忙碌提示由宿主传 `showActionLabel` 保留可见文字。原生系统确认框及正文操作按钮沿用原形式；UI 与 JIDE 共同读取 [InteractionFeedback.ts](../../model/InteractionFeedback.ts) 的 `DIALOG_ACTION_PRESENTATION`，不按当前语言的文字猜测操作含义。`DialogHeader.showCloseLabel` 仅用于引导中的进入/跳过、忙碌传输的取消和风险确认，普通关闭保持叉号，返回可传 `closeIcon` 箭头。页面安全区、顶栏高度和左右边距由原宿主拥有，图标内部不叠外边距，44vp点击区在窄/宽布局一致。

牌组预览范围弹窗在手机详情和宽屏入口都复用无尖角的 `AnchoredMenu` / `ActionMenuList`，保留实测锚点、外部关闭和范围选择；表面由 `MenuSurface` 拥有。

修改同类 UI 前先从此表进入实现，再用符号名全仓搜索调用点；同时搜索旧符号、资源键和替代写法，避免只覆盖已复用的页面。新增公共语义入口时更新本表及调用检查，不逐页复制组件。

新增基础组件仅直接依赖 common、通用布局/主题模型和 UI 工具，不引入业务 backend、其他功能组件或平台 IO。现有笔记、标签和标记组件暂保留跨入口共享位置，其逐条迁移例外由 `tools/tests/common-boundary.test.mjs` 管理；新增组件不能继承例外，迁出时同时删除例外。该检查也要求每个公开 `.ets` 在此索引有真实文件链接；仅内部实现可标记 `@internal`。检查覆盖字面量直接依赖，完整依赖解析、环和纯模型隔离仍由 architecture-boundaries 检查。

标签编辑共用 [NoteTagsField.ets](NoteTagsField.ets)、[TagPicker.ets](TagPicker.ets) 和 [TagTreeList.ets](TagTreeList.ets)：字段与选择回写宿主草稿，树列表只展示完整路径并转交操作；浏览批量弹窗和筛选侧栏共用模型/列表。基线、三态、过滤及差量更新在 [NoteTags.ts](../../model/NoteTags.ts)，[回归](../../../../../../tools/tests/browser-note-tags.test.mjs) 覆盖新增/已有/兼容编辑入口和迟到读取。可选标签放入公共卡片底色的圆角框，前置原生复选框、整行选择；短列表按44vp行收缩，长列表限高滚动。容器边距与树形缩进责任见 [标签边界](../../../../../../docs/development/browser-stats.md#标签选择与管理)。

普通次操作复用 [按下态按钮.ets](按下态按钮.ets)，`fillWidth` 仅供需要满宽的提案/表单操作使用，默认仍保留内容宽度；组件内禁用守卫阻止迟到点击。选择工具也复用该按钮，通过 `selectable`、`selected`、`selectionColor` 表达持续选中态；未传 `selectionColor` 时由组件订阅 `颜色键.动作主色`，字段编辑模式、白板及图片遮罩工具随主题更新，`markerColor` 继续表达独立业务颜色。高度、字号、内边距和圆角仍只有公共组件一个来源。选择按钮的边框宽度固定，`GlassSurface` 在普通、按压和禁用状态均保留传入的描边；普通按钮的默认外观不变。Agent 提案确认与取消分别组合 `PrimaryActionButton` 和该按钮，不另写按钮几何；回归见 `ai-agent-markdown-ui.test.mjs`、`ui-shell-controls.test.mjs`、`theme-text.test.mjs`。

| UI 语义 | 唯一实现 | 自动检查 |
| --- | --- | --- |
| 加载、空内容和错误状态 | [统一加载态.ets](统一加载态.ets)、[统一空态.ets](统一空态.ets)、[统一错误态.ets](统一错误态.ets)；加载尺寸来自公共 token，默认文字走中英资源；错误态仅在提供 onRetry 时显示动作，动作共用 [按下态按钮.ets](按下态按钮.ets) | `ui-common-state.test.mjs` 验证本地化与可选回调；最终图标、按钮与读屏另需设备验收 |
| 根主题背景与主题强调文字 | [ThemeBackground.ets](ThemeBackground.ets)、[ThemeText.ets](ThemeText.ets)；幻彩1–2字标签共用色板第二色（浅色紫、深色浅紫），3字及以上共用前两色渐变；背景订阅 AppLifecycleState 与 ThemeCatalog，不从兑换协议读取生命周期或动画键 | `theme-text.test.mjs`、`redemption.test.mjs`、`motion-style-contract.test.mjs` |
| 卡片标记与旗标展示 | [CardMarkingBadge.ets](CardMarkingBadge.ets)；固定旗标语义与本地名称来自 CardMarking，业务依赖为显式迁移例外 | `card-marking.test.mjs`、`browser-flag-names.test.mjs` |
| 笔记链接草稿弹窗 | [NoteLinkDialog.ets](NoteLinkDialog.ets)；编辑器提供选区与确认回调，链接校验来自笔记模型 | `note-rich-editor.test.mjs` |
| 菜单、设置与状态图标 | [ActionIcon.ets](ActionIcon.ets)：默认18vp，状态徽标可用14vp；装饰图标不接收点击/朗读，描边使用成对明暗 SVG。`tint` 管理内填色，`strokeColor` 仅接受六位十六进制色并保留透明度；设置语义由 [SettingsIcons.ets](../../utils/SettingsIcons.ets) 映射，学习/预览/浏览多选动作由 [ActionIcons.ets](../../utils/ActionIcons.ets) 映射，同义动作复用首页/学习资源 | `ui-settings-components.test.mjs` 检查目录和明暗几何、执行染色透明度回归；菜单行为分别由 `study-menu-actions.test.mjs`、`browser-batch-menu.test.mjs`、`preview-runtime.test.mjs` 验证 |
| 仅图标的关闭、移动与年份操作 | [IconActionButton.ets](IconActionButton.ets)：默认44vp圆形点击区，首页六个入口复用同一按钮高度 token，极窄窗才共同收缩，保留圆角矩形表面，矩形圆角复用统计卡的 `圆角_卡片`，圆形仍由直径计算；borderRadius 在 border 之后设置；保持纯图标和完整本地化朗读名称、按压反馈与禁用迟到点击守卫；调用方拥有可用边界与回调，图片上的关闭使用白色图标和深色底 | `ui-settings-components.test.mjs` 执行禁用守卫；`stats-calendar-runtime.test.mjs`、`notetype-management.test.mjs` 保留业务边界回归；HAP/设备验证几何、主题与读屏 |
| 设置目录、维护、关于与术语入口 | [SettingsActionRow.ets](SettingsActionRow.ets)：统一图标、标题、可选说明/帮助、箭头、按压和禁用守卫；DataActionRow 是维护/备份的兼容入口。行无水平边距，说明自然换行；QQ群富说明由宿主 Builder 提供 | `ui-settings-components.test.mjs` 执行迟到禁用点击、检查入口复用；业务继续由原设置宿主和既有行为回归负责 |
| 文字左、选择框右的表单行 | [FormSelectRow.ets](FormSelectRow.ets)：12vp 间隔、标签占剩余宽度且可换行、普通枚举右侧按内容占宽并限于56%；目录值由 DirectorySelect 实测内容宽度并限于70%，保留完整公共箭头。颜色预览使用可选 valuePreview 插槽。普通枚举保留完整名称和选项，ImportSelect 的列映射也委托此行；层级牌组/标签候选使用 DirectorySelect / DirectoryTree；同级行距与说明间距共用 [FormRowLayout.ets](../../utils/FormRowLayout.ets)，规范见[公共表单控件](../../../../../../docs/development/appearance.md#公共表单控件) | `ui-compact-controls.test.mjs` 执行禁用、越界和完整名称回归；`ui-select-layout.test.mjs` 扫描原生几何 |
| 说明或状态左、辅助按钮右 | [LabeledActionRow.ets](LabeledActionRow.ets)：复用按下态按钮和上述限宽，默认按钮文字沿用 `text_primary`；需要强调时由宿主传入主题色，`compactLabel` 使用小正文说明、`actionIcon` 复用可选按钮图标，长按钮文案单行省略；整表提交与危险确认保留原操作区 | `ui-compact-controls.test.mjs` 执行禁用回调及色值保留；宽窄布局仍需设备验收 |
| 幻彩主题预览 | [IridescentThemePreview.ets](IridescentThemePreview.ets)：速览与启动/锁定领赠说明共用已有截图、260vp 限宽及原始比例 | `theme-iridescent-gift.test.mjs`；实际滚动与图像显示另需设备验收 |
| 白字实底主操作按钮 | [PrimaryActionButton.ets](PrimaryActionButton.ets)：登录、保存配置和开发者启用共用高度、字号、圆角、按压反馈和禁用守卫；默认订阅 `颜色键.主色按钮背景`，宿主可显式覆盖颜色并提供完整可用条件；与次操作共用 `hasActionStatus`，idle/空值/未知状态不留空槽 | `ui-shell-controls.test.mjs` 执行主题切换、显式覆盖、禁用回调并扫描同类散写；`ui-action-status-layout.test.mjs` 执行实际显隐分支和图标尺寸；既有同步/应用内 Agent 测试保留业务验证 |
| 单行表单输入外观 | [FormInputStyle.ets](../../utils/FormInputStyle.ets)：统一卡片底色、边框、字号、圆角；默认水平内边距10vp，牌组/自定义学习沿用外层卡片内边距；密码、数字、过滤、提交与焦点仍用原生 TextInput | `ui-shell-controls.test.mjs` 执行真实样式并扫描完整重复样式；HAP/设备验证原生更新与键盘 |
| 多行表单输入外观 | [FormTextAreaStyle.ets](../../utils/FormTextAreaStyle.ets)：与单行表单共用视觉规范，四边10vp内边距；高度、焦点和编辑行为仍由原生 TextArea 调用方负责。Agent 补充和消息引用；笔记草稿使用富文本编辑器 | `ai-agent-form-controls.test.mjs` 执行样式并扫描全部 Agent TextArea；HAP/设备验证 |
| 数据管理与完整备份操作行 | [DataActionRow.ets](../settings/DataActionRow.ets)：数据分组和备份页共用标题、说明、箭头及可增长行高，水平边距归外层 | `import-flow-contract.test.mjs`；业务流程由 `import-options-runtime.test.mjs` 验证 |
| 内置笔记类型与字段的本地化显示 | [NoteTypeText.ets](../../utils/NoteTypeText.ets) / [NoteTypePresentation.ts](../../model/NoteTypePresentation.ts)；字段标题与提示统一由 NoteFieldCard 调用，保留原始名称与模板引用 | `note-type-i18n.test.mjs`；边界见 [浏览与编辑](../../../../../../docs/development/browser-stats.md#内置名称的统一显示) |
| 新增/编辑顶栏与字段卡片 | [NoteEditorHeader.ets](NoteEditorHeader.ets)、[NoteFieldCard.ets](../editor/NoteFieldCard.ets)；独立 EditNotePage 和新增页共享，草稿归宿主；新增页隐藏顶栏单次保存，底栏组合既有按钮；固定开关只由新增宿主传入 Core sticky 与回调，已有编辑默认隐藏；卡片内部16vp，宿主用 `页面分组间距` 提供宽12vp/窄8vp卡片外间距 | `editor-page.test.mjs`、`note-continuation.test.mjs`、`ui-shell-contract.test.mjs`；[连续制卡](../../../../../../docs/development/browser-stats.md#手工连续制卡) |
| 笔记 HTML 字段与选区工具 | [NoteFieldEditor.ets](NoteFieldEditor.ets)；拥有 HTML、光标／选区与独立多选格式开关，每框提供可视编辑／源码编辑和输入框右下角展开按钮。当前字段拥有默认展开的 [边缘半圆菜单](../editor/NoteEditorWheel.ets)，六项常用工具在内圈，外圈在简洁版和实验版均显示；圆形按钮内放图标和两行名称。点击字号在外围再展开一圈七档选项，高亮实际光标/选区字号，混合字号不误选，再次点击或折叠收起。字号的源码读取与替换由 [NoteHtmlTools.ts](../../model/NoteHtmlTools.ts) 拥有，字段持有选区快照和代次，轮盘只渲染与回调。滑动保留多选、点击执行；折叠保留格式，再次展开仅清空格式选择，已有内容不变。一次性动作反馈100ms，字号圈打开期间入口持续亮；隐藏、折叠、销毁取消反馈及字号选项。动态高亮直接读取当前字段，防止复用条目缓存旧状态。草稿与媒体归父层，新增、浏览／学习及 Agent 草稿共用 | note-html-tools、note-rich-editor、note-editor-wheel、ai-agent-app-structure；原生多选、图标、圆环几何与中文输入须设备验收 |
| 未保存笔记/模板预览 | [NoteDraftPreview.ets](NoteDraftPreview.ets)；会话拥有冻结输入与读取代次，平台适配器拥有临时媒体，复用 CardWebView/HTML/数学/媒体及音频会话；宿主拥有关闭后保留的草稿 | `note-draft-preview*.test.mjs`、真实 Core `note_draft_preview.rs`；[范围与设备验收](../../../../../../docs/development/browser-stats.md#未保存笔记草稿预览2026-10-02) |
| ⓘ 帮助/信息按钮及标题位置 | [HelpButton.ets](HelpButton.ets) 固定图标、点击区、朗读及事件隔离；[HelpLabel.ets](HelpLabel.ets) 让说明紧随标题；仅卡片信息独立动作保留行尾 | `ui-help-entry.test.mjs` 全 ArkTS 扫描、禁用回调、几何与帮助生命周期回归；规范见 [应用内帮助](../../../../../../docs/development/in-app-help.md) |
| 只读帮助弹窗 | [字段帮助面板.ets](../字段帮助面板.ets) 组合 DialogFrame / DialogHeader；字段帮助对话框适配原生弹窗，支持正文及富内容插槽 | `ui-help-entry.test.mjs`、`ui-dialog-layout.test.mjs`、`deck-option-dialog.test.mjs`；实际系统返回、手势与字体布局须设备验收 |
| 详情/展开箭头（`>` / `›` / `⌃` / `⌄`） | [DisclosureChevron.ets](DisclosureChevron.ets) | `tools/tests/ui-disclosure-contract.test.mjs`：扫描所有 ArkTS，禁止独立文字箭头；检查居中几何 |
| 菜单项、展开行 | [MenuItem.ets](MenuItem.ets)：菜单默认图文成组居中，表单展开行和 CardActionMenu 通过 `labelAlignment: TextAlign.Start` 成组左对齐；选中项复用 [SelectStyle.ets](../../utils/SelectStyle.ets) 的选中底色和圆角，不显示勾或预留勾号槽位；有箭头时预留完整24vp及8vp间隔，居中行对称预留；`selectionUsesAccent: false` 保留选中底色并使用明暗主题的黑白文字和中性图标填色（如无旗标）；笔记类型字段、模板、CSS 共用，箭头状态和行高统一 | `ui-select-layout.test.mjs` |
| 平面动作菜单列表 | [ActionMenuList.ets](ActionMenuList.ets)：首页“更多”和“新建牌组”共用；条目只传唯一 ID、完整文案、图标及可用/选中/危险态。复用 MenuItem 的行高、图文间距和主题填色，统一分隔线及当前列表选择校验；宿主保留显隐、锚点和业务操作 | `ui-shell-action-menu-list.test.mjs` 执行禁用/移除后的迟到点击、中英文完整文案、全部首页显隐组合和回调；HAP/设备验证布局 |
| 滚动正文末尾的展开内容显露 | [ExpansionReveal.ets](../../utils/ExpansionReveal.ets)：宿主持有展开状态，点击请求、展开内容的 `onAreaChange` 消费一次滚动；收起和离页取消；标签、牌组“更多”和设置页设备直连共用。滚动在布局回调内直接开始，不经过定时器、异步发现或数据任务。`NoteTagsField.scroller` 接收宿主表单滚动器，内层“选择标签”复用独立控制器，不能与外层展开请求混用；聊天自动跟随保留独立语义 | `ui-shell-expansion.test.mjs` 执行真实控制器、宿主切换方法及布局回调；实际滚动范围/键盘须设备验收 |
| 原生下拉框与长名称省略 | [SelectStyle.ets](../../utils/SelectStyle.ets)：共享尺寸、统一按钮/普通项/选中项字号、行内最大宽度和单行尾部省略；三类 font、几何、公共 controlBorder 及只负责省略的 textModifier 由调用点直接声明，完整名称和选值不变 | `ui-select-layout.test.mjs` 全调用扫描；长短选项切换、标签/ⓘ 避让须设备验收 |
| 牌组选项字段与预设操作行 | [DeckOptionRow.ets](../home/DeckOptionRow.ets)，字段编辑器由 DeckOptionField 管理；完整选项按共同目录内联分组，单项恢复默认复用按下态按钮 | `deck-option-dialog.test.mjs`、`deck-options-parity.test.mjs`，检查共享控件和简洁模式显隐 |
| 按钮按压反馈 | [GlassSurface.ets](../../utils/GlassSurface.ets)、[PrimaryGlassSurface.ets](../../utils/PrimaryGlassSurface.ets)：原生多态色层、稳定底色/边框，不经触摸状态重建文字；普通按钮与操作行同用 [PressFeedback.ets](../../utils/PressFeedback.ets)，统一单次变淡反馈 | `ui-press-feedback.test.mjs` 全仓点击入口审计，以及 `theme-text.test.mjs`、`button-press-state-contract.test.mjs`、`motion-style-contract.test.mjs`；快点/取消/禁用须设备验收 |
| 页面四段等距与菜单锚点 | [应用尺寸](../../utils/应用尺寸.ets) 的 `页面分组间距`、`pageToolbarTop`、`pageToolbarHeight`、`pageContentTop`；光学估计限制见 [间距验收](../../../../../../docs/UI_SPACING.md) | `ui-shell-contract.test.mjs`；真实状态栏字形须设备验收 |
| 菜单承接层与定位 | [AnchoredMenu.ets](AnchoredMenu.ets)，通过 [MenuSurface.ets](MenuSurface.ets) 与 `menu_surface` 明暗资源统一扁平底色和圆角，普通菜单及带尖角菜单均不绘制阴影；边框委托 SurfaceBorder，深色弹窗与卡片底色区分。首页、学习页、牌组预览、牌组长按/色条菜单及浏览多选共用；宿主传入最终窗口锚点，公共 Scroll 按实际可用高度限高，超长内容自动滚动。首页更多/新建直接复用无尖角 AnchoredMenu：`contentLeft`/`contentMaxWidth` 传入已包含安全区和页面间距的实测窗口边界，避免横向重复间距；可传 `cornerRadius` 与统计卡统一，其他宿主保留原默认值。原生手写 Popup 同样使用 `menu_surface`，显式传 `MenuSurface.popupShadow()` 与 `backgroundBlurStyle: BlurStyle.NONE` 关闭系统投影和磨砂；预览范围弹窗关闭箭头 | `ui-select-layout.test.mjs`、`browser-batch-menu.test.mjs`、`ui-surface-border.test.mjs`；设备验收实际外观、短屏和大字体滚动 |
| 菜单树与左侧布局 | [ActionMenuTree.ts](ActionMenuTree.ts) 按稳定 ID 展开可见行，传播父级禁用状态，收起分组同时清除后代展开状态；[ActionMenuLayout.ts](ActionMenuLayout.ts) 根据实测行高计算触发行中心与左侧面板避让，右侧行距不变。[MenuBubble.ets](MenuBubble.ets) 与 AnchoredMenu 的主菜单轮廓复用 [MenuBubbleSurface.ets](MenuBubbleSurface.ets)：上下/左右尖角和圆角同属连续路径，坐标按当前密度转换为 px，仅绘制底色与公共描边，不叠加模糊投影。主菜单轮廓在 Scroll 外，使用实测可见高度，正文滚动不移动尖角 | `study-menu.test.mjs` 执行树、收起、禁用、延迟点击、避让和密度回归；`motion-style-contract.test.mjs` 验证动画 |
| 原生容器、表单与分隔线轮廓 | [SurfaceBorder.ets](../../utils/SurfaceBorder.ets)：`options()` 共用1vp线宽和 `surface_border` 明暗资源；菜单、统计/摘要卡片、详情外框、设置分组、输入框、下拉框、字段卡片、普通弹窗及 GlassSurface / PrimaryGlassSurface 按钮使用同一入口，分隔线共用 `color()` 并保留原线宽。只设置线宽/颜色，保留调用方底色、圆角和按压反馈；选中/排序状态可传原状态色，浏览旗标通过每边宽度/颜色保留左侧色条和其余中性轮廓。ImageSurfaceStyle 复用参数但保留适合图片灰底的 border_image；卡面内填空保留既有语义 | `ui-surface-border.test.mjs` 执行公共参数、深色轮廓对比度与全仓旧轮廓散写扫描；表单/下拉框和按压行为分别由 `ui-shell-controls.test.mjs`、`ui-select-layout.test.mjs`、`theme-text.test.mjs` 验证 |
| 学习/预览/浏览动作菜单 | [CardActionMenu.ets](CardActionMenu.ets) 使用紧凑主菜单加侧面板。学习打开菜单时自动同时展开标记与卡片操作两个侧边子菜单，浏览多选保留自动展开的标记侧面板；不把子菜单内容并入主菜单。浏览普通菜单的设置分组仍按需打开侧面板，预览使用无分组平面菜单。宿主拥有 `expandedIds`、`onToggleBranch` 和业务动作，可由 `onSelect` 按稳定 ID 分发，因此条目 `action` 可选；组件拥有实测行高、尖角锚点和滚动。默认对齐工具栏；上下文菜单传宿主局部 `anchor` 行矩形，由 [ActionMenuLayout.ts](ActionMenuLayout.ts) 对齐行中心、上下避让并限制整组边界；尖角朝向所选行边框，短屏按较大一侧限高，左侧不足时子面板向右展开。不能复用工具栏默认位置。牌组长按由 `HomeDeckRowMenu` 组合公共 DialogFrame / DialogHeader 与 AnchoredMenuItem 显示居中弹窗，几何和操作范围见[首页](../../../../../../docs/development/home.md#牌组长按与-ankidroid-的对齐范围2026-10-12)。侧面板根分组默认互斥，学习通过 `toggleActionMenuBranch(..., false)` 独立切换并保留其他已展开分组；旗标复用 [FlagMenuChoices.ets](FlagMenuChoices.ets)，点击后朝主菜单方向覆盖，只显示原有颜色与清除选项，两个侧面板保持原内容、位置和展开状态。覆盖层尖角朝向实际触发行，并按实测行高对齐；覆盖层高度独立记录，不污染源行测量。`visibleActionMenuRows` 拒绝被覆盖主菜单行的迟到点击，宿主移除主菜单观察，保留侧面板并只发布实际颜色与清除选项。普通浏览菜单使用同一组件承载搜索、显示和其他设置分组，可传条目 `divider`，副标题通过 `selected` 复用公共选中底色；预览保留平面菜单。整组共用 AnchoredMenu 的外部点击、安全区与限高滚动 | `study-menu.test.mjs`、`study-menu-actions.test.mjs`、`home-deck-menu.test.mjs`、`browser-batch-menu.test.mjs`、`browser-more-menu.test.mjs`、`ai-agent-app-structure.test.mjs`；禁止回退原生 bindMenu |
| 笔记音频字段 | [NoteAudioField.ets](NoteAudioField.ets)；标准 sound 引用试听/删除，管理弹层复用 AudioViewPicker 和短录音；宿主拥有草稿和唯一试听队列 | `note-audio.test.mjs`；见 [音频编辑](../../../../../../docs/development/browser-stats.md#笔记音频编辑2026-10-01) |
| 学习/预览内容宽度 | [CardViewport.ets](CardViewport.ets) | `card-viewport-layout.test.mjs` |
| 笔记草稿独立预览 / 类型模板样例 | [NoteDraftPreview.ets](NoteDraftPreview.ets) 持有同一 Core 会话，组合 [NotetypeTemplatePreview.ets](../settings/NotetypeTemplatePreview.ets)；新增/编辑通过导航页使用全屏外壳，类型样例保留弹窗 | `note-draft-preview.test.mjs`、`note-draft-preview-media.test.mjs`；[责任和间距](../../../../../../docs/development/browser-stats.md#未保存笔记草稿预览2026-10-02) |
| 开始学习 / 固定显示答案 | [开始学习按钮.ets](../开始学习按钮.ets)（文案与回调区分动作） | theme-catalog.test.mjs |
| 短请求延迟显示进度圈 | [DelayedLoadingIndicator.ets](DelayedLoadingIndicator.ets)，挂载后 250ms 显示、卸载取消 | `ui-loading-feedback.test.mjs` |
| 持续内容自动跟随 / 展开后显示末尾 | [ScrollTailFollower.ts](../../model/ScrollTailFollower.ts) 统一跟随、上翻暂停、回到末尾恢复和任务释放；[ExpansionReveal.ets](../../utils/ExpansionReveal.ets) 负责展开后布局完成的单次滚动；宿主保留高度和嵌套布局 | `ui-shell-scroll-follow.test.mjs`、`ai-agent-process-ui.test.mjs`、`ui-disclosure-contract.test.mjs` |
| 弹窗标题与操作 | [DialogHeader.ets](DialogHeader.ets)：完整标题按真实按钮尺寸对称留边并自然换行；普通完成/确认及关闭/返回复用 IconActionButton.toolbarStyle；文字例外及文字取消复用按下态按钮；限宽和限行规则见[公共弹窗规则](../../../../../../docs/development/appearance.md#设置弹窗开发入口) | `ui-shell-controls.test.mjs` 执行真实标题策略、按钮配置及禁用回调；相关弹窗保留草稿与提交行为测试 |
| 手动新增重复警告 | [NoteDuplicateDialog.ets](NoteDuplicateDialog.ets) 复用 DialogFrame/DialogHeader；取消、查看、继续保存分别交新增会话，警告期间未落库 | `note-duplicates.test.mjs`；见 [重复笔记边界](../../../../../../docs/development/browser-stats.md#重复笔记与字段查重2026-10-02) |
| 笔记媒体预览与独立管理 | 通用图片灰框 [NoteImagePreview.ets](NoteImagePreview.ets)；功能目录的 [NoteFieldCard.ets](../editor/NoteFieldCard.ets)、[NoteMediaDialog.ets](../editor/NoteMediaDialog.ets) 和 [NoteVisualPreview.ets](../editor/NoteVisualPreview.ets) 组合图片/视频与原音频；NoteMediaSession 拥有弹层副本，完成后交宿主，取消不应用 | `note-media-management.test.mjs`、`note-video-media.test.mjs`；见 [媒体管理](../../../../../../docs/development/browser-stats.md#编辑媒体预览与独立管理2026-10-01) |
| 普通弹窗外壳 | [DialogFrame.ets](DialogFrame.ets)：固定操作栏、限宽卡片，默认正文按内容收缩并限高滚动；卡片预览显式 `fillBody=true` 使用剩余高度并自己管理正文滚动；业务组件拥有草稿与忙碌状态 | `ui-dialog-layout.test.mjs`；插槽用箭头函数调用所属组件的 Builder，保留状态所有者 |
| 原生弹窗窗口 | [NativeDialogHost.ets](NativeDialogHost.ets)：统一全窗口配置、当前动效、替换/关闭/销毁和旧关闭回调隔离；原生构建器保留为组件字段工厂 | `native-dialog-host.test.mjs`、`motion-style-surfaces.test.mjs`、真实同步编译产物检查；布局和系统事件另做设备验收 |
| 磨砂弹窗遮罩 | [DialogBackdrop.ets](DialogBackdrop.ets)：订阅应用主题与系统深浅色、覆盖安全区；关闭策略由调用方决定 | `ui-dialog-layout.test.mjs` 全入口扫描；不要逐窗复制磨砂配置或依赖漏传的主题属性 |
| 设置与表单开关行 | [SettingsToggleRow.ets](SettingsToggleRow.ets)：可选说明与 HelpLabel，标题/说明共享剩余宽度，右侧开关不压缩，间隔16vp；确认值、持久化和错误归宿主 | `ui-shell-controls.test.mjs` 执行禁用回调、扫描设置开关及公共几何；`npm test -- sync`、`study-haptics.test.mjs`、`fsrs-state.test.mjs` 验证业务；HAP/设备验证换行与主题 |

笔记图片预览与遮罩画布共用 [ImageSurfaceStyle.ets](../../utils/ImageSurfaceStyle.ets) 的深浅灰底、边框、圆角与裁切；普通预览统一由 `NoteImagePreview` 提供，交互画布保留自己的 Image/Canvas。外观样式不拥有图片尺寸、内外边距或手势，避免改变遮罩命中。验证：`ui-shell-controls.test.mjs`；[设备验收边界](../../../../../../docs/development/study-media.md#图片遮罩)。

`DisclosureChevron` 以 24vp 正方形内的折线绘制，几何中心固定在 (12, 12)，不依赖字体基线。调用方可传 `tint`，展开状态可旋转整个组件，不覆盖内部尺寸、偏移或另绘箭头。`AnchoredMenuItem` 默认按收起/展开在 0°/90° 间旋转，旋转中心固定为自身 50%/50%，不附加平移；`disclosureAngle` 仅供左侧分组覆盖方向，旗标分支使用默认行为。它只作装饰、不拦截点击，交互和无障碍名称由所在行负责。

设置一级目录与操作入口使用图标；二级分组和普通偏好暂不显示装饰图标，调用方省略可选 `icon`，资源映射继续保留。`SettingsActionRow` / `SettingsToggleRow` 的标题与说明显式起始对齐。`HelpLabel` 实际 Row 填满分配宽度，但只由文字决定居中和行高；帮助绝对定位在文字右侧，不作为行内占位项。`HelpLayout` 分开定义18vp绘制尺寸、4vp文字间隔与44vp触摸/鼠标热区；不能把热区尺寸设为实际宽高。长标题居中时对称限宽，开关/选择器几何和卡片边距不变。

`HelpLabel.actionIcon/actionLabel/isActionEnabled/onAction` 支持标题与帮助之间的独立图标动作，复用 IconActionButton；HelpLayout 为两枚图标分配不重叠的44vp热区，默认无动作时沿用原几何。FormSelectRow / DirectorySelect 通过 `labelAction*` 与 `onLabelAction` 转交这一能力；有标签动作的目录控件限于56%，为标题和图标留位，其余目录保持70%。新增页模板动作使用这一入口，白底由页面显式传 `surface_card`。

普通表单组合 `DialogFrame` 与 `DialogHeader`；宽度档位复用 `应用尺寸.dialogCompactMaxWidth / dialogMaxWidth / dialogWideMaxWidth`。标题覆盖层使用透明命中，只有其帮助入口响应，不能挡住下层的关闭/确认按钮；必须实际点击验收。原生自定义弹窗也使用同一外壳并传 `nativeHost=true`；帮助与权益展示通过原薄适配委托公共外壳。自动前进传 `actionsAtBottom=true` 保留底部操作栏。抽屉、全屏预览和图片裁剪按各自语义保留布局。系统返回沿页面 → 功能 → 子面板单向传递，最上层消费；不得通过直接卸载父组件绕过子层的返回逻辑或忙碌守卫。

原生窗口每次通过 `NativeDialogHost.open(fieldFactory, canDismiss)` 创建，组件出现时 `activate()`，退出时 `dispose()`。系统关闭先校验窗口代次，再询问业务是否允许；嵌套返回/媒体取消可自行处理并返回 false。无参数按钮回调用 `guard()` 绑定窗口身份；有参数提交在字段工厂中捕获 `captureCurrent()`，回调先检查身份再关闭或提交，避免旧内容改写下一次窗口。窗口自行关闭后的生命周期用 `release()` 释放引用。公共宿主不拥有业务草稿或持久化任务，不能把程序主动 `close()` 用作忽略忙碌/草稿规则的用户退出入口。

纯读取的加载状态应与已接受写入的退出保护分开；关闭只让迟到读取失效。确认框冻结目标并只消费一次，执行前检查宿主仍存活；已接受的写入继续完成并通知数据刷新，UI 回调在宿主销毁后失效。逐文件检查、修复和实际验证范围见[弹窗逻辑检查](../../../../../../docs/development/dialog-audit-2026-10-09.md)。

字段工厂中的 `return new CustomDialogController(...)` 在当前 SDK 会生成无参数的 `jsDialog.setController()`，内容不能依赖自动注入的 `controller`。所有内容的关闭意图经宿主回调执行 `NativeDialogHost.close()`；只调用 `release()` 会丢失仍显示的窗口引用。媒体的 `onRequestClose` 与消失通知 `onClosed` 分开，业务忙碌守卫仍在内容中；宿主以会话代次隔离旧 ready/apply/closed，消失通知与提交分别只消费一次。自动前进的二级返回继续返回主级，主级才请求关窗。扫描见 `native-dialog-host.test.mjs`，真实媒体编译产物执行入口见 [媒体编译检查](../../../../../../docs/development/verification.md#媒体管理编译产物检查)。

字段工厂中的 `new CustomDialogController({ builder: ... })` 必须保留字面量，才能让 SDK 转换自定义组件与状态引用；配置值统一取 `host.presentation()`，不能把整个 builder 搬进普通共享函数，也不能通过展开对象或访问生成字段绕过编译器。现有所有创建入口由 `native-dialog-host.test.mjs` 扫描；同步弹窗五个 `@Link` 还执行实际编译产物检查。

窗口本身宽高100%、透明原生遮罩，`DialogFrame` 独占公共遮罩、安全区和卡片几何：两侧各安全边距+8vp，卡片取剩余宽度的88%并限宽，内部各16vp，操作栏与正文间隔12vp。正文按扣除安全区/键盘后的限高减去实际操作栏高度、上下内边距与一次间隔；内容不再重复加卡片外缘 padding、固定480vp/百分比限高或嵌套表单 Scroll。深浅色、窄/宽、大字体、键盘与系统返回仍需设备验收。

查全部使用位置：`rg -n 'DisclosureChevron' entry/src/main/ets`。运行扫描：`node --test tools/tests/ui-disclosure-contract.test.mjs`。索引指向真实实现，不另维护一份容易过期的调用页面清单。

普通字符串资源的即时翻译使用 `@StorageProp('系统语言')` 建立渲染依赖：直接渲染调用 `localizedResourceText` / `localizedNamedResourceText`，目录辅助函数显式传入语言，既有组件本地文字辅助方法在默认 `_locale` 参数读取语言。资源格式化仍由 UiFeedback 拥有，语言不进入占位符；不重建整页，不丢失草稿或选择。帮助图标使用居中的 `ic_info` SVG，保留44vp点击区与既有点击隔离。

渐变 Span Builder 的按值参数会保留旧文字和颜色，因此宿主用仅包裹文字子节点的 `ForEach([themeTextKey(...)])` 重建 Span，key 必须传入与 Builder 相同的文案、有效色板和高亮，并显式读取语言；空色板也参与 key，让取消选中或禁用恢复继承色。`theme-text.test.mjs` 执行真实调用表达式并模拟 ForEach 缓存，覆盖选择、禁用、文案、数据、色板与语言变化；`ui-locale-refresh.test.mjs` 审计全部调用的参数对应。不重建表单或页面。统计页语言 watcher 只替换缓存的“全部牌组”标签，保留牌组筛选；统计范围选择与默认牌组名也直接依赖同一语言。

牌组详情的手机顶栏将制卡、可选 JIDE、预览图标直接组成右侧工具组；宽屏将制卡和 JIDE 组成左侧工具组，预览靠右，均复用主页 `IconActionButton.toolbarStyle`。牌组预览范围只渲染 `ActionMenuList`，由 `HomeDeckDetails` 统一挂载 `AnchoredMenu`；手机和宽屏共用表面、居中条目、分隔线和动效。工具栏上报实际窗口位置与宽度，详情宿主转换一次坐标后按右缘对齐。关闭手写、退出排序、退出多选及标题栏关闭统一用 `IconActionButton.toolbarStyle` 的叉号；需要展示当前设置含义的透明度控件继续保留文字。

`AnchoredMenu.topOffset/contentLeft` 是最终菜单宿主坐标；窗口根宿主的原点为零。公共菜单读取自身窗口上缘，将窗口安全上缘换算成宿主安全上缘，宽屏分栏已避让的系统栏不能再次计入。`home-header-layout.test.mjs` 覆盖窗口根、分栏完全避让及分栏与安全区相交的情况。

操作结果与就地恢复使用 [ResultNotice.ets](ResultNotice.ets)，宿主负责真实失败、重试与 Core 撤销步号。提示条不自动重送写入，也不持有业务服务。

[ActionStatus.ets](ActionStatus.ets) 固定20vp结果槽由请求拥有者发布忙碌、成功和失败；[ChangingText.ets](ChangingText.ets) 只过渡真实短状态文字，不用于卡片翻面。默认按内容宽度布局并保留实测宽度；调用方通过 `width` 或 `layoutWeight` 分配文字槽时，传 `fillWidth: true`，让实际 Stack 填满该槽再按 `alignment` 对齐。填充模式不缓存分配宽度为最小宽度，窗口缩窄时随槽一起收缩；学习页剩余计数保持按内容居中。`interaction-feedback.test.mjs` 执行真实根节点样式和测量回调，并扫描全部同类调用；设备视觉验收另行完成。

[MenuHoldGesture.ets](MenuHoldGesture.ets) 只将 ArkUI 触摸事件交给 `MenuHoldController`，公共菜单命中由 `MenuSlideSession` 拥有。布局不同的普通菜单入口复用同一指针生命周期；排序/轮盘按其原语义处理。[当前行为、来源和验证](../../../../../../docs/development/interaction-feedback.md)。


键盘输入的页面无关契约在 [KeyboardInput.ts](../../model/KeyboardInput.ts)，平台转换在 [KeyboardKeyAdapter.ets](../../utils/KeyboardKeyAdapter.ets)。公共字段编辑器只消费这些通用输入及原字段工具声明；页面命令表和说明列表在 [KeyboardShortcuts.ts](../../model/KeyboardShortcuts.ts)、[KeyboardShortcutHelp.ets](../KeyboardShortcutHelp.ets)、[KeyboardShortcutList.ets](../KeyboardShortcutList.ets)，不引入 common 的业务依赖。`DirectorySelect.openRequest` 让键盘复用同一个选择弹窗；`NoteTagsField.focusRequest`、`NoteFieldCard/NoteFieldEditor.focusRequest` 在布局就绪后转交真实焦点，字段展开和焦点拥有者保持一致。编辑顶栏标题旁 i 复用 HelpLabel，左右区域各28%、中间自适应，不用覆盖整个标题的空白层。行为回归见 `keyboard-alignment`、`note-rich-editor`、`ui-shell-contract`；原生焦点和布局仍须设备验收。
