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
| 修改卡片渲染 | `backend/卡片渲染服务.ts`、`model/学习卡片HTML构建器.ts` | 保持媒体拦截域名一致 |
| 修改公式兼容 | `model/MathRendering.ts`、`utils/CardAssetResponse.ets`、`resources/rawfile/mathjax/` | 离线资源经独占域名响应；`latexSvg` 不控制 MathJax；传统 LaTeX 经上游 ExtractLatex |
| 修改浏览 | `pages/浏览页.ets`、`components/browser/` | Cards/Notes ID 语义不同；返回后保留搜索状态 |
| 修改统计 | `pages/统计页.ets`、`components/stats/`、`backend/统计服务.ts` | 图表组件只展示，口径来自后端 |
| 修改同步 | `model/同步流程.ts`、`backend/同步服务.ts` | 集合同步与媒体同步状态分开 |
| 修改导入导出 | `backend/数据迁移服务.ts`、`backend/后端会话.ts` | collection 生命周期和失败恢复优先 |
| 修改主题/语言 | `model/主题设置.ets`、`model/语言存储.ets`、资源目录 | ThemeMode/ColorTheme 正交；语言切换需重启 |
| 修改动画 | `utils/转场时长.ets`、`pages/首页.ets`、相关组件 | 导航/全屏层 200–300ms 淡入淡出；小菜单与展开 150ms；按压 80ms；禁止横向飞入 |
| 修改学习音频 | `utils/AudioFocusCoordinator.ets`、`声音播放器.ets`、`TTS播放器.ets` | 跨应用混音由 AudioSession 管理；`SHARE_MODE` 只管应用内多流 |
| 修改 Agent | `pages/AI制卡页.ets`、`backend/agent/`、`model/agent/` | 不绕过 Scope、确认和 DraftExecutor |
| 修改发布入口 | `model/ReleaseFeatures.ets` 及入口契约测试 | 以 ReleaseFeatures.ets 的实际开关为准 |
| 升级版本 | `AppScope/app.json5` | 同步 README、公告范围与发布记录 |


## 扩展点

| 场景 | 入口 | 参考 |
| --- | --- | --- |
| 新增 Anki 服务方法 | `backend/服务索引.ts` + 对应 Service + proto/messages | 现有牌组/统计/媒体服务 |
| 新增页面 | `pages/首页.ets` 的目的地映射 | 学习页、浏览页、统计页 |
| 新增设置分组 | `model/SettingsNavigation.ts`、`components/设置面板.ets`、`components/settings/` | `GeneralSettings.ets`、静态 `设置分组卡片.ets`；先核对同目录 `SETTINGS_PARITY.md` |
| 新增统计图 | `components/stats/`、统计色板/分箱模型 | 复习卡、日历卡 |
| 新增 Agent 工具 | `model/agent/AgentToolCatalog.ts` + 工具实现 | Scope、Schema、审计与确认必须同时覆盖 |
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
- model 层避免 import `@kit.*`，否则 Node 测试加载失败。
- Agent UI 当前隐藏且联网搜索关闭；Provider capability 不等于发布能力。
- `docs/superpowers/` 与 `.trae/` 是历史记录，checkbox 和旧测试数量不能当当前事实。

