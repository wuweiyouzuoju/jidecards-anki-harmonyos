# 应用内 Agent 本地代码沙箱：方案与接手入口

状态：纯计算工具 `execute_code` 已接入 Agent、NAPI 与双架构 HAP；2026-10-01 已在 arm64 真机通过完整桥接行为验收。当前实现入口是 [native/agent-sandbox](../../native/agent-sandbox/README.md)。下方早期方案和第一阶段记录保留为历史，当前范围及限制以“应用集成与真机验收”节为准；不宣称全部上线门禁已完成。

[应用内 Agent](../development/agent.md) · [当前设计](../agent-2-design.md) · [决策索引](README.md) · [项目入口](../../PROJECT_CONTEXT.md)

## 目标与已明确的范围

- 坚持编程 Agent-first：后续开发 Agent 能快速定位、局部修改、直接测试并交接；应用内 Agent 获得更强能力时，不能增加跨层隐含状态。
- 用户明确希望探索代码执行沙箱及更多工具，并且暂时只考虑本地执行。这里的“容器”指受限代码执行环境，不要求 Docker；模型推理仍使用现有 Provider，不等于部署本地大模型。
- 可以评估为执行引擎增加包体；没有约定具体包体、内存、耗时上限，不能把估计当作测量结果。
- 保留现有应用内 Agent 主干及 Anki Core，不整套内置或替换为 DeepSeek Harness。引擎作为新增执行能力，不替换应用框架、调度引擎或锁定协议。
- Claude Code 公开沙箱实现和 DeepSeek Harness 是设计参考，不是可以直接用于鸿蒙的兼容性证明。
- 最初讨论仅交付文档；后续已实现随 HAP 集成的纯计算工具与锁定依赖，尚未完成全部发布验收。

## 候选引擎与选择条件

首选验证组合：**QuickJS-NG 编译为 WebAssembly，由本地 Rust 层的 wasmi 执行**。

模型生成 JavaScript 源码；随包发布的受信 QuickJS-NG Wasm 模块解释源码；wasmi 提供外层 Wasm 执行边界与燃料计量。只接受源码作为模型输入，不接受模型提供的 QuickJS 字节码、原生库或任意 Wasm 模块。

选择理由是已有 Rust 基础、JavaScript 适合字段和结构化数据处理、wasmi 面向嵌入式并采用解释执行。首轮已验证锁定组合的主机执行、鸿蒙双架构链接与 x86_64 模拟器执行；**arm64 真机、HAP 增量及正式集成的资源约束仍未验证。** QuickJS 的 Wasm 构建产物、导入项、wasmi 支持的指令及宿主 ABI 必须匹配；不能直接把 quickjs-emscripten 的 npm 包视为 ArkTS 库。

| 方案 | 定位与代价 |
| --- | --- |
| QuickJS-NG + wasmi | 首选原型；隔离边界明确，但有双层解释开销和桥接适配成本 |
| 原生 QuickJS-NG | 可作为性能比较基线；同进程内的引擎内存限制不等于完整隔离 |
| 本地 Monty Python 沙箱 | 备选研究；需要单独核对 Python 能力、运行方式及鸿蒙适配，不代表完整 CPython/第三方包生态 |

先选择一种语言完成闭环。若首选方案不能通过构建或性能门，应记录实际证据和替代取舍，再更新本决策，不提前搭建多引擎框架。

## 拟采用的责任边界

```text
现有 AgentRunner
  -> 代码执行工具
  -> 本地沙箱（源码、冻结输入、资源预算）
  -> 受控工具入口（每次调用重新校验）
  -> 现有 Registry / Scope / 读取及提案工具
  -> 结构化结果或 ChangeDraft / 辅助动作提案

现有页面确认入口
  -> DraftExecutor / ActionExecutor
  -> Service -> Anki Core
```

以上新增名称描述责任，不是已经存在的类或冻结的文件布局。落地时沿现有入口做最小扩展。

