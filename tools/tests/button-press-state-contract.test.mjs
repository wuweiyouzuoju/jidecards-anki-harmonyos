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

test('study actions use isolated component state', () => {
  const page = read('entry/src/main/ets/pages/学习页.ets');
  const buttonUrl = new URL('../../entry/src/main/ets/components/StudyActionButton.ets', import.meta.url);
  assert.ok(existsSync(buttonUrl), 'isolated StudyActionButton component must exist');
  const button = read('entry/src/main/ets/components/StudyActionButton.ets');
  assert.doesNotMatch(page, /按下评分|BURY_RATING_TAG|SUSPEND_RATING_TAG/);
  assert.equal((page.match(/StudyActionButton\(\{/g) ?? []).length, 4);
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
    'entry/src/main/ets/components/settings/GeneralSettings.ets',
    'entry/src/main/ets/components/settings/ReviewControlsSettings.ets',
  ]) {
    const source = read(path);
    const blocks = source.split("Button($r('app.string.field_help_button'))").slice(1);
    assert.ok(blocks.length > 0, `${path}: expected at least one help button`);
    for (const block of blocks) {
      const click = block.indexOf('.onClick(');
      assert.notEqual(click, -1, `${path}: help button click handler missing`);
      assert.doesNotMatch(block.slice(0, click), /\.stateEffect\(false\)/, path);
    }
  }
});
