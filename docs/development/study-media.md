# 学习、预览与媒体

[返回任务索引](../../PROJECT_CONTEXT.md)

- 代码路径以下均相对 `entry/src/main/ets/`。
- 责任链：pages/学习页.ets → StudySessionController → StudySessionBackend → Anki Core；预览只读。
- 快速反馈：`npm test -- study / npm test -- media`；完整验收见 [验证说明](verification.md)。

## APKG 选择题

格式见 [选择题 APKG v1](../choice-apkg-v1.md)，制作流程见 [Agent 指南](../choice-authoring.md)。`JideChoice.ts` 负责源文件校验、版本标记、模板、精确集合判分和字段一致性；工具 `tools/choice-package.mjs` 复用它打包标准 APKG，应用不直接导入 JSON 或自定义后缀。`AnkiStudySessionBackend` 按字段名和 payload 版本识别题型，不依赖笔记类型显示名称，未知版本按普通卡处理。学习页接收 `StudySessionController` 的题型数据，2–10 个选项分左右两列；答对直接提交 Good，答错直接提交 Hard，不再次评分。“更多 → 自动前进”中的反馈停留时间属于本次学习会话，切题保留；提交后的右滑只切题，不重复写复习记录。回归入口是 `tools/tests/jide-choice.test.mjs` 和 `tools/tests/choice-package.test.mjs`。AnkiWeb 实际往返与真机交互须另行验收。

## 卡片文字显示

学习页沿用浏览、统计页的背景链路：`首页.ets` 在 Navigation 外持有唯一 `ThemeBackground`，学习页 NavDestination 透明；顶部条、卡片区外围及答案条订阅 `PAGE_SURFACE_KEY`（本页变量 `页面底色微染值`）。这个键在幻彩主题下是 `#00000000`，普通主题下才是微染底色，不能把它当作固定不透明色，也不能在卡片外边距或底部避让区写死 `surface_page`，否则主题背景只剩顶部可见。卡片本体由 ArkUI 圆角外壳和 `学习卡片HTML构建器.ts` 的 ArkWeb 文档组成，使用 `surface_card` 深浅表面；不要把选中态用的 `主色容器` 铺满正文。

学习页注册现有 `CustomTransition` 协议，首页统一先隐藏退出页、再淡入进入页，并冻结/恢复根背景；不在学习页复制背景或用禁用转场掩盖问题。转场运行验证见 `tools/tests/iridescent-rendering.test.mjs`，背景接线见 `tools/tests/study-flow-contract.test.mjs`。设备验收须比较卡片四周、答案按钮四周与顶部背景是否连续，并检查进入、返回、翻面；Node 测试及 HAP 编译不能证明实际视觉效果。

外观与语言中的 `CardTextSizeControl` 调整本机文字缩放（50%–200%，默认 100%）；`CardTextSizeStore` 启动恢复偏好，学习页和卡片预览通过 ArkWeb `textZoomRatio` 共用该值，不改模板或同步数据。设置内显示百分比和滑块。


## 卡片只读预览

全屏预览作为覆盖层时，根 Stack 必须有不透明 `surface_page` 底色并拦截命中，内部自行绘制 `ThemeBackground`，背景与内容整体转场。`PAGE_SURFACE_KEY` 在幻彩主题下为透明，只能用于已具备独立背景的内容区；不能用它替代覆盖层底色，否则首页的添加卡片、开始学习等控件会透出。不要恢复半透明的点击关闭遮罩，退出使用预览自己的关闭入口。

预览页移除底部重播音频按钮，和学习页一样从右上角“更多”操作。AI 改卡经 `onEditWithAgent` 传当前卡片 ID；首页与浏览页都进入 AiCardPage 的 edit 模式，配置检查后再次核对预览目标，返回时恢复当前索引并重新加载卡面。未配置时打开 AI 设置，不自动请求模型，不使用浏览页的批量选择或新建模式。回归在 `preview-runtime`。

学习页的首次教学和手动“学习说明”共用 `study_guide_message` 与 `glossary_shortcuts_help`，快捷键只描述 `StudyKeyAdapter` → `StudyInputPolicy` → 学习页实际处理的动作：Space/Enter、1–4、B、S、Delete、Ctrl+Z、Esc、R，明确普通闪卡与选择题限制。撤销菜单统一显示“撤销操作”。预览独立使用 `PreviewInteraction` 的左右方向键；电脑（deviceType 为 2in1/pc）显示“按左右方向键”，触屏设备保留滑动提示，不把学习评分键当作预览功能。

