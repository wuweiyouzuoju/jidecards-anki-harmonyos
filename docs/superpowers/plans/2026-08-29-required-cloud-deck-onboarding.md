# Required Cloud Deck Onboarding Implementation Plan

> 归档状态：这是一次性历史设计/执行记录，不是当前路线图、待办列表或操作手册。未勾选项不表示仍未实现；当前事实请查阅 [文档导航](../../README.md)、[开发状态](../../DEVELOPMENT_PLAN.md)、[当前架构](../../architecture.md) 和实际源码/测试。


**Goal:** Make the hosted deck picker a one-time mandatory onboarding that imports at least one selected deck before the user can enter the app, while publishing six decks with accurate card counts.

**Architecture:** Extend the existing pure catalog model with optional card-count metadata, keep large downloads in the system request agent, and make the home page the sole owner of the mandatory onboarding state machine. Completion remains a local preference and is written only after a successful import when the user enters the app; interrupted downloads are cleaned from the sandbox on the next onboarding load.

**Tech Stack:** HarmonyOS ArkTS/ArkUI, NetworkKit, BasicServicesKit request agent, ArkData Preferences, Node `node:test`, Anki Rust backend, 123 Cloud Disk HTTPS hosting.

## Global Constraints

- The exact Chinese onboarding copy is: `首次进入可自由选择所需牌组，至少选择 1 个，下载后将自动导入。本次选择机会仅有一次，请按需选择。更多最新牌组请加入官方 QQ 群：726837065。`
- A user cannot bypass onboarding through a skip button, backdrop tap, or system back action.
- At least one deck must import successfully before “进入软件” is enabled.
- A failed or interrupted download never writes the completion preference and remains retryable; normal failures clean immediately and the next onboarding removes process-crash leftovers.
- The fixed onboarding-generation preference survives future in-place app upgrades; it is not reset by each `versionCode` change.
- The manual “新建牌组 → 导入牌组” action opens the local APKG picker directly; it has no cloud option.
- The app remains serverless and stores no 123 Cloud Disk management credentials.
- User-visible strings must exist in both `base` and `en_US` resources.
- Large APKG files must continue to stream to disk through `request.agent`.

---

### Task 1: Catalog Card Counts and Sixth Hosted Deck

**Files:**
- Modify: `entry/src/main/ets/model/云端牌组模型.ts`
- Modify: `hosting/cloud-decks.json`
- Modify: `tools/tests/cloud-deck-model.test.mjs`
- Modify: `tools/tests/cloud-deck-catalog.test.mjs`

**Interfaces:**
- Produces: `云端牌组目录项.cardCount?: number`
- Consumes: existing `解析云端牌组目录(jsonText: string): 云端牌组目录`

- [ ] **Step 1: Write failing model and catalog tests**

Add assertions that `cardCount: 14311` survives parsing, a supplied zero/negative/fractional count invalidates the entry, and a missing count remains compatible. Change the catalog expectation to six rows with these exact tuples:

```js
[
  ['cet-46-vocabulary', 'CET四六级词汇', 362721820, 14311],
  ['middle-school-english-vocabulary', '中考英语词汇', 89582440, 3305],
  ['ai-machine-learning', 'AI机器学习', 13955271, 1450],
  ['ai-computer-terms', 'AI计算机专业工具名词术语', 473723, 1],
  ['china-law-professional', '中国法律专业版', 1351898, 2500],
  ['high-school-english-vocabulary', '高考英语词汇', 184166749, 8453],
]
```

- [ ] **Step 2: Run the focused tests and verify RED**

Run:

```powershell
node --experimental-transform-types --import ./tools/tests/register-ts-hook.mjs --test tools/tests/cloud-deck-model.test.mjs tools/tests/cloud-deck-catalog.test.mjs
```

Expected: FAIL because `cardCount` is not parsed and only five hosted decks exist.

- [ ] **Step 3: Implement catalog validation and data**

Add `cardCount?: number` to both validated and raw item types, validate it with:

