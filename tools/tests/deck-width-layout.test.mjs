// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import vm from 'node:vm';
import { localPreferenceApi } from './local-preference-harness.mjs';
import * as appearance from '../../entry/src/main/ets/model/DeckListAppearance.ts';
const { DECK_LIST_NARROW_KEY, DECK_LIST_STYLE_KEY, DECK_LIST_STYLES } = appearance;
import { 应用尺寸 } from '../../entry/src/main/ets/utils/应用尺寸.ets';

const read = path => readFileSync(new URL('../../entry/src/main/ets/' + path, import.meta.url), 'utf8');

test('four deck styles migrate old density, survive restart and preserve layout after failed writes', async () => {
  const disk = new Map();
  let cache = new Map(disk);
  const app = new Map([['abilityContext', {}]]);
  let fail = false;
  const context = vm.createContext({
    ...localPreferenceApi({ setOrCreate: (key, value) => app.set(key, value) }),
    ...appearance,
    AppStorage: { get: key => app.get(key), setOrCreate: (key, value) => app.set(key, value) },
    preferences: { getPreferencesSync: () => ({
      getSync: (key, fallback) => cache.get(key) ?? fallback,
      putSync: (key, value) => cache.set(key, value),
      flush: async () => {
        if (fail) throw new Error('disk full');
        for (const [key, value] of cache) disk.set(key, value);
      }
    }) },
    hilog: { warn() {} }
  });
  const source = read('utils/DeckListAppearanceStore.ets')
    .replace(/^import[^;]+;\s*/gm, '').replace(/export /g, '');
  vm.runInContext(stripTypeScriptTypes(source), context);
  context.initializeDeckListAppearance();
  assert.equal(app.get(DECK_LIST_NARROW_KEY), false);
  cache.set(DECK_LIST_NARROW_KEY, true);
  context.initializeDeckListAppearance();
  assert.equal(app.get(DECK_LIST_STYLE_KEY), 'single_narrow', 'old narrow preference migrates');
  for (const style of DECK_LIST_STYLES) {
    await context.saveDeckListStyle(style);
    cache = new Map(disk);
    context.initializeDeckListAppearance();
    assert.equal(app.get(DECK_LIST_STYLE_KEY), style);
    assert.equal(app.get(DECK_LIST_NARROW_KEY), appearance.isNarrowDeckListStyle(style));
  }
  fail = true;
  await assert.rejects(context.saveDeckListStyle('single_wide'), /disk full/);
  assert.equal(app.get(DECK_LIST_STYLE_KEY), 'double_narrow');
  assert.equal(cache.get(DECK_LIST_STYLE_KEY), 'double_narrow');
  assert.equal(app.get(DECK_LIST_NARROW_KEY), true);
  fail = false;
  await assert.rejects(context.saveDeckListStyle('triple_wide'), /invalid_setting_value/);
  await assert.rejects(context.saveDeckListStyle('single_wide', 'double_wide'), /setting_changed_since_proposal/);
  cache.set(DECK_LIST_STYLE_KEY, 'broken');
  context.initializeDeckListAppearance();
  assert.equal(app.get(DECK_LIST_STYLE_KEY), 'single_wide');
  app.delete('abilityContext');
  await assert.rejects(context.saveDeckListStyle('single_narrow'), /Ability context unavailable/);
});

