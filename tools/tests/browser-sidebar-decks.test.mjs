// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { deckDirectoryRows } from '../../entry/src/main/ets/model/DeckDirectory.ts';
import { visibleDirectoryRows } from '../../entry/src/main/ets/model/DirectoryTree.ts';
import { loadComponentLogic } from './platform-module-harness.mjs';

const deck = (name, deckId, children = [], collapsed = false, level = 1, totalInDeck = 0) =>
  ({ name, deckId, children, collapsed, level, totalInDeck });
const tree = deck('', 0, [
  deck('英语', 1, [deck('四级', 2, [deck('核心词', 3, [], false, 3, 12)], false, 2, 12)]),
  deck('其他', 4, [deck('四级', 5, [], false, 2, 8)]),
  deck('四级', 6, [], false, 1, 6)
], false, 0);

test('sidebar reconstructs full deck paths and keeps leaf labels, counts and indentation', () => {
  const rows = deckDirectoryRows(tree);
  assert.deepEqual(rows.map(row => row.path),
    ['英语', '英语::四级', '英语::四级::核心词', '其他', '其他::四级', '四级']);
  assert.deepEqual(rows.filter(row => row.name === '四级').map(row => [row.id, row.path]),
    [['2', '英语::四级'], ['5', '其他::四级'], ['6', '四级']]);
  assert.deepEqual([rows[2].name, rows[2].path, rows[2].id, rows[2].level, rows[2].detail],
    ['核心词', '英语::四级::核心词', '3', 2, '12']);
  assert.equal(tree.children[0].children[0].name, '四级', 'Core tree is not mutated');
});

test('sidebar keeps folded subtrees hidden and handles an unloaded or empty tree', () => {
  const folded = deck('', 0, [deck('英语', 1, [deck('四级', 2)], true)], false, 0);
  assert.deepEqual(visibleDirectoryRows(deckDirectoryRows(folded, 0, true), '').map(row => row.path), ['英语']);
  assert.equal(deckDirectoryRows(folded).length, 2, 'adapter retains the entire subtree for expansion');
  assert.deepEqual(deckDirectoryRows(null), []);
  assert.deepEqual(deckDirectoryRows(deck('', 0)), []);
  const special = deck('', 0, [deck('带 "引号"', 1, [deck('a*b\\c', 2)])]);
  assert.equal(deckDirectoryRows(special)[1].path, '带 "引号"::a*b\\c');
});

test('native sidebar menus reject callbacks after disposal or after their actions become busy',()=>{
  const Sidebar=loadComponentLogic('components/browser/浏览侧边栏.ets','浏览侧边栏',{$r:key=>key});
  for(const method of ['显示标签操作菜单','显示保存搜索操作菜单']){
    for(const mode of ['depart','busy','live']){
      const sidebar=new Sidebar(),events=[];let callback;
      sidebar.getUIContext=()=>({getPromptAction:()=>({showActionMenu:(_,fn)=>callback=fn})});
      sidebar.onRenameTag=sidebar.onDeleteSavedSearch=()=>events.push('action');
      sidebar[method](method==='显示标签操作菜单'?'tag':{name:'saved',search:'is:due'});
      if(mode==='depart')sidebar.aboutToDisappear();if(mode==='busy')sidebar.busy=true;
      callback(null,{index:1});assert.equal(events.length,mode==='live'?1:0);
    }
  }
});

test('real sidebar mapping and both deck gestures pass the full path to the page', () => {
  const Sidebar = loadComponentLogic('components/browser/浏览侧边栏.ets', '浏览侧边栏', {
    deckDirectoryRows
  });
  const sidebar = new Sidebar();
  sidebar.牌组树 = tree;
  const row = sidebar.deckRows().find(item => item.id === '3');
  const selected = [], appended = [];
  sidebar.onSelectDeck = name => selected.push(name);
  sidebar.onAppendDeck = name => appended.push(name);
  sidebar.selectDeck(row.id);
  sidebar.selectDeck(row.id, true);
  sidebar.selectDeck('missing');
  sidebar.busy = true;
  sidebar.selectDeck(row.id); sidebar.selectDeck(row.id, true);
  assert.deepEqual(selected, ['英语::四级::核心词']);
  assert.deepEqual(appended, ['英语::四级::核心词']);
});
