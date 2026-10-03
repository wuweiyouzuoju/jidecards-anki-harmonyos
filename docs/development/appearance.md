# 主题与原生界面

[返回任务索引](../../PROJECT_CONTEXT.md)

主题偏好修改（设置页与助手）共用 `backend/AppThemeService.ets` / `model/settings/ThemeModeSession.ts`，先严格保存和回读再应用；失败区分保存未确认与已保存但应用失败。页面通过 `themeMode` 订阅公共状态。启动/系统通知仍由既有入口负责。测试：`theme-mode-session.test.mjs`；助手工具和撤销边界见 [应用内 Agent](agent.md#应用设置读取与修改)。

卡片文字缩放、牌组列表宽度和学习触感保留各自的 `CardTextSizeStore`、`DeckListAppearanceStore`、`StudyHaptics` 保存入口，共用 `utils/LocalPreferenceWrite.ets` 串行保存、原值校验、回读与广播。JIDE 经同一入口确认修改；手动操作不需要提案，设置控件和学习/预览消费既有公共值。保存失败只恢复偏好缓存，磁盘结果未确认时不声称回滚。验证入口：`ai-agent-app-settings.test.mjs`、`ai-agent-local-preference-write.test.mjs` 及各设置原有行为回归；最终观察与交互需设备验收。

- 代码路径以下均相对 `entry/src/main/ets/`。
- 责任链：EntryAbility 配置 → 主题管理器 → AppStorage → 组件响应式刷新。
- 设备深浅色唯一读取入口是 `utils/主题控制器.ets` 的 `readSystemDarkMode()`，通过 API 20+ `resourceManager.getSysResourceManager()` 读取当前设备配置。应用资源管理器及配置通知会受应用 `setColorMode` 覆盖，不能写成系统主题；启动、前台、配置通知与主题修改均重新读取设备来源。通知读取失败保留已知状态，主题修改读取失败明确返回失败。回归：`theme-configuration.test.mjs`、`theme-mode-session.test.mjs`，覆盖强制深浅色后返回系统及旧缓存污染。
- 快速反馈：`npm test -- ui`；完整验收见 [验证说明](verification.md)。

## 视觉与交互一致性

视觉与交互一致性是项目质量要求。新增或修改 UI 先查[公共 UI 索引](../../entry/src/main/ets/components/common/README.md)与实际同类调用，按复用、组合/扩展、必要时新建的顺序实施。同一语义的控件共用已有实现、主题和尺寸；不复制组件再局部改外观，也不在调用处覆盖公共组件内部几何来规避缺陷。公共入口不足时在其责任边界修正，并验证受影响的调用方。

一致性按用户最终看到和操作的结果验收：字号、颜色、间距、圆角、主题和设备适配，以及加载、错误、禁用、确认、取消、返回、草稿提交与忙碌反馈。引用公共组件只是实现手段，不能代替验收；系统返回、遮罩和关闭按钮应服从同一关闭策略，返回先交最上层交互处理。已接受的写入不因关闭展示而被当作已取消。

允许因业务语义、设备形态和平台要求保留差异，并在所属领域记录理由。全屏预览、图片编辑和系统原生确认框不强制采用普通表单外壳；自动前进的底部操作栏保留已有用户约定。只有一处使用的业务内容不为复用率强行通用化。新代码遵守当前规范，旧代码随相关任务迁移；查全影响不授权无关改版。

行为回归应执行实际关闭、提交和返回逻辑；可机械识别的散写通过全入口检查拦截。视觉变更按影响验证深浅色、窄/宽屏、长文字/大字体、键盘与安全区，静态检查和构建不代替设备验收。公共 API、规则及索引在同一变更中同步维护。

## 公共表单控件

白字实底主操作统一使用 `components/common/PrimaryActionButton.ets`。登录、配置保存和开发者启用的完整可用条件由宿主传入，忙碌文案也归宿主；组件只管理44vp高度、15fp字号、22vp圆角、主题色底、按压反馈与禁用回调守卫。工具栏玻璃按钮、学习评分和危险操作按各自语义保留入口，不给主操作按钮增加业务模式。

设置中的 Switch 行共用 `SettingsToggleRow`，支持无说明、长说明及标题后的帮助。右侧开关固定40×24vp且不收缩，与文本列相距16vp；无说明行最小48vp、无额外上下内边距，文字/帮助垂直居中；有说明行上下各12vp、标题到说明4vp，可随大字体与长文字增长。行不设置水平内边距、外边距或安全区偏移，卡片/弹窗拥有水平边距，分组 Column 拥有行间距；页面继续拥有宽/窄布局和安全区，避免重复贡献边距。FSRS 未取得确认值时保留加载文案，不伪造关闭状态；保存、失败恢复、帮助开关与错误提示仍由宿主负责。

完整卡片底色的单行表单输入通过 `utils/FormInputStyle.ets` 统一44vp高度、正文/提示色、边框与圆角，默认左右10vp；创建牌组、过滤牌组和自定义学习沿用 `应用尺寸.卡片内边距`。宿主保留原生 TextInput 的密码/数字类型、过滤、提交、禁用和焦点接口，不再重复完整样式。同步登录的无边框内嵌输入、搜索、提醒的页面底色输入、多行/富文本编辑保持既有外观与交互；公共样式不为这些差异增加业务分支。

回归入口 `tools/tests/ui-shell-controls.test.mjs` 执行公共回调守卫和真实输入样式、扫描设置 Switch 与同类散写；既有业务回归保留保存失败与确认值恢复验证。设备验收覆盖深浅色/主题切换、宽窄屏/安全区、大字体与长说明、帮助点击、密码/数字键盘及提交、忙碌时点击和失败后重试；Node 与 HAP 不证明最终布局和观察更新。

## 编辑格式的交互规范

`NoteFieldEditor` 统一管理新增、浏览和学习编辑。格式按钮无选区时按亮/取消，组合样式只影响后续输入；有选区时修改选中文字，不改变输入开关。当前可视样式为加粗、斜体、下划线、荧光，公式/换行/挖空保持一次动作。工具 Flex 自动换行，按钮不收缩、无横向拖动条；36vp 高度、左右 10vp 内边距，输入框与工具组间距 5vp，横纵按钮间距固定 8vp，源码/可视切换必须调用相同按钮实现，点亮时不改变几何；父页面负责卡片外边距和系统安全区。挖空文字和编号按普通文本显示，不自动添加背景；用户明确设置的荧光仍按原格式显示并保存。编辑器不再解析挖空范围或在输入后补写装饰。输入框提示使用“输入〈字段名〉”和 text_tertiary。复杂 HTML 自动使用源码模式，明确提示其格式操作插入标签。

## 设置弹窗开发入口

开屏与锁定主题共用的幻彩领赠弹窗，标题资源在主题名称前明确换行：“获赠隐藏主题色”与“【幻彩】”各占一行。保留原 DialogHeader 的居中标题、右侧“我已了解”文字操作和原有间距，不另加确认按钮或操作行。主题名称仍复用渐变文字渲染；最终换行须用户真机确认。

普通表单使用 `DialogFrame`：88% 窗口宽、480vp 常规上限，420vp 简短表单、560vp 类型映射；卡片与正文随可用高度限高，标题操作栏固定，正文滚动。`DialogBackdrop` 直接订阅应用主题和系统深色，调用方不再复制磨砂参数。`DialogHeader` 关闭在左、主操作在右；标题相对整个内容区居中，使用独立 Stack 中央层，不受左侧按钮是否显示或两侧文字长度影响。标题占中间 44%，左右操作各占 28%；居中模式的 HelpLabel 内部实际 Row 必须 width=100%，不能只给自定义组件的外层隐形容器设宽，否则文字会停在中央槽位左缘。无横向 padding/offset；父级 DialogFrame 负责对称外边距，窄/宽屏与安全区变化仍以内容区中点对齐。只有说明确认语义可保留右侧“完成/知道了”，无主操作时显式 `showAction: false`。Builder 插槽通过箭头函数调用父组件方法，避免把草稿和回调的 `this` 绑定到外壳。

浏览批量表单、标签/搜索表单、备份管理、许可证与牌组选项加载/错误态已接入公共外壳。首页牌组选项/高级分类/帮助、定制裁剪，以及设置里的维护面板通过 `backRequest` 逐层处理系统返回；忙碌中的写入与关闭按钮遵守相同策略。浏览页先关帮助和顶层编辑，保留下方表单与预览；统计帮助和提醒编辑也先消费返回。

兑换表单与说明保留原生 `bindSheet` 的窗口、焦点与键盘管理，统一指定居中形态并复用标题栏；兑换期间按钮、遮罩、返回及拖拽关闭均受忙碌守卫约束。抽屉遮罩、原生确认框、全屏预览、裁剪，以及自动前进底部操作栏是按语义保留的差异。自动前进选择项沿用背景选中态，并向无障碍服务标记选中。

回归入口 `tools/tests/ui-dialog-layout.test.mjs` 执行实际返回/关闭方法，覆盖嵌套草稿保留、忙碌拦截与原生兑换关闭；扫描阻止重复磨砂实现。设备验收需比较普通/幻彩主题的深浅色、窄屏/横屏、大字体与长标题、输入法弹出、正文滚动、返回手势；Node 与 HAP 均不能证明最终视觉效果。

悬浮短提示统一通过 `utils/UiFeedback.ets` 的 `showToastSafely` 展示，中英文均不带末尾句号；保留省略号及正文内部标点。资源形式的消息先按当前语言解析并保留格式参数，再使用同一格式规则。同步完成状态资源本身也不带句号，确保面板与悬浮提示一致。回归入口：`tools/tests/ui-feedback.test.mjs`。

“外观 → 牌组宽度”由 `components/settings/DeckWidthControl.ets` 提供宽/窄选择。`utils/DeckListAppearanceStore.ets` 是本机偏好 `deckListNarrow` 的唯一读写入口，EntryAbility 在首屏前恢复，未设置默认宽；落盘成功后通过 AppStorage 通知列表、列表项及背景裁剪预览，失败保留原值并在设置中提示。宽版保留 92vp 行高与 12vp 间距；窄版为 60vp / 8vp，名称/描述/计数字号各缩小 1fp（16/12/11fp），移除色条及占位、空描述不占行，上下内边距 6vp、左右 12vp（子牌组仅另加层级缩进），切回宽版恢复已存色调。行高共用 `应用尺寸`，背景裁剪预览跟随当前模式。查找入口：`rg -n 'DECK_LIST_NARROW_KEY|narrowDeckRowHeight' entry/src/main/ets`；回归 `tools/tests/deck-width-layout.test.mjs` 覆盖默认值、重启恢复、写入失败与布局接线。设备验收需检查宽窄切换、长名称/描述、父子牌组、排序和背景图。

窄版左侧统一保留 24vp 的展开/排序槽位，无三角形的同级牌组也保留空槽，名称起点一致；仅父子层级增加缩进。宽窄版复用 `牌组列表项.expansionControl` 的既有 150ms EaseOut 旋转动画。`主页牌组列表` 用 `@Prop` 接收首页的展开集合，更新已有行的 `expanded`；不能用普通字段接收（会停留在旧角度），也不能把展开状态加进 LazyForEach key（重建行会跳过旋转过渡）。

首次宽版牌组列表超出当前可视区域时，首页提示是否切换为“窄”，弹窗说明“更多 → 设置 → 外观 → 牌组宽度”。确认复用 `saveDeckListNarrow(true)`，落盘成功后立即同步布局；“保持宽”或返回不修改宽度。已处理的建议由同一偏好存储记录 `deckWidthHintHandled`，重启不再提示；写入失败有提示，本次会话仍不重复弹出。`主页牌组列表` 用实际 List 视口高度、可见牌组数据源（含已展开子牌组）和共享行高/间距调用 `DeckListAppearance.deckListOverflows`，数据变化监听在离页时释放；恰好放下、未测量和非ready状态不触发。`HomeWorkCoordinator` 在导入、手动同步、公告和启动引导之后分配提示时机，不与现有弹窗重叠。回归：`home-deck-width-layout-suggestion.test.mjs`、`home-work-coordinator.test.mjs`；设备由用户检查首次溢出、确认生效、取消、旋转及返回首页。

同类 UI 的唯一实现和扫描入口见 [公共 UI 代码索引](../../entry/src/main/ets/components/common/README.md)。详情/展开箭头使用 `DisclosureChevron`：24vp 固定绘制区内几何居中，不再依赖文本 `›` 的字体基线。颜色由调用方传入，点击与无障碍名称仍属于整行。修改此类控件先全仓查找已有公共调用及散写，再统一替换；`ui-disclosure-contract.test.mjs` 扫描全部 ArkTS，禁止新出现文字箭头并验证公共几何。

ⓘ 帮助统一通过 `HelpLabel` 紧随其解释的标题，开关和选择器在右侧；`HelpButton` 固定 18vp 系统信息图标、44×44vp 独立点击区和次级文字色。不能用 `Blank` 或标题 `layoutWeight` 把帮助推到整行末尾；剩余宽度分配给整个 HelpLabel，内部仅标题收缩。浏览卡片的“查看卡片信息”是独立记录动作，保留行尾位置但共用按钮。说明弹窗复用 `字段帮助面板`，规范、覆盖入口及设备验收见 [应用内帮助](in-app-help.md#帮助入口与弹窗规范)。

牌组选项的四个常用字段、实验版“高级设置”入口和高级页分类入口共用 `components/home/DeckOptionRow.ets` 的整行外观：15fp标题、48vp最小行高、相同内边距、右箭头及分隔线，透明行背景。导航入口不伪造当前值；`DeckOptionField` 继续独立负责编辑弹窗、校验与草稿更新，主面板统一保存。简洁版仍隐藏高级入口。此前高级入口单独使用13fp、44vp灰底圆角按钮，箭头复用检查未覆盖整行差异；`deck-option-dialog.test.mjs` 现在检查这三个入口共用行组件，禁止入口局部覆盖外观。

新增设置弹窗先复用 `DialogHeader`、`应用尺寸`、`surface_card` 和主题颜色。存在二级界面时，先明确返回目标、待选值、确认写入点和取消语义，不能把连续系统菜单当作等价实现。参考 `StudyAutoAdvanceDialog.ets` 与 [学习与媒体](study-media.md#弹窗操作)：主界面展示名称/当前值/箭头，二级展示选中态；自动前进按用户要求把左返回、右确定放底部。新增交互需有直接行为回归和实际 HAP 构建，未做真机视觉验收应明确记录。

## 应用主题刷新

设置分组标题的最小高度由 `HelpLabel.minRowHeight` 传给内部真实 Row，并在 Row 内垂直居中。`设置分组卡片` 传入 44vp，不再在自定义组件外层另设最小高度；没有帮助图标时也不会把标题挤在顶部。分组内边距仍由卡片统一提供：上/下 8vp、水平 `应用尺寸.卡片内边距`；标题行到正文不追加间距。此几何不随宽窄或安全区变化，页面外侧间距仍由页面负责；大字体可撑高标题行。回归见 `ui-help-entry.test.mjs`，设备观感需另验收。

固定底部答案条在 loading/done/error 阶段仍复用 `开始学习按钮`，保留行动按钮高度、内外边距和实底；仅 question 阶段可用。禁用时采用灰色文字与去色表面，并同时禁用原生点击与回调，避免首帧卡片先铺满、随后被答案条挤短。普通卡 answer 阶段继续显示评分按钮，选择题沿用卡片内操作。该状态接线与禁用回调由 `ui-loading-feedback.test.mjs` 覆盖。

预览覆盖页的根容器与包含重试按钮的错误层使用 `HitTestMode.Default`，背景点击由容器承接；`Block` 会排除子控件，不能用于这种交互容器。仅无操作子项的加载遮罩保留 `Block`，避免旧卡被点击。`preview-runtime.test.mjs` 检查这两处接线，并执行首页/浏览页返回分发：先收起菜单，再退出预览。静态接线检查不能替代设备点击验收。

从学习页返回时，首页刷新保留 ready/empty 快照；同牌组同一天的历史图表刷新保留原图，切换范围或日切才隐藏旧数据，失败仍显示错误。学习页进度圈通过 `DelayedLoadingIndicator` 延迟 250ms，短请求完成即卸载并取消任务，慢请求保持反馈。回归入口为 `ui-loading-feedback.test.mjs` 与 `deck-study-history.test.mjs`。

学习与卡片预览右上角动作菜单通过 `components/common/CardActionMenu.ets` 复用首页的 `AnchoredMenu` 与 `MenuItem`，菜单顶部通过 `应用尺寸.pageContentTop(statusBarHeight, narrow)` 与首卡上缘对齐，定位宽度复用工具栏的 `CardViewportLayout.cardViewportWidth` 策略，菜单在 build 中直接挂载，不能再穿过自定义测量组件的嵌套 Builder。菜单表面、居中文字、分隔线、透明外部关闭层和 150ms 动效均由公共组件负责；长菜单按实际窗口剩余高度滚动。不能用系统 `bindMenu` 默认位置替代该入口。回归见 `tools/tests/study-menu.test.mjs` 和 `motion-style-contract.test.mjs`，设备验收对照首页菜单、学习长菜单和横屏边界。本项执行既有[同类变更闭环](coding-agent.md#同类变更闭环)，不另建治理规则。

设置项选择弹窗和备份选择列表的选中项只保留背景色，不叠加勾号。牌组选项统一从 `components/home/DeckOptionField.ets` 修改该样式；新增同类选择弹窗先复用现有入口，保持相同选中态。

关于页的“意见反馈”通过 `settings/AboutActionDialog.ets` 居中弹窗展示，复用官方 QQ 群号和复制逻辑；赞赏入口已从 UI 隐藏，不再创建赞赏控制器，保留素材。弹窗支持完成按钮、系统返回及点击外部关闭，离开设置时由宿主关闭控制器。

EntryAbility 的配置更新及返回前台通过 `refreshThemeColors()` 使用应用最终深浅色（显式 light/dark 优先于系统），统一刷新色板、玻璃表面和系统栏。未指定颜色模式的配置通知不覆盖已知深浅色，临时读取配置失败保留旧值。

`按下态按钮` 与 `DialogHeader` 在组件 build 内直接消费 `themeLabelGlyphs()`，避免按值 Builder 缓存旧的标签或颜色；字形标识包含文字和颜色。保持共用渐变算法、资源参数与危险操作单色，不为每个按钮分别修正。主题回调组合测试见 `tools/tests/theme-configuration.test.mjs`；实际设备切换效果仍需人工验证。

原生下拉框共用 `utils/SelectStyle.ets`。font、borderRadius、height、padding、space 必须由每个 Select 直接声明共享值，配色由 AttributeModifier 提供；同一行右侧的选择框使用内容自适应宽度，并通过 `fieldConstraint` 限制为行宽的 56%，给左侧标签和帮助入口留出空间。所有原生 Select 直接接入 `textModifier(SelectStyle.labelText())`，当前名称单行显示、超宽尾部省略，不能截断真实选项名称或标识。短名称仍按内容收缩；独占行或固定宽度选择框沿用自身宽度。`textModifier` 不能放进 AttributeModifier，这是 SDK 的调用限制。新增调用点须通过 `tools/tests/ui-select-layout.test.mjs`，设备验收比较首次显示、首次切换、来回切换及长短选项的控件边界。`common/AnchoredMenu` 与 `common/MenuItem` 统一首页、设置、浏览的小菜单及筛选分区展开行；宿主持有选值和持久化，菜单只展示当前组的选择。


## 专属内容与幻彩

领赠说明中的“【幻彩】”（英文 Iridescent）通过 `ThemeHighlightedTextSpans` 单独取幻彩目录的深浅 `ActionColors`，与幻彩主题“新建牌组”使用同一首尾两色和逐字插值；普通主题下也可展示此预告色。标题由 DialogHeader/HelpLabel 的可选高亮参数接线，默认资源/颜色处理不变。正文与群号不染色。CustomDialogController 使用专用 `IridescentGiftDialog` 包装普通 `IridescentGiftPanel`，避免普通组件在控制器初始化时被当作函数调用。

速览及两种领赠说明共用 `components/common/IridescentThemePreview.ets`，只引用已有 `iridescent_preview.png` 实际截图；260vp 限宽、原始比例和无障碍说明保持一致，位于可滚动正文，群号复制入口先于预览显示。

2.9.9 的主题列表展示完整 `ThemeCatalog`，未解锁的幻彩标注“🔒”，点击复用 `components/IridescentGiftPanel.ets` 的领赠说明，且不调用主题切换；通过选择器修订号恢复原生 Select 的真实选中值。已验签权益恢复或兑换成功后正常选用。`model/OfficialCommunity.ts` 是群号的唯一来源。行为回归：`tools/tests/theme-iridescent-gift.test.mjs`。说明复用 `DialogFrame` 的居中限宽、固定操作栏和正文滚动，未新增父层内外边距或安全区贡献。

导航内容统一采用“退出页立即隐藏、进入页淡入”，避免幻彩透明页面的文字和按钮交叉叠加。`utils/HomeNavigationTransition.ets` 是唯一转场编排入口，由首页注册；首页 NavBar 通过独立 `homeTransitionOpacity` 接入同一规则，透明度只作用于内容 Stack，不能放到 Navigation 或根背景上。普通主题也沿用这一节奏。背景冻结/恢复机制保留；`tools/tests/iridescent-rendering.test.mjs` 执行实际转场实现与宿主回调，覆盖首页往返、二级页面 push/pop/replace、缺少 UIContext 和背景生命周期。Node 验证不代替设备上的连续切页观感验收。

安装指纹和离线兑换入口位于“设置 → 应用指纹与兑换”独立分类，简洁版与实验版均可访问，由 `components/settings/RedemptionPanel.ets` 直接展示识别码、复制及主题兑换入口；底层指纹协议不变。`model/Redemption.ts` 固定 JCR1 单内容签名协议；`utils/RedemptionStore.ets` 负责随机指纹落盘、Ed25519 验签、凭证持久化与权益派生。应用只包含 `RedemptionPublicKey.ts` 公钥，私钥由用户目录外置发行工具保管。新增内容在协议白名单、凭证权益派生和工具内容选项中分别增加独立编号；使用流程见 `docs/REDEMPTION.md`。

幻彩只在有效权益下实际应用；ⓘ 与锁定选项明示其赠送给所有 3.0.0 之前用户，并复用官方 QQ 群号。`ThemeCatalog.ts` 统一主题种子色、装饰、背景、权益与发行工具选项，新增主题只登记配置和中英文名称（专属主题另外更新赠送说明）。`ThemeBackground.ets` 在 `Navigation` 外仅创建一次，三张透明纹理每 6 秒向系统合成动画提交平移/缩放/透明度目标，不使用逐帧 ArkTS 更新或运行时色相滤镜；切页不重建、不改变亮度；首页通过 transitionActive 在导航转场期间冻结当前构图，先隐藏退出页再淡入进入页，避免透明 NavDestination 与彩雾根层合成出旧页面残影；onTransitionEnd 解除暂停，转场代次阻止旧结束事件提前恢复。前后台与根可见性控制暂停，轮次号阻止旧完成回调复活动画。页面订阅 `PAGE_SURFACE_KEY`，导航容器透明。`ThemeBackgroundMotion.ts` 提供运动目标，`ThemeVisuals.ets` 转换渐变，牌组色条由长按菜单中的原生 Select 选择六色或无色条；None 在包括幻彩在内的所有主题下保持透明占位，刷新沿用已保存选择，不自动补渐变色条，不改变学习计数语义色。`ThemeText.ets` 的共享 Span 构建器统一主题强调文字，订阅 `THEME_TEXT_COLORS_KEY`，保留普通/禁用/危险文字语义。`GlassSurface.ets` 统一轻操作和评分按钮按下态，与选中牌组共用加厚的深浅玻璃配色；以半透明材料呈现已有柔化背景，不使用实时 backdropBlur。开始学习和两种显示答案通过 PrimaryGlassSurface 共用不透明 surface_card 底色（浅色为白，深色随卡片外观），默认不叠加渐变、无描边；仅按下时叠加主题反馈，文字按当前主题着色；文字节点key包含色值，新建牌组组件内直接绘制Span。导航透明度使用 EaseOut，背景请求 30fps（15–30fps 范围），导航独立请求 60fps；首页与设置的按钮到首卡距离共用页面分组间距，宽版12vp、窄版8vp。扩展步骤见 `docs/REDEMPTION.md`。

页面间距要求为 **a=b=c=d**：系统时间文字下缘→顶部按钮上缘、按钮下缘→今日进度上缘、今日进度下缘→首个牌组上缘、牌组之间。四段共用 `应用尺寸.页面分组间距(narrow)`，宽版12vp、窄版8vp。`pageToolbarTop` / `pageToolbarHeight` 决定顶栏，顶栏在44vp按钮下缘结束（底padding为0），`页面内容顶部间距` 只贡献一次b。首页、设置、统计、浏览、学习、预览、添加笔记、提醒与Agent页面使用同一几何入口；内部表单/聊天/闪卡HTML保留各自布局。菜单调用方传入 `pageContentTop` 最终坐标；`AnchoredMenu` 不再二次扣除窄版偏移。浏览页的搜索、筛选和首张结果卡也必须按同一 `页面分组间距` 排列，筛选容器不能再叠加私有底边距；结果卡之间沿用同一值。

**a 的平台限制与待验收项**：`getWindowAvoidArea(TYPE_SYSTEM).topRect` 是系统避让区，不是状态栏时间字形边界。当前 `statusTextBottomInset=6vp` 是依据用户截图的初始光学校准估计，不是API实测，也没有证明适用于其他设备/字体/横屏。`statusTextBottom` 将此估计与安全区明确分开，无状态栏时钳制为0。须由用户在设备上检查实际时间文字下缘；不能以数学回归通过声称真实a已达标。不得将顶部胶囊内部文字作为参照，也不得为读取系统字形引入截图权限或另绘系统时钟。具体坐标和验收见 [页面间距](../UI_SPACING.md)。

宽/窄偏好仍由 `DeckListAppearanceStore` 唯一持久化，`DECK_LIST_NARROW_KEY` 通知顶栏、同级卡片、牌组列表及菜单调用方同步重算。`ui-shell-contract.test.mjs` 执行实际尺寸函数和首页顶栏表达式，验证宽→窄→宽的四段等式（a针对光学估计），并锁定工具栏无额外底留白、菜单不二次偏移；系统字形精度仍需设备验收。

首页顶部工具栏将左右操作区设置为相同 `layoutWeight`，中间状态组按内容宽度排列、两侧各留 8vp；单个图标对准屏幕中线，组内多个元素以整体中心对齐。不可用两个 Blank 夹住状态或绝对定位覆盖操作区，否则左右按钮标签长度不同会导致偏移或重叠。工具栏按钮启用 `按下态按钮.singleLine`，宽度不超过侧栏，长标签单行省略并保留完整无障碍名称；其他按钮维持原多行行为。同步圆圈固定为 24vp，点击区为 44vp；实际同步中显示圆圈，冲突或错误显示同一点击区内的红色圆圈感叹号，其余状态隐藏，避免等待用户处理的任务完全没有入口。



首页两个菜单通过 `AnchoredMenu.contentMaxWidth` 与工具栏共用 `应用尺寸.内容最大宽度`，定位容器居中限宽，外部点击层仍覆盖窗口。设置与浏览搜索框直接声明共享 `searchFieldHeight`/`searchFieldRadius`，避免系统默认圆角随设备变化。学习术语使用整行可点的 › 箭头，仍打开原说明弹窗。牌组详情在所有屏宽隐藏“当前牌组”，平板等直接展示的详情最上方用同一行等宽44vp操作排列制卡、JIDE、预览，三个入口共用15fp字号、对称4vp内边距和居中文字，相邻点击区由页面分组间距提供常规12vp/紧凑8vp，无额外外边距；预览保留次级文字色。单行标签超宽省略；名称在下方独占整行，自然换行。AI 制卡沿用既有入口开关，未启用时其余两项平分宽度；手机详情顶栏为返回和右上角更多，三个入口使用与首页更多相同的公共 `AnchoredMenu` / `AnchoredMenuItem` 收进无箭头的更多菜单，菜单沿用工具栏下方锚点、统一宽度、行高、分隔线及动效；只有预览范围子弹窗保留箭头，锚定父菜单中的预览行；系统返回先关闭菜单，选择动作、外部点击、退出详情或切换布局均关闭菜单。JIDE 入口仍进入“JIDE 制卡”页面，入口与页面标题分别使用 `ai_agent_title` / `ai_card_title`。空描述不再占一行。牌组详情的开始学习操作区位于滚动内容卡片外、下方，卡片到按钮间距通过 `应用尺寸.操作区顶部间距` 只贡献一次；底部通过 `操作区底部间距(窄版, 导航条高度)` 自动避让导航条。学习页固定显示答案使用同一操作区公式，无导航条时仍保留页面底部留白。手机详情与宽屏侧栏共用这一布局。开始学习和固定显示答案直接复用 components/开始学习按钮.ets，由文案和回调区分动作，共用字号、尺寸、不透明白底及按压效果，与浮动显示答案统一不显示描边。学习与预览采用牌组详情相同的 surface_card / border_subtle 浅边框，并共用 CardViewportLayout 的窗口限宽规则与同款卡片外框，横屏随窗口放宽，保留牌组模板自己的排版。


新增/编辑页布局统一由 `NoteEditorHeader`（左右 28%、中央标题 44%，状态栏避让沿用 pageToolbarTop）与 `NoteFieldCard`（内边距 16vp、内部间距 8vp）持有。外层滚动区域使用同一页面水平边距、顶部内容间距，底部留 8vp 加导航条高度。编辑页是 NavDestination，不在旧弹窗内再套页面；读取错误和忙态也复用同一顶栏。`editor-page` 与 `ui-shell-contract` 验证接线，真实键盘、字体缩放和换行边界仍需设备验收。

新增页“标签”和牌组详情“更多”共用 `utils/ExpansionReveal.ets` 的末尾折叠区显露行为：宿主点击后请求滚动，由展开内容的 `onAreaChange` 在正高度布局完成后消费一次，沿用 Scroll 的原生滚动到底部动画。收起、子操作关闭和离页取消未执行请求；输入、字体/尺寸变化不重复拉动滚动位置。这里的展开区均位于滚动正文末尾，固定顶栏和开始学习操作区仍在滚动容器外；聊天新消息跟随及始终展示的编辑标签输入不属于此行为。`ui-shell-expansion.test.mjs` 执行公共控制器和两处真实宿主回调，实际键盘、长内容、宽/窄布局和快速开合的最终可见范围须设备验收。

共用 `@Builder` 中随状态变化的按钮文案必须在组件表达式内直接读取状态，或采用可追踪的引用传参，不能先在调用方算好动态文案再按值传入。`NoteFieldEditor.tool` 内根据 `sourceMode` 选择“源码/可视编辑”；`note-rich-editor` 固定同一组初始参数验证两次模式切换后的真实标签表达式，避免只验证编辑区域而漏掉按钮文案。

笔记类型编辑器复用 `DialogFrame` / `DialogHeader`，折叠时按内容收缩，展开后正文限高滚动。字段、模板、CSS 的展开行复用 `AnchoredMenuItem` 的左对齐模式，箭头使用公共几何组件，不用文字字符；模板选择保留 `SelectStyle`。

按钮按压反馈由一个所有者负责：`GlassSurface` / `PrimaryGlassSurface` 通过 `applyNormalAttribute`、`applyPressedAttribute` 和 `applyDisabledAttribute` 直接设置色层，调用方关闭默认 `stateEffect`。按下、松开、取消和禁用不写组件/父层 `@State`，不重建文字，不切换透明底或边框，渐变停靠点数量和位置保持一致；不在这些按钮上添加覆盖整按钮的隐式动画。所有普通按钮和操作行也复用 `PressFeedback`：正常不透明度乘以 0.72 显示按下态，松开恢复；保留调用方忙态/隐藏透明度，禁用单独显示。两个玻璃表面继承该反馈，确保浅色玻璃在白底上也可见；不再叠加手动缩放或隐式动画。导航、展开箭头和主题背景动画各自保持原有职责。

按钮回归：`theme-text.test.mjs` 执行两种表面的按下/恢复/禁用、连续重复、兄弟按钮隔离和渐变几何；`button-press-state-contract.test.mjs` 审计全部自定义表面调用，`motion-style-contract.test.mjs` 检查普通按钮没有双重反馈。它们不模拟 ArkUI 的真实触摸分发；浅/深色与幻彩下的快点、长按移出、取消、弹窗切换仍须真机验收。

`tools/arkui-click-targets.mjs` 按括号配对解析 ArkUI 点击节点与自身修饰链（忽略字符串/注释/子节点），`ui-press-feedback.test.mjs` 扫描全部 `.ets` 的按钮和操作行，禁止遗漏公共反馈或重复开启默认 Button 效果。明确排除无操作事件屏障、关闭遮罩、正文 Span 链接和系统桌面卡片；这些不是应用内按钮。

### JIDE 设置修改确认

主题色与 FSRS 修改复用 `AgentActionCard` 的原生确认/取消按钮和面板几何，显示前后值及作用范围；全库 FSRS 开启明确提示重新调度。主题色和设置页共用 `AppThemeService` 保存/回读/广播入口，偏好保存与实际应用分别报告；部分成功显示已保存但应用失败，不显示完成。失败、取消及离页沿用辅助动作已有生命周期，设备交互验收范围需随交付记录。


## 紧凑选择行与辅助操作（2026-10-02）

`components/common/FormSelectRow.ets` 统一导入、导出格式、筛选排序、新类型/标准来源、卡片范围和模板选择的左右布局：标签可换行并使用剩余宽度，控件按内容收缩但最多占 56%，两者仅由 Row 提供 12vp 间隔；控件不参与压缩，长选项在当前显示中单行尾部省略，原始名称、选项和 ID 保持完整。ImportSelect 仅适配导入字段，不再自行持有几何。已有 HelpLabel/字段映射保留自身语义布局并沿用 SelectStyle 限宽和省略；时分组合在右侧总共使用 56%，两框平分剩余空间。

`LabeledActionRow.ets` 复用同样的标签宽度、间隔和右侧限宽，内部使用按下态按钮；JIDE 目标选择、主题撤销、新建类型、联网额度购买、背景选择、兑换使用、媒体新增和音频重播共用此行。辅助按钮文案允许尾部省略，保留完整无障碍名称。保存、提交、危险确认等原表单操作不受这次紧凑化影响。禁用守卫、越界选项和完整值回归见 `ui-compact-controls.test.mjs`；共享选择几何继续由 `ui-select-layout.test.mjs` 全调用扫描。宽/窄屏、长中英文标签、大字号及安全区变化仍需设备验收，Node 测试与签名构建不代表像素验收。

本轮 `npm run verify` 完整通过：Node 2114 项、Rust/真实 Core 测试、沙箱与 RPC 校验、双架构原生及签名 HAP 均通过；构建警告 accepted=268、unexpected=0。最后一次源码与文档调整后再次运行 `npm test`，2114 项通过。本次未安装到平板，也未操作设备界面。
