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

同日，用户再次要求安装真机检测修正版，已将 `availability-fix-ceshi-2026-10-06\entry-default-signed.hap` 覆盖安装到同一 SLG-W50，返回 `install bundle successfully`。产物 SHA256 为 `3FABFB462EF914C43910D53F701994B932A69BB8F6F5F09A41E5C909D4ADF412`；安装前后均为 debug / none、2.9.10 / 2991，appIdentifier 相同。安装与前后 Bundle Manager 日志为同级 `availability-install*-2026-10-06.log`；只安装和查询包信息，未启动应用或执行功能验证。

用户随后报告手动打开白板闪退，读取既有崩溃记录并修正官方 Context、Controller 初始化与异常边界后，继续沿用用户授权的 `ceshi` 和覆盖安装方式。已将 `context-final-ceshi-2026-10-06\entry-default-signed.hap` 安装到同一平板，返回 `install bundle successfully`；SHA256 为 `6E1308E95FB05F0FCF06E2D8D788C31B3867D94980B60668B7F08A0A15DAFD36`。安装前后 Bundle Manager 均为 debug / none、2.9.10 / 2991，appIdentifier 保持 `6917611264192499746`。记录为同级 `context-install*-2026-10-06.log`；只读取日志、覆盖安装和查询包信息，没有卸载、清数据、启动应用或运行验证。

同日，用户指定将首页紧凑按钮和公共无尖角菜单修正版安装到 `7JDUN26418G04789`。默认发布签名包被设备拒绝为 `9568322`；查询确认设备当前为 debug / none 后，临时指定现有 `.local/tablet-signing.json` 的 `ceshi` 配置重新构建，SDK 校验 HAP 和 profile 均成功，`install -r` 返回 `install bundle successfully`。安装前后 appIdentifier 均为 `6917611264192499746`，版本均为 2.9.10 / 2991，未卸载、清数据或修改默认签名配置。产物 SHA256 为 `6E1308E95FB05F0FCF06E2D8D788C31B3867D94980B60668B7F08A0A15DAFD36`，保存在 `.local/home-public-menus-ceshi-2026-10-06/`；安装与前后 Bundle Manager 记录为 `.local/home-public-menus-tablet-*-2026-10-06.log` 及 `.local/home-public-menus-tablet-before.log`、`.local/home-public-menus-tablet-after.log`。本次只安装并核对包信息，界面效果由用户查看。

同日，用户要求重新阅读官方资料、审查并安装。重新核对 Pen Kit、相关 ArkUI 文档与已安装 SDK，补修白板隐藏/后台期间的初始化超时及取消回调隔离，移除内部 HSP 路径探测并同步真实回退原因后，用现有 `ceshi` 配置增量签名构建，警告门禁 unexpected=0。已覆盖安装 `D:\Projects\jidecards-penkit-2026-10-05\official-recheck-2026-10-06\ceshi-artifact\entry-default-signed.hap`，设备返回 `install bundle successfully`；SHA256 为 `2390DD2DCDE434E9F042D2523385EFE492BD9AE74A01A17171C815E0690E95F9`。安装前后均为 debug / none、2.9.10 / 2991，appIdentifier 保持 `6917611264192499746`；审查、编译产物检查及安装前后记录在同级审查目录。未卸载、清数据或启动应用，安装不计作真实手写验收。

根 `hvigorfile.ts` 使用 SDK 提供的 `afterNodeEvaluate` / `OhosAppContext.setBuildProfileOpt` 注入签名，在子模块读取产品信息前完成。不要改成 `nodesEvaluated`：此时模块可能已固定无签名的产品快照。IDE 和命令行共享此入口。

同日继续处理用户报告的白板空白，修正动态画布布局约束与初始化/布局分别就绪的判定，使用现有 `ceshi` 配置签名并覆盖安装 `D:\Projects\jidecards-penkit-2026-10-05\empty-canvas-fix-2026-10-06\ceshi-artifact\entry-default-signed.hap`。设备返回 `install bundle successfully`，SHA256 为 `6AE9F4707DB0AA14AA74F17EC5734C1D4D11A3A095CAB107988B1F38BD285213`；安装前后均为 debug / none、2.9.10 / 2991，appIdentifier 保持 `6917611264192499746`。源码指纹、包内布局与回退符号、编译和安装记录保存在同级目录。只读取既有日志、覆盖安装和核对包信息，没有卸载、清数据或启动应用；安装不能证明空白已在真机消失。

没有本机文件且未显式指定环境路径时，直接调用 Hvigor 可以生成 unsigned HAP 供编译检查；`build-app.ps1` 与完整 verify 要求签名配置，缺少即失败。显式环境路径不存在、配置无效或产品不匹配时直接报错，不静默退回无签名构建。错误只打印字段名，不打印材料值。

修改签名注入后必须观察实际 SignHap 成功与 signed HAP 产物，不能只看整个 Hvigor 命令退出成功。CI 的便携仓库验证不需要签名材料；签名构建在配置了 DevEco 与签名的主机执行。

2026-10-06，透明卡面批注修正版使用现有 `ceshi` 配置增量构建、SDK 签名校验并覆盖安装到 `7JDUN26418G04789`，设备返回 `install bundle successfully`。最终包位于 `D:\Projects\jidecards-penkit-2026-10-05\annotation-overlay-2026-10-06\ceshi-artifact\entry-default-signed.hap`，SHA256 为 `5EF63B8B57BE2B3A85F1157DEFF4586D940205D6692761EF891492378AEFE34B`；前后均为 debug / none、2.9.10 / 2991，appIdentifier 保持 `6917611264192499746`。同级 `installation-receipt.json`、`artifact-proof.json`、`review.md` 保留身份、源码、编译符号和检查证据。未修改默认签名配置，没有卸载、清数据、启动或运行手写验收。

该透明层方案随后被用户明确否定：错误地更换了默认华为笔并移动整个卡面。已撤掉手动模式切换/复位和卡面变换，恢复“更多 → 手写”默认接入华为组件；原版只用于真实失败回退，答案操作容器明确靠底部排列。`D:\Projects\jidecards-penkit-2026-10-06\native-pen-restore\ceshi-artifact\entry-default-signed.hap` 用现有 ceshi 配置构建、SDK 校验并覆盖安装到同一平板，返回 `install bundle successfully`；SHA256 为 `DE2C3E52199304A308A88E836698ED6F444C0AAFF942CB2DD33968CEF32397A2`。前后身份和版本保持不变，回执和审查记录在同级目录。该次安装操作未启动或操作应用，回执只证明安装成功；后续用户确认已经可以在原卡片上直接批注，当前功能与验收范围统一见[手写白板](study-media.md#手写白板)，不能把历史未运行验收的记录当作功能不存在的证据。

`tools/signing-config.ts` 是 Node/Hvigor 的 TypeScript 模块，字段遍历使用 `keyof SigningMaterial` 保持索引类型明确。修改此模块后，还须使用当前 DevEco 自带的 Node/Hvigor 执行 IDE 同步（`--sync -p product=default --analyze=normal --parallel --incremental --daemon`），验证构建脚本类型检查；Node 行为测试不会代替这项检查。
