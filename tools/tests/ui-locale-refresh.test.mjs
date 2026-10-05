// SPDX-License-Identifier: AGPL-3.0-or-later
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';
import { stripTypeScriptTypes } from 'node:module';
import { loadComponentLogic, loadPlatformModule } from './platform-module-harness.mjs';
import { uiFeedback } from './ui-feedback-harness.mjs';
import { visibleSettingsGroups } from '../../entry/src/main/ets/model/SettingsStructure.ts';
import { DECK_LIST_STYLES, deckListStyleTitleKey } from '../../entry/src/main/ets/model/DeckListAppearance.ts';

const root = new URL('../../entry/src/main/ets/', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8').replaceAll('\r\n', '\n');
const resources = Object.fromEntries(['zh-Hans', 'en'].map(locale => [locale, new Map(JSON.parse(readFileSync(
  new URL(`../../entry/src/main/resources/${locale === 'en' ? 'en_US' : 'base'}/element/string.json`, import.meta.url), 'utf8'))
  .string.map(item => [item.name, item.value]))]));
const $r = name => ({ id: name.slice('app.string.'.length), params: [name] });

test('language and width selectors recalculate real translations while preserving their current state', () => {
  let locale = 'zh-Hans', reads = 0;
  const context = { getHostContext: () => ({ resourceManager: {
    getStringSync: key => resources[locale].get(key), getStringByNameSync: key => resources[locale].get(key)
  } }) };
  const dependencies = { ...uiFeedback, $r, DECK_LIST_STYLES, deckListStyleTitleKey, 当前语言模式: () => locale };
  const General = loadComponentLogic('components/settings/GeneralSettings.ets', 'GeneralSettings', dependencies);
  const Width = loadComponentLogic('components/settings/DeckWidthControl.ets', 'DeckWidthControl', dependencies);
  const general = new General(), width = new Width();
  for (const component of [general, width]) {
    component.getUIContext = () => context;
    Object.defineProperty(component, 'uiLanguage', { get() { reads++; return locale; } });
  }
  const itemText = loadPlatformModule('utils/SettingsStructureText.ets', 'settingsItemText', {
    namedResourceText: uiFeedback.namedResourceText, settingsItem: () => ({ titleKey: 'settings_language' })
  });
  width.style = 'double_narrow'; width.saveFailed = true;
  const zh = [general.语言选项(), width.options()];
  assert.equal(general.语言索引(), 0);
  assert.equal(itemText(context, 'language', locale), resources[locale].get('settings_language'));
  locale = 'en';
  const en = [general.语言选项(), width.options()];
  assert.equal(general.语言索引(), 1);
  assert.equal(itemText(context, 'language', locale), resources[locale].get('settings_language'));
  assert.equal(general.取本地化文本($r('app.string.language_english')), resources.en.get('language_english'));
  assert.deepEqual(en[0].map(item => item.value), ['language_chinese', 'language_english'].map(key => resources.en.get(key)));
  assert.deepEqual(en[1].map(item => item.value), DECK_LIST_STYLES.map(style => resources.en.get(deckListStyleTitleKey(style))));
  assert.equal(en[1].length, 4);
  assert.notDeepEqual(zh, en);
  assert.ok(reads >= 5, 'actual helpers read the observed language on every evaluation');
  assert.equal(width.style, 'double_narrow'); assert.equal(width.saveFailed, true, 'locale refresh keeps local state');
});

test('locale invalidation is separate from resource formatting arguments', () => {
  const calls = [];
  const context = { getHostContext: () => ({ resourceManager: {
    getStringSync: (id, ...args) => { calls.push([id, ...args]); return 'formatted'; },
    getStringByNameSync: (name, ...args) => { calls.push([name, ...args]); return 'named'; }
  } }) };
  assert.equal(uiFeedback.localizedResourceText(context, 'en', { id: 1, params: ['app.string.test', 42] }), 'formatted');
  assert.equal(uiFeedback.localizedNamedResourceText(context, 'zh-Hans', 'test', 'Front', 2), 'named');
  assert.deepEqual(calls, [[1, 42], ['test', 'Front', 2]]);
});

test('theme span builders recreate only their text children on language change', () => {
  let count = 0;
  for (const path of readdirSync(root, { recursive: true }).filter(name => name.endsWith('.ets'))) {
    const source = read(path.replaceAll('\\', '/'));
    for (const call of source.matchAll(/(?:ThemeTextSpans|ThemeHighlightedTextSpans)\(/g)) {
      if (!source.slice(call.index, source.indexOf('\n', call.index)).includes('this.getUIContext()')) continue;
      const before = source.slice(Math.max(0, call.index - 110), call.index);
      assert.match(before, /ForEach\(\[this\.(?:uiLanguage|系统语言)\], \(_locale: string\) => \{\s*$/,
        `${path}: value-parameter span builders must rebuild for a new locale`);
      count++;
    }
  }
  assert.ok(count > 0);
});

test('global review is available only in experimental mode and opens the common help surface', () => {
  assert.ok(!visibleSettingsGroups('scheduler', true, true).some(group => group.id === 'global_review'));
  assert.ok(visibleSettingsGroups('scheduler', false, true).some(group => group.id === 'global_review'));
  assert.ok(visibleSettingsGroups('appearance', true, false).some(group => group.id === 'study_display'));
  const component = read('components/settings/ReviewPreferencesSettings.ets');
  assert.match(component, /帮助正文: this.displayOptions \? null : \$r\('app.string.settings_core_review_help'\)/);
  assert.match(component, /打开说明回调: this.打开说明回调/);
  assert.match(read('components/设置面板.ets'), /ReviewPreferencesSettings\([\s\S]*?this.显示说明浮层 = true/);
  for (const locale of ['zh-Hans', 'en']) assert.ok(resources[locale].get('settings_core_review_help').length > 100);
});

test('cached statistics deck label refreshes without changing the selection or deck names', () => {
  const source = read('pages/统计页.ets');
  assert.match(source, /@StorageProp\('系统语言'\) @Watch\('refreshDeckLocale'\)/);
  const start = source.indexOf('  private refreshDeckLocale(');
  const method = source.slice(start, source.indexOf('\n  }', start) + 4);
  const Host = new Function('resourceText', '$r', stripTypeScriptTypes(`class Host { ${method} }`) + '; return Host;')(
    uiFeedback.resourceText, $r);
  let locale = 'zh-Hans';
  const host = new Host();
  host.getUIContext = () => ({ getHostContext: () => ({ resourceManager: { getStringSync: key => resources[locale].get(key) } }) });
  host.牌组选项 = [{ value: resources[locale].get('stats_deck_all') }, { value: 'My vocabulary' }];
  host.选中牌组索引 = 1;
  const previous = host.牌组选项;
  locale = 'en'; host.refreshDeckLocale();
  assert.equal(host.牌组选项[0].value, resources.en.get('stats_deck_all'));
  assert.equal(host.牌组选项[1].value, 'My vocabulary');
  assert.equal(host.选中牌组索引, 1);
  assert.notEqual(host.牌组选项, previous);
  assert.equal(previous[0].value, resources['zh-Hans'].get('stats_deck_all'), 'replace the UI snapshot instead of mutating the old one');
  host.牌组选项 = []; host.refreshDeckLocale(); assert.deepEqual(host.牌组选项, []);
});

test('default deck localization preserves actual user names and display overrides', () => {
  const source = read('model/主页模型.ets');
  const start = source.indexOf('export function 牌组显示名(');
  const code = source.slice(start, source.indexOf('\n}\n', start) + 2).replace('export ', '');
  const displayName = new Function('AppStorage', stripTypeScriptTypes(code) + '; return 牌组显示名;')({ get: () => 'zh-Hans' });
  const deck = { id: '1', displayName: '', name: 'Default' };
  assert.equal(displayName(deck, 'zh-Hans'), '默认牌组');
  assert.equal(displayName(deck, 'en'), 'Default');
  deck.displayName = 'Custom'; assert.equal(displayName(deck, 'zh-Hans'), 'Custom');
  deck.id = '2'; deck.displayName = ''; deck.name = 'My deck';
  assert.equal(displayName(deck, 'en'), 'My deck');
});
