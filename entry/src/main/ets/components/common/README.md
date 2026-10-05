# 公共 UI 代码索引

`SettingsActionRow` 的尾部默认使用共用箭头；录音、暂停等直接执行的动作可传 `trailingIcon`，由公共 `ActionIcon` 在相同24vp槽位显示图标，完整行仍拥有点击、按压与禁用守卫。音频录制主行显示当前状态：空闲麦克风、录制中麦克风带声波、暂停后为斜杠麦克风；独立的暂停/继续行显示暂停/播放图标。音频附件右上角的删除复用 `IconActionButton` 的44vp热区；传 `cornerAligned` 将图标靠右上并在热区内留4vp，默认仍居中，不以文字大小缩小点击范围。

菜单图标与文字的对齐责任在 [MenuItem.ets](MenuItem.ets)：同一 Row 按 `labelAlignment` 成组居中或靠左，图文间隔8vp，不另叠图标或用文字 padding 补槽。首页平面菜单默认整组居中；卡片动作菜单显式整组靠左。箭头完整24vp及8vp间隔由公共行右侧预留，居中行对称预留。菜单宽度与10vp左右留白共用 [应用尺寸.ets](../../utils/应用尺寸.ets)，固定宽度各档已统一收紧8vp，44vp点击行高保留。`AnchoredMenu` 的左右边缘与同一限宽工具栏的按钮外缘对齐，不额外叠加外边距。回归：`ui-select-layout.test.mjs`、`ui-shell-contract.test.mjs`。

菜单安全边界由通用纯布局模型 [WindowSafeLayout.ts](../../model/WindowSafeLayout.ts) 计算，EntryAbility 发布系统栏、摄像头挖孔和导航条的实际边缘并集。AnchoredMenu 将顶部位置与滚动高度限制在这个区域内，横屏同时留出侧边挖孔；首页原生尖角气泡使用同一模型计算正文滚动高度。它只处理矩形、尺寸与边界，不依赖业务或平台 IO。DialogFrame 将搜索和表单弹窗居中于实际安全矩形，并按安全高度限制正文滚动；遮罩保留覆盖整个窗口。

