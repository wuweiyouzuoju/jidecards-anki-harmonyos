# 基础编辑对接交接（2026-09-29）

本文保留首次交接及同日续接记录。当前进度以文末“同日可视编辑与文案反馈（最新进度）”及最终验证记录优先；前面的未通过项是首次交接时的历史事实。

## 工作环境和边界

- 主仓库：`D:\Projects\jidecards`；参考源码：`D:\Projects\AnkiDroid`。
- 前期审计：`D:\Projects\jidecards-editing-compat-audit-2026-09-28.md`。
- 开始前读取 AGENTS.md、PROJECT_CONTEXT.md、ArkTS 适配规则及 entry/tools 路径规则、任务契约和验证说明；使用 ArkTS 技能。
- 工作树原本就有大量未提交改动和未跟踪文件，包含其他任务及 2.9.1 工作。不要 reset、clean、批量覆盖或把全部差异当成本任务。
- 首次交接时未提交、未发布、未安装；同日旧版基础编辑已覆盖安装，最新可视编辑尚未安装。禁止卸载或清数据，设备安装必须保留现有身份并使用 install -r。
- 采用公共组件和局部修复；没有授权全量重写。首次交接时按用户要求停止；同日续接继续在此范围修复与验证。

## 已落盘的本轮实现

1. 新增 `model/NoteFieldEditing.ts`、`components/common/NoteFieldEditor.ets`：统一新增、浏览编辑、学习编辑字段工具。支持选区粗体、斜体、下划线、换行、行内数学、挖空新编号/沿用编号；编号扫描全部字段；保留原有 HTML。仍是 HTML 源文本编辑，不是所见即所得编辑器。
2. `components/browser/浏览编辑区.ets` 接入图片选择和待保存附件；浏览页、学习页负责调用已有图片导入能力再写笔记。文本保存不经过媒体导入。附件重试复用导入文件名。
3. `utils/ConfirmNoteDiscard.ets` 和草稿比较支持退出保护；新增页面退出/切换类型以及浏览/学习编辑返回经确认处理。父页面通过 backRequest 通知编辑区，由编辑区决定关闭。
4. `proto/messages/NotetypeMessages.ts` 解析 originalStockKind；`backend/笔记类型服务.ts` 新增获取编辑笔记类型，读取 Core 的 clozeFieldOrds 和 imageOcclusionFields；创建适配器和已有笔记加载器接入结构信息，避免依赖类型名称判断能力。
5. `model/NotetypeFieldDraft.ts` 与设置笔记类型编辑器修复字段身份：移动或删除字段保留旧 ord，以数组顺序表示新顺序；新增字段 ord:null；按旧 ord 保留元数据，序列化失败不再悄悄返回旧数据。
6. `backend/AnkiNoteCreation.ets` 图片遮罩新增改为获取 Core 字段索引、导入媒体、调用普通添加笔记并显式传入 deckId；不再依赖 Core current_deck 和旧临时文件路径。`model/NoteCreationSession.ts` 同步传递 deckId。
7. 图片遮罩编辑器新增 initialMasks，新增页面再次打开时保留已有遮罩。未实现已有 IO 笔记的完整图形化往返编辑。
8. base/en_US 添加编辑工具和放弃草稿文案；新测试 `tools/tests/note-editing-basics.test.mjs` 覆盖字段工具、字段身份、结构解码、退出确认、媒体重试和 IO 创建适配器。

主要文件还包括：`backend/AnkiNoteEditor.ts`、`model/NoteEditorLoader.ts`、`model/NoteEditorSession.ts`、`pages/添加笔记页.ets`、`pages/浏览页.ets`、`pages/学习页.ets`。

## 最新验证事实

- `npm run build:app` 已成功完成增量 HAP 构建，日志 `.local/editing-build.log`，accepted warnings=268，unexpected=0。不是最终 clean 构建。
- 新增基础编辑回归 8 项通过。
- 收尾时使用仓库要求的 TypeScript hook 复核 8 个相关测试文件：178 项中 173 通过、5 失败。日志 `.local/editing-handoff-tests.log`。
- 执行命令：

```powershell
node --experimental-transform-types --import ./tools/tests/register-ts-hook.mjs --test tools/tests/note-editing-basics.test.mjs tools/tests/browser-flow-contract.test.mjs tools/tests/note-creation-session.test.mjs tools/tests/page-operation-boundaries.test.mjs tools/tests/study-content-refresh.test.mjs tools/tests/study-note-editor.test.mjs tools/tests/ui-dialog-layout.test.mjs tools/tests/ai-agent-entry-contract.test.mjs
```

