// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { loadPlatformModule } from './platform-module-harness.mjs';
import { parseBrowserSavedSearches, loadBrowserSidebar, removeBrowserSavedSearch, serializeBrowserSavedSearches, upsertBrowserSavedSearch } from '../../entry/src/main/ets/model/BrowserSidebar.ts';
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };

test('saved searches reject malformed entries individually without losing valid siblings', () => {
  assert.deepEqual(parseBrowserSavedSearches(JSON.stringify([null, 1, {}, { name: 3, search: 'x' },
    { name: 'valid', search: 'tag:one', extra: true }, { name: '', search: 'x' }])), [{ name: 'valid', search: 'tag:one' }]);
  assert.deepEqual(parseBrowserSavedSearches('broken'), []); assert.deepEqual(parseBrowserSavedSearches('{}'), []);
});
test('saved searches use the Anki savedFilters map and preserve CRUD semantics', () => {
  const items = parseBrowserSavedSearches('{"Due":"is:due","Marked":"tag:marked"}');
  assert.deepEqual(items, [{ name: 'Due', search: 'is:due' }, { name: 'Marked', search: 'tag:marked' }]);
  assert.deepEqual(JSON.parse(serializeBrowserSavedSearches(items)), { Due: 'is:due', Marked: 'tag:marked' });
  assert.equal(upsertBrowserSavedSearch(items, 'Due', 'is:new').ok, false);
  const renamed = upsertBrowserSavedSearch(items, 'Today', 'is:due', 'Due');
  assert.equal(renamed.ok, true);
  if (renamed.ok) assert.deepEqual(renamed.items, [{ name: 'Today', search: 'is:due' }, { name: 'Marked', search: 'tag:marked' }]);
  const removed = removeBrowserSavedSearch(items, 'Marked');
  assert.equal(removed.ok, true);
});

function savedSearchAdapter(initialConfig = {}) {
  const config = structuredClone(initialConfig), writes = [];
  const failures = { read: null, write: null };
  const Adapter = loadPlatformModule('backend/AnkiBrowserSidebar.ts', 'AnkiBrowserSidebar', {
    牌组服务: class {}, 标签服务: class {},
    配置服务: class {
      async 获取配置JSON(key) {
        if (failures.read) throw failures.read;
        // Core GetConfigJson rejects absent keys on a collection with no saved searches.
        if (!Object.hasOwn(config, key)) throw new Error('NotFound');
        return JSON.stringify(config[key]);
      }
      async 获取全部配置() {
        if (failures.read) throw failures.read;
        return JSON.stringify(config);
      }
      async 设置配置JSON(request) {
        if (failures.write) throw failures.write;
        writes.push(request);
        config[request.key] = JSON.parse(request.valueJson);
      }
    }
  });
  return { adapter: new Adapter(), reopen: () => new Adapter(), config, writes, failures };
}

test('first saved search initializes missing collection config and survives reopen, rename and delete', async () => {
  const h = savedSearchAdapter({ flagLabels: { '1': '重点' } });
  const empty = parseBrowserSavedSearches(await h.adapter.savedSearches());
  assert.deepEqual(empty, []);
  const saved = upsertBrowserSavedSearch(empty, '重点复习', 'deck:"英语" flag:1');
  assert.equal(saved.ok, true);
  await h.adapter.saveSavedSearches(serializeBrowserSavedSearches(saved.items));
  const reopened = parseBrowserSavedSearches(await h.reopen().savedSearches());
  assert.deepEqual(reopened, [{ name: '重点复习', search: 'deck:"英语" flag:1' }]);
  const renamed = upsertBrowserSavedSearch(reopened, '英语重点', reopened[0].search, reopened[0].name);
  await h.adapter.saveSavedSearches(serializeBrowserSavedSearches(renamed.items));
  const removed = removeBrowserSavedSearch(parseBrowserSavedSearches(await h.adapter.savedSearches()), '英语重点');
  await h.adapter.saveSavedSearches(serializeBrowserSavedSearches(removed.items));
  assert.deepEqual(parseBrowserSavedSearches(await h.reopen().savedSearches()), []);
  assert.deepEqual(h.config.flagLabels, { '1': '重点' });
  assert.ok(h.writes.every(write => write.key === 'savedFilters' && write.undoable === false));
});

