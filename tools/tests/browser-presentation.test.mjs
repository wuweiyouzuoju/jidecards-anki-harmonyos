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
import { browserActiveColumns, defaultBrowserPreferences } from '../../entry/src/main/ets/model/BrowserPreferences.ts';
import { loadComponentLogic } from './platform-module-harness.mjs';
import { AppInterfaceTracker } from '../../entry/src/main/ets/model/AppInterface.ts';

const source = readFileSync(new URL('../../entry/src/main/ets/pages/浏览页.ets', import.meta.url), 'utf8');
const names = ['执行搜索', '加载更多', 'sortableColumns', 'sortDescending', 'sortLabel', 'sortOptions', 'sortIndex', 'selectSort', '切换模式', 'resultCountLabel',
  'viewControlsAvailable', 'openViewMenu', 'openBrowserFilter', '行点击处理', '打开预览'];
const methods = names.map(name => {
  const start = source.search(new RegExp(`  private (?:async )?${name}\\(`));
  assert.ok(start >= 0, name);
  return source.slice(start, source.indexOf('\n  }', start) + 4);
});
const Page = new Function('loadBrowserRows', '后端会话', 'BrowserColumnSorting', 'SearchNodeCardState', 'makeCardStateNode',
  'makeParsableTextNode', 'browserFilterNode', 'ConfigKeyBool', 'browserActiveColumns', '$r', 'console', 'resourceText',
  stripTypeScriptTypes(`class Page { ${methods.join('\n')} }`, { mode: 'transform' }) + '; return Page;')(
  loadBrowserRows, { 获取实例: () => ({ 确保已打开: async () => {} }) }, BrowserColumnSorting,
  SearchNodeCardState, makeCardStateNode, makeParsableTextNode, browserFilterNode, ConfigKeyBool, browserActiveColumns, key => key, { info() {} },
  (_context,key)=>key);