| 责任 | 唯一拥有者与约束 |
| --- | --- |
| 模型请求、续接和暂停 | 现有会话控制器；沙箱不建立第二套对话状态 |
| 一次脚本运行 | 沙箱执行任务拥有实例、取消信号、输出和资源额度；终态后释放实例 |
| 工具可见性与执行权限 | 当前工具目录、Registry 和 Scope；直接调用与脚本内部调用共用规则 |
| 卡库读写状态 | 现有 Service 与执行器；沙箱不能持有 collection、裸 RPC、SQLite 或原生句柄 |
| 用户确认 | 现有确认协议；ChangeDraft 与辅助动作两套协议继续各自负责，不混用令牌 |
| 历史与产物 | 现有历史协调器；如新增产物存储，由宿主拥有 ID、配额与清理，不把任意路径暴露给脚本 |

第一阶段采用一次运行、明确输入输出的执行模型，不保存解释器堆或活跃调用栈。脚本返回提案后结束；确认与后续任务由会话继续。导出用于诊断的代码、输入或工具结果须脱敏、有界；测试重放使用固定输入和模拟工具结果，不重放实际写入。

### 必须落实的运行约束

- 首版只开放纯计算；受控读取及提案分阶段接入。沙箱不取得 API 密钥、确认令牌、默认文件系统、网络、shell 或任意动态模块加载能力。
- Worker/后台线程用于避免阻塞 UI，不作为安全隔离证明。Wasm 隔离也不能替代宿主桥接参数和权限校验。
- 资源约束覆盖源码大小、编译/初始化、Wasm 内存、引擎堆、宿主复制与序列化、输出量、指令燃料、总耗时及工具调用数。引擎堆限制不等于进程 RSS 限制，燃料也不等于墙钟超时。
- 原生宿主调用不会自动被 Wasm 燃料限制：每个调用仍要限量、有界处理并响应取消，避免大结果或阻塞桥接绕过预算。
- 一次代码执行内部的每次工具调用都计入任务预算和审计；每次校验 schema、工具可用性、Scope、目标 ID 和结果大小。
- 确认令牌只在既有 UI/执行器边界消费。代码可以提出修改，不能自行批准；恢复不能自动重跑结果未知的动作。
- 取消需明确区分脚本停止、读取终止与已经接受的写入；已经接受的写入仍遵循现有生命周期规则，不声称取消即回滚。
- 首版按需创建单个执行实例。OOM、燃料耗尽或终止后销毁实例，不能把半失败状态当作可恢复会话。

## 更多工具如何扩展

优先覆盖真实闪卡任务：字段清洗和变换、精确去重、批量计算、导入材料分段读取、草稿候选生成。已有检索、统计和提案工具继续复用，不因增加代码执行重新实现卡库业务。

初期保留直接 function calling：普通制卡不强制写程序。批量计算需要时才使用代码执行工具。较大中间结果留在宿主控制的会话产物中，向模型返回摘要与产物 ID；材料读取授权与清理策略跟随会话明确设计。

工具元数据集中维护名称、schema、示例、风险与独占一轮要求，业务 handler 留在各领域模块。工具集合增长后再按证据引入工具发现；一次模型请求和对应调用批次使用冻结的可用工具集合，工具发现结果在下一请求边界生效。发现工具不自动获得数据权限；新的 Scope 限制仍须在执行时检查。

## 现有实现观察与修改顺序

以下为本次源码审查观察，接手时要对当前工作树复核。它们不是已修复问题，也不是要求先完成全部重构。

