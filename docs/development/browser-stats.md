# 浏览、设置与统计

[返回任务索引](../../PROJECT_CONTEXT.md)

- 代码路径以下均相对 `entry/src/main/ets/`。
- 责任链：BrowserOperationController 管理操作快照、写入等待、同步占用及完成；页面负责搜索代次和 UI；统计口径来自 Core。
- 快速反馈：`npm test -- browser / npm test -- ui`；完整验收见 [验证说明](verification.md)。

## 浏览列表

浏览结果每条采用独立圆角卡片，左右沿用页面内边距，条目间距沿用设置分组；信息入口、多选、旗标和分页仍在 `卡片表格` 中。表格通过 `IDataSource` + `LazyForEach` 消费行快照，行 key 使用稳定业务字段，避免大列表状态变化时按整数组重建；分页加载态跟随宿主 `Promise` 结束，不使用固定延时。应用所有原生 Select 共用 `utils/SelectStyle.ets` 的高度、字重、16vp 卡片圆角及明暗资源配色，页面独立选择框传入 surface_card（浅色白、深色卡片底），卡片内默认 surface_sidebar；调用方直接声明共享 font、borderRadius、height、padding、space，避免 AttributeModifier 差分跳过未变值后残留系统默认外观。每处选择框以固定宽度、百分比或 layoutWeight 预留空间，切换长短选项不改变控件尺寸；历史范围使用共享宽度，表单默认占行宽一半。配色继续由 modifier 提供，菜单对齐和业务绑定仍属于调用方。统计页 FSRS 状态位于顶栏右侧，历史范围位于牌组选择右侧。牌组长按菜单直接显示满宽颜色选择框；设置模式菜单沿用首页更多的 compactMenuWidth。

`AnchoredMenu` 与 `MenuItem` 由首页更多、新建牌组动作菜单、设置模式及浏览菜单共用，统一圆角、分隔线、居中文字、150ms 动效和主题色选中态。浏览搜索独占一行；下一行左侧为一个外框中的模式、状态、排序三个选值区，右侧显示完整结果数量。点击某个选值区只打开该组的选项，菜单宽度跟随整个选择框，不再套分类折叠或混列其他组；排序“默认”与各列选项同级。筛选分区使用相同菜单展开行，标题与展开内容属于同一张圆角卡片，分区之间沿用 pageSectionGap。折叠偏好和筛选协议不变。回归见 `ui-select-layout.test.mjs`，实际尺寸及点击行为另做设备验收。

笔记模式批量删除/改牌组/标志复用 `笔记服务.获取笔记的卡片` 展开全部兄弟卡并去重；删除后重新查询后端结果，失败保留选择。不要回到空卡片列表调用后本地移除行的做法。回归见 `browser-batch-runtime.test.mjs`。

浏览页沿用牌组/标签/保存搜索和批量操作；题目最多两行，“更多”内选择副标题（末级牌组、答案、到期）并进入查找替换。结果数使用完整搜索 ID 数量，排序入口仅列出后端声明支持当前 Cards/Notes 模式的列，通过 builtin SortOrder 排序完整结果。浏览行查询前同步 BrowserTableShowNotesMode；暂停标记来自独立的后端 is:suspended 搜索，不能从优先展示旗标的行颜色推断，笔记行明确标为“含暂停卡片”。搜索代次阻止旧查询和分页结果回写。


## 牌组学习记录

详情页 `DeckStudyHistoryCard` 显示本牌组及子牌组近7个学习日的答题次数、学习天数与答题用时。`model/DeckStudyHistory.ts` 用真实ID构造 `did:` 范围，聚合统计服务的 Graphs(6) 返回值；历史日偏移为0、-1至-6，时间单位为毫秒，不使用首页全库摘要或待学计数替代。首页每次提交新快照递增刷新令牌，涵盖学习、编辑、同步和导入返回；组件还在重新可见、日切后刷新，以请求序号丢弃旧结果。加载失败提供重试，缺失统计字段不当作零记录。学习按钮固定在详情内容卡片之外的下方操作区，与学习页显示答案共用按钮组件和底部间距，记录在上方卡片内滚动。


## 设置目录、浏览与统计摘要

设置以 AnkiDroid 分类为参考，`SettingsNavigation.ts` 控制目录和模式内搜索：简洁版显示常规、复习、同步、外观、数据管理、学习帮助和关于；复习依次展示复习操作、学习布局，实验版在下方增加 FSRS 算法，另有高级设置及维护细项。颜色主题、主题动效、答题工具栏位置、评分振动和自定义服务器在两种模式都可配置；学习手势和四象限点击在两种模式均可配置并生效。AI 设置另受发布及解锁开关控制。`GeneralSettings.ets` 复用语言和首页偏好；`ReviewControlsSettings.ets` 在复习分类内复用评分触感、学习手势及四象限点击，`布局分组.ets` 仅负责复习工具栏位置并位于复习详情。详情取消旧主分组折叠，返回先退到目录；模式切换回目录而不重置偏好。数据库检查并入数据列表，维护会话拥有操作状态，主壳只订阅快照并适配服务。未对齐能力及后续接入位置见 `components/settings/SETTINGS_PARITY.md`，不创建无效开关。

