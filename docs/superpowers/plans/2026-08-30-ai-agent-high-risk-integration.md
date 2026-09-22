# AI Agent High-Risk Integration Implementation Plan

> 归档状态：这是一次性历史设计/执行记录，不是当前路线图、待办列表或操作手册。未勾选项不表示仍未实现；当前事实请查阅 [文档导航](../../README.md)、[开发状态](../../DEVELOPMENT_PLAN.md)、[当前架构](../../architecture.md) 和实际源码/测试。


**Goal:** Finish the shared AI create/edit Agent and add controlled delete, note-type migration, and template/CSS operations without changing Anki Rust or protobuf.

**Architecture:** Semantic handlers create immutable `ChangeDraft` values. `AgentDraftExecutor` is the only write boundary and accepts a short-lived confirmation token minted after baseline revalidation; high-risk drafts require a separate second confirmation token. Existing ArkTS services remain the only bridge to the compiled Rust core.

**Tech Stack:** ArkTS, ArkUI/NavPathStack, existing Anki services, Asset Store, NetworkKit SSE, Node contract tests.

## Global Constraints

- No changes to `third_party/anki/**/*.rs`, Anki proto files, native NAPI ABI, or database schema.
- No write service may be called from `AgentRunner` or `AgentToolRegistry`.
- Ordinary writes require one explicit confirmation; high-risk writes require two distinct UI events.
- Scope IDs must originate from entry context or tool results in the current turn.
- Baselines are re-read immediately before token minting; a mismatch returns `draft_conflict`.
- Batch size is based on actual affected card IDs: default 100, maximum 1000.
- Tests are written and observed RED before every production change.

---

### Task 1: Semantic tool schemas and scoped context

**Files:**
- Create: `entry/src/main/ets/model/agent/AgentToolSchemas.ts`
- Create: `entry/src/main/ets/backend/agent/AgentScope.ets`
- Modify: `entry/src/main/ets/backend/agent/AgentToolRegistry.ets`
- Test: `tools/tests/ai-agent-tool-safety.test.mjs`

**Interfaces:**
- Produces `AgentScope.registerCardIds/registerNoteIds/registerDeckIds/registerNotetypeIds` and `assert*InScope`.
- Produces `registerHighRiskDraft(name, handler)`; it returns a draft and exposes no commit method.

- [x] Write failing tests proving out-of-scope IDs, malformed JSON, unknown fields, raw RPC fields and duplicate draft IDs are rejected.
- [x] Run the focused test and verify the missing schema/scope implementation is the failure.
- [x] Implement fixed-layout argument decoders for all read, ordinary draft and high-risk draft tools.
- [x] Implement per-turn stable-ID scope and high-risk proposal registration.
- [x] Run focused tests GREEN.

### Task 2: Read context and ordinary draft tools

**Files:**
- Create: `entry/src/main/ets/backend/agent/CardAgentTools.ets`
- Modify: `entry/src/main/ets/backend/agent/AgentRunner.ets`
- Test: `tools/tests/ai-agent-card-tools-contract.test.mjs`

**Interfaces:**
- Registers `get_note_type_capabilities`, `get_note_context`, `search_cards`, `list_decks`.
- Registers `propose_create_notes`, `propose_update_notes`, `propose_move_cards`.

- [x] Write failing tests for exact context, cloze fields, sibling card IDs, deterministic batches and partial draft rows.
- [x] Verify RED.
- [x] Implement read handlers using existing Note/Card/Notetype/Search/Deck services.
- [x] Implement ordinary draft handlers with before/after values and actual affected card IDs.
- [x] Run focused tests GREEN.

### Task 3: High-risk proposal tools

**Files:**
- Create: `entry/src/main/ets/backend/agent/HighRiskAgentTools.ets`
- Modify: `entry/src/main/ets/model/agent/AgentTypes.ts`
- Modify: `entry/src/main/ets/model/agent/AgentPolicy.ts`
- Test: `tools/tests/ai-agent-high-risk-tools.test.mjs`

