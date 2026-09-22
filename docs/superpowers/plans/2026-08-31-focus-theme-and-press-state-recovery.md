# Focus Theme and Press State Recovery Implementation Plan

> 归档状态：这是一次性历史设计/执行记录，不是当前路线图、待办列表或操作手册。未勾选项不表示仍未实现；当前事实请查阅 [文档导航](../../README.md)、[开发状态](../../DEVELOPMENT_PLAN.md)、[当前架构](../../architecture.md) 和实际源码/测试。


**Goal:** Keep the type-answer input free of the system focus color while restoring isolated, 2.0.1-style button feedback in settings and study UI.

**Architecture:** Replace the Ability-wide theme override with a `WithTheme` scope around the single type-answer `TextInput`. Limit settings animation to the arrow node, and replace the study page's shared pressed rating state with one local-state `StudyActionButton` instance per action.

**Tech Stack:** ArkTS, ArkUI `WithTheme`/`Button`/`TextInput`, Node.js contract tests, Hvigor application build.

## Global Constraints

- Do not modify Anki Rust, protobuf, NAPI, database schema, scheduling values, or card queue behavior.
- Preserve type-answer field detection, comparison, Enter submission, layout padding, float-mode inset, `stateStyles`, and `focusBox`.
- Do not use Computer Use or a settled screenshot as proof of an 80–150ms interaction.
- Preserve unrelated dirty-worktree changes; stage files explicitly and do not use `git add .`.

---

### Task 1: Replace the false regression contract with scope and ownership contracts

**Files:**
- Modify: `tools/tests/button-press-state-contract.test.mjs`

**Interfaces:**
- Consumes: source text for `EntryAbility.ets`, `学习页.ets`, `设置分组卡片.ets`, and `StudyActionButton.ets`.
- Produces: regression requirements for global theme absence, local input theme presence, arrow-only settings animation, and per-button pressed state.

- [ ] **Step 1: Write the failing tests**

Replace the current `stateEffect(false)`-presence assertions with four tests:

```javascript
test('focus theme is scoped to the type-answer input instead of the Ability', () => {
  const ability = read('entry/src/main/ets/entryability/EntryAbility.ets');
  const page = read('entry/src/main/ets/pages/学习页.ets');
  assert.doesNotMatch(ability, /ThemeControl|setDefaultTheme/);
  assert.match(page, /WithTheme\(\{[\s\S]*?compBackgroundFocus:[\s\S]*?interactiveFocus:[\s\S]*?\}\)\s*\{/);
  assert.doesNotMatch(page.match(/WithTheme\([\s\S]*?\n\s*\}/)?.[0] ?? '', /interactivePressed/);
  assert.match(page, /\.stateStyles\(\{/);
  assert.match(page, /\.focusBox\(\{/);
});

test('settings expansion animates only the arrow', () => {
  const shell = read('entry/src/main/ets/components/settings/设置分组卡片.ets');
  assert.match(shell, /\.rotate\([\s\S]*?\.animation\(\{ duration: 150, curve: Curve\.EaseOut \}\)/);
  assert.doesNotMatch(shell, /animateTo\([\s\S]*?this\.切换展开回调/);
  assert.match(shell, /\.onClick\(\(\): void => \{\s*this\.切换展开回调\(\);\s*\}\)/);
});

test('study actions use isolated component state', () => {
  const page = read('entry/src/main/ets/pages/学习页.ets');
  const button = read('entry/src/main/ets/components/StudyActionButton.ets');
  assert.doesNotMatch(page, /按下评分|BURY_RATING_TAG|SUSPEND_RATING_TAG/);
  assert.equal((page.match(/StudyActionButton\(\{/g) ?? []).length, 6);
  assert.match(button, /@State private isPressed: boolean = false/);
  assert.match(button, /TouchType\.Down[\s\S]*?this\.isPressed = true/);
  assert.match(button, /TouchType\.Up[\s\S]*?TouchType\.Cancel[\s\S]*?this\.isPressed = false/);
  assert.match(button, /\.stateEffect\(false\)/);
});

test('help buttons do not carry the disproven native-effect workaround', () => {
  for (const path of [
    'entry/src/main/ets/components/settings/设置分组卡片.ets',
    'entry/src/main/ets/components/settings/布局分组.ets',
    'entry/src/main/ets/components/settings/术语分组.ets',
    'entry/src/main/ets/components/设置面板.ets',
  ]) {
    const source = read(path);
    for (const block of source.split("Button($r('app.string.field_help_button'))").slice(1)) {
      assert.doesNotMatch(block.slice(0, block.indexOf('.onClick(')), /\.stateEffect\(false\)/, path);
    }
  }
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```powershell
node --experimental-transform-types --import ./tools/tests/register-ts-hook.mjs --test tools/tests/button-press-state-contract.test.mjs
```

Expected: failures report the current Ability-wide `ThemeControl`, settings `animateTo`, missing `StudyActionButton.ets`, shared `按下评分`, and stale help-button `stateEffect(false)` calls.

---

### Task 2: Scope the final input focus fix and narrow settings animation

**Files:**
- Modify: `entry/src/main/ets/entryability/EntryAbility.ets`
- Modify: `entry/src/main/ets/pages/学习页.ets`
- Modify: `entry/src/main/ets/components/settings/设置分组卡片.ets`
- Modify: `entry/src/main/ets/components/settings/布局分组.ets`
- Modify: `entry/src/main/ets/components/settings/术语分组.ets`
- Modify: `entry/src/main/ets/components/设置面板.ets`

**Interfaces:**
- Consumes: ArkUI `WithTheme`, existing input layout and settings expand callback.
- Produces: local five-token input theme and arrow-only group animation.

- [ ] **Step 1: Remove the Ability-wide theme override**

Change the ArkUI import back to:

```typescript
import { window } from '@kit.ArkUI';
```

Delete the entire `ThemeControl.setDefaultTheme({ ... })` call and its inaccurate comment from `onCreate()`.

- [ ] **Step 2: Apply the same focus tokens only around the input**

Inside the existing input `Column`, wrap only the `TextInput`:

```typescript
WithTheme({
  theme: {
    colors: {
      compBackgroundFocus: Color.Transparent,
      compFocusedPrimary: Color.Transparent,
      compFocusedSecondary: Color.Transparent,
      compFocusedTertiary: Color.Transparent,
      interactiveFocus: Color.Transparent
    }
  }
}) {
  TextInput({ placeholder: $r('app.string.study_type_answer_placeholder'), text: this.已输入答案 })
    // Keep the current width, height, border, background, stateStyles,
    // focusBox, Enter submission, and onChange chain unchanged.
}
```

Do not add `interactivePressed` or any non-focus theme token.

- [ ] **Step 3: Limit settings expansion animation to the arrow**

Keep the arrow's `.animation({ duration: 150, curve: Curve.EaseOut })`, and replace the header click handler with:

```typescript
.onClick((): void => {
  this.切换展开回调();
})
```

Remove `.stateEffect(false)` only from `field_help_button` declarations in the four listed settings files.

- [ ] **Step 4: Run the focused contract**

Run the Task 1 command. Expected: the focus-theme, settings-animation, and help-button tests pass; the study action test still fails because the isolated component is not implemented yet.

---

### Task 3: Give every study action its own pressed state

**Files:**
- Create: `entry/src/main/ets/components/StudyActionButton.ets`
- Modify: `entry/src/main/ets/pages/学习页.ets`

**Interfaces:**
- Consumes: `ResourceStr` label, `ResourceColor` text/pressed colors, numeric height/font size, and `onActivate: () => void`.
- Produces: `StudyActionButton`, a one-instance/one-state visual wrapper that does not alter business callback arguments.

- [ ] **Step 1: Implement the minimal isolated component**

```typescript
// SPDX-License-Identifier: AGPL-3.0-or-later

import { 应用尺寸 } from '../utils/应用尺寸';

@Component
export struct StudyActionButton {
  @Prop label: ResourceStr;
  @Prop height: number = 应用尺寸.行动按钮高度;
  @Prop fontSize: number = 应用尺寸.字号_按钮;
  @Prop fontColor: ResourceColor = $r('app.color.text_primary');
  @Prop pressedBackground: ResourceColor;
  @Prop pressedBorderColor: ResourceColor = $r('app.color.border_subtle');
  onActivate: () => void = (): void => {};
  @State private isPressed: boolean = false;

