# Core 协议生成与领域接入

[任务索引](../../PROJECT_CONTEXT.md) · [验证](verification.md) · [责任](ownership.md) · [长期决策](../decisions/2026-10-08-core-protocol-generation.md)

协议权威是 [UPSTREAM.lock](../../UPSTREAM.lock) 指定的官方 Anki 描述信息和 `anki_proto_gen::get_services`。生产领域契约仍归现有 Service；UI/JIDE 经同一领域入口、原权限和确认流程调用。生成原始 RPC 不注册助手工具，也不说明界面或平台已经支持该能力。

## 从哪里接手

| 责任 | 唯一入口 / 输入 | 产物或使用方 |
| --- | --- | --- |
| 编号、消息、字段、枚举事实 | 官方锁定 checkout 的 `proto/anki/*.proto`、`rslib/proto_gen`；[Rust 导出器](../../tools/protocol-export/src/main.rs) 调用官方 helper | [描述快照](../../tools/protocol/core-descriptors.bin)、[结构化 schema](../../tools/core-protocol-schema.json) |
| 再生成、检查、语义差异 | [core-protocol.mjs](../../tools/core-protocol.mjs) | 所有下述产物；不按残留 Cargo 构建缓存择优取值 |
| ArkTS 静态访问器与 RPC | schema → 静态类、字段常量、枚举和方法 | [CoreMessages.ts](../../entry/src/main/ets/proto/generated/CoreMessages.ts)、[CoreRpc.ts](../../entry/src/main/ets/proto/generated/CoreRpc.ts) |
| 应用私有协议 | [private.proto](../../tools/protocol/private.proto) 定义字段；[private-rpc.json](../../tools/protocol/private-rpc.json) 定义编号、输入/输出、语义及所有者 | 同一消息生成器、[PrivateRpc.ts](../../entry/src/main/ets/proto/generated/PrivateRpc.ts)、[原生私有编号](../../native/rsharmony/src/private_rpc_ids.rs) |
| 原生消息投影 | [native-messages.json](../../tools/protocol/native-messages.json) 仅选择消息，字段不在这里重定义 | [protocol_generated.rs](../../native/rsharmony/src/protocol_generated.rs)；媒体、历史、预览、重复笔记、自定义调度 |
| 自定义调度 JSON 语义映射 | [scheduling-nodes.json](../../tools/protocol/scheduling-nodes.json) 仅绑定语义节点到消息 | [custom_scheduling_schema.rs](../../native/rsharmony/src/custom_scheduling_schema.rs)；[执行边界](../decisions/2026-10-07-custom-scheduling.md) |
| 既有中文 RPC 别名 | [rpc-index-methods.json](../../tools/rpc-index-methods.json) 绑定方法名，不能手改编号 | 服务索引、Rust/C++ 取消/生命周期编号、[dispatch 基线](../../tools/rpc-index-baseline.json) |
| wire 基元 | [WireMessage.ts](../../entry/src/main/ets/proto/core/WireMessage.ts)、ProtoReader/ProtoWriter、UTF-8 | 生成类共用；不包含具体协议字段表 |
| 产品契约和接通状态 | `proto/messages/` 领域映射、`backend/` Service、原 UI/JIDE 声明 | [生成覆盖与迁移清单](../../tools/protocol/inventory.json)；无领域调用标记“未接入” |

Backend service index 和方法 index 均由官方 helper 提供。集合方法委托给 Backend 时，编号是其**原始 collection proto 方法 index + Backend 自有方法数**，不能过滤后重新编号。测试逐个核对这一规则，包含 BackendFrontendService。现有中文索引只覆盖原有服务别名，完整生成客户端另覆盖所有 Backend 方法。