两页卡片外框共用 `model/CardViewportLayout.ts` 的窗口宽高策略，窗口尺寸变化和旋转会重新计算：竖屏最多 840vp；横屏按窗口宽度的 92% 放宽，下限受 840vp 和实际窗口约束，上限 1600vp。卡片高度使用剩余区域，字体不随外框拉伸，图片沿用 HTML 的等比约束。预览复用学习页卡片圆角、边框、阴影与不透明底色；只读预览不接入评分。牌组模板自身的正文 `max-width` 仍保留，调整外框不会改写导入的模板 CSS。验证见 `card-viewport-layout`、`preview-runtime` 与 `study-guide`。

学习与预览的本地 Web 媒体请求统一由 `utils/媒体响应助手.ets` 的 `interceptMediaRequest` 处理：GET/HEAD、单字节范围 206、不可满足范围 416，非法或多范围回退完整 200。整文件（含 `bytes=0-`）交 ArkWeb 文件描述符读取并关闭；局部范围异步读取，短读继续，提前 EOF 返回 500，响应就绪后才交付。所有页面不得再复制状态码/文件读取逻辑；原生 `[sound:]` 播放链与学习页焦点/快捷键行为保持原样。运行回归见 `tools/tests/media-response.test.mjs`，实际 ArkWeb 拖动仍需问题卡片真机验收。

`components/browser/卡片预览页.ets` 复用学习页的卡片渲染、离线公式、图片遮罩、文字缩放、音频焦点与 Sound/TTS 播放器，仅查询渲染服务，不调用调度器、不提交评分或学习日志。行为对齐 Anki 浏览页预览（`qt/aqt/browser/previewer.py`）：进入与切换卡片都从题目面开始，一次只加载一面（修改题目一侧用 `构建卡片HTML(...,'question')`、答案一侧用 `'answer'`；答案面自带模板的 `{{FrontSide}}`，所以不做两面拼接、不重复）；题目态点击卡片或“下一步”显示答案，答案态“下一步”才切下一张卡，答案态“上一步”回到题目；“上一步/下一步”在加载中或错误态直接切卡，保证坏卡可跳过。答案不在预览里收集输入，正反面都剥除拼写标记。进入预览时固定 ID 顺序，浏览页字段保存后保留当前卡，首页编辑返回恢复位置。顶部条两个入口统一为 关闭 / N/N / 更多（更多菜单内是编辑与 Agent 改卡）。加载、Web文档回调和音频分别用代次丢弃旧工作，编辑/后台时停止声音，组件销毁时释放播放器；浏览页编辑返回仅恢复重播入口，不自动续播。首页自动同步等待预览结束。`model/PreviewInteraction.ts` 在 Web 文档内判定：点击卡片发送翻面意图、左右滑发送下一步/上一步（单指、横向位移≥48px 且占优、1.2s 内、起点不在链接/媒体/表单/画布上）、方向键发送同一组动作；Web 组件上不挂 ArkUI 手势（ArkWeb 先消费触摸，SwipeGesture 收不到）；扩展动作须保持只读边界。相关运行验证在 `tools/tests/preview-runtime.test.mjs`。


## 牌组选项保存范围

牌组选项与高级设置使用 `components/home/DeckOptionField.ets` 的“名称＋当前值＋›”入口，数值、步骤、枚举和普通布尔字段在单项弹窗中编辑，选中项仅用背景色表示，不显示勾号。高级设置首页的“同时修改共用设置的 N 个牌组”直接使用行内 Switch，帮助按钮打开既有说明面板；切换只更新 `options.applyToSharedDecks` 草稿，忙碌时禁用，最终仍由主面板保存。单项弹窗持有本地草稿，取消不写入表单；确认前由 `model/DeckOptionValidation.ets` 在独立候选表单上复用既有校验，避免无效输入或其他字段的编辑状态被覆盖。字段帮助位于弹窗标题栏。高级分类点击后只展示对应分类，返回或完成回到分类目录。回归入口 `tools/tests/deck-option-dialog.test.mjs`。

牌组选项默认仅修改当前牌组。`model/DeckConfigSave.ts` 复制完整 protobuf 配置后比较实际修改；共享预设或默认预设（ID 1）有修改时，通过 ID 0 交由 Anki 原子创建并仅绑定当前牌组，独立预设继续复用原 ID。未修改、仅改牌组限额或全局开关不创建副本；取消和保存失败不污染原预设。高级设置的“同时修改共用设置的 N 个牌组”仅在共享时出现，每次打开默认关闭；全局 FSRS、新卡忽略复习上限、父级限额与健康检查集中在“全局设置（所有牌组）”。父子牌组学习时的限额聚合保持 Anki 语义。未来调整保存范围在该模型集中处理；行为测试见 `deck-config-save.test.mjs`。


