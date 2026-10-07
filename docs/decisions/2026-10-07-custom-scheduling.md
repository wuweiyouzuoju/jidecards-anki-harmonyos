# 自定义调度的执行边界

目标是执行已有 Anki 集合级调度脚本，并让按钮间隔与评分使用同一份候选状态。协议和算法仍来自 `UPSTREAM.lock` 锁定的 Core。Anki 26.05 的调用契约见 [answering.ts](https://github.com/ankitects/anki/blob/26.05/ts/reviewer/answering.ts)：脚本接收 `states`、各档独立的 `customData` 与 `ctx`，执行后将自定义数据放入评分状态。

## 责任入口

- [CustomScheduling](../../entry/src/main/ets/model/CustomScheduling.ts) 拥有调用包装、UTF-8 上限及 UI/JIDE 共用能力声明。
- [CustomSchedulingService](../../entry/src/main/ets/backend/CustomSchedulingService.ts) 拥有 prepare → 脚本执行 → 校验结果的唯一编排；[NativeSchedulingScript](../../entry/src/main/ets/backend/NativeSchedulingScript.ets) 只适配现有沙箱，不获取 Agent 工具或写入权限。
- [custom_scheduling.rs](../../native/rsharmony/src/custom_scheduling.rs) 拥有应用服务 1004 和唯一状态/JSON转换。它按锁定协议公开字段，拒绝未知 JSON 字段、非法类型、多个 oneof 分支、越界数值、修改 current 和不合法 customData。仅替换修改的已知字段，其余状态字段与嵌套未知字段保留原始字节。当前状态始终原样提交。
- [StudySessionController](../../entry/src/main/ets/model/StudySessionController.ts) 在每卡真实取队列和选项后执行脚本，成功才采用结果并生成按钮标签。迟到结果不能修改新代次卡片。失败保留 Core 原始候选，评分前必须确认本次会话对相同脚本采用标准调度；脚本变化重新执行。
- [DeckConfigSave](../../entry/src/main/ets/model/DeckConfigSave.ts) 保持唯一保存事务。未编辑脚本保留原值；手动编辑与清空修改集合级脚本，适用于所有预设。UI 使用多行编辑；JIDE 读取配置状态和执行限制，现有写入工具继续拒绝脚本修改。

## 选择与限制

复用有燃料、3 秒时限和内存限制的 QuickJS/Wasm 沙箱，避免在卡面 WebView 执行集合脚本导致不受限执行或混用页面桥接。脚本最大 60000 UTF-8 字节，留出可信包装空间。输入在沙箱中冻结，包装为脚本创建可变副本；`ctx.seed` 从完整 uint64 字符串恢复为 BigInt。当前支持同步 JavaScript，不提供 DOM、网络或 await，不宣称与 AnkiDroid 的异步 WebView 环境完全等价。运行失败、沙箱忙碌、超限及结果校验失败都进入明确确认，不静默回退。

状态 oneof 的前端原始透传不变量继续有效。允许的修改只发生在原生服务中，按字段叠加脚本结果，不在 ArkTS 重新编码状态树。这是脚本功能的边界，不是另写调度算法。升级 Core 时必须重新核对该服务 schema，不能只更改版本声明。

## 与 AnkiDroid 的代码对照（2026-10-07）

本轮读取本地 AnkiDroid 源码快照：`AnkiDroid/build.gradle` 声明 2.25.0beta1，`gradle/libs.versions.toml` 锁定 `0.1.68-anki26.05`；目录不含 Git 元数据，不把它当作已确认的发布版或已知提交。旧 Reviewer 与新 ReviewerViewModel 两条链均已核对。共享 JS 契约以官方 [Anki 26.05 answering.ts](https://github.com/ankitects/anki/blob/26.05/ts/reviewer/answering.ts) 为准，Android 入口参照 [ReviewerViewModel](https://github.com/ankidroid/Anki-Android/blob/main/AnkiDroid/src/main/java/com/ichi2/anki/ui/windows/reviewer/ReviewerViewModel.kt)、[Reviewer](https://github.com/ankidroid/Anki-Android/blob/main/AnkiDroid/src/main/java/com/ichi2/anki/Reviewer.kt) 和 [Scheduler](https://github.com/ankidroid/Anki-Android/blob/main/libanki/src/main/java/com/ichi2/anki/libanki/sched/Scheduler.kt)。这些 main 链接是后续查找入口，不是本地快照的固定提交。

| 边界 | AnkiDroid | jidecards 当前实现 |
| --- | --- | --- |
| 输入与自定义数据 | 将卡片 customData 注入 current；共享 JS 分别解析四档数据、执行后各自打包 | 同样输入 `states/customData/ctx`，四档数据独立；seed 从原始 uint64 恢复为 BigInt |
| 状态与评分 | 接收 JS 转换后的 protobuf；间隔标签和评分都读取修改后的候选，评分由 Core 执行 | 同样使用修改后的候选生成标签和提交评分；原生按字段补丁保留 current 与未修改字段 |
| 执行时机与环境 | 题面加载后在 WebView 调用 async 函数；翻面和评分等待完成通知 | 完整卡片快照发布前执行独立同步沙箱；成功或明确确认回退后才显示卡片 |
| 异步与限额 | 支持 await、计时器和卡面浏览器环境；本地 Android 测试含 5 秒异步延迟 | 不提供 DOM、网络和计时器；拒绝 await/返回 Promise；3 秒、燃料、内存及 60000 字节脚本限制 |
| 失败策略 | 旧入口记录错误并解除等待；新入口通过 finally 通知完成，失败前未替换的候选仍保留；下一张仍运行脚本 | 显示错误；用户确认后本会话对同一脚本跳过执行，改脚本或重新进入后再执行 |
| JSON 兼容与校验 | 上游 SchedulingStates.fromJson 做 ProtoJSON 转换，Core 在评分时校验选中的 customData | 原生预先校验 current 与全部候选的结构、数值、自定义数据；标量不接受数字字符串或 null |

因此当前是有明确边界的同步脚本子集。除异步外，也存在同步写法差异，例如 `states.good.normal.review.scheduledDays = "123"` 可被上游 ProtoJSON 转成数值，本机原生校验会拒绝；标量设为 null 的清空语义也未兼容。上游转换规则来自 Anki 26.05 锁定的 [protobuf-es 1.10.0 JSON 实现](https://github.com/bufbuild/protobuf-es/blob/v1.10.0/packages/protobuf/src/private/json-format.ts)，版本见 [yarn.lock](https://github.com/ankitects/anki/blob/26.05/yarn.lock)。修改 current 在本机提前拒绝；Android 不在该 JS 接收入口做同样比较，但 Core 仍会检查当前状态是否匹配，不能据此认为任意改 current 都可评分。

Android 的既有实际用例将 good 设为 123 天、易度 3.0、customData.c 从 1 加到 2；本机脚本 fixture 和已通过的真实 Core 落库/撤销回归覆盖同一核心结果。Android 的慢脚本、进程恢复和 WebView 测试本轮仅阅读源码，没有执行 APK 或跨端设备互通；静态对照不扩大此前验收范围。本轮仅补充对照结论，不调整产品执行契约。

## 直接验证入口

- `npm test -- study`：实际会话的四档评分、标签一致性、失败确认、脚本变化、离页/旧读取；脚本包装、UTF-8 限额和原生宿主适配。
- `cargo test -p jidecards_core --lib custom_scheduling --locked`：原生状态字段保真、完整随机种子、普通/过滤结构、非法结果及旧状态保护。
- `cargo test -p jidecards_core --features anki-core --test custom_scheduling --locked`：真实 Core 在普通/过滤牌组保存 123 天、易度 3.0 和 customData，并撤销恢复。
- `cargo test --manifest-path native/agent-sandbox/Cargo.toml --test custom_scheduling --locked`：真实 QuickJS 执行同一包装 fixture，拒绝语法/运行错误，并限制死循环。fixture 与 TypeScript 包装直接比较，防止测试采用另一套脚本调用。
- `npm run verify`：集成验收的全量测试、双架构原生库和 clean 签名 HAP。设备交互及已有用户脚本的兼容性仍需实际验证，不能由主机或构建结果推断。

## 2026-10-07 验收范围

自定义调度的脚本、协议、会话、编辑/清空与 JIDE 能力直接回归通过；未编辑的超长旧脚本也有保存保真回归。`build-native.ps1 -Target host-test` 的 fmt/clippy 和真实 Core 测试、`build-agent-sandbox.ps1 -Target host` 的真实引擎测试及 RPC 索引校验通过。`build-app.ps1 -Clean -ArtifactDirectory .local/custom-scheduling-20261007` 完成双架构原生编译与签名 HAP，构建警告检查无新增警告；包与构建证据保存在该忽略目录。

初次完整 `verify` 在仓库阶段遇到两个失败，同日后续已修复：[ai-agent-page-awareness 测试](../../tools/tests/ai-agent-page-awareness.test.mjs) 注入真实 `deckOptionDefaultValues`，并验证 Core 默认值与当前预设分开投影；[common-boundary 测试](../../tools/tests/common-boundary.test.mjs) 将无 IO、无业务依赖的 HelpLayout 登记为公共 UI 几何工具，保留业务依赖、平台 IO 和旧组件新依赖的拒绝断言。`npm run verify -- repo` 全量仓库验收通过。本次仅调整测试与验收记录，复用上述原生、沙箱、RPC 和双架构 clean 签名 HAP 结果；完整 `verify` 命令未重新执行。

本轮未安装设备，未验证真实用户脚本的跨客户端同步、实际按钮交互或错误弹窗布局。同步 JavaScript 以外的脚本仍属于兼容性缺口。
