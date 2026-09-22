# 浏览、设置与统计

[返回任务索引](../../PROJECT_CONTEXT.md)

- 代码路径以下均相对 `entry/src/main/ets/`。
- 责任链：BrowserOperationController 管理操作快照、写入等待、同步占用及完成；页面负责搜索代次和 UI；统计口径来自 Core。
- 快速反馈：`npm test -- browser / npm test -- ui`；完整验收见 [验证说明](verification.md)。

## 浏览列表

浏览结果每条采用独立圆角卡片，左右沿用页面内边距，条目间距沿用设置分组；信息入口、多选、旗标和分页仍在 `卡片表格` 中。应用所有原生 Select 共用 `utils/SelectStyle.ets` 的高度、字重、16vp 卡片圆角及明暗资源配色，页面独立选择框传入 surface_card（浅色白、深色卡片底），卡片内默认 surface_sidebar；调用方通过 `.font(SelectStyle.controlFont)` 与 `.borderRadius(SelectStyle.controlRadius)` 在每次刷新时重设字体和圆角，避免 AttributeModifier 差分跳过未变值后残留系统默认外观；其余样式继续由 modifier 提供。调用方保留宽度、菜单对齐和业务绑定。统计页 FSRS 状态位于顶栏右侧，历史范围位于牌组选择右侧。牌组长按菜单直接显示满宽颜色选择框；设置模式菜单沿用首页更多的 compactMenuWidth。

笔记模式批量删除/改牌组/标志复用 `笔记服务.获取笔记的卡片` 展开全部兄弟卡并去重；删除后重新查询后端结果，失败保留选择。不要回到空卡片列表调用后本地移除行的做法。回归见 `browser-batch-runtime.test.mjs`。

浏览页沿用牌组/标签/保存搜索和批量操作；题目最多两行，“更多”内选择副标题（末级牌组、答案、到期）并进入查找替换。结果数使用完整搜索 ID 数量，排序入口仅列出后端声明支持当前 Cards/Notes 模式的列，通过 builtin SortOrder 排序完整结果。浏览行查询前同步 BrowserTableShowNotesMode；暂停标记来自独立的后端 is:suspended 搜索，不能从优先展示旗标的行颜色推断，笔记行明确标为“含暂停卡片”。搜索代次阻止旧查询和分页结果回写。


## 牌组学习记录

详情页 `DeckStudyHistoryCard` 显示本牌组及子牌组近7个学习日的答题次数、学习天数与答题用时。`model/DeckStudyHistory.ts` 用真实ID构造 `did:` 范围，聚合统计服务的 Graphs(6) 返回值；历史日偏移为0、-1至-6，时间单位为毫秒，不使用首页全库摘要或待学计数替代。首页每次提交新快照递增刷新令牌，涵盖学习、编辑、同步和导入返回；组件还在重新可见、日切后刷新，以请求序号丢弃旧结果。加载失败提供重试，缺失统计字段不当作零记录。学习按钮固定在详情底部，记录随上方内容滚动。


## 设置目录、浏览与统计摘要

设置以 AnkiDroid 分类为参考，`SettingsNavigation.ts` 控制目录和模式内搜索：简洁版显示常规、同步、外观、控制、数据管理、学习帮助和关于；实验版增加复习算法、高级设置及维护细项。颜色主题、主题动效、答题工具栏位置、评分振动和自定义服务器在两种模式都可配置；Tap Zones 仍仅实验版显示并生效。AI 设置另受发布及解锁开关控制。`GeneralSettings.ets` 复用语言和首页偏好；`ReviewControlsSettings.ets` 复用评分触感及 Tap Zones，`布局分组.ets` 仅负责复习工具栏位置并位于外观详情。详情取消旧主分组折叠，返回先退到目录；模式切换回目录而不重置偏好。数据库检查并入数据列表，主壳持有异步状态，展示与服务边界分离。未对齐能力及后续接入位置见 `components/settings/SETTINGS_PARITY.md`，不创建无效开关。