## 卡片模板脚本与样式

学习和浏览预览共用 `model/学习卡片HTML构建器.ts`。默认配色、笔记类型 CSS、应用布局/媒体兜底分别包在独立 style 中，保持原有顺序；不能重新合并，部分 Anki 牌组在 CSS 字段用闭合标签嵌入脚本。`utils/CardAssetResponse.ets`（原 MathAssetResponse）统一映射固定的内置 jQuery 3.7.1/MathJax rawfile；未知内置域请求返回 404，其他域沿原媒体/网络逻辑。jQuery 必须先于模板脚本同步加载。新增内置脚本需同时更新固定映射、许可与浏览器回归；不要修改导入笔记类型原文来规避渲染问题。外部作者脚本依赖与实际验证边界见 docs/FEATURE_STATUS.md。


## 弹窗操作

学习页更多菜单将“编辑”固定为第一项，“自动前进”固定为最后一项，即使时间为 0 也可进入。`components/StudyAutoAdvanceDialog.ets` 复用 JideCards 的 `surface_card`、`应用尺寸` 与 `DialogHeader`，此弹窗按用户指定将公共操作栏放在底部：左“返回”、右“确定”。主界面为设置名称、当前值和箭头；二级为带选中态的单选列表。二级返回（含系统返回）丢弃当前待选值并回主界面，二级确定更新弹窗草稿并回主界面；主界面确定才应用到会话，主界面返回丢弃整个草稿。不要用连续 `showActionMenu` 代替具有返回层级和确认语义的设置弹窗。

`model/StudyAutoAdvanceDraft.ts` 唯一拥有草稿、层级和待选值；`StudyTiming.ts` 中的 `StudyAutoAdvanceSettings` 拥有已应用的会话覆盖值。未修改项继续读取当前卡牌组默认值，不改写或同步牌组选项。普通卡两项时间都关闭时，开关仍可尝试点击，但保持关闭并通过 `showToastSafely` 显示与 AI 未配置入口同款悬浮提示，正文用 `text_primary`；主弹窗不常驻提示，底部操作栏使用 `DialogHeader.showDivider=false` 去掉最下横线。至少设置一项时间后才能开启；选择题只显示反馈停留时间，关闭表示手动继续。现有非预设时长也必须出现在单选列表并保持选中。弹窗全程暂停两类计时，关闭时恢复；页面代次变化主动关闭，迟到确认不可写入或恢复计时。

回归入口 `tools/tests/study-auto-advance-settings.test.mjs`：直接测试草稿返回/确认、取消不写入、已存在覆盖值、非预设时长、迟到回调及反馈倒计时；文案调用真实 `UiFeedback.resourceText`，使用中英资源文件验证具体秒数，禁止用字符串拼接替身宣称格式化通过。设备验收须检查主界面→二级→返回/确定→主界面、系统返回、底部按钮及深浅色；Node 测试和 HAP 构建不替代视觉验收。

自定义弹窗通过 `components/common/DialogHeader.ets` 将确认、保存、完成固定在标题栏右侧，取消或关闭放左侧；左右操作区等宽，标题相对弹窗整体居中。主操作为透明底色文字按钮，文字跟随 `颜色键.动作主色`，保留调用方的忙碌与校验守卫。媒体管理的操作按未使用媒体和回收站分区排列，禁用按钮保留位置与清晰的灰色文字。系统原生确认框沿用平台布局。

学习页右上角更多菜单提供“编辑”，复用 `components/browser/浏览编辑区.ets` 修改当前笔记字段和标签。`model/NoteEditorSession.ts` 拥有读取代次、草稿可见性和写入输入快照；学习页仅适配当前会话的写入与刷新。编辑期间屏蔽学习快捷键及评分；字段读取完成前不挂载空编辑器；取消保留当前卡面并排除编辑耗时，保存保留撤销记录并通过既有加载流程重新获取队首、调度状态与题面。

学习页从其他页面返回时通过 NavDestination 的隐藏/显示回调标记并消费内容刷新，不依赖编辑入口是否发送 AI 专用通知。刷新复用完整加载链更新正反面、模板、拼写元数据和音频；同卡恢复原正反面，失效卡按后端新队首展示。加载或编辑中保留待刷新标记，刷新过程中新增变更完成后再次消费；失败进入可见错误态，禁止把旧题面当作最新内容继续评分。