function harness(notes = false) {
  const page = new Page();
  const calls = [];
  Object.assign(page, {
    preferencesLoaded: true, browserPreferences: defaultBrowserPreferences(notes), 选中ID列表: [], focusedRowId: 0, selectionAnchor: 0,
    previewReadVersion: 0,
    getUIContext:()=>({}),
    persistBrowserPreferences: async patch => calls.push(['preferences', patch]),
    editorSession: { close() {} }, operations: new BrowserOperationController(), 关闭卡片信息() {}, editorVersion: 0, mappingVersion: 0, searchVersion: 0, 浏览模式值: notes ? 'notes' : 'cards', 搜索文本: '',
    sortColumn: '', sortReverse: false, 列定义: [], 行列表: [], 结果ID列表: [],
    suspendedRowIds: new Set(), 取能力上下文: () => ({ filesDir: '/collection' }),
    取本地化文案: key => key === 'app.string.browser_sort_created' ? 'Created' : key, 退出多选() {},
    browserWidth: 360,
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
  page.阶段 = 'list';
  page.searchSession.more = async current => { const row = await page.搜索服务实例.浏览器行按ID(11); return current() ? {rows: [row], consumed: 1} : null; };
  const oldLoad = page.加载更多();
  await new Promise(setImmediate);
  page.searchVersion = 1;
  page.行列表 = [{ id: 21 }];
  resolveRow({ cells: [], color: 0 });
  await oldLoad;
  assert.deepEqual(page.行列表, [{ id: 21 }]);
});

test('one entry per sortable field roundtrips independent direction and restores Core default', async () => {
  for (const notes of [false, true]) {
    const { page } = harness(notes);
    await page.执行搜索();
    let searches = 0;
    page.执行搜索 = () => { searches++; };
    const options = page.sortOptions();
    const columns = page.sortableColumns();
    assert.equal(options.length, 1 + columns.length);
    assert.equal(page.sortIndex(), 0);
    columns.forEach((column, index) => {
      for (const descending of [false, true]) {
        const selected = 1 + index;
        page.selectSort(selected, descending);
        assert.equal(page.sortColumn, column.key);
        assert.equal(page.sortReverse,
          ((notes ? column.sortingNotes : column.sortingCards) === BrowserColumnSorting.SORTING_DESCENDING) !== descending);
        assert.equal(page.sortIndex(), selected);
        assert.equal(page.sortLabel(), `${options[selected].value} ${descending ? '↓' : '↑'}`);
        assert.equal(page.sortDescending(), descending);
      }
    });
    page.selectSort(0, true);
    assert.equal(page.sortColumn, '');
    assert.equal(page.sortReverse, false);
    assert.equal(page.sortIndex(), 0);
    assert.equal(searches, 1 + columns.length * 2);
    const previous = [page.sortColumn, page.sortReverse, searches];
    for (const index of [-1, 0.5, 999]) page.selectSort(index, false);
    page.mutationBusy = true; page.selectSort(1, false);
    page.mutationBusy = false; page.多选模式值 = true; page.selectSort(1, false);
    assert.deepEqual([page.sortColumn, page.sortReverse, searches], previous);
  }
});

test('all three selection triggers share the dialog boundary and the visible filter opens the sidebar', () => {
  for (const width of [320, 720]) {
    const { page } = harness();
    page.阶段 = 'list'; page.browserWidth = width;
    for (const group of ['mode','filter','sort']) {
      page.openViewMenu(group); assert.equal(page.showViewMenu,true); assert.equal(page.viewMenuGroup,group);
    }
    let opens = 0; page.打开侧边栏 = () => opens++;
    page.openBrowserFilter(); assert.equal(opens, 1); assert.equal(page.showViewMenu, false);
    page.多选模式值 = true; page.openBrowserFilter(); page.openViewMenu('mode');
    assert.equal(opens, 1); assert.equal(page.showViewMenu, false);
  }
});

test('sort dialog drafts do not search or persist until confirmation and reject busy delayed clicks', () => {
  const tracker = new AppInterfaceTracker();
  const View = loadComponentLogic('components/browser/BrowserViewMenu.ets', 'BrowserViewMenu', {
    appInterface: tracker, namedResourceText: (_, key) => key, resourceText: (_, key) => key
  });
  const menu = new View(), calls = [];
  menu.getUIContext = () => ({}); menu.group = 'sort'; menu.sortIndex = 1; menu.sortDescending = true;
  menu.sortOptions = [{value:'Default'},{value:'Created'},{value:'Due'}];
  menu.onSortChange = (...args) => calls.push(args); menu.aboutToAppear();
  menu.selectOption(2); menu.selectDirection(false);
  assert.deepEqual(calls, []); assert.equal(menu.sortIndex, 1);
  assert.equal(tracker.snapshot()[0].items.find(item => item.id === 'ascending').selected, true);
  menu.available = false; menu.selectOption(1); menu.selectDirection(true); menu.applySort();
  assert.equal(menu.draftSortIndex, 2); assert.equal(menu.draftDescending, false); assert.deepEqual(calls, []);
  menu.available = true; menu.applySort(); assert.deepEqual(calls, [[2, false]]);
  menu.selectOption(0); menu.selectDirection(true); menu.applySort();
  assert.deepEqual(calls.at(-1), [0, false]);
  menu.selectOption(999); menu.selectOption(-1); assert.equal(menu.draftSortIndex, 0);
  menu.aboutToDisappear(); menu.sortIndex = 1; menu.syncSelection();
  assert.equal(tracker.snapshot().length, 0);
});

test('mode and status dialogs hold selection drafts until the shared confirmation action', () => {
  const tracker = new AppInterfaceTracker();
  const View = loadComponentLogic('components/browser/BrowserViewMenu.ets','BrowserViewMenu', {
    $r:key=>key,appInterface:tracker,namedResourceText:(_,key)=>key,resourceText:(_,key)=>key
  });
  for (const group of ['mode','filter']) {
    const menu=new View(),calls=[];
    Object.assign(menu,{group,notes:false,filterIndex:0,filterOptions:[{value:'All'},{value:'Suspended'}],getUIContext:()=>({}),
      onModeChange:notes=>calls.push(notes),onFilterChange:index=>calls.push(index)});
    menu.aboutToAppear(); menu.selectOption(1); assert.deepEqual(calls,[]);
    assert.equal(tracker.snapshot()[0].items.find(x=>x.id===group+'-1').selected,true);
    menu.available=false; menu.applySelection(); assert.deepEqual(calls,[]);
    menu.available=true; menu.applySelection(); assert.deepEqual(calls,[group==='mode'?true:1]);
    menu.aboutToDisappear(); menu.aboutToAppear();
    assert.equal(menu.selectedIndex(),0,'reopening discards an unconfirmed draft');
    menu.aboutToDisappear();
  }
});

test('card and note row clicks preview real card ids at both widths and ignore stale note reads', async () => {
  for (const width of [360,1200]) for (const notes of [false,true]) {
    const {page}=harness(notes); await page.执行搜索(); page.browserWidth=width;
    const edits=[]; page.openEditPage=(...args)=>edits.push(args);
    page.笔记服务实例={获取笔记的卡片:async id=>{assert.equal(id,21);return [101,102];}};
    page.行点击处理(notes?21:12); await new Promise(setImmediate);
    assert.deepEqual(edits,[]); assert.equal(page.显示预览,true);
    assert.deepEqual(page.previewCardIds,notes?[101,102]:[11,12]);
    assert.equal(page.预览初始索引,notes?0:1);
    page.显示预览=false; page.mutationBusy=true; page.行点击处理(notes?21:12);
    await new Promise(setImmediate); assert.equal(page.显示预览,false);
  }
  const {page}=harness(true); await page.执行搜索();
  let resolveNote; page.笔记服务实例={获取笔记的卡片:()=>new Promise(resolve=>{resolveNote=resolve;})};
  const pending=page.打开预览(21); page.searchVersion++; resolveNote([101]); await pending;
  assert.notEqual(page.显示预览,true);
  page.笔记服务实例={获取笔记的卡片:async()=>[]}; await page.打开预览(21);
  assert.equal(page.refreshError,'app.string.browser_no_cards'); assert.notEqual(page.显示预览,true);
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
