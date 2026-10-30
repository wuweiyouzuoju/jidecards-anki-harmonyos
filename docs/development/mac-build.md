# Mac 构建入口

使用 `source ~/.zprofile` 加载 Mac DevEco、Node 24、JBR、OHOS NDK、Rust 1.92 和 protoc。保留 rust-toolchain.toml、Cargo.lock 与第三方 Anki 源码。

```sh
npm ci
npm run build:app -- --unsigned
```

`tools/build-app.mjs` 在 Windows 委托原 PowerShell 入口；Mac 检查并应用已有 Anki 补丁，编译双架构 Core 与沙箱，安装 OHPM 依赖，执行 HAP 与警告检查。默认要求现有本机签名配置；`--unsigned` 显式仅验收编译，不注入签名材料。支持 `--release`、`--clean`、`--skip-rust`；即使跳过 Core 仍编译沙箱。并发构建使用 `.hvigor/mac-build.lock`，异常终止后先确认无构建进程再移除锁。

正式签名沿用原证书和应用身份，旧机器加密密码需在新机器重新配置，不用电脑登录密码替代证书密码。Windows 的原有参数仍可传给对应 PowerShell 入口。

上架构建使用 `npm run build:app -- --release`。DevEco 切换到 release 后不会自动执行 Cargo；如果 CMake 提示缺少 `target/<OHOS target>/release/libjidecards_core.a`，先运行此入口补齐双架构 Release 库，再在 DevEco 构建。debug 与 release 产物必须各用其目录，不能复制 debug 库冒充 release。

完整 verify 的 Windows 原生编排尚未迁移；Mac 编译使用本入口，仓库测试使用 `npm run verify -- repo`。构建验收与设备功能验收分别记录。

迁移后的测试失配、SDK 诊断与实际验证见 [Mac 回归诊断](mac-regression-2026-10-25.md)。
