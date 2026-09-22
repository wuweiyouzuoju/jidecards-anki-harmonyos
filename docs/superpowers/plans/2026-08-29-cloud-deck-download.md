# Cloud Deck Download Implementation Plan

> 归档状态：这是一次性历史设计/执行记录，不是当前路线图、待办列表或操作手册。未勾选项不表示仍未实现；当前事实请查阅 [文档导航](../../README.md)、[开发状态](../../DEVELOPMENT_PLAN.md)、[当前架构](../../architecture.md) 和实际源码/测试。


**Goal:** Add a provider-neutral in-app cloud deck catalog that downloads selected `.apkg` files and installs them automatically from first launch or the home import menu.

**Architecture:** Keep JSON parsing and validation in a Node-testable pure TypeScript model, isolate Harmony networking and download-agent code in one backend service, keep both modal components presentation-only, and let Home coordinate sequential download/import through the existing import backend. A single empty-by-default configuration constant makes hosting replaceable without embedding provider credentials.

**Tech Stack:** ArkTS/ArkUI, HarmonyOS NetworkKit and BasicServicesKit request agent, preferences, Node test runner, existing Anki Rust import backend.

---

### Task 1: Lock down the catalog model contract

**Files:**
- Create: `tools/tests/cloud-deck-model.test.mjs`
- Create: `entry/src/main/ets/model/云端牌组模型.ts`

1. Write failing tests for schema version 1, valid public/locked entries, invalid JSON, duplicate IDs, non-HTTPS URLs, non-APKG URLs, invalid sizes and byte-size formatting.
2. Run `node --experimental-transform-types --import ./tools/tests/register-ts-hook.mjs --test tools/tests/cloud-deck-model.test.mjs` and confirm failure because the model does not exist.
3. Implement typed model interfaces, parser/validator and size formatter without `@kit.*` imports.
4. Re-run the focused test and confirm it passes.

### Task 2: Add configuration and first-launch persistence

**Files:**
- Create: `entry/src/main/ets/model/云端牌组配置.ts`
- Create: `entry/src/main/ets/model/云端牌组引导存储.ets`
- Create: `tools/tests/cloud-deck-flow-contract.test.mjs`

1. Add failing contract assertions for the single catalog URL configuration point, the `cloud_deck_onboarding_completed` preference key, and read/write functions.
2. Run the focused contract test and confirm failure.
3. Implement empty-by-default catalog configuration and resilient preferences storage.
4. Re-run focused tests.

### Task 3: Implement the Harmony catalog/download boundary

**Files:**
- Create: `entry/src/main/ets/backend/云端牌组服务.ets`
- Modify: `tools/tests/cloud-deck-flow-contract.test.mjs`

1. Add failing contract assertions requiring NetworkKit catalog fetch, HTTPS guards, system download agent, sandbox `cloud-decks` destination, progress callback, size/non-empty validation and failure cleanup.
2. Run the focused contract test and confirm failure.
3. Implement catalog fetching and one-file download with typed callbacks and deterministic cleanup.
4. Re-run focused tests.

### Task 4: Build the two frosted-glass modal components

**Files:**
- Create: `entry/src/main/ets/components/导入来源弹窗.ets`
- Create: `entry/src/main/ets/components/云端牌组弹窗.ets`
- Modify: `entry/src/main/resources/base/element/string.json`
- Modify: `entry/src/main/resources/en_US/element/string.json`
- Modify: `tools/tests/cloud-deck-flow-contract.test.mjs`

1. Add failing assertions for the two choices, cloud list/selection/locked states, loading/error/empty states, progress/result copy, frosted overlay and matching i18n keys.
2. Run focused tests and confirm failure.
3. Implement both presentation-only components with shared dimension/color/transition tokens.
4. Add aligned Chinese and English resources, ensuring English contains no Chinese.
5. Re-run focused tests and existing i18n contract tests.

### Task 5: Wire Home first-launch and manual import flows

**Files:**
- Modify: `entry/src/main/ets/pages/首页.ets`
- Modify: `tools/tests/cloud-deck-flow-contract.test.mjs`

1. Add failing assertions for action-menu routing, first-launch preference check, cloud-before-welcome sequencing, catalog retry/skip, serial download/import, use of `执行牌组导入`, refresh/expand behavior and modal rendering/back guards.
2. Run focused tests and confirm failure.
3. Add Home state and coordination methods.
4. Change the import action to open the source modal; route local to the existing picker and cloud to the new catalog.
5. Render both modals at the correct z-order and sequence the existing welcome modal after onboarding.
6. Re-run focused and import-flow tests.

### Task 6: Document provider setup and architecture

**Files:**
- Modify: `PROJECT_CONTEXT.md`
- Modify: `docs/architecture.md`
- Create: `docs/cloud-deck-hosting.md`

1. Document the module boundaries and extension points.
2. Add a concise hosting guide with JSON example, HTTPS direct-link requirements, where to set the catalog URL, and the future redemption API boundary.
3. Verify documentation contains no real account secrets or management credentials.

### Task 7: Verify, review, and prepare handoff

**Files:**
- Modify only files required by review findings.

1. Run `npm test`.
2. Run `npm run doctor`.
3. Run `npm run build:app`.
4. Inspect `git diff --check` and `git status --short`.
5. Use `superpowers:requesting-code-review` with the feature diff; fix all critical and important findings and re-run relevant verification.
6. Use `superpowers:verification-before-completion` and capture fresh evidence.
7. Use `superpowers:finishing-a-development-branch` to present integration options without touching the user's dirty main checkout.
