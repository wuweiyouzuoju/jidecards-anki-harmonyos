# 扩展入口与平台约束

[返回任务索引](../../PROJECT_CONTEXT.md)

## 模块边界

| 模块 | 稳定入口 | 关键边界 |
| --- | --- | --- |
| 页面 | `entry/src/main/ets/pages/` | 首页持有 NavPathStack；页面负责状态与错误呈现 |
| 通用组件 | `entry/src/main/ets/components/` | 以回调上抛业务意图，避免反向依赖页面 |
| 后端服务 | `entry/src/main/ets/backend/` | protobuf 编解码与 Anki 领域调用 |
| 后端会话 | `backend/后端会话.ts` | 幂等打开；区分关闭集合与集合已被消费 |
| 服务编号 | `backend/服务索引.ts` | 唯一服务/方法号来源，绑定 Anki 26.05 |
| Proto | `entry/src/main/ets/proto/` | 纯编解码；调度状态 raw passthrough |
| 学习音频 | `utils/AudioFocusCoordinator.ets`、`声音播放器.ets`、`TTS播放器.ets` | 播放前激活混音会话；所有播放方结束后释放 |
| Agent 编排 | `backend/agent/` | Provider/Runner/工具/执行器职责分离 |
| Agent 模型 | `model/agent/` | Schema、策略、草稿、历史、澄清与校验 |
| 原生桥 | `native/napi_bridge/` | 只导出 open/run/close，零业务逻辑 |
| Rust FFI | `native/rsharmony/` | 句柄、缓冲区和 panic 边界 |
| 桌面卡片 | `formability/`、`widget/` | 2×4 统计服务卡片及 DeepLink |


## 常见任务路由