```ts
function 是有效卡片数量(cardCount: number | undefined): boolean {
  return cardCount === undefined || (Number.isInteger(cardCount) && cardCount > 0);
}
```

Copy a valid supplied value into the parsed item. Add all six `cardCount` values to `hosting/cloud-decks.json` and append the high-school deck with the user-provided HTTPS URL.

- [ ] **Step 4: Run the focused tests and verify GREEN**

Run the Step 2 command. Expected: all focused tests PASS.

- [ ] **Step 5: Commit the catalog task**

```powershell
git add -- entry/src/main/ets/model/云端牌组模型.ts hosting/cloud-decks.json tools/tests/cloud-deck-model.test.mjs tools/tests/cloud-deck-catalog.test.mjs
git commit -m "data: publish six cloud decks with card counts"
```

### Task 2: Mandatory Onboarding Copy and Presentation

**Files:**
- Modify: `entry/src/main/ets/components/云端牌组弹窗.ets`
- Modify: `entry/src/main/resources/base/element/string.json`
- Modify: `entry/src/main/resources/en_US/element/string.json`
- Modify: `tools/tests/cloud-deck-flow-contract.test.mjs`

**Interfaces:**
- Consumes: `云端牌组目录项.cardCount?: number`
- Produces: `onEnter: () => void`, with enter availability derived from `successIds.length > 0`

- [ ] **Step 1: Write failing presentation contract tests**

Require the exact Chinese copy, translated English copy, card count resource formatting, `cloud_deck_enter`, and `onEnter`. Assert that the component contains no `cloud_deck_skip`, no `cloud_deck_manual_message`, and no backdrop `onClose` call.

- [ ] **Step 2: Run the flow contract test and verify RED**

```powershell
node --test tools/tests/cloud-deck-flow-contract.test.mjs
```

Expected: FAIL on missing mandatory copy, card count, and enter callback.

- [ ] **Step 3: Implement the mandatory modal**

Use these resource values:

```json
{ "name": "cloud_deck_onboarding_message", "value": "首次进入可自由选择所需牌组，至少选择 1 个，下载后将自动导入。本次选择机会仅有一次，请按需选择。更多最新牌组请加入官方 QQ 群：726837065。" },
{ "name": "cloud_deck_enter", "value": "进入软件" },
{ "name": "cloud_deck_meta_cards", "value": "%1$d 张卡片 · 版本 %2$s · %3$s" },
{ "name": "cloud_deck_meta_cards_unknown_size", "value": "%1$d 张卡片 · 版本 %2$s" }
```

Provide faithful English translations. Remove the onboarding/manual split, skip/close button, and backdrop close callback. Keep the download button disabled at zero selection. Render “进入软件” only after `successIds.length > 0`; keep the retry/download button available for failed selections.

- [ ] **Step 4: Run the flow and i18n tests and verify GREEN**

```powershell
node --test tools/tests/cloud-deck-flow-contract.test.mjs tools/tests/i18n-contract.test.mjs
```

Expected: both test files PASS.

- [ ] **Step 5: Commit the presentation task**

```powershell
git add -- entry/src/main/ets/components/云端牌组弹窗.ets entry/src/main/resources/base/element/string.json entry/src/main/resources/en_US/element/string.json tools/tests/cloud-deck-flow-contract.test.mjs
git commit -m "feat: make cloud deck onboarding mandatory"
```

### Task 3: Completion Preference and Interrupted Download Cleanup

**Files:**
- Modify: `entry/src/main/ets/model/云端牌组引导存储.ets`
- Modify: `entry/src/main/ets/backend/云端牌组服务.ets`
- Modify: `tools/tests/cloud-deck-flow-contract.test.mjs`

**Interfaces:**
- Produces: `标记已完成云端牌组引导(): Promise<boolean>`
- Produces: `云端牌组服务.清理残留下载(filesDir: string): void`

- [ ] **Step 1: Write failing persistence and cleanup tests**