| 观察 | 当前入口 | 建议处理 |
| --- | --- | --- |
| 通过中文前缀识别草稿上下文、通过输出子串定位待续接调用 | [AgentSessionController](../../entry/src/main/ets/backend/agent/AgentSessionController.ets) | 显式传递上下文类型、等待原因与 callId；提示文案不再充当协议 |
| 会话裁剪与工具输出压缩不是严格总量上限 | [AgentSessionState](../../entry/src/main/ets/model/agent/AgentSessionState.ts)、[AgentProviderContext](../../entry/src/main/ets/model/agent/AgentProviderContext.ts) | 统一发送前预算入口，计入指令/schema/参数/结果，保留调用配对；字符额度不能冒充 token 计数 |
| 风险声明及独占一轮的工具名分散 | [AgentToolCatalog](../../entry/src/main/ets/model/agent/AgentToolCatalog.ts)、[AgentPolicy](../../entry/src/main/ets/model/agent/AgentPolicy.ts)、[AgentRunner](../../entry/src/main/ets/backend/agent/AgentRunner.ets) | 目录提供必要元数据，直接调用和沙箱桥接共用，避免新增工具漏改 |
| 页面仍构造请求并参与业务编排；部分异步路径校验 ID 后仍使用旧索引 | [AI制卡页](../../entry/src/main/ets/pages/AI制卡页.ets) | 在相关路径修改时收回编排责任，按稳定 ID 重新定位后更新 |
| 检查点同步 IO、JSON 断言读取 | [AgentCheckpointStore](../../entry/src/main/ets/backend/agent/AgentCheckpointStore.ets)、[AgentHistoryCoordinator](../../entry/src/main/ets/model/agent/AgentHistoryCoordinator.ts) | 扩展前明确格式版本与校验；大快照 IO 先测量，不凭推测重写 |

预算观察的最小复现：构造一个仅含 200001 个字符的用户消息，依次调用 `boundAgentSessionInput(input, 180000)` 和 `compactAgentToolOutputs(input, 160000)`，结果仍为 200001 字符。本次实际调用函数确认过；这证明函数层面的边界缺口，不等于已在 UI 或真实 Provider 上复现请求失败。

本次曾执行 Agent 聚焦测试并通过，但已有测试通过不能证明沙箱已具备任何能力。后续对话必须对当时工作树重跑，不沿用本次结果作为交付依据。

### 推荐实施阶段与退出条件

1. **固定契约并验证引擎。** 对照下方一手资料，锁定候选版本与许可；先完成纯计算原型和鸿蒙双架构构建。测量新增 HAP 大小、初始化、峰值内存、代表任务耗时、取消响应。验证失败时保留证据并调整选型。
2. **接入纯计算工具。** 从已有工具入口提供执行能力，冻结输入，返回有界结构化结果。补真实引擎测试；不以 mock 引擎通过代替运行验证。
3. **开放受控读取。** 通过统一工具入口接入已有读取能力，验证 Scope、调用预算、稳定工具集合、取消与页面生命周期。先明确同步/异步桥接及线程约束，不能假设 Wasm 导入可以直接调用 ArkTS Promise。
4. **开放提案与可选产物。** 复用现有草稿校验与确认执行器；大产物按需增加。补暂停、确认、冲突、历史恢复与重复调用回归。
5. **按真实需求扩工具。** 新增工具有目录、handler、直接行为测试和文档入口；根据工具选择错误与上下文开销决定是否引入发现机制。

会话、预算和工具元数据的重构穿插在依赖它们的阶段进行；不先改造整套 Agent，也不预建远端后端、插件市场、多语言执行框架或全局事件总线。

## 验证与接手说明

先读根 [AGENTS.md](../../AGENTS.md)、[项目入口](../../PROJECT_CONTEXT.md)、[任务契约](../development/task-contract.md) 和受影响路径规则。项目工作树已有其他未提交的 Agent 外观、工具诊断和同步相关改动；本次文档不提交、不撤销它们。开始前重新检查 `git status` 与差异，不把这些内容归为沙箱实现。

现有验证命令从仓库根执行，详细环境及范围见 [验证说明](../development/verification.md)：

```powershell
npm run impact
npm test -- agent
npm run verify -- repo
npm run verify
```

`impact` 只生成计划；`verify -- repo` 不证明原生或设备可用。后续原生/ArkTS 实现须完成全量测试、原生主机验证及双架构签名 HAP 构建，再做真机验收；没有实施时不能把待执行门禁写成已通过。

沙箱的测试至少覆盖：无限循环、大数组/长字符串、深递归、编译期恶意输入、超大输出、非法宿主参数、未授权工具/ID、调用超额、取消后的迟到结果、重复执行、OOM 后清理，以及代码产生提案但未确认时零卡库写入。具体命令随实际测试入口一起提交，避免写不存在的脚本。

