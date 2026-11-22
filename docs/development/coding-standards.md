# 编码规范

本页是面向开发者和评审者的规范汇总，说明代码应写成什么样，以及每条规则由什么来检查。
条款的权威来源是 [.agents/rules/](../../.agents/rules/) 和 [ArkTS 适配规则](../../.agents/adapters/arkts.md)；两边冲突时以源规则为准，并同步修正本页。

## 1. 自动检查一览

| 方面 | 工具 / 入口 | 范围 |
| --- | --- | --- |
| ArkTS / TS 代码规范 | DevEco Code Linter，配置 [code-linter.json5](../../code-linter.json5)，结果见 [代码检查记录](../quality/code-linter.md) | `entry/src/main/ets` |
| ArkTS 语法与类型 | HAP 编译（ArkTS 严格模式）+ [HAP 警告基线](verification.md#hap-警告门禁) | 应用全部源码 |
| 分层与依赖方向 | `tools/tests/architecture-boundaries.test.mjs` | 导入可解析、无循环依赖、下层不反向依赖页面/组件、纯模型不接触平台 Kit |
| 公共组件边界 | `tools/tests/common-boundary.test.mjs` | `components/common` 不新增业务或平台 IO 依赖，公开组件必须有索引 |
| 文档链接 | `tools/tests/documentation-contract.test.mjs` | 全部 Markdown 的相对链接与章节锚点 |
| 协议一致性 | `npm run protocol:check` | 生成协议与锁定 Anki 描述一致 |
| Rust | `cargo fmt --check`、`cargo clippy -D warnings`（CI） | `native/rsharmony` |

完整测试入口是 `npm test`（约 4000 个用例），CI 见 [.github/workflows/ci.yml](../../.github/workflows/ci.yml)。按改动范围选择检查的方法见 [验证说明](verification.md#按变更路径选择验证)。

## 2. 分层

```text
pages/ 与 components/（UI）
  -> 编排：*Session、*Controller、*Coordinator（model/）
  -> 策略与纯模型（model/，纯 .ts，可在 Node 中直接测试）
  -> 领域 Service 与写入执行器（backend/）
  -> proto/ 编解码 -> Node-API -> Rust Core
```

- 下层不 import 页面或组件；不用可变 UI 状态或全局变量作为跨层协议。
- `model/` 与 `proto/` 下的 `.ts` 不依赖平台 Kit，平台能力放在 `backend/` 或 `utils/` 的适配层。
- 页面参数统一定义在 `model/navigation/PageParams.ts`，页面之间不为取得参数类型而互相引用。
- 各目录的所有者和修改入口见 [模块责任与边界](ownership.md)，整体结构见 [当前架构](../architecture.md)。

## 3. 命名

| 类别 | 风格 | 示例 |
| --- | --- | --- |
| 类、`@Component struct`、接口、类型 | PascalCase | `CollectionService`、`DeckSummary` |
| 函数、方法、变量 | camelCase | `loadHomeData`、`isRefreshing` |
| 常量、枚举成员 | UPPER_SNAKE_CASE | `APP_LOG_DOMAIN` |
| 资源 key | snake_case | `app.string.color_theme` |
| 文件名 | 与主要导出同名 | `CollectionService.ts`、`DeckListItem.ets` |

约定后缀：`Service`（业务服务）、`Session` / `Controller`（编排）、`Store`（偏好持久化）、`Helper`（纯函数工具）、`Panel`（全屏弹层）、`Builder`（HTML/字符串构造）。

新代码使用英文标识符。早期代码中的中文标识符按所在文件的局部风格维护，随相关任务逐步迁移，不做一次性全量改名，以免破坏路由、资源和测试引用。

## 4. ArkTS 约束

- 遵守 ArkTS 严格模式：不用解构声明、无类型对象字面量和 `any`；类型断言只用 `as`；`Map` / `Set` 写明泛型。
- 仅作类型使用的导入写成 `import type`。
- 组件字段不与 ArkUI 内置属性方法同名（如 `enabled`、`width`）；组件内的派生状态用普通方法，不用 getter。
- `@Component` 成员顺序：装饰器状态、回调属性、私有字段、生命周期、私有方法、`@Builder`、`build()`。
- 同步 API（如 TTS 引擎的 `stop()` / `shutdown()`）不加 `await`；异步调用要么 `await`，要么显式 `.catch()` 处理。

## 5. 界面与资源

- 用户可见文字全部走资源（`$r('app.string.xxx')`）；`Text()` / `Button()` 内不写中文字面量，所有语言的 key 数量和名称保持一致。
- 颜色、尺寸优先取主题色板（`COLOR_KEYS`、`应用尺寸`）和公共样式；同一语义的界面复用 `components/common` 的组件，见 [界面一致性](appearance.md#视觉与交互一致性)。

## 6. 日志

- 统一使用 `AppLog.debug/info/warn/error(tag, message)`（[model/AppLog.ts](../../entry/src/main/ets/model/AppLog.ts)）；不直接调用 `console.*`。
- 运行时输出到 hilog，全应用使用同一个 domain `APP_LOG_DOMAIN`（`0x4342`），由 [HilogLogSink](../../entry/src/main/ets/utils/HilogLogSink.ets) 在每个 Ability 进程启动时安装；`tag` 标识来源模块，例如 `StudyPage`、`CardAudio`。
- 直接使用 `hilog` 的既有代码也必须用 `APP_LOG_DOMAIN`。
- 日志中不写入 API Key、同步凭证或用户卡片正文；高频回调（触摸、布局）中不打印日志。

## 7. 注释

- 新代码的标识符用英文，注释用中文，只写代码本身说明不了的意图、不变量和取舍。
- 不写改动流水和日期（交给 Git），不写易过期的行号或调用图；跨模块的长期决策写进 [docs/decisions/](../decisions/README.md)。
- 早期的 `@块ID / @作用` 字段式注释不批量改写，内容过期时随实现一起修正，不再新增。

## 8. 测试

- 新业务规则写成可直接 import 的纯模型，用真实模块做行为测试；平台适配通过注入依赖测试。
- 修复真实 bug 时补能复现故障的回归用例；不为了让测试通过而削弱断言。
- 文案、图标和简单间距不专门写锁死措辞的测试。

## 9. 提交与交付

- 本机密钥、兑换发行工具和内部说明不入库，`.gitignore` 与源码导出门禁共同保证；提交源码包用 `npm run export:source`，见 [源码导出](verification.md#源码导出)。
- 设备安装只用 `hdc install -r` 覆盖安装，不卸载应用。
- 版本号只维护在 `AppScope/app.json5`，用公共版本管理工具递增。
