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
    'entry/src/main/ets/components/common/FormSelectRow.ets',
    'entry/src/main/ets/components/common/SettingsToggleRow.ets',
  ]) {
    const source = read(path);
    assert.match(source, /HelpLabel\(/, `${path}: expected shared help label`);
  }
  assert.match(read('entry/src/main/ets/components/settings/布局分组.ets'), /FormSelectRow\(\{[\s\S]*?showHelp: true[\s\S]*?onHelp:/);
  for (const path of ['GeneralSettings']) {
    assert.match(read(`entry/src/main/ets/components/settings/${path}.ets`),
      /SettingsToggleRow\(\{[\s\S]*?showHelp: true[\s\S]*?onHelp:/,
      `${path}: settings help must be wired through the shared switch row`);
  }
  const review = read('entry/src/main/ets/components/settings/ReviewControlsSettings.ets');
  assert.match(review, /FormSelectRow\(\{ label: settingsItemText\(this\.getUIContext\(\), 'study_quick_answer', this\.uiLanguage\),[\s\S]*?showHelp: true,[\s\S]*?onHelp:/);
  assert.match(review, /this\.打开说明回调\(\$r\('app.string.settings_quick_answer'\), \$r\('app.string.settings_quick_answer_help'\)\)/);
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
    assert.doesNotMatch(source, /duration: 80/, file);
    const surfaces = [...source.matchAll(/\.attributeModifier\(new (?:Primary)?GlassSurface\([^\n]+\)\)([\s\S]*?)\.onClick/g)];
    assert.ok(surfaces.length > 0, file);
    // Deck 'More' is a clickable Row; its following ForEach owns all three native Buttons.
    const buttons = file.endsWith('牌组详情面板.ets') ? surfaces.slice(1) : surfaces;
    if (file.endsWith('牌组详情面板.ets')) {
      assert.equal(surfaces.length, 2);
      assert.match(source, /ForEach\(this.moreItems\(\), \(item: AppInterfaceItem\) => \{\s*Button/);
      assert.doesNotMatch(surfaces[0][1], /stateEffect/);
    }
    for (const surface of buttons) {
      assert.doesNotMatch(surface[1], /onTouch\(/, file);
      assert.match(surface[1], /\.stateEffect\(false\)/, file);
    }
  }
});
