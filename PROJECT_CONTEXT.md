# jidecards：Agent 任务入口

先读本页和 [AGENTS.md](AGENTS.md)，再只读任务对应的领域文档。源码优先于说明；历史计划不是待办。

## 项目与事实来源

HarmonyOS 本地闪卡客户端：ArkUI → 领域 Service → protobuf → C++ Node-API → Rust FFI → 锁定 Anki Core。
产品优先保障导入后直接学习，并发展应用内 Agent 制卡/改卡；编程 Agent 优先指降低理解、修改、验证成本，不改变应用内 Agent 权限。

| 事实 | 唯一配置来源 |
| --- | --- |
| 应用版本 | `AppScope/app.json5` |
| SDK / 本机签名 | `build-profile.json5` / `.local/signing.json`（或环境指定文件），见 [签名说明](docs/development/signing.md) |
| Anki 提交、协议基线 | `UPSTREAM.lock` |
| Rust 工具链 | `rust-toolchain.toml` |
| Node 与验证入口 | `package.json`、`npm test -- --list` |
| 应用内 Agent 发布能力 | `entry/src/main/ets/model/ReleaseFeatures.ets` |

## 全局不变量

- 调度、FSRS、队列、埋藏/暂停与完成判定来自 Anki Core；前端不另写算法。
- SchedulingStates 原始 protobuf 字节透传，不解码重编码 oneof。
- Service 不持有 UI；页面负责错误展示，模型负责业务状态和可测试决策。
- Rust 捕获 panic，C++ 纯转发；取消同步不等于回滚完成，集合占用在真实调用结束后才释放。
- 已接受的写入不随页面销毁取消；迟到读取不能覆盖新页面/新选择。
- 应用内 Agent 的 Scope、草稿确认和写入执行器不可绕过。
- 字符串走资源，base/en_US key 对齐；原生布局复用公共尺寸和主题。
- 真机只覆盖安装，禁止卸载清数据；保留包名、现有签名身份与用户集合。

## 任务路由

以下代码路径相对 `entry/src/main/ets/`。

| 任务 | 先读 | 主要入口 / 快速反馈 |
| --- | --- | --- |
| 首页任务、启动弹窗、外部 APKG | [首页](docs/development/home.md) | `HomeWorkCoordinator`、`HomeStartupSequence`、`HomeSyncPolicy`、`HomeDataRepository`；`npm test -- home` |
| 学习、评分、音频、卡片预览 | [学习与媒体](docs/development/study-media.md) | `StudySessionController`、`StudyInputPolicy`、`StudyAnswerRenderer`、`CardAudioSession`；`npm test -- study` / `media` |
| 同步、导入导出、集合生命周期 | [同步](docs/development/sync-data.md) | `AutoSyncScheduler`、`SyncSettings`、`同步面板`；`npm test -- sync` |
| 搜索、批量编辑、统计、设置 | [浏览与统计](docs/development/browser-stats.md) | `BrowserSearchSession`、`BrowserOperationController`、`BrowserSidebar`、`StatsOverview`；`npm test -- browser` / `ui` |
| 主题、布局、权益 | [界面](docs/development/appearance.md) | `ThemeCatalog`、`ThemeBackground`、`SelectStyle`；`npm test -- ui` |
| 应用内 Agent | [Agent](docs/development/agent.md) | `backend/agent/`、`model/agent/`；`npm test -- agent` |
| 工具链、测试、源码导出 | [验证](docs/development/verification.md) | `tools/README.md`；`npm test -- tooling` |
| 新增能力 | [扩展点](docs/development/extension-points.md) | 按表查调用链；功能盘点先读 [FEATURE_STATUS](docs/FEATURE_STATUS.md) |

## 验证与交付

`npm ci` 安装锁定的开发工具依赖。`npm test -- <领域>` 用于快速反馈；`npm test` 自动发现全部测试。
`npm run verify -- repo` 验证仓库；Windows DevEco 主机上 `npm run verify` 依次执行诊断、全部测试、Rust 主机测试、双架构与签名 HAP 构建，失败即停。
设备验收独立记录，构建成功不能代替实际交互验证。详细范围与失败分类见 [验证说明](docs/development/verification.md)。

## 修改边界

- 页面参数放 `model/navigation/PageParams.ts`，页面不为取得参数类型互相引用。
- 首页只映射事实和 UI 效果；变更任务优先级去 HomeWorkCoordinator，变更引导状态去 HomeStartupSequence。
- 平台 Kit 放适配层；新业务规则优先写可直接导入测试的模型，保留必要的 UI 接线检查。
- `third_party/anki` 是忽略的本地依赖，按 README 克隆锁定版本。`docs/superpowers`、`.trae` 只作历史参考。