学习加载和拼写翻面共用请求代次：切卡、编辑、隐藏/后台与销毁立即使旧工作失效；卡片身份、调度状态、HTML准备完成后一起提交。ArkWeb未挂载时缓存当前文档，attach后再显示和启动音频。新增学习操作应复用invalidateCardWork/isCurrentRequest，不让异步回调直接覆盖新卡。

学习与预览共用model/CardAudioSession.ts，负责取消旧音频解析、串行原生播放/清理、销毁后禁止播放。声音与TTS由卡片渲染服务.extractAudioTags一次RPC取得，旧的分开提取入口已删除；音频失败保留卡面和重播恢复。`model/StudyTimerController.ts` 只拥有普通计时与自动推进判定，页面继续拥有卡片、音频、编辑/引导阻塞事实以及评分写入；不为计时再引入状态框架。两个页面各自保留学习调度与只读预览规则。新增媒体入口应复用该会话，不直接调用两套播放器。


## 学习会话读写

`StudySessionController` 在每次读取等待后同时检查自身 disposal 与调用方请求代次；调用方遗漏生命周期判断也不能让旧读取继续渲染。完成信息读取同样受生命周期控制。

评分、撤销、笔记编辑、埋藏/暂停、删除和牌组恢复统一从会话入口提交。笔记身份/字段/标签在等待集合前复制，接受后的写入不会因离页撤回；后端完成才释放同步占用。`AnkiStudySessionBackend` 唯一映射到现有 Service，保持单卡删除、牌组级 unbury、笔记编辑保留撤销以及原始调度字节语义。删除确认还校验弹框时的卡片 ID 和请求代次。

`study-session-controller.test.mjs` 直接测试生命周期和输入；`study-autoplay-backend.test.mjs` 直接导入完整后端适配器，平台动态库替身遇到意外 RPC 会失败，不能用这些测试声称设备/NAPI 已通过。

媒体管理保留 AnkiDroid 式完整报告与连续滑动：没有上一页/下一页按钮、文件复选框或逐文件 ArkUI 行。`MediaMaintenanceSession` 拥有检查、清理、续读与原生快照令牌；面板只映射快照，滚动触底时追加下一个文本块，新的检查令牌也进入文本块 key，避免重查复用旧内容。已读块保留以支持向上滑动，前端内存随实际阅读量增长，不宣称恒定内存。

大响应边界：`proto/messages/MediaSnapshotMessages.ts` 对应 `native/rsharmony/src/media_snapshot.rs` 的应用扩展服务 1000；仍走三个既有 N-API 入口，不改变 Core 服务 41。原生端每个 backend 只持有一份检查快照，报告每次最多 16 KiB（优先按完整行、保证 UTF-8 边界），文件名每次最多 256 项。重查、关闭集合、关闭 backend 或显式 release 使旧令牌失效。移入回收站前重查引用，仅处理原快照中仍 unused 的文件，按 256 项调用原始 RPC；失败后旧令牌不可继续使用，需要重新检查。原生普通 RPC 的互斥仍保留，不能以性能优化为由并发访问集合。

`媒体服务.unusedFiles()` 为牌组删除差集按批读取文件名，避免顺带传输全报告与缺失笔记。完整 `检查媒体()` 仅保留为原始协议入口，UI 使用快照。Core 扫描/构造原始结果及原生快照仍为 O(集合规模)，当前优化限制跨桥与前端首次加载，不等于消除 Core 成本。

回归入口：`media-maintenance-session.test.mjs`（连续滚动、销毁、清理前同步检查）、`media-check.test.mjs`（原协议兼容）、Rust `media_snapshot::tests`（十万文件、UTF-8 完整性、有界输出、批量失败及真实 Core 检查/回收站）。真机仍需验证长报告上下滑动、重查后内容更新、清理期间离页及大集合内存峰值。

## 页面剩余职责边界

`StudyInputPolicy.ts` 将键盘事件映射为学习命令，`utils/StudyKeyAdapter.ets` 只映射 Kit 键码。编辑期间不触发学习操作；引导期间也清理松开的 Ctrl。`StudyAnswerRenderer.ts` 使用翻面时的字段/输入快照生成拼写答案，读取失败回退原答案，是否展示仍由学习会话代次决定。纯 HTML 构建器已使用 `.ts`，无需 ArkUI 即可直接测试。编辑生命周期共用 `NoteEditorSession.ts`，内部读取复用 `NoteEditorLoader.ts`；Web 控件装载、焦点和 UI 效果仍由页面负责，音频生命周期属于 `CardAudioSession`，普通计时资源属于 `StudyTimerController`，时长与动作计算仍复用 `StudyTiming`。
