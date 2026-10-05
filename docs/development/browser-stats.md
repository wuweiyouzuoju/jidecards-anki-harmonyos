# 浏览、设置与统计

[返回任务索引](../../PROJECT_CONTEXT.md)

旗标与标星的实现、协议边界及验证记录见 [2026-10-03 对接记录](flags-marking-audit-2026-10-03.md)。

浏览器支持无旗标、七色旗标、已标星及未标星快捷筛选，AND 组合原搜索。星标筛选使用 `tag:re:^marked$`，与 Core 的完整标签判断一致；用户输入的 `tag:marked` 保留 Anki 包含子标签的搜索语义。行快照分别保留星标、旗标颜色和暂停状态，分页沿用同一份标记集合；笔记行显示笔记星标，不把兄弟卡的某一种旗标误表示为整个笔记的旗标。

批量“标星／取消标星”先解析、去重笔记 ID，再读取最新笔记，只增删完整 `marked` 标签并一次提交可撤销的 UpdateNotes，保留字段和 `marked::child`。旗标复用 SetFlag，笔记模式展开全部兄弟卡。菜单中的旗标名称使用 Anki 的 `flagLabels` 配置，仅写入编辑过的颜色，留空删除该键恢复默认，保留其他颜色和未知配置值。写入仍由 BrowserOperationController 等待集合、冻结选择、请求同步和刷新搜索，离页不撤回已接受写入。