清单自动盘点描述文件、消息、枚举、方法和每个旧导出函数，给出旧入口、新来源、调用者、成功 oracle 输入及直接测试。`inlineMigrations` 包含 Service 内原有手写编码；`nativeMigrations` 包含原生字段投影和调度 Schema；`contractMigrations` 单列集合开关、进度取消与关闭集合后导入。后者保留原会话状态门控和独立取消通道，使用同一生成索引，不能绕到要求 ready 的普通 RPC 通道。没有 wrapper 调用但有这些明确契约引用的接口不能误标为未接入。调用者扫描是源码定位线索，不是运行时可达性、平台支持或授权证明。辅助的空请求、校验和领域排序函数也盘点，允许没有具体消息来源。

## 可重复命令

日常源码归档保留 `third_party/anki`，无需其 `.git`，也不借用父仓库 HEAD：

```powershell
npm run protocol:check
npm run protocol:generate
node tools/verify-rpc-index.mjs
npm test -- tooling
npm run protocol:test-core
```

check 和 generate 都用锁定 Rust helper 重新导出受版本控制的描述快照，核对 schema、源归档输入指纹及全部产物。check 不改产物；generate 使用同一入口重写。日常无需 protoc，但需要 Node 24、锁定 Rust、源码归档与导出器依赖；首次 cargo 下载依赖是正常工具准备。可移植 Node 测试直接核对快照、指纹和产物，不用本机缺失的 Core 跳过协议断言。

首次导入/明确更新描述信息，需要一个独立且完全干净、origin 为官方仓库、HEAD 匹配锁文件的 checkout。源码归档中的协议/helper/依赖锁须与它一致：

```powershell
# protoc 已在 PATH，或先设置 $env:PROTOC 为现有 protoc.exe 的绝对路径
node tools/core-protocol.mjs --refresh <独立官方锁定checkout绝对路径>
node tools/core-protocol.mjs --diff <旧schema.json> <新schema.json>
```

refresh 核对 origin、提交、完整 Git 状态和源文件指纹，导出全部 proto 及私有 proto 后再次检查官方状态、原生 helper、本地私有输入和锁文件。先预检全部映射，再替换审查快照。记录完整官方提交、origin、protoc 版本、描述 SHA-256 和私有定义指纹。拒绝本机未提交修改及陈旧缓存充当官方基线，命令拒绝多余参数，不能把被忽略的缓存路径误认为已核对。日后升级先保留旧 schema、核对授权与 Core 补丁，再在新锁定 checkout 上刷新；diff 输出接口、编号、字段类型、默认值、presence、optional、oneof、packed、重复/映射及枚举变化。本任务保持 26.05/e64c6b1。

`generate-rpc-index.mjs` 是兼容命令，委托全部生成；`verify-rpc-index.mjs <显式backend.rs>` 仅额外比较指定 Rust 产物。Rust 文本不是协议事实的首选来源，旧 `--generate backend.rs` 已拒绝。导入日志、牌组预览、FSRS 负担模拟和标记同步四个已跟踪 Core 补丁仍由原构建入口维护。

## 值、字节与领域差异

生成访问器通过具体方法声明静态类型，无反射字典、Proxy 或运行时动态类。普通 TS 测试不能证明 ArkTS 可编译，最终以 DevEco clean 双架构签名 HAP 为准。原生桥继续只拥有后端句柄、锁、取消、生命周期和原有私有服务；CoreRpc 注入原后端会话，不引入另一套生命周期。

