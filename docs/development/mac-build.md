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

迁移后的测试失配、SDK 诊断与实际验证见 [Mac 回归诊断](../archive/development/mac-regression-2026-10-25.md)。

鸿蒙电脑专用产物见[记得闪卡 PC 构建](pc-build.md)。


## 干净检出验收记录

2026-11-22 从提交 `18baa1a1` 新检出，在空构建目录检出 Anki `e64c6b1` 及两个 FTL 子模块。按 [README 构建入口](../../README.md#从源码构建)准备公共 HAR 和本机签名后，`ohpm install`、`npm ci` 均成功。Mac JBR 路径识别已补入 `npm run doctor` 并在同一检出验证通过。随后 `npm run build:app` 及显式 `npm run build:app -- --clean` 均通过。

- 签名包版本为 `26.11.22.19`（3159），双架构为 arm64-v8a 和 x86_64。
- clean 构建警告门禁接受 268 条基线警告，新增未接受警告为 0。
- SDK `hap-sign-tool verify-app` 验签通过，产物 SHA-256 为 `dd71e67616d0167a3fb75b5f9c9c878741b13e1fe2657d0839f4b534874d7c97`。
- 设备验证按独立包版本与哈希查阅[鸿蒙真机验收](device-acceptance.md)。
