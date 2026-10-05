// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import * as appearance from '../../entry/src/main/ets/model/DeckListAppearance.ts';
const { deckListOverflows, DECK_LIST_NARROW_KEY, DECK_WIDTH_HINT_HANDLED_KEY, DECK_DOUBLE_COLUMN_HINT_HANDLED_KEY } = appearance;
import { localPreferenceApi } from './local-preference-harness.mjs';
import { 应用尺寸 } from '../../entry/src/main/ets/utils/应用尺寸.ets';
import { loadComponentLogic, loadPlatformModule } from './platform-module-harness.mjs';

test('overflow uses visible row count and measured viewport, including a clipped last row', () => {
  assert.equal(deckListOverflows(0, 92, 12, 300), false);
  assert.equal(deckListOverflows(4, 92, 12, 0), false, 'unmeasured is not overflow');
  assert.equal(deckListOverflows(3, 92, 12, 300), false, 'exact fit');
  assert.equal(deckListOverflows(3, 92, 12, 299), true, 'one pixel sliver still overflows');
  assert.equal(deckListOverflows(4, 92, 12, 400), true);
  assert.equal(deckListOverflows(4, 60, 8, 400), false);
  assert.equal(deckListOverflows(4, 92, 12, 600), false, 'rotation can remove overflow');
});

test('list reports insert, collapse, resize and density changes, and releases its listener', () => {
  class Source {
    count = 3;
    listeners = new Set();
    totalCount() { return this.count; }
    snapshotDecks() { return Array.from({length:this.count}, (_,index) => ({id:String(index),ancestorIds:[]})); }
    registerDataChangeListener(listener) { this.listeners.add(listener); }
    unregisterDataChangeListener(listener) { this.listeners.delete(listener); }
    replaceCount(count) { this.count = count; for (const l of this.listeners) l.onDataReloaded(); }
  }
  const List = loadComponentLogic('components/home/主页牌组列表.ets', '主页牌组列表', {
    ...appearance, 应用尺寸, 牌组列表数据源: Source, Scroller: class {}
  });
  const list = new List();
  const events = [];
  list.onOverflowChange = value => events.push(value);
  list.aboutToAppear();
  list.viewportHeight = 300;
  list.reportOverflow(); assert.equal(events.at(-1), false, 'loading must not prompt');
  list.加载状态 = 'ready'; list.reportOverflow(); assert.equal(events.at(-1), false);
  list.牌组数据源.replaceCount(4); assert.equal(events.at(-1), true, 'import triggers without scrolling');
  list.narrow = true; list.reportOverflow(); assert.equal(events.at(-1), false);
  list.narrow = false; list.reportOverflow(); assert.equal(events.at(-1), true);
  list.牌组数据源.replaceCount(2); assert.equal(events.at(-1), false, 'collapsed/hidden decks do not count');
  list.viewportHeight = 100; list.reportOverflow(); assert.equal(events.at(-1), true);
  list.aboutToDisappear(); assert.equal(events.at(-1), false);
  assert.equal(list.牌组数据源.listeners.size, 0);
  const source = readFileSync(new URL('../../entry/src/main/ets/components/home/主页牌组列表.ets', import.meta.url), 'utf8');
  assert.match(source, /onAreaChange[\s\S]*this\.viewportHeight = Number\(area\.height\);\s*this\.reportOverflow\(\)/);
});

