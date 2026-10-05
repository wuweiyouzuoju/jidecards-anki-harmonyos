# `native/` 局部规则

## 适用路径

本规则适用于 `native/` 下 Rust、C/C++、FFI、生成代码和 Anki 上游适配改动。

## 修改边界

- 保留锁定的 Rust 工具链、包名、FFI 语义和 Anki 协议；跨边界数据先核对编码、错误和生命周期。
- Native 层不依赖页面生命周期；ArkTS 侧通过既有桥接入口调用，不在页面中复制协议逻辑。
- 上游或生成代码变更必须说明来源、锁定版本和再生成/验证方式。

## 验证

- 运行受影响的真实 Core/沙箱行为测试及必要 fmt/clippy，不附带无关的全部 Node 测试。Core 主机完整入口为 `powershell -NoProfile -ExecutionPolicy Bypass -File tools/build-native.ps1 -Target host-test`；沙箱使用 `build-agent-sandbox.ps1 -Target host`。
- 涉及 RPC、生成接口或 Anki checkout 时，同时运行 `node tools/verify-rpc-index.mjs`，并报告上游依赖是否可用。
- 需要 HAP 集成时补一次增量构建；FFI、协议、工具链/依赖升级或大范围集成按[分级验证](../../../docs/development/verification.md#按变更路径选择验证)运行完整 `verify`。设备行为仍需单独验收。