**Interfaces:**
- Registers the six `propose_*` tools listed in the design amendment.
- Extends `ChangeDraft` with `baselineHash`, `confirmationLevel`, `status`, and exact object-count fields.

- [x] Write failing tests for actual card impact, non-mixable structural operations, 1000-card ceiling and precise permanent-operation summaries.
- [x] Verify RED.
- [x] Implement proposal handlers; do not import write service methods into the registry.
- [x] Run focused tests GREEN.

### Task 4: Confirmation tokens and the only write executor

**Files:**
- Create: `entry/src/main/ets/backend/agent/AgentDraftExecutor.ets`
- Create: `entry/src/main/ets/model/agent/AgentConfirmation.ts`
- Test: `tools/tests/ai-agent-draft-executor-contract.test.mjs`

**Interfaces:**
- `prepare(draft): Promise<PreparedDraft>` re-reads baselines and returns a one-use token.
- `executeOrdinary(prepared, token)` accepts level 1.
- `executeHighRisk(prepared, firstToken, secondToken)` requires two distinct unexpired tokens.

- [x] Write failing tests for no-token, reused-token, expired-token, baseline conflict, wrong confirmation level and partial failures.
- [x] Verify RED.
- [x] Implement token validation and dispatch only to existing ArkTS services.
- [x] Ensure model events and page lifecycle methods cannot call execute methods.
- [x] Run focused tests GREEN.

### Task 5: Shared Agent page, settings, and create/edit entries

**Files:**
- Modify: `entry/src/main/ets/pages/AI制卡页.ets`
- Modify: `entry/src/main/ets/pages/首页.ets`
- Modify: `entry/src/main/ets/pages/学习页.ets`
- Modify: `entry/src/main/ets/pages/浏览页.ets`
- Modify: `entry/src/main/ets/components/主页操作面板.ets`
- Create: `entry/src/main/ets/components/settings/AIAgent设置分组.ets`
- Modify: `entry/src/main/ets/components/设置面板.ets`
- Modify: both `string.json` locale files
- Test: `tools/tests/ai-agent-entry-contract.test.mjs`
- Test: `tools/tests/ai-agent-high-risk-ui-contract.test.mjs`

- [x] Write failing contracts for separate create/edit entries, no eager API call, provider/model dropdowns, remembered values, editable drafts and two separate high-risk confirmation events.
- [x] Verify RED.
- [x] Connect the page to real `AgentRunner` events and sources while retaining existing editable/selectable create drafts.
- [x] Add home, study-current-card and browser-selection edit entries.
- [x] Add ordinary confirmation and a separate irreversible confirmation screen.
- [x] Add DeepSeek/OpenAI/Custom dropdown settings and privacy disclosure.
- [x] Run focused tests GREEN.

### Task 6: History, full verification, and device evidence

**Files:**
- Create: `entry/src/main/ets/model/agent/AgentConversationStore.ets`
- Modify: `.trae/decisions.md`
- Modify: `PROJECT_CONTEXT.md`
- Test: `tools/tests/ai-agent-history-contract.test.mjs`

- [x] Write RED tests that history excludes secrets, raw reasoning and media bytes while keeping tool audit/results.
- [x] Implement resumable/deletable local history.
- [ ] Run `npm test`; expected 0 failures. (2026-08-31: 625/626; only unrelated cloud-deck contract expects 2.3.3 while the worktree app version is 2.3.4.)
- [x] Run `npm run build:app`; expected `TYPE CHECK SUCCESSFUL` and `BUILD SUCCESSFUL`.
- [ ] Install with `hdc install -r` only; never uninstall. (Installed to both simulators; live provider/write/high-risk scenarios still require a configured API key and device testing.)
- [x] Record simulator and physical-device evidence separately; do not claim physical-device completion while no phone is online. (Simulator UI verified; no physical phone was online.)