test('narrow rows keep symmetric padding, fit the expand target and share crop height', () => {
  const row = read('components/牌组列表项.ets');
  const padding = row.match(/\.padding\(\{\s*left: (\(this\.narrow[\s\S]*?)\n\s*\}\)/)[1];
  const evaluatePadding = new Function('应用尺寸', `return { left: ${padding} };`);
  for (const narrow of [false, true]) {
    const root = evaluatePadding.call({ narrow, deck: { depth: 0 } }, 应用尺寸);
    const child = evaluatePadding.call({ narrow, deck: { depth: 1 } }, 应用尺寸);
    assert.equal(root.left, root.right);
    assert.equal(root.top, root.bottom);
    assert.equal(child.left - root.left, 应用尺寸.间距_16);
    assert.equal(child.right, root.right);
    const height = narrow ? 应用尺寸.narrowDeckRowHeight : 应用尺寸.牌组行高度;
    assert.ok(height >= 应用尺寸.箭头槽位高度 + root.top + root.bottom);
  }
  assert.ok(应用尺寸.narrowDeckRowHeight < 应用尺寸.牌组行高度);
  assert.match(row, /if \(!this\.narrow\) \{\s*Column\(\)\s*\.width\(应用尺寸\.色条宽度\)/);
  assert.match(row, /if \(!this\.narrow \|\| this\.deck\.description\.trim\(\)\.length > 0\)/);
  const content = row.slice(row.indexOf('  build() {'));
  assert.equal(content.match(/this\.expansionControl\(\)/g)?.length, 1);
  assert.match(content, /Row\(\{ space: this\.narrow[^\n]+\n\s*\/\/[^\n]+\n\s*this\.expansionControl\(\)/);
  assert.ok(content.indexOf('this.expansionControl()') < content.indexOf('Text(牌组显示名(this.deck, this.uiLanguage))'));
  const toggle = row.slice(row.indexOf('  private expansionControl()'), row.indexOf('  build() {'));
  assert.match(toggle, /\.width\(this\.narrow \? 24 : 应用尺寸\.箭头槽位宽度\)/);
  assert.match(toggle, /DisclosureChevron\(\)/);
  assert.match(toggle, /\.rotate\(\{ angle: this\.expanded \? 90 : 0 \}\)/);
  assert.match(toggle, /\.animation\(\{ duration: 150, curve: Curve\.EaseOut \}\)/);
  for (const path of ['components/牌组列表项.ets', 'components/牌组定制面板.ets']) {
    assert.match(read(path), /@StorageProp\(DECK_LIST_NARROW_KEY\)/);
    assert.match(read(path), /\.height\(应用尺寸\.deckRowHeight\(this\.narrow,/);
  }
  const list = read('components/home/主页牌组列表.ets');
  assert.match(list, /@StorageProp\(DECK_LIST_NARROW_KEY\)/);
  assert.match(list, /@Prop\s+展开的牌组ID集合: Set<string>/,
    'plain fields do not propagate expansion changes to existing lazy rows');
  assert.match(list, /expanded: this\.展开的牌组ID集合\.has\(deck\.id\)/);
  const keyGenerator = list.match(/\}, \(deck: 牌组汇总\) => `([^`]+)`/)[1];
  assert.doesNotMatch(keyGenerator, /展开|expanded/,
    'toggling expansion must preserve the row and its animated triangle');
  assert.match(read('components/settings/外观分组.ets'), /DeckWidthControl\(\)/);
  assert.match(read('entryability/EntryAbility.ets'), /initializeDeckListAppearance\(\);/);
});


test('deck style selector exposes four localized options and saves each actual value', async () => {
  const { loadComponentLogic } = await import('./platform-module-harness.mjs');
  for (const locale of ['base', 'en_US']) {
    const resources = new Map(JSON.parse(readFileSync(new URL(
      `../../entry/src/main/resources/${locale}/element/string.json`, import.meta.url), 'utf8')).string.map(x => [x.name, x.value]));
    const saves = [];
    let fail = false;
    const Control = loadComponentLogic('components/settings/DeckWidthControl.ets', 'DeckWidthControl', {
      ...appearance, localizedNamedResourceText: (_ui, _locale, key) => resources.get(key),
      saveDeckListStyle: async style => { if (fail) throw Error('disk'); saves.push(style); }
    });
    const control = new Control(); control.getUIContext = () => ({});
    assert.deepEqual(control.options().map(x => x.value), DECK_LIST_STYLES.map(style => resources.get(appearance.deckListStyleTitleKey(style))));
    for (let index = 0; index < DECK_LIST_STYLES.length; index++) {
      control.style = 'previous'; await control.selectWidth(index);
      assert.equal(saves.at(-1), DECK_LIST_STYLES[index]);
    }
    const count = saves.length;
    control.style = 'double_narrow'; await control.selectWidth(3); await control.selectWidth(4);
    assert.equal(saves.length, count);
    fail = true; await control.selectWidth(0);
    assert.equal(control.saveFailed, true); assert.equal(control.saving, false);
    assert.equal(control.style, 'double_narrow');
  }
  const list = read('components/home/主页牌组列表.ets');
  assert.match(list, /\.lanes\(this\.columnCount\(\), 应用尺寸\.页面分组间距\(this\.narrow\)\)/);
  assert.match(list, /hideStudyCounts: isDoubleColumnDeckListStyle\(this\.style\)/);
  assert.match(read('components/牌组列表项.ets'), /if \(!this\.hideStudyCounts\) \{[\s\S]*deck_new_short[\s\S]*deck_learning_short[\s\S]*deck_review_short/);
});


test('both double column densities fit two name lines plus description and symmetric padding', () => {
  const source = read('components/牌组列表项.ets');
  assert.match(source, /maxLines\(this\.hideStudyCounts \? 2 : 1\)/);
  for (const narrow of [false, true]) {
    const nameHeight = 2 * (narrow ? 20 : 22);
    const contentHeight = nameHeight + (narrow ? 3 : 5) + 16;
    assert.ok(应用尺寸.deckRowHeight(narrow, true) >= contentHeight + 2 * (narrow ? 6 : 13));
    assert.equal(应用尺寸.deckRowHeight(narrow, false), narrow ? 60 : 92);
  }
});