| 情形 | 处理与保留的领域契约 |
| --- | --- |
| 未知字段 / raw | 生成类保存原 wire 顺序、重复字段及 raw；`toBytes()` 不重编码未改字段。`preserved/rawX` 返回副本；构造扫描借用输入载荷，调用期间不要修改输入缓冲区。普通领域解码只返回原来公开的字段，原先不公开未知字段的接口不会凭空增加它们。 |
| SchedulingStates | 解码新增可选 `raw`；未改子状态时原样返回整个消息，修改显式子状态时局部替换且保留其他字段。原生 JSON patch 保留未知 wire/current；64 KiB 单字段限制、脚本执行限制及失败确认仍按原契约。 |
| 局部配置保存 | 配置原始字段和重复 section 原顺序保存；修改字段才重新编码；未知/未修改字段不被全量 DTO 重建丢弃。 |
| int64 / uint64 | 生成类有 `get/setXBig`，覆盖完整宽度；领域 number getter 保持安全整数限制。writer 新增安全整数检查：旧写入器允许某些超过安全范围的 number，现在抛 Error；小数/NaN 的旧 RangeError 也改为明确的协议 Error。正常 ID 的边界字节一致，极大 Core 整数使用 Big API；seed 的 JSON 仍是十进制字符串。 |
| 浮点 / UTF-8 | little-endian float/double；float 仍按 f32 舍入，保留 NaN/Infinity 数值行为。UTF-8 使用原共用实现；媒体和 JSON 的 bytes/string 区分来自描述符。非法 UTF-8 的替换行为沿用旧实现，不能声称与 Core 的非法字符串拒绝完全一致。 |
| 默认 / nullable / presence | 原始 has/raw/count 与值 getter 分开；缺失 bytes/string/scalar 返回 protobuf 默认，缺失嵌套消息为 null。set 显式写默认值；领域适配器保留原来的省略默认、null 与 packed 选择。 |
| repeated / oneof | packed 和 unpacked 可混用并按序累加。oneof 按最后活动分支，setter 清除其他分支。嵌套消息正常 getter 合并重复消息；既有领域 DTO 用明确的 `getXLast` 保留原投影规则，配置另按字段合并。 |
| 错误 | RPC 输入/输出和错误对象身份不变。wire 扫描检查整个外层消息，已知字段 getter 检查 wire 类型；某些旧 decoder 忽略或误读的损坏消息现在抛 Error，错误文本可更明确。媒体标签返回的损坏 OpChanges 曾被旧 count-only 投影忽略，现返回原 typed Backend 错误通道；旧／新及官方 prost 都有明确差异断言。未知 group 仍不支持。合法 Core 样本与损坏样本的证据分别记录。 |

明确修正旧协议问题：Deck.usn、DeckCommon 和 DeckConfig.usn 的 int32 负数不再被 unsigned writer 截为 0；统计 ButtonCounts 混合多个 packed/unpacked 段不再丢掉先前段。旧／新差异断言和官方 Core prost 字节/值测试共同证明原因。generated bool 可读取完整 uint64 非零值为 true；旧 number decoder 在极大 varint 上曾报安全范围错误。CardType/CardQueue 是 Core 内部 int32 业务语义，proto 没有对应 enum；保留领域枚举。ReviewPreferenceField 是应用编辑选择器，也保留领域定义。

非法输入也不能宣称等价：负数未知 enum 现在按有符号 enum 写入，旧 unsigned writer 会写为 0；超出声明 32 位范围的 addon ID 和 Card sint32 输入，旧手写位运算与新通用 writer 的字节不同。uint32 getter 按 Core 缩窄到低 32 位，旧某些领域 reader 会保留更大的安全 number。这些输入不属于现有界面提供的合法选项；边界对照保留其差异，不声称未接入或非法选项有相同 Core 调用结果。`sint32` 必须先缩窄 wire 值再 zigzag，遵循官方 prost；合法有符号边界保留旧字节和值。超过 uint64 的第十个 varint 字节和超出 32 位的标签现在明确拒绝，旧 reader 可能接受后截为 0 或产生越界字段号。

## 对照证据与后续验收

[旧实现快照](../../tools/tests/fixtures/protocol-legacy/manifest.json) 保存改写前工作树，包括 proto、Service、原生及相关模型。捕获时相关文件没有未提交修改；测试校验每份源码 SHA-256。快照仅用于测试，不可从生产导入。[固定 corpus](../../tools/tests/fixtures/protocol-legacy/corpus.json) 保留旧实现输出；包含当前原测试向量、描述符边界/组合输入和领域有效输入。它覆盖所有原导出函数，比较相同输入编码字节、同字节解码值、字段存在性、raw、未知字段、错误及传入对象修改，不只验证新编码器自洽。