统计/笔记界面认知入口见 [软件界面认知](agent.md#软件界面认知)。统计页直接遍历共用分区定义，原图表组件发布范围/空数据/禁用状态；新增页、编辑加载页与编辑表单各自发布实际状态，不触碰查询、草稿或写入会话。新增回归为 `ai-agent-page-awareness.test.mjs`，编辑与统计原生命周期回归仍保留。

- 代码路径以下均相对 `entry/src/main/ets/`。
- 责任链：BrowserOperationController 管理操作快照、写入等待、同步占用及完成；页面负责搜索代次和 UI；统计口径来自 Core。
- 快速反馈：`npm test -- browser / npm test -- ui`；完整验收见 [验证说明](verification.md)。

## 浏览列表

结果卡片通过 `卡片表格.rowBorder()` 复用 `SurfaceBorder` 的完整1vp轮廓；无旗标、标星、暂停和埋藏都不取消边框。有旗标时左侧保留4vp色条，其余三边保持公共中性描边，宽度与颜色分别用 EdgeWidths / EdgeColors 组合。此样式不拥有搜索、选择或分页状态；回归见 `ui-surface-border.test.mjs` 的实际行样式执行。

筛选侧栏的牌组树由 `BrowserSidebar.browserDeckRows` 重建完整路径，保留 Core 的末级显示名称、层级、计数和折叠状态。点击替换搜索与长按追加条件都传 `fullName`，不能使用 `DeckTreeNode.name` 搜索子牌组，否则 `父牌组::子牌组` 会被误搜成顶层 `子牌组`，显示零结果或命中同名牌组。批量改牌组继续按牌组 ID 操作；首页和统计的树展示沿用各自模型。回归见 [browser-sidebar-decks.test.mjs](../../tools/tests/browser-sidebar-decks.test.mjs)，执行真实模型、组件映射与两种点击回调。

### 标签选择与管理

标签交互参考 AnkiDroid 的 `TagsList`、`TagsDialogViewModel` 和 `ManageTagsViewModel`；本地参考源码在 `D:/Projects/AnkiDroid`。层级名称、大小写去重、三态草稿、搜索过滤及批量差量更新由 [NoteTags.ts](../../entry/src/main/ets/model/NoteTags.ts) 负责；实际读写继续使用锁定 Anki Core，不引入第二套标签存储。

新增笔记、已有笔记（包含学习页跳转编辑与图片遮罩类型）、兼容新增面板共用 `NoteTagsField` → `TagPicker` → `TagTreeList`。手输框用空白分隔多个标签；“选择标签”支持忽略大小写的层级搜索，新建单个标签时空白转换为 `::`。新标签及选择只写草稿，取消笔记编辑不会注册标签。Core 子节点的 `name` 只有末级，公共模型重建 `fullName`，搜索、折叠、重命名和删除均使用完整路径；搜索命中保留祖先、临时展开祖先，清空搜索恢复 Core 折叠状态。

浏览器多选“编辑标签”加载所选笔记标签，卡片模式先解析并去重笔记 ID。✓ 表示全部笔记都有，− 表示仅部分笔记有；混合标签可循环为全部有、全部无、恢复混合。未操作的混合标签和虚拟父标签不写入；选父标签不隐式选择子标签。提交在 `BrowserOperationController` 内重新读取最新笔记，只应用冻结的标签变更，全部读取成功后一次 `UpdateNotes(skipUndoEntry=false)`；字段、其他标签及同名前缀子标签保留。失败保留选择与草稿，空选择不写入，离页继续已接受提交，写入后的刷新失败沿用独立错误语义。

筛选侧栏支持标签搜索、节点展开/收起持久化、前缀重命名/删除和确认清除未用标签。成功后保留侧栏与过滤词，刷新 Core 树；移除了只提示匹配数量的“补全”菜单。标签条件通过 Core `SearchNode.tag` 构建，转义引号、反斜杠和通配符；追加使用 AND 分组，保留原搜索 OR 含义。

列表在固定 260vp 可视区使用 `IDataSource` + `LazyForEach`，避免万级标签一次性建节点；无匹配时只显示提示，不保留空列表高度。标签行自身拥有层级缩进（最多六级视觉缩进，完整路径和实际层级保留）、44vp 展开点击区及文本点击区；列表不叠加水平 margin。筛选侧栏的标签内容 Column 独占 16vp 卡片内边距，搜索输入继续用 `FormInputStyle`，因此输入外缘距白色卡片左右各 16vp；外层页面边距和安全区只移动整张卡片，不叠加输入间距。批量弹窗复用 `DialogFrame` 的内边距、限高正文与固定标题，键盘或窄屏下正文可滚动。选取界面的显隐、加载、禁用和错误通过 `AppInterface` 共用声明登记，离开移除观察。

行为回归：[browser-note-tags.test.mjs](../../tools/tests/browser-note-tags.test.mjs)；Core 完整路径/特殊字符搜索、层级管理撤销、折叠与清理由 [note_tags.rs](../../native/rsharmony/tests/note_tags.rs) 验证。没有增加拖拽重挂父标签、标签专用查找替换或筛选全选；这些是独立交互，不能把当前三态编辑当成已完成这些能力。2026-10-03 已运行完整 `npm run verify`、真实 Core 标签测试，以及签名 HAP 覆盖安装；模拟器确认原牌组保留、筛选侧栏、多选标签加载、空态、无改动禁用确认和系统返回保留多选。用户指出侧栏输入贴边后补上内容内边距，图片容器同时改用共用样式。修正后的最终外观、深浅色、宽窄屏、键盘、标签创建/选择/管理由用户在设备上验收，自动测试与构建不代替这部分验收。

浏览结果每条采用独立圆角卡片，左右沿用页面内边距，条目间距沿用设置分组；信息入口、多选、旗标和分页仍在 `卡片表格` 中。表格通过 `IDataSource` + `LazyForEach` 消费行快照，行 key 使用稳定业务字段，避免大列表状态变化时按整数组重建；分页加载态跟随宿主 `Promise` 结束，不使用固定延时。应用所有原生 Select 共用 `utils/SelectStyle.ets` 的高度、字重、16vp 卡片圆角及明暗资源配色，页面独立选择框传入 surface_card（浅色白、深色卡片底），卡片内默认 surface_sidebar；调用方直接声明共享 font、optionFont、selectedOptionFont、borderRadius、height、padding、space，避免 AttributeModifier 差分跳过未变值后残留系统默认外观。按钮、未选菜单项和选中菜单项使用相同字号；字重区分选中态。labelText 只负责单行省略，不重复设置字号、字重或颜色。不能把菜单字体移回 AttributeModifier，否则原生菜单项重建后可能只有访问过的项应用指定字号。每处选择框以固定宽度、百分比或 layoutWeight 预留空间；行内字段选择采用 auto 宽度并限制为行宽 56%，长名称单行省略，切换选项不改变字号；历史范围使用共享宽度，表单默认占行宽一半。配色继续由 modifier 提供，菜单对齐和业务绑定仍属于调用方。统计页 FSRS 状态位于顶栏右侧，历史范围位于牌组选择右侧。牌组长按菜单直接显示满宽颜色选择框；设置模式菜单沿用首页更多的 compactMenuWidth。

`AnchoredMenu` 与 `MenuItem` 由首页更多、新建牌组动作菜单、设置模式及浏览菜单共用，统一圆角、分隔线、居中文字、150ms 动效和主题色选中态。浏览搜索独占一行；下一行左侧为一个外框中的模式、状态、排序三个选值区，右侧显示完整结果数量。点击某个选值区只打开该组的选项，菜单宽度跟随整个选择框，不再套分类折叠或混列其他组；排序“默认”与各列选项同级。筛选分区使用相同菜单展开行，标题与展开内容属于同一张圆角卡片，分区之间沿用 pageSectionGap。折叠偏好和筛选协议不变。回归见 `ui-select-layout.test.mjs`，实际尺寸及点击行为另做设备验收。

笔记模式批量删除/改牌组/标志复用 `笔记服务.获取笔记的卡片` 展开全部兄弟卡并去重；删除后重新查询后端结果，失败保留选择。不要回到空卡片列表调用后本地移除行的做法。回归见 `browser-batch-runtime.test.mjs`。

多选时顶栏中央显示“已选 X 项”，右上角显示“操作”；进入多选不自动打开菜单，点击“操作”手动切换。删除始终位于菜单最底部，退出多选在其上一项，顺序只由 `AppInterface.browser_batch` 声明。`批量操作栏` 仅作为回调适配器复用学习/预览的 `CardActionMenu`，由公共 `AnchoredMenu` 和 `MenuItem` 负责布局，不再在底部占用列表空间。锚点使用 `pageContentTop(状态栏高度, narrowDeckLayout)`，公共定位层不重复扣除密度偏移；宽度沿用 `cardActionMenuWidth`。公共 Scroll 按实际窗口高度减去锚点和底部留白限制最大高度，短屏、横屏或大字体导致菜单过长时自动滚动，长屏按内容自然高度显示。外部点击和系统返回先关旗标颜色窗，再关菜单，始终保留选择；退出多选由返回或“退出多选”菜单项负责。笔记模式不显示到期日、重排位置；Agent 显隐继续沿用运行时开关。界面声明与实际打开状态登记到 `AppInterface.browser_batch`、`browser_batch_marking`、`browser_batch_flags`，销毁移除观察。

“标记”默认收起，点击后展开学习页同款小菜单，包含标星、取消标星、设置旗标和自定义名称。旗标颜色再次使用同款小弹窗；学习和浏览的七色/清除、用户名称、图标透明填色及清除中性样式由 `FlagMenuChoices.ets` 统一生成。批量星标显式设置所选笔记的 `marked` 标签，不猜测混合状态；旗标处理所选卡片，笔记模式展开全部兄弟卡。颜色选择窗和主菜单都按实际设备限高滚动，已关闭/忙碌/空选的迟到点击不写入；选择具体颜色先关窗再进入原批量写入边界。

`BrowserCardState.ts` 按所选卡片最新 queue 判断整个集合：全部 queue=-1 才取消暂停，否则统一暂停；全部 queue=-2/-3 才取消今日跳过，否则统一今日跳过。与 AnkiDroid `CardBrowserViewModel.toggleSuspendCards/toggleBury` 一致，笔记模式先展开全部兄弟卡，全部读取成功后才一次写入。今日跳过不会解除暂停卡；解除状态经 Core 原有 `RestoreBuriedAndSuspendedCards` 恢复原类型对应队列，保留到期日、间隔、评分历史及旗标，不重置为新卡，也不保证立刻进入学习（仍受原到期日、牌组范围和每日限额影响）。菜单移除了笼统的“恢复卡片”；帮助已说明混合选择统一设置状态，建议按状态筛选后解除。

直接回归见 `browser-card-state.test.mjs`、`browser-batch-menu.test.mjs` 和 `browser-batch-runtime.test.mjs`：冻结选择、全部/混合状态、读写失败、原动作回调、中文/英文完整文案、禁用及迟到点击、返回保留多选。`native/rsharmony/tests/scheduler_restore.rs` 在真实 Core 中验证不同卡片类型的队列恢复、真实答题后的历史保留、未选卡片不变、暂停卡不被今日跳过解除及撤销。实际锚点、滚动、字号与主题外观由用户设备验收。

2026-10-03 最终菜单、标记复用、标签留白与图片表面修改后，全仓发现的 2222 项 Node 回归通过（`--test-concurrency=2`，此前默认并发触发主机内存不足）；`build-native.ps1 -Target host-test` 完整主机测试通过，包含标签与恢复的真实 Core 回归。沙箱主机验证、22 服务/22 方法表协议核对、双架构 Native 和 clean 签名 HAP 构建通过，构建警告基线 268、额外警告 0。界面验收由用户负责，未替用户执行最终外观与数据写入操作。安装使用覆盖安装，正式配置在实体设备报 9568322 时按[既有设备签名](signing.md)切换已有 `ceshi` 测试配置，保留默认发布配置和已安装应用身份。

最终签名包已通过 `hdc install -r` 成功覆盖安装到实体设备 `7JDUN26418G04789` 和模拟器 `127.0.0.1:5555`；以安装器成功消息确认，未使用卸载或清除数据。最终菜单与标记弹窗、滚动和图片边界等待用户手动验收。

浏览页沿用牌组/标签/保存搜索和批量操作；题目最多两行，“更多”内选择副标题（末级牌组、答案、到期）并进入查找替换。结果数使用完整搜索 ID 数量，排序入口仅列出后端声明支持当前 Cards/Notes 模式的列，通过 builtin SortOrder 排序完整结果。浏览行查询前同步 BrowserTableShowNotesMode；暂停标记来自独立的后端 is:suspended 搜索，不能从优先展示旗标的行颜色推断，笔记行明确标为“含暂停卡片”。搜索代次阻止旧查询和分页结果回写。

保存搜索参照 AnkiDroid `browser/search/SavedSearches.kt` 的 `Config.savedFilters`：集合配置 `savedFilters` 存储名称到查询的 JSON 映射，名称区分大小写、重复名称拒绝保存，查询去除首尾空白，写入 `undoable=false`。AnkiDroid `libanki/Config.kt` 将缺失键的 `BackendNotFoundException` 转为 `null`，搜索列表再 `orEmpty()`；本机 `AnkiBrowserSidebar.savedSearches()` 从 `GetAllConfig` 读取，仅缺失 `savedFilters` 时返回空映射，真实读取失败仍上抛，避免首次保存前重读配置就失败。首次创建、保留已有项、重开读取、改名/删除和读写失败重试由 [page-repositories.test.mjs](../../tools/tests/page-repositories.test.mjs) 执行真实适配器及页面提交入口验证。入口与 JIDE 的共同声明仍为 `AppInterface.browser_more.save_search`，本次修复只恢复已有操作的持久化行为。

2026-10-04 首次保存修复验收：`page-repositories`、`browser-flow-contract`、`ai-agent-app-structure`、`documentation-contract` 共 93 项通过；`npm run build:app` 完成双架构原生、增量 ArkTS 与签名 HAP 构建，警告门禁 `unexpected=0`。未覆盖安装或操作设备；真机首次保存、从侧栏重新调用及跨端同步仍需设备验收。


## 牌组学习记录

详情页 `DeckStudyHistoryCard` 显示本牌组及子牌组近7个学习日的答题次数、学习天数与答题用时。`model/DeckStudyHistory.ts` 用真实ID构造 `did:` 范围，聚合统计服务的 Graphs(6) 返回值；历史日偏移为0、-1至-6，时间单位为毫秒，不使用首页全库摘要或待学计数替代。首页每次提交新快照递增刷新令牌，涵盖学习、编辑、同步和导入返回；组件还在重新可见、日切后刷新，以请求序号丢弃旧结果。加载失败提供重试，缺失统计字段不当作零记录。学习按钮固定在详情内容卡片之外的下方操作区，与学习页显示答案共用按钮组件和底部间距，记录在上方卡片内滚动。


## 设置目录、浏览与统计摘要

设置以 AnkiDroid 分类为参考，`SettingsNavigation.ts` 控制目录和模式内搜索：简洁版显示常规、复习、同步、外观、数据管理、学习帮助和关于；复习依次展示复习操作、学习布局，实验版在下方增加 FSRS 算法，另有高级设置及维护细项。颜色主题、主题动效、答题工具栏位置、评分振动和自定义服务器在两种模式都可配置；学习手势和四象限点击在两种模式均可配置并生效。AI 设置另受发布及解锁开关控制。`GeneralSettings.ets` 复用语言和首页偏好；`ReviewControlsSettings.ets` 在复习分类内复用评分触感及互斥的快捷答题方式（关闭、四象限点击、学习手势），`布局分组.ets` 仅负责复习工具栏位置并位于复习详情。详情取消旧主分组折叠，返回先退到目录；模式切换回目录而不重置偏好。数据库检查并入数据列表，维护会话拥有操作状态，主壳只订阅快照并适配服务。未对齐能力及后续接入位置见 `components/settings/SETTINGS_PARITY.md`，不创建无效开关。

浏览顶部采用卡片/笔记选择+搜索、状态选择+数量+排序两行，标题为“浏览”。状态与排序共用原生 Select 下拉形式；排序直接选择列和升降方向，转换为 Core 的 reverse 标志。浏览常规行透明、统计滚动区订阅 PAGE_SURFACE_KEY，主题背景贯穿内容区。`BrowserQuickFilter.ts` 通过 Core SearchNode AND 组合原搜索与状态，不破坏 OR 语义，保留分页、笔记 ID 和批量操作。默认副标题显示牌组与后端到期/新卡位置；筛选只影响展示。

统计摘要复用 TodayCounts.answerCount/answerMillis 与 Core FutureDue：已学为答题次数，待复习含 day≤0，逾期为 day<0，不含新卡且不应用每日学习上限。`StatsOverview.ts` 不自行调度；缺失数据保留未知态，小数预测平均值不错误显示为零。统计范围菜单注明历史，预测控件注明未来；口径解释放在帮助中。标题用屏幕居中 Stack，返回统一为文字“返回”。

统计年历保留 768vp 横向滚动和较大格子，未来日期保留透明占位；横向滚动条常驻显示（BarState.On），格子下方预留 12vp，滚动条宽 4vp。格子 key 包含日期和数量，换年后不会复用旧日期说明。日期与后端日桶换算保持原有实现。


设置搜索通过 `SettingsNavigation.ts` 的分类标题、当前模式说明和 `searchKeys` 设置项资源匹配；`searchKeys` 只收录两种模式都可见的入口。设置面板主壳固定渲染搜索框，目录、二级分类和三级内容共用它；在详情页输入新关键词会回到目录显示匹配项。数据管理在简洁版与实验版都提供“首页隐藏的牌组”，搜索“隐藏”“恢复显示”可进入该分类。隐藏数量由 `model/HiddenDecks.ts` 的 `activeHiddenDeckIds` 统一去重并与当前集合牌组 ID 求交集；设置弹窗每次打开重新读取牌组树，首页 `HomeDataRepository` 也使用此口径。历史 ID 不在读取时删除，以保留撤销删除后的隐藏状态；子牌组不额外计数。回归见 `ui-usability.test.mjs`、`settings-hidden-decks.test.mjs` 和 `home-data-repository.test.mjs`。

## 浏览写入边界

设置页的集合维护由 `model/settings/CollectionMaintenanceSession.ts` 持有检查结果和操作占用，面板订阅独立快照并适配服务调用及确认提示。离页解除订阅，已接受的检查/标签清理仍完成；重新挂载取得真实状态，重复请求不能越过正在执行的操作。行为回归见 `settings-maintenance.test.mjs`，UI 测试只检查状态和动作接线，不规定业务必须内联在主壳。

浏览页是多选模式和 ID 集合的唯一所有者；`卡片表格` 通过 Prop 展示选择、通过回调提交意图，不再维护第二份集合或退出计数信号。批量表单由一个 `batchDialog` 槽互斥显示，动作菜单先关闭再转交表单或写入。到期、改标签、重新定位的表单草稿属于各自 Dialog；重新定位默认值读取随 Dialog 销毁失效。

`components/browser/BrowserNotetypeFeature.ets` 与 `model/browser/BrowserNotetypeSession.ts` 拥有类型列表、映射加载及草稿。切换类型丢弃旧请求，提交时输出不可变映射快照，写入仍回到页面的统一操作边界。关闭弹层、切换选择或模式都会结束旧表单；页面不再复制映射状态。对应行为测试为 `browser-notetype-session`、`browser-selection-view`，页面 `build()` 按结果、检查、搜索和变更面板装配。

`BrowserSelection.ts` 负责 cards/notes 解析、稳定去重和变更笔记类型 schema/映射快照；解析失败必须整批停止，不能将部分集合误当成完整选择。`BrowserOperationController.execute` 区分写入失败与写入后的刷新失败；后者保留写入成功结果，避免诱发重复提交。离页继续已接受写入，只广播数据变化；旧操作不能清理新选择。页面只提供服务调用、当前选择判断和 UI 效果。

查找替换的“当前搜索结果”在提交时复制完整 `结果ID列表` 与模式，再进入统一写入边界；不是已加载行，也不是提交后重新读取的搜索条件。空结果和未就绪搜索不调用写入，避免 Core 将空 `nids` 当作全库。卡片模式解析笔记 ID 并去重，任一解析失败整批停止；查找替换只支持字段，标签用标签服务。范围、翻页及等待期间切换搜索的回归在 `page-operation-boundaries.test.mjs`。

牌组选项通过 `DeckConfigSave.ts` 将未启用的今日限额转为 null，再构造保存请求；协议的 Active 字段只描述读取状态，不能靠发送 false 停用覆盖。编辑框中的关闭值仅保留到本次编辑结束，保存清除覆盖。`DeckConfigMessages.encodeLimits` 保留 optional 数值 0 的字段存在性，0 与 null 不等价；回归见 `deck-config-save.test.mjs`。说明正文及对应实现索引见 [应用内帮助](in-app-help.md)。

### 牌组选项与 Core 升级

官方基线是 `UPSTREAM.lock` 锁定的 Anki 26.05（e64c6b1）。共同目录 `model/DeckOptionsCatalog.ts` 拥有分组、字段、调度器显隐、枚举顺序、步幅单位和轻松日映射，UI 与 JIDE 使用同一声明；数值边界由 `牌组配置表单.ets` 校验，Core 默认值来自真实读取结果。轻松日是独立分组，对 SM-2 和 FSRS 均可设置，按周一至周日显示最低/减少/正常；通常作用于未来间隔，FSRS 重新排程由单独开关控制。完整模式提供预设管理、预设/牌组/今日上限与保持率覆盖、单项恢复默认和官方保存模式。FSRS 参数展示一个有效向量，读取顺序 6→5→4；编辑后清除旧代际向量以恢复明确语义。自定义调度脚本在当前平台不能执行，界面如实标记不可用，保存仍保留原脚本；不能宣称全部官方运行时能力已实现。

`deck-options-parity.test.mjs` 首先比较 `DECK_OPTIONS_UPSTREAM` 与 `UPSTREAM.lock`：升级 tag/commit 后先失败，必须重新核对官方 deck-options 界面、FTL、proto 和 Core 的字段、默认值、条件、取值、范围与保存模式，再同时更新 UI/JIDE 共同目录、编解码、校验、测试及基线。禁止只改版本断言以消除失败；未知字段仍须保真，新增字段明确接入或标明不可用。RPC 升级还要执行[协议门禁](verification.md#rpc-协议门禁)，按升级级别完成真实 Core、HAP 和设备验证。该版本门禁只能提醒审查，不会自动适配未来协议。

直接行为回归覆盖分组条件、单位与边界、轻松日、预设暂存/取消/失败重试、多配置保存、未知字段、真实字段回调以及简洁模式；数值边界包括 float32 协议读回，合法的 70%/99% 与 SM-2 易度边界不能因舍入被拒绝。保持率字段沿用官方 SpinBox 的整数百分比显示，确认卡保留必要的小数以准确展示改动。JIDE 的确认写入另见 `ai-agent-deck-options.test.mjs` 和[助手说明](agent.md#应用设置读取与修改)。主机测试不证明布局或真实模型规划，设备仍需验收深浅主题、宽窄屏、大字体、模式切换、字段编辑/恢复默认、共享范围、确认/取消、返回和保存失败。

### FSRS 参数优化与学习负担模拟

责任链为 `components/home/FsrsTools.ets` → `DeckOptionsFeature` → `model/home/DeckOptionsSession.ts` → `backend/AnkiDeckOptions.ets` / `FsrsService.ts` → 锁定 Anki 26.05 Core。UI 复用 `DeckOptionRow`、`DeckOptionField` 和加载态，放在完整牌组选项的 FSRS 分组；简洁版继续只展示四个常用选项，分区入口见[首页说明](home.md#数据与牌组修改入口)。字段草稿、取消和唯一保存入口不变。Core 计算经 `ComputeFsrsParams` 与 `SimulateFsrsWorkload`，本地只映射输入、汇总展示和编排，不实现 FSRS 算法，也不接入已移除的“最低推荐保持率”。

当前预设优化使用最新表单参数、忽略历史的 UTC 日期、重学步数和健康检查开关。默认按预设 ID 从 Core 全部牌组数据构造 `did:… -is:suspended`，涵盖共享牌组及过滤牌组中的原始卡片，不按名称匹配或扩大到使用别的预设的子牌组；空范围使用 `did:0`，解析失败反馈错误，不能变为全库或名称搜索。高级设置的自定义参数搜索原样交给 Core。参数选择顺序与 Core 一致：6、5、4，全部为空时使用 Core 默认值；响应按实际长度写入对应字段。零有效记录保持参数不变；有有效记录时 Core 也可能保留空参数表示，此时清除三个代际字段，继续使用 Core 默认值。少于 400 条有效训练记录显示样本不足提示，仍接受 Core 结果。健康检查保留未评估/通过/失败三态，失败不伪装为成功。

“优化全部预设”以配置 ID 去重，每个预设独立计算和反馈。成功参数暂存为共享预设草稿，失败保留错误并可仅重试失败项；未保存不会更新预设。普通当前优化默认编辑共享预设；需要分离时先明确克隆。修改预设分配后先保存，再执行优化或模拟，避免用尚未保存的分配计算范围。批量保存共享各预设参数，当前牌组的其他编辑仍遵循用户所选范围；暂存的其他预设编辑也在同次提交，当前牌组选中的配置必须最后。全局选项、限额、未建模字段与重调度开关沿用现有保存契约。批量提示说明默认预设和共享牌组也受影响，取消丢弃暂存参数。

学习负担模拟使用最新参数草稿、预设的新卡/复习限额、最大间隔、学习/重学步数、历史保持率、轻松日、复习排序、水蛭暂停策略与全局新卡忽略复习限额开关；范围为该预设，不使用单牌组/今日覆盖，不额外添加新卡。天数可选 1–3650，默认 365。Core 一次返回 70%–99% 的总耗时（秒）、期末记住的卡片数及新卡学习加复习次数；UI 展示每日平均分钟/答题数、固定参考档与用户选择档。结果是本次模拟快照，修改草稿后须重跑；“使用所选保持率”只填入预设草稿，保存后生效。单牌组保持率覆盖仍有优先权。

锁定 26.05 的 `simulate_workload` 在无复习基线中直接调用 `Card::retention_on(&req.params, …)`，fsrs 5.2.0 直接读 `params[20]`，会使合法空/17/19 参数越界。跟踪补丁 `tools/patches/anki-fsrs-workload-params.patch` 只把这处调用替换为 Core 原有的 `get_decay_from_params` + `fsrs::current_retrievability`，保持默认和旧参数的 Core 语义；不在 ArkTS 补参数或复制公式。主机及 HAP 构建、便携 Core 入口均幂等应用补丁，真实 Core 回归覆盖 0/17/19/21 参数和 30 个保持率结果。

`DeckOptionsSession` 跨弹层实例共用 Core 工作队列，所有加载/计算/保存等待 `SyncActivity.waitForCollection()`，且通过 `AutoSyncScheduler` 持有真实操作占用直到调用结束。计算期间禁用输入与保存，可退出整个选项面板；尚未开始的计算在离页后停止，已开始调用等待真实结束、丢弃迟到结果且不继续批量剩余项。已接受保存离页后继续并广播。重开等待旧调用，旧结果不能覆盖新表单；失败释放占用、保留草稿和重试能力。Core 模拟可能补齐卡片缺失的记忆状态，所以它同样按集合操作处理，不能把关闭展示当作调用已经结束。

直接行为与协议回归：`tools/tests/deck-options-fsrs.test.mjs`、`deck-options-fsrs-protocol.test.mjs`；已有 `deck-options-session`、`deck-config-save` 验证取消/提交与未建模字段。`native/rsharmony/tests/fsrs.rs` 用同一份 ArkTS 编码黄金请求创建临时真实 Core 集合，执行优化/模拟、共享范围、无历史/忽略日期/错误和多预设保存；进入 `npm run verify` 的主机测试。RPC 清单仅追加语义别名并经生成器和锁定分派校验。设备由用户验收：深浅主题、宽窄屏/长名称、批量反馈、保持率对比、取消/返回、重复点击、离页重开、同步占用与保存失败重试；本任务不安装或重启设备。

直接行为验证在 `browser-operation-model.test.mjs`；页面接线与选择切换回归仍在 `page-operation-boundaries.test.mjs` 和 `browser-batch-runtime.test.mjs`。新增批量操作先扩展这里的行为测试，不要求业务规则仍写在页面里。

## 搜索与编辑入口

- `model/NoteCreationSession.ts` 拥有新增笔记初始化、类型加载代次和一次提交。`backend/AnkiNoteCreation.ets` 负责 Core 标准类型恢复、普通/图片遮盖笔记写入与永久媒体导入；类型别名共用 `NoteTypeCatalog.ts`。页面保留字段编辑、Cloze 校验和遮罩交互；会话冻结牌组/类型/字段/标签，已接受写入离页后仍完成并广播，失败保留草稿供重试。遮盖按 Core 字段索引组装普通笔记，显式传递目标 deckId，不依赖 Core 当前牌组；普通与遮盖图片共用 NoteImageImport 的短读、格式转换和 finally 释放。直接回归见 `note-creation-session.test.mjs`。
- `pages/添加笔记页.ets` 的普通字段支持各自添加多张图片、预览与移除，可创建纯图片正反面或图文问答。界面参照 [AnkiDroid 编辑页](https://docs.ankidroid.org/#adding-notes) 的字段旁媒体入口与顶栏保存，字段采用独立卡片；标签折叠、遮盖工具和填空按钮使用紧凑控件。标签入口仅实验版显示且仅显示文字，点击可展开/收起；简洁版隐藏入口及内容，通过共用简洁模式存储键响应模式切换。笔记类型帮助紧随左侧标签，类型选择框靠右对齐。顶栏添加复用与牌组详情添加入口相同的 `按下态按钮`，统一玻璃底、主题文字和按压反馈。
- `model/NoteImageDraft.ts` 负责字段快照、图片 HTML 与导入失败重试；`backend/NoteImageImport.ets` 按 provider 描述符异步读取，JPEG/PNG/GIF/WebP 保留原文件，其余可解码格式转 PNG。保存时先调用 Core 添加媒体，使用实际返回文件名再添加笔记；不把临时相册 URI 写入笔记。成功导入的文件名留在草稿，后续重试复用；移除/取消不主动删除媒体，避免误删 Core 去重后共用的文件，未引用媒体可经现有媒体检查清理。
- 选图取消不改草稿，类型切换/离页拒绝迟到的选图结果；已接受保存继续执行，成功广播刷新，离页后不再导航。`tools/tests/note-image-media.test.mjs` 覆盖图片正反面、混合文字、多图、重试、短读、格式转换与资源释放，以及页面选图/保存生命周期。真机图库、转换与学习显示需单独验收。

- `model/BrowserSearchSession.ts` 编排模式、列、搜索、暂停状态及首屏行；模式和列属于集合级配置，因此搜索与分页跨页面实例共用读队列。过期请求不会发布结果，失败行仍消费 ID 游标。
- `backend/AnkiBrowserSearch.ets` 只适配已有服务。行展示类型属于模型，表格不拥有查询协议。
- `model/BrowserSidebar.ts` 读取牌组、标签、已保存搜索与折叠偏好；缺失偏好分别降级，损坏的搜索项逐条过滤。页面以独立代次拒绝关闭/重开后的旧结果。
- `model/NoteEditorLoader.ts` 与 `backend/AnkiNoteEditor.ts` 由独立 `pages/EditNotePage.ets` 调用；浏览、学习和首页预览只传 ID 与 cards/notes 标志。每次 RPC 前后检查所属请求，字段名返回副本。
- `model/NoteEditorSession.ts` 统一拥有编辑读取代次、可见/忙碌/错误快照和输入冻结。`EditNotePage` 复用 `BrowserOperationController` 的集合写入保护，将 `AnkiNoteUpdate` 的永久媒体导入和笔记更新放在同一次操作内；完成后广播并只由页面返回一次。读取完成前不挂载表单，失败可重试。`components/browser/浏览编辑区.ets` 保留原输入组件路径，现为全屏表单，只管理草稿、附件和放弃确认。
- `components/browser/卡片信息.ets` 拥有卡片统计读取和目标代次，浏览页只持有当前卡片 ID 与显示槽，不再复制统计请求状态。
- 新规则优先直接测试模型；`browser-presentation` 与 `page-operation-boundaries` 验证页面接线，`page-domain-models` / `page-repositories` 验证跨请求并发和解析。


浏览结果分页由 `BrowserSearchSession` 拥有当前结果、消费游标、分页占用与查询代次。页面 `加载更多` 只请求 `more()` 并发布返回快照；选择操作保留自己的视图代次，不能把它混成分页游标。失败行同样消费 ID，旧查询的 finally 不解除新查询的占用。直接回归：`browser-search-pagination.test.mjs`；页面接线及批量快照保护继续由原有 browser 测试覆盖。

## 统计与关于设置的职责入口

`model/StatsSession.ts` 拥有图表读取代次、冻结的查询范围、偏好写入队列与错误快照，`backend/AnkiStatsSession.ets` 适配集合等待和服务调用。页面只拥有范围选择、图表布局和初始缓存展示；旧图表/偏好/错误不得覆盖新请求，偏好读取不得撤销已接受的用户选择。离页取消尚未执行的查询和排队写入，已接受偏好写入继续完成。

`backend/StatsWidgetPublisher.ets` 统一全库桌面卡片聚合和发布队列：首页仓库、统计页和 FSRS 刷新复用同一入口。调用方负责范围与请求代次校验；单牌组查询不发布，已接受推送按队列完整结束，失败不阻塞后续发布。它不决定哪个来源的数据更新，只保证接受顺序。布局及统计口径仍由现有组件和 Core 决定。回归为 `stats-session`、`stats-entry-runtime`、`home-data-repository` 和 `home-sync-refresh-runtime`。

`components/settings/AboutSettings.ets` 接管关于分组的链接、剪贴板、反馈/赞赏弹窗；许可证导航回调仍交设置壳。入口行复用 `SettingsActionRow`，图标统一取自 `SettingsIcons`；继续复用 `AboutActionDialog`、`ThemeTextSpans` 和 `utils/好评引导.ets`，QQ群号富说明保留复制并可换行。`settings-about-runtime` 验证外链降级、好评委托和弹窗释放，`ui-settings-components` 检查公共行与图标覆盖；真实系统弹窗、剪贴板及视觉需设备验收。


## 基础字段编辑与草稿保护

2026-10-03 补齐长字段与格式工具：公共 `NoteFieldEditor` 提供原位“展开输入框/收起输入框”（112vp / 336vp），只改变高度，不重建输入组件、不修改草稿或输入格式/选区。“更多格式”按需展开项目列表、编号列表、链接、上下标及清除格式，沿用自动换行工具组。新增、已有笔记、音频相邻文本与 Agent 草稿共用此入口。

可视编辑的加粗、斜体、下划线、荧光、上下标和清除格式统一经 `applySelectionStyle` 更新，再用 SDK `setSelection` 保留原 UTF-16 选区；隐藏系统选择菜单，不把选区收成末尾光标。样式更新期间忽略临时选区通知并只发布最终草稿，用户可连续调整同一段文字或再次点击荧光去掉底色，持续输入格式不变。用户重新点光标后按新位置处理，禁用/离页后不恢复旧选区。换行、公式、挖空、列表及链接仍有各自的内容/选区策略，不强行套用纯样式更新。新增与编辑表单的 `AppInterface.instructionsKey` 复用工具按钮的 `note_editor_format_action` 资源，JIDE 读取同一份操作说明。回归：`note-rich-editor` 的连续操作、代理对、临时回调与销毁保护；原生选择高亮、手柄和键盘仍需设备验收。

`NoteRichText.ts` 接管无额外属性的标准链接和 sup/sub；链接经 SDK `urlStyle` 保留地址，上下标经 `fontFeature` 显示并序列化成标准标签，原生字形取决于设备字体。未知属性、列表、表格等继续使用源码，未修改内容不重写。`NoteHtmlTools.ts` 拥有 UTF-16 选区切片、列表逐行序列化、地址转义及源码边界检查；列表操作对选区或光标所在行生成 ul/ol/li 后切到源码，预览使用既有 Core 链。源码工具拒绝半个标签、实体、代理对及无法理解的片段，保留未知 HTML 和共享媒体。

链接弹窗复用 `DialogFrame` / `DialogHeader` / `FormInputStyle`，冻结打开时的草稿与选区；确认前仅持有地址副本，取消不修改，离页/禁用/原草稿变化后忽略回调。可视清除格式只作用选区（包括链接），无选区时重置后续输入开关；源码清除要求选中完整基础格式片段，保留文字、实体和换行。纯模型回归为 `note-html-tools.test.mjs`，原生控制器、展开状态与弹窗生命周期回归在 `note-rich-editor.test.mjs`。实际中文输入、选择范围、字体上下标、键盘、窄宽屏/深浅色仍需设备验收；构建和测试结果以本次交付为准。

新增、浏览和学习共用 `components/common/NoteFieldEditor.ets`。`NoteRichText.ts` 负责文字/基础 HTML 往返，原生 RichEditor 显示加粗、斜体、下划线和荧光；无选区时按钮切换持续输入格式，有选区时只改选区。`NoteFieldEditing.ts` 仍处理源码选区和挖空编号。字段卡片分离标准 img/sound 引用作媒体预览，其余未知标签/属性保留源码模式，未修改的 HTML 不重写；公式、挖空保留标记，学习时渲染。首次学习和交互规范见 [应用内帮助](in-app-help.md#编辑工具首次学习与当前界面文案)。`笔记类型服务.获取编辑笔记类型` 读取 Core kind、originalStockKind、clozeFieldOrds 和 IO 字段索引，改名不影响功能；标准可选反向模板由 `NoteTypePresentation.ts` 检查，按真实字段引用找开关序号并通过 NoteEditorSession 传给三个编辑入口；定制模板保留文本字段。友好类型名只用于展示，不改用户数据库。

`浏览编辑区` 拥有文本、标签、待保存图片及关闭确认；图片经 onSave 交给 EditNotePage，在 BrowserOperationController 的写入保护内入库再更新笔记。失败保留草稿，成功导入的附件复用文件名。页面返回和系统返回共用 `confirmNoteDiscard`；确认/选图/写入期间禁用冲突操作，销毁后的回调不导航。新增页取消类型切换会重建 Select，恢复实际类型和草稿；遮罩再次打开传回已确认的 initialMasks。

设置类型编辑使用 `NotetypeFieldDraft.ts`：数组位置表示新顺序，ord 保留旧身份，新字段为 null；按旧 ord 保留元数据，禁止把位置当身份。回归入口：`note-editing-basics.test.mjs`、`note-creation-session.test.mjs`、`note-image-media.test.mjs` 和 `native/rsharmony/tests/note_editing.rs`。Core 主机测试验证显式 IO 牌组、c1/c6 建卡与字段重排/删除/新增后的内容和卡片身份。

已有 IO 图形化往返和遮罩兼容范围见 [编辑交接](note-editing-handoff-2026-09-29.md)；未保存草稿预览和重复笔记处理见下文专节。基础编辑不等于 AnkiDroid 全面兼容。


字段工具栏采用宽度 100% 的 Flex 换行排列，按钮不收缩，不再要求在按钮上横拖或操作细滚动条。窄屏自然增加行数，宽屏容纳更多按钮；输入框到工具栏的间距只由 NoteFieldEditor 的 Column 提供 5vp，按钮保持 36vp 紧凑高度及左右 10vp 内边距，工具栏无额外外边距。页面/弹层继续拥有外部 padding 与安全区，工具栏不再贡献第二层 inset。新增、浏览和学习同用此布局；宽窄屏及安全区实机外观仍由用户验收。


新增和编辑共用 `NoteEditorHeader` 与 `NoteFieldCard`：字段标题右侧添加图片、下方可视编辑和附件预览，工具按钮共享尺寸及固定 8vp 横纵间距。浏览返回在 onShown 消费内容变更信号，保持预览位置；列表刷新保留已挂载列表，并补齐之前已加载的分页范围，避免返回跳到首屏。取消不触发搜索。学习返回保留原卡面，实际写入通过 cardContentChangedTick 触发既有队列/卡面刷新。新页面导航和保存回归见 `editor-page.test.mjs`、`study-note-editor.test.mjs`。

## 手工连续制卡

保留开关的配置写入使用独立 `stickySaving` 状态，只暂时禁用保留开关，其他控件不因配置落盘而进入整页禁用态。紧接着的保存或类型切换等待该写入；配置失败取消等待中的操作，保留旧配置及完整草稿并显示错误，离页后不接受排队的保存。`NoteFieldCard.stickyInteractive` 单独控制保留开关，不禁用字段编辑。图片遮盖入口显示“保留源图”“保留遮罩”，说明分别指向下一张保留图片/遮罩，遮罩说明保留更换图片清空遮罩的提示；界面不再解释内部笔记类型配置归属。真机仍需确认点击开关时其他按钮无闪烁。

`pages/添加笔记页.ets` 的固定底部操作提供“保存并继续”和“保存并返回”。前者成功后保留目标牌组、笔记类型及本次标签（去重），只清空非固定字段；后者成功才出栈。标签、固定字段和已解析媒体成为下一张的初始基线，未继续编辑时退出不重复确认；新文字、标签改动、待存附件、IO 标题/额外/遮罩变化仍须确认。类型切换取消或读取失败保持完整旧草稿，只有新类型读取成功才清理旧字段及待存附件；新类型使用自己的字段配置。简洁模式仍可连续保存和设置固定字段，标签入口沿用完整模式。

唯一固定配置是 Core `Notetype.Field.Config.sticky`（锁定 `notetypes.proto` 的 Field.config=5、Config.sticky=1）。`NotetypeMessages` 按 ord 排序解码；`NoteCreationSession.setFieldSticky` 经 `AnkiNoteCreation` → `笔记类型服务.setFieldSticky` 读取最新完整 JSON，只改对应 ord 的 sticky，再走已有类型更新接口。不维护偏好表或另一套固定字段配置；类型改名及模板/字段元数据不受此操作影响。普通、Cloze 和可选反向字段复用 `NoteFieldCard` 的固定开关，已有笔记编辑不显示该开关。IO 的源图、遮罩、标题与额外使用 Core 字段索引，分别读取同一 sticky 配置；新源图始终使旧遮罩失效。

会话串行接受类型配置和笔记保存，冻结牌组/类型/字段/标签及附件成员；只有 Core 保存成功才发出下一张 completion。失败保留全部表单与已导入文件名，重试复用成功项；IO 也缓存源图的导入结果。固定媒体使用成功保存后的永久 img/sound 引用，下一张不再依赖相册授权或录音缓存；保留 IO 源图时预览改用媒体库文件。离页不取消已接受写入，但不回写表单、不提示、不导航；成功后的刷新通知或录音缓存清理异常不能将已保存笔记误报为可重试失败。清理只移除表单引用和本功能的录音缓存，绝不删除 `collection.media`，即使共享媒体的文件名符合缓存命名规则。

责任入口为 `model/NoteCreationSession.ts`；页面持有输入、基线和字段编辑器代次，成功继续或成功切换类型才重建字段组件，重置源码/格式/选区状态；共用字段卡片和编辑器拒绝禁用/销毁后的迟到文字、媒体与 ready 回调，标签及 IO 标题/额外也在保存、媒体选择、退出确认或离页期间拒绝文字回写。两种保存均登记在 `AppInterface`，共享忙碌和禁用条件，固定开关也发布当前配置状态。顶栏沿用 `NoteEditorHeader`，保存操作组合已有 `按下态按钮` / `PrimaryActionButton`；字段开关复用 `SettingsToggleRow`。卡片16vp内边距与宿主宽12vp/窄8vp间距保持由原入口负责；底栏独占水平页面边距，顶部和底部各复用公共操作区宽12vp/窄8vp间距，底部叠加导航安全区，滚动区不增加第二层底部安全区。两按钮各占剩余宽度的一半，之间8vp；有无导航条时仅底栏增加对应 inset。

直接回归：[note-continuation.test.mjs](../../tools/tests/note-continuation.test.mjs) 执行真实会话、页面非渲染逻辑、类型服务和 IO 保存适配器，覆盖多次添加、固定 HTML/图片/音频、标签基线、部分导入及保存失败、重复点击、类型取消/加载失败、配置写入失败与离页。共享媒体删除边界由 `note-audio.test.mjs` 验证；`note-image-media.test.mjs` 保留显式“保存并返回”的图片行为。快速验证 `npm test -- browser` / `npm test -- media`，完整验收 `npm run verify`。本任务不承担模板管理或草稿预览实现；共享工作树中的相关改动保持原样。

参照本地 `D:\Projects\AnkiDroid` 的 `NoteEditorFragment.onNoteAdded` / `setNote` / `onToggleStickyText` 与 `noteeditor/FieldState.kt`：成功后保留标签与固定内容，并更新下一张未编辑基线。设备由用户操作；需手动核对中文输入和键盘、宽窄/深浅布局、两种保存、失败重试、类型取消、连续后直接退出、IO源图/遮罩固定与共享媒体播放。本任务不执行安装、重启、提交或发布；HAP 构建和 Node 测试不能替代这些设备交互。

本轮验收（2026-10-02）：`npm run verify` 全阶段通过，仓库 2084 项测试全通过；原生 fmt/clippy、真实 Core 主机测试、沙箱、RPC 索引及双架构原生库通过，clean 签名 HAP 构建成功，警告门禁 accepted=268 / unexpected=0。本任务相关源码在 HAP 阶段保持一致；连续制卡及编辑/底栏专项 68 项通过，覆盖标签和 IO 文本的迟到回调。未执行设备安装、重启或交互验收。

## 内置名称的统一显示

`model/NoteTypePresentation.ts` 是内置笔记类型与字段的显示键入口，`utils/NoteTypeText.ets` 在渲染时通过 `UiFeedback` 解析当前语言。类型别名沿用 `NoteTypeCatalog` 的中英及繁体标准名称；列表协议只提供 ID/名称，因此仅精确匹配标准名称，其他名称原样显示，不做模糊匹配或改库。新增、类型管理、批量更改类型、查找重复、卡片信息与 AI 类型选择共用此入口。

字段标题和输入提示由公共 `NoteFieldCard` 同时处理，Core `originalStockKind` 经 `NoteEditorLoader` / `NoteEditorSession` 传递到编辑表单；只有对应标准类型中的标准字段名才翻译，用户改名、未知类型及无身份信息的字段保持原样。图片遮盖的标题和额外输入使用同一文字入口。原始字段名、顺序、类型 ID 和字段值不受展示翻译影响。

合理差异：模板编辑器的名称输入、`{{字段}}` 插入按钮、批量映射的字段/模板名以及 AI 草稿中的 schema 字段保留真实名称，方便精确核对和引用；搜索串、AI 协议、写入及导出也使用原名，不得把显示别名写回。旧的 `添加笔记面板` 当前无运行时调用，但其类型选择和字段展示也已复用公共入口。

查找调用使用 `rg -n 'noteTypeText|noteFieldText|NoteFieldCard' entry/src/main/ets`。`tools/tests/note-type-i18n.test.mjs` 执行真实公共函数及中英资源，覆盖全部标准类型、字段、语言切换、输入提示、自定义名称和编辑会话身份传递，并扫描绕开公共显示的旧写法；快速验证 `npm test -- browser`，完整验证 `npm run verify`。实际语言切换与系统菜单渲染仍需设备验收。


## 笔记音频编辑（2026-10-01）

新增和已有笔记共用 `NoteFieldCard` → `NoteAudioField`。标准 `[sound:文件名]` 显示试听/删除条目，按出现位置区分重复引用；相邻文字沿用 NoteFieldEditor，图片复用 NoteImagePreview，未知 HTML 保留源码路径。编辑某段文字和移除某次音频引用只替换原区间，未动的字段标记保留字节；试听解码 HTML 实体，保存的 sound 文件名按 Anki 的 HTML 转义规则写入。源码可手动加入标准 sound 引用，组件随字段值更新显示。

字段提供固定“新增音频”入口，独立媒体弹层提供音频选择、替换和录音。AudioViewPicker 返回的 provider URI 经 `backend/NoteAudioImport.ets` 按描述符完整读取、校验实际文件头并复制到应用缓存；不申请公共音频目录读写权限。支持 MP3、M4A、AAC、WAV、OGG、FLAC 容器，单文件上限 64 MiB；实际解码取决于设备。录音在点击时申请 MICROPHONE，以 AAC/单声道/44.1kHz 的 M4A 保存缓存，完成才加入附件，取消和后台中断不生成附件，最长 300 秒。AVRecorder 的 prepare 使用同一 API 的 callback 重载：当前 SDK Promise 重载将解释文字并入 @permission 导致误报，未修改 SDK、关闭检查或扩大警告基线。

音频弹层从上到下为整行操作、附件、保存说明。新增/录音及录音完成、暂停/继续、取消复用 `SettingsActionRow`：完整行可点击，标题与录音秒数可换行，行间使用公共轮廓色的1vp分隔线。录音主行尾部显示当前状态：空闲为普通麦克风，录制中为带红色声波的麦克风，暂停后“完成录音”为斜杠麦克风。独立的暂停/继续行分别使用两杠和播放图标，不把暂停图标放到完成入口。暂停后显示继续和已暂停秒数，暂停期间计时停止，继续保留同一录音文件。每个附件独立分组，文件名与播放/停止、替换放在一行，操作复用 `按下态按钮`；长文件名单行省略，原名称与播放目标保留。删除采用右上角公共叉号 `IconActionButton`，44vp 点击区提供完整的本地化无障碍名称，忙碌/录音时禁用并阻止迟到点击。`NoteAudioField` 拥有操作与附件排列，`NoteMediaDialog` 只将音频保存说明放在正文末尾，IO 与原禁用条件保持原责任。

弹层16vp内边距只由 `DialogFrame` 提供，操作行不叠加水平边距；附件左右12vp、上下各8vp，内容按钮44vp，附件常规高度60vp。有删除入口时只在内容右侧额外预留44vp，删除热区距上/右各4vp；公共 `IconActionButton.cornerAligned` 使18vp图标在热区内靠右上并留4vp，因此图标自身距附件上/右各8vp，不占第二行或覆盖播放/替换。其他调用方保持默认居中。附件行和附件间距8vp，说明与音频区之间12vp分别由附件、字段和外壳拥有。弹层宽度为88%、最大560vp，系统安全区与宽窄变化只改变外壳可用范围。图片管理的说明/新增行保持其既有 `LabeledActionRow`，其操作语义只有单个新增入口。

录音状态由 `NoteAudioRecorder` 拥有，暂停只接受原生 started、继续只接受 paused；原生操作成功后组件才更新状态。取消期间保持忙碌并合并重复取消，防止释放与完成/暂停/重新开始重叠；被取消的启动返回 false，不再把界面设为录音中。录音错误记录原生错误码与发生阶段，不记录字段内容或媒体路径；UI 区分权限拒绝、5400107 中断与其他错误码，不将全部失败归为麦克风权限。历史间歇失败的原生日志未保留，不能据此认定模拟器是唯一原因。

JIDE 的 `AppInterface.note_audio_manage` 声明由真实字段状态驱动：暂停/继续、完成/取消、附件播放/停止、替换和删除的显隐/禁用同步实际 UI。common 组件通过 `NoteAudioStatus` 回调传递状态，新增页和浏览编辑区拥有观察发布与离页清理；不让 common 新增后端依赖。观察只包含状态、录音秒数、错误是否存在和附件位置 ID，不含文件名、媒体 URI 或字段正文，也不授予 JIDE 通用点击/录音权限。

2026-10-04 录音与布局修正验证：音频、媒体管理、公共控件、common 依赖、JIDE 页面观察、宿主编辑流程、资源和文档共123项相关测试通过；最后的 ArkTS 异常边界修正后重跑音频/媒体管理36项通过。使用已有 `.local/tablet-signing.json` 的 ceshi 配置执行增量 `npm run build:app -- -SkipRust`，签名 HAP 构建和警告门禁通过（unexpected=0）。设备安装与实际交互结果另记，测试和编译不代替真机验收。

本次签名包 `.local/audio-recorder-fix-20261004/jidecards-recorder-ceshi-signed.hap` 已通过 `hdc -t 7JDUN26418G04789 install -r` 成功覆盖安装到 SLG-W50 平板，未卸载或清除数据。安装后已 force-stop 旧进程；启动被锁屏阻止（10106102），所以平板录音、暂停/继续、试听、叉号点击和宽窄/大字/主题外观仍待解锁后验收。没有覆盖仍保留录音草稿的模拟器，也没有把构建或模拟测试作为间歇失败根因的设备证据。

同日后续外观修正：读取平板截图和布局确认叉号仍居中在44vp热区，视觉上贴近内容行，补上上述 `cornerAligned`；录制中图标改为当前状态，移除斜杠麦克风资源。媒体管理、公共控件/按压、主题资源、ArkTS字段与common边界42项检查通过，ceshi 增量签名包 `.local/audio-recorder-fix-20261004/jidecards-audio-corner-ceshi-signed.hap` 构建通过（unexpected=0）。发现音频弹层有4段未保存录音后先保留现场；用户明确回复“安装”后，该包通过 `hdc -t 7JDUN26418G04789 install -r` 成功覆盖安装到平板，旧进程停止后 `aa start` 成功启动新版。未卸载或清除应用数据，修正后实际几何与录制/暂停图标由用户验收。

暂停图标后续修正：恢复斜杠麦克风的成对明暗资源，仅用于暂停后的完成录音入口；独立暂停/继续入口保留原图标。真实行属性回归覆盖录制→暂停→继续三种图标及原禁用/回调语义；媒体管理、公共设置图标和i18n共27项检查通过。ceshi 增量签名包 `.local/audio-recorder-fix-20261004/jidecards-audio-pause-icon-ceshi-signed.hap` 构建通过（unexpected=0）。读取平板时仍处于暂停录音，另有3段未保存音频；先保留现场。用户回复“草稿已处理，继续安装”后，该包通过 `hdc -t 7JDUN26418G04789 install -r` 成功覆盖安装，停止旧进程后启动新版成功。未卸载或清除应用数据，暂停图标最终观感仍由用户验收。

表单拥有 `NoteFieldAudio[]` 和一条 NoteAudioPreview。新试听停止旧音频，缺失文件和播放器错误可见，进入后台/离页停止，表单销毁释放。录音/选音期间字段、保存、类型切换、选图和退出均禁用；原生操作未在执行时，录音完成、暂停/继续、取消按钮仍可操作。写入仍在 NoteCreationSession/BrowserOperationController 的已有集合保护内，先导入 Core 媒体库，再以实际返回名生成 sound 引用。部分失败保留已导入名称，重试不会重复导入；已接受写入离页后仍完成。移除仅删除笔记引用/待存附件，不直接删除 collection.media，避免影响共享引用。仅本功能拥有的缓存副本在移除、放弃或保存成功后清理。

验证入口：[音频回归](../../tools/tests/note-audio.test.mjs)、`npm test -- media`、`npm test -- browser`、`npm run verify`。设备需单独验收权限允许/拒绝、AudioViewPicker、录音完成/取消/后台中断、两字段互斥试听、保存后学习和同步；HAP 构建不代替这些行为。

参考：[Anki 26.05 编辑器](https://github.com/ankitects/anki/blob/26.05/qt/aqt/editor.py) 的 onRecSound/_addMedia/fnameToLink、AnkiDroid AudioField/AudioRecordingController，以及 [HarmonyOS AVRecorder 指导](https://developer.huawei.com/consumer/cn/doc/harmonyos-guides/using-avrecorder-for-recording)。当前不包含波形剪辑、外部网络音频下载、模板生成的 TTS 音频编辑或任意 HTML audio 标签的可视改写。

2026-10-01 初版验收：`npm run verify` 的仓库、原生主机/沙箱及 clean 签名 HAP 阶段通过；最后兼容细节完成后再次运行 `npm run verify -- repo`，当时工作树 1700 项测试全通过，并运行 `npm run build:app -- -Clean`，警告门禁 unexpected=0。音频专项 17 项通过。当时未执行覆盖安装或真机权限/录音/播放操作；已连接设备不代表设备验收完成。UI 音频区的内间距由 NoteAudioField 的 8vp Column/Flex 拥有，字段卡片和页面继续使用现有外间距/安全区；后续布局和安装结果见上方 2026-10-04 记录。


## 编辑媒体预览与独立管理（2026-10-01）

新增页和 EditNotePage（含浏览/学习入口）共享 NoteFieldCard。字段标题的入口始终为“新增图片 / 新增音频”，不随附件数量改为“修改”；字段中已有 `<img src>` 与待存图片均显示缩略图和右上角“删除图片”，音频显示试听和“删除音频”。缺失或解码失败有可见错误。NoteMediaParts 只分离标准 img/sound，保留原始字节、其余 HTML 和重复引用身份；图片 URL 解码后限制本地平面 collection.media，使用编码后的 file URI，也支持 HTTP(S) 图片。编辑预览不等于套用卡片模板、公式或任意 HTML 的完整所见即所得。

NoteMediaDialog 组合 DialogFrame/DialogHeader，内部 NoteMediaSession 拥有独立字段与附件副本。“完成”一次移交宿主草稿，“取消”、遮罩和系统返回不应用修改；仍须保存笔记才持久化。弹层存在期间宿主保存、退出、类型切换和其他字段禁用；选图、选音、录音期间弹层退出也禁用。强制销毁忽略迟到选择并取消录音、停止试听。取消只清理本次新增音频缓存，确认只清理被移除的缓存；共享 collection.media 从不在此删除。

已有媒体替换使用仅驻留草稿的唯一 reference，保留原字段位置；图片额外属性保留。NoteImageDraft/NoteAudioDraft 在原有写入保护内将 reference 替换为 Core 返回名；失败重试复用已导入名称，引用被删除后不补回。新增/编辑写入都通过 assertNoteMediaResolved，禁止悬空草稿引用进入数据库。宿主拥有全局附件 ID；弹层确认只替换对应字段并重新分配 ID，其他字段不受影响。图片遮盖源图选择沿用自己的专用入口。

维护入口：model/NoteMediaParts.ts、model/NoteMediaSession.ts、components/common/NoteMediaDialog.ets 与 NoteImagePreview.ets。直接回归：`tools/tests/note-media-management.test.mjs`、`note-image-media.test.mjs`、`note-audio.test.mjs`；覆盖重复引用、属性/位置保留、保存/重试、取消、迟到选择、缓存归属和主界面删除。弹层内间距归 DialogFrame（16vp padding、12vp 内容间距），图片操作与音频行归各自组件；字段卡片沿用16vp内边距和宿主宽12vp/窄8vp外间距，无新增安全区 inset。真实图片加载、系统选择器/返回、录音权限以及宽窄屏外观须设备验收，构建不能代替。

本轮验收：`npm run verify` 全部通过，当前工作树1716项仓库测试、原生主机/沙箱检查及 clean 签名 HAP 构建通过，警告门禁 accepted=268、unexpected=0。未执行覆盖安装或真实图片加载、选择器、权限/录音/播放与系统返回的设备操作。专项入口测试及完整验证不代替这些设备交互验收。

## 重复笔记与字段查重（2026-10-02）

手动新增由 `NoteCreationSession` 持有重复警告及冻结提交。`AnkiNoteCreation` 先调用严格的 `笔记服务.添加笔记`，仅在 Core 返回 DUPLICATE 时转为 `NoteDuplicateWarning`；`NoteDuplicateDialog` 提供取消、查看重复项和明确继续保存。查看使用 Core SearchNode Dupe 构建搜索，导航显式传 `initialNotesMode=true`，返回新增页保留警告和草稿。确认只消费一次原提交，并调用 `添加笔记允许重复` 再次执行 Core NoteFieldsCheck；空首字段、MISSING_CLOZE、NOTETYPE_NOT_CLOZE 和 FIELD_NOT_CLOZE 仍失败，不跳过校验。成功后的连续新增、固定字段和退出策略仍使用原 completion。

`笔记服务.添加笔记` 的两参数契约仍严格拒绝重复；AI、导入及其他调用方不迁移到允许重复入口，警告不能成为全局偏好或批量写入许可。AnkiDroid 参考为本地 `NoteFieldsCheckResult.kt` 和 `NoteEditorFragment.setDuplicateFieldStyles`：重复可保存，空字段和非法 Cloze 分开拒绝。锁定 Core 的 `notes/mod.rs::note_fields_check`、`search/sqlwriter.rs::write_dupe` 决定首字段重复语义，前端不另写近似比较。

设置查重仍选择一个笔记类型，新增实际字段选择及可选 Core 搜索范围。`AnkiNoteDuplicates` 用数字 `mid:` 与用户搜索 AND 分组保留 OR 语义；`NoteDuplicateSession` 冻结条件、取得 Core SearchNotes 完整 ID，按最多 200 个 ID 分批调用本地 RPC 1002/0。`native/rsharmony/src/note_duplicates.rs` 在 Core DB proxy 上执行固定只读 SELECT，复用 `strip_html_preserving_media_filenames`；不导出任意 SQL，不修改锁定上游协议，也不逐条获取完整笔记。取消、条件改变和离页递增代次，当前 RPC 结束后停止后续批次，迟到结果不能回写；取消不声称中断正在执行的原生读。缺失笔记、类型变化、字段越界或读取错误整次失败，禁止将部分结果显示为成功。

字段分组参照 [锁定桌面 find_dupes](https://github.com/ankitects/anki/blob/e64c6b1/pylib/anki/collection.py#L680)：去 HTML、保留媒体文件名，按原大小写和空格精确比较，忽略空内容。取消之前 trim+toLowerCase 的近似比较和 1000 条限制；ID 和分组键仍占 O(N) 内存，字段正文跨桥只按批读取。结果首批展示 50 组、按需增加；进度按已消费 ID 更新，错误可重试，取消单独显示。点击组使用冻结的 `nid:ID,ID`，不拼字段内容或类型名；特殊字符、其他字段命中、兄弟卡和搜索范围不会混入无关笔记。

UI 复用 DialogFrame、DialogHeader、SelectStyle、FormInputStyle。内边距及 12vp 行间隔由 Frame 单独负责，类型/字段行不另加外边距；宽窄和安全区沿用 Frame 限宽/限高滚动及 Backdrop。设备需用户验收主题、长字段名、软键盘、取消/系统返回、查看后返回、明确继续保存和大集合进度，本任务不安装或重启设备。

直接行为测试：`tools/tests/note-duplicates.test.mjs`；真实锁定 Core：`native/rsharmony/tests/note_duplicates.rs`，覆盖 1205 条、非首字段跨批重复、HTML/媒体/大小写/空格、精确 ID 与范围、非法批次及只读性、重复/空/Cloze 状态。完整入口 `npm run verify`，设备交互独立记录。

本轮验收：`npm run verify` 全部通过，运行时共享工作树 2088 项仓库测试、原生主机/真实 Core、沙箱与 RPC 索引检查、双架构 clean 签名 HAP 构建均通过，警告门禁 accepted=268、unexpected=0。查重直接行为测试 14 项、真实 Core 专项 2 项通过；Core 搜索节点还验证空范围与 OR 范围，并排除其他类型的 OR 命中。保留其他任务改动；未提交、发布、安装或重启设备，交互验收仍由用户完成。

## 笔记类型管理与模板预览（2026-10-02）

`components/settings/笔记类型管理面板.ets` 拥有创建/克隆名称、标准类型选择及列表加载代次；Core 提供 Basic、反向、可选反向、输入答案、Cloze、图片遮盖六种标准类型。克隆只重置类型 ID、修改时间及同步版本，保留自定义字段、模板、CSS 和未知元数据。编辑器支持模板新增、删除、重排，保存整个旧版 JSON，字段及模板以原 `ord` 标识身份，新增使用 `null`；复制模板继承源模板配置并清除旧模板 ID。禁止删除最后一个模板，Cloze 保留一个模板。

`model/NotetypeManagement.ts` 拥有草稿序列化与写入会话，复用 `BrowserOperationController` 的同步等待、写入占用与离页收尾。结构变更确认列出字段/模板名称、原位置和新位置，并用 Core 搜索给出受影响笔记、现有卡片、删除卡片和重排卡片数量；新增卡片依赖字段与模板条件，明确说明数量由 Core 保存时决定。删除类型展示全部笔记/卡片数量及学习记录删除影响。接受确认后重新读取原 JSON 和影响 ID 集合，发生变化拒绝覆盖；取消保留草稿，删除草稿不立即写库。未删除卡片的身份、调度和学习记录由 Core 保留。标题关闭、背景、系统返回及创建子弹层共用草稿确认，预览先消费返回；保存/确认期间阻止冲突操作，已接受写入不随离页撤回。

`NotetypeTemplatePreview.ets` 经共用 `NoteDraftPreview` 使用 Core 未提交卡片渲染，支持草稿模板、CSS、正反面及深浅色。模板样例显式使用 Core `fill_empty=true`；字段结构变化须先保存后重新进入编辑器，因为此接口读取已保存类型的字段结构。预览只说明模板展示，不预测实际卡片生成数量。

`tools/tests/notetype-management.test.mjs` 执行真实模型和组件方法，验证模板身份、未知元数据、克隆/重排、同步占用、离页写入、版本/影响冲突、Cloze 约束及全部返回保护；进入 `npm test -- browser`。`native/rsharmony/tests/note_draft_preview.rs` 验证字段/模板重排后的卡片 ID、字段值、未知配置、调度和复习记录。`notetype_text_export.rs` 保留实际 RPC、克隆、删除中间模板后的卡片身份/进度及文本导出回归。本轮未操作设备；ArkWeb 的实际显示、宽窄屏、深浅色、大字号及系统返回仍需设备验收。

本轮补齐验收：全量 Node 2082 项通过；Rust fmt/clippy、真实 Core 单元与集成测试通过，Rust 文档检查在共享产物暂时不可读后单独复测通过；沙箱主机测试及 RPC 校验通过。`npm run build:app -- -Clean` 完成双架构原生和签名 HAP 构建，警告门禁 accepted=268、unexpected=0。以上为分阶段补齐的结果，未将中途失败的单次 `npm run verify` 标记为整体成功。

## 未保存笔记草稿预览（2026-10-02）

图片遮罩类型按 Core 的 `originalStockKind=6` 判断，源图字段使用完整的 Core 字段 tag 映射，旧类型缺少映射时沿用默认位置，不依赖可修改的类型名/字段名。草稿未放图片时提示先添加图片；已有源图但没有考查遮罩时提示先绘制遮罩并确认，不再套用普通填空题的挖空提示。待存附件仅在对应源图字段计入检查；模板样例预览保留填充空字段的既有行为。回归覆盖重新排列的字段、旧类型、错误字段的附件及有效 c1/c6 遮罩。

新增和已有笔记的“预览草稿”入口位于 `NoteEditorHeader` 右侧，使用与“返回”相同的 `text_primary`，不启用主题渐变文字；编辑保存固定在底部，字段 Scroll 不再为预览入口占一行。两者把冻结的数据经 `model/navigation/PageParams.ts` 传给 `pages/NoteDraftPreviewPage.ets`，由 `HomeDestinations` 注册为独立 `NavDestination`，对照本地 AnkiDroid 的 `NoteEditorFragment → TemplatePreviewerPage → TemplatePreviewerFragment`。导航页拥有显隐，不再用预览状态对整个编辑表单调用 `.enabled(false)`。返回时由原页 `onShown` 解除预览守卫，已有笔记经 `previewReturnRequest` 通知当前表单；`onPop` 只作为补充，不依赖它一定送达。恢复只清预览标志，不销毁字段和附件草稿；连续点击不能重复入栈，导航失败恢复原表单并显示错误。

独立页通过 `NoteDraftPreview(fullScreen=true)` 复用 `NotetypeTemplatePreview` 的卡片视口、翻面、媒体和 Core 会话。顶栏唯一负责状态栏安全区及宽/窄工具栏间距；正文左右各一个 `页面内边距_水平`，顶部仅一个 `页面内容顶部间距`，底部仅 `间距_8 + 导航条高度`，无弹窗 88% 限宽/限高。操作区最多占正文 40%，与 Web 之间只有 8vp；Web 使用剩余高度并自行滚动卡面。编辑保存栏与新增页共用 `操作区顶部间距`、`操作区底部间距`，没有额外占位 Column 或子按钮外边距。

预览的模板/挖空编号选择框复用新增页的 `SelectStyle(surface_card)`，浅色主题显示白底，深色主题跟随共享卡片底色；不使用默认的内嵌灰底。字号、圆角、菜单项及长名称省略均由现有共享实现提供，正文仍拥有选择框外部间距。

类型设置里的模板样例仍在编辑弹窗上预览，使用同一组件的默认弹窗外壳，保留设置草稿的局部返回层级。`DialogFrame(fillBody=true)` 按宿主高度的 88% 减去实测标题、两侧 16vp 内边距及唯一 12vp 标题/正文间隔分配正文；宽度沿用 88% 并限宽 560vp。普通表单默认 `fillBody=false`，仍按内容收缩并由外壳限高滚动。`ui-dialog-layout.test.mjs` 执行外壳高度计算并覆盖低可用高度及增长标题；真实 ArkUI 布局、横屏、软键盘及大字体须设备验收。

新增页和独立编辑页的预览冻结当前字段、标签、图片/音频及原笔记身份，关闭后保留表单草稿。`model/NoteDraftPreview.ts` 拥有读取代次、模板/Cloze 选项和销毁收尾；`backend/AnkiNoteDraftPreview.ets` 唯一适配集合等待、Core 读取与临时媒体。普通类型列出全部模板；Cloze 只检查 Core 指定的填空字段，调用 `ClozeNumbersInNote` 枚举实际 c1/c6 等编号，再按编号设置 `card_ord=编号-1`。对照本地 AnkiDroid `Note.ephemeralCard`，临时 Cloze 模板 `ord` 也指向目标编号，Core 优先复用该编号已有卡片的 CardID/牌组/标志，不存在时合成只读卡片，避免固定序号复用既有 c1。实际字段使用 `RenderUncommittedCardLegacy(fill_empty=false, partial_render=false)`，不新增/更新笔记、卡片或类型，无 Cloze 编号显示明确错误，空卡片显示 Core 空卡提示。

待存图片共用 `readNoteImageData` 的完整读取和格式转换，音频从表单缓存复制；文件仅进入此预览独占的 cache 子目录，不导入 collection.media，也不回写表单附件文件名。关闭立即使读取失效，等准备/渲染与当前 Web/音频资源释放完成后只清理一次临时文件，迟到结果不更新界面。已有媒体仍从 collection.media 读取。`NotetypeTemplatePreview` 复用学习/浏览预览的 `CardWebView`、HTML、数学脚本、LaTeX 结果与媒体拦截；音频/TTS 使用 `CardAudioSession`，仅给本次临时音频提供路径解析，切模板/卡面、后台、Web 退出和关闭停止旧播放。字段、图片遮罩编辑和学习调度保持各自原有责任。

直接回归为 `note-draft-preview.test.mjs`、`note-draft-preview-media.test.mjs`，覆盖真实导航入栈/返回、失败恢复、重复点击、未保存输入快照、多模板/Cloze、缓存短写与清理、已有/草稿媒体分流、隐藏停止播放、关闭和迟到回调；必要接线检查禁止表单重新挂载预览弹窗或把入口放回 Scroll。真实 Core 测试还验证 img/sound/数学标记渲染、空字段与样例差异、预览后数据库/媒体/学习记录不变。完整门禁为 `npm run verify`。设备验收须分别记录实际媒体、公式、选择/翻面、不同 Cloze、大字号、深浅色和全部返回路径，Node 与 HAP 构建不能替代。

此前草稿渲染验证使用 `$env:RUST_TEST_THREADS = '1'` 后执行 `npm run verify`，默认并行的 FSRS 测试曾异常退出，串行复核通过；本次独立页面继续使用串行主机测试，不修改 FSRS 流程或算法。共享工作树的其他任务改动保留，验证及装机结果以本次实际日志和下面的验收记录为准。

独立页本轮验收（2026-10-02）：初版 `npm run verify` 完整通过；设备实测发现预览返回后表单仍被整体禁用，已改为 `onShown` 恢复守卫并移除整页 `.enabled`，顶栏预览文字也已按用户要求使用与返回相同的正文色。修复后 `npm run verify -- repo` 全量 2100 项通过，89 项相关快速回归通过；使用现有 `.local/tablet-signing.json` 执行 `npm run build:app -- -SkipRust -Clean`，签名和警告门禁通过（unexpected=0），`hdc -t 7JDUN26418G04789 install -r` 返回安装成功并重启。设备确认新增入口进入独立预览、未保存文字实际由 Core 渲染；用户随后要求实际操作由其完成，已停止设备操作，修复后的翻面、返回继续编辑、已有笔记入口及不同尺寸/深浅色/媒体尚待用户验收。测试内容未保存，没有提交代码或发布。


## 管理列表与右侧辅助控件（2026-10-02）

笔记类型管理的列表主体改用 DialogFrame：普通列表按内容收缩、超出外壳限高后滚动，标题操作固定。每个类型的名称和操作按内容占高，行内禁止纵向 layoutWeight；克隆/编辑/删除使用可换行的 Flex，消除单条类型被撑至整屏的空白。加载、关闭、创建草稿、克隆、编辑及删除确认仍由原管理会话持有。更改类型、标准来源、当前模板与预览卡片使用 FormSelectRow；模板预览的音频重播与说明共用 LabeledActionRow。媒体新增移到弹窗说明右侧，原有预览、替换和删除保留。

今日统计的“详情”放到统计分区标题右侧，展开状态由统计页持有并传入今日计数卡；仍只在有答题时显示入口和正文，数据与展开状态经原 Watch 渲染哨兵刷新。分区标题动作按共享限宽排列，忙碌时禁止执行，并进入 AppInterface 控件快照。旧添加笔记面板目前无组件调用，本次同时将其牌组/类型选择行紧凑化，保留旧源码而未删除。回归见 `ui-compact-controls.test.mjs`、`ui-dialog-layout.test.mjs` 和既有类型、媒体、统计行为测试；本轮未操作设备界面。

## 重置为新卡

浏览多选 reset 打开 BrowserResetDialog，读取 Core 的 Browser 默认选项；读取失败禁用提交并支持重试。页面在打开时固定选择，提交前校验模式／选择／查询代次，Cards 仅所选卡，Notes 展开全部兄弟卡。写入复用 BrowserOperationController，调用 ScheduleCardsAsNew；wire 显式发送 optional BROWSER=0、log=true 及位置／计数选项。身份和既有日志由 Core 保留，默认值保存、队列与撤销由 Core 事务管理。JIDE 的 browser_reset 观察登记实际选项、可操作性与 Notes 范围。

## 字段编辑配置的实际消费（2026-10-05）

NotetypeMessages 解码 Field.config，NoteEditorLoader/NoteEditorSession 复制并贯通到独立编辑页；新增页从 NoteCreationSession 的真实类型视图读取。NoteFieldCard/NoteFieldEditor 共用 NoteFieldEditingOptions，公共组件不直接依赖 Core 协议。RTL 使用组件方向及 TextAlign.Start，避免调用目标 SDK 不存在的 Left/Right 或 API23 段落方向属性；字体仅使用本机已安装名称，字号限制与 JIDE 共用 NOTE_FIELD_EDITING_SUPPORT。

description 作输入提示；plainText 是 Anki 的默认 HTML 源码模式，保留 HTML 和格式；collapsed 决定字段初始折叠，并用公共 DisclosureChevron 展开。图片遮罩标题/补充字段复用相同字段卡片，关闭其新增媒体入口；图像、遮罩和可选反向开关保持原专用语义。改变编辑外观不改写字段 HTML，加载失败或保存失败不会清空配置/草稿。设备原生 RTL、字体回退、折叠和输入法尚未验收。