浏览顶部采用卡片/笔记选择+搜索、状态选择+数量+排序两行，标题为“浏览”。状态与排序共用原生 Select 下拉形式；排序直接选择列和升降方向，转换为 Core 的 reverse 标志。浏览常规行透明、统计滚动区订阅 PAGE_SURFACE_KEY，主题背景贯穿内容区。`BrowserQuickFilter.ts` 通过 Core SearchNode AND 组合原搜索与状态，不破坏 OR 语义，保留分页、笔记 ID 和批量操作。默认副标题显示牌组与后端到期/新卡位置；筛选只影响展示。

统计摘要复用 TodayCounts.answerCount/answerMillis 与 Core FutureDue：已学为答题次数，待复习含 day≤0，逾期为 day<0，不含新卡且不应用每日学习上限。`StatsOverview.ts` 不自行调度；缺失数据保留未知态，小数预测平均值不错误显示为零。统计范围菜单注明历史，预测控件注明未来；口径解释放在帮助中。标题用屏幕居中 Stack，返回统一为文字“返回”。

统计年历保留 768vp 横向滚动和较大格子，未来日期保留透明占位；横向滚动条常驻显示（BarState.On），格子下方预留 12vp，滚动条宽 4vp。格子 key 包含日期和数量，换年后不会复用旧日期说明。日期与后端日桶换算保持原有实现。


设置搜索通过 `SettingsNavigation.ts` 的分类标题、当前模式说明和 `searchKeys` 设置项资源匹配；`searchKeys` 只收录两种模式都可见的入口。设置面板主壳固定渲染搜索框，目录、二级分类和三级内容共用它；在详情页输入新关键词会回到目录显示匹配项。数据管理在简洁版与实验版都提供“首页隐藏的牌组”，搜索“隐藏”“恢复显示”可进入该分类。隐藏数量由 `model/HiddenDecks.ts` 的 `activeHiddenDeckIds` 统一去重并与当前集合牌组 ID 求交集；设置弹窗每次打开重新读取牌组树，首页 `HomeDataRepository` 也使用此口径。历史 ID 不在读取时删除，以保留撤销删除后的隐藏状态；子牌组不额外计数。回归见 `ui-usability.test.mjs`、`settings-hidden-decks.test.mjs` 和 `home-data-repository.test.mjs`。

## 浏览写入边界

设置页的集合维护由 `model/settings/CollectionMaintenanceSession.ts` 持有检查结果和操作占用，面板订阅独立快照并适配服务调用及确认提示。离页解除订阅，已接受的检查/标签清理仍完成；重新挂载取得真实状态，重复请求不能越过正在执行的操作。行为回归见 `settings-maintenance.test.mjs`，UI 测试只检查状态和动作接线，不规定业务必须内联在主壳。

浏览页是多选模式和 ID 集合的唯一所有者；`卡片表格` 通过 Prop 展示选择、通过回调提交意图，不再维护第二份集合或退出计数信号。七种批量弹层由一个 `batchDialog` 槽互斥显示。到期、改标签、重新定位的表单草稿属于各自 Dialog；重新定位默认值读取随 Dialog 销毁失效。

`components/browser/BrowserNotetypeFeature.ets` 与 `model/browser/BrowserNotetypeSession.ts` 拥有类型列表、映射加载及草稿。切换类型丢弃旧请求，提交时输出不可变映射快照，写入仍回到页面的统一操作边界。关闭弹层、切换选择或模式都会结束旧表单；页面不再复制映射状态。对应行为测试为 `browser-notetype-session`、`browser-selection-view`，页面 `build()` 按结果、检查、搜索和变更面板装配。

`BrowserSelection.ts` 负责 cards/notes 解析、稳定去重和变更笔记类型 schema/映射快照；解析失败必须整批停止，不能将部分集合误当成完整选择。`BrowserOperationController.execute` 区分写入失败与写入后的刷新失败；后者保留写入成功结果，避免诱发重复提交。离页继续已接受写入，只广播数据变化；旧操作不能清理新选择。页面只提供服务调用、当前选择判断和 UI 效果。

