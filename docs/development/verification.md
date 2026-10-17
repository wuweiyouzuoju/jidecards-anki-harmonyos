# 验证与工具入口

[返回任务索引](../../PROJECT_CONTEXT.md) · [工具目录](../../tools/README.md)

## 环境与命令

Node 24.x 与 `package.json` / CI 一致。首次准备或 lockfile 变化后运行 `npm ci`；新对话不重复安装依赖或诊断已可用环境。
`npm test` 先检查 Node 版本与实际类型转换能力，再自动发现全部测试，不靠手写完整文件名单。

| 命令 | 能证明什么 | 不能替代什么 |
| --- | --- | --- |
| `npm test -- --list` | 当前可选领域及测试文件数 | 测试执行 |
| `npm test -- home`（或 study/sync/browser/media/agent/ui/tooling/repo） | 受影响领域的局部验证 | 未覆盖领域、编译、真机 |
| `npm test` | 全部 Node 行为与静态约束测试 | ArkTS 类型检查、Kit/ArkUI 实际行为 |
| `npm run test:cards:browser` | 真实浏览器中的生产卡片会话、初次/翻面显示上下文等价、模板脚本/配色、状态和公式；CI 独立门禁 | ArkWeb、HAP、设备、任意第三方联网服务；依赖/浏览器前提见[工具入口](../../tools/README.md) |
| `npm run test:interop` | 锁定 Core 的隔离 APKG/COLPKG、ID/历史/未知配置、取消及进程恢复；生成样本和报告，见[核心互通](core-interop.md) | Android/HarmonyOS 设备、Anki 桌面 GUI、真实在线同步 |
| `node --experimental-transform-types --import ./tools/tests/register-ts-hook.mjs tools/audit-settings-core.mjs` | 临时集合中的生产牌组选项/预设、限额、FSRS、过滤牌组和图表偏好；0 为列出范围通过、1 为复现问题、2 为执行异常，见[设置审查](settings-integration-audit-2026-10-11.md) | HAP、ArkUI/设备、在线同步；需要锁定 Rust/Core 依赖 |
| `npm run verify -- repo` | 可移植仓库门禁，CI 使用同一入口 | Rust、HAP、设备 |
| `npm run doctor` | 本机工具链与版本诊断 | 实际构建、签名可用性 |
| `npm run verify -- native` | 环境、全部 Node、Rust fmt/clippy 门禁和真实 Core 主机测试 | HAP 与设备 |
| `npm run verify` | 环境、全部 Node、Rust 主机、双架构 Rust 与签名 HAP 构建 | 设备交互验收 |
| `npm run build:app` | 当前配置的完整应用构建 | 行为测试 |
| `npm run test:release` | 源码导出安全性、字节保真、签名配置合并与脱敏回归 | 已生成副本自身的完整验证 |

领域筛选是按任务选择的验证，不是完整依赖影响分析。也可直接执行受影响测试文件：`node --experimental-transform-types --import ./tools/tests/register-ts-hook.mjs --test tools/tests/<名称>.test.mjs`。`all` 总从磁盘发现测试；新增测试无须登记进完整清单。
增加新的业务领域或代表性测试名称时调整 `tools/test-suites.mjs`。既有混合行为/静态测试逐步按真实改动迁移，不靠文件名声称全部是 runtime 测试。

`platform-module-harness.mjs` 可注入平台依赖执行 `.ets` 模块或组件的真实非渲染逻辑；组件装饰器与 build 被去除，因此不证明 ArkUI 观察、Prop 更新或布局行为。不要在测试中重新实现会话规则，也不能用该 harness 代替 HAP 和设备验证。

### 启动渲染编译产物检查

首次入门的回归入口为 [check-home-intro-compiled.mjs](../../tools/check-home-intro-compiled.mjs)。HAP 构建后，从仓库根运行 `node tools/check-home-intro-compiled.mjs entry/build/default/cache/default/default@CompileArkTS/esmodule/release/entry/src/main/ets/components/HomeIntroPanel.ts`（debug 包相应替换目录）。需要 Node 24 和本次构建留下的 CompileArkTS 产物；不接受 `.ets` 源码，不依赖旧的入门已读记录。

