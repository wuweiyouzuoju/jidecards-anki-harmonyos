# jidecards（记得闪卡）

[![CI](https://github.com/wuweiyouzuoju/jidecards-anki-harmonyos/actions/workflows/ci.yml/badge.svg)](https://github.com/wuweiyouzuoju/jidecards-anki-harmonyos/actions/workflows/ci.yml)
[![License: AGPL-3.0-or-later](https://img.shields.io/badge/license-AGPL--3.0--or--later-blue.svg)](LICENSE)
[![HarmonyOS NEXT](https://img.shields.io/badge/platform-HarmonyOS%20NEXT-0a59f7.svg)](https://www.harmonyos.com/)

jidecards（中文名“记得闪卡”）是一个面向 HarmonyOS NEXT 的开源 Anki 卡片学习客户端，支持鸿蒙手机、平板和电脑。它使用 ArkTS/ArkUI 构建原生界面，通过 C ABI 与 Node-API 复用 Anki Rust Core，提供复习、牌组管理、统计、同步和数据维护能力。

**当前源码版本：2.9.6（versionCode 2960）**

应用可在[华为应用市场](https://appgallery.huawei.com/app/detail?id=com.jide.kapian&channelId=SHARE&source=appshare)搜索“记得闪卡”下载安装。仓库构建版本的唯一事实来源是 [AppScope/app.json5](AppScope/app.json5)；商店实际上架版本以 AppGallery 页面为准。

> jidecards 是独立开源项目，与 Ankitects、AnkiWeb 或 AnkiDroid 无关，也未获得其认可。

## 目录

- [项目特点](#项目特点)
- [应用截图](#应用截图)
- [安装与使用](#安装与使用)
- [从源码构建](#从源码构建)
- [项目结构与文档](#项目结构与文档)
- [参与贡献](#参与贡献)
- [版本与发布](#版本与发布)
- [许可证与第三方声明](#许可证与第三方声明)

## 项目特点

### 复习与调度

- 复用 Anki 26.05 Rust Core，提供兼容的集合、模板渲染和调度基础。
- 支持 FSRS、目标记忆保持率、牌组选项、四档评分、撤销、埋藏、暂停和学习完成页。
- 支持普通问答、完形填空、拼写输入、图片遮罩，以及卡片中的图片、音频、MathJax、mhchem 和 MathML。
- 使用原生音频播放器和 HarmonyOS CoreSpeechKit TTS；学习页和卡片预览共享渲染与媒体生命周期。

### 牌组、浏览与统计

- 支持层级牌组、新建、重命名、排序、拖动、别名、隐藏和牌组背景图片。
- 提供 Cards/Notes 浏览、牌组树和标签树、Anki 搜索语法、保存搜索、字段与标签编辑、查找替换及批量操作。
- 提供学习进度、预测、年历热力图、复习间隔、记忆稳定期、难度、记忆可提取性和新增卡片等统计，并提供 2×4 桌面服务卡片。
- 简洁模式覆盖日常学习；实验模式提供高级调度、笔记类型管理、自定义学习、过滤牌组等能力。

### 同步、导入与维护

- 支持 AnkiWeb 集合与媒体同步、自定义同步端点、TLS 证书、自动同步及全量上传/下载。
- 支持 `.apkg` 牌组导入与导出、`.colpkg` 集合备份与恢复，并可选择媒体和调度信息；提供自动历史备份和恢复列表，历史备份不包含媒体。
- 提供媒体引用检查、缺失文件检查、媒体回收站、数据库检查，以及标签和笔记维护工具。
- 选择题 APKG 扩展遵循公开的 [v1 规范](docs/choice-apkg-v1.md)，附带 [制题指南](docs/choice-authoring.md)、[JSON Schema](docs/schemas/choice-source-v1.schema.json) 和[示例牌组](docs/examples/choice-demo.apkg)。

### HarmonyOS 体验

- 提供蓝、绿、紫、青、橙、金、灰七套主题，支持浅色、深色和跟随系统外观。
- 支持学习提醒、中文和 English 界面、可停靠或浮动的答题工具栏、卡片字号设置和动态背景。
- 导航、列表、设置和统计使用 ArkUI；Anki 卡片 HTML/CSS 使用 HarmonyOS Web 组件渲染。

### 应用内 Agent（默认隐藏的功能）

源码包含用于 AI 制卡和 AI 改卡的 ArkTS Agent 内核：它通过受控语义工具读取用户授权范围内的数据，先生成可编辑草稿，再由用户确认后写入。写入前会展示字段、标签、目标牌组和影响范围，高风险操作需要二次确认，并在执行前重新检查数据基线。

**当前发布配置默认隐藏 AI 制卡、AI 改卡及其设置入口**。开发者可在设置页的“开发者调试”中解锁；状态由 [ReleaseFeatures.ets](entry/src/main/ets/model/ReleaseFeatures.ets) 持久化，并通过 AppStorage 运行时开关统一控制。页面当前关闭联网搜索。真实 Provider 请求及普通、高风险写入仍需完成实体设备回归，才能重新开放入口；详细能力与限制见[应用内 Agent 说明](docs/development/agent.md)。

## 应用截图

首页牌组、牌组详情、卡片复习与学习统计：

<p align="center">
  <img src="screenshots/app-preview-01.png" width="180" alt="首页：今日学习进度与层级牌组列表" />
  <img src="screenshots/app-deck-overview.png" width="180" alt="牌组详情：卡片数量与近七天学习记录" />
  <img src="screenshots/app-study.png" width="180" alt="卡片复习：单词、发音、助记与四档评分" />
  <img src="screenshots/app-statistics.png" width="180" alt="学习统计：今日概览、到期预测与学习日历" />
</p>

设置、学习提醒、桌面服务卡片与应用速览：

<p align="center">
  <img src="screenshots/app-settings.png" width="180" alt="设置：搜索与常规、复习、同步、外观等分类" />
  <img src="screenshots/app-reminders.png" width="180" alt="学习提醒：定时提醒与启用开关" />
  <img src="screenshots/app-preview-04.png" width="180" alt="手机桌面服务卡片：各学习状态的卡片数量" />
  <img src="screenshots/app-introduction.png" width="180" alt="应用速览：闪卡入门、牌组来源与 Agent 制卡说明" />
</p>

<details>
<summary>查看应用内 Agent 截图（需开发者调试解锁）</summary>

从学习页进入 AI 改卡，查看字段草稿并逐项确认写入：

<p align="center">
  <img src="screenshots/agent-edit-01-entry.png" width="220" alt="学习页的 AI 改卡入口" />
  <img src="screenshots/agent-edit-02-reasoning.png" width="220" alt="Agent 读取卡片字段" />
  <img src="screenshots/agent-edit-03-draft.png" width="220" alt="AI 改卡草稿确认页" />
</p>

</details>

## 安装与使用

### 普通用户

从[华为应用市场](https://appgallery.huawei.com/app/detail?id=com.jide.kapian&channelId=SHARE&source=appshare)安装“记得闪卡”，导入已有 `.apkg` 牌组后即可开始学习。首次使用建议先保留默认设置，熟悉评分和复习节奏后再调整 FSRS、提醒、主题或牌组选项。

### 兼容范围

- 支持搭载 HarmonyOS NEXT 的手机、平板和电脑（含 2-in-1 设备），最低兼容 API 21。
- 支持常用 Anki 牌组格式和牌组自带媒体；不同牌组的自定义模板、插件字段和历史 schema 仍可能存在兼容差异。
- AnkiWeb 同步需要用户自己的 AnkiWeb 账号；自定义同步服务器需要可用的 HTTPS 服务端点。

## 从源码构建

### 环境要求

- Node.js 24.x（与 CI 一致）
- DevEco Studio 6.1.0.860
- HarmonyOS SDK 6.1.0.105，Compatible API 21、Target API 23
- Rust 1.92.0（见 [rust-toolchain.toml](rust-toolchain.toml)）
- `protoc`；主机测试需要 Visual Studio/MSVC，或配有 `cargo-zigbuild` 和 `zig` 的工具链

### 准备 Anki Core

先获取本仓库并进入项目目录：

```bash
git clone https://github.com/wuweiyouzuoju/jidecards-anki-harmonyos.git
cd jidecards-anki-harmonyos
```

Rust 后端锁定 Anki 26.05，提交为 `e64c6b1`。`third_party/` 被 `.gitignore` 排除，不是 Git submodule；首次构建前准备本地源码：

```bash
git clone https://github.com/ankitects/anki.git third_party/anki
git -C third_party/anki checkout --detach e64c6b1
git -C third_party/anki rev-parse --short=7 HEAD
git -C third_party/anki submodule update --init --depth 1 -- ftl/core-repo ftl/qt-repo
```

Anki rslib 由 Ankitects Pty Ltd 及其贡献者提供，并依据 AGPL-3.0-or-later 授权。

### 安装依赖与构建

公共 [build-profile.json5](build-profile.json5) 不保存个人签名材料。复制 [config/signing.example.json](config/signing.example.json) 为 `.local/signing.json`，填入本机已有签名；也可以用 `JIDECARDS_SIGNING_CONFIG` 指向外部 JSON 文件。覆盖安装必须沿用原有签名身份，签名配置和无签名构建说明见[签名文档](docs/development/signing.md)。

```bash
ohpm install
npm ci
npm run doctor
npm run build:app
```

运行完整 Node 契约测试：

```bash
npm test
```

常用验证入口：

```bash
npm run verify -- repo     # 可移植仓库与文档门禁
npm run verify -- native   # Rust 主机测试与原生门禁
npm run verify             # 完整测试、双架构构建与签名 HAP
```

设备验收只能使用 `hdc -t <connect-key> install -r <signed-hap>` 覆盖安装；不要卸载应用或清除用户数据。完整范围见[验证说明](docs/development/verification.md)。

## 项目结构与文档

| 路径 | 内容 |
| --- | --- |
| [entry/src/main/ets/](entry/src/main/ets/) | ArkTS 页面、组件、模型和应用内 Agent |
| [native/](native/) | C++ Node-API 桥接与 Rust FFI |
| [tools/](tools/) | 测试、诊断、构建和 APKG 工具 |
| [docs/](docs/) | 架构、开发约定、数据格式和验证说明 |
| [PROJECT_CONTEXT.md](PROJECT_CONTEXT.md) | 编程 Agent 的任务入口与事实来源 |
| [AGENTS.md](AGENTS.md) | 仓库开发约定与不变量 |

进一步阅读：

- [文档导航](docs/README.md)
- [当前架构](docs/architecture.md)
- [模块责任与边界](docs/development/ownership.md)
- [开发任务契约](docs/development/task-contract.md)
- [应用内 Agent 说明](docs/development/agent.md)
- [开发状态与发布门禁](docs/DEVELOPMENT_PLAN.md)

## 参与贡献

欢迎通过 [Issues](https://github.com/wuweiyouzuoju/jidecards-anki-harmonyos/issues) 提交问题和建议，通过 [Pull Requests](https://github.com/wuweiyouzuoju/jidecards-anki-harmonyos/pulls) 贡献修复、文档和翻译。问题报告请附应用版本、设备型号、系统版本、复现步骤、预期与实际结果；日志和示例牌组请先移除账号、密钥及个人学习内容。

准备修改代码时，请先阅读：

1. [项目任务入口](PROJECT_CONTEXT.md)，确认事实来源、责任边界和最低验证范围。
2. [开发任务契约](docs/development/task-contract.md)，说明目标、不变量、验证命令和交接信息。
3. 与修改路径对应的目录规则和领域文档；代码改动应附上实际执行的测试结果。

贡献可以从以下方向开始：

- 使用不同 HarmonyOS API/设备进行兼容性回归并报告版本、设备和复现步骤。
- 改进 Anki 牌组导入、公式、媒体、同步和统计的兼容性。
- 完善中英文界面、用户文档、测试和构建工具。
- 在实体设备上验证应用内 Agent 的联网、取消、普通写入和高风险写入边界。

## 版本与发布

当前源码版本由 [AppScope/app.json5](AppScope/app.json5) 中的 `versionName` 和 `versionCode` 定义；历史更新说明保留在 [docs/releases/](docs/releases/) 中。商店版本与源码版本分别维护，商店版本只在确认上架后更新。

发布前的构建、测试和设备验收要求见[开发状态与发布门禁](docs/DEVELOPMENT_PLAN.md)。CI 检查结果不代替实体设备验收；源码中的能力以当前发布开关为准。

## 许可证与第三方声明

本项目采用 [AGPL-3.0-or-later](LICENSE) 许可。Anki rslib、MathJax、HarmonyOS 组件及其他依赖的版权和许可见 [NOTICE.md](NOTICE.md) 与各自源文件说明。