查找替换的“当前搜索结果”在提交时复制完整 `结果ID列表` 与模式，再进入统一写入边界；不是已加载行，也不是提交后重新读取的搜索条件。空结果和未就绪搜索不调用写入，避免 Core 将空 `nids` 当作全库。卡片模式解析笔记 ID 并去重，任一解析失败整批停止；查找替换只支持字段，标签用标签服务。范围、翻页及等待期间切换搜索的回归在 `page-operation-boundaries.test.mjs`。

牌组选项通过 `DeckConfigSave.ts` 将未启用的今日限额转为 null，再构造保存请求；协议的 Active 字段只描述读取状态，不能靠发送 false 停用覆盖。编辑框中的关闭值仅保留到本次编辑结束，保存清除覆盖。`DeckConfigMessages.encodeLimits` 保留 optional 数值 0 的字段存在性，0 与 null 不等价；回归见 `deck-config-save.test.mjs`。说明正文及对应实现索引见 [应用内帮助](in-app-help.md)。

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

`components/settings/AboutSettings.ets` 接管关于分组的链接、剪贴板、反馈/赞赏弹窗；许可证导航回调仍交设置壳。继续复用 `AboutActionDialog`、`ThemeTextSpans`、`DisclosureChevron` 和 `utils/好评引导.ets`，不新建通用 UI 体系。`settings-about-runtime` 验证外链降级、好评委托和弹窗释放；真实系统弹窗、剪贴板及视觉需设备验收。


## 基础字段编辑与草稿保护

新增、浏览和学习共用 `components/common/NoteFieldEditor.ets`。`NoteRichText.ts` 负责文字/基础 HTML 往返，原生 RichEditor 显示加粗、斜体、下划线和荧光；无选区时按钮切换持续输入格式，有选区时只改选区。`NoteFieldEditing.ts` 仍处理源码选区和挖空编号。未知标签/属性及媒体保留源码模式，未修改的 HTML 不重写；公式、挖空保留标记，学习时渲染。首次学习和交互规范见 [应用内帮助](in-app-help.md#编辑工具首次学习与当前界面文案)。`笔记类型服务.获取编辑笔记类型` 读取 Core kind、originalStockKind、clozeFieldOrds 和 IO 字段索引，改名不影响功能；标准可选反向模板由 `NoteTypePresentation.ts` 检查，按真实字段引用找开关序号并通过 NoteEditorSession 传给三个编辑入口；定制模板保留文本字段。友好类型名只用于展示，不改用户数据库。

`浏览编辑区` 拥有文本、标签、待保存图片及关闭确认；图片经 onSave 交给 EditNotePage，在 BrowserOperationController 的写入保护内入库再更新笔记。失败保留草稿，成功导入的附件复用文件名。页面返回和系统返回共用 `confirmNoteDiscard`；确认/选图/写入期间禁用冲突操作，销毁后的回调不导航。新增页取消类型切换会重建 Select，恢复实际类型和草稿；遮罩再次打开传回已确认的 initialMasks。

设置类型编辑使用 `NotetypeFieldDraft.ts`：数组位置表示新顺序，ord 保留旧身份，新字段为 null；按旧 ord 保留元数据，禁止把位置当身份。回归入口：`note-editing-basics.test.mjs`、`note-creation-session.test.mjs`、`note-image-media.test.mjs` 和 `native/rsharmony/tests/note_editing.rs`。Core 主机测试验证显式 IO 牌组、c1/c6 建卡与字段重排/删除/新增后的内容和卡片身份。

当前不包含已有 IO 笔记图形化往返编辑、非矩形遮罩完整兼容、未保存草稿预览及重复笔记策略对齐。基础编辑不等于 AnkiDroid 全面兼容。最近验收与未验证范围见 [编辑交接](note-editing-handoff-2026-09-29.md)。


字段工具栏采用宽度 100% 的 Flex 换行排列，按钮不收缩，不再要求在按钮上横拖或操作细滚动条。窄屏自然增加行数，宽屏容纳更多按钮；输入框到工具栏的间距只由 NoteFieldEditor 的 Column 提供 5vp，按钮保持 36vp 紧凑高度及左右 10vp 内边距，工具栏无额外外边距。页面/弹层继续拥有外部 padding 与安全区，工具栏不再贡献第二层 inset。新增、浏览和学习同用此布局；宽窄屏及安全区实机外观仍由用户验收。


新增和编辑共用 `NoteEditorHeader` 与 `NoteFieldCard`：字段标题右侧添加图片、下方可视编辑和附件预览，工具按钮共享尺寸及固定 8vp 横纵间距。浏览返回在 onShown 消费内容变更信号，保持预览位置；列表刷新保留已挂载列表，并补齐之前已加载的分页范围，避免返回跳到首屏。取消不触发搜索。学习返回保留原卡面，实际写入通过 cardContentChangedTick 触发既有队列/卡面刷新。新页面导航和保存回归见 `editor-page.test.mjs`、`study-note-editor.test.mjs`。