- [protocol-generation](../../tools/tests/protocol-generation.test.mjs)：逐项旧／新 oracle、完整消息 raw/default/oneof、全宽整数、全部 RPC dispatch、显式 Core 修正；[protocol-services](../../tools/tests/protocol-services.test.mjs)：Service 内迁移的字节、调用次数和失败身份。
- [扩展差分](../../tools/tests/protocol-equivalence.test.mjs)：从冻结输入生成整数共享合法区间、UTF-8、未知字段、字段重排、删除、重复嵌套消息及局部偏好修改；仅两组统计修正使用精确的[已审查差异](../../tools/tests/fixtures/protocol-equivalence-differences.json)，其余逐组完整断言旧／新相等。另有[149 组明确边界差异](../../tools/tests/fixtures/protocol-boundary-differences.json)的固定旧／新输出断言，不能靠放宽比较吞掉新增差异。
- [领域调用差分](../../tools/tests/protocol-service-forwarders.test.mjs)：执行 16 个实际 Service 中 83 个直接转发方法的 155 组[旧输入](../../tools/tests/fixtures/protocol-service-cases.json)，比较 dispatch、字节、返回值、输入修改、嵌套媒体调用数和原生失败对象身份；保留调度的调用前拒绝。集合历史 undo/redo 分支另有直接旧／新对照。平台 IO、任意参数组合和所有方法的设备行为不由该支架证明。
- [原生差分](../../native/rsharmony/src/protocol_legacy_tests.rs)：私有消息双向字节/值、媒体分页/复查/写入/错误/调用、历史存在性/未知字段/错误/调用、真实 Core 预览/重复笔记。自定义调度在当前模块执行不可变旧实现，比较 JSON、noop/局部 patch 字节及错误。
- [真实协议/Core 入口](../../tools/test-protocol-core.mjs)：生成 RPC 和生产领域编解码调用锁定 Core，只创建临时合成集合；评分/状态透传、配置保存、搜索/卡片/笔记、媒体、APKG/COLPKG/文本、同步状态及取消；输出 `.local/protocol-core-evidence.json`。
- `npm run verify`：全部仓库测试、原生 fmt/clippy/真实 Core、沙箱、描述/RPC 检查、上述生产协议联测、构建锁下的 clean 双架构签名 HAP。设备和账号在线同步另行验收。

有限向量不证明任意输入或任何环境绝对一致。没有业务调用的方法、完整未知 group、所有损坏 wire 组合、全部非法 UTF-8、真实账号/网络故障矩阵、Android 和 HarmonyOS 设备运行仍不由这些测试证明。新增领域能力仍需原 UI/JIDE 目录、状态、权限和直接行为测试；不要把生成客户端作为万能助手工具。

### 2026-10-08 本次实际验收

完整 `npm run verify` 已通过：2,930 项仓库测试，Rust fmt/clippy、真实 Core 与沙箱测试，描述/RPC 核对、生产协议联测，以及构建锁内 clean 双架构签名 HAP。HAP 警告 accepted=268、unexpected=0，没有修改警告基线。Rust arm64 增量缓存曾报告一次拒绝访问，编译、链接和签名均成功；此警告不冒充缓存写入成功。

独立 `JIDECARDS_SYNC_LOCAL=1` 的 `online_sync_check` 通过锁定 Core 本地服务器登录、完整下载、双向增量、ID/GUID/字段/旗标、WAV 媒体字节及合成数据删除，报告为 `tmp/core-online/run-Dn4API/report.json`。没有访问真实账号或用户集合。

初次清单复核补记了五个特殊契约入口，并增补 number writer 非法输入断言及生产 COLPKG 导入/重开/身份验证。当时的 ArkTS 协议、领域 Service、原生生产源码、依赖和构建输入保持上述 HAP 验收时的字节。初次收尾曾通过 `npm test -- tooling` 的 289 项测试、11 项文档契约、完整 `protocol:check` 和 `protocol:test-core` 的 29 组旧／新真实 Core 对照。完整日志为 `.local/protocol-verify.log`，Core 联测为 `.local/protocol-core-final.log`。