浏览顶部采用卡片/笔记选择+搜索、状态选择+数量+排序两行，标题为“浏览”。状态与排序共用原生 Select 下拉形式；排序直接选择列和升降方向，转换为 Core 的 reverse 标志。浏览常规行透明、统计滚动区订阅 PAGE_SURFACE_KEY，主题背景贯穿内容区。`BrowserQuickFilter.ts` 通过 Core SearchNode AND 组合原搜索与状态，不破坏 OR 语义，保留分页、笔记 ID 和批量操作。默认副标题显示牌组与后端到期/新卡位置；筛选只影响展示。

统计摘要复用 TodayCounts.answerCount/answerMillis 与 Core FutureDue：已学为答题次数，待复习含 day≤0，逾期为 day<0，不含新卡且不应用每日学习上限。`StatsOverview.ts` 不自行调度；缺失数据保留未知态，小数预测平均值不错误显示为零。统计范围菜单注明历史，预测控件注明未来；口径解释放在帮助中。标题用屏幕居中 Stack，返回统一为文字“返回”。

统计年历保留 768vp 横向滚动和较大格子，未来日期保留透明占位；横向滚动条常驻显示（BarState.On），格子下方预留 12vp，滚动条宽 4vp。格子 key 包含日期和数量，换年后不会复用旧日期说明。日期与后端日桶换算保持原有实现。


## 浏览写入边界

`BrowserSelection.ts` 负责 cards/notes 解析、稳定去重和变更笔记类型 schema/映射快照；解析失败必须整批停止，不能将部分集合误当成完整选择。`BrowserOperationController.execute` 区分写入失败与写入后的刷新失败；后者保留写入成功结果，避免诱发重复提交。离页继续已接受写入，只广播数据变化；旧操作不能清理新选择。页面只提供服务调用、当前选择判断和 UI 效果。

直接行为验证在 `browser-operation-model.test.mjs`；页面接线与选择切换回归仍在 `page-operation-boundaries.test.mjs` 和 `browser-batch-runtime.test.mjs`。新增批量操作先扩展这里的行为测试，不要求业务规则仍写在页面里。

## 搜索与编辑入口

- `pages/添加笔记页.ets` 的普通字段支持各自添加多张图片、预览与移除，可创建纯图片正反面或图文问答。界面参照 [AnkiDroid 编辑页](https://docs.ankidroid.org/#adding-notes) 的字段旁媒体入口与顶栏保存，字段采用独立卡片；标签折叠、遮盖工具和填空按钮使用紧凑控件。
- `model/NoteImageDraft.ts` 负责字段快照、图片 HTML 与导入失败重试；`backend/NoteImageImport.ets` 按 provider 描述符异步读取，JPEG/PNG/GIF/WebP 保留原文件，其余可解码格式转 PNG。保存时先调用 Core 添加媒体，使用实际返回文件名再添加笔记；不把临时相册 URI 写入笔记。成功导入的文件名留在草稿，后续重试复用；移除/取消不主动删除媒体，避免误删 Core 去重后共用的文件，未引用媒体可经现有媒体检查清理。
- 选图取消不改草稿，类型切换/离页拒绝迟到的选图结果；已接受保存继续执行，成功广播刷新，离页后不再导航。`tools/tests/note-image-media.test.mjs` 覆盖图片正反面、混合文字、多图、重试、短读、格式转换与资源释放，以及页面选图/保存生命周期。真机图库、转换与学习显示需单独验收。

- `model/BrowserSearchSession.ts` 编排模式、列、搜索、暂停状态及首屏行；模式和列属于集合级配置，因此搜索与分页跨页面实例共用读队列。过期请求不会发布结果，失败行仍消费 ID 游标。
- `backend/AnkiBrowserSearch.ets` 只适配已有服务。行展示类型属于模型，表格不拥有查询协议。
- `model/BrowserSidebar.ts` 读取牌组、标签、已保存搜索与折叠偏好；缺失偏好分别降级，损坏的搜索项逐条过滤。页面以独立代次拒绝关闭/重开后的旧结果。
- `model/NoteEditorLoader.ts` 与 `backend/AnkiNoteEditor.ts` 共用于浏览和学习；每次 RPC 前后检查所属请求，字段名返回副本。写入仍分别经过 BrowserOperationController / StudySessionController。
- 新规则优先直接测试模型；`browser-presentation` 与 `page-operation-boundaries` 验证页面接线，`page-domain-models` / `page-repositories` 验证跨请求并发和解析。
