# Comments 规则

## 三层注释模型

关键模块按需记录意图与不变量；简单函数不强制注释。以下只是有必要时的参考格式：

```typescript
/**
 * 一句话意图说明。
 *
 * 更详细的业务说明（可选，2-3 句话）。
 *
 * Invariants:
 * - 不变量 1（必须保持的隐式约束）
 * - 不变量 2
 *
 * Extension Points:
 * - 扩展点 1（如何在此处加新功能）
 * - 扩展点 2
 */
```

## 各字段语义

| 字段 | 必填 | 内容 |
|---|---|---|
| 意图说明 | 有注释时 | 一句话说清"这个函数做什么、为什么需要" |
| 业务说明 | 否 | 复杂逻辑补充：为什么选这种实现、踩过的坑、关键约束 |
| Invariants | 关键模块必填 | 调用方必须保证的前提、函数保证的输出、不可破坏的隐式约束 |
| Extension Points | 可扩展模块必填 | 如何在此处加新功能、参考实现指向 |

## 不要写

- ❌ 改动历史（"2026-07-30 修改"、"原方案 X 改为 Y"）—— 走 `.trae/decisions.md`
- ❌ 文件路径 / 行号 / 调用关系 —— 用 SearchCodebase 查
- ❌ "What"（这行代码做什么）—— 代码自解释
- ❌ 完整重述代码逻辑 —— 注释比代码长就是失败
- ❌ 块 ID（`@块ID SETTINGS-RATEAPP-001`）—— 旧式 8 字段注释，不再新增

## 旧式 8 字段注释（迁移状态）

项目历史上有 28 处 `@块ID / @名称 / @作用 / @输入 / @输出 / @业务规则 / @副作用` 8 字段注释。按迁移指南：
- 既有 8 字段注释保留不动（量大风险高，不强行改格式）
- 新增函数用本规则定义的三层注释格式
- 不再新增 @块ID

## 行内注释

- 写"为什么这么写"，不写"改了什么历史"
- 保持精简（1 行优先，不超过 3 行）
- 复杂决策走 `.trae/decisions.md`，源码注释保持精简

## 资源引用注释

i18n key 改动时，在调用点附近加 1 行注释指明 key 命名规则：

```typescript
// i18n key 与 ColorTheme 联合类型一一对应：theme_color_aurora / forest / midnight / lagoon / sunset / lemon。
return this.getUIContext().getHostContext()!.resourceManager.getStringByNameSync('theme_color_' + theme);
```
