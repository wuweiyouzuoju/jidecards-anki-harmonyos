# jidecards（记得闪卡）

jidecards 是面向 HarmonyOS 的开源 Anki 卡片学习客户端，使用 ArkUI 构建应用界面，并复用 Anki 的 Rust 后端。

**当前源码版本：2.7.9（versionCode 2790）**

应用已发布到华为应用市场，可搜索“记得闪卡”下载安装。商店实际上架版本以
AppGallery 页面为准；仓库中的构建版本以 `AppScope/app.json5` 为唯一依据。

相对 2.7.0 的完整更新整理见 [2.7.9 更新说明](docs/releases/2.7.9.md)。

## 2.7.0 更新内容

- **学习流程更完整**：新增首次学习指引、学习中编辑当前笔记、学习内容刷新保护、牌组学习历史，并完善埋藏、暂停、撤销和完成页流程。
- **卡片预览与音频更稳定**：浏览页预览支持前后切换、翻面和重播；学习页与预览页共用原生音频生命周期，避免旧卡片的异步渲染或音频覆盖当前卡片。
- **自动同步与自建服务器**：支持保存自定义同步地址、自动同步、独立控制媒体同步，并在需要全量同步时由用户明确选择上传或下载。
- **离线公式渲染**：内置 MathJax、mhchem 和 MathML 支持，导入的数学与化学内容可在学习页和卡片预览中离线显示。
- **主题与阅读体验**：新增虹彩动态背景、玻璃质感界面、主题文字效果和卡片字号设置，并统一主要页面、菜单和弹窗的视觉间距与交互反馈。
- **主题兑换**：加入离线验签的兑换码流程，用于解锁指定主题内容；私钥不进入应用或仓库。
- **Agent 体验改进**：保留模型输出顺序，流式展示卡片草稿，并完善本地会话历史；正式发行包仍默认隐藏 Agent 入口。

### 2.7.0 默认隐藏的功能

为配合华为应用市场上架，2.7.0 发布包默认隐藏以下界面入口，但相关源码和自动化测试仍完整保留在仓库中：

- 首页操作面板中的「AI 制卡」和「AI 改卡」。
- 学习页「更多」菜单中的当前卡片 AI 改卡。
- 浏览页批量操作栏中的 AI 改卡。
- 设置页中的 AI Agent 提供商、模型、联网方式和 API 密钥配置。

这些功能没有从源码中删除。开发者可在设置页的「开发者调试」中输入版本密钥，解锁状态由
`entry/src/main/ets/model/ReleaseFeatures.ets` 持久化，并通过一个 AppStorage 运行时开关统一控制全部入口。

> 本项目与 Ankitects、AnkiWeb、AnkiDroid 无关，也未获得其认可。

## 应用截图

<p align="center">
  <img src="screenshots/app-preview-01.png" width="180" alt="记得闪卡应用截图 1" />
  <img src="screenshots/app-preview-02.png" width="180" alt="记得闪卡应用截图 2" />
  <img src="screenshots/app-preview-03.png" width="180" alt="记得闪卡应用截图 3" />
  <img src="screenshots/app-preview-04.png" width="180" alt="记得闪卡应用截图 4" />
</p>

### 学习时的 AI 改卡（2.7.0 默认隐藏，开发者调试解锁后可用）

从学习页的「更多」菜单进入 AI 改卡，AI 检索当前卡片所属笔记的所有字段、提出可逐字段编辑的草稿，等待用户确认后写入并自动回到学习页重渲染。

<p align="center">
  <img src="screenshots/agent-edit-01-entry.png" width="220" alt="学习页更多菜单的 AI 改卡入口" />
  <img src="screenshots/agent-edit-02-reasoning.png" width="220" alt="Agent 检索当前卡字段并提出 update_field 草稿的思考过程" />
  <img src="screenshots/agent-edit-03-draft.png" width="220" alt="可逐字段编辑的草稿确认页" />
</p>

## 主要功能

### AI 制卡与 AI 改卡（2.7.0 默认隐藏，开发者调试解锁后可用）

