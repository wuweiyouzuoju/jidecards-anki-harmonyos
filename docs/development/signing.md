# 本机签名配置

[返回任务索引](../../PROJECT_CONTEXT.md) · [完整验证](verification.md)

公共 `build-profile.json5` 只声明 SDK、产品、模块与构建模式。签名从 `.local/signing.json` 读取；环境变量 `JIDECARDS_SIGNING_CONFIG` 可指定另一份 JSON 文件，绝对路径或相对仓库根目录均可。

1. 将 [配置模板](../../config/signing.example.json) 复制到 `.local/signing.json`。
2. 填入已有 DevEco 签名配置的原始字段值，包括证书、profile、keystore、alias、密码与算法；材料文件路径相对仓库根目录，推荐绝对路径。需要创建首次开发签名时，可先在 DevEco Signing Configs 获取材料，再移入本机文件。
3. 执行 `node tools/check-signing.mjs` 检查结构与文件，再执行 `npm run build:app` 或 `npm run verify`。

已有安装的应用必须保持原证书与身份；迁移配置位置不需要换证书，也不需要卸载。当前机器的迁移保留了原字段值。`.local/` 被 Git 忽略，并被源码导出工具明确排除。

平板覆盖安装须选择与已安装包对应的开发测试配置。本机 `.local/tablet-signing.json` 已选择现有 `ceshi` 配置，可通过 `JIDECARDS_SIGNING_CONFIG` 临时指定后构建；不修改公共默认发布配置。正式 profile 的包可能被开发设备拒绝，返回 `9568322`（应用来源不受信任），不能把签名构建成功当作安装成功，也不要通过卸载处理。最终以 `install -r` 的成功消息核对结果。

2026-10-04 按用户指定，用既有 `ceshi` 配置签名的 2.9.10 开发包在 SLG-W50 平板覆盖安装成功。开发签名指纹与安装前包不同，系统保持相同 `appIdentifier` 并在 `oldAppIds` 中保留原应用 ID；这项结果仅对应本机现有材料和该平板，不能类推其他签名可直接覆盖。安装后版本由 Bundle Manager 核对；平板锁屏使启动检查未完成，安装成功不称为设备功能验收。记录位于忽略的 `.local/version-2.9.10-ceshi/`。

覆盖前读取当前 Bundle Manager 的 `appProvisionType`、`appDistributionType` 和 `appIdentifier`；历史安装记录不能替代当前状态。2026-10-05 平板已是 release/app_gallery profile，使用旧 `ceshi` 调试 profile 被拒为 `9568286`（provision type 不同）。现有 `.local/signing.json` 正式材料保持身份并通过 SDK 签名验证，但调试安装被拒为 `9568322`；这类发布 profile 须通过对应发布渠道更新，不能把换回正式签名当作 USB 覆盖安装的解法。参见 [官方 bm 错误说明](https://developer.huawei.com/consumer/cn/doc/harmonyos-guides/bm-tool)。`9568332` 表示签名身份不一致，不能以卸载绕过；`hdc` 即使进程退出码为 0 也可能返回安装失败文字，验收须检查消息并重查 Bundle Manager。

2026-10-06 用户明确指定 `ceshi`，通过临时 `JIDECARDS_SIGNING_CONFIG=.local/tablet-signing.json` 构建白板修复包，未修改默认发布配置。增量签名构建及警告门禁通过（unexpected=0），SLG-W50 的 `hdc -t 7JDUN26418G04789 install -r` 返回安装成功；安装后 Bundle Manager 确认为 2.9.10 / 2991、debug / none，appIdentifier 保持 `6917611264192499746`。此次安装前查询未返回该包信息，不能将结果描述为 release 直接覆盖成 debug。产物与构建、安装、Bundle Manager 记录保存在 `D:\Projects\jidecards-penkit-2026-10-05\ceshi-artifact-2026-10-06` 及同级 `ceshi-*-2026-10-06.*`；本任务未执行卸载、清数据、启动或功能验证。

根 `hvigorfile.ts` 使用 SDK 提供的 `afterNodeEvaluate` / `OhosAppContext.setBuildProfileOpt` 注入签名，在子模块读取产品信息前完成。不要改成 `nodesEvaluated`：此时模块可能已固定无签名的产品快照。IDE 和命令行共享此入口。

没有本机文件且未显式指定环境路径时，直接调用 Hvigor 可以生成 unsigned HAP 供编译检查；`build-app.ps1` 与完整 verify 要求签名配置，缺少即失败。显式环境路径不存在、配置无效或产品不匹配时直接报错，不静默退回无签名构建。错误只打印字段名，不打印材料值。

修改签名注入后必须观察实际 SignHap 成功与 signed HAP 产物，不能只看整个 Hvigor 命令退出成功。CI 的便携仓库验证不需要签名材料；签名构建在配置了 DevEco 与签名的主机执行。

`tools/signing-config.ts` 是 Node/Hvigor 的 TypeScript 模块，字段遍历使用 `keyof SigningMaterial` 保持索引类型明确。修改此模块后，还须使用当前 DevEco 自带的 Node/Hvigor 执行 IDE 同步（`--sync -p product=default --analyze=normal --parallel --incremental --daemon`），验证构建脚本类型检查；Node 行为测试不会代替这项检查。
