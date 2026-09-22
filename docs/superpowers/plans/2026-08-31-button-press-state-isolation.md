# Button Press State Isolation Implementation Plan

> 归档状态：这是一次性历史设计/执行记录，不是当前路线图、待办列表或操作手册。未勾选项不表示仍未实现；当前事实请查阅 [文档导航](../../README.md)、[开发状态](../../DEVELOPMENT_PLAN.md)、[当前架构](../../architecture.md) 和实际源码/测试。


> **SUPERSEDED (2026-08-31):** The `stateEffect(false)` diagnosis and its screenshot-based validation were disproved. Use `2026-08-31-focus-theme-and-press-state-recovery.md`; this file remains only as an audit trail of the abandoned attempt.

**Goal:** Remove native Button press-effect flashes so settings help buttons stay transparent and only the touched study action button receives the custom blue highlight.

**Architecture:** Keep ArkUI `Button` semantics and existing click handlers. Disable only the built-in `stateEffect` on affected buttons, leaving the study page's existing mutually exclusive `按下评分` state as the single visual source of truth.

**Tech Stack:** ArkTS, ArkUI `Button`, Node.js contract tests, Hvigor application build.

## Global Constraints

- Do not change Anki scheduling, rating values, bury/suspend calls, queue state, Rust, protobuf, NAPI, or database behavior.
- Keep all existing `onClick`, `onTouch`, dimensions, colors, and accessibility button semantics.
- Do not uninstall the app; device deployment may only use `hdc install -r`.
- The affected production files already contain earlier worktree changes, so do not commit whole files without isolating the exact hunks.

---

### Task 1: Lock the press-effect contract

**Files:**
- Create: `tools/tests/button-press-state-contract.test.mjs`
- Read: `entry/src/main/ets/components/settings/设置分组卡片.ets`
- Read: `entry/src/main/ets/components/settings/布局分组.ets`
- Read: `entry/src/main/ets/components/settings/术语分组.ets`
- Read: `entry/src/main/ets/components/设置面板.ets`
- Read: `entry/src/main/ets/pages/学习页.ets`

**Interfaces:**
- Consumes: ArkTS source text and the existing `field_help_button`, `BURY_RATING_TAG`, `SUSPEND_RATING_TAG`, and `RATING_*` button declarations.
- Produces: A source-contract test that fails until every affected `Button` explicitly calls `.stateEffect(false)`.

- [x] **Step 1: Write the failing test**

```javascript
// SPDX-License-Identifier: AGPL-3.0-or-later
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

function read(path) {
  return readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
}

function countMatches(source, pattern) {
  return [...source.matchAll(pattern)].length;
}

test('settings help buttons disable the native square press effect', () => {
  for (const path of [
    'entry/src/main/ets/components/settings/设置分组卡片.ets',
    'entry/src/main/ets/components/settings/布局分组.ets',
    'entry/src/main/ets/components/settings/术语分组.ets',
    'entry/src/main/ets/components/设置面板.ets',
  ]) {
    const source = read(path);
    const helpCount = countMatches(source, /Button\(\$r\('app\.string\.field_help_button'\)\)/g);
    const isolatedCount = countMatches(
      source,
      /Button\(\$r\('app\.string\.field_help_button'\)\)[\s\S]{0,180}?\.stateEffect\(false\)/g,
    );
    assert.equal(isolatedCount, helpCount, path);
  }
});

test('study action buttons disable native effects and keep one custom pressed state', () => {
  const page = read('entry/src/main/ets/pages/学习页.ets');
  for (const declaration of [
    /Button\(\$r\('app\.string\.study_bury'\)\)/,
    /Button\(\$r\('app\.string\.study_suspend'\)\)/,
    /Button\(this\.按钮文案位\(RATING_AGAIN\)\)/,
    /Button\(this\.按钮文案位\(RATING_HARD\)\)/,
    /Button\(this\.按钮文案位\(RATING_GOOD\)\)/,
    /Button\(this\.按钮文案位\(RATING_EASY\)\)/,
  ]) {
    const start = page.search(declaration);
    assert.notEqual(start, -1, declaration.toString());
    assert.match(page.slice(start, start + 700), /\.stateEffect\(false\)/, declaration.toString());
  }
  assert.match(page, /@State private 按下评分: number = -1/);
  for (const tag of ['BURY_RATING_TAG', 'SUSPEND_RATING_TAG', 'RATING_AGAIN', 'RATING_HARD', 'RATING_GOOD', 'RATING_EASY']) {
    assert.match(page, new RegExp(`this\\.按下评分 === ${tag} \\? this\\.主色容器色`), tag);
  }
});
```