function savedSearchPage(adapter) {
  const source = readFileSync(new URL('../../entry/src/main/ets/pages/浏览页.ets', import.meta.url), 'utf8');
  const start = source.indexOf('  private async 提交保存搜索(');
  const method = source.slice(start, source.indexOf('\n  }', start) + 4);
  const Page = new Function('parseBrowserSavedSearches', 'upsertBrowserSavedSearch', 'serializeBrowserSavedSearches',
    'showToastSafely', '$r', stripTypeScriptTypes(`class Page { ${method} }`, { mode: 'transform' }) + ';return Page;')(
    parseBrowserSavedSearches, upsertBrowserSavedSearch, serializeBrowserSavedSearches, () => {}, key => key);
  return Object.assign(new Page(), { sidebarBackend: adapter, 保存搜索忙碌: false, 显示保存搜索: true,
    保存搜索编辑项: null, 保存搜索初始查询: 'is:due', 保存搜索错误: '', 已保存搜索列表: [],
    operations: { isAlive: () => true }, 取本地化文案: key => key, getUIContext: () => ({}) });
}

test('save-search page creates first search, preserves existing searches and can reload its result', async () => {
  const h = savedSearchAdapter(), page = savedSearchPage(h.adapter);
  await page.提交保存搜索('今日到期');
  assert.equal(page.保存搜索错误, '');
  assert.equal(page.显示保存搜索, false);
  assert.equal(page.保存搜索忙碌, false);
  page.显示保存搜索 = true;
  page.保存搜索初始查询 = 'flag:1';
  await page.提交保存搜索('重点');
  assert.deepEqual(page.已保存搜索列表, [
    { name: '今日到期', search: 'is:due' }, { name: '重点', search: 'flag:1' }
  ]);
  assert.deepEqual(parseBrowserSavedSearches(await h.reopen().savedSearches()), page.已保存搜索列表);
});

