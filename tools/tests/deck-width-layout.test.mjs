// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import vm from 'node:vm';
import { localPreferenceApi } from './local-preference-harness.mjs';
import { DECK_LIST_NARROW_KEY, DECK_WIDTH_HINT_HANDLED_KEY } from '../../entry/src/main/ets/model/DeckListAppearance.ts';
import { 应用尺寸 } from '../../entry/src/main/ets/utils/应用尺寸.ets';

const read = path => readFileSync(new URL('../../entry/src/main/ets/' + path, import.meta.url), 'utf8');

test('deck width defaults to wide, survives restart and rolls back failed writes', async () => {
  const disk = new Map();
  let cache = new Map(disk);
  const app = new Map([['abilityContext', {}]]);
  let fail = false;
  const context = vm.createContext({
    ...localPreferenceApi({ setOrCreate: (key, value) => app.set(key, value) }),
    DECK_LIST_NARROW_KEY,
    DECK_WIDTH_HINT_HANDLED_KEY,
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
    .replace(/^import .*;\r?\n/gm, '').replace(/export /g, '');
  vm.runInContext(stripTypeScriptTypes(source), context);
  context.initializeDeckListAppearance();
  assert.equal(app.get(DECK_LIST_NARROW_KEY), false);
  await context.saveDeckListNarrow(true);
  app.delete(DECK_LIST_NARROW_KEY);
  cache = new Map(disk);
  context.initializeDeckListAppearance();
  assert.equal(app.get(DECK_LIST_NARROW_KEY), true);
  fail = true;
  await assert.rejects(context.saveDeckListNarrow(false), /disk full/);
  assert.equal(app.get(DECK_LIST_NARROW_KEY), true);
  assert.equal(cache.get(DECK_LIST_NARROW_KEY), true);
  fail = false;
  await context.saveDeckListNarrow(false);
  assert.equal(app.get(DECK_LIST_NARROW_KEY), false);
  cache.set(DECK_LIST_NARROW_KEY, 'true');
  context.initializeDeckListAppearance();
  assert.equal(app.get(DECK_LIST_NARROW_KEY), false, 'corrupt values must keep the original wide layout');
  app.delete('abilityContext');
  await assert.rejects(context.saveDeckListNarrow(true), /Ability context unavailable/);
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
  assert.ok(content.indexOf('this.expansionControl()') < content.indexOf('Text(牌组显示名(this.deck))'));
  const toggle = row.slice(row.indexOf('  private expansionControl()'), row.indexOf('  build() {'));
  assert.match(toggle, /\.width\(this\.narrow \? 24 : 应用尺寸\.箭头槽位宽度\)/);
  assert.match(toggle, /\.rotate\(\{ angle: this\.expanded \? 0 : -90 \}\)/);
  assert.match(toggle, /\.animation\(\{ duration: 150, curve: Curve\.EaseOut \}\)/);
  for (const path of ['components/牌组列表项.ets', 'components/牌组定制面板.ets']) {
    assert.match(read(path), /@StorageProp\(DECK_LIST_NARROW_KEY\)/);
    assert.match(read(path), /\.height\(this\.narrow \? 应用尺寸\.narrowDeckRowHeight : 应用尺寸\.牌组行高度\)/);
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
