# Agent Conversational Setup and Clarification Implementation Plan

> 归档状态：这是一次性历史设计/执行记录，不是当前路线图、待办列表或操作手册。未勾选项不表示仍未实现；当前事实请查阅 [文档导航](../../README.md)、[开发状态](../../DEVELOPMENT_PLAN.md)、[当前架构](../../architecture.md) 和实际源码/测试。


> 历史设计说明：2026-09-04 用户确认的现行交互见 [Agent 2.0 实施约定](../../agent-2-design.md#澄清的对话呈现)。本文中的澄清自动折叠、“已确认”标题及共用工具外壳已被替代：澄清显示普通问题，回答后移除回答控件，上一段保留澄清工具记录，按简洁版/实验版默认收起/展开；底层协议和状态机仍保留。开局配置也沿用原有直接显示的选择控件。

**Goal:** Replace the fixed create-mode selectors with a local conversational setup card, let the Agent pause for structured clarification, and unify clarification and tool details under one collapsible conversation component.

**Architecture:** Pure TypeScript models own task snapshots, readiness, clarification validation, and answer serialization. `AgentRunner` treats `request_clarification` as a typed terminal tool result, while the shared ArkUI page coordinates local setup, pending clarification, history, and Provider requests. Focused ArkUI components render the shared disclosure shell, setup choices, and clarification choices without accessing Provider or Anki services.

**Tech Stack:** ArkTS/ArkUI, HarmonyOS Preferences, existing Responses/SSE Agent runner, Node `node:test` contract tests, Anki ArkTS service boundary.

## Global Constraints

- Do not modify Anki Rust, protobuf definitions, NAPI ABI, database schema, scheduling behavior, package identity, signing, or release configuration.
- All new identifiers use English names; Chinese comments/docstrings may explain intent and invariants.
- Every new user-visible string must exist in both Chinese and English resource files.
- The local setup bubble never enters Provider history and never causes a network request.
- Clarification never executes writes or bypasses scope, draft, confirmation, or baseline checks.
- `request_clarification` has one question, 2–4 mutually exclusive options, at most one recommendation, and optional free text.
- A create turn may end without a draft only when the result is `awaiting_clarification`.
- Resolved clarification collapses automatically but remains stored and included in later Provider context.
- Tool traces remain collapsed by default; status updates preserve the user's expanded state.
- Disclosure arrows use `▼`, 0/-90 degree rotation, and 150ms `Curve.EaseOut`; only the arrow animates.
- Do not use `git add .`; stage only task files.
- Run `npm test` after every production-code task, `npm run build:app` after the structural implementation, and install only with `hdc install -r`; never uninstall.

## File Structure

**Create:**

- `entry/src/main/ets/model/agent/AgentClarification.ts` — clarification types, decoding, cloning, and answer serialization.
- `entry/src/main/ets/model/agent/AgentTaskContext.ts` — setup snapshot, send readiness, and task payload construction.
- `entry/src/main/ets/components/agent/AgentDisclosureCard.ets` — shared disclosure header, status, arrow, and slot.
- `entry/src/main/ets/components/agent/AgentSetupCard.ets` — local create/edit setup bubble.
- `entry/src/main/ets/components/agent/AgentClarificationCard.ets` — pending/resolved clarification UI.
- `tools/tests/ai-agent-clarification-contract.test.mjs` — protocol, registry, Runner, and history contracts.
- `tools/tests/ai-agent-conversational-ui-contract.test.mjs` — setup, disclosure, and lifecycle contracts.

**Modify:**

- `entry/src/main/ets/model/agent/AgentPolicy.ts`
- `entry/src/main/ets/model/agent/AgentToolCatalog.ts`
- `entry/src/main/ets/model/agent/AgentConversationStore.ets`
- `entry/src/main/ets/backend/agent/AgentToolRegistry.ets`
- `entry/src/main/ets/backend/agent/AgentRunner.ets`
- `entry/src/main/ets/pages/AI制卡页.ets`
- `entry/src/main/resources/base/element/string.json`
- `entry/src/main/resources/en_US/element/string.json`
- `tools/tests/ai-agent-runner-contract.test.mjs`
- `tools/tests/ai-agent-entry-contract.test.mjs`
- `tools/tests/ai-agent-history-contract.test.mjs`
- `PROJECT_CONTEXT.md`
- `.trae/decisions.md`
- `docs/superpowers/specs/2026-08-31-agent-conversational-setup-and-clarification-design.md`

---

### Task 1: Pure Clarification Protocol and Tool Boundary

**Files:**
- Create: `entry/src/main/ets/model/agent/AgentClarification.ts`
- Create: `tools/tests/ai-agent-clarification-contract.test.mjs`
- Modify: `entry/src/main/ets/model/agent/AgentPolicy.ts`
- Modify: `entry/src/main/ets/model/agent/AgentToolCatalog.ts`
- Modify: `entry/src/main/ets/backend/agent/AgentToolRegistry.ets`

**Interfaces:**
- Produces `AgentClarificationRequest`, `AgentClarificationOption`, `AgentClarificationAnswer`, `AgentClarificationState`, `AgentClarificationView`.
- Produces `decodeAgentClarificationRequest(json)`, `cloneAgentClarificationView(value)`, `buildClarificationAnswerText(request, answer)`, and `buildClarificationAnswerVisibleText(answer)`.
- Extends `AgentToolResult` with `clarification: AgentClarificationRequest | null` for Task 2.

- [ ] **Step 1: Write the failing protocol tests**

Create tests for the catalog, decoder, registry, and answer text:

```javascript
const validJson = JSON.stringify({
  clarificationId: 'scope-1',
  question: '每个知识点单独制卡，还是按章节归纳？',
  options: [
    { id: 'one-per-fact', label: '每个知识点一张', description: '便于逐项复习' },
    { id: 'chapter-summary', label: '按章节归纳', description: '卡片数量更少' },
  ],
  recommendedOptionId: 'one-per-fact',
  allowFreeText: true,
});

test('clarification schema is available in create and edit modes', () => {
  for (const mode of ['create', 'edit']) {
    const tool = agentFunctionTools(100, mode)
      .find((item) => item.name === 'request_clarification');
    assert.ok(tool);
    const schema = JSON.parse(tool.parametersJson);
    assert.equal(schema.properties.options.minItems, 2);
    assert.equal(schema.properties.options.maxItems, 4);
  }
});

test('registry returns clarification without an Anki handler or draft', async () => {
  const result = await new AgentToolRegistry().execute({
    id: 'call-1', name: 'request_clarification', argumentsJson: validJson,
  });
  assert.equal(result.draft, null);
  assert.equal(result.clarification?.id, 'scope-1');
  assert.match(result.outputJson, /awaiting_user/);
});
```

Also assert rejection of fewer than two options, more than four options, duplicate IDs, an unknown recommendation, overlong text, and extra object keys. Assert answer text contains the question ID, selected option ID/label, and supplemental text.

- [ ] **Step 2: Run the focused test and confirm red**

```powershell
node --test --experimental-transform-types --import ./tools/tests/register-ts-hook.mjs tools/tests/ai-agent-clarification-contract.test.mjs
```

Expected: FAIL because `AgentClarification.ts` or `request_clarification` does not exist.

- [ ] **Step 3: Implement the fixed pure model**

Use these public shapes and limits:

```typescript
export type AgentClarificationState =
  'pending' | 'submitting' | 'resolved' | 'submit_failed' | 'cancelled';

export interface AgentClarificationOption {
  id: string;
  label: string;
  description: string;
}

export interface AgentClarificationRequest {
  id: string;
  question: string;
  options: AgentClarificationOption[];
  recommendedOptionId: string;
  allowFreeText: boolean;
}

export interface AgentClarificationAnswer {
  clarificationId: string;
  optionId: string;
  optionLabel: string;
  supplementalText: string;
}

export interface AgentClarificationView {
  request: AgentClarificationRequest;
  selectedOptionId: string;
  supplementalText: string;
  state: AgentClarificationState;
  expanded: boolean;
}
```

`decodeAgentClarificationRequest` must parse one object, reject unknown top-level/option keys, trim text, enforce ID 1–64, question 1–600, label 1–80, description 0–240, 2–4 unique options, a recommendation contained in the option set, and boolean `allowFreeText`. Throw `AgentToolSchemaError` with stable path/code data. Clone every nested option. `buildClarificationAnswerText` returns:

```typescript
interface RawClarificationOption { id?: string; label?: string; description?: string; }
interface RawClarificationRequest {
  clarificationId?: string;
  question?: string;
  options?: RawClarificationOption[];
  recommendedOptionId?: string;
  allowFreeText?: boolean;
}

function boundedText(value: string | undefined, path: string, maximum: number): string {
  if (typeof value !== 'string' || value.trim().length === 0 || value.trim().length > maximum) {
    throw new AgentToolSchemaError('invalid_value', path, `${path} has an invalid length`);
  }
  return value.trim();
}

function optionalText(value: string | undefined, path: string, maximum: number): string {
  if (value === undefined) { return ''; }
  if (typeof value !== 'string' || value.trim().length > maximum) {
    throw new AgentToolSchemaError('invalid_value', path, `${path} has an invalid length`);
  }
  return value.trim();
}

export function decodeAgentClarificationRequest(argumentsJson: string): AgentClarificationRequest {
  let raw: RawClarificationRequest;
  try { raw = JSON.parse(argumentsJson) as RawClarificationRequest; }
  catch (error) { throw new AgentToolSchemaError('invalid_json', '$', 'Clarification arguments must be JSON'); }
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new AgentToolSchemaError('invalid_type', '$', 'Clarification arguments must be one object');
  }
  const receivedKeys: string[] = Object.keys(raw);
  const allowedKeys: string[] = [
    'clarificationId', 'question', 'options', 'recommendedOptionId', 'allowFreeText'
  ];
  for (const key of receivedKeys) {
    if (allowedKeys.indexOf(key) < 0) {
      throw new AgentToolSchemaError('unexpected_property', key,
        `${key} is not a clarification argument`, receivedKeys, allowedKeys);
    }
  }
  if (!Array.isArray(raw.options) || raw.options.length < 2 || raw.options.length > 4) {
    throw new AgentToolSchemaError('invalid_value', 'options', 'Provide between 2 and 4 options');
  }
  const options: AgentClarificationOption[] = [];
  const seen: Set<string> = new Set<string>();
  for (let index: number = 0; index < raw.options.length; index++) {
    const item: RawClarificationOption = raw.options[index];
    const optionKeys: string[] = Object.keys(item);
    for (const key of optionKeys) {
      if (['id', 'label', 'description'].indexOf(key) < 0) {
        throw new AgentToolSchemaError('unexpected_property', `options[${index}].${key}`,
          `${key} is not an option argument`, optionKeys, ['id', 'label', 'description']);
      }
    }
    const id: string = boundedText(item.id, `options[${index}].id`, 64);
    if (seen.has(id)) {
      throw new AgentToolSchemaError('invalid_value', `options[${index}].id`, 'Option IDs must be unique');
    }
    seen.add(id);
    options.push({ id: id, label: boundedText(item.label, `options[${index}].label`, 80),
      description: optionalText(item.description, `options[${index}].description`, 240) });
  }
  const recommendation: string = optionalText(raw.recommendedOptionId, 'recommendedOptionId', 64);
  if (recommendation.length > 0 && !seen.has(recommendation)) {
    throw new AgentToolSchemaError('invalid_value', 'recommendedOptionId', 'Recommendation must name one option');
  }
  if (typeof raw.allowFreeText !== 'boolean') {
    throw new AgentToolSchemaError('invalid_type', 'allowFreeText', 'allowFreeText must be boolean');
  }
  return { id: boundedText(raw.clarificationId, 'clarificationId', 64),
    question: boundedText(raw.question, 'question', 600), options: options,
    recommendedOptionId: recommendation, allowFreeText: raw.allowFreeText };
}

export function buildClarificationAnswerText(request: AgentClarificationRequest,
  answer: AgentClarificationAnswer): string {
  return `澄清问题 ID=${request.id}\n问题：${request.question}\n` +
    `我的选择：${answer.optionLabel} (optionId=${answer.optionId})\n` +
    `补充：${answer.supplementalText.length > 0 ? answer.supplementalText : '无'}`;
}

export function buildClarificationAnswerVisibleText(answer: AgentClarificationAnswer): string {
  return answer.supplementalText.length > 0 ?
    `${answer.optionLabel}\n${answer.supplementalText}` : answer.optionLabel;
}
```

- [ ] **Step 4: Publish and execute the tool**

Add `request_clarification` to both modes in `AgentToolCatalog.ts` with a JSON Schema matching the exact limits above and this two-option example:

```json
{"clarificationId":"scope-1","question":"Choose one card organization.","options":[{"id":"one-per-fact","label":"One per fact","description":"More focused cards"},{"id":"chapter-summary","label":"Chapter summary","description":"Fewer cards"}],"recommendedOptionId":"one-per-fact","allowFreeText":true}
```

Rules must say it is only for blocking ambiguity, must be called alone, and never writes. Classify it as `read` in `AgentPolicy.toolRiskOf`.

At the start of `AgentToolRegistry.execute`:

```typescript
if (call.name === 'request_clarification') {
  const clarification = decodeAgentClarificationRequest(call.argumentsJson);
  return {
    outputJson: JSON.stringify({ status: 'awaiting_user', clarificationId: clarification.id }),
    draft: null,
    clarification: clarification
  };
}
```

Add `clarification: null` to all existing result objects.

- [ ] **Step 5: Verify and commit**

```powershell
node --test --experimental-transform-types --import ./tools/tests/register-ts-hook.mjs tools/tests/ai-agent-clarification-contract.test.mjs tools/tests/ai-agent-tool-catalog-contract.test.mjs tools/tests/ai-agent-tool-safety.test.mjs
git add -- entry/src/main/ets/model/agent/AgentClarification.ts entry/src/main/ets/model/agent/AgentPolicy.ts entry/src/main/ets/model/agent/AgentToolCatalog.ts entry/src/main/ets/backend/agent/AgentToolRegistry.ets tools/tests/ai-agent-clarification-contract.test.mjs
git commit -m "feat: add structured agent clarification protocol"
```

Expected: all focused tests PASS and the commit contains only these five files.

---

### Task 2: Runner Pause Result and No-Draft Exception

**Files:**
- Modify: `entry/src/main/ets/backend/agent/AgentRunner.ets`
- Modify: `tools/tests/ai-agent-runner-contract.test.mjs`
- Modify: `tools/tests/ai-agent-clarification-contract.test.mjs`

**Interfaces:**
- Consumes `AgentToolResult.clarification` from Task 1.
- Produces `AgentRunStatus = 'completed' | 'awaiting_clarification'` and typed `AgentRunResult`.

- [ ] **Step 1: Add failing structural tests**

```javascript
test('runner exposes clarification as a legal pause before draft correction', () => {
  const source = read('entry/src/main/ets/backend/agent/AgentRunner.ets');
  assert.match(source, /AgentRunStatus\s*=\s*'completed'\s*\|\s*'awaiting_clarification'/);
  assert.match(source, /clarification:\s*AgentClarificationRequest\s*\|\s*null/);
  assert.match(source, /result\.clarification\s*!==\s*null/);
  assert.match(source, /status:\s*'awaiting_clarification'/);
  assert.match(source, /clarification_must_be_only_tool/);
  assert.ok(source.indexOf("status: 'awaiting_clarification'") <
    source.indexOf('agent_no_valid_draft'));
});
```

- [ ] **Step 2: Run and confirm red**

```powershell
node --test --experimental-transform-types --import ./tools/tests/register-ts-hook.mjs tools/tests/ai-agent-runner-contract.test.mjs tools/tests/ai-agent-clarification-contract.test.mjs
```

Expected: FAIL because `AgentRunResult` lacks status and clarification.

- [ ] **Step 3: Implement terminal pause and mixed-call protection**

Add:

```typescript
export type AgentRunStatus = 'completed' | 'awaiting_clarification';
export interface AgentRunResult {
  status: AgentRunStatus;
  clarification: AgentClarificationRequest | null;
  drafts: ChangeDraft[];
  providerCalls: number;
  toolCalls: number;
}
```

Before executing a Provider round, if `request_clarification` appears with any other call, execute none of that batch. Emit failed traces and protocol-complete function outputs using:

```typescript
const output = JSON.stringify({
  tool_error: 'clarification_must_be_only_tool',
  message: 'request_clarification must be the only tool call in its provider round.',
  correction: 'Call request_clarification alone, or finish ordinary tool work before asking the user.'
});
```

Continue the bounded loop so the model can correct itself. After a successful sole clarification registry result and completed trace, return before draft correction:

```typescript
if (result.clarification !== null) {
  return {
    status: 'awaiting_clarification', clarification: result.clarification,
    drafts: [], providerCalls: providerCalls, toolCalls: toolCalls
  };
}
```

Normal completion returns `status: 'completed'` and `clarification: null`.

- [ ] **Step 4: Verify and commit**

```powershell
node --test --experimental-transform-types --import ./tools/tests/register-ts-hook.mjs tools/tests/ai-agent-runner-contract.test.mjs tools/tests/ai-agent-clarification-contract.test.mjs tools/tests/ai-agent-tool-diagnostics.test.mjs
npm test
git add -- entry/src/main/ets/backend/agent/AgentRunner.ets tools/tests/ai-agent-runner-contract.test.mjs tools/tests/ai-agent-clarification-contract.test.mjs
git commit -m "feat: pause agent turns for clarification"
```

Expected: focused and complete suites PASS; create-mode text-only completion is still rejected.

---

### Task 3: Task Snapshots and Structured History

**Files:**
- Create: `entry/src/main/ets/model/agent/AgentTaskContext.ts`
- Modify: `entry/src/main/ets/model/agent/AgentConversationStore.ets`
- Modify: `tools/tests/ai-agent-clarification-contract.test.mjs`
- Modify: `tools/tests/ai-agent-history-contract.test.mjs`

**Interfaces:**
- Produces `AgentTaskSetup`, `AgentTaskSnapshot`, `AgentReadinessReason`, `evaluateAgentReadiness`, `buildAgentTaskProviderText(snapshot)`, and `buildAgentTaskVisibleText(snapshot)`.
- Extends history messages with `kind`, `clarification`, and `expanded`; extends conversations with `setup`.

- [ ] **Step 1: Add failing readiness and history tests**

```javascript
test('create readiness requires deck, note type capability, text and provider', () => {
  const base = { mode: 'create', deckId: 0, deckName: '', notetypeId: 0,
    notetypeName: '', fieldNames: [], noteTypeKind: 0, clozeFieldOrds: [], expanded: true };
  assert.equal(evaluateAgentReadiness(base, '', true), 'missing_deck');
  assert.equal(evaluateAgentReadiness({ ...base, deckId: 1 }, '', true), 'missing_notetype');
  assert.equal(evaluateAgentReadiness({ ...base, deckId: 1, notetypeId: 2,
    fieldNames: ['文字'] }, '', true), 'missing_input');
});
```

Require `AgentConversation.setup`, `AgentHistoryMessage.kind`, `clarification`, `expanded`, `safeClarification`, and continued absence of `apiKey`, hidden reasoning, confirmation tokens, and media bytes.

- [ ] **Step 2: Run and confirm red**

```powershell
node --test --experimental-transform-types --import ./tools/tests/register-ts-hook.mjs tools/tests/ai-agent-clarification-contract.test.mjs tools/tests/ai-agent-history-contract.test.mjs
```

Expected: FAIL because the task model and structured history fields do not exist.

- [ ] **Step 3: Implement task context**

Use these exact public fields:

```typescript
export interface AgentTaskSetup {
  mode: AgentMode; deckId: number; deckName: string;
  notetypeId: number; notetypeName: string; fieldNames: string[];
  noteTypeKind: number; clozeFieldOrds: number[]; expanded: boolean;
}

export interface AgentTaskSnapshot {
  mode: AgentMode; deckId: number; deckName: string;
  notetypeId: number; notetypeName: string; fieldNames: string[];
  noteTypeKind: number; clozeFieldOrds: number[]; userText: string;
  localContext: string; omittedMedia: boolean; batchLimit: number;
}

interface AgentProviderTaskConfiguration {
  mode: AgentMode; deckId: number; deckName: string;
  notetypeId: number; notetypeName: string; fieldNames: string[];
  noteTypeKind: number; clozeFieldOrds: number[]; batchLimit: number;
}

export type AgentReadinessReason =
  'ready' | 'missing_deck' | 'missing_notetype' |
  'missing_input' | 'missing_provider' | 'busy';
```

`evaluateAgentReadiness` checks busy, create-mode deck, create-mode note capability, trimmed input, and Provider readiness in that order. `buildAgentTaskProviderText(snapshot)` JSON-serializes stable IDs and capabilities plus user text and local context. `buildAgentTaskVisibleText(snapshot)` uses deck/note-type names and `snapshot.userText` only; it never displays stable IDs.

```typescript
export function evaluateAgentReadiness(setup: AgentTaskSetup, input: string,
  providerReady: boolean, busy: boolean = false): AgentReadinessReason {
  if (busy) { return 'busy'; }
  if (setup.mode === 'create' && setup.deckId <= 0) { return 'missing_deck'; }
  if (setup.mode === 'create' && (setup.notetypeId <= 0 || setup.fieldNames.length === 0)) {
    return 'missing_notetype';
  }
  if (input.trim().length === 0) { return 'missing_input'; }
  if (!providerReady) { return 'missing_provider'; }
  return 'ready';
}

export function buildAgentTaskProviderText(snapshot: AgentTaskSnapshot): string {
  const configuration: AgentProviderTaskConfiguration = {
    mode: snapshot.mode, deckId: snapshot.deckId, deckName: snapshot.deckName,
    notetypeId: snapshot.notetypeId, notetypeName: snapshot.notetypeName,
    fieldNames: snapshot.fieldNames.slice(), noteTypeKind: snapshot.noteTypeKind,
    clozeFieldOrds: snapshot.clozeFieldOrds.slice(), batchLimit: snapshot.batchLimit
  };
  const mediaNotice: string = snapshot.omittedMedia ?
    '\n媒体说明：二进制媒体未发送，不得声称已经看见或听见。' : '';
  return `任务配置：${JSON.stringify(configuration)}\n用户要求：${snapshot.userText}` +
    `\n应用内本地上下文（稳定 ID，仅限本轮）：\n${snapshot.localContext}${mediaNotice}`;
}
```

- [ ] **Step 4: Sanitize and persist structured history**

Extend:

```typescript
export interface AgentHistoryMessage {
  role: string;
  text: string;
  kind: string;
  clarification: AgentClarificationView | null;
  expanded: boolean;
}
```

Add `setup: AgentTaskSetup` to `AgentConversation`. `safeSetup` clones arrays, clamps IDs, and sanitizes names. `safeClarification` sanitizes every question/option/answer string; resolved/cancelled restore collapsed, pending/submit-failed restore expanded. Old messages default to normal/no clarification; old conversations default to empty setup for their stored mode.

```typescript
function safeClarification(value: AgentClarificationView | null): AgentClarificationView | null {
  if (value === null || value.request === undefined) { return null; }
  const safe: AgentClarificationView = cloneAgentClarificationView(value);
  safe.request.id = sanitizeHistoryText(safe.request.id);
  safe.request.question = sanitizeHistoryText(safe.request.question);
  safe.selectedOptionId = sanitizeHistoryText(safe.selectedOptionId);
  safe.supplementalText = sanitizeHistoryText(safe.supplementalText);
  for (const option of safe.request.options) {
    option.id = sanitizeHistoryText(option.id);
    option.label = sanitizeHistoryText(option.label);
    option.description = sanitizeHistoryText(option.description);
  }
  safe.expanded = safe.state === 'pending' || safe.state === 'submit_failed';
  return safe;
}
```

- [ ] **Step 5: Verify and commit**

```powershell
node --test --experimental-transform-types --import ./tools/tests/register-ts-hook.mjs tools/tests/ai-agent-clarification-contract.test.mjs tools/tests/ai-agent-history-contract.test.mjs
npm test
git add -- entry/src/main/ets/model/agent/AgentTaskContext.ts entry/src/main/ets/model/agent/AgentConversationStore.ets tools/tests/ai-agent-clarification-contract.test.mjs tools/tests/ai-agent-history-contract.test.mjs
git commit -m "feat: persist agent task and clarification context"
```

Expected: history tests PASS, old history remains readable, and secrets remain excluded.

---

### Task 4: Shared Conversation Disclosure Component

**Files:**
- Create: `entry/src/main/ets/components/agent/AgentDisclosureCard.ets`
- Create: `tools/tests/ai-agent-conversational-ui-contract.test.mjs`
- Modify: `entry/src/main/ets/pages/AI制卡页.ets`
- Modify: `tools/tests/ai-agent-entry-contract.test.mjs`

**Interfaces:**
- Produces `AgentDisclosureCard { title, status, showStatus, expanded, toggleLocked, onToggle, content }`.
- Consumes existing conversation colors and `应用尺寸` spacing.

- [ ] **Step 1: Write the failing disclosure reuse test**

```javascript
test('one disclosure component owns the conversation arrow and animation', () => {
  const disclosure = read('entry/src/main/ets/components/agent/AgentDisclosureCard.ets');
  const page = read('entry/src/main/ets/pages/AI制卡页.ets');
  assert.match(disclosure, /Text\('▼'\)/);
  assert.match(disclosure, /expanded\s*\?\s*0\s*:\s*-90/);
  assert.match(disclosure, /duration:\s*150/);
  assert.match(disclosure, /Curve\.EaseOut/);
  assert.doesNotMatch(disclosure, /animateTo\(/);
  assert.match(page, /AgentDisclosureCard/);
  assert.doesNotMatch(page, /private 切换工具详情[\s\S]*animateTo\(/);
});
```

- [ ] **Step 2: Run and confirm red**

```powershell
node --test --experimental-transform-types --import ./tools/tests/register-ts-hook.mjs tools/tests/ai-agent-conversational-ui-contract.test.mjs tools/tests/ai-agent-entry-contract.test.mjs
```

Expected: FAIL because `AgentDisclosureCard.ets` does not exist.

- [ ] **Step 3: Implement the shared shell**

```typescript
@Component
export struct AgentDisclosureCard {
  @Prop title: ResourceStr = '';
  @Prop status: ResourceStr = '';
  @Prop showStatus: boolean = false;
  @Prop expanded: boolean = false;
  @Prop toggleLocked: boolean = false;
  onToggle: () => void = (): void => {};
  @BuilderParam content: () => void = this.emptyContent;

  @Builder private emptyContent(): void {}

  build() {
    Column({ space: 应用尺寸.间距_5 }) {
      Row({ space: 应用尺寸.间距_5 }) {
        Text(this.title).fontSize(应用尺寸.字号_正文_小)
          .fontWeight(FontWeight.Medium).layoutWeight(1)
        if (this.showStatus) {
          Text(this.status).fontSize(应用尺寸.字号_正文_小)
            .fontColor($r('app.color.text_secondary'))
        }
        Text('▼').fontSize(11).fontColor($r('app.color.text_tertiary'))
          .rotate({ angle: this.expanded ? 0 : -90 })
          .animation({ duration: 150, curve: Curve.EaseOut })
      }.width('100%').onClick((): void => {
        if (!this.toggleLocked) { this.onToggle(); }
      })
      if (this.expanded) { this.content(); }
    }
    .width('100%').padding(应用尺寸.间距_8)
    .backgroundColor($r('app.color.surface_page'))
    .border({ width: 应用尺寸.卡片边框, color: $r('app.color.border_subtle') })
    .borderRadius(应用尺寸.圆角_卡片)
  }
}
```

- [ ] **Step 4: Refactor tool traces into the shell**

Replace the inline tool header/arrow/container with `AgentDisclosureCard`. Move the existing arguments/output/error body into `工具详情内容`. The toggle callback directly flips `message.工具过程[index].expanded`; remove the surrounding `animateTo`. Preserve this existing update invariant:

```typescript
trace.expanded = message.工具过程[existingIndex].expanded;
message.工具过程[existingIndex] = trace;
```

- [ ] **Step 5: Verify and commit**

```powershell
node --test --experimental-transform-types --import ./tools/tests/register-ts-hook.mjs tools/tests/ai-agent-conversational-ui-contract.test.mjs tools/tests/ai-agent-entry-contract.test.mjs
npm test
git add -- entry/src/main/ets/components/agent/AgentDisclosureCard.ets entry/src/main/ets/pages/AI制卡页.ets tools/tests/ai-agent-conversational-ui-contract.test.mjs tools/tests/ai-agent-entry-contract.test.mjs
git commit -m "refactor: unify agent conversation disclosures"
```

Expected: tool order and diagnostics remain unchanged; only their disclosure shell changes.

---

### Task 5: Local Conversational Setup and Send Readiness

**Files:**
- Create: `entry/src/main/ets/components/agent/AgentSetupCard.ets`
- Modify: `entry/src/main/ets/pages/AI制卡页.ets`
- Modify: `entry/src/main/resources/base/element/string.json`
- Modify: `entry/src/main/resources/en_US/element/string.json`
- Modify: `tools/tests/ai-agent-conversational-ui-contract.test.mjs`
- Modify: `tools/tests/ai-agent-entry-contract.test.mjs`

**Interfaces:**
- Consumes `AgentDisclosureCard`, task setup/readiness types, and task text builders.
- Produces a UI-only setup card and immutable task snapshot sent once per turn.

- [ ] **Step 1: Add failing setup contracts**

```javascript
test('create setup is an assistant-side local card instead of a fixed top form', () => {
  const page = read('entry/src/main/ets/pages/AI制卡页.ets');
  const setup = read('entry/src/main/ets/components/agent/AgentSetupCard.ets');
  assert.match(page, /AgentSetupCard/);
  assert.doesNotMatch(page, /private 选择区\(\)/);
  assert.doesNotMatch(page, /this\.选择区\(\)/);
  assert.match(page, /evaluateAgentReadiness/);
  assert.match(page, /buildAgentTaskProviderText/);
  assert.match(page, /buildAgentTaskVisibleText/);
  assert.match(setup, /AgentDisclosureCard/);
});

test('local setup is excluded while the task snapshot is sent', () => {
  const page = read('entry/src/main/ets/pages/AI制卡页.ets');
  assert.match(page, /buildAgentTaskProviderText\(snapshot\)/);
  assert.match(page, /message\.kind === 'normal'|message\.kind === 'clarification'/);
  assert.doesNotMatch(page, /role:\s*'assistant'.*local_setup/);
});
```

- [ ] **Step 2: Run and confirm red**

```powershell
node --test --experimental-transform-types --import ./tools/tests/register-ts-hook.mjs tools/tests/ai-agent-conversational-ui-contract.test.mjs tools/tests/ai-agent-entry-contract.test.mjs
```

Expected: FAIL because the old fixed `选择区` remains.

- [ ] **Step 3: Implement the local setup component**

Define `AgentSetupChoice { id: number; name: string }`. `AgentSetupCard` receives mode, setup, deck/notetype choices, readiness text, edit context, disabled state, selection callbacks, and toggle callback. It renders `AgentDisclosureCard`; create mode contains two `Select` controls and the instruction, edit mode contains the read-only entry context. It imports no backend, service, Provider, or store.

The component uses this fixed interface and passes selected IDs through callbacks:

```typescript
export interface AgentSetupChoice { id: number; name: string; }
interface AgentSelectOption { value: string; }

@Component
export struct AgentSetupCard {
  @Prop mode: AgentMode = 'create';
  @Prop setup: AgentTaskSetup;
  @Prop deckOptions: AgentSetupChoice[] = [];
  @Prop notetypeOptions: AgentSetupChoice[] = [];
  @Prop readinessText: ResourceStr = '';
  @Prop editContext: string = '';
  @Prop disabled: boolean = false;
onDeckSelected: (id: number) => void = (_id: number): void => {};
onNotetypeSelected: (id: number) => void = (_id: number): void => {};
  onToggle: () => void = (): void => {};

  @Builder
  private setupContent(): void {
    if (this.mode === 'create') {
      Row() {
        Text($r('app.string.ai_card_target_deck')).layoutWeight(1)
        Select(this.deckOptions.map((item: AgentSetupChoice): AgentSelectOption => ({ value: item.name })))
          .selected(this.deckOptions.findIndex((item: AgentSetupChoice): boolean =>
            item.id === this.setup.deckId))
          .enabled(!this.disabled)
          .onSelect((index: number): void => { this.onDeckSelected(this.deckOptions[index].id); })
      }.width('100%')
      Row() {
        Text($r('app.string.add_note_notetype')).layoutWeight(1)
        Select(this.notetypeOptions.map((item: AgentSetupChoice): AgentSelectOption => ({ value: item.name })))
          .selected(this.notetypeOptions.findIndex((item: AgentSetupChoice): boolean =>
            item.id === this.setup.notetypeId))
          .enabled(!this.disabled)
          .onSelect((index: number): void => { this.onNotetypeSelected(this.notetypeOptions[index].id); })
      }.width('100%')
      Text($r('app.string.ai_agent_setup_instruction')).width('100%')
    } else {
      Text(this.editContext).width('100%')
    }
  }

  build() {
    AgentDisclosureCard({
      title: this.mode === 'create' ? $r('app.string.ai_agent_setup_title_create') :
        $r('app.string.ai_agent_setup_title_edit'),
      status: this.readinessText, showStatus: true, expanded: this.setup.expanded,
      toggleLocked: false, onToggle: this.onToggle,
      content: (): void => { this.setupContent(); }
    })
  }
}
```

- [ ] **Step 4: Move setup into the message flow**

In `AI制卡页.ets`:

1. Keep `牌组ID = 0` unless the route explicitly provides a matching deck.
2. Populate note-type choices without silently loading the first/default type; load capability only for an explicit restored/user selection.
3. Remove `选择区`; render `AgentSetupCard` first in `消息流` on the assistant side.
4. Stop appending edit welcome text as a normal AI message; show it in the local setup card.
5. Render the Provider configuration panel under the top bar for both modes when expanded.
6. Add `providerReady`, `taskSetup`, `readinessReason`, and `taskSnapshot` helpers.
7. Enable send with `.enabled(this.处理中 || this.readinessReason() === 'ready')`.
8. On send, freeze one snapshot, show `buildAgentTaskVisibleText`, and send `buildAgentTaskProviderText`.
9. Collapse setup only after a request is accepted.
10. Build Provider history only from normal/clarification messages; the setup card is not a message.
11. If a selected deck disappears or note-type capability loading fails, reset that stable ID, expand setup, show the matching readiness reason, and disable send.
12. Changing setup after a completed turn affects only the next frozen snapshot; existing drafts keep their original target IDs.

The page helpers use one consistent signature:

```typescript
private readinessReason(): AgentReadinessReason {
  return evaluateAgentReadiness(this.taskSetup(), this.输入草稿,
    this.providerReady(), this.处理中 || this.hasPendingClarification());
}

private taskSnapshot(input: string): AgentTaskSnapshot {
  const setup: AgentTaskSetup = this.taskSetup();
  return {
    mode: setup.mode, deckId: setup.deckId, deckName: setup.deckName,
    notetypeId: setup.notetypeId, notetypeName: setup.notetypeName,
    fieldNames: setup.fieldNames.slice(), noteTypeKind: setup.noteTypeKind,
    clozeFieldOrds: setup.clozeFieldOrds.slice(), userText: input,
    localContext: this.本地入口上下文.length > 0 ? this.本地入口上下文 : '无预选卡片，可使用搜索工具。',
    omittedMedia: this.omittedMediaInContext, batchLimit: this.agentSettings.batchLimit
  };
}
```

- [ ] **Step 5: Add exact bilingual strings**

| Key | Chinese | English |
|---|---|---|
| `ai_agent_setup_title_create` | 制卡设置 | Card setup |
| `ai_agent_setup_title_edit` | 修改范围 | Edit scope |
| `ai_agent_setup_instruction` | 选择完成后，请在下方粘贴学习材料或描述制卡要求，我会按照这些设置生成卡片。 | Choose the settings, then paste study material or describe what to create below. |
| `ai_agent_setup_ready` | 已准备好 | Ready |
| `ai_agent_setup_missing_deck` | 请选择目标牌组 | Choose a target deck |
| `ai_agent_setup_missing_notetype` | 请选择笔记类型 | Choose a note type |
| `ai_agent_setup_missing_input` | 请填写学习材料或要求 | Add study material or instructions |
| `ai_agent_setup_missing_provider` | 请先完成 AI 配置 | Configure AI first |
| `ai_agent_setup_summary` | 目标：%s · 笔记类型：%s | Target: %s · Note type: %s |

- [ ] **Step 6: Verify and commit**

```powershell
node --test --experimental-transform-types --import ./tools/tests/register-ts-hook.mjs tools/tests/ai-agent-conversational-ui-contract.test.mjs tools/tests/ai-agent-entry-contract.test.mjs tools/tests/i18n-contract.test.mjs
npm test
git add -- entry/src/main/ets/components/agent/AgentSetupCard.ets entry/src/main/ets/pages/AI制卡页.ets entry/src/main/resources/base/element/string.json entry/src/main/resources/en_US/element/string.json tools/tests/ai-agent-conversational-ui-contract.test.mjs tools/tests/ai-agent-entry-contract.test.mjs
git commit -m "feat: move agent setup into conversation"
```

Expected: no fixed top selectors, no page-open Provider request, and no enabled send before readiness.

---

### Task 6: Clarification Bubble, Continuation, and Restore

**Files:**
- Create: `entry/src/main/ets/components/agent/AgentClarificationCard.ets`
- Modify: `entry/src/main/ets/pages/AI制卡页.ets`
- Modify: `entry/src/main/resources/base/element/string.json`
- Modify: `entry/src/main/resources/en_US/element/string.json`
- Modify: `tools/tests/ai-agent-conversational-ui-contract.test.mjs`
- Modify: `tools/tests/ai-agent-history-contract.test.mjs`

**Interfaces:**
- Consumes Runner status/clarification, clarification helpers, disclosure shell, and structured history.
- Produces one pending clarification, explicit Continue, auto-collapse, retry without duplicate user turns, and same-conversation continuation.

- [ ] **Step 1: Add failing lifecycle contracts**

```javascript
test('clarification is a separate assistant bubble with explicit continuation', () => {
  const page = read('entry/src/main/ets/pages/AI制卡页.ets');
  const card = read('entry/src/main/ets/components/agent/AgentClarificationCard.ets');
  assert.match(page, /result\.status === 'awaiting_clarification'/);
  assert.match(page, /appendClarificationMessage/);
  assert.match(page, /continueClarification/);
  assert.match(page, /buildClarificationAnswerText/);
  assert.match(page, /state = 'submitting'/);
  assert.match(page, /state = 'resolved'/);
  assert.match(page, /state = 'submit_failed'/);
  assert.match(page, /expanded = false/);
  assert.match(card, /AgentDisclosureCard/);
  assert.match(card, /ai_agent_clarification_continue/);
});
```

Also assert resolved clarification is not removed, its question remains `正文`, and structured metadata is saved/restored.

- [ ] **Step 2: Run and confirm red**

```powershell
node --test --experimental-transform-types --import ./tools/tests/register-ts-hook.mjs tools/tests/ai-agent-conversational-ui-contract.test.mjs tools/tests/ai-agent-history-contract.test.mjs
```

Expected: FAIL because no clarification bubble lifecycle exists.

- [ ] **Step 3: Implement the controlled clarification component**

`AgentClarificationCard` receives `AgentClarificationView`, status text, and callbacks for option selection, supplement change, Continue, and resolved toggle. It uses `AgentDisclosureCard`. Set `toggleLocked` for pending/submitting/submit-failed so the required action cannot be hidden. Render 2–4 mutually exclusive options, a recommendation label, optional `TextArea`, retry error, and Continue. Resolved/cancelled content is read-only.

```typescript
@Component
export struct AgentClarificationCard {
  @Prop clarification: AgentClarificationView;
  @Prop statusText: ResourceStr = '';
  onOptionSelected: (id: string) => void = (_id: string): void => {};
  onSupplementChanged: (value: string) => void = (_value: string): void => {};
  onContinue: () => void = (): void => {};
  onToggle: () => void = (): void => {};

  private isEditable(): boolean {
    return this.clarification.state === 'pending' ||
      this.clarification.state === 'submit_failed';
  }

  @Builder
  private clarificationContent(): void {
    Text(this.clarification.request.question).width('100%')
    ForEach(this.clarification.request.options, (option: AgentClarificationOption) => {
      Row() {
        Button(option.label)
          .enabled(this.isEditable())
          .onClick((): void => { this.onOptionSelected(option.id); })
        if (option.id === this.clarification.request.recommendedOptionId) {
          Text($r('app.string.ai_agent_clarification_recommended'))
        }
      }.width('100%')
      if (option.description.length > 0) { Text(option.description).width('100%') }
    }, (option: AgentClarificationOption): string => option.id)
    if (this.clarification.request.allowFreeText) {
      TextArea({ text: this.clarification.supplementalText,
        placeholder: $r('app.string.ai_agent_clarification_supplement_hint') })
        .enabled(this.isEditable())
        .onChange((value: string): void => { this.onSupplementChanged(value); })
    }
    if (this.isEditable()) {
      Button($r('app.string.ai_agent_clarification_continue'))
        .enabled(this.clarification.selectedOptionId.length > 0)
        .onClick((): void => { this.onContinue(); })
    }
  }

  build() {
    AgentDisclosureCard({
      title: this.clarification.state === 'resolved' ?
        $r('app.string.ai_agent_clarification_resolved') :
        $r('app.string.ai_agent_clarification_title'),
      status: this.statusText, showStatus: true,
      expanded: this.clarification.expanded,
      toggleLocked: this.clarification.state === 'pending' ||
        this.clarification.state === 'submitting' ||
        this.clarification.state === 'submit_failed',
      onToggle: this.onToggle,
      content: (): void => { this.clarificationContent(); }
    })
  }
}
```

- [ ] **Step 4: Add message state and Runner result handling**

Extend every `聊天消息` object with:

```typescript
kind: string;
clarification: AgentClarificationView | null;
taskStatus: string;
answerMessageId: number;
```

Update constructors, clones, history save, and restore. On `awaiting_clarification`, mark the processing bubble `taskStatus`, append one separate clarification message with `正文 = request.question`, `state = 'pending'`, `expanded = true`, no selection, and no supplement. Reject a second pending clarification in the same conversation.

- [ ] **Step 5: Extract a common turn runner and implement Continue**

Extract:

```typescript
private async runAgentTurn(providerText: string, visibleUserText: string,
  existingUserMessageId: number = 0): Promise<AgentRunResult | null>
```

It owns the user/AI bubbles, observer, Runner call, localized errors, processing state, and history save. Initial send supplies a frozen task snapshot. `continueClarification` validates the stored option, sets submitting, builds `AgentClarificationAnswer`, and calls `buildClarificationAnswerText`.

On success or a new clarification, mark the old one resolved and collapsed. On Provider failure, restore submit-failed and expanded, retain the same answer message, and exclude its failed AI error bubble from retry Provider history. Retry reuses `answerMessageId`; it does not append a duplicate user answer. Rebuild `AgentScope` before every continuation.

Disable the bottom composer while clarification is pending/submitting/submit-failed; answers occur inside the clarification card.

When starting a new conversation or cancelling the parent task, mark the unresolved clarification `cancelled`, collapse it, and never continue it. When restoring a pending clarification, revalidate its setup IDs and entry scope before enabling Continue; invalid context becomes cancelled with a localized explanation. Preserve any Provider text received before the clarification and label the processing bubble as waiting instead of completed.

The coordination methods follow this state transition skeleton:

```typescript
private appendClarificationMessage(request: AgentClarificationRequest): void {
  if (this.hasPendingClarification()) { throw new Error('clarification_already_pending'); }
  const message: 聊天消息 = this.空消息('ai', request.question, false);
  message.kind = 'clarification';
  message.clarification = {
    request: request, selectedOptionId: '', supplementalText: '',
    state: 'pending', expanded: true
  };
  this.追加消息(message);
}

private async continueClarification(messageIndex: number): Promise<void> {
  const view: AgentClarificationView | null = this.消息列表[messageIndex].clarification;
  if (view === null || view.selectedOptionId.length === 0) { return; }
  const option: AgentClarificationOption | undefined = view.request.options.find(
    (item: AgentClarificationOption): boolean => item.id === view.selectedOptionId);
  if (option === undefined) { return; }
  this.updateClarificationState(messageIndex, 'submitting', true);
  const answer: AgentClarificationAnswer = {
    clarificationId: view.request.id, optionId: option.id, optionLabel: option.label,
    supplementalText: view.supplementalText.trim()
  };
  this.重建本轮AgentScope();
  const result: AgentRunResult | null = await this.runAgentTurn(
    buildClarificationAnswerText(view.request, answer),
    buildClarificationAnswerVisibleText(answer),
    this.消息列表[messageIndex].answerMessageId);
  if (result === null) {
    this.updateClarificationState(messageIndex, 'submit_failed', true);
    return;
  }
  this.updateClarificationState(messageIndex, 'resolved', false);
  if (result.status === 'awaiting_clarification' && result.clarification !== null) {
    this.appendClarificationMessage(result.clarification);
  }
}
```

Task 1 also exports `buildClarificationAnswerVisibleText(answer)`; it returns the selected label and supplement without internal IDs. `runAgentTurn` stores the created user message ID back into `answerMessageId` before the request and reuses it on retry.

- [ ] **Step 6: Add exact bilingual strings**

| Key | Chinese | English |
|---|---|---|
| `ai_agent_clarification_title` | 需要你确认 | Your input is needed |
| `ai_agent_clarification_waiting` | 等待回答 | Waiting for your answer |
| `ai_agent_clarification_recommended` | 推荐 | Recommended |
| `ai_agent_clarification_supplement_hint` | 可以补充说明（选填） | Add details (optional) |
| `ai_agent_clarification_continue` | 继续 | Continue |
| `ai_agent_clarification_submitting` | 正在继续… | Continuing… |
| `ai_agent_clarification_resolved` | 已确认 | Confirmed |
| `ai_agent_clarification_resolved_summary` | 已确认：%s | Confirmed: %s |
| `ai_agent_clarification_submit_failed` | 发送失败，请重试 | Couldn’t send. Try again. |
| `ai_agent_clarification_cancelled` | 澄清已取消 | Clarification cancelled |
| `ai_agent_clarification_choose_one` | 请选择一个选项 | Choose one option |

- [ ] **Step 7: Verify and commit**

```powershell
node --test --experimental-transform-types --import ./tools/tests/register-ts-hook.mjs tools/tests/ai-agent-clarification-contract.test.mjs tools/tests/ai-agent-conversational-ui-contract.test.mjs tools/tests/ai-agent-history-contract.test.mjs tools/tests/i18n-contract.test.mjs
npm test
git add -- entry/src/main/ets/components/agent/AgentClarificationCard.ets entry/src/main/ets/pages/AI制卡页.ets entry/src/main/resources/base/element/string.json entry/src/main/resources/en_US/element/string.json tools/tests/ai-agent-conversational-ui-contract.test.mjs tools/tests/ai-agent-history-contract.test.mjs
git commit -m "feat: add resumable agent clarification bubbles"
```

Expected: pending stays expanded, resolved auto-collapses, retry does not duplicate answers, and history restores the same state.

---

### Task 7: Documentation and Full Verification

**Files:**
- Modify: `PROJECT_CONTEXT.md`
- Modify: `.trae/decisions.md`
- Modify: `docs/superpowers/specs/2026-08-31-agent-conversational-setup-and-clarification-design.md`

**Interfaces:**
- Consumes all production behavior and evidence from Tasks 1–6.
- Produces an auditable decision, project routing, and verified build/install record.

- [ ] **Step 1: Update project context and decision record**

Add this module-boundary row:

```markdown
| Agent 对话配置与澄清 | `model/agent/{AgentTaskContext,AgentClarification}.ts` + `components/agent/*.ets` + `pages/AI制卡页.ets` | 本地配置气泡不进入 Provider；`request_clarification` 只产生等待态，不写 Anki；解决后自动折叠但问题与答案继续进入逻辑会话；工具和澄清共用对话折叠外壳 |
```

Append a dated `.trae/decisions.md` entry with intent, chosen design, rejected alternatives, stable-ID/confirmation invariants, files, tests, build result, simulator targets, and device limits. Mark the design spec `已实施并验证` only after all verification succeeds.

- [ ] **Step 2: Run focused and complete verification**

```powershell
node --test --experimental-transform-types --import ./tools/tests/register-ts-hook.mjs tools/tests/ai-agent-clarification-contract.test.mjs tools/tests/ai-agent-conversational-ui-contract.test.mjs tools/tests/ai-agent-runner-contract.test.mjs tools/tests/ai-agent-entry-contract.test.mjs tools/tests/ai-agent-history-contract.test.mjs tools/tests/ai-agent-tool-catalog-contract.test.mjs tools/tests/ai-agent-tool-safety.test.mjs
npm test
npm run build:app
```

Expected: every focused and complete test passes; Rust dual-architecture build, ArkTS type check, HAP packaging, and signing finish with `BUILD SUCCESSFUL`.

- [ ] **Step 3: Install safely on available simulators**

```powershell
hdc list targets
hdc -t 127.0.0.1:5555 install -r entry/build/default/outputs/default/entry-default-signed.hap
hdc -t 127.0.0.1:5557 install -r entry/build/default/outputs/default/entry-default-signed.hap
```

Run only commands for targets actually listed. Verify without saving destructive drafts:

1. Local setup card replaces fixed selectors.
2. Send is disabled until deck, note type, and material are present.
3. Setup collapses after send.
4. Clarification is separate, stays open until Continue, then collapses.
5. Tool calls use the same disclosure and default collapsed.
6. History restore keeps resolved clarification collapsed and readable.
7. Create drafts still use selected stable IDs and existing confirmation/save flow.
8. Edit entry still loads local context without an opening Provider request.

- [ ] **Step 4: Record evidence and commit documentation**

Record exact totals and observable limits. If credentials or a physical device are unavailable, state that precisely and do not mark those checks passed.

```powershell
git add -- PROJECT_CONTEXT.md .trae/decisions.md docs/superpowers/specs/2026-08-31-agent-conversational-setup-and-clarification-design.md
git commit -m "docs: record conversational agent verification"
git status --short
git log --oneline -8
```

Expected: only pre-existing unrelated files remain unstaged; feature commits contain no unrelated user changes.