- [x] **Step 2: Run the focused test and verify RED**

Run:

```powershell
node --experimental-transform-types --import ./tools/tests/register-ts-hook.mjs --test tools/tests/button-press-state-contract.test.mjs
```

Expected: both tests fail because the affected buttons do not yet contain `.stateEffect(false)`.

---

### Task 2: Disable the duplicate native press layer

**Files:**
- Modify: `entry/src/main/ets/components/settings/设置分组卡片.ets:29`
- Modify: `entry/src/main/ets/components/settings/布局分组.ets:155`
- Modify: `entry/src/main/ets/components/settings/布局分组.ets:198`
- Modify: `entry/src/main/ets/components/settings/术语分组.ets:157`
- Modify: `entry/src/main/ets/components/设置面板.ets:1012`
- Modify: `entry/src/main/ets/pages/学习页.ets:1398-1499`
- Test: `tools/tests/button-press-state-contract.test.mjs`

**Interfaces:**
- Consumes: `ButtonAttribute.stateEffect(value: boolean)` from the installed HarmonyOS SDK.
- Produces: Buttons whose only visible pressed background is the application's existing custom state.

- [x] **Step 1: Apply the minimal production change**

For every settings help button, retain the current type and add:

```typescript
Button($r('app.string.field_help_button'))
  .type(ButtonType.Normal)
  .stateEffect(false)
```

For bury, suspend, Again, Hard, Good, and Easy, add immediately after each `Button(...)` declaration:

```typescript
.stateEffect(false)
```

Do not alter the existing `.backgroundColor(...)`, `.onTouch(...)`, or `.onClick(...)` chains.

- [x] **Step 2: Run the focused test and verify GREEN**

Run:

```powershell
node --experimental-transform-types --import ./tools/tests/register-ts-hook.mjs --test tools/tests/button-press-state-contract.test.mjs
```

Expected: 2 tests pass, 0 fail.

- [x] **Step 3: Inspect the scoped diff**

Run:

```powershell
git diff --check -- entry/src/main/ets/components/settings/设置分组卡片.ets entry/src/main/ets/components/settings/布局分组.ets entry/src/main/ets/components/settings/术语分组.ets entry/src/main/ets/components/设置面板.ets entry/src/main/ets/pages/学习页.ets tools/tests/button-press-state-contract.test.mjs
```

Expected: no whitespace errors. Do not stage the dirty production files as whole files.

---

### Task 3: Full verification and device acceptance

**Files:**
- Verify: `entry/build/default/outputs/default/entry-default-signed.hap`

**Interfaces:**
- Consumes: the complete repository test suite, Rust/ArkTS build pipeline, and connected HarmonyOS devices.
- Produces: a signed HAP with the isolated press behavior and recorded verification evidence.

- [x] **Step 1: Run all contract tests**

Run:

```powershell
npm test
```

Expected: all tests pass with no failures.

- [x] **Step 2: Build the signed application**

Run:

```powershell
npm run build:app
```

Expected: Rust targets and ArkTS type checking succeed; `entry-default-signed.hap` is produced.

- [x] **Step 3: Cover-install on every online device**

Run `hdc list targets`, then for each returned target:

```powershell
hdc -t <target> install -r entry/build/default/outputs/default/entry-default-signed.hap
```

Expected: successful replacement install. Never run uninstall.

- [x] **Step 4: Verify visible behavior**

On an interactive online device:

1. Expand scheduler and study-layout settings groups; no help icon may flash a gray square.
2. Tap a help icon; its explanation must still open.
3. Enter a study answer view and press each of bury, suspend, Again, Hard, Good, and Easy without completing unintended actions; only the touched button may turn blue.
4. Confirm the other five buttons remain on `surface_card` and the touched button restores on release/cancel.

If no interactive physical device is online, report that limitation explicitly and do not claim physical-device acceptance.