- **应用内 AI Agent**：AI 制卡和 AI 改卡共用 ArkTS 轻量 Agent 内核，可理解自然语言、读取授权范围内的牌组/卡片结构，并通过受控语义工具完成任务；模型不能直接访问 Anki Rust、数据库、文件系统或任意后端 RPC。
- **多笔记类型制卡**：目标牌组和笔记类型由用户选择，支持普通问答、完形填空以及导入牌组带来的自定义笔记类型；用户明确要求数量时，Agent 会校验最终草稿数量。
- **可编辑草稿**：写入前展示真实字段、标签、目标牌组和影响范围，可逐张编辑、勾选后再保存。模型仅在正文中声称“已生成”不会被视为成功，必须实际产生合法草稿。
- **多入口改卡**：可从首页、新建牌组面板、学习中的当前卡片和浏览器选中内容进入 AI 改卡；从当前卡片进入时只在本地预载上下文，用户发送消息后才请求 AI 提供商。
- **安全写入**：普通修改需要确认；删除、迁移笔记类型、模板/CSS 等高风险操作会显示精确影响并要求二次确认。执行前重新检查基线，检测到卡片已被其他操作修改时停止写入。
- **可观察过程**：页面按正文、思考摘要、工具过程、来源、草稿和操作的顺序展示执行过程；工具详情默认折叠，可查看经过脱敏和截断的参数、结果与失败原因。
- **联网与来源**：2.7.0 源码保留 Provider 搜索协议与来源展示，但页面当前强制关闭联网搜索；重新开放前不得宣称 Agent 已联网检索。
- **提供商配置**：DeepSeek 为默认提供商，同时支持 OpenAI 和兼容 Responses 协议的自定义 HTTPS 接口；提供商、模型选择会被记忆，API 密钥加密保存在设备本地。

> 当前限制：通用 Agent 尚不创建图片遮罩；图片和音频只发送模型可支持的安全表示；实体手机、OpenAI 在线请求及高风险真实写入仍需在重新开放入口前完成重点回归。

### 学习与调度

- **Anki 26.05 内核**：通过 C ABI + Node-API 连接 Anki rslib，使用与 Anki 兼容的卡片数据、模板渲染和调度能力。
- **FSRS 间隔重复**：支持启用或关闭 FSRS、目标记忆保持率、牌组选项及重新调度；实验版提供更多调度参数。
- **完整复习流程**：支持显示问题与答案、四档评分、撤销、埋藏、暂停与恢复，以及学习完成页。
- **常用卡片类型**：支持普通问答、完形填空、拼写输入和图片遮罩笔记。
- **离线数学与化学公式**：内置 MathJax 3.2.2、mhchem 和 MathML 输入，学习与预览共用 SVG 排版；传统 LaTeX 标签读取牌组自带图片，缺少图片时保留源码提示，不在设备上运行完整 TeX 编译器。
- **原生音频与 TTS**：卡片中的 `[sound:...]` 音频由原生播放器处理；包含 `[anki:tts]` 模板指令的卡片可通过 HarmonyOS CoreSpeechKit 自动朗读，并可在学习页重播或停止。
- **学习布局**：学习工具栏可固定在底部或以浮动方式拖动、吸附并记忆位置。

### 首页与牌组

- **牌组管理**：支持层级牌组、新建、重命名、删除、排序、拖动调整顺序，以及设置牌组别名。
- **牌组显示定制**：支持隐藏牌组并在设置中恢复；可为牌组选择、裁剪、替换或清除背景图片。
- **8 页学习摘要**：首页依次展示今日进度、记忆率、今日计数、卡片状态、小时分布、难度分布、间隔分布和未来到期预测。
- **简洁版与实验版**：默认简洁版保留日常学习所需功能；实验版额外开放高级调度、笔记类型管理、自定义学习、过滤牌组和点击区域快速答题等功能。

### 统计与桌面服务卡片

- **13 个统计区块**：今日、预测、年历热力图、复习、卡片数量、复习间隔、记忆稳定期、难度/熟练度、记忆可提取性、真实记忆保持率、逐小时分析、回答按钮和新增卡片。
- **FSRS 专属统计**：记忆稳定期和记忆可提取性仅在启用 FSRS 时显示；未启用 FSRS 时展示相应的传统调度统计。
- **范围与筛选**：支持按牌组筛选、全局近 1 年/全部范围，以及各图表自己的时间范围、分位截断和显示偏好。
- **2×4 桌面服务卡片**：提供与首页一致的 8 页学习摘要；点击服务卡片可直接进入应用统计页。

> 2.0.0 的首页不再显示旧版“月历卡”。年历热力图保留在统计页中。

### 浏览、编辑与管理