工具执行真实编译后的 `HomeIntroPanel` / `HomeIntroSection` 及其 BuilderParam 回调，只替换外部组件与平台边界；原始声明式 `Text()` 返回 `undefined`，未转换的 `.fontSize` 链会直接失败。移除幻彩宣传后应渲染五个分组和 13 个 Text 节点；分组或节点缺失、执行异常、产物不存在均非零退出，成功输出文件路径、SHA-256 与渲染计数。工具自身反例在 `home-intro-compiled.test.mjs`，进入 home 测试；它不验证字节码执行、布局、重渲染、原生库或真机兼容性，也不能单独认证上架包。

### 同步服务器编译产物检查

HAP 构建后运行 `node tools/check-sync-server-compiled.mjs entry/build/default/cache/default/default@CompileArkTS/esmodule/release/entry/src/main/ets/components/settings/同步分组.ts`，debug 包替换目录。需要 Node 24 和本次 CompileArkTS 输出，不接受 `.ets` 源码；产物不存在、绑定不是父状态引用或运行异常均非零退出，成功输出路径、SHA-256 与覆盖计数。

工具执行编译后的分组/弹窗构造、渲染与真实业务方法。平台替身严格执行状态 get/set/订阅与销毁契约，旧产物传字符串时会在 `addSubscriber` 立即失败；五个字段须连接父状态，输入和错误须到达表单。覆盖地址校验、持久化失败、保存中禁用与关闭守卫、取消/重开、已登录保护，以及销毁后的地址保存、登录、自动同步确认/写入和原生关闭回调。验证环境为每次检查创建真实 `AgentOperationHosts`，凭证平台替身使用当前 `saveSyncCredentialsVerified` / `loadVisibleSyncAuth` 契约，避免沿用已不再调用的旧保存函数。自身反例在 `sync-server-compiled.test.mjs`，进入 sync 测试；全应用构造位置扫描在 `arkts-component-fields.test.mjs`。替身不模拟 ArkUI 的观察调度、动画、布局、网络或真实存储，工具也不执行字节码；设备上的手机/平板完整操作仍需独立验收。

原生弹窗统一后，工具同时执行当前 `NativeDialogHost` 源逻辑；DialogFrame 平台替身只转发编译后的 header/content 插槽，确保真实表单仍渲染和接线，不证明公共外壳布局。`native-dialog-host.test.mjs` 进入 ui 筛选，独立执行公共窗口生命周期、失败与迟到回调，并扫描字段工厂、公共配置和布局。动效档位变更仍执行 `motion-style-surfaces.test.mjs`；这些检查均需配合本次 HAP 和设备验收。

`ui-help-entry.test.mjs` 的旧版导入帮助、牌组选项帮助与兑换说明执行真实 `NativeDialogHost` 和调用方字段工厂，只替换系统窗口及内容渲染。生命周期回归检查忙碌保护、帮助先于编辑器关闭、重复销毁、重新出现和旧内容回调隔离；窗口配置检查实际工厂输出与公共 `presentation()` 一致，不要求调用方重复配置字面量。牌组选项的本地草稿和确认边界继续由 `deck-option-dialog.test.mjs` 验证；上述主机检查不证明 ArkUI 布局和设备窗口行为。

`verify` 按阶段打印 environment/repository/native/sandbox/rpc-index/protocol-core/hap，失败立即非零退出。结束报告必须写明执行的模式，repo 成功不等于整个应用验证完成。

### 媒体管理编译产物检查

HAP 构建后运行 `node --experimental-transform-types --import ./tools/tests/register-ts-hook.mjs tools/check-note-media-compiled.mjs <本次编译的NoteFieldCard.ts> <本次编译的NoteMediaDialog.ts>`。例如两个输入均位于 `entry/build/default/cache/default/default@CompileArkTS/esmodule/debug/entry/src/main/ets/components/editor/`；release 包替换目录。需要 Node24、本次 HAP 的 CompileArkTS 输出及现有 TS 加载 hook。输入缺失、不是编译组件或关闭行为失败均非零退出，成功报告两份输入路径、SHA-256 及场景/窗口计数。

