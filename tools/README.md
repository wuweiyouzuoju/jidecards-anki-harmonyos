# 工具入口

从仓库根执行。默认验证只运行本地测试，不启动真实 Provider 请求或内容发行工具。

| 用途 | 入口 | 说明 |
| --- | --- | --- |
| 选择题制卡 | `npm run choice:validate -- source.json` / `npm run choice:build -- source.json output.apkg` / `npm run choice:inspect -- output.apkg` | Node 24 校验源文件；打包/验包另需 Python，打包依赖 `choice-requirements.txt`；[规范与 Agent 指南](../docs/choice-authoring.md) |
| 选择题 APKG 集成回归 | `npm run choice:test` | 实际生成并读取 ZIP/SQLite，检验字段、GUID 和损坏输入；需要上述 Python 打包依赖，不等于真机/AnkiWeb 验收 |
| 选择题 Anki 引擎验收 | `python tools/choice-anki-roundtrip.py` | 独立 Python 环境安装 `anki==26.5`；临时集合验证导入、模板渲染、重复导入和含 Hard/Good 记录的导出再导入，不访问真实账户 |
| 变更影响计划 | `npm run impact` | 支持 `--kind cosmetic|behavior|compile|integration|release`、`--json`、`--base <ref>` 或 `--paths <路径> ...`；按影响建议局部检查，只读，不执行验证，详见 [验证说明](../docs/development/verification.md) |
| 领域/完整 Node 回归 | `npm test -- <领域>` / `npm test` | 清单 `npm test -- --list` |
| JIDE 软件认知同步 | `node --experimental-transform-types --import ./tools/tests/register-ts-hook.mjs --test tools/tests/ai-agent-app-structure.test.mjs tools/tests/ai-agent-app-settings.test.mjs` | 新设置组件自动扫描登记 ID/资源，真实结构回归验证新增、改名、显隐和删除；漏登记关系失败，不保证发现任意手写 UI；[开发规范](../docs/development/coding-agent.md#软件升级时的认知同步) |
| Anki 官方教程完整性 | `node tools/vendor-anki-manual.mjs --check` | 离线检查选章、原文/许可证 SHA-256、范围索引与归属；失败退出非零；同一检查包含在 Agent 测试中 |
| 更新官方教程快照 | `node tools/vendor-anki-manual.mjs --write --source-dir <官方-Anki-checkout>` | 明确更新才写；Git + Node，读取 origin 为 ankitects/anki 的已提交 HEAD，不联网、不读取改稿、不改 Core 锁；选择在 `anki-manual-topics.json`，需复核差异并跑 Agent 测试/增量 HAP |
| 仓库门禁 | `npm run verify -- repo` | Node、文档、架构和资源契约；CI 使用此模式 |
| 原生门禁 | `npm run verify -- native` | 仓库门禁、Rust 主机测试和环境检查，不构建 HAP |
| Anki / AnkiDroid 核心互通 | `npm run test:interop` | 锁定 Core 主机、生产 Rust ABI 与恢复行为，创建独立样本与报告；[前提与未验证范围](../docs/development/core-interop.md)，不操作设备或账号 |
| 本地代码沙箱 | `powershell -NoProfile -ExecutionPolicy Bypass -File tools/build-agent-sandbox.ps1 -Target all` | 真实引擎测试与双架构 probe；正式构建自动使用 app 目标，[前提与范围](../native/agent-sandbox/README.md) |
| 沙箱桥接验收 | `powershell -File tools/build-app.ps1 -Test`；`node tools/test-agent-sandbox-app.mjs <connect-key>` | 当前 signed 主包安装后运行测试模块，不访问卡库 |
| 沙箱第三方许可 | `node tools/generate-agent-sandbox-notices.mjs --check` | 离线校验随包许可；升级后显式 --write 生成并审查 |
| 沙箱设备验收 | `node tools/test-agent-sandbox-device.mjs <connect-key> 20` | 自动识别架构、构建并执行独立测试与多样本 probe，保存 JSON；不安装应用、不访问卡库 |
| Agent 在线评测 | `node --experimental-transform-types --import ./tools/tests/register-ts-hook.mjs tools/test-agent-live.mjs --run` | 显式发送合成任务，需 `DEEPSEEK_API_KEY`，产生 API 费用；不读写用户卡库，环境变量与验收范围见[应用内 Agent](../docs/development/agent.md#执行环境与错误恢复) |
| RPC 映射门禁 | `node tools/verify-rpc-index.mjs` | 锁定协议输入指纹与逐项语义映射；生成/升级步骤见 [验证说明](../docs/development/verification.md#rpc-协议门禁) |
| 集成/发布完整验证 | `npm run verify` | 环境、仓库、Rust 主机测试和签名 HAP；分阶段失败即停，普通任务按影响选择相关检查 |
| 工具链诊断 | `doctor.mjs` | 检查本机 DevEco、Node、Rust |
| 构建 | `build-app.ps1`、`build-native.ps1` | 其他 clang/zig cmd 是构建适配器 |
| HAP 警告 | `npm run build:app -- -Clean` | 精确依赖/SDK 基线，项目新警告失败；[范围与维护](../docs/development/verification.md#hap-警告门禁) |
| 本机签名 | `check-signing.mjs`、`signing-config.ts` | [配置和构建注入](../docs/development/signing.md)，不输出材料值 |
| HAP 检查 | `inspect-hap.ps1` | 检查已有产物 |
| 源码副本 | `npm run export:source -- <新目录>` | 保留源码与测试，只在副本脱敏签名字段，不覆盖已有目录 |
| 卡片浏览器回归 | `test-card-template-browser.mjs`、`test-card-flip-browser.mjs`、`test-math-rendering-browser.mjs`、`test-card-colors-browser.mjs` | 需要对应浏览器环境；翻面测试使用生产会话与真实导航，命令见 [学习与媒体](../docs/development/study-media.md#卡片模板脚本与样式) |
| 图片遮罩浏览器回归 | `node --experimental-transform-types --import ./tools/tests/register-ts-hook.mjs tools/test-image-occlusion-browser.mjs` | 真实 Edge/Canvas 检查形状、两种模式、答案轮廓及文字，并以触摸输入验证遮罩上的预览左右滑与取消；`PLAYWRIGHT_MODULE` 可指定模块入口，截图在 `.local/io-preview-browser.png`，不操作卡库或设备 |
| 颜色专项分析 | `verify-contrast.mjs`、`verify-contrast-official.mjs`、`verify-hardcoded-colors.mjs` | 专项输出，不是完整验收 |
| 第三方资源/纹理维护 | `vendor-mathjax.mjs`、`generate-iridescent-textures.mjs` | 显式资源更新任务才运行，检查许可和字节保真 |
| 兑换内容发行 | `redemption-issuer.mjs`、`redemption-ui.mjs` 及启动器 | 业务发行入口，不属于测试；私钥由外部工具环境提供 |
| 历史实验 | `experimental/` | 不进源码导出或自动验证；以当前模型/协议为准 |

`tests/` 是测试，`patches/` 是构建所需上游补丁；不要因“工具目录清理”删除这两个目录。

共享工作树交付或装机使用 `npm run build:app -- -SkipRust -ArtifactDirectory .local/<任务>/artifact`：构建锁释放前复制已验证的 signed HAP、原始日志和警告报告，失败不发布新产物，避免后续构建覆盖本次验收依据。仅确认原生库有效时使用 `-SkipRust`。大包签名 Java 堆不足时可临时设置 `JAVA_TOOL_OPTIONS=-Xmx2048m`；精确的单一堆参数启动公告不是编译诊断，其他警告仍需通过门禁。

JIDE 对话公式浏览器回归：`node --experimental-transform-types --import ./tools/tests/register-ts-hook.mjs tools/test-agent-math-browser.mjs`。需要 Playwright/本机 Edge，可用 `PLAYWRIGHT_MODULE` 指定模块入口。执行生产 Markdown 公式标记、排版队列和固定离线引擎，报告与截图在 `tmp/agent-math/`；阻断所有额外请求，不调用模型。覆盖数学、mhchem、流式接续、代码排除、长公式横向位置和深浅/宽窄布局；不替代 ArkWeb 的真机高度与手势验收，边界见 [对话公式](../docs/development/agent.md#对话中的数学与化学公式)。

JIDE PDF/OCR 原生回归：构建并 `install -r` 当前主 HAP 后，`npm run build:app -- -SkipRust -Test`，再运行 `node tools/test-agent-documents-device.mjs <connect-key>`。设置 `DEVECO_HOME` 指向 DevEco Studio 安装目录。只处理合成资料，无模型调用或卡库写入；边界见 [文件资料与按页制卡](../docs/development/agent.md#文件资料与按页制卡)。

学习手势浏览器回归：`node --experimental-transform-types --import ./tools/tests/register-ts-hook.mjs tools/test-study-gestures-browser.mjs`。需要 Playwright 和本机 Edge，可用 `PLAYWRIGHT_MODULE` 指定模块入口。测试生产脚本的真实触摸双击、左右滑动、控件点击、原生纵向滚动与旧卡面事件取消；不替代 ArkWeb 与原生教学层的设备验收。


RPC 常量生成：`node tools/generate-rpc-index.mjs [--check]`；真实 Core 跨平台测试：`node tools/test-anki-core.mjs`。输入、前提与自托管 HAP 路线见 [验证说明](../docs/development/verification.md)。

按钮反馈审计：`arkui-click-targets.mjs` 提供 ArkUI 点击目标与修饰链解析，`tests/ui-press-feedback.test.mjs` 检查全应用可操作节点统一接入 PressFeedback / GlassSurface / PrimaryGlassSurface，遮罩、事件屏障、Span 文内链接和桌面卡片按明确例外处理。该检查不是设备触摸测试。