- 之前一次全量测试未通过，日志 `.local/editing-tests.log`，其中部分失败已修正；不能拿旧日志宣称现在的全量结果。尚未重跑全量 `npm test` 和 `npm run verify`，未做真机验证，也未做真实 Core IO 新增回归。

## 接手先完成这 5 项失败的核对

1. `browser-flow-contract.test.mjs:156`：旧源码断言要求获取笔记类型，现在调用获取编辑笔记类型。先补或确认结构能力读取行为覆盖，再调整契约。
2. 同文件 `:192`：旧 onSave 两参数接口，现在第三参数是 NoteFieldImage[]。保持组件不直接写 Core 的边界断言，验证附件交给父层保存。
3. `note-creation-session.test.mjs:53`：旧测试加载已移除的 IO 临时文件读写路径。改为验证新媒体导入和显式 deckId 的成功/失败行为；保留短读、格式转换和资源释放覆盖（已有 note-image-media 测试可核查复用）。不能只删测试。
4. `study-note-editor.test.mjs:78`：返回键旧预期立即关闭，现在通知编辑区确认。应验证 backRequest、确认后的 closeNoteEditor，以及不保存、不改变卡面/调度、编辑时间排除。
5. `ui-dialog-layout.test.mjs:21`：同类浏览返回键旧预期立即关闭。验证编辑区优先、确认前不关闭底层预览、确认后关闭编辑区。

## 后续验证与风险检查

- 检查草稿确认期间按钮/选择器忙态、切换类型取消后的选择显示、异步回调退出后不回写。
- 检查学习编辑媒体导入与保存的资源占用边界，防止和同步/其他写入竞争。
- 确认 Core 真正支持该通用 add-note 路径新增 IO，并验证生成卡片及目标牌组。当前新测试对此使用服务 mock，不是真 Core 证明。可在 native/rsharmony 增加或复用主机集成测试；先读 native 规则，不必为了测试重构原生层。
- 如增加 Core 测试，可同时验证保留旧 ord 的字段移动/删除后笔记内容映射；前端已有序列化行为测试。
- 更新公共组件 README 和对应领域文档，清理过时 c1-c5 注释及确实不用的辅助函数。资源文件格式变化可能较多，避免覆盖其他任务文案。
- 交付前按本任务路径重跑 npm run impact，再完成全量 npm test、npm run verify（包含 clean HAP、原生检查等，以仓库当前工具为准）。报告实际结果。
- 真机检查输入选区和光标、中文输入、HTML 保真、插图成功/失败重试、放弃草稿、浏览/学习返回、类型改名后挖空/IO识别、IO指定牌组。

## 不在当前完成范围内

本节记录 2026-09-29 的范围：当时已有 IO 图形化编辑、ellipse/polygon/text 完整遮罩渲染、草稿预览及重复策略均未完成。后续状态以本文件后续记录和 [当前领域文档](browser-stats.md) 为准；2026-10-02 重复处理与字段查重见其专节。不要将上述基础实现宣传为全面兼容 AnkiDroid。


## 同日续接验证（2026-09-29）

### 本轮变更

- 修复首次交接列出的 5 项旧测试契约，并补齐直接行为覆盖；全量时另修正新增页帮助返回测试。测试不再假定返回立即丢弃草稿或 IO 必须经过临时文件。
- 浏览/学习编辑确认期间阻止新图片选择；新增页统一确认/选图期间的禁用态，IO 选图持有忙态，销毁后不回写。取消类型切换通过 Select 重建恢复原类型，同时保留字段、标签与附件。
- `StudySessionController.saveNote` 在集合可用后执行媒体准备，再更新笔记；导图、落盘到离页收尾共用写入保护。文本路径不导入媒体。
- 去除已失效的 IO cacheDir 输入及新增页名称判断辅助方法/注释。更新公共组件索引、browser-stats、study-media 和 ownership。
- 新增 `native/rsharmony/tests/note_editing.rs`，使用内存隔离集合执行锁定 Core；不碰用户集合。验证普通 add-note 创建 IO 的显式目标牌组、c1/c6 卡序与当前牌组保持；字段身份重排、删除、新增及卡片 ID 保持。
- 参考本地 AnkiDroid `ImageOcclusionViewModel.kt` 的 selectedDeckIdFlow 和 Core `image_occlusion/imagedata.rs`；本应用用普通 add-note 的显式 deckId，避免临时修改全局当前牌组。