function homeHarness() {
  const source = readFileSync(new URL('../../entry/src/main/ets/pages/首页.ets', import.meta.url), 'utf8').replaceAll('\r\n', '\n');
  const methods = ['presentDeckWidthHint', 'finishDeckWidthHint'].map(name => {
    const start = source.indexOf(name === 'finishDeckWidthHint' ? `  private async ${name}(` : `  private ${name}(`);
    return source.slice(start, source.indexOf('\n  }', start) + 4);
  }).join('\n');
  const events = [];
  let save = async () => { events.push('save-narrow'); };
  let complete = async () => { events.push('handled'); };
  const Home = new Function('$r', 'saveDeckListStyle', 'completeDeckWidthHint', 'isDoubleColumnDeckListStyle', 'showToastSafely', 'DialogAlignment',
    stripTypeScriptTypes(`class Home { ${methods} }`) + '; return Home;')(
      key => key, async value => { assert.equal(value, home.deckWidthHintTarget); await save(); }, () => complete(), appearance.isDoubleColumnDeckListStyle,
      (_ui, message) => events.push(message.message), { Center: 'center' });
  const home = new Home();
  Object.assign(home, { autoSyncStartupReady: true, 加载状态: 'ready', deckListOverflow: true,
    deckListStyle: 'single_wide', deckDoubleColumnHintHandled: false, deckDoubleColumnHintShown: false,
    narrowDeckLayout: false, deckWidthHintHandled: false, deckWidthHintShown: false,
    deckWidthHintSaving: false, homeDisposed: false, nativeDialogOpen: false,
    getUIContext: () => ({ showAlertDialog: dialog => { home.dialog = dialog; } }),
    显示提示: message => events.push(message) });
  return { home, events, failSave: () => { save = async () => { throw Error('disk'); }; },
    failRecord: () => { complete = async () => { throw Error('disk'); }; },
    setSave: fn => { save = fn; } };
}

test('suggestion skips double columns/handled/unready states and displays settings location', () => {
  for (const [key, value] of [['autoSyncStartupReady', false], ['加载状态', 'loading'], ['deckListOverflow', false],
    ['deckListStyle', 'double_narrow'], ['deckWidthHintHandled', true], ['deckWidthHintShown', true]]) {
    const { home } = homeHarness(); home[key] = value;
    assert.equal(home.presentDeckWidthHint(), false, key);
    assert.equal(home.nativeDialogOpen, false);
  }
  const { home } = homeHarness();
  assert.equal(home.presentDeckWidthHint(), true);
  assert.equal(home.nativeDialogOpen, true);
  assert.equal(home.dialog.secondaryButton.value, 'app.string.deck_width_hint_confirm');
  assert.equal(home.presentDeckWidthHint(), false);
  const strings = JSON.parse(readFileSync(new URL('../../entry/src/main/resources/base/element/string.json', import.meta.url), 'utf8')).string;
  assert.match(strings.find(x => x.name === 'deck_width_hint_message').value, /更多 → 设置 → 外观 → 牌组样式/);
});

test('confirm saves immediately; keep-wide and Back only remember the response', async () => {
  for (const useNarrow of [false, true]) {
    const { home, events } = homeHarness(); home.presentDeckWidthHint();
    await home.finishDeckWidthHint(useNarrow);
    assert.deepEqual(events, useNarrow ? ['save-narrow', 'handled'] : ['handled']);
    assert.equal(home.nativeDialogOpen, false);
    assert.equal(home.presentDeckWidthHint(), false);
  }
  const { home, events } = homeHarness(); home.presentDeckWidthHint(); home.dialog.cancel();
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(events, ['handled']);
  const confirmed = homeHarness(); confirmed.home.presentDeckWidthHint();
  confirmed.home.dialog.secondaryButton.action();
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(confirmed.events, ['save-narrow', 'handled']);
  const kept = homeHarness(); kept.home.presentDeckWidthHint();
  kept.home.dialog.primaryButton.action();
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(kept.events, ['handled']);
});

test('save failures are visible and duplicate clicks cannot write twice', async () => {
  const h = homeHarness(); h.failSave(); h.home.presentDeckWidthHint();
  await h.home.finishDeckWidthHint(true);
  assert.deepEqual(h.events, ['app.string.deck_width_save_failed', 'handled']);
  const failedRecord = homeHarness(); failedRecord.failRecord(); failedRecord.home.presentDeckWidthHint();
  await failedRecord.home.finishDeckWidthHint(false);
  assert.deepEqual(failedRecord.events, ['app.string.deck_width_hint_save_failed']);
  assert.equal(failedRecord.home.presentDeckWidthHint(), false);
  const delayed = homeHarness(); let release;
  delayed.setSave(() => new Promise(resolve => { release = resolve; }));
  delayed.home.presentDeckWidthHint();
  const saving = delayed.home.finishDeckWidthHint(true);
  await delayed.home.finishDeckWidthHint(true);
  delayed.home.homeDisposed = true; release(); await saving;
  assert.deepEqual(delayed.events, ['handled'], 'accepted preference write outlives UI');
});

