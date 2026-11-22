# 代码检查记录

工具：DevEco Code Linter（DevEco Studio 内置，SDK 26.0.0），规则集 `@performance/recommended` 与 `@typescript-eslint/recommended`，配置见 [code-linter.json5](../../code-linter.json5)。

运行：

```sh
npm run lint:arkts
```

需要 PATH 上可用的 DevEco CLI 和支持 JSON 报告的 DevEco Studio。命令扫描应用主源码，将完整 JSON 与提交、CLI 版本、范围和时间元数据写入 `.hvigor/arkts-lint/`。错误、工具失败或报告异常均返回非零，警告和建议保留在报告中。[定时及手动 DevEco 工作流](../../.github/workflows/hap.yml)归档本轮结果。

首次全量检查约需 7 分钟。报告中的 `filesChecked` 表示有检查结果的文件数，而不是扫描的文件总数。

## 检查范围

扫描 `entry/src/main/ets` 下全部 `.ets` / `.ts`。不检查以下内容：

- `proto/generated/`：由 `tools/core-protocol.mjs` 从锁定的官方协议描述生成，正确性由 `npm run protocol:check` 与协议差分测试保证；
- DevEco 默认排除的 `ohosTest`、`build`、`oh_modules` 等目录，以及工具、官网、桌面端和原生库等非 ArkTS 应用源码。

## 规则调整及依据

| 规则 | 调整 | 依据 |
| --- | --- | --- |
| `no-unsafe-member-access` / `-call` / `-assignment` / `-argument` / `-return` | `.ts` 关闭，`.ets` 保留 | 该 SDK 的分析器对 `.ts` 模块不解析 ES 标准库类型，`String.split`、`Array.from`、`number[]` 字面量等都被推断为 `any`；首次检查约 1.03 万条均属此类。类型安全由 ArkTS 严格编译保证。 |
| `consistent-type-imports` | `.ts` 关闭 | 用 TypeScript 编译器 API 逐条核对了 93 条报告：真正只作类型使用的 43 处已改为 `import type`（另有 1 处在生成代码中，由生成器负责，未手改）；其余 49 处的导入名在文件中被 `new` 或调用（如 `new StudyOptions()`），属误报。 |
| `await-thenable` | `.ets` 降为 warning，`.ts` 关闭 | 已修复 TTS 引擎同步 `stop()` / `shutdown()` 的多余 `await`（3 处）。其余报告来自分析器不识别 `if (task !== null) await task` 的类型收窄、返回 Promise 的函数字段和 `await import()`。 |
| `prefer-literal-enum-member` | `proto/messages` 关闭 | 领域枚举按名称引用生成的协议枚举（如 `SearchSearchNodeCardState.CARD_STATE_DUE`），使协议数值只有一处来源；改成字面量会复制协议常量。 |

注意：该版本 `overrides.files` 中的 `dir/**/*.ts` 不匹配直接位于 `dir/` 下的文件，需要写成 `dir/*.ts`（`ignore` 不受此影响）。

## 当前结果

2026-11-22，基线提交 `18baa1a1`，DevEco CLI 1.3.0-stable。本次扫描范围为 `entry/src/main/ets`，按配置排除生成代码。

| 级别 | 数量 |
| --- | --- |
| Error | 0 |
| Warning | 148 |
| Suggestion | 2 |

首次检查时为 10,481 个 error。其中约 10,250 个是上表所述的分析器误报，通过规则调整处理；真实问题已在代码中修复，包括 43 处纯类型导入、3 处多余的 `await` 和 1 处缺失的返回类型。

初次归档的 150 条 warning 按规则分布及处理状态：

| 规则 | 数量 |
| --- | --- |
| `@performance/avoid-overusing-custom-component-check` | 67 |
| `@performance/bad-deep-clone-check` | 35 |
| `@typescript-eslint/await-thenable` | 20 |
| `@performance/hp-arkui-no-state-var-access-in-loop` | 14 |
| `@performance/foreach-args-check` | 7 |
| `@performance/reuse-date-instances-check` | 5 |
| `@performance/hp-arkui-use-reusable-component` | 2 |

| 规则 | 处理 |
| --- | --- |
| `avoid-overusing-custom-component-check` | 待处理：涉及 64 个组件，几乎都是无独立状态的展示组件（按钮、设置行、空态等），规则建议改为 `@Builder` 以减少组件实例。它们多数是 `components/common` 的公开组件，被多个页面引用；改写会改变调用方式，需要随界面回归分批迁移。 |
| `bad-deep-clone-check` | 待评估：`JSON.parse(JSON.stringify())` 用于在提交、确认或比较前取得普通数据快照（牌组改名/移动计划、远程控制状态、Agent 记忆基线等）。替换方案必须保持深拷贝语义，需逐处评估。 |
| `await-thenable` | 保留为 warning：逐条核对过，剩余均为上节所述的类型收窄误报。 |
| `foreach-args-check`、`hp-arkui-*`、`reuse-date-instances-check` | 待随相关界面任务处理，需在设备上验收渲染。 |

日志统一改用 `AppLog` 后，`high-frequency-log-check`（原 12 条）不再报告，因为分析器不把 `AppLog` 识别为日志调用；这不代表问题已消除。核对过这 12 处：日志只在首次布局、画布尺寸变化或异常分支执行，不会每帧或每次触摸打印。
