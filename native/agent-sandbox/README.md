# 应用内 Agent 本地计算沙箱

[项目入口](../../PROJECT_CONTEXT.md) · [决策与验收记录](../../docs/decisions/2026-09-30-agent-local-sandbox.md) · [应用内 Agent](../../docs/development/agent.md)

`execute_code` 已接入现有 Agent，用于清洗、去重、精确计算和生成候选内容。它只处理显式 JSON 输入，不获得卡库、网络、文件、shell、密钥、确认令牌或工具调用能力。已有读取工具先取数据，计算后仍通过既有提案与确认执行器保存，代码结果本身永远不成为授权。

可构建的应用集成不等于已通过全部上线验收。实际设备与构建证据见决策记录；arm64 真机性能和设备生命周期不能由主机测试代替。

## 责任入口

| 入口 | 唯一责任 |
| --- | --- |
| [AgentToolCatalog](../../entry/src/main/ets/model/agent/AgentToolCatalog.ts)、[AgentPolicy](../../entry/src/main/ets/model/agent/AgentPolicy.ts) | 工具声明、示例、预算与只读风险；Runner 仍校验冻结的本轮工具表 |
| [AgentCodeExecution](../../entry/src/main/ets/model/agent/AgentCodeExecution.ts) | 参数、UTF-8 长度、原生结果校验与修正诊断 |
| [AgentCodeTool](../../entry/src/main/ets/backend/agent/AgentCodeTool.ets) | ArkTS 任务句柄与 Promise；Registry/Runner 取消贯通原生，迟到结果不再进入会话 |
| [napi.cpp](napi.cpp)、[src/ffi.rs](src/ffi.rs) | 进程内至多一个任务；UI 线程有界复制，后台运行；完成/排队失败释放槽位；旧句柄不取消新任务 |
| [src/lib.rs](src/lib.rs) | Wasmi 实例、预算、燃料、取消、固定宿主导入与结果；每次销毁 Store |
| [guest.c](guest.c) | 仅 QuickJS 核心；解析并深冻结输入、执行函数体、序列化；无模块加载器或 JS 宿主函数 |
| [tests/runtime.rs](tests/runtime.rs)、[examples/probe.rs](examples/probe.rs) | 真实引擎行为及固定压力测量，不调用 Provider 或卡库 |

独立 Cargo workspace/lockfile 不触发 Anki Core 构建，也不共享其依赖版本。应用使用单独 `libagent_sandbox.so`，隐藏静态 Rust 符号避免与 Core 相互绑定。没有多引擎框架或第二套会话状态。

## 契约与预算

```json
{"source":"return [...new Set(input.map(s => s.trim()))];","inputJson":"[\"example\",\" example \"]"}
```

脚本是同步函数体，读取冻结的 `input`，返回 JSON 可序列化值。工具返回 `{"status":"completed","result":...}`。Promise、undefined、BigInt、循环结构失败，不执行异步任务队列。JSON 采用 QuickJS 标准语义，例如非有限数值变 null、对象的 undefined 字段省略。

| 项目 | 固定限制 |
| --- | --- |
| 源码 | 工具最多 65,500 UTF-8 字节；含宿主包装最多 64 KiB |
| JSON 输入 / 输出 | 128 / 64 KiB UTF-8；宿主校验保留 serde 默认深度限制 |
| QuickJS 堆 / Wasm 线性内存 | 16 / 32 MiB；均不等于进程 RSS |
| 燃料 / 时间 | 50 亿 fuel / 3 秒；应用任务从创建计时，包含排队及受信模块初始化 |
| 取消 | 通常每 10 万 fuel 检查；旧任务回收前拒绝新任务，不堆积工作队列 |
| 宿主导入 | 时钟固定零；四个 libc fd 导入调用即 trap；其他导入导致实例化失败 |
| 会话出口 | Provider payload 序列化后最多 240,000 字符，计入指令、schema、参数与结果；不是 token 估算，超限不发送、不截坏调用配对 |

受信 Wasm 验证/翻译、宿主有界复制/JSON 和单条 Wasm 内存指令不可被 fuel 抢占；deadline 是操作边界检查，不是硬实时 OS 强杀。OOM 可能表现为脚本异常或 Wasm trap，不区分全部来源。不对脚本异常调用 `toString`，不回传原生路径或堆栈。

guest `run` ABI：0 成功、1 输入超限、2 初始化失败、3 输入解析/冻结失败、4 编译/执行异常、5 不可序列化/异步结果、6 输出超限。异常后不复用半失败解释器。

## 构建与来源

