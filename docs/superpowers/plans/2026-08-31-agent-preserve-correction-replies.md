# Agent 自动补救回复保留 Implementation Plan

> 归档状态：这是一次性历史设计/执行记录，不是当前路线图、待办列表或操作手册。未勾选项不表示仍未实现；当前事实请查阅 [文档导航](../../README.md)、[开发状态](../../DEVELOPMENT_PLAN.md)、[当前架构](../../architecture.md) 和实际源码/测试。


**Goal:** 保留制卡 Agent 自动 `draft_correction` 轮次中已经显示的 AI 回复，避免后续工具尝试覆盖前文。

**Architecture:** 保持 `AgentRunner` 的有界 Provider/工具循环不变，只修改 `AI制卡页` 的事件渲染逻辑。`draft_correction` 到来时，页面保留当前消息正文并追加换行；下一轮 `text_delta` 继续追加到同一条 AI 消息，历史与 Provider 回放继续使用该消息。

**Tech Stack:** ArkTS、HarmonyOS ArkUI、Node.js `node:test` 契约测试。

## Global Constraints

- 不改变 Anki Rust、protobuf、NAPI ABI、数据库、调度或 Agent 草稿确认/高风险写入边界。
- 不拆分 Provider 轮次消息，不新增消息协议或历史字段。
- 任何 `.ts/.ets` 改动后运行 `npm test`。
- 保留工作区中与本任务无关的未提交改动，不使用 `git add .`。

---

### Task 1: Add the regression contract test

**Files:**
- Modify: `tools/tests/ai-agent-entry-contract.test.mjs` near the existing reasoning/error contract tests.
- Test: `tools/tests/ai-agent-entry-contract.test.mjs`

**Interfaces:**
- Consumes: source text from `entry/src/main/ets/pages/AI制卡页.ets`.
- Produces: a regression assertion that the `draft_correction` event preserves existing visible text and inserts a round separator.

- [ ] **Step 1: Write the failing test**

Add one test:

```js
test('draft correction keeps earlier visible model text instead of clearing the bubble', () => {
  const page = read('entry/src/main/ets/pages/AI制卡页.ets');
  assert.match(page,
    /event\.kind === 'status' && event\.text === 'draft_correction'[\s\S]*message\.正文 \+= '\\n\\n'/,
    'a correction round must separate and retain the previous visible reply');
  assert.doesNotMatch(page,
    /event\.kind === 'status' && event\.text === 'draft_correction'[\s\S]*message\.正文 = ''/,
    'a correction round must not erase the previous visible reply');
});
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```powershell
npm test -- tools/tests/ai-agent-entry-contract.test.mjs
```

Expected: FAIL because the current `draft_correction` branch assigns `message.正文 = ''` and does not append a separator.

- [ ] **Step 3: Commit the failing test**

```powershell
git add -- tools/tests/ai-agent-entry-contract.test.mjs
git commit -m "test: preserve agent correction replies"
```

### Task 2: Preserve correction-round text in the UI

**Files:**
- Modify: `entry/src/main/ets/pages/AI制卡页.ets:895-900`

**Interfaces:**
- Consumes: `AgentEvent` values emitted by `AgentRunner`.
- Produces: the same `聊天消息` instance with prior `正文` retained across `draft_correction` events.

- [ ] **Step 1: Implement the minimal change**

Replace the clearing assignment in the `draft_correction` branch with a separator:

```ts
if (event.kind === 'status' && event.text === 'draft_correction') {
  message.正文 += '\n\n';
  message.是否错误 = false;
}
```

Do not modify `AgentRunner`, `构建Provider输入`, `appendRoundContinuation`, tool execution, or draft saving.

- [ ] **Step 2: Run the focused test and verify it passes**

Run:

```powershell
npm test -- tools/tests/ai-agent-entry-contract.test.mjs
```

Expected: PASS, including the new correction-retention test and all existing tests in the file.

- [ ] **Step 3: Run the full Node contract suite**

Run:

```powershell
npm test
```

Expected: PASS with no new failures.

- [ ] **Step 4: Commit the implementation**

```powershell
git add -- entry/src/main/ets/pages/AI制卡页.ets
git commit -m "fix: retain agent correction replies"
```

### Task 3: Verify the final change set

**Files:**
- Inspect: `entry/src/main/ets/pages/AI制卡页.ets`
- Inspect: `tools/tests/ai-agent-entry-contract.test.mjs`

**Interfaces:**
- Consumes: the committed test and UI change.
- Produces: evidence that only the requested response-retention behavior changed.

- [ ] **Step 1: Inspect the final diff**

Run:

```powershell
git show --stat --oneline HEAD~1..HEAD
git diff HEAD~2..HEAD -- entry/src/main/ets/pages/AI制卡页.ets tools/tests/ai-agent-entry-contract.test.mjs
```

Expected: only the regression test and the single `draft_correction` display branch changed; no unrelated working-tree files are included.

- [ ] **Step 2: Confirm the worktree state**

Run:

```powershell
git status --short
```

Expected: only pre-existing unrelated user changes remain, if any; the task's files are clean.
