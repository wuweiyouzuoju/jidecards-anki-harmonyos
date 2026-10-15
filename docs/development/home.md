# 首页任务与外部入口

[返回任务索引](../../PROJECT_CONTEXT.md)

2026-10-07：既有筛选牌组的详情与列表菜单提供“清空筛选牌组”“重建筛选牌组”。`FilteredDeckCommands` 独占校验、串行写入、自动同步占用与集合刷新，`backend/FilteredDeckService.ets` 只适配真实 Core。维护动作保留笔记与原牌组关联；重建显示 Core 实际计数。共享 `deckDetailsMoreItems` 排除筛选牌组不适用的普通预设选项，UI/JIDE 观察采用同一动作声明和真实 busy/filtered 值。复杂配置经 JIDE 提案，不增加配置工作台。手动创建表单使用公共 `DialogHeader`、`FormSelectRow` 和 `SettingsToggleRow`；排序选项来自与 JIDE 共用的 `FilteredDeckOptions`，按当前语言读取。直接行为与真实 Core 撤销测试、模拟器6→0→6记录见[本轮验收](ankidroid-high-priority-2026-10-07.md)。

- 代码路径以下均相对 `entry/src/main/ets/`。
- 责任链：首页映射 UI → HomeWorkCoordinator / HomeStartupSequence / HomeSyncPolicy 决策 → HomeDataRepository / 既有 Service。
- 首页新建牌组菜单不再提供 AI 制卡/改卡。统计卡旁的独立 JIDE 图标通过 `onAgent` → `openAgent` 打开空白对话入口，配置预检和开发者开关保持在既有责任入口；按需目标选择、改卡搜索与确认见[应用内 Agent](agent.md#统一-ai-对话入口)。
- 平板等直接展示的牌组详情将制卡、JIDE、预览放在滚动卡片外、上方的同一行纯图标操作，制卡贴左上角、预览贴右上角，默认隐藏的 JIDE 在启用后紧邻左侧制卡按钮，按钮显隐不改变两端位置；常规按钮为44vp正方形且无额外外缘留白；右侧动作行从与左侧相同的 GridRow 上沿开始，高度复用左栏实测的 HomeHeaderLayout.actionsHeight，窄分栏同步收缩；动作行到卡片只贡献一次公共内容间距，因此两栏卡片上沿对齐。排序时左栏使用叉号退出与文字完成的独立工具栏，右侧动作行同时收起，两边卡片仅保留相同的内容顶部间距；JIDE 从真实详情观察值 header_actions_position 区分 above_card、hidden、toolbar_right。下方牌组名称独占整行并自然换行；手机详情将制卡、JIDE、预览三个图标直接排在顶栏右上角，左侧保留返回；共用主页 `IconActionButton.toolbarStyle`，JIDE 仍按原入口开关显隐。点击预览后显示 `DeckPreviewScopeMenu` 的四种范围，内容直接复用 `ActionMenuList` 的居中文字、行高、分隔线与按压反馈。`HomeDeckDetails` 为手机和宽屏持有唯一的无尖角 `AnchoredMenu`；手机点击预览图标后直接在工具栏下方展开范围，手机与宽屏菜单右缘均贴齐预览按钮和详情卡片。工具栏通过 `onAreaChange` 发布窗口坐标与实际宽度，宿主仅转换一次本地坐标，避免右侧分栏重复叠加横向偏移；菜单宽度不超过实测内容宽度。预览范围显示时退出被遮住的 `deck_actions` 观察；选择范围或退出时关闭菜单。系统返回先关闭菜单，再退出详情。取卡读取独立集合快照，范围与数据边界见 [只读预览](study-media.md#卡片只读预览)。入口名称为 JIDE，仍进入标题为“JIDE 制卡”的页面。`HomeDeckDetails.onCreateWithAI` 转发到首页既有 `打开AI制卡`，使用当前牌组参数并保留同步等待、配置预检和开发者入口开关；验证见 `ui-shell-deck-actions.test.mjs`、`deck-preview-session.test.mjs`，长标签与长名称的设备观感单独验收。
- 快速反馈：`npm test -- home`；完整验收见 [验证说明](verification.md)。
- 牌组行长按通过 `onMenu` → `onItemMenu` 只把稳定牌组 ID 交给首页 `deckMenuId`；根层 `HomeDeckRowMenu` 复用 `DialogFrame` / `DialogHeader` 显示居中列表弹窗，标题为 Core 完整牌组名。列表行不测量菜单锚点，弹窗不跟随行位置或绘制尖角。外框独占卡片内边距、安全区、窗口/键盘避让和正文限高滚动；正文 Column 无附加间距，动作与色调候选均复用 `AnchoredMenuItem` 的行高、内边距、分隔线和按压反馈。色调在原条目下展开，五色/无色条候选与历史枚举值继续来自 `DeckTone.ts`，无色条保留圆环斜杠图标与非强调文字。系统返回先收起颜色再关闭弹窗；标题关闭和遮罩直接关闭整个弹窗，忙碌与销毁守卫覆盖全部退出入口。UI/JIDE 共用 `deck_row_menu` / `deck_tones` 的条目、显隐、忙碌和当前色调，关闭控件也登记在共同目录；观察值 `presentation=centered_dialog`、`deck_name` 对应实际呈现与标题，关闭移除观察。首页把弹窗计入公告/自动同步占用，目标删除后清理弹窗。
- 长按打开菜单时同步首页 `选中的牌组ID`，列表只高亮本次长按的目标，关闭菜单后保留该选择；不调用普通点击的 `选择牌组`，避免手机详情覆盖菜单。详情和 JIDE 首页 `selectedId` 沿既有选择 watcher 使用同一真实状态；排序模式或失效目标不改变选择。菜单的“查看统计”“浏览”仍携带冻结的长按牌组 ID；查询使用全名及子牌组范围，别名只用于显示。`DeckScope.ts` 转义引号、反斜杠与 Anki 通配符。浏览的 `initialSearch` 直接消费该范围，同步等待保留目标；统计的 `deckId/deckName` 在任何 await 前初始化选择，禁止复用全库快照，牌组列表加载后按 ID 校准索引，用户切换不被迟到列表覆盖，目标缺失不静默扩大到全库。原全库入口及返回刷新保持。回归：`home-deck-menu.test.mjs`、`deck-tone-selection.test.mjs`、`stats-entry-runtime.test.mjs`；真实手机/平板主题、滚动与返回观感仍需设备验收。
- 首页常驻同步按钮由 `HomeSummaryHeader` 展示，空闲账号/Core 状态由 `HomeSyncStatusController` 读取；未登录或需要全量同步显示感叹号，普通待同步显示圆点，实际任务进度/冲突优先。登录、同步和方向确认沿用原入口，JIDE 读取相同实时标记与名称；责任、竞态和验证见[同步按钮状态](sync-data.md#同步任务与页面可用性)。
- JIDE 的 `open_deck_details` / `open_deck_options` 复用首页选择和原选项功能；详情宽窄布局、选择记忆与表单手动保存沿用原责任链。清栈动作保护下层新增/编辑输入，已有选项表单或首页尚无目标快照时拒绝切换；共同规则、动态认知与回归见[自动页面操作](agent.md#自动页面操作)。
- 首页“更多”和“新建牌组”共用 [ActionMenuList](../../entry/src/main/ets/components/common/ActionMenuList.ets) 的平面条目渲染和当前列表选择校验，正文放入首页根层的公共无尖角 `AnchoredMenu`，复用 `MenuSurface` 的表面与动效；分隔线由列表提供，尺寸、图文间距和 `menu_icon_fill` 默认浅填色由 `AnchoredMenuItem` 提供。两处宿主的 `menuEntries` 只映射完整文案与图标，`menuIcon` 分别位于 `components/home/主页更多面板.ets` 和 `components/主页操作面板.ets`；条目、顺序、显隐和业务回调仍来自既有入口。浏览、速览复用 `ic_home_browser`、`ic_study_guide`；其余 `ic_home_*.svg` 沿用 24×24、2.5 单位描边、圆角端点及转角的简笔风格，新建牌组图形延续学习页卡片叠层并加号。`base/media` 描边为 `#000000`，同名 `dark/media` 只将描边改为 `#E7ECF3`，保持几何一致。回归 `ui-shell-action-menu-list.test.mjs` 覆盖中英文文案、全部显隐组合、图标资源、原回调及禁用/移除后的迟到点击；实际主题、宽窄屏与大字体布局仍需设备验收。
- 外部 APKG 先确认选项再导入；CSV 映射、结果、取消和中断恢复见[数据导入](import-data.md)。

首页“更多”和“新建牌组”的窗口锚点由 `HomeSummaryHeader` 发布；首页菜单宿主 Stack 通过 `homeMenuHostChanged` 测量自身原点，`homeMenuAnchor` 在该边界减去宿主 X/Y，再把局部坐标传入 `AnchoredMenu`。桌面标题栏、导航容器偏移不能再计入菜单内部 margin；原点移动时收起旧菜单。右侧预览沿用 `HomeDeckDetails.menuAnchor` 的相同边界换算。按钮到菜单的最终间距仍由 `页面内容顶部间距` 贡献一次，安全区由公共菜单裁定。`home-header-layout.test.mjs` 执行真实锚点发布、首页转换和两个菜单传参，覆盖原点为零、标题栏/导航偏移、普通/紧凑密度及有/无安全区；JIDE 共用的菜单声明和 `anchored_no_arrow` 位置语义仍适用。Node 回归不能替代设备外观验收。

2026-10-06 本项验证：新回归在旧菜单传参下捕捉到标题栏导致的 36vp 重复偏移；修正后首页几何、菜单装配、详情动作、JIDE 共同声明/观察、ArkTS 字段和文档共 104 项定向检查通过。`npm run build:app -- -SkipRust -ArtifactDirectory D:\Projects\jidecards-home-menu-fix-2026-10-06` 增量签名 HAP 通过，新增警告为 0。未安装设备，桌面/平板最终外观尚未设备验收。

## 牌组长按与 AnkiDroid 的对齐范围（2026-10-12）

对照本机 `D:/Projects/AnkiDroid/AnkiDroid/src/main/java/com/ichi2/anki/dialogs/DeckPickerContextMenu.kt` 与 `contextmenu/DeckPickerMenuContentProvider.kt`；这是该源码快照的比较，不声明覆盖所有 AnkiDroid 版本或整应用功能。长按已改为牌组名标题的居中列表弹窗，视觉外壳沿用本应用公共组件，保留本应用已有条目。

| AnkiDroid 长按操作 | jidecards 当前情况 |
| --- | --- |
| 浏览、改名、删除 | 已有长按入口，继续调用原领域流程 |
| 自定义学习 | 仅普通牌组显示，筛选牌组隐藏，与 AnkiDroid 的牌组类型限制一致；简洁模式仍按原规则隐藏 |
| 重建、清空筛选牌组 | 筛选牌组已有长按入口，共用 `FilteredDeckCommands` |
| 添加卡片、新建子牌组、牌组选项、导出牌组 | 已有其他 UI 入口，但长按菜单未提供。添加在详情操作栏，后三项在详情更多；筛选牌组的选项编辑范围也与 AnkiDroid 不同 |
| 取消埋藏 | 学习完成页已有按牌组恢复与调度器入口，长按菜单尚无按埋藏状态显示的入口 |
| 创建牌组桌面快捷方式、编辑牌组说明 | 未找到对应的原生 UI 操作；本机别名/背景定制不等于 Core 说明编辑 |
| 安排牌组学习提醒 | 有全局本机提醒页，未绑定牌组；AnkiDroid 的入口受新提醒功能开关控制，不等价于全局提醒 |

本应用长按另保留统计、色调、拖动排序、本机定制和隐藏。上述差异未在本次弹窗迁移中补齐，因此不能报告功能完整对齐。入口声明为 `AppInterface.deckRowMenuItems`，分发为 `首页.handleDeckMenuAction`；回归 `home-deck-menu.test.mjs`、`deck-tone-selection.test.mjs`、`ui-dialog-layout.test.mjs`、`ai-agent-app-structure.test.mjs`。Node 逻辑/接线与 HAP 编译分别验证，深浅色、手机/平板、大字体及真实触控仍须单独设备验收。

## 牌组真实改名与本机显示名称

长按牌组 → “牌组改名”，或牌组详情 → 更多 → “牌组改名”，进入 `components/home/DeckRenameFeature.ets`。输入从 Core 当前层名称初始化，只改这一层；移动父级仍用层级入口。`model/DeckRename.ts` 生成包含全部子牌组的完整路径预览，校验空名、层级分隔符、名称冲突和 NFC；`DeckHierarchyCommands.executeRename` 与移动/排序共用串行队列，冻结输入、提交前重读检查，再调用一次 Core `RenameDeck`（service 7 / method 18）。Core 同一事务更新后代路径并提供撤销/重做，牌组 ID、卡片归属和学习记录保持。成功请求同步并刷新首页；过期计划需要重载预览再确认，保存中阻止返回和重复提交，已接受写入不随面板销毁取消。

历史 `displayName` 继续作为按牌组 ID 存储的本机别名保留。旧定制入口明确命名“本机显示名称 / 背景”，留空删除别名并恢复 Core 名称；真实改名面板提示已有别名仍会显示。别名保存失败向表单传播，不误报成功。Core 新名称进入集合导出与同步，别名不参与。`AppInterface` 共用菜单、名称和说明；面板发布实际草稿、别名、影响数量与忙碌/确认状态，详情同时提供 `core_name` 和 `local_display_name`。JIDE 的实际提案与确认入口见[牌组层级操作](agent.md#牌组层级操作)。

弹窗复用 DialogFrame / DialogHeader / FormInputStyle，外壳独占外缘内边距、正文间隔与滚动限高；业务内容只加文字和路径预览。直接回归 `home-deck-rename.test.mjs`、`home-deck-features.test.mjs` 和 `ai-agent-v2-runtime.test.mjs`；真实 Core 回归 `native/rsharmony/tests/deck_rename.rs` 覆盖后代路径、稳定 ID、卡片/笔记/复习记录、一次撤销和重做、Unicode 与大小写改名。设备宽窄屏、大字体、主题、返回操作以及真实联网同步和模型规划须另做验收。

2026-10-05 验证：上述定向 Node 回归及受影响的层级/排序、首页装配、JIDE 认知、资源和架构检查通过；`cargo test -p jidecards_core --features anki-core --locked --test deck_rename` 与同目标 Clippy（`-D warnings`）通过。ARM64 原生构建后，`npm run build:app -- -Architecture arm64 -SkipRust` 增量签名 HAP 通过，新增警告为 0；本次未安装设备，未验收真实联网同步。

## 牌组样式与顶级分栏

外观中的四种牌组样式由 `DeckListAppearance` / `DeckListAppearanceStore` 定义与持久化，详情见[牌组布局](appearance.md)。双列以整棵顶级子树为一个 ListItem，顶级牌组及全部已展开子牌组在同一列；`HomeDeckGroupSource` 仅派生展示快照，原牌组数据源继续拥有顺序与展开结果。拖动排序临时恢复单列，退出后恢复所选样式，避免把分组索引交给原单牌组排序回调。列表行、计数显隐与两行名称通过唯一 `deckItem` Builder 接线；单/双列同密度等高，所有牌组名称最多两行，窄版仅在名称需要两行且有描述时缩小字号。

首页向 JIDE 发布实际 `deck_list_style`、`deck_list_grouping=top_level_subtree`、当前列数和计数显隐；读取/确认修改共用设置入口。单列宽溢出建议单列窄，单列窄溢出建议双列窄，两级共用原弹窗但分别记录回复。回归入口：`deck-width-layout.test.mjs`、`home-deck-width-layout-suggestion.test.mjs`；设备需验收完整顶级分栏、跨多层展开、长名称、排序切换及两级提示。

## 牌组展开记忆与手机详情

创建父牌组与移动父牌组共用[公共目录树](appearance.md#公共目录树)，支持完整路径搜索和独立展开；候选限制、路径预览和最终提交仍归原功能。创建弹层用 DialogFrame 管理正文限高，选择父目录不写入。自定义学习的标签同样展示层级树，逐标签循环不限、包含、排除，不级联子标签，不改变 Core 筛选语义。首页学习导航保留自己的样式、计数、双列和排序。

牌组详情 → 更多 → 调整牌组层级由 `components/home/DeckReparentFeature.ets` 拥有目标选择、完整路径预览、加载/失败/保存状态；顶级目标为 ID 0。候选排除自身、后代和筛选牌组，确认前不写入。弹窗复用 DialogFrame / DialogHeader / DirectorySelect → DirectoryTree：外壳独占内边距、正文间隔及滚动限高，表单行独占标签与选择框间距，业务层不再加外缘 padding；宽窄屏使用同一限宽自适应外壳。系统返回、遮罩和取消共用保存守卫，离页不取消已接受写入，迟到读取不回写。

手动与 JIDE 共用 `model/DeckReparent.ts` 和 `backend/DeckHierarchyCommands.ets`：按真实 ID 合并父子重叠选择、保留全部后代的前后路径，拒绝循环、筛选父级和不区分大小写的名称冲突；提交前重读并校验子树与目标路径。Core `ReparentDecks`（17）在单一事务中移动子树并提供撤销，ID、卡片归属和学习记录由 Core 保留；本机别名沿用原行为。写入使用独立 AutoSyncScheduler 操作占用，提交后排队同步；首页刷新并展开新祖先路径。刷新失败与写入失败分开处理，成功后的表单不可重复提交。

长按菜单选择“拖动排序”进入排序模式，长按后上下拖动只调整同一个父牌组下的排列，顶级牌组之间也可互相拖动。排序模式点击行不打开菜单；层级调整沿用牌组详情 → 更多 → 调整牌组层级。原 List/LazyForEach `onMove` 保留自动滚动。`DeckRowMenuGesture` 在普通模式绑定菜单长按，排序时通过 `gestureModifier` 清除子行识别器；子行 `parallelGesture` 即使回调不响应，也会抢走祖先 ListItem 的拖动长按，不能靠回调守卫禁用手势。菜单显示期间点击行也不进入详情，避免长按松手同时触发导航。`主页牌组列表.flatDeckRows` 共用单列行渲染，普通/排序使用独立条件分支：`onMove` 在 LazyForEach 创建时注册，仅在同一个单列分支内修改回调表达式不会重新注册。排序时关闭下拉刷新，保存时禁用 List；`moveDeck` 按当前模式/忙碌状态拦截迟到回调。回调松手后冻结真实源/目标 ID 和路径，拖到另一个同级牌组的展开后代时，以该同级祖先为落点；整棵子树即时重排，源牌组的后代与其他父级不作为移动目标。

`model/DeckReorder.ts` 独占同级顺序规则、完整排列确认快照、同级落点及子树显示重排。首页平铺与 JIDE 从同一个 `orderDeckChildren` 应用偏好，隐藏牌组和新增子牌组不会丢失。`DeckHierarchyCommands.executeDrop` 强制校验同级与路径，偏好读取后重读完整顺序确认未过期，只保存原 `deck_order_root` / `deck_order_<parentId>`，不调用 Core 写入或请求同步；层级写入继续使用独立的 `execute`。保存期间禁用拖动和完成/退出/返回；已接受写入离页继续，迟到结果不更新页面。首页仅发布 `deck_reorder` 的实际行序和可用状态。直接回归 `home-deck-order.test.mjs` 覆盖顶级/嵌套排序、展开后代落点、跨父级拒绝、零 Core 写入、失败及离页；设备需另验收宽窄/主题/大字体、长列表边缘滚动和落点动画。

`AppInterface` 共同声明详情菜单与 `deck_move` 控件，功能组件发布真实候选、选择、忙碌与确认可用状态；JIDE 写入由原提案/确认链处理，见[牌组层级操作](agent.md#牌组层级操作)。回归：`home-deck-reparent.test.mjs`、`ai-agent-v2-runtime.test.mjs`、`native/rsharmony/tests/deck_reparent.rs`。Node 不模拟 ArkUI，HAP 编译也不代替设备宽窄屏、字体、返回与真实模型验收。

主页排序教学由中英文资源 `deck_reorder_instructions` 和 `AppInterface` 的 `deck_reorder.instructionsKey` 登记，说明同级/顶级拖动、本机保存范围及牌组详情的层级调整入口；已删除升级/降级的界面声明、动态观察和资源。`get_app_structure` 返回当前语言的 `surfaces.instructions`，实际行序和忙碌状态仍由首页发布；认知存放与读取责任见[软件界面认知](agent.md#软件界面认知)。

2026-10-05 移除排序层级菜单的验证：排序、详情层级调整、JIDE 目录/教学、首页装配、资源、架构与组件约束的定向回归共102项通过。ARM64 原生与增量签名 HAP 构建通过，新增警告0，产物保存在 `.local/deck-sort-fix/artifact/entry-default-signed.hap`。额外的 `ai-agent-v2-runtime` 在测试模块加载时因 `DeckListAppearanceStore` 测试替身未导出 `saveDeckListStyle` 失败；该测试边界不属于本次排序修改，未改占位实现。未安装设备，实际长按拖动与边缘滚动仍需设备验收。

2026-10-06 拖动回归修复：历史版本中菜单长按从排序时禁用改为 `parallelGesture` 后，子行仍参与长按竞争；已改为 `DeckRowMenuGesture` 动态清除排序模式的菜单识别器，同时修正单列模式切换时的 `onMove` 注册。定向排序、布局、首页装配、公共控件、ArkTS 和架构回归通过；增量签名 HAP 构建通过，警告门禁 unexpected=0。手机模拟器实际验证子牌组移动、保存和重新进入；另一台宽屏模拟器 `127.0.0.1:5557` 独立验证顶级牌组连续双向拖动、退出、重启后顺序保留、再次进入排序和普通选牌，保留 UI 布局证据，避免与使用第一台模拟器的编辑器检查互相干扰。最终包及记录位于 `D:\Projects\jidecards-reorder-fix-2026-10-06\final\`。平板当前为 release/app_gallery，覆盖安装被拒为 `9568322`（应用来源不受信任），安装后身份保持不变，不能称为真机已更新或验收通过。

首页首行由 [HomeSummaryHeader](../../entry/src/main/ets/components/home/HomeSummaryHeader.ets) 组合卡片上方的一排纯图标动作和下方占满可用宽度的统计分页。更多独居左上角，JIDE、搜索、浏览、同步、＋新建依次向右上角对齐，最右端为新建；中间以伸缩留白分开左右两组，手机和平板详情分栏共用同一排列。六个入口共用 IconActionButton 的表面、圆角、主题色、尺寸与按压反馈，无可见文字，保留本地化无障碍名称。HomeHeaderLayout 根据实测宽度计算右侧五个按钮的四处间距、组宽及与更多之间的留白。按钮复用公共返回、更多的44vp正方形占位、图标最大18vp，宽窗口增加中间留白而不拉宽按钮；窄窗口共同收缩间距、按钮和图标，始终单排。顶部按钮和两处公共菜单弹窗直接复用统计卡的18vp卡片圆角；其他圆形 IconActionButton 保留原半径规则。统计卡保留168vp高度和八页共用的圆点留白、24vp标题区、居中正文及柱图基线，正文小于260vp时使用紧凑排版。关闭统计时动作行保持原位置和尺寸；排序模式隐藏动作行。同步与浏览直接从首页进入，同步状态与详情入口在同步按钮上。

首页安全区域由 EntryAbility 读取 TYPE_SYSTEM、TYPE_CUTOUT、TYPE_NAVIGATION_INDICATOR，取矩形实际边缘并集并转为 vp；监听规避区和窗口大小变化。首页与返回、更多顶栏共用应用尺寸.pageToolbarTop 的顶部基准和12vp水平外缘，按钮下方到统计卡共用页面内容顶部间距（常规12vp、紧凑8vp）。所有页面顶栏与其菜单锚点读取相同的真实安全上缘：普通系统栏保留原光学校准，摄像头挖孔超过系统栏时从安全边缘加分组间距起算，横屏同时避让侧边挖孔。HomeSummaryHeader 发布按钮行下方的实测窗口上缘、左缘和内容宽度；首页根层用公共 AnchoredMenu 分别向左/右对齐更多和新建菜单，无尖角。菜单宽度不超过列表面板可用宽度，横向只贡献一次安全区与页面间距。公共组件独占表面、全窗口外部点击关闭层及按安全高度限制的 Scroll，菜单正文只渲染 ActionMenuList，不嵌套滚动。原有其他宿主保留公共默认圆角和居中限宽方式。DialogFrame 将搜索和表单弹窗居中于实际安全矩形，并按安全高度限制正文滚动；遮罩保留覆盖整个窗口。几何回归覆盖无安全区、非零起点挖孔、窄/宽窗口与小高度；按用户要求本次不读取模拟器画面，设备外观由用户直接查看。

窄版今日进度卡省去与下方指标重复的完成/待学说明，给标题、进度条和数值留出空间；数值只在过长时自适应字号，指标标签最多两行，不整体缩小正文。

HomeSummaryHeader 不再区分手机双侧与详情分栏外缘布局，也不创建握姿传感器、去抖计时器或触摸监听；学习页的智感握姿设置与会话仍由学习领域拥有。换尺寸、安全区、外部点击、返回、进入导航页或后台时关闭菜单。同步进度或注意标记附在同步图标上，同步按钮打开正在运行任务的详情或原同步流程。

2026-10-06 首页按钮占位与公共返回/更多统一：相关布局、界面认知、边界和白板回归通过；现有 ceshi 配置的增量签名构建成功，警告门禁 unexpected=0。已在 `7JDUN26418G04789` 通过 `install -r` 覆盖安装并重启，安装前后均为 debug / none，appIdentifier 保持 `6917611264192499746`，未卸载或清数据。产物与构建记录保存在 `.local/home-toolbar-unified-ceshi-2026-10-06/`，安装、包信息和启动日志为 `.local/home-toolbar-unified-tablet-*.log`。本次未读取设备画面，实际外观由用户直接验收。

[HomeDeckSearchDialog](../../entry/src/main/ets/components/home/HomeDeckSearchDialog.ets) 复用 DialogFrame/DialogHeader：固定输入框、清除、可滚动结果、关闭及加载/失败重试。输入名称、完整路径或本机别名即时筛选全量牌组，折叠子牌组可检索，隐藏子树排除；选择时重查当前候选并调用原选择入口（会展开祖先路径）。搜索过程不更改首页列表折叠或集合数据。AppInterface 共同声明六个动作和 home_search，首页发布卡片上方、单排、统计显隐与完整控制状态，不再发布主页握姿能力；搜索发布当前查询、候选总数和加载状态。回归：home-header-layout、ui-shell-contract、ai-agent-entry-contract、sync-automatic；Node 与 HAP 不证明真机触摸、字体或最终布局已经验收。

首页保留 NavPathStack、选择/快照、刷新与跨功能占用协调。`pages/navigation/HomeDestinations.ets` 只渲染目的地并映射路由参数，导航时机和返回刷新仍由首页负责；`utils/HomeNavigationTransition.ets` 拥有转场代次、淡入与背景冻结顺序，通过宿主回调更新首页透明度。新增页面或调整转场请进入对应模块。

`components/home/HomeDeckDetails.ets` 统一手机详情和宽屏侧栏，复用 `牌组详情面板`；首页 `deckDetails(compact)` 只接一次动作回调和历史刷新 token。详情继续继承首页的 Provide/Consume，不复制选择或快照。`components/home/HomeDeckDeletion.ets` 拥有原生确认、删除服务调用、媒体二次确认和忙碌状态；通过 `onDeleted` 交回首页协调选择、刷新及同步，通过状态回调参与首页占用。已确认写入继续完成，媒体清理提示仍检查前台可见性。

宽屏卡片上方的制卡、JIDE、预览使用与左栏六个按钮相同的 `IconActionButton`：公共圆角矩形底色、边框、主题色 SVG、按压反馈和完整本地化朗读名称。制卡复用 `ic_study_edit`，JIDE 复用 `ic_study_agent`，预览使用公共 `ic_common_preview` 明暗 SVG，经既有 `ActionIcon` 渲染。按钮与图标尺寸沿用左栏提供的高度和缩放，操作区与卡片上缘保持对齐。宽屏外层 Row 将制卡和可选 JIDE 放在左侧工具组，用 Blank 将预览推至右缘；两端按钮分别贴齐卡片左右外缘，JIDE 紧邻制卡，隐藏时不挤动两端。手机将三个图标直接放在顶栏右侧。预览在公共按钮入口按忙碌状态禁用，范围弹窗由实测工具栏定位。AppInterface 的 `header_actions_style` 在两种布局均发布 `icons`，`header_actions_position` 发布宽屏 `above_card` / `hidden`、手机 `toolbar_right`；`header_actions_layout` 发布宽屏 `add_note:left,agent:after_add_note,preview:right` 或手机右侧工具组的真实显隐位置，名称与业务入口仍共用原声明。回归入口为 `ui-shell-deck-actions.test.mjs`、`deck-preview-session.test.mjs`，覆盖直接入口、原回调、禁用、返回与认知状态。

2026-10-06 宽屏对齐修正将右侧动作从详情卡内部移到滚动卡片上方。布局检查执行首页真实的高度提供方法与两侧间距表达式，覆盖窄/宽内容、统计显隐和排序模式；预览菜单、详情观察、边界及相关回归通过。最终增量 ceshi 签名构建成功，警告门禁 unexpected=0；已向 `7JDUN26418G04789` 覆盖安装成功，安装前后 debug / none 和 appIdentifier 保持一致。停止旧进程成功，随后启动因设备锁屏返回 `10106102`，未自动解锁或查看画面；实际外观由用户解锁后验收。产物和构建记录在 `.local/home-split-header-ceshi-2026-10-06/`，安装、包信息及启动记录在 `.local/home-split-header-tablet-*.log`。

首页 `homeLayout` 的左栏底部与 `牌组详情面板` 的开始学习操作区共用 `应用尺寸.操作区底部间距(narrow, navigationBottomInset)`，两者读取同一 `导航条高度`。左栏由父 Column 的 bottom padding 限制列表视口，列表与 Refresh 不另加底部偏移；右栏由按钮 Row 的 bottom padding 避让，详情外层不另加底部间距。双栏底部基准一致，因此列表视口下边缘与开始学习按钮下边缘对齐；无导航条时宽/窄密度为12/8vp，有导航条时各加一次安全区高度。加载、空态和错误态沿用同一列表视口；手机首页列表也沿用该安全区公式。静态核对不代替设备宽窄屏及导航条有/无时的最终外缘验收。

边界回归：`home-composition` 执行真实目的地映射及详情回调，`home-deletion-runtime` 执行真实删除入口与事务收尾，`iridescent-rendering` 执行真实转场实现。移除的首页主题切换、带搜索浏览入口及取消隐藏弹窗均已无调用；现用入口仍分别由设置/浏览模块负责。

`model/HomeDeckExpansion.ts` 负责展开集合与已知 ID 的协调及持久化格式，`utils/HomeDeckExpansionStore.ets` 是本机 `homeDeckExpansion` 偏好的唯一读写入口。首页在启动加载前同步恢复，通过展开集合的 Watch 保存单击、递归切换、显式选择祖先路径和导入后的变化；刷新先更新已知 ID 再触发保存。首次安装默认展开父牌组，已有牌组保留折叠，新 ID 默认展开，删除 ID 在成功刷新时清理。宽屏自动恢复上次选择不展开祖先，避免覆盖折叠记忆。存储快照在调用时冻结，flush 串行且不随页面销毁取消，失败记录日志；读取失败不回写覆盖原偏好。

手机详情仍挂在首页 Stack 内以继承 Provide。`homeLayout` 在 `xs && 显示牌组详情` 时使用 `Visibility.Hidden`，保留列表位置和断点测量，同时禁止底层列表绘制与点击。幻彩页面表面透明，不能仅靠详情背景遮住首页，否则操作区间隙和底部安全区会透出牌组行。宽屏恢复双栏，主题背景继续由根 `ThemeBackground` 提供；预览覆盖页和导航页保留各自已有的生命周期。这里不改变间距：卡片与按钮间距仅由操作区 top padding 贡献，底部由 `操作区底部间距(narrow, navigationBottomInset)` 贡献。

回归入口：`tools/tests/home-deck-expansion.test.mjs`，覆盖重启、全部折叠、新增/删除、连续保存、失败重试、页面接线及手机/宽屏显隐。实际设备仍需检查幻彩/普通主题、宽窄密度、导航条有无、横竖屏、返回列表位置与冷启动恢复；Node 测试不模拟 ArkUI 布局。

`HomeDataRepository.load()` 只读取牌组树、本机展示偏好及隐藏列表；首页完成选择校验后即可放行学习。`loadStatistics()` 单独读取图表，经 `StatsWidgetPublisher` 聚合并 await 桌面卡片保存/推送（与统计页、FSRS 共用），由首页 `statisticsQueue` 持有，不能再串回同步完成/学习入口的等待链。必要牌组刷新仍由 `refreshQueue` 串行；每次实际加载递增代次，统计队列跳过旧代次、已离页或等待导航的任务，已接受的推送完整结束后才执行下一项。返回首页会重新读取统计，迟到结果不覆盖新快照或学习期间的界面。回归：`home-data-repository`、`home-sync-refresh-runtime`；后者覆盖慢推送、导航抢先、销毁和过期代次。

## 页面操作边界扩展点

牌组详情页“更多”中的入口、设置面板标题与相关帮助统一称“牌组设置”（英文 `Deck settings`）。UI 和 JIDE 的界面目录共同读取 `deck_options_title`，资源键、内部类型及工具 ID 保留原名；改名同时维护本地化说明和 JIDE 的领域描述。父牌组选择列表的“父牌组选项”表示候选列表，不属于这个设置入口。

123 云盘远程公告暂不启用，唯一开关在 `model/官方公告配置.ts`，首页检查、调度、展示和 `backend/官方公告服务.ets` 网络边界共用 `OFFICIAL_ANNOUNCEMENTS_ENABLED`。关闭时跳过远程流程，不创建 HTTP 请求或公告定时器，也不消费已读 ID；本地启动引导和幻彩提醒继续。首页向 `AppInterface` 发布 `official_announcements_enabled`，JIDE 通过 `get_app_structure` 读取实际停用状态。暂停状态的直接回归见 `page-operation-boundaries`、`official-announcement-flow-contract`，JIDE 读取回归在 `ai-agent-app-structure`，恢复启用后的协调流程仍由原行为测试覆盖。

首页 `homeActivity()` 只映射占用；`HomeWorkCoordinator` 拥有合并唤醒、外部导入串行消费与任务优先级（外部文件 → 待执行导航 → 手动同步 → 公告 → 引导），每次效果后重查占用。新增集合任务/弹层在映射处登记，释放时触发 `homeActivityChanged`；State 用 Watch，普通字段收尾显式唤醒。`HomeStartupSequence` 拥有云端引导/入门的待展示和读取中状态；销毁禁止迟到展示，已接受导入仍完成并释放队列。公告网络结果经 `HomeAnnouncementController` 暂存，首页安全空闲时再展示，导航/后台不丢待展示项。`CloudDeckFeature` 拥有目录、选择、进度、重试、配额落盘和退出确认；`CloudDeckImportController` 编排串行下载/导入。首页只持有显示目标、忙碌及配额摘要，接收刷新与关闭通知，配额写入完成才释放忙碌。

浏览页所有数据写入经 `runBrowserOperation`，批量选择写入再经 `runBatchOperation`；`BrowserOperationController` 固定模式/ID/视图代次/选择代次，完成仅清理原选择。新增命令先复制额外输入（如映射/日期），不可在 await 后重新读取可变 UI 参数。离页 dispose 只禁止回写 UI，已接受写入保持 `AutoSyncScheduler` 的独立操作占用直至完成，再广播刷新/同步；不得把该占用当作学习完成页。搜索和分页按查询代次失效，分页游标记录消费 ID 数而非成功行数，编辑/映射/卡片信息有独立读取代次。回归入口 `page-operation-boundaries.test.mjs`。


## 首页入门与删除媒体

`HomeStartupSequence.resume` 返回实际推进标记：当前阶段已在读取、展示槽位被占用、没有待执行阶段或已销毁时返回 `false`。首页只在返回 `true` 时再次唤醒协调器；禁止把读取中的立即返回接成无条件 `homeActivityChanged`，否则零延迟任务会反复调度并阻塞首屏刷新与 IO。原任务结束及真实占用变化仍由原完成/生命周期入口唤醒。慢云端、入门和赠送偏好读取的组合回归在 `page-operation-boundaries`，推进标记在 `home-work-coordinator`。

`HomeSummaryHeader` 在 `onAreaChange` 提供正宽度之前只保留空白占位；宽度就绪后展示统计与按钮，避免图标被算成零尺寸且按钮溢出零宽容器。初始化宽度不代表隐藏统计设置。

`HomeStartupSequence.gift` 在公告、云端引导（如启用）和入门确认之后展示幻彩赠送提醒；同一首页展示槽位阻止与同步、导入或其他弹窗叠加，后台/离页会延迟结果，销毁后失效。`utils/IridescentGiftStore.ets` 先等待权益验签恢复，已获得幻彩或已确认提醒的用户跳过；沿用原始键 `iridescent_gift_notice_299_completed`，文案中的应用版本更新不得轮换该键。只在确认/返回时保存，失败提示并恢复缓存，下次启动重试。`IridescentGiftPanel` 与主题锁定入口共用复制动作。回归：`home-work-coordinator`、`theme-iridescent-gift`，后者同时检查中英提醒版本与 `AppScope/app.json5` 一致及原始已读记录跨版本继续抑制展示。

宽版牌组溢出建议由 `主页牌组列表.onOverflowChange` 报告实际视口是否容得下可见行，经 `HomeWorkCoordinator.presentLayoutSuggestion` 在空闲首页展示；排在现有启动提示之后。确认直接复用宽窄偏好保存入口，处理记录持久化避免反复打扰，见[界面文档](appearance.md)。列表只负责几何事实，不持有弹窗或写设置。

`HomeIntroPanel` 复用首页启动弹层序列，在公告处理后展示（直链渠道暂停时跳过云端牌组流程）；`HomeIntroStore` 用独立内容修订键，只有确认才写入，旧欢迎版本不抑制新介绍。首页“更多 → 速览”可重看。新用户说明明确默认配置即可开始，不要求先探索复杂设置。内容覆盖闪卡用途、牌组获取渠道（QQ群、Anki 共享牌组、AI 或人工制卡）、外部 Agent 制卡/改卡、APKG 导入复习以及 3.0.0 前老用户进群领取幻彩兑换码；沿用现有签名兑换，不自动授予权益。

入门分组的普通正文由 `HomeIntroPanel.paragraph` 的 `@Builder` 渲染，`HomeIntroSection.content` 只委托该方法。2026-10-08 平板启动崩溃记录定位到内联回调里的 `Text(body).fontSize(...)`：目标编译器未将其转换为 `Text.create/fontSize`，运行时抛出 `Cannot read property fontSize of undefined`。不能靠捕获异常、标记已读或跳过入门掩盖问题。`home-intro.test.mjs` 保留内容与启动接线检查，`arkts-component-fields.test.mjs` 扫描实际 BuilderParam 名称，拒绝常见内联声明式组件链；这些静态检查仍不能代替编译产物和真实首屏验收。

启动检查的误区：模拟器能打开首页不代表首次安装安全，已有 `home_intro_completed_v1` 会直接跳过入门渲染；确认前重启、首次安装和旧版本升级都要覆盖未读路径，不能通过清除用户数据制造测试条件。HAP 编译通过也不证明 BuilderParam 内的声明式组件已正确转换，须核对并执行真实编译产物；崩溃堆栈里的 `HomeIntroPanel.ts:279` 是生成代码位置，不能直接当成 `.ets` 源码行号。此故障在旧 debug 生成代码中同样存在，不应仅归因于 release、签名或 CPU 架构。回归使用真实 `HomeStartupSequence` 与 `HomeIntroStore` 验证只有持久化确认才抑制展示，使用 [编译产物检查](../../tools/check-home-intro-compiled.mjs) 验证首次渲染，环境与边界见 [验证说明](verification.md#启动渲染编译产物检查)。

删除牌组期间显示忙碌遮罩，自动同步与其他首页操作等待。`DeckMediaCleanup` 比较删除前后 Core 媒体检查的 unused 差集，仅提示此次新增未引用文件；用户单独确认后再次检查，仍 unused 的确认文件才移入媒体回收站，绝不清空全局回收站。媒体同步活动或检查失败时保留媒体，牌组删除成功不回滚、不误报为删除失败。共享引用、原有闲置媒体和筛选牌组归还的卡片受检查保护。行为测试在 `deck-media-cleanup` 与 `home-deletion-runtime`。

牌组色条候选为蓝、紫、绿、黄、红五色和取消色条；绿色/黄色继续使用现有 mint/amber 存储键，历史黑色仍正确显示但不再提供为新候选。色条子菜单仅以当前主题色文字标明选中项（幻彩沿用主题文字渐变），不显示勾号。定制入口显示“本机显示名称 / 背景”，真实改名使用独立入口；隐藏操作使用正常正文色。

速览由 `DialogFrame` 统一处理窗口安全区、固定操作栏和限高滚动；六个内容区共用文件内 `HomeIntroSection` 的浅底卡片、左对齐标题及正文样式，四个牌组来源分别成段。外壳贡献16vp内边距，内容区贡献12vp内边距与区间间距；正文无额外水平边距，宽窄屏及有无安全区均由公共外壳计算可用范围。速览中的官方QQ群号在获取渠道与幻彩说明内均可点击复制，Anki共享牌组链接调用系统浏览器；点击链接使用独立蓝色资源以免随幻彩文字变色。`iridescent_preview.png` 为用户提供的当前首页截图（1320×2856），速览、启动福利提醒和外观锁定说明通过 `IridescentThemePreview` 共用此资源、260vp限宽及原始比例；速览图注居中位于图下。交互和最终视觉仍需在设备上验证；覆盖安装保留用户数据。


## APKG 系统打开入口

`module.json5` 注册 `FileOpen`、默认打开类别及 APKG 的 UTD/MIME；`resources/rawfile/arkdata/utd/utd.json5` 将 `.apkg` 和专用 MIME 映射到自定义 UTD。为兼容聊天应用按二进制或 ZIP 容器传出文件的情况，声明同时包含 `ExternalDeckOpen.EXTERNAL_DECK_OPEN_SUPPORT.fallbackTypes`；这些类型只增加候选匹配，接收时仍要求 `.apkg` 文件名，无后缀 URI 仅接受 APKG 专用类型。不能注册 `*/*`、`general.file` 或 `general.object`；二进制/ZIP 兜底可能使应用也出现在其他二进制/ZIP 文件的候选中，这类文件不进入导入队列。

EntryAbility 的冷/热启动都通过 `ExternalDeckOpen` 校验原始文件 URI 并排队，AppStorage 只广播修订号。首页空闲且集合就绪后，系统入口与文件选择器共用 `importDeckUri`，通过 `importUri(uri, true)` 展示导入选项；用户确认后直接读取授权 URI，不再弹选择器。学习、编辑、弹层和同步占用期间保留请求；待处理时启动提示与自动同步让路。只接收 APKG，不允许 COLPKG 整库替换。同 URI 在排队、确认和导入期间去重，关闭或完成后允许主动重新打开。

`get_app_structure.externalDeckOpen` 与接收校验共用能力声明，标明确认、文件选择器及整库替换边界。`tools/tests/external-deck-open.test.mjs` 核对真实 manifest、UTD 和共享声明，并直接验证文件识别、占用与队列；这些回归不模拟 QQ/微信的真实候选查询。真机验收需覆盖原生 QQ、微信、系统文件管理的 `.apkg` 候选及读取授权，分别检查冷/热启动、确认/关闭和占用后继续；本次未连接手机，不将声明/构建通过记作上述端到端通过。系统规则参考 [OpenHarmony 文件处理应用接入](https://github.com/openharmony/docs/blob/master/zh-cn/application-dev/application-models/file-processing-apps-startup.md)与[隐式 Want 匹配](https://github.com/openharmony/docs/blob/master/zh-cn/application-dev/application-models/explicit-implicit-want-mappings.md)。

## 数据与牌组修改入口

- 首页右上角“新建牌组”菜单的顺序由 `AppInterface.ts` 统一定义：普通牌组、导入、可用下载渠道、创建筛选牌组，UI 与 JIDE 共用。“创建筛选牌组”始终位于可见菜单末尾且仅实验版显示（简洁模式为 false），按搜索条件取卡，不隐式绑定当前牌组；长按菜单中的学习入口保留接收当前牌组 ID 的“自定义学习”。`EntryAbility.onCreate` 在发布 Ability 上下文后、创建首屏前调用 `简洁模式存储.initializeSimpleMode`，同步恢复已保存模式到 AppStorage，实验版冷启动不再依赖先打开设置。新用户默认简洁版，读取失败保留已知模式；启动只读取偏好。创建入口由 `components/主页操作面板.ets` 回调至首页，不再经牌组列表逐层转发；回归见 `home-simple-mode.test.mjs` 与 `create-deck-contract.test.mjs`。
- `components/home/自定义学习对话框.ets` 保留单页：六种方式列表下只显示当前方式的说明与输入，状态/标签方式额外显示四种卡片范围和包含/排除标签。整个表单按内容占高、顶部对齐，仅空间不足时收缩滚动，不用纵向 `layoutWeight(1)` 撑满弹窗。
- `components/home/创建过滤牌组面板.ets` 的排序标签与选择框在同一行：标签占剩余宽度，选择框靠右，宽度与长名称省略复用 `SelectStyle.fieldWidth/fieldConstraint`，两者间距为 12vp；排序值、选项及忙碌禁用仍由原表单持有。
- 文案与设置含义对照本地 AnkiDroid `dialogs/customstudy/CustomStudyDialog.kt`、`values-zh-rCN/03-dialogs.xml` 及锁定 Core 的 `custom-study.ftl`：额度默认值用 Core 的 `extendNew/extendReview`，子牌组可用数分列显示；预览是过去 N 天添加的新卡，不重新排程。天数与抽取张数由 `backend/CustomStudyPreferences.ets` 记在本机，读取失败可重试，保存偏好失败不能诱导重复创建。
- `model/CustomStudyOptions.ts` 负责整数校验与默认值；`SchedulerMessages.ts` 的 Cram oneof 7 保留原始标签数组与 Core 枚举，筛选/排序/排程仍由 Core 决定。包含任一标签、排除任一标签、无标签限制均沿用 Core 语义。回归入口 `custom-study-options.test.mjs`、`custom-study-dialog.test.mjs`；设备验收覆盖正常/大字号、键盘、六种方式切换、负增量与状态/标签选择。
- “提升今日新卡片上限”增加的是额度，不保证首页新卡数增加。锁定 Core 在 `decks/limits.rs`、`decks/tree.rs` 中保留复习上限对新卡的限制；`scheduler/filtered/custom_study.rs` 成功表示额度已写入。仅每日新卡上限为 0 或当天新卡额度用尽时，仍可通过正增量取得新卡；没有可用新卡，或待复习卡占满复习额度时，成功后新卡可保持 0。排查须同时读取表单“可用新卡”、当天/牌组/父牌组额度、待复习数和“新卡忽略复习上限”，不能根据首页的 0 判定功能失效。`native/rsharmony/tests/custom_study.rs` 用隔离集合验证树计数和实际学习队列，覆盖零上限、真实答题后额度耗尽、复习额度限制、预先启用忽略复习上限和无新卡；运行 `cargo test -p jidecards_core --features anki-core --test custom_study --locked`。此回归不证明反馈视频已复现，视频对应卡库和设备交互仍需核对；本次不更改产品调度或成功提示。
- `backend/HomeDataRepository.ets` 组装牌组树、用户覆盖、隐藏集合、图表及桌面卡片快照；统计范围和暂停分离口径来自持久化偏好。图表失败降级，桌面卡片保存失败不阻塞牌组列表。
- `model/HomeRefreshQueue.ts` 串行刷新；销毁后不再启动排队读取。`HomeDeckExpansion.ts` 合并展开状态，保留主动折叠，只自动展开新父牌组。
- `model/HomeSyncPolicy.ts` 从首页事实判定丢弃、暂停、等待或启动同步；手动请求越过尚未展示的启动工作，仍等待真实占用。
- `model/HomeSyncController.ts` 拥有同步检查定时器、最后一次待执行导航、同步后刷新和待展示 FSRS 提醒。首页通过 `homeSyncHost()` 提供事实与 UI 效果；集合预留先于面板挂载，导航仅等待同步集合占用/刷新，普通首页占用只阻止同步启动。销毁和取消定时器使旧回调失效。
- `model/HomeBackupController.ts` 拥有自动备份延迟任务和配置读取期间的占用；`homeBackupHost()` 与后端工厂隔离 Kit。后台/销毁取消尚未接受的任务，已开始的备份继续由 `BackupCoordinator` 持锁至结束；Core 决定归档间隔和保留数量。读取配置失败进入日志回调，不产生未处理 Promise 拒绝。
- `backend/HomeDeckCommands.ets` 创建并记住牌组、写入别名与背景；`CreateDeckFeature.ets` 和 `DeckCustomizationFeature.ets` 分别拥有表单忙碌态、校验错误及已接受写入的收尾，页面只装配弹层、刷新和提示。背景失败单独反馈，已落盘别名保留；刷新失败不会把已成功写入重新标成可重试写入。
- `components/home/DeckOptionsFeature.ets` 持有表单和校验错误，`model/DeckOptionsDraft.ets` 从表单构造有效草稿；`model/home/DeckOptionsSession.ts` 拥有读取代次、原配置、暂存预设和提交状态，经 `backend/AnkiDeckOptions.ets` 调用服务。`DeckOptionsPresets.ts` 暂存选择、新建、克隆、重命名和删除，取消不写入；`DeckConfigSave.ts` 复制配置并冻结请求。默认只编辑当前牌组：修改默认预设或共享预设中的选项并保存时，自动创建以当前牌组命名的独立预设；已有独立预设则复用，无变更或仅改牌组/今日覆盖、全局设置不新增预设。完整模式可在“修改范围”中选择“共用此预设的牌组”以修改共享预设，每次打开恢复“仅此牌组”；简洁模式沿用单牌组默认。`AppInterface` 共用作用范围入口，并发布真实 `save_scope` 与 `preset_use_count` 给 JIDE。多预设保存将当前配置放在最后，保留未编辑字段和未知协议数据。首页通过 `pushDeckOptionsPage` 进入独立 `pages/DeckOptionsPage.ets`，只持有占用事实，返回后刷新。页面参数由 `PageParams.DeckOptionsPageParams` 声明，`AppNavigation.APP_PAGE_ROUTES` 与 JIDE 共用目的地。失败保留草稿，成功不可重复提交，离页后的已接受写入仍广播 FSRS/首页刷新。
- `components/牌组选项面板.ets` 的 `commonOptions` 展示简洁版四项：每日新卡上限、每日复习上限、学习步幅与复习排序；简洁模式继续隐藏复杂配置。`experimentalOptions` 展示预设管理和 `高级牌组选项面板` 的完整内联选项，分组和调度器条件由 `DeckOptionsCatalog.ts` 统一声明：每日上限、新卡、遗忘、显示顺序、FSRS、埋藏、音频、计时器、自动前进、轻松日、高级。完整模式不叠加简洁区或另开高级导航弹层；设置页固定返回/帮助/保存顶栏，牌组名单独显示，完整模式仅在预设卡片保留“修改范围”选择，简洁模式显示一行“修改范围：仅此牌组”；保存隔离的技术细节只在帮助中说明，页面不重复铺陈。影响全库的开关及自定义调度由共同标签明确标注“所有牌组”；FSRS 重排按所选范围生效，不作全库标注。预设选择、作用范围及保存方式保留在前，重命名、新建、克隆、删除由“管理预设”展开。各分组复用 `设置分组卡片`；卡片外间距由页面密度统一提供（普通12vp/紧凑8vp），卡片内边距16vp，字段行自身提供48vp最小热区及分隔线。布尔项复用 `SettingsToggleRow` 直接切换草稿，字段帮助沿页面的同一帮助入口打开；数值/枚举单项编辑器支持 Core 默认值、确认和取消。`DeckOptionsFeature` 在会话回调中通过 `DeckOptionsDefaults.ts` 将 Core 默认配置转换成键/文字数组，两个展示组件只接收此普通值；完整配置及 `other` / `preserved` 字节留在原会话和表单的保存流程。`@Prop` 对非支持内置类型的深拷贝会丢失内部类型，默认值渲染不能再创建完整协议草稿。模式只控制界面，同一表单、配置与保存入口继续共用，不另建模式专用预设。退出由 `DeckOptionsFeature.requestClose` 统一守卫：有效保存内容的指纹由 `DeckOptionsDraft.deckOptionsDraftFingerprint` 比较，未改动或恢复原值直接返回，有改动/无效草稿先确认放弃。返回先关闭帮助或放弃确认，继续编辑保留全部草稿；保存中禁止退出，计算中沿原会话允许离开。行为回归见 `deck-options-page.test.mjs`、`deck-options-parity.test.mjs`、`deck-option-dialog.test.mjs`；主题、宽窄屏、大字体和 ArkUI 状态更新仍需设备验收。
- `model/home/DataTransferSession.ts` 是首页与设置页共用的数据迁移入口，拥有弹层、选择器占用、整库替换二次确认、进度和错误。页面只观察一个状态快照；`components/home/DataTransferFeature.ets` 绑定面板与会话，`backend/AnkiDataTransfer.ets` 适配选择器、导入/替换及 `DataExportWorkflow`。系统入口直接调用 `importUri`，选择器结果在离页后不得启动新写入，已接受写入仍完成并广播，提交后刷新失败不可诱导重复导入。
- 同步的挂载状态、认证和账号由首页传入 `components/同步面板.ets`；面板通过 `backend/AnkiSyncSession.ets` 创建 `model/SyncSession.ts`，只展示快照并传递冲突选择/详情显隐。会话拥有集合 RPC、媒体终态轮询和销毁收尾，调度与占用仍分别由 `AutoSyncScheduler`、`SyncActivity` 管理。创建牌组和定制弹层的局部状态由各自 Feature 持有，首页只保留显示目标和跨功能占用事实。
- 控制器直接行为测试：`home-sync-controller.test.mjs`、`home-backup-controller.test.mjs`；既有页面集成测试继续覆盖同步、学习、公告和弹层的组合时序。
- 扩展这些功能时沿上述现用调用链修改；历史 Phase 2/3 的独立 store 方案未接入，已移除，不作为待补实现或新功能入口。
- 回归入口：`home-data-repository`、`home-work-coordinator`、`page-domain-models`、`page-repositories`、`deck-config-save`、`deck-options-session`、`home-transfer-session`、`cloud-deck-feature`；平台模块测试注入底层服务，不复制生产编排。

首页的 `build()` 仅排列布局、菜单、功能弹层与提示层；布局仍依赖页面快照，留在同文件 Builder。功能新增状态应进入对应 Feature/Session，不把拆出的表单状态重新挂回首页。已删除两个仅转发参数的旧协调器，设置页也使用同一数据迁移入口。


公告的并发检查、最近检查时间、延迟任务和取消代次统一归 `HomeAnnouncementController`；首页只传是否允许展示、网络读取、展示效果。暂停后的迟到 timer 不得清除新 timer，销毁后不再调度。直接回归：`home-announcement-scheduling.test.mjs`。

首页占用事实和检查入口直接读取 `announcementController.isChecking()`，不经组件 getter；目标 ArkUI 编译曾遗漏该 getter，使公告请求期间的启动等待条件失效。`sync-automatic.test.mjs` 用真实未完成请求验证自动同步等待及请求完成后的恢复；普通逻辑测试不替代组件编译兼容性验收。

牌组直链渠道通过 `model/ReleaseFeatures.ets` 的 `CLOUD_DECK_CHANNEL_ENABLED` 暂时关闭：开屏跳过云端引导，首页菜单隐藏获取直链牌组，打开方法也检查同一开关。保留下载实现、历史配额与用户内容；恢复时统一调整该开关。

下拉刷新圈由 `主页牌组列表.refreshDecks()` 持有，等待首页 `onRefresh` 返回的 Promise 后在 finally 收起，不依赖父级布尔 Prop 的 Watch。同步占用时立即跳过、加载失败、上下文缺失均须完成收尾；首页的刷新占用另由回调 finally 释放。回归见 `home-pull-refresh.test.mjs`，设备仍需验收连续下拉与同步期间下拉。


筛选牌组的排序方式和自定义学习的卡片范围使用 FormSelectRow；牌组背景选择/替换放到标题右侧，保留预览删除按钮及撤销移除入口。说明、限宽和省略策略归公共选择/辅助行，牌组、自定义学习与定制会话仍持有选值及保存状态。

2026-10-07 完整模式闪退验收：模拟器 19:51 的记录在默认配置字节 `.slice()` 报 `The O is not a TypedArray`；20:06 的记录证明改成索引复制后，读取 `.length` 仍缺少 TypedArray 内部槽。原因是两个 `@Prop defaults: DeckConfigSettings` 边界的深拷贝已损坏字节类型，修复点必须前移到会话→显示值转换。最终移除该复制尝试，原协议/草稿复制入口恢复；默认值转换只产生键和字符串，禁止访问 `other` / `preserved`。原未知字段保留与保存重试检查继续执行，回归还覆盖所有默认值类型、实际组件读取、两层普通值复制和宿主传参。选项专项72项及结构/公共组件/认知/文档74项通过，日志 `.local/deck-options-default-boundary-tests.log` / `.local/deck-options-default-boundary-contracts.log`；签名增量HAP成功，新增警告0。仅覆盖安装 `127.0.0.1:5555`，20:15–20:23用模拟器内部 `uitest` 点击验证完整模式打开、每日上限编辑后恢复默认20并确认、保存退出、再次打开、滚动到高级/轻松日及返回；进程保持运行，最新崩溃记录仍为20:06。截图 `.local/deck-options-full-open.png` / `.local/deck-options-full-bottom.png`。该验证没有激活或切换Windows窗口；筛选入口、模式显隐和集合卡片保持。横屏、大字体、SM-2/FSRS全部设备组合未扩大发布声明。

## 集合历史入口

首页与浏览菜单的入口及弹窗标题统一显示“回退”，共用 `collection_history_title` 资源与 `AppInterface` 声明，JIDE 从同一资源读取名称；弹窗内继续提供“撤销”和“重做”两个操作。“回退”是已确认的入口名称，帮助文案整理不得顺带改名。帮助中的浏览操作恢复路径为“更多 → 回退”，学习页仍可直接使用“更多 → 撤销操作”。

首页与浏览菜单共用 components/CollectionHistoryDialog.ets，业务状态归 CollectionHistorySession。读写纳入 AutoSyncScheduler 操作占用并等待集合释放；关闭后读取不再发布，已接受写入继续广播刷新。应用扩展 service 1003 在 registry mutex 内比较完整 UndoStatus 与预览状态后调用 Core Undo／Redo，不改上游服务编号；1001 已属于牌组预览，不能复用。刷新失败与已提交操作分开，历史按钮须先重读。首页刷新牌组与选择，浏览清理选择和详情并重读搜索、牌组、标签及旗标名称。JIDE 共同目录与实时观察使用 collection_history，不增加 Agent 写入权限。

回归：`collection-history-backend.test.mjs` 自动发现原生应用服务号冲突，并直接执行前端历史适配器验证原生编号和状态编码；原生 `collection_history::tests::registry_preview_and_deleted_deck_undo_redo_preserve_cards_and_notes` 经生产 registry 同时覆盖牌组预览、级联删除、撤销恢复笔记/牌组/卡片身份、重做及 Core 创建的历史 COLPKG 备份恢复，无媒体备份保留既有媒体。历史服务或路由改动必须重建原生库再打包，不能仅以 `-SkipRust` 更新界面；真实设备的既有删除是否可恢复另行核验。

误用 1001 时，历史状态仍可经标准 service 3/method 7 读取，但执行请求会被牌组预览拒绝为 `Invalid deck preview request`，历史状态不变；重复刷新不修复路由。上述原生回归同时验证这条失败路径。旧界面把执行错误归入读取错误，因而“操作历史可能已变化或读取失败”不能作为历史确实变化的证据。

错误区分历史读取失败、原生返回 `collection_history_changed`、撤销/重做执行失败与已提交后的刷新失败，显示实际错误详情；失败状态和详情由同一会话发布给 JIDE。执行失败清除旧状态，重读前不允许再次提交；已完成操作的刷新失败不提示重新执行。回归见 `collection-history-session.test.mjs` 与 `maintenance-ui-cognition.test.mjs`。
