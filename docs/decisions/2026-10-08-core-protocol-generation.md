# 描述驱动的 Core 协议生成与领域契约

日期：2026-10-08。状态：当前实施。

## 决策与原因

使用锁定官方 proto 描述与 `anki_proto_gen::get_services` 生成静态 ArkTS 消息/RPC、既有中文索引、原生重复消息和调度字段 Schema。`tools/core-protocol.mjs` 独占再生成、过期检查和语义 diff；私有协议使用独立 proto 和 RPC manifest，通过同一生成流程。生成 Rust 源码文本只作显式比较，不再充当协议标准。

手写字段表和重复消息不能由 Agent 可靠盘点、核对或升级；单一描述来源可以显示字段 presence/optional/oneof/default 以及委托编号变化。官方信息定义协议，原有领域契约定义产品行为；两者的差异必须命名、比较并验证。

## 影响范围与边界

所有生产 `proto/messages` 转为领域映射，保留原导出函数和 Service 调用契约；后端会话、C++/Rust 桥和四项已跟踪 Core 补丁保持原责任。生成范围不改变 UI/JIDE 能力或授权，无领域调用仍标未接入。保留 number 安全整数契约、默认省略策略及明确的末次嵌套投影，增加 SchedulingStates raw 保留；负数 int32 和多段统计 repeated 的旧问题按 Core 纠正并保留差异断言。

原实现冻结为不可变测试 oracle，不保留两套生产协议；不按文件长度或行数拆分责任，也不增加新框架、仓库或动态万能 RPC 工具。

## 验证与接手

输入真实性由独立官方 clean checkout、锁定提交、origin、源码/helper/依赖锁指纹与描述 SHA-256 核对；日常支持源码归档。生成过期检查覆盖全部产物，逐导出函数差分、原生旧／新执行与临时真实 Core 测试各自提供字节、值、行为证据。ArkTS 兼容性由实际 clean 双架构签名 HAP 证明，有限测试不声明任意输入绝对等价。

入口、产物、迁移清单、合理差异、重现命令和未覆盖范围见[当前协议领域说明](../development/core-protocol.md)。
