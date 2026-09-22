# AI Agent Note-Type Foundation Implementation Plan

> 归档状态：这是一次性历史设计/执行记录，不是当前路线图、待办列表或操作手册。未勾选项不表示仍未实现；当前事实请查阅 [文档导航](../../README.md)、[开发状态](../../DEVELOPMENT_PLAN.md)、[当前架构](../../architecture.md) 和实际源码/测试。


**Goal:** Make AI card creation and future Agent tools understand arbitrary imported normal/cloze note types from Anki backend structure instead of localized names.

**Architecture:** Extend the existing pure protobuf decoder with `Notetype.config.kind` and a packed/unpacked uint32-list decoder, expose `GetClozeFieldOrds` through the existing note-type service, and make the AI page consume a single `NotetypeCapabilities` object. No model/provider work is required in this slice.

**Tech Stack:** ArkTS/TypeScript, Anki 26.05 protobuf, BackendSession, Node `node:test` contract tests.

## Global Constraints

- Protect the user's untracked `AI制卡页.ets`, `AI制卡服务.ets`, and `AI制卡存储.ets`; patch only the necessary blocks.
- Do not alter `third_party/anki/proto` or generated Anki backend code.
- Keep protobuf/model code free of `@kit.*` so Node tests can import it.
- Use backend `config.kind` and cloze field ords as the source of truth; no note-type name fallback.
- Image Occlusion remains unsupported in this slice; do not silently treat it as normal/cloze.
- Run the focused test after every implementation step and full `npm test` at the end.

---

### Task 1: Decode note-type kind and cloze field ords

**Files:**
- Modify: `entry/src/main/ets/proto/messages/NotetypeMessages.ts`
- Create: `tools/tests/ai-agent-notetype-foundation.test.mjs`

**Interfaces:**
- Extend `NotetypeView` with `kind: number`.
- Export `NOTE_TYPE_KIND_NORMAL = 0` and `NOTE_TYPE_KIND_CLOZE = 1`.
- Export `decodeClozeFieldOrds(bytes: Uint8Array): number[]`.

- [ ] **Step 1: Write the failing protobuf tests**

Construct protobuf bytes with `协议写入器` for:

1. `Notetype.config` field 7 containing kind 1.
2. A custom name such as `机器学习·挖空` proving name is irrelevant.
3. `GetClozeFieldOrdsResponse.ords` encoded once packed and once unpacked.
4. A normal note type where absent kind defaults to 0.

Assert decoded kind and sorted ord arrays exactly.

- [ ] **Step 2: Run the focused test and verify RED**

```powershell
node --experimental-transform-types --import ./tools/tests/register-ts-hook.mjs --test tools/tests/ai-agent-notetype-foundation.test.mjs
```

Expected: import/export or assertion failure because kind and ord decoder do not exist.

- [ ] **Step 3: Implement the decoder**

Add a private `decodeNotetypeConfig()` that reads enum field 1 and skips all other config fields. In `decodeNotetype()`, decode field 7 into `result.kind`. Add `decodeClozeFieldOrds()` that accepts wire-type 0 and packed wire-type 2 for repeated uint32 and returns ascending unique ords.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run the same command. Expected: all new tests pass.

---

### Task 2: Expose the backend capability method

**Files:**
- Modify: `entry/src/main/ets/backend/服务索引.ts`
- Modify: `entry/src/main/ets/backend/笔记类型服务.ts`
- Modify: `tools/tests/backend-session-contract.test.mjs`
- Modify: `tools/tests/ai-agent-notetype-foundation.test.mjs`

**Interfaces:**
- Add `笔记类型方法.获取填空字段序号 = 18`.
- Add `笔记类型服务.获取填空字段序号(ID: number): Promise<number[]>`.
- Add `NotetypeCapabilities` with `notetypeId`, `name`, `kind`, `fieldNames`, `clozeFieldOrds`.
- Add `笔记类型服务.获取笔记类型能力(ID: number): Promise<NotetypeCapabilities>`.

- [ ] **Step 1: Extend failing method-index and source-contract tests**

Assert method 18 is present, the service calls it with `encodeNotetypeId`, and the capability method returns empty `clozeFieldOrds` without making method 18 for a normal type while calling method 18 for a cloze type.

- [ ] **Step 2: Run focused tests and verify RED**

```powershell
node --experimental-transform-types --import ./tools/tests/register-ts-hook.mjs --test tools/tests/backend-session-contract.test.mjs tools/tests/ai-agent-notetype-foundation.test.mjs
```

- [ ] **Step 3: Implement service methods**

Use `获取笔记类型()` first. For kind CLOZE call method 18 and decode ords; for NORMAL return an empty ord list. Throw the existing backend error unchanged. Do not cache mutable collection state in the service.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run the same command and confirm all pass.

---

### Task 3: Replace AI page name guessing with capabilities

**Files:**
- Modify: `entry/src/main/ets/pages/AI制卡页.ets`
- Modify: `entry/src/main/ets/backend/AI制卡服务.ets`
- Modify: `tools/tests/ai-agent-notetype-foundation.test.mjs`

**Interfaces:**
- AI request receives `noteTypeKind: number` and `clozeFieldOrds: number[]` instead of `是否填空`.
- AI page stores the loaded `NotetypeCapabilities` and computes supported fields from ords.

- [ ] **Step 1: Write the failing page/service contracts**

Assert:

- `AI制卡页.ets` no longer defines or references `填空笔记类型名集合` or `是否填空笔记类型()`.
- Loading a type calls `获取笔记类型能力`.
- `AI制卡服务.ets` receives cloze ords and tells the model to place `{{cN::...}}` only in those field positions.
- A cloze type with no cloze field ords produces a classified unsupported/invalid request before network I/O.

- [ ] **Step 2: Run the focused test and verify RED**

Use the Task 1 focused command.

- [ ] **Step 3: Patch the existing page without rewriting it**

Replace only the name sets, state, load method, and request construction. Preserve current editable/selected draft rendering and save behavior. Keep Image Occlusion filtering unchanged until its structural detection is implemented in a later task.

- [ ] **Step 4: Make the prompt structurally correct**

For kind CLOZE, include zero-based field ords and require at least one cloze marker in one allowed field for every generated note. For kind NORMAL, prohibit accidental cloze markup. Keep response parsing behavior unchanged in this slice.

- [ ] **Step 5: Run focused and full tests**

```powershell
node --experimental-transform-types --import ./tools/tests/register-ts-hook.mjs --test tools/tests/ai-agent-notetype-foundation.test.mjs tools/tests/backend-session-contract.test.mjs
npm test
```

Expected: focused tests pass; full suite remains at least the baseline 557 tests with zero failures plus the new tests.

---

### Task 4: Build and device regression

**Files:**
- Modify after evidence: `.trae/decisions.md`
- Modify after evidence: `PROJECT_CONTEXT.md`

- [ ] **Step 1: Run ArkTS build**

```powershell
npm run build:app
```

Expected: BUILD SUCCESSFUL with no new ArkTS errors.

- [ ] **Step 2: Install safely and validate**

Use `hdc list targets`, then `hdc -t <exact-target> install -r <signed-hap>`; never uninstall. Validate:

1. Built-in normal Q/A type still creates and saves cards.
2. Built-in cloze type creates five cloze notes.
3. Imported/custom-named cloze type creates valid cards.
4. Custom normal type with more than two fields maps every field correctly.
5. Existing editable selection and partial-save UI still works.

- [ ] **Step 3: Record evidence**

Append actual test/build/device results and update `PROJECT_CONTEXT.md` to route note-type capability changes through `Notetype.config.kind` + method 18.