| 任务 | 入口 | 注意 |
| --- | --- | --- |
| 修改学习 | `pages/学习页.ets`、`backend/调度器服务.ts` | 评分防重入；不在前端算调度 |
| 修改首页预览范围 | `model/DeckPreviewSession.ts`、`backend/DeckPreviewService.ts`、`components/home/DeckPreviewScopeMenu.ets`、`native/rsharmony/src/deck_preview.rs` | 本地 RPC 1001/0 经 SQLite 快照复用 Core；不进入正式调度器，见 [学习与预览](study-media.md) |
| 修改卡片渲染 | `backend/卡片渲染服务.ts`、`model/学习卡片HTML构建器.ts`、`model/CardWebSession.ts`、`model/CardReviewerRuntime.ts` | 学习/预览经 `utils/CardWebView.ets` 共用同卡文档；保持媒体域名、脚本执行顺序和回调代次一致 |
| 修改公式兼容 | `model/MathRendering.ts`、`utils/CardAssetResponse.ets`、`resources/rawfile/mathjax/` | 离线资源经独占域名响应；`latexSvg` 不控制 MathJax；传统 LaTeX 经上游 ExtractLatex |
| 修改浏览 | `pages/浏览页.ets`、`components/browser/` | Cards/Notes ID 语义不同；返回后保留搜索状态 |
| 修改统计 | `model/StatsSession.ts`、`backend/AnkiStatsSession.ets`、`backend/StatsWidgetPublisher.ets`；布局在 `pages/统计页.ets` / `components/stats/` | 旧查询失效，偏好写入串行，只有全库口径发布桌面卡片 |
| 修改 FSRS 参数优化/模拟 | `model/home/DeckOptionsSession.ts`、`model/FsrsOptions.ts`、`backend/FsrsService.ts`、`components/home/FsrsTools.ets` | Core 计算，参数暂存后经原保存入口提交；批量只共享参数，计算占用随真实调用释放，见 [领域说明](browser-stats.md#fsrs-参数优化与学习负担模拟) |
| 修改同步 | `model/SyncSession.ts`、`model/同步流程.ts`、`backend/AnkiSyncSession.ets`、`backend/同步服务.ts` | 任务拥有租约与媒体终态，组件只展示和转交意图 |
| 修改新增笔记 | `model/NoteCreationSession.ts`、`backend/AnkiNoteCreation.ets`、`model/NoteTypeCatalog.ts` | 表单留在页面；类型恢复及文件 IO 在后端，已接受保存不随离页取消 |
| 修改关于设置 | `components/settings/AboutSettings.ets`、`utils/好评引导.ets` | 复用 AboutActionDialog 和现有好评回退；设置壳只导航 |
| 修改应用内 Agent 历史 | `model/agent/AgentHistoryCoordinator.ts`、`AgentConversationView.ts`、现有历史/CheckpointStore | 恢复只交既有 runtime 校验，不恢复写入令牌、不重放动作 |
| 更新 JIDE 的 Anki 官方教程 | `tools/anki-manual-topics.json`、`tools/vendor-anki-manual.mjs`、`model/agent/AgentAnkiHelp.ts` | 从官方 Git 已提交版本生成，保留原文、来源与 CC BY-SA；两个离线只读工具按需读取，见 [官方教程](agent.md#anki-官方教程按需读取) |
| 修改导入导出 | `backend/数据迁移服务.ts`、`backend/后端会话.ts` | collection 生命周期和失败恢复优先 |
| 修改主题/语言 | `model/主题设置.ets`、`model/语言存储.ets`、资源目录 | ThemeMode/ColorTheme 正交；语言切换需重启 |
| 修改动画 | `utils/转场时长.ets`、`utils/HomeNavigationTransition.ets`、相关组件 | 导航/全屏层 200–300ms 淡入淡出；小菜单与展开 150ms；按钮按压由原生多态表面或系统反馈单独负责，不叠加整按钮动画；禁止横向飞入 |
| 修改学习音频 | `utils/AudioFocusCoordinator.ets`、`声音播放器.ets`、`TTS播放器.ets` | 跨应用混音由 AudioSession 管理；`SHARE_MODE` 只管应用内多流 |
| 修改应用内 Agent | `pages/AI制卡页.ets`、`backend/agent/`、`model/agent/` | 不绕过 Scope、确认及 DraftExecutor / ActionExecutor；见 [执行边界](agent.md) |
| 修改 JIDE 可感知界面 | `model/AppInterface.ts`、`SettingsNavigation.ts`、`SettingsStructure.ts`、`backend/AppInterfaceService.ets` | UI 和 JIDE 共用条目、名称与显隐；新控件登记语义和真实回调，组件退出移除观察；见 [软件界面认知](agent.md#软件界面认知) |
| 扩展 JIDE 自动导航 | `model/navigation/AppNavigation.ts`、`AgentAppNavigation.ts`、`AgentAppNavigationTools.ets`、`首页.navigateAgentApp` | 动作参数与清栈语义只声明一次；接通原宿主，结构工具实时读取就绪状态；逐动作行为测试拦截未接通声明；见 [自动页面操作](agent.md#自动页面操作) |
| 修改发布入口 | `model/ReleaseFeatures.ets` 及入口契约测试 | 以 ReleaseFeatures.ets 的实际开关为准 |
| 升级版本 | `AppScope/app.json5` | 同步 README、公告范围与发布记录 |


## 扩展点

| 场景 | 入口 | 参考 |
| --- | --- | --- |
| 新增 Anki 服务方法 | `backend/服务索引.ts` + 对应 Service + proto/messages | 现有牌组/统计/媒体服务 |
| 新增页面 | `pages/navigation/HomeDestinations.ets` | 首页持有页面栈、导航时机与返回刷新；映射模块只接参数并渲染目的地 |
| 新增设置项/分组 | `model/SettingsStructure.ts`、`SettingsNavigation.ts`、`components/设置面板.ets`、`components/settings/` | UI 与 JIDE 共用 ID、资源和显隐；新增设置必须执行[认知同步](coding-agent.md#软件升级时的认知同步)，需要读取/操作时接通原能力；先核对同目录 `SETTINGS_PARITY.md` |
| 新增统计图 | `components/stats/`、统计色板/分箱模型 | 复习卡、日历卡 |
| 新增应用内 Agent 工具 | `model/agent/AgentToolCatalog.ts` 汇总目录；辅助动作定义在 `AgentExtensionTools.ts`，设置契约在 `AgentSettingsTools.ts` | Scope、Schema、审计与确认或本机设置显式许可同时覆盖；提案工具不依赖确认执行器；设置页与助手共用领域入口 |
| 扩展 JIDE 设置读取/修改 | `AgentSettingsTools.ts`、`AgentPreferenceSettings.ts`、`AgentAppSettingsTools.ets` / `AgentPreferenceReader.ets`；写入归共享领域入口与 `AgentActionExecutor` | 本机简单偏好复用 `propose_set_setting`，追加已接通的可写 ID、执行分支和本地化预览；字号/宽度/触感经 `LocalPreferenceWrite` 共用队列。严格读取、确认前零写入、提交重查原值，行为测试见 [设置能力](agent.md#应用设置读取与修改) |
| 修改应用内 Agent 学习概览 | `model/agent/AgentLearningOverview.ts`、`backend/agent/CardAgentTools.ets` | 复用 `DeckStudyHistory` / `StatsOverview` 与 Core 统计；聚合不授予正文读取或写入范围，见 [学习概览](agent.md#学习概览与复习负担) |
| 扩展 JIDE 场景建议 | `model/agent/AgentAppRecommendations.ts`；UI 事实仍归 `AppInterfaceTracker` 与实际状态拥有者 | 结构工具和空会话共用声明/条件，缺失状态不猜测、按当前工具筛选；新增场景无需另建工具，见 [当前场景与主动建议](agent.md#当前场景与主动建议) |
| 新增 Provider | `model/agent/ProviderCatalog.ts` + `backend/agent/*Adapter.ets` | Responses/SSE 契约，不做静默降级 |
| 新增语言 | `resources/<locale>/element/string.json` + 语言存储/设置 UI | 资源 key 与 base 对齐 |
| 新增动效 | 先复用现有按压、展开、小菜单、弹窗或导航节奏 | 优先 opacity/scale 合成属性，不用动画完成回调驱动业务 |


## 项目特有的坑

- `third_party/anki/` 是 gitignored 本地依赖，不是 submodule；按 README 克隆锁定提交。
- 当前 compatible API 是 21。任何 API 12 兼容说法都已过期，除非先修改配置并重做回归。
- Navigation push/pop 不保证触发首页 `onPageShow`；需要显式 `onPop` 或变更信号。
- Web controller attach 前调用 `loadData` 会白屏；先缓存 HTML，attached 后再消费。
- 公式脚本在正文前加载，模板可配置 MathJax 宏；答案滚动等待排版完成。内置 MathJax/MathML 资源通过 `https://jidecards-render.local/` 响应，不依赖 CDN。
- `@Builder` 按值参数可能形成快照；动态状态需显式引用或放回组件状态。
- 统计组件的 `build()` 保持单根容器；Builder 内避免声明临时变量。
- `model/**/*.ts` 与 `proto/**/*.ts` 只依赖这两层的 `.ts`，保持 Node 可直接测试；既有 `model/*.ets` 平台存储适配器另行做 HAP/设备验证。
- Agent UI 默认隐藏；应用端联网工具由独立默认关闭的开关控制，Provider 内置搜索保持关闭。能力与门禁以 `ReleaseFeatures`、`AgentSettingsStore` 和实际 Registry 为准。
- `docs/superpowers/` 与 `.trae/` 是历史记录，checkbox 和旧测试数量不能当当前事实。