test('save-search read and write failures retain the dialog for retry without overwriting existing searches', async () => {
  const h = savedSearchAdapter({ savedFilters: { Existing: 'is:new' } }), page = savedSearchPage(h.adapter);
  h.failures.read = new Error('collection unavailable');
  await assert.rejects(h.adapter.savedSearches(), /collection unavailable/);
  await page.提交保存搜索('今日到期');
  assert.equal(page.保存搜索错误, 'app.string.browser_saved_search_save_error');
  assert.equal(page.显示保存搜索, true);
  assert.equal(h.writes.length, 0);
  h.failures.read = null;
  h.failures.write = new Error('disk failure');
  await page.提交保存搜索('今日到期');
  assert.equal(page.显示保存搜索, true);
  assert.equal(page.保存搜索忙碌, false);
  assert.deepEqual(h.config.savedFilters, { Existing: 'is:new' });
  h.failures.write = null;
  await page.提交保存搜索('今日到期');
  assert.equal(page.显示保存搜索, false);
  assert.equal(page.保存搜索错误, '');
  assert.deepEqual(h.config.savedFilters, { Existing: 'is:new', 今日到期: 'is:due' });
});
test('sidebar tolerates missing preferences independently and retains cached decks without rereading', async () => {
  const cached = { id: 1 }, backend = { decks: async () => { throw new Error('should not read'); },
    tags: async () => { throw new Error('tags unavailable'); }, savedSearches: async () => '[]',
    collapsed: async key => { if (key === 2) throw new Error('missing'); return true; } };
  const result = await loadBrowserSidebar(backend, cached);
  assert.equal(result.decks, cached); assert.equal(result.tags, null); assert.deepEqual(result.errors, ['tags unavailable']);
  assert.equal(result.collapsed.length, 3);
});
test('home deck customization snapshots accepted inputs and reports background failure separately', async () => {
  const gate = deferred(), events = [];
  const Commands = loadPlatformModule('backend/HomeDeckCommands.ets', 'HomeDeckCommands', {
    牌组服务: class {}, 保存牌组别名: async (id, alias) => { events.push(['alias', id, alias]); await gate.promise; },
    保存牌组背景图: async (id, pixels) => { events.push(['image', id, pixels]); throw new Error('disk'); },
    清除牌组背景图: async () => events.push('remove')
  });
  const pixels = {}, intent = { 新名: 'alias', 背景动作: 'replace', 背景像素图: pixels };
  const pending = new Commands().customize('10', 'original', '', intent);
  intent.背景动作 = 'remove'; intent.背景像素图 = null; gate.resolve();
  assert.equal(await pending, false); assert.deepEqual(events, [['alias', '10', 'alias'], ['image', '10', pixels]]);
});
test('home deck creation opens collection, creates and remembers the returned ID before resolving', async () => {
  const events = [];
  const Commands = loadPlatformModule('backend/HomeDeckCommands.ets', 'HomeDeckCommands', {
    后端会话: { 获取实例: () => ({ 确保已打开: async dir => events.push(['open', dir]) }) },
    牌组服务: class { async 创建牌组(name) { events.push(['create', name]); return 45; } },
    保存上次牌组ID: async id => events.push(['remember', id])
  });
  assert.equal(await new Commands().create('/files', 'Deck'), 45);
  assert.deepEqual(events, [['open', '/files'], ['create', 'Deck'], ['remember', '45']]);
});
test('shared export workflow keeps deck/collection formats, options and picker cancellation semantics', async () => {
  const events = [];
  const run = loadPlatformModule('backend/DataExportWorkflow.ets', 'exportPersonalData', {
    导出牌组: async (...args) => { events.push(['deck', ...args]); return 'deck.tmp'; },
    导出集合: async (...args) => { events.push(['collection', ...args]); return 'collection.tmp'; },
    完成导出: async (...args) => { events.push(['save', ...args]); return null; }
  });
  const context = { filesDir: '/files' }, options = { withMedia: true };
  assert.equal(await run(context, {kind: 'exportDeck', deckId: 5, options}, stage => events.push(['stage', stage])), null);
  assert.deepEqual(events, [['deck', '/files', 5, options], ['stage', 1], ['save', context, 'deck.tmp', 'jidecards-deck.apkg', '.apkg']]);
  events.length = 0;
  await run(context, {kind: 'exportPersonalData', options}, stage => events.push(['stage', stage]));
  assert.deepEqual(events, [['collection', '/files', options], ['stage', 1], ['save', context, 'collection.tmp', 'jidecards-data.colpkg', '.colpkg']]);
});
// These tests execute production adapters/models; the page is only the ArkUI boundary.
test('late sidebar results cannot overwrite a closed or reopened drawer', async () => {
  const { readFileSync } = await import('node:fs'); const { stripTypeScriptTypes } = await import('node:module');
  const source = readFileSync(new URL('../../entry/src/main/ets/pages/浏览页.ets', import.meta.url), 'utf8');
  const start = source.indexOf('  private async 打开侧边栏(');
  const method = source.slice(start, source.indexOf('\n  }', start) + 4);
  const Page = new Function('loadBrowserSidebar', '$r', stripTypeScriptTypes(`class Page { ${method} }`, {mode:'transform'}) + ';return Page;')(loadBrowserSidebar, key => key);
  const old = deferred(), fresh = deferred(); let request = 0;
  const page = Object.assign(new Page(), { operations: { isAlive: () => true }, sidebarVersion: 0, 牌组树: {id:1},
    取本地化文案: key => key, sidebarBackend: { tags: () => ++request === 1 ? old.promise : fresh.promise,
      savedSearches: async () => '[]', collapsed: async () => false } });
  const first = page.打开侧边栏(); page.显示侧边栏 = false;
  const second = page.打开侧边栏(); fresh.resolve({name:'new'}); await second;
  old.resolve({name:'old'}); await first; assert.equal(page.标签树.name, 'new');
  page.sidebarBackend.tags = async () => ({name:'closed'});
  const closing = page.打开侧边栏(); page.显示侧边栏 = false; await closing; assert.equal(page.标签树.name, 'new');
});