工具执行编译后的真实字段工厂、媒体组件、DialogFrame/Header 插槽和 NativeDialogHost，平台替身不会替编译器注入 controller。覆盖图片/音频、空/有新附件、×/完成/遮罩/系统返回、忙碌拒绝、重开及宿主解锁。旧无参 `setController()` 依赖必须重现无法退出；工具反例在 `note-media-compiled.test.mjs`，进入 media 测试。该入口不执行字节码，不模拟 ArkUI 观察调度、布局、动画、选择器或录音；仍须设备验收。

制卡书画接入后，工具另执行当前编译产物中的编辑器父子回调，检查返回只取消书画、同一媒体窗口保留、完成移交图片和旧编辑回调隔离。书画替身只消费真实回调，不证明 SDK 书写、源文件加载或栅格合成；这些源逻辑回归在 `note-drawing.test.mjs`，设备范围见[制卡图片书画](browser-stats.md#制卡图片书画2026-10-09)。

## 开发可维护性门禁

- `tools/tests/architecture-boundaries.test.mjs` 自动发现应用 `.ts/.ets`，检查字面量导入/再导出的可解析性、依赖环、UI 反向依赖、纯模型平台隔离及应用内 Agent 工具到确认执行器的传递依赖。含故意破坏边界的测试样例；它不是完整解析器，不分析计算型加载、方法能力或运行时数据流。
- `tools/tests/documentation-contract.test.mjs` 自动发现根入口、`.agents/`、`docs/`（历史计划除外）和应用目录中的 Markdown，检查相对文件链接与本地 Markdown 章节锚点；按仓库使用的 ATX/Setext 标题及 HTML 锚点识别目标，排除围栏代码示例，覆盖同名标题编号、Unicode 与格式标记。核对当前规则入口、发布配置、归档标识及失效知识入口；不是完整 Markdown 渲染器，不验证外网内容或所有自然语言语义。
- 两者均进入完整 `npm test` / `verify`。新增边界先补能失败的反例，新增领域规则同时维护 [责任表](ownership.md)，不以“源码出现了类名”证明行为正确。

公共 UI 另有 `tools/tests/common-boundary.test.mjs`：扫描 common 的字面量直接依赖，禁止新增业务/平台 IO 依赖，逐条保留既有迁移例外并拒绝失效例外；公开 `.ets` 必须在 common README 有文件链接，内部实现可标 `@internal`。用 `npm test -- repo` 或单独执行该测试；环境与完整测试一致，不依赖设备。它不分析计算型导入、传递平台能力或渲染效果，完整依赖和编译仍由 architecture/HAP 验证。

CI 在无本地 `tmp/` 和 `third_party/` 的干净检出上运行。测试临时文件使用系统临时目录，外部依赖文档使用锁定提交的公开链接；不可变协议对照快照由 `.gitattributes` 保留原始字节，官网缓存摘要的 CSS 与脚本统一使用 LF。修复跨平台差异时保留快照清单和行为断言，不通过刷新历史哈希或跳过完整检查消除失败。

## RPC 协议门禁

统一入口为 [Core 协议生成](core-protocol.md)。`node tools/core-protocol.mjs --check` 重新用官方 `anki_proto_gen::get_services` 导出锁定描述快照，核对源归档指纹、schema 和全部 ArkTS/Rust/C++ 产物。生成使用 `--generate`；导入官方描述使用 `--refresh <独立官方锁定checkout>`，要求 origin、HEAD 与锁文件一致且工作树完全干净。日常源码归档无需 Git，不能借用父仓库 HEAD。

`tools/rpc-index-methods.json` 只绑定领域别名与语义方法名；`rpc-index-baseline.json` 来自官方 helper 分派信息。`node tools/verify-rpc-index.mjs` 核对完整生成及既有索引；传入显式 `backend.rs` 只作额外对照，不从构建缓存提取协议事实。旧 `--generate backend.rs` 已拒绝，不能拿旧缓存或本机改稿刷新官方基线。

升级前保存旧 schema，审查 `core-protocol.mjs --diff <旧schema> <新schema>` 的接口、字段、类型、默认、optional/oneof/枚举差异，再执行领域旧／新对照、真实 Core 和完整门禁。源指纹与生成检查不代表本次编译过 Core；ArkTS/HAP、远端 CI、设备及在线行为是独立证据。保留原锁定版本及构建入口列出的全部已跟踪 Core 补丁。

## HAP 警告门禁

`build-app.ps1` 保存本次 Hvigor 原始输出到 `.hvigor/last-build.log`，签名检查后调用 `tools/verify-build-warnings.mjs`。诊断按相对文件路径、完整消息和次数核对 `tools/build-warning-baseline.json`；未知格式、新增文件/消息或次数增加均返回非零，报告写入 `.hvigor/build-warning-report.json`。不读取追加的历史日志，也不修改依赖缓存或关闭编译检查。

构建入口先清空上次日志并将报告置为 `not-run`；检查器写入 `passed` 或 `failed`，签名/原生/编译提前失败不会沿用旧的成功报告。

`build-app.ps1` 在任何产物或日志改动前取得按仓库目录区分的 Windows 命名互斥锁，覆盖原生构建、clean、签名及警告核验。共享工作树中的其他脚本构建等待最多 10 分钟，超时失败；异常和进程退出释放锁，不删除他人的产物。它不冻结源码，也不能约束直接绕过该入口启动的 IDE/Hvigor 构建；并行改码仍需在最终联合验收前稳定工作树。

- `npm run build:app` 是日常增量构建，只验证本次出现的警告，不证明全项目无新增警告。原生输入未变、目标架构库与输入匹配时可加 `-SkipRust`；否则使用普通构建。`-SkipRust` 仍检查小型沙箱库，不跳过签名或警告检查。需要体验时可用 `-Architecture arm64` 或 `x64` 指定目标，完整验收保留双架构。
- `npm run build:app -- -Clean` 清理 HAP 构建缓存后验证，用于完整验收、构建配置/SDK 升级或具体缓存异常；日常小改动不自动 clean。完整 `npm run verify` 继续强制此模式，并保留双架构 Rust 构建及签名检查。
- `node tools/verify-build-warnings.mjs .hvigor/last-build.log --require-clean` 可复核当前日志；仅重放日志不代表源码再次构建过。缺失成功标记、多次构建拼接或缺少 clean 标记均失败。
- 基线仅允许已审查的 ibest-ui 2.2.7 声明、资源合并、缺少 sourceMapsPath，以及后端客户端导入处的一条 SDK NAPI 暂不支持校验提示。release 模式另接受一次 SDK 混淆建议的精确原文：`entry/build-profile.json5` 已明确为保留可读崩溃堆栈关闭混淆，AGPL 源码公开；消息改变或次数增加仍失败。保留图片裁剪功能和依赖是用户明确选择，不允许将项目异常警告加入基线。
- 基线中的资源合并还必须逐键比较依赖原文件与本次合并产物：缺少键或值不同仍失败，不能用相同警告文本掩盖真实覆盖。
- 依赖实际安装版本、锁文件选中的版本和完整性、目标 SDK 必须匹配。升级后先完整编译并检查差异，人工审查/更新基线和原因，再完整验证；没有自动接纳新警告的选项。完整构建中减少或消失的旧项会提示复查移除。

业务异常使用真实处理边界或明确的 `@throws` 契约，并追到最终调用方；不能给 UI 生命周期批量加标签掩盖未处理拒绝。共享 UI 反馈边界见 `entry/src/main/ets/utils/UiFeedback.ets`：资源缺失显示明确键名并记录日志，Toast 失败不得推翻已完成的写入。相关回归使用真实 helper，不复制业务实现。

Node 24 测试使用内置 TypeScript 转换，运行时可能输出 `ExperimentalWarning`；这是测试工具链提示，不是 HAP 诊断，不关闭全部 Node warning，也不计入上述 HAP 基线。

## 按变更路径选择验证

日常任务选择最少必要检查，按实际 diff、调用关系和变更性质升级；模型等级、新对话和文件数量不是全量验收的触发条件。
领域文档中的历史全量验收记录不构成每次修改的执行要求；专项命令仅在影响对应边界时选择。本节统一决定日常验证强度。

| 改动性质 | 默认检查 | 升级条件 |
| --- | --- | --- |
| 文案、图标、颜色、简单间距（cosmetic） | 检查相关资源语法、引用和效果；字符串运行 i18n 契约，文档运行文档契约 | 同时改变回调、状态或业务时增加相应行为测试；新增编译边界时补增量 HAP |
| 局部行为（behavior） | 运行受影响测试文件或领域测试，核对公共实现的相关调用 | 原生/协议、广泛集成或持久化格式变化按边界升级 |
| 新类型、组件、导入或平台 API（compile） | 相关测试与一次增量 HAP | 原生库输入不确定时不用 `-SkipRust`；构建输入/SDK 升级做完整验收 |
| 原生核心或沙箱 | 受影响真实行为测试与必要 fmt/clippy；主机入口见目录规则 | FFI、RPC 编码、上游锁定协议升级或 HAP 集成补对应检查 |
| 大范围集成、依赖/SDK 升级、正式发布（integration/release） | 一次完整 `npm run verify`，含 clean、双架构与签名 | 设备交互另行记录 |

纯资源/样式任务不默认全量 Node、Rust、HAP、环境诊断或设备安装。小改动不新增锁死措辞、方法位置或等价语法的测试；真实 bug 和新行为的回归应能抓住故障。检查失败后定位受影响入口，不借任务扩大无关修复。
需要用户安装体验或确认编译兼容性时才打包；设备操作遵循用户的操作权约定。新资源仍需检查格式与所有引用，路径建议不代替实际审查。

已通过检查的相关源码、测试、依赖、配置和工具链输入未变时复用结果，简短注明命令及适用范围；无法确认输入一致时重跑受影响检查。没有自动缓存认证，旧日志或同名 HAP 文件本身不能证明可复用。补充文档只补文档检查，不重跑业务或构建；完整 verify 已包含的检查不在收尾重复执行。
多个对话共享目录时用 `--paths` 检查本任务及受影响公共入口；其他任务的原生改动会影响库是否可复用。一批改动稳定后集中完整验收一次，不要求各对话都做一遍；发布前需验收实际联合工作树。
共享验证失败按[多 Agent 协作](coding-agent.md#多-agent-协作)归因并交接；构建成功的要求不授予修改其他任务实现或掩盖失败的权限。

| 变更路径 | 必读入口 | 快速验证 | 完成验证 |
| --- | --- | --- | --- |
| `entry/` 页面、组件、模型或应用内 Agent | `.agents/rules/paths/entry.md`、对应领域文档 | 资源检查或受影响领域测试 | 按性质选择局部验证、增量 HAP 或完整验收；设备行为单独记录 |
| `native/`、FFI 或上游接口 | `.agents/rules/paths/native.md` | 受影响 Core/沙箱主机测试 | 原生业务不附带全部 Node；桥接、协议及升级补集成 |
| `tools/`、测试发现或 CI | `.agents/rules/paths/tools.md` | 对应工具测试 | 实际执行受影响命令；完整构建入口变更补集成 |
| `docs/`、`.agents/`、决策或规则 | `.agents/rules/paths/docs.md` | 文档契约检查 | `node --test tools/tests/documentation-contract.test.mjs`；其他已运行检查包含此项时不重复 |
| 多个区域 | 所有匹配规则 | 合并受影响检查 | 不因跨目录自动全量；大范围集成或高影响边界升级 |

这张表提供默认范围，仍需审查实际依赖和行为。局部验证不声称全库通过；未执行范围简短记录，普通任务不强制另建计划或交接文件。

### 自动生成变更计划

`tools/change-impact.mjs` 的 `PATH_RULES` 是机器路径匹配的唯一实现，表格只概括最低要求。

- `npm run impact`：读取当前 Git 暂存、未暂存和未忽略的新文件；删除和重命名的旧、新路径均纳入。不会读取文件正文或执行测试、安装、发布。
- `npm run impact -- --base main`：在上述范围外，加入 `main` 与当前 HEAD 的共同祖先之后的分支改动。不执行 fetch，基线 ref 必须在本地存在。
- `npm run impact -- --json`：输出结构化计划。机器直接解析 stdout 时使用 `node tools/change-impact.mjs --json`，避开 npm 的命令标题。
- `npm run impact -- --json --paths tools/change-impact.mjs tools/tests/change-impact.test.mjs`：仅分析指定的仓库相对路径，使用正斜杠；适用于共享工作树或无 Git 的导出副本。`--paths` 后均为路径，不与 `--base` 合用。
- `npm run impact -- --kind cosmetic --paths entry/src/main/ets/components/StudyGuideDialog.ets`：经实际 diff 审查确认仅文案/样式时，选择局部资源/引用检查，不自动领域测试或 HAP。资源字符串和文档仍保留相应契约；原生、桥接和构建输入检查不会被 cosmetic 降级。
- `--kind behavior` 选择相关领域测试；`--kind compile` 额外建议一次增量 HAP；`--kind integration` / `release` 选择完整 verify。默认 `auto` 将仅文档、字符串/颜色和常用图片资源识别为 cosmetic，其余按 behavior 路由；脚本不读取正文推断语义，页面内的小样式需主动指定 kind。选项必须放在 `--paths` 前。

计划合并相关领域；`requiredCommands` 是所选范围，`changeKind` 和 `validationMode` 说明性质与级别，普通 entry 不再强制完整构建。构建/依赖、协议与 FFI 输入保守建议完整 verify；原生普通路径建议主机检查。未知路径列入 `unknownPaths`，要求明确所有权、调用关系并选择检查，不仅因未归类就自动全量。没有适合的现成命令不等于无需检查。领域推荐来自路径命名和测试筛选，不是传递依赖分析。

卡片文档的 `CardReviewerRuntime`、`CardWebSession`、`CardWebBuffer`、HTML 构建器及其浏览器工具/上游配色样本由 `card-web` 规则补充选择 media 回归和 `npm run test:cards:browser`；行为变更不能仅因路径未含 Study/Render 而遗漏真实浏览器检查。显式 cosmetic 分类仍由开发者审查实际影响后选择，不自动运行浏览器。

退出码 0 只说明计划成功生成，`verificationStatus` 始终为 `not-run`；Git、参数错误返回非零。实际通过与否由 `verify` 的退出码及任务报告证明。设备范围、责任归属和长期决策的语义完整性仍需审查，工具不会声称已自动检查。

## 源码导出

`npm run export:source -- <新目录>` 从当前 Git 工作树导出已跟踪和未被忽略的源码文件，包含未提交修改、新文件、文档、Agent 说明和测试；不需要提交或上传。

- 输出必须是父目录已经存在的新目录。拒绝源目录、子目录、祖先、已有目录，以及解析 junction/symlink 后重叠的路径；不删除或覆盖已有目录。
- 代码、注释和第三方资源保留原始字节。只有 `build-profile.json5` 通过 JSON5 解析后清空已知签名字符串字段并重新序列化，格式化会移除该配置的注释；解析或字段类型不匹配会停止。
- 忽略的构建产物、本机依赖、`tools/experimental/` 和 `.local/` 不导出；`.local/` 即使误被跟踪也排除，其余被跟踪文件不会仅因后来写入 ignore 而消失。导出用于本地验证，不自动发布。
- 在输出目录运行 `npm ci`、`npm run verify -- repo`。要构建 HAP，按 README 准备锁定 Anki checkout 和本机签名；不复制签名身份材料。
- 中途文件系统错误可能留下不完整的新目录；命令返回失败，选另一个新目录重试。不要把失败副本当作可交付产物。

旧文件名 `strip-for-release.mjs` 现在只表示历史工具入口，不再剥离注释。正常 HAP 构建直接使用开发工程，不经源码导出。

## 设备验收

仅覆盖安装 `hdc -t <connect-key> install -r <signed-hap>`，然后 force-stop / 启动当前包。禁止 uninstall 清数据。
本轮改首页任务协调时，检查：启动公告/入门顺序，以及开屏和菜单的直链入口均隐藏；设置手动同步返回首页；忙碌时外部 APKG 排队；前后台与离页后不冒出迟到弹窗。
实际账户网络同步和用户文件导入需使用适当测试数据；没执行的场景单独报告。构建和安装成功不证明这些交互通过。

主机测试：已有 VS/MSVC 时直接使用锁定 Rust；存在 `JIDECARDS_TOOLCHAINS` 或 `work/toolchains` 时沿用 bundled GNU/Zig。doctor 检查相应依赖，最终仍以真实测试和链接结果为准。

锁定 Anki checkout 还需执行 `git -C third_party/anki submodule update --init --depth 1 -- ftl/core-repo ftl/qt-repo`，提供 Core 构建所需的翻译。`build-native.ps1` 在干净源码上先应用受版本控制的补丁，重复运行不再应用；真实补丁冲突必须停止。Windows PowerShell 的这些分支由 `build-native-wrapper.test.mjs` 执行临时源码验证。

签名材料由 [签名说明](signing.md) 定义。`build-app.ps1` 构建前检查本机配置/文件，构建后拒绝缺少 signingConfig 或缺失 signed HAP 的结果；Hvigor 的普通 BUILD SUCCESSFUL 不能独自作为签名构建成功证据。

设备回归还覆盖：浏览批量操作中切换选择与离页；学习编辑、删除确认、埋藏/恢复后返回；AI 批量保存中离页、连续保存与附件解析。未连接设备时明确记为未执行。


## Core 集成、生成索引与定期 HAP

- `node tools/core-protocol.mjs --generate|--check` 管理全部协议产物；`generate-rpc-index.mjs` 是兼容委托入口。事实来源、官方刷新、字段差异及生产迁移证据见 [Core 协议生成](core-protocol.md)。
- `node tools/test-anki-core.mjs` 是 CI 与本地共用的真实 Core 入口：校验锁定输入、准备翻译子模块、幂等应用已跟踪补丁，运行 `cargo test -p jidecards_core --features anki-core --locked`。独立 checkout 核对提交；源码归档核对协议指纹，不能错误借用父仓库 HEAD。Windows 原生工具链仍可用 `build-native.ps1 -Target host-test`。
- `.github/workflows/ci.yml` 的 Rust 作业增加上述 Core 入口，覆盖实际集合/媒体/取消行为；远端执行结果需另行查看，不以本地通过冒充。
- `.github/workflows/hap.yml` 每周和手动运行 `npm run verify`，需要带 `jidecards-deveco` 标签的 Windows 自托管 runner。Runner 必须预置锁定 SDK、Rust/Anki 及本机签名配置。`clean: false` 保留这些不受版本控制的本机依赖。工作流只运行可信默认分支，不接入 PR 的签名主机执行；配置文件存在不代表 runner 已注册或定时任务已运行。

`npm test -- ui` 按文件名自动包含所有 `ui-*.test.mjs`，避免新增 UI 门禁遗漏；tooling.test 直接验证发现结果。圆角属性顺序门禁为 `ui-surface-border.test.mjs`，扫描器入口是 `tools/arkui-border-order.mjs`，覆盖连续属性链中的多行参数和中间属性；这是源码级检查，设备外观与键盘操作仍单独验收。
