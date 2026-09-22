# AI Agent Runtime and Provider Implementation Plan

> 归档状态：这是一次性历史设计/执行记录，不是当前路线图、待办列表或操作手册。未勾选项不表示仍未实现；当前事实请查阅 [文档导航](../../README.md)、[开发状态](../../DEVELOPMENT_PLAN.md)、[当前架构](../../architecture.md) 和实际源码/测试。


**Goal:** Build a native ArkTS bounded Agent runtime with DeepSeek-first provider selection, OpenAI/Custom adapters, secure key storage, real SSE events, web-search evidence, and safe semantic tool dispatch.

**Architecture:** Pure TypeScript defines events, messages, provider capabilities, tool schemas, policy and draft state. Harmony-specific adapters own NetworkKit, Asset Store and persistence. `AgentRunner` consumes normalized provider events and invokes an allow-listed `AgentToolRegistry`; write tools return drafts only.

**Tech Stack:** ArkTS, NetworkKit `requestInStream`, AssetStoreKit, ArkData Preferences, DeepSeek Responses/Chat Completions, OpenAI Responses API, Node contract tests.

## Global Constraints

- Complete `2026-08-30-ai-agent-notetype-foundation.md` first.
- No Node-only SDK dependency, dynamic code execution, raw RPC tool, `any`, or public `unknown`.
- Model code under `model/agent/` must not import `@kit.*`.
- API keys live in Asset Store, never Preferences/logs/messages.
- Search success requires actual search event/result/source evidence.
- Tool loop limits: at most 8 provider calls and 16 tool calls per user turn.
- Write tools may only return a `ChangeDraft`; execution is outside the runner.

---

### Task 1: Pure Agent contracts and policy

**Files:**
- Create: `entry/src/main/ets/model/agent/AgentTypes.ts`
- Create: `entry/src/main/ets/model/agent/AgentPolicy.ts`
- Create: `entry/src/main/ets/model/agent/ProviderCatalog.ts`
- Create: `tools/tests/ai-agent-policy.test.mjs`

- [x] Write RED tests for provider defaults, capability checks, tool risk classification, batch splitting (100 default/1000 ceiling), tool-call deduplication, and “search requested but no evidence” failure.
- [x] Run the focused test and verify missing modules fail.
- [x] Implement static ArkTS-friendly interfaces and pure functions; use discriminated unions with fixed object layouts.
- [x] Run focused tests GREEN.

Required public types include `AgentMode`, `ProviderId`, `ProviderCapabilities`, `AgentEvent`, `AgentToolDefinition`, `AgentToolCall`, `ToolRisk`, `ChangeDraft`, `DraftOperation`, `SearchSource`, and `AgentTurnLimits`.

---

### Task 2: Secure provider settings

**Files:**
- Create: `entry/src/main/ets/backend/agent/AgentSettingsStore.ets`
- Create: `entry/src/main/ets/backend/agent/AgentSecretStore.ets`
- Modify: `entry/src/main/ets/model/AI制卡存储.ets`
- Create: `tools/tests/ai-agent-settings-contract.test.mjs`

- [x] Write RED source-contract tests asserting built-in DeepSeek/OpenAI fixed base URLs, Custom editable URL/model, per-provider remembered model, search mode Auto/Always/Off, and Asset Store use for keys.
- [x] Implement Preferences storage only for non-secret configuration.
- [x] Implement Asset Store add/query/update/remove using a stable alias per provider and UTF-8 conversion.
- [x] Implement one-time migration: read legacy `ai_api_key`, store it under the matching provider alias, remove the legacy preference only after successful Asset Store write and flush.
- [x] Never log plaintext or include it in thrown error text.
- [x] Run focused and full tests.

---

### Task 3: SSE parser and normalized provider transport

**Files:**
- Create: `entry/src/main/ets/model/agent/SseParser.ts`
- Create: `entry/src/main/ets/backend/agent/AgentTransport.ets`
- Create: `entry/src/main/ets/backend/agent/DeepSeekAdapter.ets`
- Create: `entry/src/main/ets/backend/agent/OpenAIAdapter.ets`
- Create: `entry/src/main/ets/backend/agent/CustomAdapter.ets`
- Create: `tools/tests/ai-agent-sse.test.mjs`
- Create: `tools/tests/ai-agent-provider-contract.test.mjs`

- [x] Write RED pure tests for split UTF-8 chunks, multiple SSE events per chunk, comments, `[DONE]`, malformed event isolation, tool-call argument accumulation and source events.
- [x] Implement the pure incremental parser.
- [x] Implement `requestInStream` with abort, headers/status classification and `dataReceive` parsing.
- [x] Implement DeepSeek Responses with function tools/server-side `web_search` when supported; Responses reasoning items are preserved in tool loops (no Chat Completions fallback in the built-in V4 Flash path).
- [x] Implement OpenAI Responses event mapping for output text, function calls, web-search sources and reasoning summaries actually returned by the API.
- [ ] Implement Custom adapter with standards-first function calls and strict structured-Agent-JSON fallback.
- [x] Run focused tests and `npm test`.

---

### Task 4: Bounded runner and semantic tool registry

**Files:**
- Create: `entry/src/main/ets/backend/agent/AgentRunner.ets`
- Create: `entry/src/main/ets/backend/agent/AgentToolRegistry.ets`
- Create: `entry/src/main/ets/backend/agent/CardAgentTools.ets`
- Modify: `entry/src/main/ets/backend/笔记服务.ts`
- Create: `tools/tests/ai-agent-runner-contract.test.mjs`

- [x] Write RED contracts for tool allow-list, 8/16 limits, repeated `toolCallId`, write-as-draft and sibling-card RPCs; handler argument/stable-ID/partial-failure tests remain with concrete tools.
- [x] Add note service wrappers needed by read tools: CardsOfNote method 12 and GetSingleNotetypeOfNotes method 13, with pure encoders/decoders in `NoteMessages.ts`.
- [ ] Implement read tools `get_note_type_capabilities`, `get_note_context`, `search_cards`, and `list_decks` using existing services.
- [ ] Implement draft tools `propose_create_notes`, `propose_update_notes`, and `propose_move_cards`; do not call write RPCs.
- [x] Implement runner loop, cancellation, dedupe, limit errors, network/capability separation and search-evidence enforcement.
- [ ] Run focused/full tests and `npm run build:app`.

---

### Task 5: Settings UI and runtime observability

**Files:**
- Create: `entry/src/main/ets/components/settings/AIAgent设置分组.ets`
- Modify: `entry/src/main/ets/components/设置面板.ets`
- Modify: `entry/src/main/resources/base/element/string.json`
- Modify: `entry/src/main/resources/en_US/element/string.json`
- Create: `tools/tests/ai-agent-settings-ui-contract.test.mjs`
- Modify after evidence: `.trae/decisions.md`
- Modify after evidence: `PROJECT_CONTEXT.md`

- [ ] Add synchronized i18n keys first and write RED UI contracts.
- [ ] Add provider/model dropdowns, Custom inputs, masked key editing, search mode, batch ceiling and privacy disclosure.
- [ ] Add quick provider/model selector contract for the shared Agent page, but do not duplicate full settings.
- [ ] Run `npm test`, `npm run build:app`, and device tests for remembered selection, key migration, SSE cancellation, offline error and unsupported-search error.
- [ ] Record actual evidence.
