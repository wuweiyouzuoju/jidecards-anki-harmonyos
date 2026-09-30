// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { encodeHomeExpansion, decodeHomeExpansion, reconcileHomeExpansion } from '../../entry/src/main/ets/model/HomeDeckExpansion.ts';
import { loadPlatformModule } from './platform-module-harness.mjs';
import { componentMethods, settle } from './sync-panel-harness.mjs';

const home = readFileSync(new URL('../../entry/src/main/ets/pages/首页.ets', import.meta.url), 'utf8');
const decks = [
  { id: 'parent', hasChildren: true, ancestorIds: [] },
  { id: 'child', hasChildren: true, ancestorIds: ['parent'] },
  { id: 'leaf', hasChildren: false, ancestorIds: ['parent', 'child'] }
];
const initial = () => reconcileHomeExpansion(decks, new Set(), new Set(), false);

test('restart remembers mixed or fully collapsed trees; new parents expand and deleted IDs disappear', () => {
  for (const expanded of [new Set(['child']), new Set()]) {
    const saved = decodeHomeExpansion(encodeHomeExpansion({ expanded, known: initial().known }));
    const restored = reconcileHomeExpansion([...decks, { id: 'new', hasChildren: true }], saved.expanded, saved.known, true);
    assert.deepEqual([...restored.expanded], [...expanded, 'new']);
    const deleted = reconcileHomeExpansion(decks.slice(1), restored.expanded, restored.known, true);
    assert.equal(deleted.known.has('parent'), false);
    assert.equal(deleted.expanded.has('new'), false);
  }
  assert.equal(decodeHomeExpansion(''), null);
  assert.deepEqual([...initial().expanded], ['parent', 'child']);
});

test('invalid saved values fail observably instead of silently replacing the preference', () => {
  for (const value of ['null', '{}', 'false', 'broken', '{"version":2,"known":[],"expanded":[]}',
    '{"version":1,"known":[3],"expanded":[]}', '{"version":1,"known":[],"expanded":[""]}']) {
    assert.throws(() => decodeHomeExpansion(value));
  }
  assert.deepEqual([...decodeHomeExpansion('{"version":1,"known":["a","a"],"expanded":["a","deleted"]}').expanded], ['a']);
});

function storeHarness() {
  const cache = new Map(), disk = new Map();
  let release;
  const first = new Promise(resolve => { release = resolve; });
  let flushes = 0, fail = false, active = 0, maxActive = 0;
  const store = {
    getSync: (key, fallback) => cache.get(key) ?? fallback,
    putSync: (key, value) => cache.set(key, value),
    flush: async () => {
      active++; maxActive = Math.max(maxActive, active);
      const snapshot = new Map(cache);
      try {
        if (++flushes === 1) await first;
        if (fail) throw new Error('disk unavailable');
        for (const [key, value] of snapshot) disk.set(key, value);
      } finally { active--; }
    }
  };
  const api = loadPlatformModule('utils/HomeDeckExpansionStore.ets',
    '({ loadHomeDeckExpansion, saveHomeDeckExpansion })', {
      AppStorage: { get: () => ({}) }, preferences: { getPreferencesSync: () => store },
      encodeHomeExpansion, decodeHomeExpansion
    });
  return { ...api, cache, disk, release, setFail: value => { fail = value; }, maxActive: () => maxActive };
}

test('rapid toggles snapshot inputs, serialize disk writes and retain latest state after page recreation', async () => {
  const h = storeHarness();
  assert.equal(h.loadHomeDeckExpansion(), null);
  const first = h.saveHomeDeckExpansion(initial());
  await settle();
  const last = { expanded: new Set(), known: initial().known };
  const second = h.saveHomeDeckExpansion(last);
  last.expanded.add('parent');
  assert.deepEqual([...h.loadHomeDeckExpansion().expanded], []);
  h.release(); await Promise.all([first, second]);
  assert.equal(h.maxActive(), 1);
  h.cache.clear();
  for (const [key, value] of h.disk) h.cache.set(key, value);
  assert.deepEqual([...h.loadHomeDeckExpansion().expanded], []);
  h.setFail(true);
  await assert.rejects(h.saveHomeDeckExpansion(initial()), /disk unavailable/);
  h.setFail(false);
  await h.saveHomeDeckExpansion({ expanded: new Set(['child']), known: initial().known });
  assert.deepEqual([...h.loadHomeDeckExpansion().expanded], ['child']);
});