test('prompt response survives restart and failed persistence restores cache', async () => {
  const disk = new Map(), app = new Map([['abilityContext', {}]]);
  let cache = new Map(), fail = false;
  const store = { getSync: (k, d) => cache.get(k) ?? d, putSync: (k, v) => cache.set(k, v),
    flush: async () => { if (fail) throw Error('disk'); for (const [k, v] of cache) disk.set(k, v); } };
  const deps = { ...appearance, ...localPreferenceApi({ setOrCreate: (k, v) => app.set(k, v) }),
    AppStorage: { get: k => app.get(k), setOrCreate: (k, v) => app.set(k, v) },
    preferences: { getPreferencesSync: () => store }, hilog: { warn() {} } };
  const api = loadPlatformModule('utils/DeckListAppearanceStore.ets',
    '({ initializeDeckListAppearance, completeDeckWidthHint })', deps);
  api.initializeDeckListAppearance();
  assert.equal(app.get(DECK_LIST_NARROW_KEY), false);
  assert.equal(app.get(DECK_WIDTH_HINT_HANDLED_KEY), false);
  fail = true; await assert.rejects(api.completeDeckWidthHint(), /disk/);
  assert.equal(cache.get(DECK_WIDTH_HINT_HANDLED_KEY), false);
  fail = false; await api.completeDeckWidthHint();
  cache = new Map(disk); app.delete(DECK_WIDTH_HINT_HANDLED_KEY);
  api.initializeDeckListAppearance();
  assert.equal(app.get(DECK_WIDTH_HINT_HANDLED_KEY), true);
  assert.equal(app.get(DECK_LIST_NARROW_KEY), false, 'remembering dismissal never changes width');
});


test('single narrow overflow reuses the dialog for double narrow independently of the older hint', async () => {
  const { home, events } = homeHarness();
  home.deckListStyle = 'single_narrow'; home.narrowDeckLayout = true;
  home.deckWidthHintHandled = true; home.deckWidthHintShown = true;
  assert.equal(home.presentDeckWidthHint(), true);
  assert.equal(home.dialog.title, 'app.string.deck_double_column_hint_title');
  assert.equal(home.dialog.message, 'app.string.deck_double_column_hint_message');
  assert.equal(home.dialog.primaryButton.value, 'app.string.deck_double_column_hint_keep');
  assert.equal(home.dialog.secondaryButton.value, 'app.string.deck_double_column_hint_confirm');
  assert.equal(home.deckWidthHintTarget, 'double_narrow');
  await home.finishDeckWidthHint(true);
  assert.deepEqual(events, ['save-narrow', 'handled']);
  assert.equal(home.presentDeckWidthHint(), false);
  for (const cancel of ['primaryButton', 'cancel']) {
    const kept = homeHarness(); kept.home.narrowDeckLayout = true; kept.home.deckListStyle = 'single_narrow';
    kept.home.presentDeckWidthHint();
    if (cancel === 'cancel') kept.home.dialog.cancel(); else kept.home.dialog.primaryButton.action();
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(kept.events, ['handled']);
  }
  const handled = homeHarness(); handled.home.deckListStyle = 'single_narrow'; handled.home.deckDoubleColumnHintHandled = true;
  assert.equal(handled.home.presentDeckWidthHint(), false);
});

test('double columns count paired rows and both widths remain scrollable after overflow', () => {
  for (const [height, gap] of [[92,12], [60,8]]) {
    assert.equal(deckListOverflows(6, height, gap, height * 3 + gap * 2, 2), false);
    assert.equal(deckListOverflows(7, height, gap, height * 3 + gap * 2, 2), true);
  }
});

