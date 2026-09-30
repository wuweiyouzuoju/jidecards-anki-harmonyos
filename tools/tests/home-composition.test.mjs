// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';

const read = path => readFileSync(new URL('../../entry/src/main/ets/' + path, import.meta.url), 'utf8');
const home = read('pages/首页.ets');
function method(name) {
  const start = home.indexOf('  private ' + name + '(');
  assert.ok(start >= 0, name);
  return home.slice(start, home.indexOf('\n  }', start) + 4);
}
const compile = source => stripTypeScriptTypes(source, { mode: 'transform' });

test('destination renderer preserves route defaults, explicit parameters, snapshots and the host stack', () => {
  const components = ['EditNotePage', '学习页', '浏览页', '统计页', '添加笔记页', 'AI制卡页', '学习提醒页', '设置页'];
  const calls = [];
  const source = read('pages/navigation/HomeDestinations.ets')
    .replace(/^import[^;]+;\s*/gm, '').replace(/^@Builder\s*/gm, '').replace(/^export /gm, '');
  const render = new Function(...components, compile(source) + ';return HomeDestinations;')(
    ...components.map(name => props => calls.push({ name, props })));
  let synced = 0;
  const context = { pathStack: {}, onManualSync: () => synced++ };
  const cases = [
    ['StudyPage', { pageDeckId: '', pageDeckName: '' }],
    ['BrowserPage', { pageDeckId: '', pageInitialSearch: '', pageSelectForAgentEdit: false }],
    ['AddNotePage', { pageDeckId: '', pageDeckName: '', pageDeckOptions: [] }],
    ['AiCardPage', { pageMode: 'create', pageDeckId: '', pageDeckName: '', pageDeckOptions: [],
      pageCardIds: [], pageNoteIds: [], pageTemplateIdx: -1 }],
    ['ReminderPage', {}]
  ];
  for (const [route, expected] of cases) {
    render(route, {}, context);
    assert.deepEqual(calls.at(-1).props, { ...expected, pathStack: context.pathStack });
  }
  render('BrowserPage', { deckId: '4', initialSearch: 'tag:test', selectForAgentEdit: true }, context);
  assert.deepEqual(calls.at(-1), { name: '浏览页', props: { pageDeckId: '4', pageInitialSearch: 'tag:test',
    pageSelectForAgentEdit: true, pathStack: context.pathStack } });
  render('EditNotePage', {targetId:42,isNote:true}, context);
  assert.deepEqual(calls.at(-1), {name:'EditNotePage',props:{targetId:42,isNote:true,pathStack:context.pathStack}});
  const options = [{ id: '4' }], cards = [5], notes = [6];
  render('AiCardPage', { mode: 'edit', deckId: '4', deckName: 'Deck', deckOptions: options,
    cardIds: cards, noteIds: notes, templateIdx: 0 }, context);
  assert.deepEqual(calls.at(-1).props, { pageMode: 'edit', pageDeckId: '4', pageDeckName: 'Deck',
    pageDeckOptions: options, pageCardIds: cards, pageNoteIds: notes, pageTemplateIdx: 0, pathStack: context.pathStack });
  const snapshot = { graphs: {}, days: 365 };
  render('StatsPage', snapshot, context);
  assert.equal(calls.at(-1).props.initialSnapshot, snapshot);
  for (const open of [undefined, true, false]) {
    render('SettingsPage', { openAiSettings: open }, context);
    assert.equal(calls.at(-1).props.openAiSettings, open ?? false);
    calls.at(-1).props.onManualSync();
  }
  assert.equal(synced, 3);
  const before = calls.length;
  render('UnknownPage', {}, context);
  assert.equal(calls.length, before);
});

test('home binds its live navigation host and both detail layouts to the same actions', () => {
  let routeArgs, details;
  const Page = new Function('HomeDestinations', 'HomeDeckDetails',
    compile(`class Page { ${method('页面映射')} ${method('deckDetails')} }`) + ';return Page;')(
    (...args) => { routeArgs = args; }, props => { details = props; });
  const page = new Page(), events = [];
  Object.assign(page, { 页面栈: {}, historyRefreshToken: 3, deckOptionsBusy: true,
    是否深色: () => true, requestManualSync: () => events.push('sync'),
    加载主页数据: () => events.push('refresh'), 开始学习: () => events.push('study'),
    打开牌组预览: () => events.push('preview'), 打开添加笔记: () => events.push('add'),
    openCreateDeck: id => events.push(['child', id]), 打开数据迁移: (...args) => events.push(args),
    打开牌组选项: () => events.push('options') });
  const params = {};
  page.页面映射('SettingsPage', params);
  assert.equal(routeArgs[0], 'SettingsPage');
  assert.equal(routeArgs[1], params);
  assert.equal(routeArgs[2].pathStack, page.页面栈);
  routeArgs[2].onManualSync();
  assert.deepEqual(events.splice(0), ['sync']);
  for (const compact of [true, false]) {
    page.显示牌组详情 = true;
    page.deckDetails(compact);
    assert.equal(details.compact, compact);
    assert.equal(details.historyRefreshToken, page.historyRefreshToken);
    assert.equal(details.optionsBusy, true);
    assert.equal(details.isDark, true);
    page.选中的牌组ID = '42';
    for (const action of ['onStudy', 'onPreview', 'onAddNote', 'onCreateChild', 'onExport', 'onOptions', 'onBack']) details[action]();
    assert.deepEqual(events.splice(0), ['study', 'preview', 'add', ['child', '42'], ['exportDeck', 42, false], 'options', 'refresh']);
    assert.equal(page.显示牌组详情, false);
    page.historyRefreshToken++;
  }
});