长字段展开、更多格式、链接与源码选区工具统一在 `NoteFieldEditor.ets`，复用 `NoteLinkDialog.ets` 的公共弹窗；HTML 选区规则在 [NoteHtmlTools.ts](../../model/NoteHtmlTools.ts)，富文本往返在 [NoteRichText.ts](../../model/NoteRichText.ts)。回归：`note-html-tools.test.mjs`、`note-rich-editor.test.mjs`；[格式与设备边界](../../../../../../docs/development/browser-stats.md#基础字段编辑与草稿保护)。

字段外观配置由 [NoteFieldEditing.ts](../../model/NoteFieldEditing.ts) 的纯类型提供；Core 解码和宿主传递配置，公共组件不直接依赖 protobuf。NoteFieldEditor 消费 RTL、已安装字体/字号、描述和默认 HTML 源码；NoteFieldCard 消费初始折叠。图片遮罩标题/补充字段复用卡片并关闭普通媒体入口；图像与遮罩保持专用输入。

修改同类 UI 前先从此表进入实现，再用符号名全仓搜索调用点；同时搜索旧符号、资源键和替代写法，避免只覆盖已复用的页面。新增公共语义入口时更新本表及调用检查，不逐页复制组件。

新增基础组件仅直接依赖 common、通用布局/主题模型和 UI 工具，不引入业务 backend、其他功能组件或平台 IO。现有笔记、标签和标记组件暂保留跨入口共享位置，其逐条迁移例外由 `tools/tests/common-boundary.test.mjs` 管理；新增组件不能继承例外，迁出时同时删除例外。该检查也要求每个公开 `.ets` 在此索引有真实文件链接；仅内部实现可标记 `@internal`。检查覆盖字面量直接依赖，完整依赖解析、环和纯模型隔离仍由 architecture-boundaries 检查。

标签编辑共用 [NoteTagsField.ets](NoteTagsField.ets)、[TagPicker.ets](TagPicker.ets) 和 [TagTreeList.ets](TagTreeList.ets)：字段与选择回写宿主草稿，树列表只展示完整路径并转交操作；浏览批量弹窗和筛选侧栏共用模型/列表。基线、三态、过滤及差量更新在 [NoteTags.ts](../../model/NoteTags.ts)，[回归](../../../../../../tools/tests/browser-note-tags.test.mjs) 覆盖新增/已有/兼容编辑入口和迟到读取。列表固定可视高度、44vp 行、宿主边距与列表缩进责任见 [标签边界](../../../../../../docs/development/browser-stats.md#标签选择与管理)。

普通次操作复用 [按下态按钮.ets](按下态按钮.ets)，`fillWidth` 仅供需要满宽的提案/表单操作使用，默认仍保留内容宽度；组件内禁用守卫阻止迟到点击。选择工具也复用该按钮，通过 `selectable`、`selected`、`selectionColor` 表达持续选中态，`markerColor` 可提供颜色标记；高度、字号、内边距和圆角仍只有公共组件一个来源。选择按钮的边框宽度固定，`GlassSurface` 在普通、按压和禁用状态均保留传入的描边；普通按钮的默认外观不变。Agent 提案确认与取消分别组合 `PrimaryActionButton` 和该按钮，不另写按钮几何；回归见 `ai-agent-markdown-ui.test.mjs`、`ui-shell-controls.test.mjs`、`theme-text.test.mjs`。

| UI 语义 | 唯一实现 | 自动检查 |
| --- | --- | --- |
| 加载、空内容和错误状态 | [统一加载态.ets](统一加载态.ets)、[统一空态.ets](统一空态.ets)、[统一错误态.ets](统一错误态.ets)；加载尺寸来自公共 token，默认文字走中英资源；错误态仅在提供 onRetry 时显示动作，动作共用 [按下态按钮.ets](按下态按钮.ets) | `ui-common-state.test.mjs` 验证本地化与可选回调；最终图标、按钮与读屏另需设备验收 |
| 根主题背景与主题强调文字 | [ThemeBackground.ets](ThemeBackground.ets)、[ThemeText.ets](ThemeText.ets)；背景订阅 AppLifecycleState 与 ThemeCatalog，不从兑换协议读取生命周期或动画键 | `theme-text.test.mjs`、`redemption.test.mjs`、`motion-style-contract.test.mjs` |
| 卡片标记与旗标展示 | [CardMarkingBadge.ets](CardMarkingBadge.ets)；固定旗标语义与本地名称来自 CardMarking，业务依赖为显式迁移例外 | `card-marking.test.mjs`、`browser-flag-names.test.mjs` |
| 笔记链接草稿弹窗 | [NoteLinkDialog.ets](NoteLinkDialog.ets)；编辑器提供选区与确认回调，链接校验来自笔记模型 | `note-rich-editor.test.mjs` |
| 菜单、设置与状态图标 | [ActionIcon.ets](ActionIcon.ets)：默认18vp，状态徽标可用14vp；装饰图标不接收点击/朗读，描边使用成对明暗 SVG。`tint` 管理内填色，`strokeColor` 仅接受六位十六进制色并保留透明度；设置语义由 [SettingsIcons.ets](../../utils/SettingsIcons.ets) 映射，学习/预览/浏览多选动作由 [ActionIcons.ets](../../utils/ActionIcons.ets) 映射，同义动作复用首页/学习资源 | `ui-settings-components.test.mjs` 检查目录和明暗几何、执行染色透明度回归；菜单行为分别由 `study-menu-actions.test.mjs`、`browser-batch-menu.test.mjs`、`preview-runtime.test.mjs` 验证 |
| 仅图标的关闭、移动与年份操作 | [IconActionButton.ets](IconActionButton.ets)：默认44vp圆形点击区，首页六个入口可传宽高及圆角矩形表面，borderRadius 在 border 之后设置；保持纯图标和完整本地化朗读名称、按压反馈与禁用迟到点击守卫；调用方拥有可用边界与回调，图片上的关闭使用白色图标和深色底 | `ui-settings-components.test.mjs` 执行禁用守卫；`stats-calendar-runtime.test.mjs`、`notetype-management.test.mjs` 保留业务边界回归；HAP/设备验证几何、主题与读屏 |
| 设置目录、维护、关于与术语入口 | [SettingsActionRow.ets](SettingsActionRow.ets)：统一图标、标题、可选说明/帮助、箭头、按压和禁用守卫；DataActionRow 是维护/备份的兼容入口。行无水平边距，说明自然换行；QQ群富说明由宿主 Builder 提供 | `ui-settings-components.test.mjs` 执行迟到禁用点击、检查入口复用；业务继续由原设置宿主和既有行为回归负责 |
| 文字左、选择框右的表单行 | [FormSelectRow.ets](FormSelectRow.ets)：12vp 间隔、标签占剩余宽度且可换行、右侧按内容占宽并限于 56%；省略仅用于当前显示，完整名称和选项不改。导入适配器 ImportSelect 也委托此行 | `ui-compact-controls.test.mjs` 执行禁用、越界和完整名称回归；`ui-select-layout.test.mjs` 扫描原生几何 |
| 说明或状态左、辅助按钮右 | [LabeledActionRow.ets](LabeledActionRow.ets)：复用按下态按钮和上述限宽，长按钮文案单行省略；整表提交与危险确认保留原操作区 | `ui-compact-controls.test.mjs` 执行禁用回调及色值保留；宽窄布局仍需设备验收 |
| 幻彩主题预览 | [IridescentThemePreview.ets](IridescentThemePreview.ets)：速览与启动/锁定领赠说明共用已有截图、260vp 限宽及原始比例 | `theme-iridescent-gift.test.mjs`；实际滚动与图像显示另需设备验收 |
| 白字实底主操作按钮 | [PrimaryActionButton.ets](PrimaryActionButton.ets)：登录、保存配置和开发者启用共用高度、字号、圆角、按压反馈和禁用守卫；宿主提供主题色与完整可用条件 | `ui-shell-controls.test.mjs` 执行禁用回调并扫描同类散写；既有同步/应用内 Agent 测试保留业务验证 |
| 单行表单输入外观 | [FormInputStyle.ets](../../utils/FormInputStyle.ets)：统一卡片底色、边框、字号、圆角；默认水平内边距10vp，牌组/自定义学习沿用外层卡片内边距；密码、数字、过滤、提交与焦点仍用原生 TextInput | `ui-shell-controls.test.mjs` 执行真实样式并扫描完整重复样式；HAP/设备验证原生更新与键盘 |
| 多行表单输入外观 | [FormTextAreaStyle.ets](../../utils/FormTextAreaStyle.ets)：与单行表单共用视觉规范，四边10vp内边距；高度、焦点和编辑行为仍由原生 TextArea 调用方负责。Agent 补充和消息引用；笔记草稿使用富文本编辑器 | `ai-agent-form-controls.test.mjs` 执行样式并扫描全部 Agent TextArea；HAP/设备验证 |
| 数据管理与完整备份操作行 | [DataActionRow.ets](../settings/DataActionRow.ets)：数据分组和备份页共用标题、说明、箭头及可增长行高，水平边距归外层 | `import-flow-contract.test.mjs`；业务流程由 `import-options-runtime.test.mjs` 验证 |
| 内置笔记类型与字段的本地化显示 | [NoteTypeText.ets](../../utils/NoteTypeText.ets) / [NoteTypePresentation.ts](../../model/NoteTypePresentation.ts)；字段标题与提示统一由 NoteFieldCard 调用，保留原始名称与模板引用 | `note-type-i18n.test.mjs`；边界见 [浏览与编辑](../../../../../../docs/development/browser-stats.md#内置名称的统一显示) |
| 新增/编辑顶栏与字段卡片 | [NoteEditorHeader.ets](NoteEditorHeader.ets)、[NoteFieldCard.ets](NoteFieldCard.ets)；独立 EditNotePage 和新增页共享，草稿归宿主；新增页隐藏顶栏单次保存，底栏组合既有按钮；固定开关只由新增宿主传入 Core sticky 与回调，已有编辑默认隐藏；卡片内部16vp，宿主用 `页面分组间距` 提供宽12vp/窄8vp卡片外间距 | `editor-page.test.mjs`、`note-continuation.test.mjs`、`ui-shell-contract.test.mjs`；[连续制卡](../../../../../../docs/development/browser-stats.md#手工连续制卡) |
| 笔记 HTML 字段与选区工具 | [NoteFieldEditor.ets](NoteFieldEditor.ets)；拥有 RichEditor 格式输入、选区/光标与首次学习，复杂 HTML 回退源码；工具自动换行且不收缩；草稿与图片仍归父层；新增、浏览/学习及 Agent 制卡/改字段草稿共用，不复制解析器或保存逻辑 | `note-editing-basics.test.mjs`、`note-rich-editor.test.mjs`、`ai-agent-form-controls.test.mjs`；真实中文输入、光标和 ArkUI 更新须设备验收 |
| 未保存笔记/模板预览 | [NoteDraftPreview.ets](NoteDraftPreview.ets)；会话拥有冻结输入与读取代次，平台适配器拥有临时媒体，复用 CardWebView/HTML/数学/媒体及音频会话；宿主拥有关闭后保留的草稿 | `note-draft-preview*.test.mjs`、真实 Core `note_draft_preview.rs`；[范围与设备验收](../../../../../../docs/development/browser-stats.md#未保存笔记草稿预览2026-10-02) |
| ⓘ 帮助/信息按钮及标题位置 | [HelpButton.ets](HelpButton.ets) 固定图标、点击区、朗读及事件隔离；[HelpLabel.ets](HelpLabel.ets) 让说明紧随标题；仅卡片信息独立动作保留行尾 | `ui-help-entry.test.mjs` 全 ArkTS 扫描、禁用回调、几何与帮助生命周期回归；规范见 [应用内帮助](../../../../../../docs/development/in-app-help.md) |
| 只读帮助弹窗 | [字段帮助面板.ets](../字段帮助面板.ets) 组合 DialogFrame / DialogHeader；字段帮助对话框适配原生弹窗，支持正文及富内容插槽 | `ui-help-entry.test.mjs`、`ui-dialog-layout.test.mjs`、`deck-option-dialog.test.mjs`；实际系统返回、手势与字体布局须设备验收 |
| 详情/展开箭头（`>` / `›` / `⌃` / `⌄`） | [DisclosureChevron.ets](DisclosureChevron.ets) | `tools/tests/ui-disclosure-contract.test.mjs`：扫描所有 ArkTS，禁止独立文字箭头；检查居中几何 |
| 菜单项、展开行 | [MenuItem.ets](MenuItem.ets)：菜单默认图文成组居中，表单展开行和 CardActionMenu 通过 `labelAlignment: TextAlign.Start` 成组左对齐；有箭头时预留完整24vp及8vp间隔，居中行对称预留；`selectionUsesAccent: false` 保留选中状态并使用明暗主题的黑白文字和中性图标填色（如无旗标）；笔记类型字段、模板、CSS 共用，箭头状态和行高统一 | `ui-select-layout.test.mjs` |
| 平面动作菜单列表 | [ActionMenuList.ets](ActionMenuList.ets)：首页“更多”和“新建牌组”共用；条目只传唯一 ID、完整文案、图标及可用/选中/危险态。复用 MenuItem 的行高、图文间距和主题填色，统一分隔线及当前列表选择校验；宿主保留显隐、锚点和业务操作 | `ui-shell-action-menu-list.test.mjs` 执行禁用/移除后的迟到点击、中英文完整文案、全部首页显隐组合和回调；HAP/设备验证布局 |
| 滚动正文末尾的展开内容显露 | [ExpansionReveal.ets](../../utils/ExpansionReveal.ets)：宿主持有展开状态，点击请求、展开内容的 `onAreaChange` 消费一次滚动；收起和离页取消；标签与牌组“更多”共用，聊天自动跟随保留独立语义 | `ui-shell-expansion.test.mjs` 执行真实控制器、宿主切换方法及布局回调；实际滚动范围/键盘须设备验收 |
| 原生下拉框与长名称省略 | [SelectStyle.ets](../../utils/SelectStyle.ets)：共享尺寸、统一按钮/普通项/选中项字号、行内最大宽度和单行尾部省略；三类 font、几何、公共 controlBorder 及只负责省略的 textModifier 由调用点直接声明，完整名称和选值不变 | `ui-select-layout.test.mjs` 全调用扫描；长短选项切换、标签/ⓘ 避让须设备验收 |
| 牌组选项字段与预设操作行 | [DeckOptionRow.ets](../home/DeckOptionRow.ets)，字段编辑器由 DeckOptionField 管理；完整选项按共同目录内联分组，单项恢复默认复用按下态按钮 | `deck-option-dialog.test.mjs`、`deck-options-parity.test.mjs`，检查共享控件和简洁模式显隐 |
| 按钮按压反馈 | [GlassSurface.ets](../../utils/GlassSurface.ets)、[PrimaryGlassSurface.ets](../../utils/PrimaryGlassSurface.ets)：原生多态色层、稳定底色/边框，不经触摸状态重建文字；普通按钮与操作行同用 [PressFeedback.ets](../../utils/PressFeedback.ets)，统一单次变淡反馈 | `ui-press-feedback.test.mjs` 全仓点击入口审计，以及 `theme-text.test.mjs`、`button-press-state-contract.test.mjs`、`motion-style-contract.test.mjs`；快点/取消/禁用须设备验收 |
| 页面四段等距与菜单锚点 | [应用尺寸](../../utils/应用尺寸.ets) 的 `页面分组间距`、`pageToolbarTop`、`pageToolbarHeight`、`pageContentTop`；光学估计限制见 [间距验收](../../../../../../docs/UI_SPACING.md) | `ui-shell-contract.test.mjs`；真实状态栏字形须设备验收 |
| 菜单承接层与定位 | [AnchoredMenu.ets](AnchoredMenu.ets)，通过 [MenuSurface.ets](MenuSurface.ets) 与 `menu_surface/menu_shadow` 明暗资源统一圆角和阴影；边框委托 SurfaceBorder，深色弹窗与卡片底色区分。首页、学习页、牌组预览、牌组长按/色条菜单及浏览多选共用；宿主传入最终窗口锚点，公共 Scroll 按实际可用高度限高，超长内容自动滚动。原生 Popup 箭头也使用 `menu_surface` | `ui-select-layout.test.mjs`、`browser-batch-menu.test.mjs`、`ui-surface-border.test.mjs`；设备验收实际外观、短屏和大字体滚动 |
| 菜单树与左侧布局 | [ActionMenuTree.ts](ActionMenuTree.ts) 按稳定 ID 展开可见行，传播父级禁用状态，收起分组同时清除后代展开状态；[ActionMenuLayout.ts](ActionMenuLayout.ts) 根据实测行高计算触发行中心与左侧面板避让，右侧行距不变。[MenuBubble.ets](MenuBubble.ets) 复用圆角、尖角和明暗资源，轮廓坐标按当前密度转换为 px，阴影模糊同一轮廓，避免 Path 矩形投影 | `study-menu.test.mjs` 执行树、收起、禁用、延迟点击、避让和密度回归；`motion-style-contract.test.mjs` 验证动画 |
| 原生容器、表单与分隔线轮廓 | [SurfaceBorder.ets](../../utils/SurfaceBorder.ets)：`options()` 共用1vp线宽和 `surface_border` 明暗资源；菜单、统计/摘要卡片、详情外框、设置分组、输入框、下拉框、字段卡片、普通弹窗及 GlassSurface / PrimaryGlassSurface 按钮使用同一入口，分隔线共用 `color()` 并保留原线宽。只设置线宽/颜色，保留调用方底色、圆角和按压反馈；选中/排序状态可传原状态色，浏览旗标通过每边宽度/颜色保留左侧色条和其余中性轮廓。ImageSurfaceStyle 复用参数但保留适合图片灰底的 border_image；卡面内填空保留既有语义 | `ui-surface-border.test.mjs` 执行公共参数、深色轮廓对比度与全仓旧轮廓散写扫描；表单/下拉框和按压行为分别由 `ui-shell-controls.test.mjs`、`ui-select-layout.test.mjs`、`theme-text.test.mjs` 验证 |
| 学习/预览/浏览多选的右上角动作菜单 | [CardActionMenu.ets](CardActionMenu.ets) 保留紧凑右侧主菜单与默认向左展开的分组。宿主拥有 `expandedIds`、`onToggleBranch` 和业务动作；组件拥有实测几何及 `onPrimaryObscured` 遮挡通知。旗标复用 [FlagMenuChoices.ets](FlagMenuChoices.ets)，以 MenuSurface 直接覆盖右侧主菜单，共用其宽度和锚点；左侧分组保持可操作，主菜单在覆盖期间禁用并释放 JIDE 观察。预览使用空展开状态保留平面菜单。整组菜单共用 AnchoredMenu 的外部点击、安全区与限高滚动 | `study-menu.test.mjs`、`study-menu-actions.test.mjs`、`browser-batch-menu.test.mjs`、`ai-agent-app-structure.test.mjs`；禁止回退原生 bindMenu |
| 笔记音频字段 | [NoteAudioField.ets](NoteAudioField.ets)；标准 sound 引用试听/删除，管理弹层复用 AudioViewPicker 和短录音；宿主拥有草稿和唯一试听队列 | `note-audio.test.mjs`；见 [音频编辑](../../../../../../docs/development/browser-stats.md#笔记音频编辑2026-10-01) |
| 学习/预览内容宽度 | [CardViewport.ets](CardViewport.ets) | `card-viewport-layout.test.mjs` |
| 笔记草稿独立预览 / 类型模板样例 | [NoteDraftPreview.ets](NoteDraftPreview.ets) 持有同一 Core 会话，组合 [NotetypeTemplatePreview.ets](../settings/NotetypeTemplatePreview.ets)；新增/编辑通过导航页使用全屏外壳，类型样例保留弹窗 | `note-draft-preview.test.mjs`、`note-draft-preview-media.test.mjs`；[责任和间距](../../../../../../docs/development/browser-stats.md#未保存笔记草稿预览2026-10-02) |
| 开始学习 / 固定显示答案 | [开始学习按钮.ets](../开始学习按钮.ets)（文案与回调区分动作） | theme-catalog.test.mjs |
| 短请求延迟显示进度圈 | [DelayedLoadingIndicator.ets](DelayedLoadingIndicator.ets)，挂载后 250ms 显示、卸载取消 | `ui-loading-feedback.test.mjs` |
| 持续内容自动跟随 / 展开后显示末尾 | [ScrollTailFollower.ts](../../model/ScrollTailFollower.ts) 统一跟随、上翻暂停、回到末尾恢复和任务释放；[ExpansionReveal.ets](../../utils/ExpansionReveal.ets) 负责展开后布局完成的单次滚动；宿主保留高度和嵌套布局 | `ui-shell-scroll-follow.test.mjs`、`ai-agent-process-ui.test.mjs`、`ui-disclosure-contract.test.mjs` |
| 弹窗标题与操作 | [DialogHeader.ets](DialogHeader.ets) | 相关弹窗的行为测试 |
| 手动新增重复警告 | [NoteDuplicateDialog.ets](NoteDuplicateDialog.ets) 复用 DialogFrame/DialogHeader；取消、查看、继续保存分别交新增会话，警告期间未落库 | `note-duplicates.test.mjs`；见 [重复笔记边界](../../../../../../docs/development/browser-stats.md#重复笔记与字段查重2026-10-02) |
| 笔记媒体预览与独立管理 | [NoteImagePreview.ets](NoteImagePreview.ets)、[NoteMediaDialog.ets](NoteMediaDialog.ets)；NoteMediaSession 拥有弹层副本，完成后交宿主，取消不应用；固定新增入口和预览删除按钮 | `note-media-management.test.mjs`；见 [媒体管理](../../../../../../docs/development/browser-stats.md#编辑媒体预览与独立管理2026-10-01) |
| 普通弹窗外壳 | [DialogFrame.ets](DialogFrame.ets)：固定操作栏、限宽卡片，默认正文按内容收缩并限高滚动；卡片预览显式 `fillBody=true` 使用剩余高度并自己管理正文滚动；业务组件拥有草稿与忙碌状态 | `ui-dialog-layout.test.mjs`；插槽用箭头函数调用所属组件的 Builder，保留状态所有者 |
| 磨砂弹窗遮罩 | [DialogBackdrop.ets](DialogBackdrop.ets)：订阅应用主题与系统深浅色、覆盖安全区；关闭策略由调用方决定 | `ui-dialog-layout.test.mjs` 全入口扫描；不要逐窗复制磨砂配置或依赖漏传的主题属性 |
| 设置与表单开关行 | [SettingsToggleRow.ets](SettingsToggleRow.ets)：可选说明与 HelpLabel，标题/说明共享剩余宽度，右侧开关不压缩，间隔16vp；确认值、持久化和错误归宿主 | `ui-shell-controls.test.mjs` 执行禁用回调、扫描设置开关及公共几何；`npm test -- sync`、`study-haptics.test.mjs`、`fsrs-state.test.mjs` 验证业务；HAP/设备验证换行与主题 |

笔记图片预览与遮罩画布共用 [ImageSurfaceStyle.ets](../../utils/ImageSurfaceStyle.ets) 的深浅灰底、边框、圆角与裁切；普通预览统一由 `NoteImagePreview` 提供，交互画布保留自己的 Image/Canvas。外观样式不拥有图片尺寸、内外边距或手势，避免改变遮罩命中。验证：`ui-shell-controls.test.mjs`；[设备验收边界](../../../../../../docs/development/study-media.md#图片遮罩)。

`DisclosureChevron` 以 24vp 正方形内的折线绘制，几何中心固定在 (12, 12)，不依赖字体基线。调用方可传 `tint`，展开状态可旋转整个组件，不覆盖内部尺寸、偏移或另绘箭头。`AnchoredMenuItem` 默认按收起/展开在 0°/90° 间旋转，旋转中心固定为自身 50%/50%，不附加平移；`disclosureAngle` 仅供左侧分组覆盖方向，旗标分支使用默认行为。它只作装饰、不拦截点击，交互和无障碍名称由所在行负责。

设置一级目录与操作入口使用图标；二级分组和普通偏好暂不显示装饰图标，调用方省略可选 `icon`，资源映射继续保留。`SettingsActionRow` / `SettingsToggleRow` 的标题与说明显式起始对齐。`HelpLabel` 内部 Row 填满分配宽度，标题和帮助按 `centered` 成组靠左或居中；适用于所有分配了 `layoutWeight` / `width` 的设置、表单与统计标题。图标隐藏时不预留空槽，原卡片边距与尾部控件几何不变。

普通表单组合 `DialogFrame` 与 `DialogHeader`；宽度档位复用 `应用尺寸.dialogCompactMaxWidth / dialogMaxWidth / dialogWideMaxWidth`。复杂已有布局可只复用遮罩和标题栏；原生对话框、抽屉、全屏预览和图片裁剪按各自语义保留布局。系统返回沿页面 → 功能 → 子面板单向传递，最上层消费；不得通过直接卸载父组件绕过子层的返回逻辑或忙碌守卫。

查全部使用位置：`rg -n 'DisclosureChevron' entry/src/main/ets`。运行扫描：`node --test tools/tests/ui-disclosure-contract.test.mjs`。索引指向真实实现，不另维护一份容易过期的调用页面清单。

普通字符串资源的即时翻译使用 `@StorageProp('系统语言')` 建立渲染依赖：直接渲染调用 `localizedResourceText` / `localizedNamedResourceText`，目录辅助函数显式传入语言，既有组件本地文字辅助方法在默认 `_locale` 参数读取语言。资源格式化仍由 UiFeedback 拥有，语言不进入占位符；不重建整页，不丢失草稿或选择。帮助图标使用居中的 `ic_info` SVG，保留44vp点击区与既有点击隔离。

渐变 Span Builder 的按值参数会保留旧字符，因此宿主用仅包裹文字子节点的 `ForEach([this.uiLanguage])` 按语言重建 Span；不重建表单或页面。统计页语言 watcher 只替换缓存的“全部牌组”标签，保留牌组筛选；统计范围选择与默认牌组名也直接依赖同一语言。