Assert the new preference key is `cloud_deck_required_onboarding_completed_v1`, the marker returns `true` only after `put()` and `flush()` succeed and `false` on failure, and the service cleanup scans only `${filesDir}/cloud-decks` for stale `.part` and `.apkg` files. Require downloads to save as `.part`, validate that file, atomically rename it to `.apkg`, and return only the final path.

- [ ] **Step 2: Run the focused flow test and verify RED**

```powershell
node --test tools/tests/cloud-deck-flow-contract.test.mjs
```

Expected: FAIL because the old key and void marker remain and no startup cleanup exists.

- [ ] **Step 3: Implement persistence and safe stale-file cleanup**

Change the marker to:

```ts
export async function 标记已完成云端牌组引导(): Promise<boolean> {
  const context: common.UIAbilityContext | null = 取能力上下文();
  if (context === null) return false;
  try {
    const store: preferences.Preferences = await preferences.getPreferences(context, 存储名);
    await store.put(引导完成键, true);
    await store.flush();
    return true;
  } catch (error) {
    return false;
  }
}
```

Add an idempotent cleanup method that lists the private `cloud-decks` directory and unlinks only regular filenames ending in `.part` or `.apkg`. Missing directories and unlink failures are ignored; paths outside the sandbox directory are never accepted or constructed. Download to `${safeId}.part`; after size and ZIP-signature validation, remove any stale final file, call `fs.renameSync(partPath, finalPath)`, and resolve only `finalPath`. Every normal failure path deletes the `.part` file.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run the Step 2 command. Expected: PASS.

- [ ] **Step 5: Commit the lifecycle task**

```powershell
git add -- entry/src/main/ets/model/云端牌组引导存储.ets entry/src/main/ets/backend/云端牌组服务.ets tools/tests/cloud-deck-flow-contract.test.mjs
git commit -m "fix: preserve mandatory onboarding across interrupted downloads"
```

### Task 4: Home State Machine and Local-Only Manual Import

**Files:**
- Modify: `entry/src/main/ets/pages/首页.ets`
- Delete: `entry/src/main/ets/components/导入来源弹窗.ets`
- Modify: `entry/src/main/resources/base/element/string.json`
- Modify: `entry/src/main/resources/en_US/element/string.json`
- Modify: `tools/tests/cloud-deck-flow-contract.test.mjs`
- Modify: `PROJECT_CONTEXT.md`

**Interfaces:**
- Consumes: `标记已完成云端牌组引导(): Promise<boolean>`
- Consumes: `云端牌组服务.清理残留下载(filesDir: string): void`
- Produces: mandatory flow `显示首次弹窗序列 → 下载选中云端牌组 → 完成云端牌组首次引导`

- [ ] **Step 1: Write failing home-state tests**

Require all of the following:

```js
assert.doesNotMatch(home, /显示导入来源弹窗/);
assert.doesNotMatch(home, /打开云端牌组弹窗\(false\)/);
assert.match(home, /导入牌组回调:[\s\S]*从选择器导入牌组\(\)/);
assert.match(home, /清理残留下载\(context\.filesDir\)/);
assert.match(home, /云端牌组成功ID列表\.length === 0/);
assert.match(home, /const saved: boolean = await 标记已完成云端牌组引导\(\)/);
```

Also assert the download method does not call the completion marker and accumulates previous successes across retries.

- [ ] **Step 2: Run the flow contract and verify RED**

```powershell
node --test tools/tests/cloud-deck-flow-contract.test.mjs
```

Expected: FAIL because manual cloud routing and early completion persistence still exist.

- [ ] **Step 3: Implement the home state machine**

Remove the import-source component import, state, back handling, and render branch. Route the home action directly:

```ts
导入牌组回调: (): void => {
  this.显示主页操作 = false;
  this.从选择器导入牌组();
}
```

Open the mandatory cloud modal only from `显示首次弹窗序列()`. Before loading its catalog, call stale-file cleanup. Always consume back while the modal is visible. Remove every completion write from download start/finally. Preserve earlier successes when retrying failed selections.

