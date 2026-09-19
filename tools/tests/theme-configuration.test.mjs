// SPDX-License-Identifier: AGPL-3.0-or-later
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import * as catalog from '../../entry/src/main/ets/model/ThemeCatalog.ts';
import * as colors from '../../entry/src/main/ets/model/颜色主题.ets';

const read = path => readFileSync(new URL('../../entry/src/main/ets/' + path, import.meta.url), 'utf8');
const abilitySource = read('entryability/EntryAbility.ets');
const methodNames = ['publishSystemDarkMode', 'refreshSystemDarkMode', 'effectiveDarkMode', 'refreshThemeColors',
  'onConfigurationUpdate', 'onForeground'];
const methods = methodNames.map(name => {
  const start = abilitySource.search(new RegExp(`  (?:private )?${name}\\(`));
  assert.ok(start >= 0, name);
  return abilitySource.slice(start, abilitySource.indexOf('\n  }', start) + 4);
});
const managerJs = stripTypeScriptTypes(read('utils/颜色主题管理器.ets')
  .replace(/^import .*$/gm, '').replace(/^export /gm, ''), { mode: 'transform' });

function harness(mode = 'system', systemDark = false) {
  const store = new Map([['themeMode', mode], ['systemDarkMode', systemDark], ['colorTheme', 'iridescent']]);
  const bars = [], reads = { colorMode: systemDark ? 0 : 1, fail: false };
  const storage = { get: key => store.get(key), setOrCreate: (key, value) => store.set(key, value) };
  const context = { resourceManager: { getConfigurationSync() {
    if (reads.fail) throw new Error('resource manager unavailable');
    return { colorMode: reads.colorMode };
  } } };
  store.set('abilityContext', context);
  const dependencies = { ...catalog, ...colors, AppStorage: storage,
    应用系统栏样式: (_context, dark) => bars.push(dark) };
  const applyColors = new Function(...Object.keys(dependencies), managerJs + '\nreturn 应用颜色主题;')(...Object.values(dependencies));
  const abilityDependencies = { ...dependencies, 应用颜色主题: applyColors,
    ConfigurationConstant: { ColorMode: { COLOR_MODE_DARK: 0, COLOR_MODE_LIGHT: 1, COLOR_MODE_NOT_SET: -1 } },
    resourceManager: { ColorMode: { DARK: 0, LIGHT: 1 } },
    i18n: { System: { getAppPreferredLanguage: () => 'zh-Hans' } },
    刷新桌面卡片数据: async () => {}, hilog: { error() {} }, DOMAIN: 0, APP_FOREGROUND_KEY: 'appForeground' };
  const Ability = new Function(...Object.keys(abilityDependencies),
    stripTypeScriptTypes(`class Ability { ${methods.join('\n')} }`, { mode: 'transform' }) + '\nreturn Ability;')(...Object.values(abilityDependencies));
  const ability = new Ability();
  ability.context = context; ability.同步规避区高度 = () => {};
  return { ability, store, bars, reads };
}

function assertPalette(store, bars, dark) {
  const theme = catalog.themeDefinition('iridescent');
  assert.deepEqual(store.get(catalog.THEME_TEXT_COLORS_KEY), dark ? theme.darkActionColors : theme.lightActionColors);
  assert.deepEqual(store.get(catalog.GLASS_COLORS_KEY), dark ? catalog.GLASS_DARK_COLORS : catalog.GLASS_HIGHLIGHT_COLORS);
  assert.equal(store.get(colors.颜色键.动作主色), colors.解析主题色板('iridescent', dark).动作主色);
  assert.equal(bars.at(-1), dark, 'system bars and button colors must use the same effective mode');
}

test('configuration updates respect explicit app light/dark mode while system mode follows changes', () => {
  for (const mode of ['light', 'dark', 'system', undefined]) {
    const { ability, store, bars } = harness(mode);
    if (mode === undefined) store.delete('themeMode');
    for (const dark of [true, false, true]) {
      ability.onConfigurationUpdate({ colorMode: dark ? 0 : 1 });
      assert.equal(store.get('systemDarkMode'), dark);
      assertPalette(store, bars, mode === 'dark' || (mode !== 'light' && dark));
    }
  }
});

test('language and unspecified-color events do not reset the known system color mode', () => {
  for (const mode of ['light', 'dark', 'system']) {
    const { ability, store, bars } = harness(mode, true);
    for (const colorMode of [undefined, -1]) {
      ability.onConfigurationUpdate({ colorMode, language: 'en-US' });
      assert.equal(store.get('systemDarkMode'), true);
      assert.equal(store.get('系统语言'), 'en');
      assertPalette(store, bars, mode !== 'light');
    }
  }
});

test('foreground repairs a stale palette even when the system change notification was missed', () => {
  for (const mode of ['light', 'dark', 'system']) {
    const { ability, store, bars, reads } = harness(mode, true);
    reads.colorMode = 1;
    store.set(catalog.THEME_TEXT_COLORS_KEY, catalog.themeDefinition('iridescent').darkActionColors);
    ability.onForeground();
    assert.equal(store.get('appForeground'), true);
    assertPalette(store, bars, mode === 'dark');
  }
});

test('temporary resource read failure preserves the known mode on return to foreground', () => {
  const { ability, store, bars, reads } = harness('system', true);
  reads.fail = true;
  ability.onForeground();
  assertPalette(store, bars, true);
});
