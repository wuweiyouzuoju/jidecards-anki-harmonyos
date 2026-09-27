# 主题与原生界面

[返回任务索引](../../PROJECT_CONTEXT.md)

- 代码路径以下均相对 `entry/src/main/ets/`。
- 责任链：EntryAbility 配置 → 主题管理器 → AppStorage → 组件响应式刷新。
- 快速反馈：`npm test -- ui`；完整验收见 [验证说明](verification.md)。

## 设置弹窗开发入口

悬浮短提示统一通过 `utils/UiFeedback.ets` 的 `showToastSafely` 展示，中英文均不带末尾句号；保留省略号及正文内部标点。资源形式的消息先按当前语言解析并保留格式参数，再使用同一格式规则。同步完成状态资源本身也不带句号，确保面板与悬浮提示一致。回归入口：`tools/tests/ui-feedback.test.mjs`。

“外观 → 牌组宽度”由 `components/settings/DeckWidthControl.ets` 提供宽/窄选择。`utils/DeckListAppearanceStore.ets` 是本机偏好 `deckListNarrow` 的唯一读写入口，EntryAbility 在首屏前恢复，未设置默认宽；落盘成功后通过 AppStorage 通知列表、列表项及背景裁剪预览，失败保留原值并在设置中提示。宽版保留 92vp 行高与 12vp 间距；窄版为 60vp / 8vp，名称/描述/计数字号各缩小 1fp（16/12/11fp），移除色条及占位、空描述不占行，上下内边距 6vp、左右 12vp（子牌组仅另加层级缩进），切回宽版恢复已存色调。行高共用 `应用尺寸`，背景裁剪预览跟随当前模式。查找入口：`rg -n 'DECK_LIST_NARROW_KEY|narrowDeckRowHeight' entry/src/main/ets`；回归 `tools/tests/deck-width-layout.test.mjs` 覆盖默认值、重启恢复、写入失败与布局接线。设备验收需检查宽窄切换、长名称/描述、父子牌组、排序和背景图。

窄版左侧统一保留 24vp 的展开/排序槽位，无三角形的同级牌组也保留空槽，名称起点一致；仅父子层级增加缩进。宽窄版复用 `牌组列表项.expansionControl` 的既有 150ms EaseOut 旋转动画。`主页牌组列表` 用 `@Prop` 接收首页的展开集合，更新已有行的 `expanded`；不能用普通字段接收（会停留在旧角度），也不能把展开状态加进 LazyForEach key（重建行会跳过旋转过渡）。

首次宽版牌组列表超出当前可视区域时，首页提示是否切换为“窄”，弹窗说明“更多 → 设置 → 外观 → 牌组宽度”。确认复用 `saveDeckListNarrow(true)`，落盘成功后立即同步布局；“保持宽”或返回不修改宽度。已处理的建议由同一偏好存储记录 `deckWidthHintHandled`，重启不再提示；写入失败有提示，本次会话仍不重复弹出。`主页牌组列表` 用实际 List 视口高度、可见牌组数据源（含已展开子牌组）和共享行高/间距调用 `DeckListAppearance.deckListOverflows`，数据变化监听在离页时释放；恰好放下、未测量和非ready状态不触发。`HomeWorkCoordinator` 在导入、手动同步、公告和启动引导之后分配提示时机，不与现有弹窗重叠。回归：`home-deck-width-layout-suggestion.test.mjs`、`home-work-coordinator.test.mjs`；设备由用户检查首次溢出、确认生效、取消、旋转及返回首页。

同类 UI 的唯一实现和扫描入口见 [公共 UI 代码索引](../../entry/src/main/ets/components/common/README.md)。详情/展开箭头使用 `DisclosureChevron`：24vp 固定绘制区内几何居中，不再依赖文本 `›` 的字体基线。颜色由调用方传入，点击与无障碍名称仍属于整行。修改此类控件先全仓查找已有公共调用及散写，再统一替换；`ui-disclosure-contract.test.mjs` 扫描全部 ArkTS，禁止新出现文字箭头并验证公共几何。