### 验证事实

- 相关回归 190/190 通过；新增类型取消与帮助返回回归 20/20 通过。
- 完整 `npm run verify` 的 repository 阶段：1591/1591 Node 测试通过。
- 同次 native 阶段：fmt/clippy、15 项 Rust 测试（包括新增 2 项真实 Core 编辑测试）通过；RPC 索引校验通过。
- 完整 `npm run verify` 最终退出码 0：双架构原生库、clean 签名 HAP 构建通过，警告门禁 accepted=268、unexpected=0。日志入口为 `.local/editing-verify.log`，日志本身不随源码导出。
- 已用 `hdc -t 127.0.0.1:5555 install -r entry/build/default/outputs/default/entry-default-signed.hap` 覆盖安装，force-stop 后启动成功；没有卸载或清数据。
- 仅验证了应用启动、创建独立空牌组 `CodexEditingCheck0929`、进入添加卡片页并看到共用字段工具栏，尚未保存测试笔记。用户明确表示“实际交互我来操作”，因此已停止设备自动操作并保留该页面供用户验收。
- 选区/光标、中文输入、HTML 往返、类型切换取消、图片导入/失败重试、浏览/学习返回确认、IO 实际建卡与目标牌组等交互验收由用户执行；不得把主机测试或安装成功计作这些场景通过。
- 当前 `hdc list targets` 仅有 `127.0.0.1:5555`，产品型号为 emulator；模拟器验收不计作物理真机验证。


### 工具栏拖动反馈（同日后续）

用户截图指出挖空字段工具栏横向拖动容易误触、灰色滚动条难操作。公共 NoteFieldEditor 改为 Flex 自动换行，按钮 flexShrink(0)，去除横向 Scroll；所有三个编辑入口同步生效。按钮尺寸与父层安全区保持原责任边界。此变更后的构建验证单独记录，不沿用上一次 HAP 结论；实际交互继续由用户操作。


## 同日可视编辑与文案反馈（最新进度）

本节替代最初“仍是 HTML 源文本输入”的功能状态。用户提出格式按钮点亮后持续输入、选区仅修改选中内容，以及首次学习、帮助/标题和可选反向卡改进。

- `NoteFieldEditor` 改用原生 RichEditor；加粗、斜体、下划线、荧光即时显示，按钮控制组合输入状态。有选区时只修改选中文字，不切换输入状态。Enter/换行均存为 `<br>`；公式/挖空仍插入标记、学习卡面渲染。
- `NoteRichText.ts` 仅解释基础文字标签；媒体、未知标签/属性或无法解释的内容保留源码模式，提供源码/可视切换。未修改字段不会因打开编辑器被重写。复杂导入内容暂不承诺可视编辑。
- 每种工具首次点击弹出简短学习提示，本次不改草稿；关闭/返回后再次点执行，`NoteEditingHints` 在本机保存已读，三个入口共享，读写失败可见。
- `NoteTypePresentation` 检查标准可选双向模板的实际引用，只转换确定的开关字段，改名/重排可识别，自定义模板不覆盖其文本字段；新增、浏览、学习均接入。显示别名“问答题（可选双向）”不重命名数据库；新增关闭只建正向卡，编辑关闭不删除已有卡片/历史，界面指向“查找空卡”。
- 删除单独图片说明行；笔记类型帮助改为当前界面的中文名称与操作。公共 DialogHeader 的标题采用独立中央层，修复缺少左侧按钮时的偏移；帮助、首次提示和几何原则写入 `in-app-help.md`、`appearance.md` 和公共组件索引。
- 本地 AnkiDroid 参考入口 `AnkiDroid/src/main/java/com/ichi2/anki/noteeditor/Toolbar.kt` 的 setupStandardButtons：加粗等包裹 HTML 标签、公式包裹 MathJax 分隔符；它不是本轮的“点亮后持续可视输入”交互。
- 直接测试 `tools/tests/note-rich-editor.test.mjs` 覆盖往返/实体/组合样式、选区与输入状态、首次提示/保存失败、标准开关识别及加载保存生命周期。真实 Core 回归加入反向卡生成与关闭后保留现有卡片身份。

验证中的事实：首次增量 HAP 通过（accepted=268、unexpected=0）；相关 26 项回归通过。全量 Node 首轮 1600/1601，唯一失败是既有测试对两条未变文案的 JSON 单行排版断言，已恢复原排版后重新执行完整 verify。最终验证结果在下方补充。