继续复核期间，共享 UI 任务又修改了应用文件。当时一次 `npm test -- tooling` 为 290 通过、1 失败，失败是公共 UI 边界：`DialogFrame.ets`、`MenuItem.ets`、`MenuSurface.ets` 新依赖 `utils/AppMotion`，违反当时的 common 直接依赖门禁；现场保存在 `.local/protocol-tooling-shared-ui.log`，本任务没有代替其所有者修改实现或白名单。上述初次 HAP 是修改前联合工作树的成功证据，不覆盖之后的共享 UI 改动。单独复核的协议/Service/来源/文档 233 项测试全部通过，官方刷新再生成、描述与 RPC 核对通过，重新生成的描述 SHA-256 未变；相关证据见 `.local/protocol-focused-final.log`、`.local/protocol-refresh-final.log`、`.local/protocol-check-final.log`、`.local/protocol-rpc-final.log`。这次历史失败不能作为当前缺口；下节全面复核已完成之后稳定联合输入的验收。

编程 Agent 查覆盖时读取生成清单的当前 counts 和逐项证据，不复制本节历史测试数量为下一任务的门禁要求。设备安装、HarmonyOS 实机/NAPI 网络、Android runtime、真实 AnkiWeb 及完整冲突/取消矩阵未执行。

### 2026-10-08 全面对照复核

再次审查发现并修复两处迁移遗漏：CSV 元数据的同一 `global_notetype` oneof 分支重复出现时，取最后一段会丢掉前面的 `field_columns`；现按 Core 合并连续同分支消息，分支切换后清空旧映射。新 sint32 reader 原来先 zigzag 再截位，`2^32` wire 载荷会错误得到 `-2147483648`；现先缩窄再 zigzag，与旧 Card decoder 和锁定 Core 同为 0。两项都有旧／新和官方 prost 直接回归。

复核还补齐 DeckConfig.usn=-1、负数未知枚举、超出声明 32 位范围输入的差异记录，并按 Core 拒绝溢出的 64 位 varint 和非法标签。修复后的扩展对照为 13,545 组：5,381 组编码／修改字节、7,006 组解码值、1,158 组错误结果；其中两组是已明确验证的统计修正。领域调用 155 组中 151 组成功、4 组验证原拒绝／解码错误；原生 Core 语义测试 3 项通过。上述数量是本次实际范围，有限对照仍不能证明任意输入“完全一致”。

修复后实际执行 `npm run verify` 全部通过：2,949 项 Node 测试、Rust fmt/clippy、24 组原生套件的 107 项测试、沙箱 10 项测试、描述/RPC 核对、29 组旧／新生产协议与真实 Core 对照，以及构建锁内 clean 双架构签名 HAP。HAP accepted=268、unexpected=0，警告基线未修改；减少的一项 SDK 混淆提醒仅记录，不顺带改基线。完整日志为 `.local/protocol-audit-verify.log`，专项日志为 `.local/protocol-equivalence.log`、`.local/protocol-service-forwarders.log` 和 `.local/protocol-audit-core-semantics.log`。验证期间及结束时核对的 1,255 份源码／测试／依赖输入无变化，指纹记录为 `.local/protocol-audit-verification-inputs.json`。当前生成清单仍为 330 个上游消息、8 个私有消息、49 个枚举、239 个 Backend 方法、208 个原导出入口；98 个没有调用的 Core 方法继续标为未接入。锁文件及四项 Core 补丁没有改动。设备安装、真实用户集合和真实账号验证未执行。

参考仅采用官方 Android Backend 的 [build.rs](https://github.com/ankidroid/Anki-Android-Backend/blob/main/rslib-bridge/build.rs)、[proto.rs](https://github.com/ankidroid/Anki-Android-Backend/blob/main/rslib-bridge/proto.rs) 与[架构说明](https://github.com/ankidroid/Anki-Android-Backend/blob/main/docs/ARCHITECTURE.md)：描述/helper 驱动 raw wrapper，再保留领域层。本任务没有复制 Android 平台实现，也没有更改 Core 版本。