锁定 Rust 1.92、wasmi 0.47.2（MIT/Apache-2.0）、QuickJS-NG v0.17.0（MIT，提交 `6d46d07d04041b40f4f49eaa7fdebe44c314c699`）。wasmi 原型版本 0.46.0 受 [CVE-2025-66627](https://github.com/wasmi-labs/wasmi/security/advisories/GHSA-g4v2-cjqp-rfmq) 影响，不可用于发布；0.47.2 为上游列出的已修复版本。[engine/SHA256SUMS](engine/SHA256SUMS) 绑定 guest 源码与随包 Wasm；Cargo build.rs 校验。普通构建不需要 WASI SDK 或忽略目录中的文件。

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tools/build-agent-sandbox.ps1 -Target host
powershell -NoProfile -ExecutionPolicy Bypass -File tools/build-agent-sandbox.ps1 -Target app
npm run verify
```

- `host`：fmt、clippy、真实引擎/FFI 测试及 20 轮 probe。
- `app`：arm64/x86_64 release 静态库；正式 HAP 自动调用，`-SkipRust` 也不跳过沙箱。
- `ohos`：上述库加双架构 probe/runtime 程序；`all` 为 host + ohos。
- `npm run verify`：沙箱主机门禁、Core/全量 Node 和 clean 签名 HAP；`--repo` 不证明原生可用。

改 guest/升级 QuickJS 时显式加 `-RebuildEngine`。需 [WASI SDK 20](https://github.com/WebAssembly/wasi-sdk/releases/tag/wasi-sdk-20) 的 Windows `wasi-sdk-20.0.m-mingw.tar.gz`，解压到 `work/sandbox/wasi-sdk-20.0+m`，或传 `-WasiSdk`。SDK 下载指纹为 `d51f1e01679474c58d898859114f6be99a7a6b325295177c9e3f7c9e8977fbb8`，不是上游签名验证。脚本核对 QuickJS 提交及干净状态，将结果放 `target/quickjs.wasm` 并与锁定引擎比较；不同即失败，不自动覆盖发布资产。升级需审查来源、更新引擎及源码指纹、重新生成许可，再执行全部门禁。

第三方完整许可随 HAP 放在 [agent-sandbox-notices.txt](../../entry/src/main/resources/rawfile/agent-sandbox-notices.txt)。[生成器](../../tools/generate-agent-sandbox-notices.mjs) 收集 Cargo 锁定源码及固定提交的 QuickJS/WASI libc/compiler-rt 许可；包含 build-only/optional crate，不据此推断均进入二进制。

```powershell
node tools/generate-agent-sandbox-notices.mjs --check
node tools/generate-agent-sandbox-notices.mjs --write
```

`--check` 离线校验 lockfile、Wasm、许可文本指纹，正式构建必须通过；`--write` 才需要 Cargo 源码及 curl 网络。升级需审查，不盲目刷新指纹。

## 设备验收

引擎压力测试不安装应用：

```powershell
node tools/test-agent-sandbox-device.mjs "<connect-key>" 20
```

确认架构并构建双架构程序，只向唯一 `/data/local/tmp/jidecards-sandbox-<时间戳>/` 发送 probe/runtime。报告必须包含完整测试、架构、样本数、时间分布与进程 RSS/HWM；不信任 hdc 单独的退出码。报告在 `target/device-reports/`，代表证据另放决策目录。部分商业真机拒绝执行该目录中的程序；保留失败输出并使用下方签名应用测试，不关闭设备安全机制。

完整 ArkTS → NAPI → Wasm 测试只存在 `ohosTest` 包：

```powershell
# 先构建并用 install -r 安装当前 signed 主包，保留包名、签名及用户数据。
powershell -NoProfile -ExecutionPolicy Bypass -File tools/build-app.ps1 -Test
node tools/test-agent-sandbox-app.mjs "<connect-key>"
```

测试脚本覆盖安装 signed 测试模块，再执行 `aa test`；不卸载、不清数据、不打开集合、不调用 Provider。必须收到完整成功标记与编号分段测量数据。覆盖桥接、单任务拒绝、事件循环响应、取消与旧句柄、错误映射、20 次 Registry 恢复及提案形状数据无写权限。另测量各 20 次标量/千条清洗/求和、100 轮取消和大分配/递归/超限后的恢复。HiDebug 每 10 轮及结束后等待 5 秒记录进程 RSS/PSS（不是峰值），任务耗时包含模块初始化。测量缺少样本/检查点或分段不完整均失败，最长等待 5 分钟。测试包不是可发布主包。

真机需包含该设备 UDID 的调试 profile。通过 `JIDECARDS_SIGNING_CONFIG` 指向独立本机配置选择已有调试身份；不要覆盖默认发布配置或输出签名密码。当前真机使用已有 `ceshi` 配置；发布 profile 侧载失败不意味着 USB 连接失败。

wasmi 0.47.2 的 arm64 真机完整桥接/100 轮恢复、全量仓库/原生/clean HAP 和 Cargo 依赖审计已通过，证据见决策记录。上线仍需当前主包实际 Provider 交互、离页/后台生命周期、峰值内存、release 包体及持续安全审查。有限样本 RSS 稳定不是无泄漏证明，Wasm 也不等于完整安全审计。尚未开放脚本内工具桥或会话产物仓库；未来有明确需求并完成权限/生命周期设计后才增加。
