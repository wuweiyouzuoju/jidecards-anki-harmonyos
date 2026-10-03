# 公共 UI 代码索引

修改同类 UI 前先从此表进入实现，再用符号名全仓搜索调用点；同时搜索旧符号、资源键和替代写法，避免只覆盖已复用的页面。新增公共语义入口时更新本表及调用检查，不逐页复制组件。

普通次操作复用 `按下态按钮.ets`，`fillWidth` 仅供需要满宽的提案/表单操作使用，默认仍保留内容宽度；组件内禁用守卫阻止迟到点击。Agent 提案确认与取消分别组合 `PrimaryActionButton` 和该按钮，不另写按钮几何；回归见 `ai-agent-markdown-ui.test.mjs`。

| UI 语义 | 唯一实现 | 自动检查 |
| --- | --- | --- |
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
| 菜单项、展开行 | [MenuItem.ets](MenuItem.ets)：菜单默认居中，表单展开行通过 `labelAlignment: TextAlign.Start` 左对齐；笔记类型字段、模板、CSS 共用，箭头状态和行高统一 | `ui-select-layout.test.mjs` |
| 滚动正文末尾的展开内容显露 | [ExpansionReveal.ets](../../utils/ExpansionReveal.ets)：宿主持有展开状态，点击请求、展开内容的 `onAreaChange` 消费一次滚动；收起和离页取消；标签与牌组“更多”共用，聊天自动跟随保留独立语义 | `ui-shell-expansion.test.mjs` 执行真实控制器、宿主切换方法及布局回调；实际滚动范围/键盘须设备验收 |
| 原生下拉框与长名称省略 | [SelectStyle.ets](../../utils/SelectStyle.ets)：共享尺寸、统一按钮/普通项/选中项字号、行内最大宽度和单行尾部省略；三类 font、几何及只负责省略的 textModifier 由调用点直接声明，完整名称和选值不变 | `ui-select-layout.test.mjs` 全调用扫描；长短选项切换、标签/ⓘ 避让须设备验收 |
| 牌组选项字段、高级入口及分类行 | [DeckOptionRow.ets](../home/DeckOptionRow.ets)，字段编辑器仍由 DeckOptionField 管理；导航入口只传标题与回调 | `deck-option-dialog.test.mjs`，防止实验版入口另写灰底按钮 |
| 按钮按压反馈 | [GlassSurface.ets](../../utils/GlassSurface.ets)、[PrimaryGlassSurface.ets](../../utils/PrimaryGlassSurface.ets)：原生多态色层、稳定底色/边框，不经触摸状态重建文字；普通按钮与操作行同用 [PressFeedback.ets](../../utils/PressFeedback.ets)，统一单次变淡反馈 | `ui-press-feedback.test.mjs` 全仓点击入口审计，以及 `theme-text.test.mjs`、`button-press-state-contract.test.mjs`、`motion-style-contract.test.mjs`；快点/取消/禁用须设备验收 |
| 页面四段等距与菜单锚点 | [应用尺寸](../../utils/应用尺寸.ets) 的 `页面分组间距`、`pageToolbarTop`、`pageToolbarHeight`、`pageContentTop`；光学估计限制见 [间距验收](../../../../../../docs/UI_SPACING.md) | `ui-shell-contract.test.mjs`；真实状态栏字形须设备验收 |
| 菜单承接层与定位 | [AnchoredMenu.ets](AnchoredMenu.ets) | `ui-select-layout.test.mjs` |
| 学习/预览右上角动作菜单 | [CardActionMenu.ets](CardActionMenu.ets)，直接组合 AnchoredMenu、MenuItem，宽度复用 CardViewportLayout 策略 | `study-menu.test.mjs`、`motion-style-contract.test.mjs`；禁止回退原生 bindMenu |
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

`DisclosureChevron` 以 24vp 正方形内的折线绘制，几何中心固定在 (12, 12)，不依赖字体基线。调用方可传 `tint`，展开状态可旋转整个组件，不覆盖内部尺寸、偏移或另绘箭头。它只作装饰、不拦截点击，交互和无障碍名称由所在行负责。

普通表单组合 `DialogFrame` 与 `DialogHeader`；宽度档位复用 `应用尺寸.dialogCompactMaxWidth / dialogMaxWidth / dialogWideMaxWidth`。复杂已有布局可只复用遮罩和标题栏；原生对话框、抽屉、全屏预览和图片裁剪按各自语义保留布局。系统返回沿页面 → 功能 → 子面板单向传递，最上层消费；不得通过直接卸载父组件绕过子层的返回逻辑或忙碌守卫。

查全部使用位置：`rg -n 'DisclosureChevron' entry/src/main/ets`。运行扫描：`node --test tools/tests/ui-disclosure-contract.test.mjs`。索引指向真实实现，不另维护一份容易过期的调用页面清单。
