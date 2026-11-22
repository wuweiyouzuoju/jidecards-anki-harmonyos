# 记得闪卡 PC 构建与发布

同一个工程的 `default` 产品沿用 `com.jide.kapian`，面向手机、平板和鸿蒙电脑。独立产品 `pc` 对应「记得闪卡 PC」和 `com.jide.kapian.pc`，AppGallery App ID 为 `6917622421816098265`，仅声明 `2in1`。两个应用可在同一台电脑安装；数据和本机授权各自独立，不会自动迁移。两者共享源码与当前源码版本。

设备和应用身份分别按[华为多目标构建指南](https://developer.huawei.com/consumer/cn/doc/harmonyos-guides/ide-customized-multi-targets-and-products-guides/)配置。电脑版用独立的正式发布 Profile `JideCards-PC-Release`，不得使用原版包的 Profile。在本机签名 JSON 中显式为 `pc` 添加映射。AppGallery 只向独立条目上传电脑版 APP。

DevEco Studio 选择 `pc` 产品，在 Release 模式下构建整应用。Mac 可先以设置好正式签名的环境执行：

```sh
node tools/check-signing.mjs pc
npm run build:app -- --pc --release
```

独立 HAP 输出在 `entry/build/pc/outputs/pc/`，整应用 APP 输出在 `build/outputs/pc/`。核对包名、`debug: false`、版本号和最终包中唯一的设备声明 `2in1`，并用 SDK 验签。

本机 MCP 使用不同端口。原版使用 `127.0.0.1:28761`，PC 版使用 `127.0.0.1:28762`。从希望 WorkBuddy 操作的应用复制 MCP 配置。

[工单 D654589](external-agent.md#工单依据和验证边界)给出的最小化持续响应条件仅适用于只声明 PC 的应用。正式发布前应在鸿蒙电脑检查前台、失焦和最小化后的 MCP 调用。窗口关闭、锁屏、进程终止是不同场景；写入仍须确认。
