# 公共 UI 代码索引

修改同类 UI 前先从此表进入实现，再用符号名全仓搜索调用点；同时搜索旧符号、资源键和替代写法，避免只覆盖已复用的页面。新增公共语义入口时更新本表及调用检查，不逐页复制组件。

| UI 语义 | 唯一实现 | 自动检查 |
| --- | --- | --- |
| 内置笔记类型与字段的本地化显示 | [NoteTypeText.ets](../../utils/NoteTypeText.ets) / [NoteTypePresentation.ts](../../model/NoteTypePresentation.ts)；字段标题与提示统一由 NoteFieldCard 调用，保留原始名称与模板引用 | `note-type-i18n.test.mjs`；边界见 [浏览与编辑](../../../../../../docs/development/browser-stats.md#内置名称的统一显示) |
| 新增/编辑顶栏与字段卡片 | [NoteEditorHeader.ets](NoteEditorHeader.ets)、[NoteFieldCard.ets](NoteFieldCard.ets)；独立 EditNotePage 和新增页共享，草稿归宿主 | `editor-page.test.mjs`、`ui-shell-contract.test.mjs` |
| 笔记 HTML 字段与选区工具 | [NoteFieldEditor.ets](NoteFieldEditor.ets)；拥有 RichEditor 格式输入、选区/光标与首次学习，复杂 HTML 回退源码；工具自动换行且不收缩；草稿与图片仍归父层；新增和浏览/学习共用 | `note-editing-basics.test.mjs`、`note-rich-editor.test.mjs`；真实中文输入、光标和 ArkUI 更新须设备验收 |
| ⓘ 帮助/信息按钮及标题位置 | [HelpButton.ets](HelpButton.ets) 固定图标、点击区、朗读及事件隔离；[HelpLabel.ets](HelpLabel.ets) 让说明紧随标题；仅卡片信息独立动作保留行尾 | `ui-help-entry.test.mjs` 全 ArkTS 扫描、禁用回调、几何与帮助生命周期回归；规范见 [应用内帮助](../../../../../../docs/development/in-app-help.md) |
| 只读帮助弹窗 | [字段帮助面板.ets](../字段帮助面板.ets) 组合 DialogFrame / DialogHeader；字段帮助对话框适配原生弹窗，支持正文及富内容插槽 | `ui-help-entry.test.mjs`、`ui-dialog-layout.test.mjs`、`deck-option-dialog.test.mjs`；实际系统返回、手势与字体布局须设备验收 |
| 详情/展开箭头（`>` / `›` / `⌃` / `⌄`） | [DisclosureChevron.ets](DisclosureChevron.ets) | `tools/tests/ui-disclosure-contract.test.mjs`：扫描所有 ArkTS，禁止独立文字箭头；检查居中几何 |
| 菜单项、展开行 | [MenuItem.ets](MenuItem.ets)：菜单默认居中，表单展开行通过 `labelAlignment: TextAlign.Start` 左对齐；笔记类型字段、模板、CSS 共用，箭头状态和行高统一 | `ui-select-layout.test.mjs` |
| 原生下拉框与长名称省略 | [SelectStyle.ets](../../utils/SelectStyle.ets)：共享尺寸、统一按钮/普通项/选中项字号、行内最大宽度和单行尾部省略；三类 font、几何及只负责省略的 textModifier 由调用点直接声明，完整名称和选值不变 | `ui-select-layout.test.mjs` 全调用扫描；长短选项切换、标签/ⓘ 避让须设备验收 |
| 牌组选项字段、高级入口及分类行 | [DeckOptionRow.ets](../home/DeckOptionRow.ets)，字段编辑器仍由 DeckOptionField 管理；导航入口只传标题与回调 | `deck-option-dialog.test.mjs`，防止实验版入口另写灰底按钮 |
| 按钮按压反馈 | [GlassSurface.ets](../../utils/GlassSurface.ets)、[PrimaryGlassSurface.ets](../../utils/PrimaryGlassSurface.ets)：原生多态色层、稳定底色/边框，不经触摸状态重建文字；普通按钮与操作行同用 [PressFeedback.ets](../../utils/PressFeedback.ets)，统一单次变淡反馈 | `ui-press-feedback.test.mjs` 全仓点击入口审计，以及 `theme-text.test.mjs`、`button-press-state-contract.test.mjs`、`motion-style-contract.test.mjs`；快点/取消/禁用须设备验收 |
| 页面四段等距与菜单锚点 | [应用尺寸](../../utils/应用尺寸.ets) 的 `页面分组间距`、`pageToolbarTop`、`pageToolbarHeight`、`pageContentTop`；光学估计限制见 [间距验收](../../../../../../docs/UI_SPACING.md) | `ui-shell-contract.test.mjs`；真实状态栏字形须设备验收 |
| 菜单承接层与定位 | [AnchoredMenu.ets](AnchoredMenu.ets) | `ui-select-layout.test.mjs` |
| 学习/预览右上角动作菜单 | [CardActionMenu.ets](CardActionMenu.ets)，直接组合 AnchoredMenu、MenuItem，宽度复用 CardViewportLayout 策略 | `study-menu.test.mjs`、`motion-style-contract.test.mjs`；禁止回退原生 bindMenu |
| 学习/预览内容宽度 | [CardViewport.ets](CardViewport.ets) | `card-viewport-layout.test.mjs` |
| 开始学习 / 固定显示答案 | [开始学习按钮.ets](../开始学习按钮.ets)（文案与回调区分动作） | theme-catalog.test.mjs |
| 短请求延迟显示进度圈 | [DelayedLoadingIndicator.ets](DelayedLoadingIndicator.ets)，挂载后 250ms 显示、卸载取消 | `ui-loading-feedback.test.mjs` |
| 弹窗标题与操作 | [DialogHeader.ets](DialogHeader.ets) | 相关弹窗的行为测试 |
| 普通弹窗外壳 | [DialogFrame.ets](DialogFrame.ets)：固定操作栏、限宽卡片、限高滚动正文；业务组件拥有草稿与忙碌状态 | `ui-dialog-layout.test.mjs`；插槽用箭头函数调用所属组件的 Builder，保留状态所有者 |
| 磨砂弹窗遮罩 | [DialogBackdrop.ets](DialogBackdrop.ets)：订阅应用主题与系统深浅色、覆盖安全区；关闭策略由调用方决定 | `ui-dialog-layout.test.mjs` 全入口扫描；不要逐窗复制磨砂配置或依赖漏传的主题属性 |
| 带长说明的同步开关行 | [SettingsToggleRow.ets](SettingsToggleRow.ets)：标题/说明共享剩余宽度，右侧开关不压缩，间隔 16vp | `npm test -- sync` 验证开关行为；HAP 与设备布局检查验证换行/避让 |

`DisclosureChevron` 以 24vp 正方形内的折线绘制，几何中心固定在 (12, 12)，不依赖字体基线。调用方可传 `tint`，展开状态可旋转整个组件，不覆盖内部尺寸、偏移或另绘箭头。它只作装饰、不拦截点击，交互和无障碍名称由所在行负责。

普通表单组合 `DialogFrame` 与 `DialogHeader`；宽度档位复用 `应用尺寸.dialogCompactMaxWidth / dialogMaxWidth / dialogWideMaxWidth`。复杂已有布局可只复用遮罩和标题栏；原生对话框、抽屉、全屏预览和图片裁剪按各自语义保留布局。系统返回沿页面 → 功能 → 子面板单向传递，最上层消费；不得通过直接卸载父组件绕过子层的返回逻辑或忙碌守卫。

查全部使用位置：`rg -n 'DisclosureChevron' entry/src/main/ets`。运行扫描：`node --test tools/tests/ui-disclosure-contract.test.mjs`。索引指向真实实现，不另维护一份容易过期的调用页面清单。