test('two hint responses persist separately without changing the chosen style', async () => {
  const values = new Map([[DECK_WIDTH_HINT_HANDLED_KEY, true]]), app = new Map();
  const AppStorage = { get: () => ({}), setOrCreate: (k, v) => app.set(k, v) };
  const store = {getSync:(k,d) => values.get(k) ?? d,putSync:(k,v) => values.set(k,v),flush:async () => {}};
  const api = loadPlatformModule('utils/DeckListAppearanceStore.ets',
    '({initializeDeckListAppearance, completeDeckWidthHint})', {
      ...appearance, ...localPreferenceApi(AppStorage), AppStorage,
      preferences:{getPreferencesSync:() => store}, hilog:{warn(){}}
    });
  api.initializeDeckListAppearance();
  assert.equal(app.get(DECK_DOUBLE_COLUMN_HINT_HANDLED_KEY), false);
  await api.completeDeckWidthHint(true); api.initializeDeckListAppearance();
  assert.equal(app.get(DECK_WIDTH_HINT_HANDLED_KEY), true);
  assert.equal(app.get(DECK_DOUBLE_COLUMN_HINT_HANDLED_KEY), true);
  assert.equal(app.get(appearance.DECK_LIST_STYLE_KEY), 'single_wide');
});


test('double columns keep a top level deck and all visible descendants as one indivisible group', () => {
  const roots = ['A','A','A','A','B','B','C','D','D'];
  const groups = appearance.groupDeckListRows(roots);
  assert.deepEqual(groups, [
    {rootId:'A',start:0,count:4},{rootId:'B',start:4,count:2},
    {rootId:'C',start:6,count:1},{rootId:'D',start:7,count:2}
  ]);
  assert.deepEqual(groups.flatMap(group => roots.slice(group.start,group.start+group.count)), roots);
  assert.equal(appearance.groupedDeckListOverflows([4,2,1,2],76,8,496), false);
  assert.equal(appearance.groupedDeckListOverflows([4,2,1,2],76,8,495), true);
  assert.equal(appearance.groupedDeckListOverflows([8],76,8,500), true, 'one large tree stays in one column');
  assert.equal(appearance.groupedDeckListOverflows([],76,8,500), false);
  assert.equal(appearance.groupedDeckListOverflows([3,1],76,8,0), false);
});

test('real grouped data source preserves complete subtrees through expansion, collapse and reorder', () => {
  class Source {
    decks = [];
    listeners = new Set();
    totalCount() { return this.decks.length; }
    snapshotDecks() { return this.decks.slice(); }
    registerDataChangeListener(l) { this.listeners.add(l); }
    unregisterDataChangeListener(l) { this.listeners.delete(l); }
    replaceDecks(decks) { this.decks = decks; for (const l of this.listeners) l.onDataReloaded(); }
  }
  const List = loadComponentLogic('components/home/主页牌组列表.ets','主页牌组列表', {
    ...appearance, 应用尺寸, 牌组列表数据源:Source, Scroller:class {}
  });
  const list = new List();
  list.style = 'double_narrow'; list.narrow = true; list.加载状态 = 'ready'; list.viewportHeight = 320;
  const events = []; list.onOverflowChange = overflow => events.push(overflow); list.aboutToAppear();
  const row = (id,ancestorIds=[]) => ({id,ancestorIds});
  const a = [row('A'),row('A1',['A']),row('A11',['A','A1']),row('A2',['A'])];
  const b = [row('B'),row('B1',['B'])];
  list.牌组数据源.replaceDecks([...a,...b]);
  assert.deepEqual(list.groupSource.getData(0).decks.map(x=>x.id),['A','A1','A11','A2']);
  assert.deepEqual(list.groupSource.getData(1).decks.map(x=>x.id),['B','B1']);
  assert.equal(events.at(-1),true,'group A is taller than the viewport, cannot split it');
  list.牌组数据源.replaceDecks([a[0],...b]);
  assert.equal(events.at(-1),false,'collapse reduces the complete group height');
  list.牌组数据源.replaceDecks([...b,...a]);
  assert.deepEqual(list.groupSource.getData(0).decks.map(x=>x.id),['B','B1']);
  assert.deepEqual(list.groupSource.getData(1).decks.map(x=>x.id),['A','A1','A11','A2']);
  assert.equal(list.columnCount(),2);
  list.排序模式中 = true; assert.equal(list.columnCount(),1,'per-deck drag uses the original flat indices');
  list.排序模式中 = false; assert.equal(list.columnCount(),2,'chosen style returns after sorting');
  list.aboutToDisappear(); assert.equal(list.牌组数据源.listeners.size,0);
});
