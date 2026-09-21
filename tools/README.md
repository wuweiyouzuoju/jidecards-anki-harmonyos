# 工具入口

从仓库根执行。默认验证只运行本地测试，不启动真实 Provider 请求或内容发行工具。

| 用途 | 入口 | 说明 |
| --- | --- | --- |
| 领域/完整 Node 回归 | `npm test -- <领域>` / `npm test` | 清单 `npm test -- --list` |
| 最终本地验证 | `npm run verify` | 分阶段失败即停；细节见 [验证说明](../docs/development/verification.md) |
| 工具链诊断 | `doctor.mjs` | 检查本机 DevEco、Node、Rust |
| 构建 | `build-app.ps1`、`build-native.ps1` | 其他 clang/zig cmd 是构建适配器 |
| 本机签名 | `check-signing.mjs`、`signing-config.ts` | [配置和构建注入](../docs/development/signing.md)，不输出材料值 |
| HAP 检查 | `inspect-hap.ps1` | 检查已有产物 |
| 源码副本 | `npm run export:source -- <新目录>` | 保留源码与测试，只在副本脱敏签名字段，不覆盖已有目录 |
| 卡片浏览器回归 | `test-card-template-browser.mjs`、`test-math-rendering-browser.mjs`、`test-card-colors-browser.mjs` | 需要对应浏览器环境，按脚本参数运行 |
| 颜色专项分析 | `verify-contrast.mjs`、`verify-contrast-official.mjs`、`verify-hardcoded-colors.mjs` | 专项输出，不是完整验收 |
| 第三方资源/纹理维护 | `vendor-mathjax.mjs`、`generate-iridescent-textures.mjs` | 显式资源更新任务才运行，检查许可和字节保真 |
| 兑换内容发行 | `redemption-issuer.mjs`、`redemption-ui.mjs` 及启动器 | 业务发行入口，不属于测试；私钥由外部工具环境提供 |
| 历史实验 | `experimental/` | 不进源码导出或自动验证；以当前模型/协议为准 |

`tests/` 是测试，`patches/` 是构建所需上游补丁；不要因“工具目录清理”删除这两个目录。
