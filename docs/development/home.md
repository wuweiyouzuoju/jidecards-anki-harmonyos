# 首页任务与外部入口

[返回任务索引](../../PROJECT_CONTEXT.md)

- 代码路径以下均相对 `entry/src/main/ets/`。
- 责任链：首页映射 UI → HomeWorkCoordinator / HomeStartupSequence / HomeSyncPolicy 决策 → HomeDataRepository / 既有 Service。
- 首页新建牌组菜单不再提供 AI 制卡/改卡。统计卡旁的独立 JIDE 图标通过 `onAgent` → `openAgent` 打开空白对话入口，配置预检和开发者开关保持在既有责任入口；按需目标选择、改卡搜索与确认见[应用内 Agent](agent.md#统一-ai-对话入口)。
- 平板等直接展示的牌组详情顶部先显示制卡、JIDE、预览的同一行等宽44vp操作，三项共用15fp字号、居中单行文字及对称4vp内部留白，相邻点击区间距沿用常规12vp/紧凑8vp且无额外margin；下方牌组名称独占整行并自然换行；手机详情将三个入口收进右上角“更多”，复用公共的无箭头 `AnchoredMenu` 和 `AnchoredMenuItem`，菜单宽度、分隔线、表面、动效和外部关闭层均由公共组件提供，靠右定位于工具栏下方；选择动作前、外部点击、系统返回、退出详情、换牌组或切换布局时关闭菜单。点击预览后显示 `DeckPreviewScopeMenu` 的四种范围，菜单尺寸与牌组长按 Popup 一致；手机保留父菜单中的“预览”行，范围子弹窗锚定该行向左展开；父菜单保留挂载，只有预览范围使用带箭头的 `bindPopup`，选择范围或退出时统一关闭两层菜单。宽屏锚定预览按钮。系统返回先关闭菜单，再退出详情。取卡读取独立集合快照，范围与数据边界见 [只读预览](study-media.md#卡片只读预览)。入口名称为 JIDE，仍进入标题为“JIDE 制卡”的页面。`HomeDeckDetails.onCreateWithAI` 转发到首页既有 `打开AI制卡`，使用当前牌组参数并保留同步等待、配置预检和开发者入口开关；验证见 `ui-shell-deck-actions.test.mjs`、`deck-preview-session.test.mjs`，长标签与长名称的设备观感单独验收。
- 快速反馈：`npm test -- home`；完整验收见 [验证说明](verification.md)。
- JIDE 的 `open_deck_details` / `open_deck_options` 复用首页选择和原选项功能；详情宽窄布局、选择记忆与表单手动保存沿用原责任链。清栈动作保护下层新增/编辑输入，已有选项表单或首页尚无目标快照时拒绝切换；共同规则、动态认知与回归见[自动页面操作](agent.md#自动页面操作)。
- 首页“更多”和“新建牌组”共用 [ActionMenuList](../../entry/src/main/ets/components/common/ActionMenuList.ets) 的平面条目渲染和当前列表选择校验，正文放入 `HomeSummaryHeader` 的原生带箭头 `bindPopup`，复用 `MenuSurface` 的箭头尺寸与动效；分隔线由列表提供，尺寸、图文间距和 `menu_icon_fill` 默认浅填色由 `AnchoredMenuItem` 提供。两处宿主的 `menuEntries` 只映射完整文案与图标，`menuIcon` 分别位于 `components/home/主页更多面板.ets` 和 `components/主页操作面板.ets`；条目、顺序、显隐和业务回调仍来自既有入口。浏览、速览复用 `ic_home_browser`、`ic_study_guide`；其余 `ic_home_*.svg` 沿用 24×24、2.5 单位描边、圆角端点及转角的简笔风格，新建牌组图形延续学习页卡片叠层并加号。`base/media` 描边为 `#000000`，同名 `dark/media` 只将描边改为 `#E7ECF3`，保持几何一致。回归 `ui-shell-action-menu-list.test.mjs` 覆盖中英文文案、全部显隐组合、图标资源、原回调及禁用/移除后的迟到点击；实际主题、宽窄屏与大字体布局仍需设备验收。
- 外部 APKG 先确认选项再导入；CSV 映射、结果、取消和中断恢复见[数据导入](import-data.md)。

## 牌组真实改名与本机显示名称

长按牌组 → “牌组改名”，或牌组详情 → 更多 → “牌组改名”，进入 `components/home/DeckRenameFeature.ets`。输入从 Core 当前层名称初始化，只改这一层；移动父级仍用层级入口。`model/DeckRename.ts` 生成包含全部子牌组的完整路径预览，校验空名、层级分隔符、名称冲突和 NFC；`DeckHierarchyCommands.executeRename` 与移动/排序共用串行队列，冻结输入、提交前重读检查，再调用一次 Core `RenameDeck`（service 7 / method 18）。Core 同一事务更新后代路径并提供撤销/重做，牌组 ID、卡片归属和学习记录保持。成功请求同步并刷新首页；过期计划需要重载预览再确认，保存中阻止返回和重复提交，已接受写入不随面板销毁取消。

历史 `displayName` 继续作为按牌组 ID 存储的本机别名保留。旧定制入口明确命名“本机显示名称 / 背景”，留空删除别名并恢复 Core 名称；真实改名面板提示已有别名仍会显示。别名保存失败向表单传播，不误报成功。Core 新名称进入集合导出与同步，别名不参与。`AppInterface` 共用菜单、名称和说明；面板发布实际草稿、别名、影响数量与忙碌/确认状态，详情同时提供 `core_name` 和 `local_display_name`。JIDE 的实际提案与确认入口见[牌组层级操作](agent.md#牌组层级操作)。

弹窗复用 DialogFrame / DialogHeader / FormInputStyle，外壳独占外缘内边距、正文间隔与滚动限高；业务内容只加文字和路径预览。直接回归 `home-deck-rename.test.mjs`、`home-deck-features.test.mjs` 和 `ai-agent-v2-runtime.test.mjs`；真实 Core 回归 `native/rsharmony/tests/deck_rename.rs` 覆盖后代路径、稳定 ID、卡片/笔记/复习记录、一次撤销和重做、Unicode 与大小写改名。设备宽窄屏、大字体、主题、返回操作以及真实联网同步和模型规划须另做验收。

2026-10-05 验证：上述定向 Node 回归及受影响的层级/排序、首页装配、JIDE 认知、资源和架构检查通过；`cargo test -p jidecards_core --features anki-core --locked --test deck_rename` 与同目标 Clippy（`-D warnings`）通过。ARM64 原生构建后，`npm run build:app -- -Architecture arm64 -SkipRust` 增量签名 HAP 通过，新增警告为 0；本次未安装设备，未验收真实联网同步。

## 牌组样式与顶级分栏

外观中的四种牌组样式由 `DeckListAppearance` / `DeckListAppearanceStore` 定义与持久化，详情见[牌组布局](appearance.md)。双列以整棵顶级子树为一个 ListItem，顶级牌组及全部已展开子牌组在同一列；`HomeDeckGroupSource` 仅派生展示快照，原牌组数据源继续拥有顺序与展开结果。拖动排序临时恢复单列，退出后恢复所选样式，避免把分组索引交给原单牌组排序回调。列表行、计数显隐与两行名称通过唯一 `deckItem` Builder 接线。

首页向 JIDE 发布实际 `deck_list_style`、`deck_list_grouping=top_level_subtree`、当前列数和计数显隐；读取/确认修改共用设置入口。单列宽溢出建议单列窄，单列窄溢出建议双列窄，两级共用原弹窗但分别记录回复。回归入口：`deck-width-layout.test.mjs`、`home-deck-width-layout-suggestion.test.mjs`；设备需验收完整顶级分栏、跨多层展开、长名称、排序切换及两级提示。

## 牌组展开记忆与手机详情

牌组详情 → 更多 → 调整牌组层级由 `components/home/DeckReparentFeature.ets` 拥有目标选择、完整路径预览、加载/失败/保存状态；顶级目标为 ID 0。候选排除自身、后代和筛选牌组，确认前不写入。弹窗复用 DialogFrame / DialogHeader / FormSelectRow：外壳独占内边距、正文间隔及滚动限高，表单行独占标签与选择框间距，业务层不再加外缘 padding；宽窄屏使用同一限宽自适应外壳。系统返回、遮罩和取消共用保存守卫，离页不取消已接受写入，迟到读取不回写。

手动与 JIDE 共用 `model/DeckReparent.ts` 和 `backend/DeckHierarchyCommands.ets`：按真实 ID 合并父子重叠选择、保留全部后代的前后路径，拒绝循环、筛选父级和不区分大小写的名称冲突；提交前重读并校验子树与目标路径。Core `ReparentDecks`（17）在单一事务中移动子树并提供撤销，ID、卡片归属和学习记录由 Core 保留；本机别名沿用原行为。写入使用独立 AutoSyncScheduler 操作占用，提交后排队同步；首页刷新并展开新祖先路径。刷新失败与写入失败分开处理，成功后的表单不可重复提交。

长按菜单选择“拖动排序”进入排序模式，长按后上下拖动只调整同一个父牌组下的排列，顶级牌组之间也可互相拖动。排序模式点击行不打开菜单；层级调整沿用牌组详情 → 更多 → 调整牌组层级。原 List/LazyForEach `onMove` 保留自动滚动，行内菜单长按改为并行手势，排序时不响应菜单动作，不再以极大 duration 占用识别器。回调松手后冻结真实源/目标 ID 和路径，拖到另一个同级牌组的展开后代时，以该同级祖先为落点；整棵子树即时重排，源牌组的后代与其他父级不作为移动目标。

`model/DeckReorder.ts` 独占同级顺序规则、完整排列确认快照、同级落点及子树显示重排。首页平铺与 JIDE 从同一个 `orderDeckChildren` 应用偏好，隐藏牌组和新增子牌组不会丢失。`DeckHierarchyCommands.executeDrop` 强制校验同级与路径，偏好读取后重读完整顺序确认未过期，只保存原 `deck_order_root` / `deck_order_<parentId>`，不调用 Core 写入或请求同步；层级写入继续使用独立的 `execute`。保存期间禁用拖动和完成/退出/返回；已接受写入离页继续，迟到结果不更新页面。首页仅发布 `deck_reorder` 的实际行序和可用状态。直接回归 `home-deck-order.test.mjs` 覆盖顶级/嵌套排序、展开后代落点、跨父级拒绝、零 Core 写入、失败及离页；设备需另验收宽窄/主题/大字体、长列表边缘滚动和落点动画。

`AppInterface` 共同声明详情菜单与 `deck_move` 控件，功能组件发布真实候选、选择、忙碌与确认可用状态；JIDE 写入由原提案/确认链处理，见[牌组层级操作](agent.md#牌组层级操作)。回归：`home-deck-reparent.test.mjs`、`ai-agent-v2-runtime.test.mjs`、`native/rsharmony/tests/deck_reparent.rs`。Node 不模拟 ArkUI，HAP 编译也不代替设备宽窄屏、字体、返回与真实模型验收。

主页排序教学由中英文资源 `deck_reorder_instructions` 和 `AppInterface` 的 `deck_reorder.instructionsKey` 登记，说明同级/顶级拖动、本机保存范围及牌组详情的层级调整入口；已删除升级/降级的界面声明、动态观察和资源。`get_app_structure` 返回当前语言的 `surfaces.instructions`，实际行序和忙碌状态仍由首页发布；认知存放与读取责任见[软件界面认知](agent.md#软件界面认知)。

2026-10-05 移除排序层级菜单的验证：排序、详情层级调整、JIDE 目录/教学、首页装配、资源、架构与组件约束的定向回归共102项通过。ARM64 原生与增量签名 HAP 构建通过，新增警告0，产物保存在 `.local/deck-sort-fix/artifact/entry-default-signed.hap`。额外的 `ai-agent-v2-runtime` 在测试模块加载时因 `DeckListAppearanceStore` 测试替身未导出 `saveDeckListStyle` 失败；该测试边界不属于本次排序修改，未改占位实现。未安装设备，实际长按拖动与边缘滚动仍需设备验收。

首页首行由 [HomeSummaryHeader](../../entry/src/main/ets/components/home/HomeSummaryHeader.ets) 组合卡片上方的一排纯图标动作和下方占满可用宽度的统计分页。六个入口从左到右为更多、JIDE、搜索、浏览、同步、＋新建，首行两端固定更多与新建；手机和平板详情分栏共用同一排列。六个入口共用 IconActionButton 的表面、圆角、主题色、尺寸与按压反馈，无可见文字，保留本地化无障碍名称。HomeHeaderLayout 根据实测宽度同时计算五处间距、六个等宽点击区和图标短边尺寸，始终单排、不切换换行布局；按钮高度在44–56vp内调整。统计卡保留168vp高度和八页共用的圆点留白、24vp标题区、居中正文及柱图基线，正文小于260vp时使用紧凑排版。关闭统计时动作行保持原位置和尺寸；排序模式隐藏动作行。同步与浏览直接从首页进入，同步状态与详情入口在同步按钮上。

首页安全区域由 EntryAbility 读取 TYPE_SYSTEM、TYPE_CUTOUT、TYPE_NAVIGATION_INDICATOR，取矩形实际边缘并集并转为 vp；监听规避区和窗口大小变化。首页顶部是实际安全上缘加页面分组间距，横屏同时避让侧边挖孔。更多和新建原生小弹窗分别使用 BottomLeft/BottomRight，位于首行两端按钮下方，尖角朝上指向对应按钮。正文可用高度从按钮下缘开始，计入宿主间距、箭头高度、导航区和系统气泡内边距，长菜单内部滚动。公共 AnchoredMenu 共用同一安全布局模型。DialogFrame 将搜索和表单弹窗居中于实际安全矩形，并按安全高度限制正文滚动；遮罩保留覆盖整个窗口。几何回归覆盖无安全区、非零起点挖孔、窄/宽窗口与小高度；按用户要求本次不读取模拟器画面，设备外观由用户直接查看。

窄版今日进度卡省去与下方指标重复的完成/待学说明，给标题、进度条和数值留出空间；数值只在过长时自适应字号，指标标签最多两行，不整体缩小正文。

HomeSummaryHeader 不再区分手机双侧与详情分栏外缘布局，也不创建握姿传感器、去抖计时器或触摸监听；学习页的智感握姿设置与会话仍由学习领域拥有。换尺寸、安全区、外部点击、返回、进入导航页或后台时关闭菜单。同步进度或注意标记附在同步图标上，同步按钮打开正在运行任务的详情或原同步流程。

[HomeDeckSearchDialog](../../entry/src/main/ets/components/home/HomeDeckSearchDialog.ets) 复用 DialogFrame/DialogHeader：固定输入框、清除、可滚动结果、关闭及加载/失败重试。输入名称、完整路径或本机别名即时筛选全量牌组，折叠子牌组可检索，隐藏子树排除；选择时重查当前候选并调用原选择入口（会展开祖先路径）。搜索过程不更改首页列表折叠或集合数据。AppInterface 共同声明六个动作和 home_search，首页发布卡片上方、单排、统计显隐与完整控制状态，不再发布主页握姿能力；搜索发布当前查询、候选总数和加载状态。回归：home-header-layout、ui-shell-contract、ai-agent-entry-contract、sync-automatic；Node 与 HAP 不证明真机触摸、字体或最终布局已经验收。

首页保留 NavPathStack、选择/快照、刷新与跨功能占用协调。`pages/navigation/HomeDestinations.ets` 只渲染目的地并映射路由参数，导航时机和返回刷新仍由首页负责；`utils/HomeNavigationTransition.ets` 拥有转场代次、淡入与背景冻结顺序，通过宿主回调更新首页透明度。新增页面或调整转场请进入对应模块。

`components/home/HomeDeckDetails.ets` 统一手机详情和宽屏侧栏，复用 `牌组详情面板`；首页 `deckDetails(compact)` 只接一次动作回调和历史刷新 token。详情继续继承首页的 Provide/Consume，不复制选择或快照。`components/home/HomeDeckDeletion.ets` 拥有原生确认、删除服务调用、媒体二次确认和忙碌状态；通过 `onDeleted` 交回首页协调选择、刷新及同步，通过状态回调参与首页占用。已确认写入继续完成，媒体清理提示仍检查前台可见性。

首页 `homeLayout` 的左栏底部与 `牌组详情面板` 的开始学习操作区共用 `应用尺寸.操作区底部间距(narrow, navigationBottomInset)`，两者读取同一 `导航条高度`。左栏由父 Column 的 bottom padding 限制列表视口，列表与 Refresh 不另加底部偏移；右栏由按钮 Row 的 bottom padding 避让，详情外层不另加底部间距。双栏底部基准一致，因此列表视口下边缘与开始学习按钮下边缘对齐；无导航条时宽/窄密度为12/8vp，有导航条时各加一次安全区高度。加载、空态和错误态沿用同一列表视口；手机首页列表也沿用该安全区公式。静态核对不代替设备宽窄屏及导航条有/无时的最终外缘验收。

边界回归：`home-composition` 执行真实目的地映射及详情回调，`home-deletion-runtime` 执行真实删除入口与事务收尾，`iridescent-rendering` 执行真实转场实现。移除的首页主题切换、带搜索浏览入口及取消隐藏弹窗均已无调用；现用入口仍分别由设置/浏览模块负责。

`model/HomeDeckExpansion.ts` 负责展开集合与已知 ID 的协调及持久化格式，`utils/HomeDeckExpansionStore.ets` 是本机 `homeDeckExpansion` 偏好的唯一读写入口。首页在启动加载前同步恢复，通过展开集合的 Watch 保存单击、递归切换、显式选择祖先路径和导入后的变化；刷新先更新已知 ID 再触发保存。首次安装默认展开父牌组，已有牌组保留折叠，新 ID 默认展开，删除 ID 在成功刷新时清理。宽屏自动恢复上次选择不展开祖先，避免覆盖折叠记忆。存储快照在调用时冻结，flush 串行且不随页面销毁取消，失败记录日志；读取失败不回写覆盖原偏好。

手机详情仍挂在首页 Stack 内以继承 Provide。`homeLayout` 在 `xs && 显示牌组详情` 时使用 `Visibility.Hidden`，保留列表位置和断点测量，同时禁止底层列表绘制与点击。幻彩页面表面透明，不能仅靠详情背景遮住首页，否则操作区间隙和底部安全区会透出牌组行。宽屏恢复双栏，主题背景继续由根 `ThemeBackground` 提供；预览覆盖页和导航页保留各自已有的生命周期。这里不改变间距：卡片与按钮间距仅由操作区 top padding 贡献，底部由 `操作区底部间距(narrow, navigationBottomInset)` 贡献。

回归入口：`tools/tests/home-deck-expansion.test.mjs`，覆盖重启、全部折叠、新增/删除、连续保存、失败重试、页面接线及手机/宽屏显隐。实际设备仍需检查幻彩/普通主题、宽窄密度、导航条有无、横竖屏、返回列表位置与冷启动恢复；Node 测试不模拟 ArkUI 布局。

`HomeDataRepository.load()` 只读取牌组树、本机展示偏好及隐藏列表；首页完成选择校验后即可放行学习。`loadStatistics()` 单独读取图表，经 `StatsWidgetPublisher` 聚合并 await 桌面卡片保存/推送（与统计页、FSRS 共用），由首页 `statisticsQueue` 持有，不能再串回同步完成/学习入口的等待链。必要牌组刷新仍由 `refreshQueue` 串行；每次实际加载递增代次，统计队列跳过旧代次、已离页或等待导航的任务，已接受的推送完整结束后才执行下一项。返回首页会重新读取统计，迟到结果不覆盖新快照或学习期间的界面。回归：`home-data-repository`、`home-sync-refresh-runtime`；后者覆盖慢推送、导航抢先、销毁和过期代次。

## 页面操作边界扩展点

123 云盘远程公告暂不启用，唯一开关在 `model/官方公告配置.ts`，首页检查、调度、展示和 `backend/官方公告服务.ets` 网络边界共用 `OFFICIAL_ANNOUNCEMENTS_ENABLED`。关闭时跳过远程流程，不创建 HTTP 请求或公告定时器，也不消费已读 ID；本地启动引导和幻彩提醒继续。首页向 `AppInterface` 发布 `official_announcements_enabled`，JIDE 通过 `get_app_structure` 读取实际停用状态。暂停状态的直接回归见 `page-operation-boundaries`、`official-announcement-flow-contract`，JIDE 读取回归在 `ai-agent-app-structure`，恢复启用后的协调流程仍由原行为测试覆盖。

首页 `homeActivity()` 只映射占用；`HomeWorkCoordinator` 拥有合并唤醒、外部导入串行消费与任务优先级（外部文件 → 待执行导航 → 手动同步 → 公告 → 引导），每次效果后重查占用。新增集合任务/弹层在映射处登记，释放时触发 `homeActivityChanged`；State 用 Watch，普通字段收尾显式唤醒。`HomeStartupSequence` 拥有云端引导/入门的待展示和读取中状态；销毁禁止迟到展示，已接受导入仍完成并释放队列。公告网络结果经 `HomeAnnouncementController` 暂存，首页安全空闲时再展示，导航/后台不丢待展示项。`CloudDeckFeature` 拥有目录、选择、进度、重试、配额落盘和退出确认；`CloudDeckImportController` 编排串行下载/导入。首页只持有显示目标、忙碌及配额摘要，接收刷新与关闭通知，配额写入完成才释放忙碌。

浏览页所有数据写入经 `runBrowserOperation`，批量选择写入再经 `runBatchOperation`；`BrowserOperationController` 固定模式/ID/视图代次/选择代次，完成仅清理原选择。新增命令先复制额外输入（如映射/日期），不可在 await 后重新读取可变 UI 参数。离页 dispose 只禁止回写 UI，已接受写入保持 `AutoSyncScheduler` 的独立操作占用直至完成，再广播刷新/同步；不得把该占用当作学习完成页。搜索和分页按查询代次失效，分页游标记录消费 ID 数而非成功行数，编辑/映射/卡片信息有独立读取代次。回归入口 `page-operation-boundaries.test.mjs`。


## 首页入门与删除媒体

`HomeStartupSequence.resume` 返回实际推进标记：当前阶段已在读取、展示槽位被占用、没有待执行阶段或已销毁时返回 `false`。首页只在返回 `true` 时再次唤醒协调器；禁止把读取中的立即返回接成无条件 `homeActivityChanged`，否则零延迟任务会反复调度并阻塞首屏刷新与 IO。原任务结束及真实占用变化仍由原完成/生命周期入口唤醒。慢云端、入门和赠送偏好读取的组合回归在 `page-operation-boundaries`，推进标记在 `home-work-coordinator`。

`HomeSummaryHeader` 在 `onAreaChange` 提供正宽度之前只保留空白占位；宽度就绪后展示统计与按钮，避免图标被算成零尺寸且按钮溢出零宽容器。初始化宽度不代表隐藏统计设置。

`HomeStartupSequence.gift` 在公告、云端引导（如启用）和入门确认之后展示幻彩赠送提醒；同一首页展示槽位阻止与同步、导入或其他弹窗叠加，后台/离页会延迟结果，销毁后失效。`utils/IridescentGiftStore.ets` 先等待权益验签恢复，已获得幻彩或已确认提醒的用户跳过；沿用原始键 `iridescent_gift_notice_299_completed`，文案中的应用版本更新不得轮换该键。只在确认/返回时保存，失败提示并恢复缓存，下次启动重试。`IridescentGiftPanel` 与主题锁定入口共用复制动作。回归：`home-work-coordinator`、`theme-iridescent-gift`，后者同时检查中英提醒版本与 `AppScope/app.json5` 一致及原始已读记录跨版本继续抑制展示。

宽版牌组溢出建议由 `主页牌组列表.onOverflowChange` 报告实际视口是否容得下可见行，经 `HomeWorkCoordinator.presentLayoutSuggestion` 在空闲首页展示；排在现有启动提示之后。确认直接复用宽窄偏好保存入口，处理记录持久化避免反复打扰，见[界面文档](appearance.md)。列表只负责几何事实，不持有弹窗或写设置。

`HomeIntroPanel` 复用首页启动弹层序列，在公告处理后展示（直链渠道暂停时跳过云端牌组流程）；`HomeIntroStore` 用独立内容修订键，只有确认才写入，旧欢迎版本不抑制新介绍。首页“更多 → 速览”可重看。新用户说明明确默认配置即可开始，不要求先探索复杂设置。内容覆盖闪卡用途、牌组获取渠道（QQ群、Anki 共享牌组、AI 或人工制卡）、外部 Agent 制卡/改卡、APKG 导入复习以及 3.0.0 前老用户进群领取幻彩兑换码；沿用现有签名兑换，不自动授予权益。

删除牌组期间显示忙碌遮罩，自动同步与其他首页操作等待。`DeckMediaCleanup` 比较删除前后 Core 媒体检查的 unused 差集，仅提示此次新增未引用文件；用户单独确认后再次检查，仍 unused 的确认文件才移入媒体回收站，绝不清空全局回收站。媒体同步活动或检查失败时保留媒体，牌组删除成功不回滚、不误报为删除失败。共享引用、原有闲置媒体和筛选牌组归还的卡片受检查保护。行为测试在 `deck-media-cleanup` 与 `home-deletion-runtime`。

牌组色条候选为蓝、紫、绿、黄、红五色和取消色条；绿色/黄色继续使用现有 mint/amber 存储键，历史黑色仍正确显示但不再提供为新候选。色条子菜单仅以当前主题色文字标明选中项（幻彩沿用主题文字渐变），不显示勾号。定制入口显示“本机显示名称 / 背景”，真实改名使用独立入口；隐藏操作使用正常正文色。

速览中的官方QQ群号在获取渠道与幻彩说明内均可点击复制，Anki共享牌组链接调用系统浏览器；点击链接使用独立蓝色资源以免随幻彩文字变色。`iridescent_preview.png` 为用户提供的实际主题截图，按原始比例展示于说明下方。布局与交互需在设备上验证；覆盖安装保留用户数据。


## APKG 系统打开入口

`module.json5` 注册 `FileOpen` 与 `com.jide.kapian.apkg`，`resources/rawfile/arkdata/utd/utd.json5` 将 `.apkg` 和专用 MIME 映射到自定义 UTD。EntryAbility 的冷/热启动都通过 `ExternalDeckOpen` 校验原始文件 URI 并排队，AppStorage 只广播修订号。首页空闲且集合就绪后，系统入口与文件选择器共用 `importDeckUri`；不再弹选择器或要求再次确认，显示已有进度/错误面板并刷新牌组。学习、编辑、弹层和同步占用期间保留请求；待处理时启动提示与自动同步让路。只自动导入 APKG，不允许 COLPKG 整库替换。同 URI 在队列和导入期间去重，完成后允许主动重新打开。系统入口扩展与队列验证见 `tools/tests/external-deck-open.test.mjs`。

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
- `components/home/DeckOptionsFeature.ets` 持有表单和校验错误，`model/DeckOptionsDraft.ets` 从表单构造有效草稿；`model/home/DeckOptionsSession.ts` 拥有读取代次、原配置、暂存预设和提交状态，经 `backend/AnkiDeckOptions.ets` 调用服务。`DeckOptionsPresets.ts` 暂存选择、新建、克隆、重命名和删除，取消不写入；`DeckConfigSave.ts` 复制配置并冻结请求。与 Anki 一致，默认编辑共享预设；明确选择克隆或 JIDE 的单牌组范围才分离。多预设保存将当前配置放在最后，保留未编辑字段和未知协议数据。首页只持有打开目标与占用；失败保留草稿，成功不可重复提交，离页后的已接受写入仍广播 FSRS/首页刷新。
- `components/牌组选项面板.ets` 的 `commonOptions` 展示简洁版四项：每日新卡上限、每日复习上限、学习步幅与复习排序；简洁模式继续隐藏复杂配置。`experimentalOptions` 展示预设管理和 `高级牌组选项面板` 的完整内联选项，分组和调度器条件由 `DeckOptionsCatalog.ts` 统一声明：每日上限、新卡、遗忘、显示顺序、FSRS、埋藏、音频、计时器、自动前进、轻松日、高级。完整模式不再叠加简洁区或另开高级导航弹层；分组间距 24vp、字段间距 12vp 由外层 Column 贡献。单项编辑器支持 Core 默认值、确认和取消。模式只控制界面，同一表单、配置与保存入口继续共用，不另建模式专用预设。行为回归见 `deck-options-parity.test.mjs`、`deck-option-dialog.test.mjs`；主题、宽窄屏、大字体和 ArkUI 状态更新仍需设备验收。
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

## 集合历史入口

首页与浏览菜单的入口及弹窗标题统一显示“回退”，共用 `collection_history_title` 资源与 `AppInterface` 声明，JIDE 从同一资源读取名称；弹窗内继续提供“撤销”和“重做”两个操作。

首页与浏览菜单共用 components/CollectionHistoryDialog.ets，业务状态归 CollectionHistorySession。读写纳入 AutoSyncScheduler 操作占用并等待集合释放；关闭后读取不再发布，已接受写入继续广播刷新。应用扩展 service 1003 在 registry mutex 内比较完整 UndoStatus 与预览状态后调用 Core Undo／Redo，不改上游服务编号；1001 已属于牌组预览，不能复用。刷新失败与已提交操作分开，历史按钮须先重读。首页刷新牌组与选择，浏览清理选择和详情并重读搜索、牌组、标签及旗标名称。JIDE 共同目录与实时观察使用 collection_history，不增加 Agent 写入权限。

回归：`collection-history-backend.test.mjs` 自动发现原生应用服务号冲突，并直接执行前端历史适配器验证原生编号和状态编码；原生 `collection_history::tests::registry_preview_and_deleted_deck_undo_redo_preserve_cards_and_notes` 经生产 registry 同时覆盖牌组预览、级联删除、撤销恢复笔记/牌组/卡片身份、重做及 Core 创建的历史 COLPKG 备份恢复，无媒体备份保留既有媒体。历史服务或路由改动必须重建原生库再打包，不能仅以 `-SkipRust` 更新界面；真实设备的既有删除是否可恢复另行核验。

误用 1001 时，历史状态仍可经标准 service 3/method 7 读取，但执行请求会被牌组预览拒绝为 `Invalid deck preview request`，历史状态不变；重复刷新不修复路由。上述原生回归同时验证这条失败路径。旧界面把执行错误归入读取错误，因而“操作历史可能已变化或读取失败”不能作为历史确实变化的证据。

错误区分历史读取失败、原生返回 `collection_history_changed`、撤销/重做执行失败与已提交后的刷新失败，显示实际错误详情；失败状态和详情由同一会话发布给 JIDE。执行失败清除旧状态，重读前不允许再次提交；已完成操作的刷新失败不提示重新执行。回归见 `collection-history-session.test.mjs` 与 `maintenance-ui-cognition.test.mjs`。
