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

test('学习页动作组只映射真实阶段和原回调，不引入形变或延迟',()=>{
 const page=read('entry/src/main/ets/pages/学习页.ets'),group=read('entry/src/main/ets/components/StudyAnswerActionBar.ets');
 assert.equal((page.match(/StudyAnswerActionBar\(\{/g)||[]).length,1);
 assert.equal((group.match(/this.rate\(RATING_/g)||[]).length,4);
 assert.match(page,/显示答案回调: \(\): void => \{ this\.显示答案\(\); \}/);
 assert.match(page,/评分回调: \(rating: number\): void => \{ this\.评分\(rating\); \}/);
 assert.doesNotMatch(group,/OliveOil|setTimeout|animateTo/);
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
    'components/学习浮动工具栏.ets']) {
    const source = read('entry/src/main/ets/' + file);
    assert.doesNotMatch(source, /duration: 80/, file);
    const surfaces = [...source.matchAll(/\.attributeModifier\((?:this\.compact \? new PressFeedback\([^)]*\) : )?new (?:(?:Primary)?GlassSurface|StudyRatingSurface)\([^\n]+\)\)([\s\S]*?)\.onClick/g)];
    assert.ok(surfaces.length > 0, file);
    const buttons = surfaces;
    for (const surface of buttons) {
      assert.doesNotMatch(surface[1], /onTouch\(/, file);
      assert.match(surface[1], /\.stateEffect\(false\)/, file);
    }
  }
  const start = read('entry/src/main/ets/components/开始学习按钮.ets');
  assert.match(start, /new StudyRatingSurface\(this\.surfaceMaterial/, 'start study keeps shared material and border');
  assert.match(start, /onClick\(\(\): void => \{ if \(this.isAvailable\) this\.开始学习回调\(\); \}/);
  assert.match(start, /enabled\(this\.isAvailable\)/);
});