设备边界：用户明确“实际交互我来操作”。本次可视编辑版本尚未覆盖安装，未点击、重启或清理正在操作的设备；实际中文输入/选区/按钮状态/提示与键盘焦点、深浅色、窄宽屏及保存后重开仍待用户验收。


### 本轮原生构建诊断

完整 verify 的默认 Rust 增量构建两次出现 E0463（找不到 anki crate），详细 cargo test 另捕获 rustc STATUS_STACK_BUFFER_OVERRUN。独立编辑 Core 测试可通过，但不能替代完整门禁。关闭增量缓存并降低并发后，完整主机阶段通过：16 项 Rust 测试、fmt/clippy 及 RPC 索引均通过。没有更换锁定工具链或修改上游业务；本次复现/验证命令如下，环境只在当前构建进程生效：

```powershell
$env:CARGO_INCREMENTAL = '0'
$env:CARGO_BUILD_JOBS = '2'
npm run verify
```

资源重新排版后再次执行 `npm run verify -- repo`，1601/1601 通过，日志 `.local/editing-rich-final-repo.log`。最终 HAP 结果以 `.local/editing-rich-verify.log` 为准。


### 19:54 用户截图：居中修复仍不足

用户实际截图显示“斜体”标题仍偏左。此前独立 Stack 仅居中了自定义组件外层宽度槽位，`HelpLabel` 内部 Row 未占满，仍按内容宽度靠左。此前几何测试只验证中央槽位，不能代表内部文字居中；已承认并修正报告。

根据本机 HarmonyOS 官方文档“创建自定义组件 → 通用属性”：调用方样式作用于自定义组件外部不可见容器。公共 HelpLabel 现在仅在 centered=true 时使内部 Row width=100%，再通过 justifyContent Center 居中文字组；普通左对齐字段帮助保持内容宽度。所有 DialogHeader 调用共享此修正，`ui-help-entry.test.mjs` 加入内部宽度约束检查。最终视觉仍需用户确认；本轮仅读取设备布局，未代用户点击。


### 随后补齐的提示与验证范围

- 四种格式提示明确区分“直接点按钮持续输入”和“长按文字、拖动选区两端后仅修改选中内容”。源码模式使用独立说明，不承诺常亮或即时样式。可视“换行”替换选区，与回车一致；公式和挖空仍包裹选区。
- 公式提示覆盖内置 MathJax/mhchem 的关系、数学/化学示例、英文半角和成对括号、行内与独立成行、编辑代码与学习/预览排版；它不自动计算或配平。已有 MathML/旧 LaTeX 媒体兼容路径保持不变。
- `tools/test-math-rendering-browser.mjs` 加入真实编辑器 HTML 序列化后的分数和化学式，三种明暗/正反面场景全部通过，无公式错误、无意外网络请求。日志 `.local/editing-math-browser.log`；它是独立的无头浏览器测试，不操作用户设备。
- 全应用帮助调用点/资源做了界面术语复核，清理查找替换里固定 Front/Back 指引及统计/术语中的多余英文；实际搜索语法、标签、FSRS/SM-2 名称保留。详细范围见 `in-app-help.md`，不等于全量设备交互验收。
- 居中内部 Row 修正后的最终完整验证日志为 `.local/editing-final-verify.log`；此前 `.local/editing-rich-verify.log` 已通过的 clean HAP 不包含最终全部修正，不能混作最终证据。


## 19:58 长笔记类型名称反馈

用户截图显示原生 Select 的 auto 宽度被长名称撑开，覆盖左侧标签和帮助入口。公共 SelectStyle 增加行内最大宽度和单行尾部省略；所有使用 fieldWidth 的调用点接入共享约束，所有原生 Select 接入共享 TextModifier。只限制展示，不修改选项名称、ID 或实际选择。ui-select-layout 测试检查所有调用点，防止只修添加笔记页。SDK 明确 textModifier 不支持在 attributeModifier 内调用，因此在各 Select 链上声明，字体与省略规则仍由公共入口持有。实际设备显示待用户操作验收。

最终验证：关闭 Rust 增量并限制并发为 2 后，完整 `npm run verify` 通过（日志 `.local/editing-select-verify.log`）：1602 项 Node、16 项 Rust、RPC 检查、双架构原生库及 clean 签名 HAP 均通过，警告 accepted=268、unexpected=0。产物 `entry/build/default/outputs/default/entry-default-signed.hap` 包含内部标题居中和最新下拉框限宽省略；尚未覆盖安装或代用户点击，最终设备视觉与交互继续由用户验收。