下一对话从[实现 README](../../native/agent-sandbox/README.md)和最新实施记录继续，始终保持编程 Agent-first 和既有确认写入边界。

## 第一阶段实施记录

独立原型使用 QuickJS-NG v0.17.0、wasmi 0.46.0 和根目录锁定 Rust；版本、许可、源码提交和命令均在原型入口。`Sandbox::run` 接受函数体和冻结 JSON 输入，逐次创建 Wasm Store，由同一入口计量燃料、检查取消与 deadline、限制内存和输出。没有新增工具注册、会话状态、确认协议或 Anki 依赖。

2026-09-30 首轮证据（release，工作树另有并行导入功能开发）：

- `tools/build-agent-sandbox.ps1 -Target all`：真实 Wasm 构建、Rust fmt/clippy、7 组主机行为测试、主机 probe 和 arm64/x86_64 鸿蒙链接通过。补充输出序列化无限循环用例后，clippy 和真实主机测试再次通过。
- `127.0.0.1:5555` 的 x86_64 鸿蒙模拟器：同一 `runtime` 程序 7 组测试全通过（0.99 秒）；固定 probe 正常执行，取消后新运行返回 42。仅在专用临时目录发送和执行产物，未安装应用、调用 Provider 或访问用户卡库。
- Wasm 文件 1,073,552 字节，SHA-256 `db886771cf2a08f6be013014e1090b0bc985752bb6f3ac974fa00089815990a9`。这是原型文件大小，不是新增 HAP 大小。
- 模拟器单次样本：受信模块初始化 49.265 ms，标量 71.777 ms，1,000 条字段清洗去重 51.342 ms，10,000 次求和 24.077 ms；取消标记写入至线程 join 11.300 ms。进程 VmHWM 11,184 KiB，VmRSS 8,392 KiB；Wasm 线性内存约 2.6–2.7 MiB。主机与模拟器均受同时进行的构建影响；不是百分位统计、硬实时保证或 arm64 真机性能。
- 文档导航/链接检查通过。最初 `npm run verify` 在并行新增 CSV 方法的索引断言处停止；独立执行原生主机入口又在同任务的 Rust 格式变化处停止。最终 `npm run verify -- repo` 为 1654/1657 通过，未通过项位于导入流程的 `anki-parity-integration-contract`、`cloud-deck-flow-contract` 和 `ui-dialog-layout`。没有修改这些并行功能/断言，也没有把整个仓库宣称为全绿。

当前第一阶段仍未关闭：未完成新增签名 HAP 大小、arm64 真机峰值 RSS/取消分布、应用线程与生命周期验收，以及完整安全审查。受信 Wasm 编译初始化目前单独测量而不可中断，宿主 JSON 处理/单条内存指令有界但不被 fuel 抢占，详见原型限制。下一步先补这些证据、确认可接受预算，再接纯计算工具；本轮不新增通用多引擎框架或受控读取桥。

### 2026-10-01 重复验收

已把单次 probe 扩为默认 20 次的 JSON 报告，并提供 `node tools/test-agent-sandbox-device.mjs <connect-key> 20`。脚本自动确认架构、重建锁定源码、从 Cargo JSON 取得真实测试产物，并校验设备输出；已在模拟器完整运行通过。工具入口拒绝 hdc 零退出但远端未执行、未完整通过的测试、错架构/错样本数或缺失内存数据的报告，相关 Node 回归通过。原型 fmt/clippy 和主机 8 组真实引擎测试通过；新增覆盖正则回溯、Proxy/JSON 序列化死循环、请求进入前取消/过期和逐步分配至堆耗尽。

此次 [x86_64 原始 JSON 证据](2026-10-01-agent-sandbox-x86_64.json) 已纳入版本控制目录（时间戳使用 UTC）。模拟器 8 组引擎测试通过；20 个压力轮次各包含取消、堆耗尽、输出超限、递归失败和恢复。取消至 join 的 median/p95/max 为 0.958/1.646/4.998 ms。进程 RSS 从预热后的 8,496 KiB 到第 10 轮的 9,636 KiB，第 20 轮仍为 9,636 KiB，压力阶段 VmHWM 为 27,664 KiB；只能说明本次有限样本未出现持续增长。