  build() {
    Button(this.label)
      .stateEffect(false)
      .layoutWeight(1)
      .height(this.height)
      .fontSize(this.fontSize)
      .fontColor(this.fontColor)
      .backgroundColor(this.isPressed ? this.pressedBackground : $r('app.color.surface_card'))
      .border({
        width: 应用尺寸.卡片边框,
        color: this.isPressed ? this.pressedBorderColor : $r('app.color.border_subtle')
      })
      .borderRadius(应用尺寸.圆角_面板)
      .animation({ duration: 80, curve: Curve.EaseOut })
      .onTouch((event: TouchEvent): void => {
        if (event.type === TouchType.Down) {
          this.isPressed = true;
        } else if (event.type === TouchType.Up || event.type === TouchType.Cancel) {
          this.isPressed = false;
        }
      })
      .onClick((): void => { this.onActivate(); })
  }
}
```

- [ ] **Step 2: Replace the six inline buttons**

Import `StudyActionButton`, remove `BURY_RATING_TAG`, `SUSPEND_RATING_TAG`, and page state `按下评分`, then replace each inline button with one component call. Preserve every existing callback exactly. Example:

```typescript
StudyActionButton({
  label: $r('app.string.study_bury'),
  height: 应用尺寸.按钮高度,
  fontSize: 应用尺寸.字号_正文_中,
  fontColor: $r('app.color.text_secondary'),
  pressedBackground: this.主色容器色,
  onActivate: (): void => {
    this.埋藏或暂停当前卡(BURY_SUSPEND_MODE_BURY_USER);
  }
})
```

For Good only, pass `pressedBorderColor: this.动作主色`. For the other five, use the default subtle border. Use `应用尺寸.行动按钮高度` for the four ratings and `应用尺寸.按钮高度` for bury/suspend.

- [ ] **Step 3: Run the focused contract and verify GREEN**

Run the Task 1 command. Expected: all four tests pass.

- [ ] **Step 4: Run study and UI shell contracts**

Run:

```powershell
node --experimental-transform-types --import ./tools/tests/register-ts-hook.mjs --test tools/tests/study-flow-contract.test.mjs tools/tests/ui-shell-contract.test.mjs tools/tests/button-press-state-contract.test.mjs
```

Expected: all focused tests pass with zero failures.

---

### Task 4: Correct the false records and verify the complete application

**Files:**
- Modify: `docs/superpowers/specs/2026-08-31-button-press-state-isolation-design.md`
- Modify: `docs/superpowers/plans/2026-08-31-button-press-state-isolation.md`
- Modify: `.trae/decisions.md`
- Modify: `PROJECT_CONTEXT.md`

**Interfaces:**
- Consumes: fresh test/build/dynamic evidence.
- Produces: an auditable correction that does not preserve the disproven `stateEffect` explanation as current truth.

- [ ] **Step 1: Mark the old design and plan as superseded**

Add a prominent opening notice to both old documents pointing to the approved focus-theme recovery design. State that `stateEffect(false)` did not resolve either reported symptom and that the static screenshot was not valid transient-effect evidence.

- [ ] **Step 2: Run the complete Node suite**

Run:

```powershell
npm test
```

Expected: exit code 0 and zero failed tests.

- [ ] **Step 3: Run the complete application build**

Run:

```powershell
npm run build:app
```

Expected: Rust targets, ArkTS type checking, packaging, and signed HAP all complete with exit code 0.

- [ ] **Step 4: Perform continuous-frame interaction verification when a device is available**

Use `hdc list targets` to discover targets. Install only with `hdc -t <target> install -r entry/build/default/outputs/default/entry-default-signed.hap`; never uninstall. Capture a video or burst of consecutive frames around each interaction, and verify:

- expanding scheduler and study-layout groups produces no gray help-button frame;
- each of bury, suspend, Again, Hard, Good, and Easy colors only itself while pressed;
- focusing the type-answer input produces no original theme-color block.

If no physical device is connected, record the dynamic checks as pending user true-device verification. Do not substitute a settled screenshot.

- [ ] **Step 5: Update project records with actual evidence**

Replace the false `PROJECT_CONTEXT.md` press-isolation result with the final scoped-theme/local-state architecture and the exact fresh test/build/device evidence. Append a correction entry to `.trae/decisions.md` describing the historical patch chain, rejected alternatives, remaining limitations, and verification results.

Because the working tree already contains overlapping uncommitted Agent work, do not create an implementation commit that would accidentally include unrelated hunks. Leave the verified implementation as a reviewable working-tree diff unless the user separately requests a scoped commit.
