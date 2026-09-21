# 验证与工具入口

[返回任务索引](../../PROJECT_CONTEXT.md) · [工具目录](../../tools/README.md)

## 环境与命令

Node 24.x 与 `package.json` / CI 一致。首次进入或 lockfile 变化后运行 `npm ci`。
`npm test` 先检查 Node 版本与实际类型转换能力，再自动发现全部测试，不靠手写完整文件名单。

| 命令 | 能证明什么 | 不能替代什么 |
| --- | --- | --- |
| `npm test -- --list` | 当前可选领域及测试文件数 | 测试执行 |
| `npm test -- home`（或 study/sync/browser/media/agent/ui/tooling/repo） | 领域内快速反馈 | 完整回归、编译、真机 |
| `npm test` | 全部 Node 行为与静态约束测试 | ArkTS 类型检查、Kit/ArkUI 实际行为 |
| `npm run verify -- repo` | 可移植仓库门禁，CI 使用同一入口 | Rust、HAP、设备 |
| `npm run doctor` | 本机工具链与版本诊断 | 实际构建、签名可用性 |
| `npm run verify -- native` | 环境、全部 Node、Rust fmt/clippy 门禁和真实 Core 主机测试 | HAP 与设备 |
| `npm run verify` | 环境、全部 Node、Rust 主机、双架构 Rust 与签名 HAP 构建 | 设备交互验收 |
| `npm run build:app` | 当前配置的完整应用构建 | 行为测试 |
| `npm run test:release` | 源码导出安全性、字节保真、签名配置合并与脱敏回归 | 已生成副本自身的完整验证 |

领域筛选是显式的开发反馈，不是完整依赖影响分析。`all` 总从磁盘发现测试；新增测试无须登记进完整清单。
增加新的业务领域或代表性测试名称时调整 `tools/test-suites.mjs`。既有混合行为/静态测试逐步按真实改动迁移，不靠文件名声称全部是 runtime 测试。

`verify` 按阶段打印 environment/repository/native/hap，失败立即非零退出。结束报告必须写明执行的模式，repo 成功不等于整个应用验证完成。

## 源码导出

`npm run export:source -- <新目录>` 从当前 Git 工作树导出已跟踪和未被忽略的源码文件，包含未提交修改、新文件、文档、Agent 说明和测试；不需要提交或上传。

- 输出必须是父目录已经存在的新目录。拒绝源目录、子目录、祖先、已有目录，以及解析 junction/symlink 后重叠的路径；不删除或覆盖已有目录。
- 代码、注释和第三方资源保留原始字节。只有 `build-profile.json5` 通过 JSON5 解析后清空已知签名字符串字段并重新序列化，格式化会移除该配置的注释；解析或字段类型不匹配会停止。
- 忽略的构建产物、本机依赖、`tools/experimental/` 和 `.local/` 不导出；`.local/` 即使误被跟踪也排除，其余被跟踪文件不会仅因后来写入 ignore 而消失。导出用于本地验证，不自动发布。
- 在输出目录运行 `npm ci`、`npm run verify -- repo`。要构建 HAP，按 README 准备锁定 Anki checkout 和本机签名；不复制签名身份材料。
- 中途文件系统错误可能留下不完整的新目录；命令返回失败，选另一个新目录重试。不要把失败副本当作可交付产物。

旧文件名 `strip-for-release.mjs` 现在只表示历史工具入口，不再剥离注释。正常 HAP 构建直接使用开发工程，不经源码导出。

## 设备验收

仅覆盖安装 `hdc -t <connect-key> install -r <signed-hap>`，然后 force-stop / 启动当前包。禁止 uninstall 清数据。
本轮改首页任务协调时，检查：启动公告/云端引导/入门顺序；设置手动同步返回首页；忙碌时外部 APKG 排队；前后台与离页后不冒出迟到弹窗。
实际账户网络同步和用户文件导入需使用适当测试数据；没执行的场景单独报告。构建和安装成功不证明这些交互通过。

主机测试：已有 VS/MSVC 时直接使用锁定 Rust；存在 `JIDECARDS_TOOLCHAINS` 或 `work/toolchains` 时沿用 bundled GNU/Zig。doctor 检查相应依赖，最终仍以真实测试和链接结果为准。

签名材料由 [签名说明](signing.md) 定义。`build-app.ps1` 构建前检查本机配置/文件，构建后拒绝缺少 signingConfig 或缺失 signed HAP 的结果；Hvigor 的普通 BUILD SUCCESSFUL 不能独自作为签名构建成功证据。

设备回归还覆盖：浏览批量操作中切换选择与离页；学习编辑、删除确认、埋藏/恢复后返回；AI 批量保存中离页、连续保存与附件解析。未连接设备时明确记为未执行。