牌组选项的四个常用字段、实验版“高级设置”入口和高级页分类入口共用 `components/home/DeckOptionRow.ets` 的整行外观：15fp标题、48vp最小行高、相同内边距、右箭头及分隔线，透明行背景。导航入口不伪造当前值；`DeckOptionField` 继续独立负责编辑弹窗、校验与草稿更新，主面板统一保存。简洁版仍隐藏高级入口。此前高级入口单独使用13fp、44vp灰底圆角按钮，箭头复用检查未覆盖整行差异；`deck-option-dialog.test.mjs` 现在检查这三个入口共用行组件，禁止入口局部覆盖外观。

新增设置弹窗先复用 `DialogHeader`、`应用尺寸`、`surface_card` 和主题颜色。存在二级界面时，先明确返回目标、待选值、确认写入点和取消语义，不能把连续系统菜单当作等价实现。参考 `StudyAutoAdvanceDialog.ets` 与 [学习与媒体](study-media.md#弹窗操作)：主界面展示名称/当前值/箭头，二级展示选中态；自动前进按用户要求把左返回、右确定放底部。新增交互需有直接行为回归和实际 HAP 构建，未做真机视觉验收应明确记录。

## 应用主题刷新

固定底部答案条在 loading/done/error 阶段仍复用 `开始学习按钮`，保留行动按钮高度、内外边距和实底；仅 question 阶段可用。禁用时采用灰色文字与去色表面，并同时禁用原生点击与回调，避免首帧卡片先铺满、随后被答案条挤短。普通卡 answer 阶段继续显示评分按钮，选择题沿用卡片内操作。该状态接线与禁用回调由 `ui-loading-feedback.test.mjs` 覆盖。

预览覆盖页的根容器与包含重试按钮的错误层使用 `HitTestMode.Default`，背景点击由容器承接；`Block` 会排除子控件，不能用于这种交互容器。仅无操作子项的加载遮罩保留 `Block`，避免旧卡被点击。`preview-runtime.test.mjs` 检查这两处接线，并执行首页/浏览页返回分发：先收起菜单，再退出预览。静态接线检查不能替代设备点击验收。

从学习页返回时，首页刷新保留 ready/empty 快照；同牌组同一天的历史图表刷新保留原图，切换范围或日切才隐藏旧数据，失败仍显示错误。学习页进度圈通过 `DelayedLoadingIndicator` 延迟 250ms，短请求完成即卸载并取消任务，慢请求保持反馈。回归入口为 `ui-loading-feedback.test.mjs` 与 `deck-study-history.test.mjs`。

学习与卡片预览右上角动作菜单通过 `components/common/CardActionMenu.ets` 复用首页的 `AnchoredMenu` 与 `MenuItem`，菜单顶部通过 `应用尺寸.pageContentTop(statusBarHeight, narrow)` 与首卡上缘对齐，定位宽度复用工具栏的 `CardViewportLayout.cardViewportWidth` 策略，菜单在 build 中直接挂载，不能再穿过自定义测量组件的嵌套 Builder。菜单表面、居中文字、分隔线、透明外部关闭层和 150ms 动效均由公共组件负责；长菜单按实际窗口剩余高度滚动。不能用系统 `bindMenu` 默认位置替代该入口。回归见 `tools/tests/study-menu.test.mjs` 和 `motion-style-contract.test.mjs`，设备验收对照首页菜单、学习长菜单和横屏边界。本项执行既有[同类变更闭环](coding-agent.md#同类变更闭环)，不另建治理规则。

设置项选择弹窗和备份选择列表的选中项只保留背景色，不叠加勾号。牌组选项统一从 `components/home/DeckOptionField.ets` 修改该样式；新增同类选择弹窗先复用现有入口，保持相同选中态。

关于页的“意见反馈”和“赞赏作者”使用与其他入口一致的 `›`，通过 `settings/AboutActionDialog.ets` 居中弹窗展示，不在列表内展开。反馈复用设置面板的官方 QQ 群号和复制逻辑，赞赏保留原二维码；弹窗支持完成按钮、系统返回及点击外部关闭，离开设置时由宿主关闭控制器。

EntryAbility 的配置更新及返回前台通过 `refreshThemeColors()` 使用应用最终深浅色（显式 light/dark 优先于系统），统一刷新色板、玻璃表面和系统栏。未指定颜色模式的配置通知不覆盖已知深浅色，临时读取配置失败保留旧值。

`按下态按钮` 与 `DialogHeader` 在组件 build 内直接消费 `themeLabelGlyphs()`，避免按值 Builder 缓存旧的标签或颜色；字形标识包含文字和颜色。保持共用渐变算法、资源参数与危险操作单色，不为每个按钮分别修正。主题回调组合测试见 `tools/tests/theme-configuration.test.mjs`；实际设备切换效果仍需人工验证。

原生下拉框共用 `utils/SelectStyle.ets`。font、borderRadius、height、padding、space 必须由每个 Select 直接声明共享值，配色由 AttributeModifier 提供；设置区选择框使用内容自适应宽度，避免短标签占满行并留下大块空白。新增调用点须通过 `tools/tests/ui-select-layout.test.mjs`，设备验收比较首次显示、首次切换、来回切换及长短选项的控件边界。`common/AnchoredMenu` 与 `common/MenuItem` 统一首页、设置、浏览的小菜单及筛选分区展开行；宿主持有选值和持久化，菜单只展示当前组的选择。


## 专属内容与幻彩

导航内容统一采用“退出页立即隐藏、进入页淡入”，避免幻彩透明页面的文字和按钮交叉叠加。`pages/首页.ets` 的 `自定义转场回调` 是唯一编排入口；首页 NavBar 通过独立 `homeTransitionOpacity` 接入同一规则，透明度只作用于内容 Stack，不能放到 Navigation 或根背景上。普通主题也沿用这一节奏。背景冻结/恢复机制保留；`tools/tests/iridescent-rendering.test.mjs` 执行页面实际注册回调，覆盖首页往返、二级页面 push/pop/replace、缺少 UIContext 和背景生命周期。Node 验证不代替设备上的连续切页观感验收。

安装指纹和离线兑换入口位于“设置 → 应用指纹与兑换”独立分类，简洁版与实验版均可访问，由 `components/settings/RedemptionPanel.ets` 直接展示识别码、复制及主题兑换入口；底层指纹协议不变。`model/Redemption.ts` 固定 JCR1 单内容签名协议；`utils/RedemptionStore.ets` 负责随机指纹落盘、Ed25519 验签、凭证持久化与权益派生。应用只包含 `RedemptionPublicKey.ts` 公钥，私钥由用户目录外置发行工具保管。新增内容在协议白名单、凭证权益派生和工具内容选项中分别增加独立编号；使用流程见 `docs/REDEMPTION.md`。

幻彩只在有效权益下进入主题选择；ⓘ 明示其赠送给 3.0.0 之前使用的老用户，并复用关于页 QQ 群号。`ThemeCatalog.ts` 统一主题种子色、装饰、背景、权益与发行工具选项，新增主题只登记配置和中英文名称（专属主题另外更新赠送说明）。`ThemeBackground.ets` 在 `Navigation` 外仅创建一次，三张透明纹理每 6 秒向系统合成动画提交平移/缩放/透明度目标，不使用逐帧 ArkTS 更新或运行时色相滤镜；切页不重建、不改变亮度；首页通过 transitionActive 在导航转场期间冻结当前构图，先隐藏退出页再淡入进入页，避免透明 NavDestination 与彩雾根层合成出旧页面残影；onTransitionEnd 解除暂停，转场代次阻止旧结束事件提前恢复。前后台与根可见性控制暂停，轮次号阻止旧完成回调复活动画。页面订阅 `PAGE_SURFACE_KEY`，导航容器透明。`ThemeBackgroundMotion.ts` 提供运动目标，`ThemeVisuals.ets` 转换渐变，牌组色条由长按菜单中的原生 Select 选择六色或无色条；None 在包括幻彩在内的所有主题下保持透明占位，刷新沿用已保存选择，不自动补渐变色条，不改变学习计数语义色。`ThemeText.ets` 的共享 Span 构建器统一主题强调文字，订阅 `THEME_TEXT_COLORS_KEY`，保留普通/禁用/危险文字语义。`GlassSurface.ets` 统一轻操作和评分按钮按下态，与选中牌组共用加厚的深浅玻璃配色；以半透明材料呈现已有柔化背景，不使用实时 backdropBlur。开始学习和两种显示答案通过 PrimaryGlassSurface 共用不透明 surface_card 底色（浅色为白，深色随卡片外观），默认不叠加渐变、无描边；仅按下时叠加主题反馈，文字按当前主题着色；文字节点key包含色值，新建牌组组件内直接绘制Span。导航透明度使用 EaseOut，背景请求 30fps（15–30fps 范围），导航独立请求 60fps；首页与设置的按钮到首卡距离共用页面分组间距，宽版12vp、窄版8vp。扩展步骤见 `docs/REDEMPTION.md`。

页面间距要求为 **a=b=c=d**：系统时间文字下缘→顶部按钮上缘、按钮下缘→今日进度上缘、今日进度下缘→首个牌组上缘、牌组之间。四段共用 `应用尺寸.页面分组间距(narrow)`，宽版12vp、窄版8vp。`pageToolbarTop` / `pageToolbarHeight` 决定顶栏，顶栏在44vp按钮下缘结束（底padding为0），`页面内容顶部间距` 只贡献一次b。首页、设置、统计、浏览、学习、预览、添加笔记、提醒与Agent页面使用同一几何入口；内部表单/聊天/闪卡HTML保留各自布局。菜单调用方传入 `pageContentTop` 最终坐标；`AnchoredMenu` 不再二次扣除窄版偏移。

**a 的平台限制与待验收项**：`getWindowAvoidArea(TYPE_SYSTEM).topRect` 是系统避让区，不是状态栏时间字形边界。当前 `statusTextBottomInset=6vp` 是依据用户截图的初始光学校准估计，不是API实测，也没有证明适用于其他设备/字体/横屏。`statusTextBottom` 将此估计与安全区明确分开，无状态栏时钳制为0。须由用户在设备上检查实际时间文字下缘；不能以数学回归通过声称真实a已达标。不得将顶部胶囊内部文字作为参照，也不得为读取系统字形引入截图权限或另绘系统时钟。具体坐标和验收见 [页面间距](../UI_SPACING.md)。

宽/窄偏好仍由 `DeckListAppearanceStore` 唯一持久化，`DECK_LIST_NARROW_KEY` 通知顶栏、同级卡片、牌组列表及菜单调用方同步重算。`ui-shell-contract.test.mjs` 执行实际尺寸函数和首页顶栏表达式，验证宽→窄→宽的四段等式（a针对光学估计），并锁定工具栏无额外底留白、菜单不二次偏移；系统字形精度仍需设备验收。

首页顶部工具栏将左右操作区设置为相同 `layoutWeight`，中间状态组按内容宽度排列、两侧各留 8vp；单个图标对准屏幕中线，组内多个元素以整体中心对齐。不可用两个 Blank 夹住状态或绝对定位覆盖操作区，否则左右按钮标签长度不同会导致偏移或重叠。工具栏按钮启用 `按下态按钮.singleLine`，宽度不超过侧栏，长标签单行省略并保留完整无障碍名称；其他按钮维持原多行行为。同步圆圈固定为 24vp，点击区为 44vp；实际同步中显示圆圈，冲突或错误显示同一点击区内的红色圆圈感叹号，其余状态隐藏，避免等待用户处理的任务完全没有入口。



首页两个菜单通过 `AnchoredMenu.contentMaxWidth` 与工具栏共用 `应用尺寸.内容最大宽度`，定位容器居中限宽，外部点击层仍覆盖窗口。设置与浏览搜索框直接声明共享 `searchFieldHeight`/`searchFieldRadius`，避免系统默认圆角随设备变化。学习术语使用整行可点的 › 箭头，仍打开原说明弹窗。牌组详情在所有屏宽隐藏“当前牌组”，牌组名称与操作区共用一行，预览位于右上角；宽屏操作区纵向靠右排列，添加卡片在上、预览在下；窄屏保留单个预览入口。操作区不压缩，长名称在剩余宽度内换行；空描述不再占一行。牌组详情的开始学习操作区位于滚动内容卡片外、下方，卡片到按钮间距和导航安全区与学习页固定答案条一致；手机详情与宽屏侧栏共用这一布局。开始学习和固定显示答案直接复用 components/开始学习按钮.ets，由文案和回调区分动作，共用字号、尺寸、不透明白底及按压效果，与浮动显示答案统一不显示描边。学习与预览采用牌组详情相同的 surface_card / border_subtle 浅边框，并共用 CardViewportLayout 的窗口限宽规则与同款卡片外框，横屏随窗口放宽，保留牌组模板自己的排版。