## 2026-09-30 独立编辑页与工具样式（当前续接）

用户批准将编辑改成与新增对应的独立页面。EditNotePage 经 HomeDestinations 注册；首页预览直接进入，不再绕到浏览页。浏览/学习只传 ID，编辑页通过 NoteEditorSession 读取，复用 BrowserOperationController 的集合保护执行 AnkiNoteUpdate（导图+更新、撤销保留）。保存成功仅页面 pop，表单不再触发取消，防止二次返回。失败保留草稿和图片文件名；离页仍完成已接受写入和广播。

NoteEditorHeader、NoteFieldCard 统一新增和编辑的标题、字段卡片、图片入口与附件；旧“浏览编辑区”路径现为全屏表单。工具栏源码按钮接入同一 builder，横纵间距固定 8vp，状态不改变尺寸。提示改为次要灰色“输入〈字段名〉”。2026-10-02 按用户反馈取消挖空的自动灰底，移除装饰范围计算与输入后样式补写；挖空原标记和组号按普通文本显示，显式荧光仍保留。当前行为见 [编辑格式](appearance.md#编辑格式的交互规范)。

验证入口：editor-page.test.mjs（保存/同步占用/离页/重试/读失败及嵌套挖空文本）、note-rich-editor（无自动背景、显式荧光和挖空标记保真）、study-note-editor（导航/取消计时/快捷键）、study-content-refresh（返回卡面）、page-operation-boundaries（返回保留查询/分页、取消不刷新、禁止滚动分页抢占刷新）。editor-page 已纳入 browser/study 领域筛选。用户继续自行操作设备，设备验收独立记录。

完整 `npm run verify` 通过，继续采用上述 CARGO_INCREMENTAL=0、CARGO_BUILD_JOBS=2：1609 项 Node、16 项 Rust 主机测试、fmt/clippy、RPC 索引、双架构原生库及 clean 签名 HAP 全部通过，accepted=268、unexpected=0（`.local/editor-page-verify.log`）。补充两项浏览返回行为回归后，全部仓库测试为 1611 项通过（`.local/editor-page-final-repo.log`）；其后仅完善测试筛选与交接记录，最终仓库重验见 `.local/editor-page-delivery-repo.log`。`git diff --check` 通过。HAP 内 module.json 核实为 com.jide.kapian、2.9.6、2960，产物仍为 `entry/build/default/outputs/default/entry-default-signed.hap`。

真机待用户验收：三个入口均进入完整编辑页；标题居中，源码与同排/换排按钮左边距一致；点亮按钮保持间距；长按拖动选区应用格式；中文输入及撤销正常；深浅色、窄宽屏和键盘遮挡；保存仅返回一层、取消确认、失败后重试、浏览滚动位置和学习计时。主机回归未模拟 ArkUI 真实布局，不作为上述视觉验收完成的依据。

### 随后用户反馈：模式切换了，按钮文案没有切换

`tool` 的 `label` 是 @Builder 按值参数。调用方的 sourceMode 条件已改变输入区，但按钮仍保留初次 label。公共实现改为在 Button 表达式内直接读取 sourceMode；调用方只传静态默认文字，按钮样式和间距继续共用。检查此工具栏全部调用，只有源码/可视编辑为动态文字，其他参数为固定资源；颜色和启用状态已在 builder 内读取状态。规则补入 appearance.md。

note-rich-editor 新增回归固定初始 builder 参数，执行真实标签表达式，验证“源码→可视编辑→源码”，同时覆盖其他工具标签与复杂 HTML 无法返回可视编辑时保留文案；不改写未编辑内容。领域 13 项、全仓库 1612 项已通过。完整 `npm run verify` 通过（`.local/editor-label-verify.log`）：16 项 Rust 主机测试、fmt/clippy、RPC、双架构原生库与 clean 签名 HAP，accepted=268、unexpected=0。另外检查 SDK 生成的 NoteFieldEditor.ts，Button.createWithLabel 已在 observeComponentCreation2 更新回调内直接读取 this.sourceMode。版本仍为 2.9.6/2960，产物路径不变。用户保留真机操作权，未安装或点击；交接记录补齐后的仓库复验日志为 `.local/editor-label-delivery-repo.log`。
