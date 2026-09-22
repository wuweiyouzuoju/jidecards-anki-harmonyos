# 本机签名配置

[返回任务索引](../../PROJECT_CONTEXT.md) · [完整验证](verification.md)

公共 `build-profile.json5` 只声明 SDK、产品、模块与构建模式。签名从 `.local/signing.json` 读取；环境变量 `JIDECARDS_SIGNING_CONFIG` 可指定另一份 JSON 文件，绝对路径或相对仓库根目录均可。

1. 将 [配置模板](../../config/signing.example.json) 复制到 `.local/signing.json`。
2. 填入已有 DevEco 签名配置的原始字段值，包括证书、profile、keystore、alias、密码与算法；材料文件路径相对仓库根目录，推荐绝对路径。需要创建首次开发签名时，可先在 DevEco Signing Configs 获取材料，再移入本机文件。
3. 执行 `node tools/check-signing.mjs` 检查结构与文件，再执行 `npm run build:app` 或 `npm run verify`。

已有安装的应用必须保持原证书与身份；迁移配置位置不需要换证书，也不需要卸载。当前机器的迁移保留了原字段值。`.local/` 被 Git 忽略，并被源码导出工具明确排除。

根 `hvigorfile.ts` 使用 SDK 提供的 `afterNodeEvaluate` / `OhosAppContext.setBuildProfileOpt` 注入签名，在子模块读取产品信息前完成。不要改成 `nodesEvaluated`：此时模块可能已固定无签名的产品快照。IDE 和命令行共享此入口。

没有本机文件且未显式指定环境路径时，直接调用 Hvigor 可以生成 unsigned HAP 供编译检查；`build-app.ps1` 与完整 verify 要求签名配置，缺少即失败。显式环境路径不存在、配置无效或产品不匹配时直接报错，不静默退回无签名构建。错误只打印字段名，不打印材料值。

修改签名注入后必须观察实际 SignHap 成功与 signed HAP 产物，不能只看整个 Hvigor 命令退出成功。CI 的便携仓库验证不需要签名材料；签名构建在配置了 DevEco 与签名的主机执行。

`tools/signing-config.ts` 是 Node/Hvigor 的 TypeScript 模块，字段遍历使用 `keyof SigningMaterial` 保持索引类型明确。修改此模块后，还须使用当前 DevEco 自带的 Node/Hvigor 执行 IDE 同步（`--sync -p product=default --analyze=normal --parallel --incremental --daemon`），验证构建脚本类型检查；Node 行为测试不会代替这项检查。
