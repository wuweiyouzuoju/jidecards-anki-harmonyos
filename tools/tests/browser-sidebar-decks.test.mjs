// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { browserDeckRows } from '../../entry/src/main/ets/model/BrowserSidebar.ts';
import { loadComponentLogic } from './platform-module-harness.mjs';

const deck = (name, deckId, children = [], collapsed = false, level = 1, totalInDeck = 0) =>
  ({ name, deckId, children, collapsed, level, totalInDeck });
const tree = deck('', 0, [
  deck('英语', 1, [deck('四级', 2, [deck('核心词', 3, [], false, 3, 12)], false, 2, 12)]),
  deck('其他', 4, [deck('四级', 5, [], false, 2, 8)]),
  deck('四级', 6, [], false, 1, 6)
], false, 0);

test('sidebar reconstructs full deck paths and keeps leaf labels, counts and indentation', () => {
  const rows = browserDeckRows(tree);
  assert.deepEqual(rows.map(row => row.fullName),
    ['英语', '英语::四级', '英语::四级::核心词', '其他', '其他::四级', '四级']);
  assert.deepEqual(rows.filter(row => row.name === '四级').map(row => [row.deckId, row.fullName]),
    [[2, '英语::四级'], [5, '其他::四级'], [6, '四级']]);
  assert.deepEqual(rows[2], { name: '核心词', fullName: '英语::四级::核心词',
    deckId: 3, level: 3, totalInDeck: 12 });
  assert.equal(tree.children[0].children[0].name, '四级', 'Core tree is not mutated');
});

test('sidebar keeps folded subtrees hidden and handles an unloaded or empty tree', () => {
  const folded = deck('', 0, [deck('英语', 1, [deck('四级', 2)], true)], false, 0);
  assert.deepEqual(browserDeckRows(folded).map(row => row.fullName), ['英语']);
  assert.deepEqual(browserDeckRows(null), []);
  assert.deepEqual(browserDeckRows(deck('', 0)), []);
  const special = deck('', 0, [deck('带 "引号"', 1, [deck('a*b\\c', 2)])]);
  assert.equal(browserDeckRows(special)[1].fullName, '带 "引号"::a*b\\c');
});

test('real sidebar mapping and both deck gestures pass the full path to the page', () => {
  const Sidebar = loadComponentLogic('components/browser/浏览侧边栏.ets', '浏览侧边栏', {
    browserDeckRows
  });
  const sidebar = new Sidebar();
  sidebar.牌组树 = tree;
  const row = sidebar.扁平化牌组树().find(item => item.deckId === 3);
  const source = readFileSync(new URL('../../entry/src/main/ets/components/browser/浏览侧边栏.ets', import.meta.url), 'utf8');
  const render = source.slice(source.indexOf('  牌组节点行('), source.indexOf('  private 显示标签操作菜单('));
  const selected = [], appended = [];
  sidebar.onSelectDeck = name => selected.push(name);
  sidebar.onAppendDeck = name => appended.push(name);
  for (const gesture of ['onClick', 'onAction']) {
    const body = render.match(new RegExp(`\\.${gesture}\\(\\(\\): void => \\{([\\s\\S]*?)\\}`))?.[1];
    assert.ok(body, gesture + ' callback must exist');
    new Function('行', body).call(sidebar, row);
  }
  assert.deepEqual(selected, ['英语::四级::核心词']);
  assert.deepEqual(appended, ['英语::四级::核心词']);
});