1,000 条清洗去重 median/p95 为 116.623/401.412 ms，10,000 次求和为 25.526/30.127 ms；受信模块冷初始化单次为 69.346 ms。测量时同机另有导入功能构建，结果包含模拟器和调度负载；不将该数字作为硬性性能门或 arm64 结论。用户确认真机后续可连接，收到真机后直接运行同一设备脚本，比较原始报告并记录预算选择，不需要修改业务代码或安装应用。

本轮最后的 `npm run verify -- repo` 已通过（当时共享工作树 1665/1665）。上轮导入相关失败已经不再出现；这是当前仓库门禁结果，不能替代原生 Core/HAP 门禁或 arm64 真机验收。本任务没有改写另一任务的导入实现，也没有在并行构建期间追加应用安装或清理。

## 应用集成与真机验收

2026-10-01 当前范围：首版保持纯计算，不提前引入脚本内工具调用桥、产物仓库或第二套会话。模型先使用现有读取工具取得显式输入，计算后仍通过既有提案和用户确认写入。历史方案第 3–5 阶段为后续按需扩展，不是本轮已完成能力。

- `AgentCodeExecution` 负责有界参数和结果协议，`AgentCodeTool` 注册只读工具；Registry/Runner 贯通取消并丢弃迟到结果。Provider 请求出口限制最终序列化 payload，覆盖指令、schema、参数和结果，不截断工具调用配对。
- 固定 Wasm、guest 源码、Cargo lockfile 和完整第三方许可可离线校验；常规构建不依赖忽略目录中的原型资产。独立库隐藏 Rust 符号，不与 Anki Core 混用依赖。
- 共享工作树的完整 `npm run verify` 曾通过全部 Node、Core/沙箱主机测试、RPC 和双架构 clean 签名 HAP；后续设备修复需重新运行，不沿用历史结果冒充最终验证。
- USB 真机 `SLG-W50` 已确认为 `aarch64`。独立测试程序在 `/data/local/tmp` 执行返回 `Permission denied`；没有调整安全策略，改用签名 `ohosTest` 的正式 ArkTS → NAPI → Wasm 路径。
- 默认本机签名选择发布 profile，真机拒绝侧载并返回 `9568322`。已有 `ceshi` 调试 profile 包含该设备，使用独立 `.local/sandbox-device-signing.json` 选择它，未改默认发布配置。主包和测试包均使用 `install -r` 成功安装，不卸载、不清数据。
- 完整桥接测试实际发现 Promise 兑现时任务槽尚未释放，连续调用会报 `sandbox_busy`。修复为先释放已完成槽位再 resolve/reject；真机覆盖标量、去重、单任务拒绝、事件循环响应、取消/旧句柄、无宿主能力、输出限制、输入与脚本错误、20 次 Registry 恢复及零写入权限，全部通过。
- 测试报告必须有成功终态、20 个计时样本、全部工作负载和内存检查点。TestKit 单条消息会截断，测量使用编号分段传输，缺段/乱序/不完整 JSON 均失败；不能只凭 HDC 退出码或成功标记认证测量完成。

完整 [arm64 真机应用测试报告](2026-10-01-agent-sandbox-arm64-napi.json) 已保存，属于安全升级前的 wasmi 0.46.0 历史证据，不能用作修复版本发布验收。每种计算 20 次，含受信模块初始化的 median/p95/max（ms）：标量 28.975/49.601/59.670，1,000 条清洗去重 64.473/72.386/75.830，10,000 次求和 56.698/113.333/119.944。取消信号至 Promise 返回为 3/32/48 ms，时钟分辨率为毫秒，0 不代表零成本。压力轮次包含取消、堆耗尽、递归和输出超限后成功恢复。

