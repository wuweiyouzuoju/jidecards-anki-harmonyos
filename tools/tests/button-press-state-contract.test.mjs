// SPDX-License-Identifier: AGPL-3.0-or-later

import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

function read(path) {
  return readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
}

test('focus theme is scoped to the type-answer input instead of the Ability', () => {
  const ability = read('entry/src/main/ets/entryability/EntryAbility.ets');
  const page = read('entry/src/main/ets/pages/学习页.ets');
  assert.doesNotMatch(ability, /ThemeControl|setDefaultTheme/);

  const localThemeStart = page.indexOf('WithTheme({');
  const inputStart = page.indexOf("TextInput({ placeholder: $r('app.string.study_type_answer_placeholder')", localThemeStart);
  assert.notEqual(localThemeStart, -1, 'type-answer input must have a local WithTheme scope');
  assert.notEqual(inputStart, -1, 'type-answer TextInput must be inside the local theme scope');
  const localTheme = page.slice(localThemeStart, inputStart);
  for (const token of [
    'compBackgroundFocus',
    'compFocusedPrimary',
    'compFocusedSecondary',
    'compFocusedTertiary',
    'interactiveFocus',
  ]) {
    assert.match(localTheme, new RegExp(`${token}: Color\\.Transparent`), token);
  }
  assert.doesNotMatch(localTheme, /interactivePressed/);
  assert.match(page, /\.stateStyles\(\{/);
  assert.match(page, /\.focusBox\(\{/);
});

test('settings detail content stays visible without accordion state', () => {
  const shell = read('entry/src/main/ets/components/settings/设置分组卡片.ets');
  assert.doesNotMatch(shell, /是否展开|切换展开回调|\.rotate\(/);
  assert.match(shell, /this\.内容\(\)/);
});

test('study actions use isolated native press surfaces without touch-driven component rebuilds', () => {
  const page = read('entry/src/main/ets/pages/学习页.ets');
  const buttonUrl = new URL('../../entry/src/main/ets/components/StudyActionButton.ets', import.meta.url);
  assert.ok(existsSync(buttonUrl), 'isolated StudyActionButton component must exist');
  const button = read('entry/src/main/ets/components/StudyActionButton.ets');
  assert.doesNotMatch(page, /按下评分|BURY_RATING_TAG|SUSPEND_RATING_TAG/);
  assert.equal((page.match(/StudyActionButton\(\{/g) ?? []).length, 4);
  assert.doesNotMatch(button, /@State|onTouch\(|\.animation\(/);
  assert.match(button, /new GlassSurface\(this.glassColors, this.fillColor\)/);
  assert.match(button, /\.stateEffect\(false\)/);
});

test('help buttons use the shared press feedback as the sole feedback owner', () => {
  for (const path of [
    'entry/src/main/ets/components/settings/设置分组卡片.ets',
    'entry/src/main/ets/components/settings/布局分组.ets',
    'entry/src/main/ets/components/settings/GeneralSettings.ets',
    'entry/src/main/ets/components/settings/ReviewControlsSettings.ets',
  ]) {
    const source = read(path);
    assert.match(source, /HelpLabel\(/, `${path}: expected shared help label`);
  }
  const button = read('entry/src/main/ets/components/common/HelpButton.ets');
  assert.match(button, /\.onClick\(/);
  assert.match(button, /new PressFeedback\(/);
  assert.match(button, /\.stateEffect\(false\)/);
});

// The surface behavior itself is executed in theme-text.test.mjs; these checks audit every caller.
test('all custom press surfaces use one native feedback owner', () => {
  for (const file of ['components/common/按下态按钮.ets', 'components/StudyActionButton.ets',
    'components/开始学习按钮.ets', 'components/学习浮动工具栏.ets', 'components/牌组详情面板.ets']) {
    const source = read('entry/src/main/ets/' + file);
    assert.doesNotMatch(source, /onTouch\(|duration: 80/, file);
    const surfaces = [...source.matchAll(/\.attributeModifier\(new (?:Primary)?GlassSurface\([^\n]+\)\)([\s\S]*?)\.onClick/g)];
    assert.ok(surfaces.length > 0, file);
    // Deck 'More' is a clickable Row with no native Button effect; only its three Buttons need the opt-out.
    const buttons = file.endsWith('牌组详情面板.ets') ? surfaces.slice(1) : surfaces;
    if (file.endsWith('牌组详情面板.ets')) {
      assert.equal(surfaces.length, 4);
      assert.doesNotMatch(surfaces[0][1], /stateEffect/);
    }
    for (const surface of buttons) assert.match(surface[1], /\.stateEffect\(false\)/, file);
  }
});
