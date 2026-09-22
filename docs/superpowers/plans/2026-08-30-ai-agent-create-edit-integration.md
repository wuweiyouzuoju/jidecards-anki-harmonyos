# AI Agent Create and Edit Integration Plan

> 归档状态：这是一次性历史设计/执行记录，不是当前路线图、待办列表或操作手册。未勾选项不表示仍未实现；当前事实请查阅 [文档导航](../../README.md)、[开发状态](../../DEVELOPMENT_PLAN.md)、[当前架构](../../architecture.md) 和实际源码/测试。


**Goal:** Connect the native Agent runtime to the existing editable AI-create drafts and add ordinary AI-edit flows from home, study and browser without changing scheduling state.

**Architecture:** `AI制卡页.ets` becomes the shared Agent session surface through an explicit `mode` and optional immutable entry context. Existing card draft controls remain. Create/edit draft executors are separate from the runner and revalidate current Anki state immediately before applying writes.

**Tech Stack:** ArkUI/NavPathStack, existing Note/Card/Deck/Search services, AgentRunner, Node source-contract tests, Anki card rendering service.

## Global Constraints

- Complete the foundation and runtime plans first.
- Patch the existing untracked AI page incrementally; do not rewrite or discard its editable/selectable draft UI.
- Opening a current-card edit session performs no provider network request.
- Ordinary writes require one explicit confirmation; no delete/template/notetype-structure writes in Phase 1.
- Returning to StudyPage rerenders the same card and does not call scheduler answer/queue mutation methods.
- All new fixed copy is localized in base/en_US.

---

### Task 1: Shared page modes and local entry context

**Files:**
- Modify: `entry/src/main/ets/pages/AI制卡页.ets`
- Modify: `entry/src/main/ets/pages/首页.ets`
- Modify: `entry/src/main/ets/components/主页操作面板.ets`
- Modify: `entry/src/main/resources/base/element/string.json`
- Modify: `entry/src/main/resources/en_US/element/string.json`
- Create: `tools/tests/ai-agent-entry-contract.test.mjs`

- [ ] Write RED contracts for separate home entries and a shared `mode: 'create' | 'edit'` page parameter.
- [ ] Add immutable entry context types for optional card IDs/note IDs/selected IDs/deck.
- [ ] Render current card/note context locally before the first message; assert no `AgentRunner.runTurn` in `aboutToAppear` or context load.
- [ ] Preserve current deck/note-type selectors and card drafts in create mode.
- [ ] Add independent “AI 改卡” home action that opens edit mode with no preselected card.
- [ ] Run focused/full tests.

---

### Task 2: Connect create mode to Agent events and drafts

**Files:**
- Modify: `entry/src/main/ets/pages/AI制卡页.ets`
- Modify: `entry/src/main/ets/backend/AI制卡服务.ets`
- Create: `entry/src/main/ets/backend/agent/AgentDraftExecutor.ets`
- Create: `tools/tests/ai-agent-create-contract.test.mjs`

- [ ] Write RED contracts for real Agent event rendering, tool logs, sources, editable create drafts and explicit confirmation.
- [ ] Replace direct `请求AI生成卡片` use with `AgentRunner.runTurn`, while retaining the old parser only as a temporary internal Custom-adapter fallback during the same task; remove direct page dependency afterward.
- [ ] Convert `propose_create_notes` drafts to the existing `卡片草稿` representation.
- [ ] Before save, reload note-type capabilities, validate field counts/cloze positions, calculate actual generated card count and enforce batch splitting.
- [ ] Execute selected drafts through `笔记服务.新建笔记/添加笔记`; preserve per-item success/failure and retry.
- [ ] Run focused/full tests.

---

### Task 3: Study-page current-card AI edit

**Files:**
- Modify: `entry/src/main/ets/pages/学习页.ets`
- Modify: `entry/src/main/ets/pages/首页.ets`
- Modify: `entry/src/main/ets/pages/AI制卡页.ets`
- Modify: `entry/src/main/ets/backend/agent/AgentDraftExecutor.ets`
- Create: `tools/tests/ai-agent-study-edit-contract.test.mjs`

- [ ] Write RED contracts for a study more-menu entry, card/note context passing, no eager provider request, sibling-card warning and rerender-only return.
- [ ] Pass exact `cardId`, `noteId`, `templateIdx` and a completion callback through NavPathStack parameters.
- [ ] On first user send, load fresh note fields/tags/type capability/deck and include only necessary media supported by provider capability.
- [ ] Render update drafts as field/tag/deck diffs, including `CardsOfNote` count.
- [ ] Confirm once, re-read baseline, reject conflicts, apply note/card/deck service calls and return a result marker.
- [ ] On return, call existing card renderer for the same card; do not call `getQueuedCards`, `answerCard`, bury/suspend or due-date methods.
- [ ] Run focused/full tests.

---

### Task 4: Browser selected-card AI edit

**Files:**
- Modify: `entry/src/main/ets/pages/浏览页.ets`
- Modify: `entry/src/main/ets/pages/首页.ets`
- Modify: `entry/src/main/ets/pages/AI制卡页.ets`
- Create: `tools/tests/ai-agent-browser-edit-contract.test.mjs`

- [ ] Write RED contracts for cards/notes mode ID normalization, selected-count display, default 100-card limit and shared edit page navigation.
- [ ] In Cards mode map card IDs to unique note IDs with existing CardService; in Notes mode use selected note IDs directly.
- [ ] Resolve exact cards per note and show note count plus actual card count before any draft confirmation.
- [ ] Apply ordinary field/tag/deck changes in deterministic batches; keep successful writes and retain failed rows for retry.
- [ ] Refresh browser search results after completion without clearing unrelated search/filter state.
- [ ] Run focused/full tests.

---

### Task 5: History, source display and final validation

**Files:**
- Create: `entry/src/main/ets/model/agent/AgentConversationStore.ets`
- Modify: `entry/src/main/ets/pages/AI制卡页.ets`
- Modify: `entry/src/main/resources/base/element/string.json`
- Modify: `entry/src/main/resources/en_US/element/string.json`
- Create: `tools/tests/ai-agent-history-contract.test.mjs`
- Modify after evidence: `.trae/decisions.md`
- Modify after evidence: `PROJECT_CONTEXT.md`

- [ ] Add per-task local history with resumable/deletable metadata; persist final text, tool audit and reasoning summary, not raw reasoning or API keys.
- [ ] Render real search sources and write to Source/来源 only when that field exists and the confirmed draft includes it.
- [ ] Run `npm test` and `npm run build:app`.
- [ ] Device-test create normal/cloze/custom type, study edit, browser batch edit, provider switching, true web search, unsupported search, unsupported media, network interruption, cancellation and partial failure.
- [ ] Record actual evidence and leave Phase 2 high-risk tools unavailable in registry/UI.
