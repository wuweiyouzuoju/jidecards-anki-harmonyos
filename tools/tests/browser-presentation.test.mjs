import { BrowserSearchSession, loadBrowserRows } from '../../entry/src/main/ets/model/BrowserSearchSession.ts';
// SPDX-License-Identifier: AGPL-3.0-or-later
import { BrowserOperationController } from '../../entry/src/main/ets/model/BrowserOperationController.ts';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import test from 'node:test';
import { BrowserColumnSorting, SearchNodeCardState, makeCardStateNode, makeParsableTextNode }
  from '../../entry/src/main/ets/proto/messages/SearchMessages.ts';
import { browserFilterNode } from '../../entry/src/main/ets/model/BrowserQuickFilter.ts';
import { ConfigKeyBool } from '../../entry/src/main/ets/proto/messages/ConfigMessages.ts';

const source = readFileSync(new URL('../../entry/src/main/ets/pages/浏览页.ets', import.meta.url), 'utf8');
const names = ['执行搜索', '预加载行', 'sortableColumns', 'sortLabel', 'sortOptions', 'sortIndex', 'selectSort', '切换模式', 'resultCountLabel'];
const methods = names.map(name => {
  const start = source.search(new RegExp(`  private (?:async )?${name}\\(`));
  assert.ok(start >= 0, name);
  return source.slice(start, source.indexOf('\n  }', start) + 4);
});
const Page = new Function('loadBrowserRows', '后端会话', 'BrowserColumnSorting', 'SearchNodeCardState', 'makeCardStateNode',
  'makeParsableTextNode', 'browserFilterNode', 'ConfigKeyBool', '$r', 'console',
  stripTypeScriptTypes(`class Page { ${methods.join('\n')} }`, { mode: 'transform' }) + '; return Page;')(
  loadBrowserRows, { 获取实例: () => ({ 确保已打开: async () => {} }) }, BrowserColumnSorting,
  SearchNodeCardState, makeCardStateNode, makeParsableTextNode, browserFilterNode, ConfigKeyBool, key => key, { info() {} });

function harness(notes = false) {
  const page = new Page();
  const calls = [];
  Object.assign(page, {
    editorSession: { close() {} }, operations: new BrowserOperationController(), 关闭卡片信息() {}, editorVersion: 0, mappingVersion: 0, searchVersion: 0, 浏览模式值: notes ? 'notes' : 'cards', 搜索文本: '',
    sortColumn: '', sortReverse: false, 列定义: [], 行列表: [], 结果ID列表: [],
    suspendedRowIds: new Set(), 取能力上下文: () => ({ filesDir: '/collection' }),
    取本地化文案: key => key, 退出多选() {},
    配置服务实例: { 设置配置布尔: async value => { calls.push(['mode', value]); } },
    搜索服务实例: {
      全部浏览器列: async () => ({ columns: [
        { key: 'deck', cardsModeLabel: 'Deck', notesModeLabel: 'Decks', sortingCards: 1, sortingNotes: 1 },
        { key: 'cardDue', cardsModeLabel: 'Due', notesModeLabel: '', sortingCards: 1, sortingNotes: 0 },
        { key: 'noteCrt', cardsModeLabel: 'Created', notesModeLabel: 'Created', sortingCards: 2, sortingNotes: 2 },
        { key: 'answer', cardsModeLabel: 'Answer', notesModeLabel: 'Answer', sortingCards: 0, sortingNotes: 0 }
      ] }),
      设置激活浏览器列: async keys => { calls.push(['columns', keys]); },
      构建搜索串: async node => node.kind === 'card_state' ? 'is:suspended' : node.text,
      搜索卡片: async request => { calls.push(['cards', request]); return request.search === 'is:suspended' ? [11] : [11, 12]; },
      搜索笔记: async request => { calls.push(['notes', request]); return request.search === 'is:suspended' ? [21] : [21, 22]; },
      浏览器行按ID: async id => { calls.push(['row', id]); return { cells: [], color: 3 }; }
    }
  });
  page.searchSession = new BrowserSearchSession({
    open: async () => {}, setNotesMode: value => page.配置服务实例.设置配置布尔({key: 0, value, undoable: false}),
    columns: () => page.搜索服务实例.全部浏览器列(), activateColumns: keys => page.搜索服务实例.设置激活浏览器列(keys),
    buildSearch: node => page.搜索服务实例.构建搜索串(node),
    search: (request, notes) => notes ? page.搜索服务实例.搜索笔记(request) : page.搜索服务实例.搜索卡片(request),
    row: id => page.搜索服务实例.浏览器行按ID(id)
  });
  return { page, calls };
}