压力前/第 10/第 20 轮的进程 RSS 为 143,284/140,356/142,244 KiB，PSS 为 43,566/39,772/41,891 KiB；包含 ArkTS/TestKit 和系统共享库，不与独立 probe 的进程数值直接比较。有限检查点未显示持续增长，但未覆盖峰值和长期运行。

升级前签名 debug HAP 中，arm64/x86_64 `libagent_sandbox.so` 分别为 4,074,088/4,296,584 字节，许可文本 489,497 字节，三项未压缩合计 8,860,169 字节（约 8.45 MiB）。这是包内条目实测，不是与基线 HAP 的精确差值，也不是应用整体 release 包大小。

真机复验选择已有调试身份的本机命令：

```powershell
$env:JIDECARDS_SIGNING_CONFIG = '.local/sandbox-device-signing.json'
powershell -NoProfile -ExecutionPolicy Bypass -File tools/build-app.ps1 -SkipRust
hdc -t <connect-key> install -r entry/build/default/outputs/default/entry-default-signed.hap
powershell -NoProfile -ExecutionPolicy Bypass -File tools/build-app.ps1 -Test -SkipRust
node tools/test-agent-sandbox-app.mjs <connect-key>
```

本机配置不纳入版本控制；其他电脑按 [签名说明](../development/signing.md) 配置自己的同应用调试材料。不要把开发者密码、设备授权文件或临时路径变成仓库依赖。

### 依赖安全修复

