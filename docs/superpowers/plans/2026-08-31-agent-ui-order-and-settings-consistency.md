# Agent UI Order and Settings Consistency Implementation Plan

> 归档状态：这是一次性历史设计/执行记录，不是当前路线图、待办列表或操作手册。未勾选项不表示仍未实现；当前事实请查阅 [文档导航](../../README.md)、[开发状态](../../DEVELOPMENT_PLAN.md)、[当前架构](../../architecture.md) 和实际源码/测试。


**Goal:** 默认折叠工具详情，把草稿移动到过程信息下方，并让 AI 智能体设置卡片复用现有设置页样式。

**Architecture:** 保留现有 `AgentToolTrace` 与 `AI制卡页` 结构，只改变 UI 初始状态和 Builder 顺序；新增带 `@BuilderParam` 内容槽的 `设置分组卡片`，所有主设置分组共享标题、色板、方框、圆角和箭头动画。

**Tech Stack:** ArkTS、ArkUI、Node.js `node:test` 静态契约测试、hvigor。

## Global Constraints

- 不修改 Agent 工具协议与草稿执行语义。
- 不修改 Anki Rust、protobuf、NAPI ABI 或数据库 schema。
- 保留工具参数/输出脱敏与截断边界。
- 当前工作区包含用户未提交改动，只编辑本计划列出的文件，不自动提交或清理。

---

### Task 1: 锁定默认折叠和消息顺序

**Files:**
- Modify: `tools/tests/ai-agent-tool-diagnostics.test.mjs`
- Modify: `tools/tests/ai-agent-entry-contract.test.mjs`
- Modify: `entry/src/main/ets/model/agent/AgentToolDiagnostics.ts`
- Modify: `entry/src/main/ets/model/agent/AgentConversationStore.ets`
- Modify: `entry/src/main/ets/pages/AI制卡页.ets`

**Interfaces:**
- Consumes: `AgentToolTrace.expanded: boolean`
- Produces: 新 trace 与历史 trace 默认 `expanded: false`；`AI气泡` 顺序为过程后草稿。

- [x] **Step 1: 写失败测试**

将诊断测试期望改为 `expanded: false`；在入口契约测试中截取 `AI气泡`，断言 `ai_agent_reasoning_process`、`ai_agent_tool_process`、`来源列表` 均位于 `卡片列表` 和 `变更草稿列表` 之前。

- [x] **Step 2: 验证测试按预期失败**

Run: `node --experimental-transform-types --import ./tools/tests/register-ts-hook.mjs --test tools/tests/ai-agent-tool-diagnostics.test.mjs tools/tests/ai-agent-entry-contract.test.mjs`

Expected: 默认展开断言及消息顺序断言失败。

- [x] **Step 3: 最小实现**

把 `createStartedAgentToolTrace()` 的 `expanded` 改为 `false`，历史净化时强制默认折叠；调整 `AI气泡` Builder 块顺序，正文后先渲染过程与来源，再渲染两类草稿和操作按钮。

- [x] **Step 4: 验证聚焦测试通过**

Run: `node --experimental-transform-types --import ./tools/tests/register-ts-hook.mjs --test tools/tests/ai-agent-tool-diagnostics.test.mjs tools/tests/ai-agent-entry-contract.test.mjs tools/tests/ai-agent-history-contract.test.mjs`

Expected: 相关测试全部 PASS。

### Task 2: 提取并迁移统一设置分组卡片

**Files:**
- Create: `entry/src/main/ets/components/settings/设置分组卡片.ets`
- Modify: `tools/tests/ai-agent-entry-contract.test.mjs`
- Modify: `tools/tests/ai-agent-settings-contract.test.mjs`
- Modify: `entry/src/main/ets/pages/AI制卡页.ets`
- Modify: `entry/src/main/ets/components/settings/外观分组.ets`
- Modify: `entry/src/main/ets/components/settings/调度器分组.ets`
- Modify: `entry/src/main/ets/components/settings/布局分组.ets`
- Modify: `entry/src/main/ets/components/settings/同步分组.ets`
- Modify: `entry/src/main/ets/components/settings/AIAgent设置分组.ets`
- Modify: `entry/src/main/ets/components/settings/术语分组.ets`
- Modify: `entry/src/main/ets/components/settings/数据分组.ets`
- Modify: `entry/src/main/ets/components/设置面板.ets`

**Interfaces:**
- Consumes: `设置面板色板_取(是否深色)`、`@BuilderParam 内容`
- Produces: 所有主设置分组使用 `设置分组卡片({ 标题, 是否深色, 是否展开, ... }) { ... }`；工具过程使用同款旋转箭头。

- [x] **Step 1: 写失败测试**

断言工具箭头使用固定 `Text('▼')`、`.rotate({ angle: expanded ? 0 : -90 })` 与 `animateTo({ duration: 150, curve: Curve.EaseOut })`；断言公共组件拥有统一色板/方框/箭头，所有主设置分组均使用它且不再定义本地 `分组头部`。

- [x] **Step 2: 验证测试按预期失败**

Run: `node --experimental-transform-types --import ./tools/tests/register-ts-hook.mjs --test tools/tests/ai-agent-entry-contract.test.mjs tools/tests/ai-agent-settings-contract.test.mjs`

Expected: 公共组件缺失、各分组仍重复标题栏、工具箭头未旋转。

- [x] **Step 3: 最小实现**

实现 `设置分组卡片` 的标题、可选帮助按钮、内容槽和统一外壳；迁移所有主设置分组及内联分组。工具行点击用 150ms EaseOut 包裹状态切换，固定 `▼` 并旋转。

- [x] **Step 4: 验证聚焦测试通过**

Run: `node --experimental-transform-types --import ./tools/tests/register-ts-hook.mjs --test tools/tests/ai-agent-entry-contract.test.mjs tools/tests/ai-agent-settings-contract.test.mjs tools/tests/ai-agent-tool-diagnostics.test.mjs tools/tests/ai-agent-history-contract.test.mjs`

Expected: 全部 PASS。

### Task 3: 全量验证和模拟器验收

**Files:**
- Modify: `.trae/decisions.md`
- Modify: `PROJECT_CONTEXT.md`

**Interfaces:**
- Consumes: 前两项实现和签名 HAP
- Produces: 可追溯验证结论与未覆盖限制。

- [x] **Step 1: 运行完整测试**

Run: `npm test`

Expected: 0 fail。

- [x] **Step 2: 运行完整构建**

Run: `npm run build:app`

Expected: Rust 双架构与 ArkTS `BUILD SUCCESSFUL`。

- [x] **Step 3: 覆盖安装并目视验证**

使用 `hdc install -r entry/build/default/outputs/default/entry-default-signed.hap`，只在在线模拟器验证工具初始折叠、箭头旋转、草稿位于过程下方及 AI 设置卡片外观。

- [x] **Step 4: 记录证据**

在 `.trae/decisions.md` 和 `PROJECT_CONTEXT.md` 记录测试、构建、设备类型和实体手机是否在线；不把模拟器结果描述为真机结果。
