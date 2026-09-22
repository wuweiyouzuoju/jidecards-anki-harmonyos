# `native/` 局部规则

## 适用路径

本规则适用于 `native/` 下 Rust、C/C++、FFI、生成代码和 Anki 上游适配改动。

## 修改边界

- 保留锁定的 Rust 工具链、包名、FFI 语义和 Anki 协议；跨边界数据先核对编码、错误和生命周期。
- Native 层不依赖页面生命周期；ArkTS 侧通过既有桥接入口调用，不在页面中复制协议逻辑。
- 上游或生成代码变更必须说明来源、锁定版本和再生成/验证方式。

## 验证

- 至少运行 `npm run verify -- native`，覆盖环境、全部 Node、Rust fmt/clippy 和主机测试。
- 涉及 RPC、生成接口或 Anki checkout 时，同时运行 `node tools/verify-rpc-index.mjs`，并报告上游依赖是否可用。
- 需要 HAP 集成的改动补运行 `npm run verify`；设备行为仍需单独验收。