审查上游 [CVE-2025-66627 公告](https://github.com/wasmi-labs/wasmi/security/advisories/GHSA-g4v2-cjqp-rfmq) 后，确认原型锁定的 wasmi 0.46.0 在受影响范围内。已升级到邻近的已修复版本 0.47.2，同步 lockfile 和随包许可；不要回退到旧版，即使旧版压力测试通过。升级后 fmt/clippy、FFI 所有权测试、8 组真实引擎测试及主机 probe 通过，双架构原生库构建通过。

Cargo Audit 0.22.2 的 [原始结果](2026-10-01-agent-sandbox-audit.json) 显示 39 个锁定依赖无已知漏洞、无警告；数据库提交 `9b3a3b73a7f42606494c943e95f8196e9994df46`。命令为 `cargo audit -f native/agent-sandbox/Cargo.lock --json`；更新数据库后复跑，不忽略公告。扫描只覆盖 Cargo 依赖，不能代替 QuickJS/WASI 源码审查或沙箱整体安全验证。

并行编辑器/音频修改期间，完整仓库曾为 1657/1667 通过，主包曾在音频代码的 ArkTS 类型检查处失败；这些是历史失败，不是最终结果。用户要求先完成沙箱自身验证，没有向其他对话发送消息。收到并行工作完成的确认后重新执行全部门禁，结果见下节。

本轮发现并修复两个共享构建相关问题：NAPI Promise 兑现前释放任务槽；`build-app.ps1` 用仓库级命名互斥锁覆盖日志初始化至警告校验，避免并行 clean/签名相互干扰。锁不能冻结其他对话正在修改的源码；构建期间仍需避免绕过脚本直接使用 Hvigor。

### 修复版最终验证

- `npm run verify` 全部通过：1719 项 Node 测试、Core 与沙箱 fmt/clippy/主机测试、RPC、双架构 clean 签名 HAP；警告 accepted=268、unexpected=0。日志 `.tmp-sandbox-release-gate.log` 是本机诊断，本文和下列报告保存交接证据。
- 安装的主 HAP SHA-256 为 `4f387c8538895cbc654ecb7326a5d8fc466008dc3ac7b240c3ba6db9fa7b632c`。wasmi 0.47.2、Cargo lock SHA-256 `66460caf60ac2baad3cf249653a97d7bfbc3c6c23162c8908843b097fc4db914`，真机覆盖安装成功，没有卸载或清数据。
- 修复版 [20 轮报告](2026-10-01-agent-sandbox-arm64-patched.json) 全部通过；RSS 检查点从 169,336 到 174,736 KiB，不能单凭该轮认定内存稳定，因此追加同一测试进程的长压力。
- [100 轮原始报告](2026-10-01-agent-sandbox-arm64-stress100.json) 全部通过，每轮覆盖活跃取消、堆耗尽、输出超限、递归失败和后续成功恢复。100 次取消 median/p95/max 为 5/30/38 ms。计算各 20 次，千条清洗去重 p95 为 80.55 ms，万次求和 p95 为 60.60 ms；含受信模块初始化。
- 100 轮的 RSS 检查点为 170,020–175,312 KiB，初始 174,912、第 100 轮 175,184、等待 5 秒后 172,216 KiB；对应初始/末轮/冷却 PSS 为 50,112/49,835/48,256 KiB。有限样本未见持续增长，不能宣称无泄漏。检查点不是峰值，包含整个 ArkTS/TestKit 进程，不能当作沙箱独占内存。
- 修复版 HAP 中 arm64/x86_64 沙箱库为 4,070,760/4,290,712 字节，许可 477,442 字节，合计 8,838,914 字节。尚未测量完整 release 包与基线的净差值。
- 100 轮测试包实际编译、签名和真机测试通过，无新增警告；修改测试后 `npm run verify -- repo` 再次 1719/1719 通过。构建互斥、警告校验、设备报告工具共 13 项独立测试通过。最终文档更新另跑仓库检查。

沙箱计算能力的自动验证已闭环。仍不等于完整产品上线认证：主界面真实 Provider 工作流及离页/后台生命周期、进程峰值与 release 包体预算、QuickJS/WASI 的持续安全跟踪仍需完成。脚本内工具桥与产物仓库继续不开放，不把未来方案列为已交付能力。

## 开源依据与讨论

查阅日期：2026-09-30。链接可能指向持续变化的默认分支；实施前固定版本/提交。以下内容是设计依据，社区报告不等于已在本项目复现。

- [Claude Code 沙箱设计](https://www.anthropic.com/engineering/claude-code-sandboxing)：参考文件/网络能力边界；公开方案使用 Linux/macOS 系统机制，不能直接推断鸿蒙可用。
- [Anthropic：代码执行与 MCP](https://www.anthropic.com/engineering/code-execution-with-mcp)：参考代码组合工具、在执行环境处理中间数据、减少送回模型的结果；本项目不因此强制引入 MCP。
- [DeepSeek Harness 架构](https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/architecture.md)：参考工具生命周期、会话记录、取消和恢复；不整套引入 Cordis 插件运行时。
- [DeepSeek Harness 工具发现讨论 #524](https://github.com/deepseek-ai/deepseek-harness/discussions/524)：作者基于特定提交分析工具可见性、执行集合和恢复的一致性；用作设计检查项，不能断言当前版本仍有相同问题。
- [QuickJS-NG](https://github.com/quickjs-ng/quickjs)、[C API](https://quickjs-ng.github.io/quickjs/developer-guide/intro/)、[安全说明](https://github.com/quickjs-ng/quickjs/security)：嵌入、内存/栈限制与中断；不加载不可信 QuickJS 字节码。
- [wasmi](https://github.com/wasmi-labs/wasmi)：嵌入式解释执行和燃料计量；项目本身的能力不替代鸿蒙构建和桥接验证。
- [quickjs-emscripten](https://github.com/justjake/quickjs-emscripten)：参考 QuickJS 与 Wasm 的组合及宿主函数桥接，不直接照搬浏览器/Node 包。
- [quickjs-emscripten #219](https://github.com/justjake/quickjs-emscripten/issues/219)、[#255](https://github.com/justjake/quickjs-emscripten/issues/255)：分别报告部分长操作的中断和宿主内存问题；把示例作为所选版本的回归输入，不能仅设置引擎参数便宣称硬限制有效。
- [Monty](https://github.com/pydantic/monty)、[资源限制](https://pydantic.dev/docs/monty/limitations/resource_limits/)：本地 Python 执行的备选，关注编译、宿主挂起和解释器运行的不同预算。
- [HarmonyOS Worker](https://developer.huawei.com/consumer/cn/doc/harmonyos-references/js-apis-worker)：线程调度与通信参考；Worker 不替代沙箱的权限和内存隔离。
