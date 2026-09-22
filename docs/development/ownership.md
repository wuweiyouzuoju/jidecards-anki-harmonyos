# 模块责任与边界

[返回任务索引](../../PROJECT_CONTEXT.md)

这张表是编程 Agent 判断“应该从哪里开始、代码应该放哪里、改完验证什么”的当前入口。更细的行为规则以源码和对应领域文档为准。

## `entry`

| 路径 | 唯一责任 | 不应承担 |
| --- | --- | --- |
| `entry/src/main/ets/pages/` | 页面装配、展示和用户输入 | 跨页面业务状态、协议编码、持久化细节 |
| `entry/src/main/ets/components/` | 可复用 UI 和局部交互 | 直接拥有跨页面数据或绕过编排层写入 |
| `entry/src/main/ets/model/` | `.ts` 为可直接测试的模型/编排/协议使用方；既有 `.ets` 为主题与存储等平台适配 | 纯模型引入 Kit/UI、未声明所有者的全局状态 |
| `entry/src/main/ets/backend/` | 网络、平台和外部服务边界 | 把平台失败伪装成成功、依赖页面实例 |
| `entry/src/main/ets/stores/` | 明确声明的持久化状态和读取协调 | 成为所有模块的无边界共享状态 |
| `entry/src/main/ets/proto/`、`entry/src/main/cpp/types/`、`native/napi_bridge/` | 跨 ArkTS/Native 的协议、声明和桥接 | 在页面或工具脚本中复制协议定义 |

### 状态所有者

下面按实际状态定位，不要求为每个函数另建抽象。页面仍拥有 ArkUI 可观察状态，控制器通过显式宿主能力产生效果。

| 状态或资源 | 所有者 / 生命周期 | 直接验证入口 |
| --- | --- | --- |
| 首页同步定时器、待执行导航、刷新收尾 | [HomeSyncController](../../entry/src/main/ets/model/HomeSyncController.ts)；页面销毁使旧回调失效 | [home-sync-controller](../../tools/tests/home-sync-controller.test.mjs) |
| 自动备份延迟与配置读取 | [HomeBackupController](../../entry/src/main/ets/model/HomeBackupController.ts)；已接受备份由 BackupCoordinator 持有至结束 | [home-backup-controller](../../tools/tests/home-backup-controller.test.mjs) |
| 同步租约与集合等待 | [SyncActivity](../../entry/src/main/ets/model/SyncSettings.ts)；持有者释放，取消请求不等于 IO 已结束 | [sync-settings](../../tools/tests/sync-settings.test.mjs) |
| 学习卡片/队列代次与接受后的操作 | [StudySessionController](../../entry/src/main/ets/model/StudySessionController.ts)；过期读取不得覆盖新会话 | [study-session-controller](../../tools/tests/study-session-controller.test.mjs) |
| 浏览批量快照与操作占用 | [BrowserOperationController](../../entry/src/main/ets/model/BrowserOperationController.ts)；离页禁止 UI 回写但不取消已接受写入 | [browser-operation-model](../../tools/tests/browser-operation-model.test.mjs) |
| 应用内 Agent 会话、检索范围与辅助确认账本 | [AgentSessionController](../../entry/src/main/ets/backend/agent/AgentSessionController.ets) 拥有会话状态和 ActionExecutor；Scope 拥有稳定 ID | [ai-agent-v2-runtime](../../tools/tests/ai-agent-v2-runtime.test.mjs) |
| 卡库 ChangeDraft 提交 | [AgentDraftExecutor](../../entry/src/main/ets/backend/agent/AgentDraftExecutor.ets)；独立于辅助动作确认协议，调用方保持批次占用 | [agent-page-models](../../tools/tests/agent-page-models.test.mjs)、[草稿媒体回归](../../tools/tests/ai-agent-draft-media-runtime.test.mjs) |

可执行边界见 [architecture-boundaries.test.mjs](../../tools/tests/architecture-boundaries.test.mjs)：字面量模块依赖不得有环或无法解析的相对引用；下层不反向依赖页面/组件；`model/**/*.ts`、`proto/**/*.ts` 只依赖这两层的 `.ts`；Runner/Registry/工具不得传递依赖确认执行器。它不是完整语言解析器或运行时权限证明，不能替代真实模块行为测试与 HAP 编译。

## `native`

| 路径 | 唯一责任 | 关键边界 |
| --- | --- | --- |
| `native/` | Rust/C/C++ 核心、FFI 和上游适配 | 保留工具链、锁定协议、错误语义和生命周期 |
| `third_party/` | 锁定的上游源码副本 | 只按 `UPSTREAM.lock` 更新，不把本地临时修复当源码事实 |

## `tools`

| 路径 | 唯一责任 | 关键边界 |
| --- | --- | --- |
| `tools/tests/` | 可重复的 Node 行为和结构契约测试 | 新增业务规则优先测试真实模块，不锁死无意义源码形状 |
| `tools/test.mjs`、`test-suites.mjs` | 测试发现和领域筛选 | 完整测试不依赖手写测试文件总表 |
| `tools/verify.mjs` | 分阶段仓库、原生和 HAP 门禁 | 不把设备验收伪装成构建通过 |
| `tools/change-impact.mjs` | 变更路径收集与最低验证计划 | 只读、不代替依赖分析，不宣称验证已执行 |
| `.github/workflows/` | CI 调用稳定验证入口 | 不复制只在 CI 可运行的隐藏逻辑 |

## `docs` 与规则

| 路径 | 唯一责任 | 关键边界 |
| --- | --- | --- |
| `AGENTS.md`、`.agents/` | 编程 Agent 的当前约束 | 不写产品运行时 Agent 行为，不引用历史计划作为命令源 |
| `docs/development/` | 当前领域入口、事实来源和验证路径 | 不复制未经验证的动态统计 |
| `docs/decisions/` | 当前长期决策及其影响 | 不替代源码、测试或临时排查记录 |
| `docs/superpowers/`、发布记录 | 历史背景和归档材料 | 不发出当前执行指令 |