Add a completion method with these guards and ordering:

```ts
if (this.云端牌组忙碌 || this.云端牌组成功ID列表.length === 0) return;
const saved: boolean = await 标记已完成云端牌组引导();
if (!saved) {
  this.云端牌组错误 = this.取本地化文本($r('app.string.cloud_deck_save_failed'));
  return;
}
this.显示云端牌组弹窗 = false;
await this.显示欢迎弹窗一次();
```

Remove obsolete import-source strings and document the one-time mandatory flow in `PROJECT_CONTEXT.md`.

- [ ] **Step 4: Run focused and full tests and verify GREEN**

```powershell
node --test tools/tests/cloud-deck-flow-contract.test.mjs tools/tests/i18n-contract.test.mjs
npm test
```

Expected: focused tests pass; full suite reports zero failures.

- [ ] **Step 5: Commit the state-machine task**

```powershell
git add -- entry/src/main/ets/pages/首页.ets entry/src/main/resources/base/element/string.json entry/src/main/resources/en_US/element/string.json tools/tests/cloud-deck-flow-contract.test.mjs PROJECT_CONTEXT.md
git add -u -- entry/src/main/ets/components/导入来源弹窗.ets
git commit -m "feat: require one cloud deck before entering"
```

### Task 5: Version, Build, Emulator Regression, and Catalog Publication

**Files:**
- Modify: `AppScope/app.json5`
- Modify: `docs/cloud-deck-hosting.md`
- Published external artifact: 123 Cloud Disk `cloud-decks.json`
- Build artifact: `entry/build/default/outputs/default/entry-default-signed.hap`

**Interfaces:**
- Consumes: all prior tasks
- Produces: signed HarmonyOS HAP and publicly reachable six-deck JSON catalog

- [ ] **Step 1: Add release-contract assertions and verify RED**

Update the catalog/flow contract to require version `2.3.3`, six hosted entries, `cardCount`, and the high-school URL. Run the focused tests and confirm failure on the old version.

- [ ] **Step 2: Bump version and update hosting documentation**

Set:

```json5
versionCode: 2303,
versionName: '2.3.3',
```

Document `cardCount`, the mandatory one-time onboarding, and interrupted-download cleanup in `docs/cloud-deck-hosting.md`.

- [ ] **Step 3: Run repository verification**

```powershell
npm test
npm run doctor
npm run build:app
git diff --check
```

Expected: all Node tests pass, doctor reports the toolchain ready, ArkTS type check succeeds, and the signed HAP builds successfully.

- [ ] **Step 4: Run emulator regression without uninstalling user data**

Install with `hdc install -r`. Verify that the existing old onboarding key is ignored, zero selection cannot proceed, the smallest public deck imports, “进入软件” persists the fixed generation key, restart does not show onboarding, and another in-place version update still does not show onboarding. Verify “新建牌组 → 导入牌组” opens only the local picker. Interrupt one download, restart, and verify stale `.part`/`.apkg` files are removed and the mandatory modal remains.

- [ ] **Step 5: Publish and verify the hosted catalog**

Use the already-authorized signed-in 123 Cloud Disk session to replace `cloud-decks.json` with `hosting/cloud-decks.json`. Fetch the public catalog URL without cache and assert it returns six entries with the exact card counts and high-school URL.

- [ ] **Step 6: Commit release metadata**

```powershell
git add -- AppScope/app.json5 docs/cloud-deck-hosting.md
git commit -m "release: prepare mandatory cloud deck onboarding 2.3.3"
```

- [ ] **Step 7: Record final artifact integrity**

```powershell
Get-FileHash entry/build/default/outputs/default/entry-default-signed.hap -Algorithm SHA256
Get-Item entry/build/default/outputs/default/entry-default-signed.hap | Select-Object FullName,Length,LastWriteTime
git status --short
```

Expected: SHA-256 and size are recorded for handoff; working tree is clean.