- **搜索与侧边栏**：支持 Anki 搜索语法、牌组树、标签树、已保存搜索，以及 AND/OR 条件组合。
- **卡片与笔记浏览**：支持 Cards/Notes 浏览、可配置表格列、多选、懒加载、卡片信息和前后张切换预览。
- **直接编辑**：可在浏览页编辑笔记字段与标签，并实时预览卡片正反面。
- **查找与替换**：支持区分大小写和正则表达式的批量文本替换。
- **批量操作**：支持改牌组、设置或清除标志、暂停、恢复、删除、设置到期日、重排新卡位置和更改笔记类型。
- **标签管理**：支持搜索、追加搜索、重命名、删除和补全标签。

### 数据、同步与维护

- **AnkiWeb 同步**：支持登录、集合与媒体同步、全量上传/下载、中止同步，以及自定义同步端点和 TLS 证书。
- **导入与导出**：支持用 `.apkg` 合并导入/导出牌组，用 `.colpkg` 备份或恢复完整个人数据，可选择包含媒体和调度信息。
- **媒体管理**：可检查未引用文件、缺失文件及受影响笔记，并通过回收站恢复或永久清理媒体。
- **数据维护**：提供数据库检查；实验版还可管理笔记类型、查找空卡与重复笔记、清理未使用标签。

### HarmonyOS 体验

- **7 套颜色主题**：蓝、绿、紫、青、橙、金、灰，支持浅色、深色和跟随系统外观。
- **学习提醒**：可设置多条定时学习提醒，由 HarmonyOS 代理提醒能力按计划发送通知。
- **中英双语**：内置中文和 English 界面，可在设置中切换。
- **应用内评价**：优先使用 AppGallery 应用内评价对话框，失败时回退到应用市场详情页。
- **原生界面与兼容渲染**：导航、列表、设置和统计等应用界面使用 ArkUI；Anki 卡片的 HTML/CSS 内容通过 HarmonyOS Web 组件渲染。

## 技术栈

- 前端：ArkTS / ArkUI（HarmonyOS）
- AI Agent：ArkTS 有界工具循环 + Responses/SSE 协议适配（DeepSeek / OpenAI / Custom）
- 卡片渲染：HarmonyOS Web 组件
- 后端：Anki rslib 26.05（Rust，通过 C ABI + Node-API 桥接）
- 许可证：AGPL-3.0-or-later

## 构建

### 环境要求

- Node.js 24.x（与 CI 和本地验证一致）
- DevEco Studio 6.1.0.860
- HarmonyOS SDK 6.1.0.105，Compatible API 21、Target API 23（Compile API 由当前 DevEco SDK 决定）
- Rust 1.92.0（见 `rust-toolchain.toml`）
- `protoc`；主机测试使用已安装的 Visual Studio/MSVC，或配有 `cargo-zigbuild` / `zig` 的 bundled GNU 工具链

### 获取 Anki 源码

Rust 后端依赖锁定在 Anki 26.05（提交 `e64c6b1`）。`third_party/` 被
`.gitignore` 排除，并不是 Git submodule；首次构建前需自行准备本地源码：

```bash
git clone https://github.com/ankitects/anki.git third_party/anki
git -C third_party/anki checkout --detach e64c6b1
git -C third_party/anki rev-parse --short=7 HEAD
```

Anki rslib 版权归 Ankitects Pty Ltd 及其贡献者所有，并依据 AGPL-3.0-or-later 提供。

### 安装依赖并构建

```bash
ohpm install
npm run doctor
npm run build:app
```

公共 `build-profile.json5` 不保存个人签名材料。复制 `config/signing.example.json` 为
`.local/signing.json`，填入本机已有签名的原值；也可用 `JIDECARDS_SIGNING_CONFIG` 指定外部 JSON 文件。
根 `hvigorfile.ts` 在模块求值前注入配置，IDE 和命令行共用。覆盖安装必须沿用既有签名身份，
不要重新生成身份替代原证书。首次配置与无签名构建见 [签名说明](docs/development/signing.md)。

安装开发工具依赖并运行完整 Node 测试：

```bash
npm ci
npm test
```

完整文档导航见 [docs/README.md](docs/README.md)。当前开发状态见
[docs/DEVELOPMENT_PLAN.md](docs/DEVELOPMENT_PLAN.md)，架构见
[docs/architecture.md](docs/architecture.md)。

## 开源许可

本项目采用 [AGPL-3.0-or-later](LICENSE) 许可。第三方组件与上游说明见 [NOTICE.md](NOTICE.md)。

开发任务入口见 [PROJECT_CONTEXT.md](PROJECT_CONTEXT.md)，验证范围见 [验证说明](docs/development/verification.md)。