test('flagged suspended cards retain both flag color and explicit suspension state', async () => {
  const { page } = harness();
  await page.执行搜索();
  assert.equal(page.阶段, 'list');
  assert.deepEqual(page.行列表.map(row => [row.id, row.color, row.hasSuspendedCards]),
    [[11, 3, true], [12, 3, false]]);
});

test('notes mode uses note IDs and configures row interpretation before loading', async () => {
  const { page, calls } = harness(true);
  await page.执行搜索();
  assert.deepEqual(calls[0], ['mode', { key: 0, value: true, undoable: false }]);
  assert.equal(calls.some(call => call[0] === 'cards'), false);
  assert.deepEqual(page.行列表.map(row => [row.id, row.hasSuspendedCards]), [[21, true], [22, false]]);
});

test('sorting is sent to the backend for the full result set and excludes unsupported columns', async () => {
  const { page, calls } = harness();
  page.sortColumn = 'noteCrt'; page.sortReverse = true;
  await page.执行搜索();
  assert.deepEqual(calls.find(call => call[0] === 'cards')[1].order,
    { kind: 'builtin', column: 'noteCrt', reverse: true });
  assert.equal(page.sortLabel(), 'Created ↑');
  assert.deepEqual(page.sortableColumns().map(column => column.key), ['deck', 'cardDue', 'noteCrt']);
  page.sortColumn = 'cardDue';
  page.执行搜索 = () => {};
  page.切换模式('notes');
  assert.equal(page.sortColumn, '');
  assert.equal(page.sortReverse, false);
  assert.deepEqual(page.sortableColumns().map(column => column.key), ['deck', 'noteCrt']);
});

test('old pagination cannot append rows after a new search starts', async () => {
  const { page } = harness();
  let resolveRow;
  page.搜索服务实例.浏览器行按ID = () => new Promise(resolve => { resolveRow = resolve; });
  const oldLoad = page.预加载行([11], 0);
  await new Promise(setImmediate);
  page.searchVersion = 1;
  page.行列表 = [{ id: 21 }];
  resolveRow({ cells: [], color: 0 });
  await oldLoad;
  assert.deepEqual(page.行列表, [{ id: 21 }]);
});

test('sort dropdown roundtrips both directions in cards and notes modes and restores default', async () => {
  for (const notes of [false, true]) {
    const { page } = harness(notes);
    await page.执行搜索();
    let searches = 0;
    page.执行搜索 = () => { searches++; };
    const options = page.sortOptions();
    const columns = page.sortableColumns();
    assert.equal(options.length, 1 + columns.length * 2);
    assert.equal(page.sortIndex(), 0);
    columns.forEach((column, index) => {
      for (const descending of [false, true]) {
        const selected = 1 + index * 2 + Number(descending);
        page.selectSort(selected);
        assert.equal(page.sortColumn, column.key);
        assert.equal(page.sortReverse,
          ((notes ? column.sortingNotes : column.sortingCards) === BrowserColumnSorting.SORTING_DESCENDING) !== descending);
        assert.equal(page.sortIndex(), selected);
        assert.equal(page.sortLabel(), options[selected].value);
      }
    });
    page.selectSort(0);
    assert.equal(page.sortColumn, '');
    assert.equal(page.sortReverse, false);
    assert.equal(page.sortIndex(), 0);
    assert.equal(searches, options.length);
  }
});

test('suspension lookup failure is visible instead of falsely labelling all cards active', async () => {
  const { page } = harness();
  page.搜索服务实例.搜索卡片 = async request => {
    if (request.search === 'is:suspended') { throw new Error('backend failed'); }
    return [11];
  };
  await page.执行搜索();
  assert.equal(page.阶段, 'error');
  assert.equal(page.错误详情, 'backend failed');
});