test('page restores before loading, saves all expansion mutations and does not expand on automatic selection', async () => {
  let saved = { expanded: new Set(), known: initial().known }, failLoad = false;
  const writes = [], warnings = [];
  const Page = componentMethods(home, ['restoreHomeDeckExpansion', 'persistHomeDeckExpansion',
    '切换牌组展开', '递归切换牌组', '展开牌组路径', '尝试恢复上次牌组'], {
    loadHomeDeckExpansion: () => { if (failLoad) throw new Error('unavailable'); return saved; },
    saveHomeDeckExpansion: async state => { writes.push(encodeHomeExpansion(state)); },
    可见牌组行: all => all, 加载上次牌组ID: async () => 'child',
    hilog: { warn: (...args) => warnings.push(args) }
  });
  const page = Object.assign(new Page(), {
    homeExpansionLoaded: false, 牌组展开已初始化: false, 已知牌组ID集合: new Set(),
    主页快照数据: { decks }, 牌组数据源: { replaceAll() {} }, 隐藏的牌组ID集合: new Set(),
    上次牌组已恢复: false, 按ID查牌组: id => decks.find(deck => deck.id === id)
  });
  let expanded = new Set();
  Object.defineProperty(page, '展开的牌组ID集合', {
    get: () => expanded, set: value => { expanded = value; page.persistHomeDeckExpansion(); }
  });
  page.restoreHomeDeckExpansion();
  assert.equal(writes.length, 0);
  assert.equal(page.牌组展开已初始化, true);
  await page.尝试恢复上次牌组();
  assert.equal(page.选中的牌组ID, 'child');
  assert.deepEqual([...expanded], []);
  page.切换牌组展开('parent');
  assert.deepEqual([...decodeHomeExpansion(writes.at(-1)).expanded], ['parent']);
  page.递归切换牌组('parent');
  assert.deepEqual([...decodeHomeExpansion(writes.at(-1)).expanded], []);
  page.递归切换牌组('parent');
  assert.deepEqual([...decodeHomeExpansion(writes.at(-1)).expanded], ['parent', 'child']);
  page.递归切换牌组('parent');
  page.展开牌组路径(decks[2]);
  assert.deepEqual([...decodeHomeExpansion(writes.at(-1)).expanded], ['parent', 'child']);
  page.homeExpansionLoaded = false; failLoad = true;
  const before = writes.length;
  page.restoreHomeDeckExpansion(); page.切换牌组展开('parent');
  assert.equal(writes.length, before); assert.equal(warnings.length, 1);
  assert.match(home, /@State @Watch\('persistHomeDeckExpansion'\) private 展开的牌组ID集合/);
  assert.match(home, /aboutToAppear\(\): void \{\s*this\.restoreHomeDeckExpansion\(\)/);
  assert.ok(home.indexOf('this.已知牌组ID集合 = expansion.known') < home.indexOf('this.展开的牌组ID集合 = expansion.expanded'));
});

test('compact details hide the underlying home without destroying list state or wide-screen measurement', () => {
  const layout = home.slice(home.indexOf('private homeLayout()'), home.indexOf('private homeMenus()'));
  const expression = layout.match(/\.visibility\(([^\n]+)\)/)?.[1];
  assert.ok(expression);
  const visibility = new Function('Visibility', 'return ' + expression);
  for (const breakpoint of ['xs', 'sm', 'md']) {
    for (const open of [false, true]) {
      assert.equal(visibility.call({ 当前断点: breakpoint, 显示牌组详情: open }, { Hidden: 'hidden', Visible: 'visible' }),
        breakpoint === 'xs' && open ? 'hidden' : 'visible');
    }
  }
  assert.match(home, /Stack\(\) \{\s*this\.homeLayout\(\)/);
  assert.match(layout, /onBreakpointChange/);
});
