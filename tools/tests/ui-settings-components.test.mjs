// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { SETTINGS_ENTRIES } from '../../entry/src/main/ets/model/SettingsNavigation.ts';
import { SETTINGS_GROUPS } from '../../entry/src/main/ets/model/SettingsStructure.ts';
import { loadComponentLogic, loadPlatformModule } from './platform-module-harness.mjs';

const root = new URL('../../entry/src/main/ets/', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');
const iconsSource = read('utils/SettingsIcons.ets');
const settingsIcon = loadPlatformModule('utils/SettingsIcons.ets', 'settingsIcon', { $r: key => key });

test('icon buttons reject disabled late clicks without changing host state', () => {
  const Button = loadComponentLogic('components/common/IconActionButton.ets', 'IconActionButton', {
    Color: { Transparent: 'transparent' }, 应用尺寸: {按钮高度: 44}
  });
  const button = new Button();
  const events = [];
  button.onAction = () => events.push('action');
  for (const interactive of [false, true, false, true]) {
    button.isInteractive = interactive;
    button.activate();
  }
  assert.deepEqual(events, ['action', 'action']);
});

test('icon recoloring preserves alpha and uses the requested RGB independent of theme', () => {
  const Icon = loadComponentLogic('components/common/ActionIcon.ets', 'ActionIcon', {
    $r: key => key,
    ColorFilter: class { constructor(matrix) { this.matrix = matrix; } }
  });
  const icon = new Icon();
  const apply = (input, matrix) => Array.from({ length: 4 }, (_, row) =>
    input.reduce((sum, channel, column) => sum + channel * matrix[row * 5 + column], matrix[row * 5 + 4]));
  for (const color of ['#FFFFFF', '#D97A1C', '#aBcD09']) {
    icon.strokeColor = color;
    const expected = [1, 3, 5].map(offset => parseInt(color.slice(offset, offset + 2), 16) / 255);
    for (const input of [[0, 0, 0, 1], [0.9, 0.93, 0.96, 0.5], [1, 1, 1, 0]]) {
      assert.deepEqual(apply(input, icon.iconFilter().matrix), [...expected, input[3]]);
    }
  }
  for (const invalid of ['', '#1g2g3g', 'red', '#12345678']) {
    icon.strokeColor = invalid;
    const original = [0.3, 0.5, 0.7, 0.4];
    assert.deepEqual(apply(original, icon.iconFilter().matrix), original);
  }
});

test('setting action rows reject disabled late clicks and leave host values unchanged', () => {
  const Row = loadComponentLogic('components/common/SettingsActionRow.ets', 'SettingsActionRow', {});
  const row = new Row();
  const events = [];
  row.title = '标题'.repeat(80); row.hint = 'Long help '.repeat(80); row.icon = 'icon';
  row.onAction = () => events.push('action');
  for (const interactive of [false, true, false, true]) {
    row.isInteractive = interactive;
    row.activate();
  }
  assert.deepEqual(events, ['action', 'action']);
  assert.equal(row.title, '标题'.repeat(80)); assert.equal(row.hint, 'Long help '.repeat(80));
  assert.equal(row.icon, 'icon');
});

test('all directory, group, maintenance and help icons resolve to matching light and dark vectors', () => {
  const ids = new Set([...SETTINGS_ENTRIES, ...SETTINGS_GROUPS].map(item => item.id));
  for (const group of SETTINGS_GROUPS.filter(group => ['data', 'help'].includes(group.id))) {
    for (const item of group.items) ids.add(item.id);
  }
  // 包括新增文件中的字面量调用，避免新的设置项悄悄使用缺省图标。
  for (const name of readdirSync(new URL('components/settings/', root)).filter(name => name.endsWith('.ets'))) {
    for (const match of read('components/settings/' + name).matchAll(/settingsIcon\('([^']+)'\)/g)) ids.add(match[1]);
  }
  for (const id of ids) {
    assert.ok(iconsSource.includes(`case '${id}':`), `missing explicit semantic icon: ${id}`);
    const name = settingsIcon(id).replace('app.media.', '');
    const variants = ['base', 'dark'].map(theme => readFileSync(
      new URL(`../../entry/src/main/resources/${theme}/media/${name}.svg`, import.meta.url), 'utf8'));
    assert.match(variants[0], /stroke="#000000"/); assert.match(variants[1], /stroke="#E7ECF3"/);
    assert.equal(variants[0].replace('#000000', '#E7ECF3'), variants[1], `${id}: theme geometry differs`);
    assert.match(variants[0], /viewBox="0 0 24 24"/);
  }
  assert.equal(settingsIcon('sync'), settingsIcon('auto_sync'));
  assert.equal(settingsIcon('import'), 'app.media.ic_home_import');
  assert.equal(settingsIcon('help_bury'), 'app.media.ic_study_bury');
});

test('directory and same-semantic setting entries have one row, icon and spacing owner', () => {
  for (const path of ['components/settings/DataActionRow.ets', 'components/settings/AboutSettings.ets',
    'components/settings/术语分组.ets', 'components/设置面板.ets']) {
    const source = read(path);
    assert.match(source, /SettingsActionRow\(\{/);
    assert.doesNotMatch(source, /DisclosureChevron\(/, `${path}: copied setting entry row`);
  }
  const row = read('components/common/SettingsActionRow.ets');
  assert.match(row, /ActionIcon\(\{/); assert.match(row, /DisclosureChevron\(\{/);
  assert.match(row, /HelpLabel\(\{ title: this.title, onHelp: this.onHelp \}\)/);
  assert.doesNotMatch(row, /padding\(\{ left:|margin\(|offset\(/, 'host owns horizontal gutters and safe areas');
  assert.doesNotMatch(row, /\.height\(/, 'long content must grow');
  assert.match(read('components/common/ActionIcon.ets'), /glyphSize: number = 18/);
  assert.match(read('components/common/ActionIcon.ets'), /\.width\(this.glyphSize\)\.height\(this.glyphSize\)\.flexShrink\(0\)/);
  assert.match(read('components/common/MenuItem.ets'), /ActionIcon\(\{/);
  for (const name of readdirSync(new URL('components/settings/', root)).filter(name => name.endsWith('.ets'))) {
    const source = read('components/settings/' + name);
    if (name === '外观分组.ets') {
      assert.equal((source.match(/\bSelect\(/g) ?? []).length, 1, 'only the color swatch selector retains native geometry');
      assert.match(source, /linearGradient\(/); assert.match(source, /themeSelectionRevision/);
    } else {
      assert.doesNotMatch(source, /\bSelect\(/, `${name}: copied ordinary selection row`);
    }
  }
});
