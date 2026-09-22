# Compact Cloud Deck Picker Implementation Plan

> 归档状态：这是一次性历史设计/执行记录，不是当前路线图、待办列表或操作手册。未勾选项不表示仍未实现；当前事实请查阅 [文档导航](../../README.md)、[开发状态](../../DEVELOPMENT_PLAN.md)、[当前架构](../../architecture.md) 和实际源码/测试。


**Goal:** Ship the 2.3.3 first-run cloud deck picker with a shorter modal, clickable QQ-group copy action, and the exact six-deck order and counts requested by the user.

**Architecture:** Keep `云端牌组弹窗` presentation-only by exposing an `onCopyQQGroup` callback. `首页` owns the HarmonyOS pasteboard side effect and toast, while `hosting/cloud-decks.json` remains the single source of deck ordering and hosted metadata.

**Tech Stack:** ArkTS/ArkUI, HarmonyOS BasicServicesKit pasteboard, JSON hosting catalog, Node contract tests, hvigor.

## Global Constraints

- Release remains `versionName: '2.3.3'` and `versionCode: 2303`.
- Modal title is exactly “获取你的牌组”.
- QQ group `726837065` copies on tap; it does not launch QQ.
- Deck order is exactly CET → 高考 → 中考 → AI机器学习 → AI计算机专业工具名词术语 → 中国法律专业版.
- The high-school deck keeps the user-provided 123 Cloud Disk direct URL and `cardCount: 8453`.
- All visible copy is localized; no new dependency or permission is added.
- Existing mandatory onboarding, retry, cleanup, and completion behavior must remain unchanged.

---

### Task 1: Lock the six-deck order and compact-picker contract

**Files:**
- Modify: `tools/tests/cloud-deck-catalog.test.mjs`
- Modify: `tools/tests/cloud-deck-flow-contract.test.mjs`
- Modify: `hosting/cloud-decks.json`

**Interfaces:**
- Consumes: `解析云端牌组目录(text: string): 云端牌组目录`
- Produces: ordered `云端牌组目录.decks` used unchanged by `首页`

- [ ] **Step 1: Write failing order and UI contract assertions**

Update the catalog expectation to this exact order:

```js
[
  { id: 'cet-46-vocabulary', cardCount: 14311 },
  { id: 'high-school-english-vocabulary', cardCount: 8453 },
  { id: 'middle-school-english-vocabulary', cardCount: 3305 },
  { id: 'ai-machine-learning', cardCount: 1450 },
  { id: 'ai-computer-terms', cardCount: 1 },
  { id: 'china-law-professional', cardCount: 2500 },
]
```

Add flow assertions:

```js
assert.match(component, /onCopyQQGroup/);
assert.match(component, /cloud_deck_qq_group_entry/);
assert.match(component, /maxHeight: '72%'/);
assert.doesNotMatch(component, /maxHeight: '88%'/);
assert.equal(zhMap.get('cloud_deck_title'), '获取你的牌组');
assert.ok(zhMap.has('cloud_deck_qq_copy_failed'));
```

- [ ] **Step 2: Run focused tests and verify RED**

Run:

```powershell
node --experimental-transform-types --import ./tools/tests/register-ts-hook.mjs --test tools/tests/cloud-deck-catalog.test.mjs tools/tests/cloud-deck-flow-contract.test.mjs
```

Expected: FAIL because high school is last, the modal is still 88% tall, and copy callback/resources do not exist.

- [ ] **Step 3: Reorder only the catalog array**

Move the complete `high-school-english-vocabulary` object directly after `cet-46-vocabulary`. Preserve its URL, size `184166749`, and card count `8453`; do not modify other deck values.

- [ ] **Step 4: Run the catalog test**

Run the focused command from Step 2.

Expected: catalog order assertions pass; UI contract remains RED.

- [ ] **Step 5: Commit the catalog order**

```powershell
git add -- hosting/cloud-decks.json tools/tests/cloud-deck-catalog.test.mjs
git commit -m "data: order hosted decks for onboarding"
```

---

### Task 2: Shorten the modal and add QQ copy interaction

**Files:**
- Modify: `entry/src/main/ets/components/云端牌组弹窗.ets`
- Modify: `entry/src/main/ets/pages/首页.ets`
- Modify: `entry/src/main/resources/base/element/string.json`
- Modify: `entry/src/main/resources/en_US/element/string.json`
- Modify: `tools/tests/cloud-deck-flow-contract.test.mjs`

**Interfaces:**
- Produces: `onCopyQQGroup: () => void`
- Consumes: `首页.复制云端牌组QQ群号(): Promise<void>`

- [ ] **Step 1: Keep the flow test RED from Task 1**

Run:

```powershell
node --test tools/tests/cloud-deck-flow-contract.test.mjs tools/tests/i18n-contract.test.mjs
```

Expected: FAIL on `onCopyQQGroup`, the title, copy-failure resource, and `72%` height.

- [ ] **Step 2: Add localized title, QQ entry, and failure copy**

Use these base values:

```json
{ "name": "cloud_deck_title", "value": "获取你的牌组" },
{ "name": "cloud_deck_onboarding_message", "value": "首次进入可自由选择所需牌组，至少选择 1 个，下载后将自动导入。本次选择机会仅有一次，请按需选择。" },
{ "name": "cloud_deck_qq_group_entry", "value": "更多最新牌组请加入官方 QQ 群：%s（点击复制）" },
{ "name": "cloud_deck_qq_copy_failed", "value": "QQ群号复制失败，请手动记录：%s" }
```

Add equivalent English values with the same keys.

- [ ] **Step 3: Make the component compact and presentation-only**

Add:

```ts
onCopyQQGroup: () => void = (): void => {};
```

Render a small clickable QQ entry below the onboarding message:

```ts
Text($r('app.string.cloud_deck_qq_group_entry', '726837065'))
  .fontSize(应用尺寸.字号_说明)
  .fontColor(this.动作主色)
  .onClick((): void => { this.onCopyQQGroup(); })
```

Set modal constraint to:

```ts
.constraintSize({ maxWidth: 560, maxHeight: '72%' })
```

Use `应用尺寸.间距_8` for each deck row padding, reduce the row column spacing to `应用尺寸.间距_4`, and limit description to one line. Keep metadata and status visible.

- [ ] **Step 4: Implement pasteboard copy in Home**

Import pasteboard:

```ts
import { pasteboard } from '@kit.BasicServicesKit';
```

Add:

```ts
private async 复制云端牌组QQ群号(): Promise<void> {
  const groupNumber: string = '726837065';
  try {
    const data: pasteboard.PasteData =
      pasteboard.createData(pasteboard.MIMETYPE_TEXT_PLAIN, groupNumber);
    await pasteboard.getSystemPasteboard().setData(data);
    this.显示提示($r('app.string.about_qq_group_copied'));
  } catch (error) {
    this.显示提示($r('app.string.cloud_deck_qq_copy_failed', groupNumber));
  }
}
```

Wire the component callback:

```ts
onCopyQQGroup: (): void => {
  this.复制云端牌组QQ群号();
}
```

- [ ] **Step 5: Run focused tests and verify GREEN**

Run:

```powershell
node --test tools/tests/cloud-deck-flow-contract.test.mjs tools/tests/i18n-contract.test.mjs
```

Expected: all focused tests pass.

- [ ] **Step 6: Commit the compact picker**

```powershell
git add -- entry/src/main/ets/components/云端牌组弹窗.ets entry/src/main/ets/pages/首页.ets entry/src/main/resources/base/element/string.json entry/src/main/resources/en_US/element/string.json tools/tests/cloud-deck-flow-contract.test.mjs
git commit -m "feat: compact the cloud deck picker"
```

---

### Task 3: Verify and package release 2.3.3

**Files:**
- Modify: `AppScope/app.json5`
- Modify: `docs/superpowers/plans/2026-08-29-required-cloud-deck-onboarding.md`
- Test: `tools/tests/cloud-deck-catalog.test.mjs`
- Build artifact: `entry/build/default/outputs/default/entry-default-signed.hap`

**Interfaces:**
- Consumes: completed catalog and compact picker
- Produces: signed 2.3.3 HAP

- [ ] **Step 1: Verify release metadata**

Ensure:

```json5
versionCode: 2303,
versionName: '2.3.3',
```

Run:

```powershell
node --experimental-transform-types --import ./tools/tests/register-ts-hook.mjs --test tools/tests/cloud-deck-catalog.test.mjs
```

Expected: PASS.

- [ ] **Step 2: Run full verification**

```powershell
npm test
npm run doctor
npm run build:app
git diff --check
```

Expected: 528 Node tests pass, doctor reports ready, ArkTS type check and signed HAP build succeed, and diff check is clean.

- [ ] **Step 3: Install without deleting emulator data**

```powershell
hdc install -r entry/build/default/outputs/default/entry-default-signed.hap
```

Expected: install succeeds without uninstalling or clearing the existing collection.

- [ ] **Step 4: Verify the screen and copy interaction**

Confirm on the emulator:

- title is “获取你的牌组”;
- modal is visibly shorter and its list scrolls;
- order is CET, 高考, 中考, AI机器学习, AI计算机术语, 法律;
- each row shows the exact card count;
- tapping the QQ line copies `726837065` and shows the success toast;
- zero selection cannot download and system back cannot dismiss the modal.

- [ ] **Step 5: Commit release metadata and record artifact integrity**

```powershell
git add -- AppScope/app.json5 docs/superpowers/plans/2026-08-29-required-cloud-deck-onboarding.md tools/tests/cloud-deck-catalog.test.mjs
git commit -m "release: prepare cloud deck onboarding 2.3.3"
Get-FileHash entry/build/default/outputs/default/entry-default-signed.hap -Algorithm SHA256
Get-Item entry/build/default/outputs/default/entry-default-signed.hap | Select-Object FullName,Length,LastWriteTime
git status --short
```

Expected: version changes are committed and the final HAP hash and size are available for handoff.
