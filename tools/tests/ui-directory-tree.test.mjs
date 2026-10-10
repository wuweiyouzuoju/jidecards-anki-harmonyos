// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import * as directory from '../../entry/src/main/ets/model/DirectoryTree.ts';
import { deckDirectoryRows } from '../../entry/src/main/ets/model/DeckDirectory.ts';
import { memoryScopeRows } from '../../entry/src/main/ets/model/agent/AgentMemoryScopes.ts';
import { AppInterfaceTracker } from '../../entry/src/main/ets/model/AppInterface.ts';
import { emptyCsvMetadata } from '../../entry/src/main/ets/proto/messages/CsvImportMessages.ts';
import { copyCsvMetadata } from '../../entry/src/main/ets/model/CsvImport.ts';
import { loadComponentLogic } from './platform-module-harness.mjs';

const read = path => readFileSync(new URL('../../entry/src/main/ets/' + path, import.meta.url), 'utf8');
const choices = [{ id: '3', path: '英语::四级::核心词' }, { id: '2', path: '英语::四级' },
  { id: '5', path: '其他::四级' }, { id: '6', path: '四级' }];
const paths = rows => rows.map(row => row.path);
const deps = { ...directory, $r: key => key, resourceText: (_context, resource) => resource };
function methods(path, names, dependencies = deps) {
  const source = read(path).replaceAll('\r\n', '\n');
  const body = names.map(name => {
    const start = source.indexOf('  private ' + name + '(');
    assert.ok(start >= 0, name);
    return source.slice(start, source.indexOf('\n  }', start) + 4);
  }).join('\n');
  return new Function(...Object.keys(dependencies), stripTypeScriptTypes(`class Owner { ${body} }`,
    { mode: 'transform' }) + ';return Owner;')(...Object.values(dependencies));
}
function selectionCallback(path, host) {
  const source = read(path), start = source.indexOf('onSelect: (');
  assert.ok(start >= 0, path);
  const open = source.indexOf('{', start); let end = open + 1, depth = 1;
  while (depth > 0 && end < source.length) { if (source[end] === '{') depth++; if (source[end] === '}') depth--; end++; }
  const arrow = source.slice(start + 'onSelect: '.length, end);
  return new Function(stripTypeScriptTypes('function callback() { return ' + arrow + '; }',
    { mode: 'transform' }) + '; return callback.call(this);').call(host);
}

test('directory choices restore missing ancestors, stable IDs and distinct same-name leaves', () => {
  const rows = directory.directoryChoiceRows(choices, '3');
  assert.deepEqual(paths(rows), ['英语', '英语::四级', '英语::四级::核心词', '其他', '其他::四级', '四级']);
  assert.deepEqual(rows.map(row => row.id), ['directory-parent:英语', '2', '3', 'directory-parent:其他', '5', '6']);
  assert.equal(rows[0].selectable, false);
  assert.equal(rows[1].selectable, true);
  assert.equal(rows[2].selection, 1);
  assert.deepEqual(rows.filter(row => row.name === '四级').map(row => row.id), ['2', '5', '6']);
  assert.equal(directory.directorySelectionAllowed(rows, rows[0].id, true), false);
  assert.deepEqual(choices[0], { id: '3', path: '英语::四级::核心词' });
});

test('search reveals ancestors temporarily, restores independent folds and keeps special choices separate', () => {
  const rows = [directory.directorySpecial('0', '全部::特殊')].concat(directory.directoryChoiceRows(choices));
  const expansion = new directory.DirectoryExpansion(), other = new directory.DirectoryExpansion();
  expansion.toggle(rows[1]);
  assert.deepEqual(paths(expansion.visible(rows, '')), ['全部::特殊', '英语', '其他', '其他::四级', '四级']);
  assert.deepEqual(paths(expansion.visible(rows, '核心词')), ['全部::特殊', '英语', '英语::四级', '英语::四级::核心词']);
  assert.equal(expansion.visible(rows, '核心词')[1].collapsed, false);
  assert.equal(expansion.visible(rows, '')[1].collapsed, true);
  assert.equal(other.visible(rows, '').length, 7);
  assert.equal(rows[1].collapsed, false);
  rows[3].selection = 1;
  expansion.update(rows, true);
  assert.equal(expansion.visible(rows, '').length, 7, 'new selection reveals its ancestors');
  expansion.toggle(expansion.visible(rows, '')[1]); expansion.update(rows, true);
  assert.equal(expansion.visible(rows, '').length, 5, 'repeated refresh preserves manual folds');
  assert.equal(directory.visibleDirectoryRows(rows.slice(1), 'missing').length, 0);
});

test('shared list handles empty, large, disabled, filtered and released interaction with accurate observations', () => {
  const Tree = loadComponentLogic('components/common/DirectoryTree.ets', 'DirectoryTree', deps);
  const tree = new Tree(), selected = [], toggled = [], held = [], views = [];
  Object.assign(tree, { rows: directory.directoryChoiceRows(choices), onSelect: id => selected.push(id),
    onToggle: id => toggled.push(id), onLongPress: id => held.push(id), onViewChanged: view => views.push(view) });
  tree.aboutToAppear(); tree.select('3'); tree.longPress('3'); tree.select('directory-parent:英语');
  tree.toggle('directory-parent:英语'); tree.select('3');
  assert.deepEqual(selected, ['3']); assert.deepEqual(held, ['3']);
  assert.equal(views.at(-1).total, 4);
  tree.searchText = '核心词'; tree.refresh(); tree.toggle('directory-parent:英语'); tree.select('3');
  assert.deepEqual(toggled, ['directory-parent:英语']); assert.deepEqual(selected, ['3', '3']);
  assert.equal(views.at(-1).query, '核心词'); assert.equal(views.at(-1).total, 3);
  tree.isInteractive = false; tree.refresh(); tree.select('3'); tree.longPress('3');
  assert.equal(views.at(-1).interactive, false); assert.equal(selected.length, 2); assert.equal(held.length, 1);
  tree.searchText = ''; tree.rows = Array.from({ length: 2000 }, (_, i) => directory.directoryRow(String(i), 'item' + i));
  tree.refresh(); assert.equal(tree.data.totalCount(), 2000); assert.equal(views.at(-1).ids.length, 100);
  assert.equal(views.at(-1).total, 2000); assert.equal(directory.directoryListHeight(2, 260), 88);
  assert.equal(directory.directoryListHeight(2000, 260), 260);
  const key = directory.directoryRowKey(tree.rows[0]); tree.rows[0].selection = 2;
  assert.notEqual(directory.directoryRowKey(tree.rows[0]), key, 'recycled rows refresh selection');
  tree.rows = []; tree.refresh(); assert.equal(tree.data.totalCount(), 0);
  tree.aboutToDisappear(); tree.isInteractive = true; tree.select('3'); tree.toggle('2');
  assert.equal(views.at(-1), null); assert.equal(selected.length, 2);
});

test('native directory selector rejects old callbacks, removed choices, busy state and system-dismissed windows', () => {
  const controllers = [], selected = [], views = [];
  const Select = loadComponentLogic('components/common/DirectorySelect.ets', 'DirectorySelect', { ...deps,
    DirectorySelectDialog: options => options,
    SurfaceTransition: { dialogEnterAnimation: () => ({}), dialogExitAnimation: () => ({}) },
    CustomDialogController: class { constructor(options) { this.options = options; controllers.push(this); }
      open() {} close() { this.closed = true; } } });
  const select = new Select(); Object.assign(select, { rows: directory.directoryChoiceRows(choices),
    onSelect: id => selected.push(id), onViewChanged: view => views.push(view) });
  select.aboutToAppear(); select.open(); const first = controllers[0];
  select.open(); const second = controllers[1]; assert.equal(first.closed, true);
  first.options.builder.onSelect('3'); assert.deepEqual(selected, []);
  select.rows = directory.directoryChoiceRows(choices.slice(1)); select.syncRows();
  second.options.builder.onSelect('3'); assert.deepEqual(selected, [], 'removed ID cannot select another row');
  select.isInteractive = false; select.syncRows(); second.options.builder.onSelect('2');
  assert.deepEqual(selected, []);
  select.isInteractive = true; select.syncRows(); second.options.builder.onSelect('2');
  assert.deepEqual(selected, ['2']); assert.equal(second.closed, true); assert.equal(views.at(-1), null);
  select.open(); const third = controllers[2]; let dismissed = false;
  third.options.onWillDismiss({ dismiss() { dismissed = true; } });
  assert.equal(dismissed, true); assert.equal(select.dialog.current(), null);
  third.options.builder.onSelect('5'); assert.deepEqual(selected, ['2']);
  select.open(); select.aboutToDisappear(); controllers.at(-1).options.builder.onSelect('5');
  assert.deepEqual(selected, ['2']); select.open(); assert.equal(controllers.length, 4);
});

test('deck adapter keeps complete collapsed subtrees without changing Core fold state', () => {
  const tree = { children: [{ name: '英语', deckId: 1, collapsed: true, totalInDeck: 12,
    children: [{ name: '四级', deckId: 2, collapsed: false, totalInDeck: 12, children: [] }] }] };
  const rows = deckDirectoryRows(tree, 2, true);
  assert.deepEqual(paths(rows), ['英语', '英语::四级']); assert.equal(rows[1].selection, 1);
  assert.equal(rows[1].detail, '12'); assert.equal(directory.visibleDirectoryRows(rows, '').length, 1);
  const folds = new directory.DirectoryExpansion(); folds.toggle(rows[0]);
  assert.equal(folds.visible(rows, '').length, 2); assert.equal(tree.children[0].collapsed, true);
  assert.deepEqual(deckDirectoryRows(null), []);
});

test('tag adapter retains full path identity and mixed selection; custom study cycles only the actual tag', () => {
  const Tags = loadComponentLogic('components/common/TagTreeList.ets', 'TagTreeList', deps), tags = new Tags();
  tags.getUIContext = () => ({}); tags.rows = [{ fullName: '英语::词', name: '词', level: 1,
    hasChildren: false, collapsed: false, selection: 2 }];
  assert.equal(tags.directoryRows()[0].id, '英语::词'); assert.equal(tags.directoryRows()[0].selection, 2);
  const Study = methods('components/home/自定义学习对话框.ets', ['tagSelection', 'setTagSelection', 'tagRows', 'cycleTag']);
  const study = new Study(); Object.assign(study, { mounted: true, 处理中: false, 加载默认值中: false,
    默认值: { tags: [{ name: '英语::词' }, { name: '英语::语法' }] }, includedTags: [], excludedTags: [] });
  assert.equal(study.tagRows()[0].selectable, false);
  study.cycleTag('英语'); assert.deepEqual(study.includedTags, []);
  study.cycleTag('英语::词'); assert.deepEqual(study.includedTags, ['英语::词']);
  study.cycleTag('英语::词'); assert.deepEqual(study.includedTags, []); assert.deepEqual(study.excludedTags, ['英语::词']);
  study.cycleTag('英语::词'); assert.deepEqual(study.excludedTags, []);
  study.处理中 = true; study.cycleTag('英语::语法'); assert.deepEqual(study.includedTags, []);
  study.处理中 = false; study.mounted = false; study.cycleTag('英语::词'); assert.deepEqual(study.includedTags, []);
});

test('parent selection changes only its own row keys and clears the previous selection', () => {
  const Create = loadComponentLogic('components/创建牌组面板.ets', '创建牌组面板', deps), create = new Create();
  Object.assign(create, { parentId: '2', parentOptions: choices.map(choice => ({ id: choice.id, fullName: choice.path })),
    getUIContext: () => ({}) });
  const before = create.parentRows(), keys = new Map(before.map(row => [row.id, directory.directoryRowKey(row)]));
  create.parentId = '5'; const after = create.parentRows();
  assert.equal(after.find(row => row.id === '2').selection, 0);
  assert.equal(after.find(row => row.id === '5').selection, 1);
  assert.deepEqual(after.filter(row => directory.directoryRowKey(row) !== keys.get(row.id)).map(row => row.id), ['2', '5']);
  create.parentId = ''; assert.equal(create.parentRows()[0].selection, 1);
});

test('memory scopes keep all/global pinned and deck identities; filter and editor validate live choices', () => {
  const options = [{ value: '全部', scope: '' }, { value: '全局', scope: 'global' },
    { value: '英语::词', scope: 'deck:3' }, { value: '其他::词', scope: 'deck:5' }];
  const rows = memoryScopeRows(options, 'deck:5');
  assert.deepEqual(rows.slice(0, 2).map(row => [row.id, row.pinned]), [['', true], ['global', true]]);
  assert.equal(rows.find(row => row.id === 'deck:5').selection, 1);
  const filter = { busy: false, filterScope: '', filterChoices: () => options };
  const choose = selectionCallback('components/agent/AgentMemoryPanel.ets', filter);
  choose('deck:3'); assert.equal(filter.filterScope, 'deck:3'); choose('unknown'); assert.equal(filter.filterScope, 'deck:3');
  filter.busy = true; choose(''); assert.equal(filter.filterScope, 'deck:3');
  const editor = { busy: false, draftScope: 'global', options: options.slice(1) };
  const edit = selectionCallback('components/agent/AgentMemoryEditorDialog.ets', editor);
  edit('deck:5'); assert.equal(editor.draftScope, 'deck:5'); edit(''); assert.equal(editor.draftScope, 'deck:5');
});

test('agent setup and statistics retain scope semantics while resolving current stable IDs', () => {
  const Setup = loadComponentLogic('components/agent/AgentSetupCard.ets', 'AgentSetupCard', deps);
  const setup = new Setup(), selected = [];
  Object.assign(setup, { setup: { deckId: 3 }, deckOptions: choices.map(x => ({ id: Number(x.id), name: x.path })),
    onDeckSelected: id => selected.push(id), allDecksLabel: '全部', mode: 'edit' });
  assert.equal(setup.deckRows()[0].id, '0'); setup.selectDeck('0'); setup.selectDeck('3'); setup.selectDeck('');
  setup.disabled = true; setup.selectDeck('5'); assert.deepEqual(selected, [0, 3]);
  setup.disabled = false; setup.mode = 'create'; setup.selectDeck('0'); assert.deepEqual(selected, [0, 3]);
  assert.equal(setup.deckRows().some(row => row.id === '0'), false);
  const Stats = methods('pages/统计页.ets', ['deckRows', 'selectDirectoryDeck']), stats = new Stats(), indexes = [];
  Object.assign(stats, { pageActive: true, 阶段: 'content', preferenceSaving: false, 牌组选项: [{ value: '全部' }],
    牌组名列表: ['其他::四级', '英语::四级'], 牌组ID列表: ['5', '2'], 选中牌组索引: 2, on牌组切换: i => indexes.push(i) });
  assert.equal(stats.deckRows().find(row => row.id === '2').selection, 1);
  stats.selectDirectoryDeck('2'); stats.牌组ID列表.reverse(); stats.selectDirectoryDeck('2');
  stats.selectDirectoryDeck('unknown'); stats.selectDirectoryDeck('0'); stats.preferenceSaving = true; stats.selectDirectoryDeck('5');
  assert.deepEqual(indexes, [2, 1, 0]);
});

test('CSV deck selection restores file mapping and preserves unrelated import metadata', () => {
  const Csv = loadComponentLogic('components/import/CsvImportOptions.ets', 'CsvImportOptions',
    { ...deps, emptyCsvMetadata, copyCsvMetadata });
  const csv = new Csv(), changes = [], metadata = { ...emptyCsvMetadata(), deckColumn: 2, deckName: 'from file',
    deckId: 9, tagsColumn: 4, fieldColumns: [1, 3] };
  Object.assign(csv, { preview: { metadata, notetypes: [] }, decks: [{ id: 3, name: '英语::四级' }],
    getUIContext: () => ({}), onChange: value => changes.push(value) });
  csv.aboutToAppear(); assert.equal(csv.deckRows()[0].selection, 1);
  csv.selectDeck('3'); assert.deepEqual([csv.draft.deckId, csv.draft.deckColumn, csv.draft.deckName], [3, 0, '']);
  assert.deepEqual(csv.draft.fieldColumns, [1, 3]); assert.equal(csv.draft.tagsColumn, 4);
  csv.selectDeck('file'); assert.deepEqual([csv.draft.deckId, csv.draft.deckColumn, csv.draft.deckName], [9, 2, 'from file']);
  csv.isInteractive = false; csv.selectDeck('3'); assert.equal(csv.draft.deckColumn, 2);
  csv.isInteractive = true; csv.selectDeck('missing'); assert.equal(changes.length, 3);
});

test('JIDE receives actual directory state and never clears a different directory owner', () => {
  const tracker = new AppInterfaceTracker(), view = { query: '词', ids: ['3'], paths: ['英语::词'], total: 1,
    selections: [1], selectable: [true], expandedIds: [], hasBranches: false, interactive: true, mode: 'single', searchable: true };
  tracker.observeDirectory('stats_deck', view);
  const current = tracker.snapshot().find(row => row.surface === 'directory_tree');
  assert.deepEqual(current.optionIds, ['3']); assert.deepEqual(current.optionLabels, ['英语::词']);
  assert.deepEqual(current.items.map(item => [item.id, item.enabled]), [['search', true], ['select', true]]);
  assert.equal(current.values.find(item => item.id === 'selection_states').value, '[1]');
  tracker.observeDirectory('stats_deck', { ...view, interactive: false });
  assert.equal(tracker.snapshot()[0].items.every(item => !item.enabled), true);
  tracker.observeDirectory('memory_editor_scope', { ...view, searchable: false });
  assert.equal(tracker.snapshot().length, 2, 'simultaneous directories retain their own observations');
  tracker.observeDirectory('stats_deck', null);
  assert.equal(tracker.snapshot()[0].sectionId, 'memory_editor_scope');
  tracker.observeDirectory('memory_editor_scope', null); assert.deepEqual(tracker.snapshot(), []);
});

test('all directory choices share the renderer and categorical choices keep their own controls', () => {
  for (const path of ['pages/统计页.ets', 'components/agent/AgentSetupCard.ets', 'components/agent/AgentMemoryPanel.ets',
    'components/agent/AgentMemoryEditorDialog.ets', 'components/home/DeckReparentFeature.ets', 'components/数据迁移面板.ets',
    'components/import/CsvImportOptions.ets', 'components/添加笔记面板.ets']) {
    assert.match(read(path), /DirectorySelect\(/, path);
    assert.doesNotMatch(read(path), /Select\(this\.(?:牌组下拉选项|editDeckOptions|deckLabels|filterChoices)\(/, path);
  }
  for (const path of ['components/browser/BrowserDeckDialog.ets', 'components/browser/浏览侧边栏.ets',
    'components/创建牌组面板.ets', 'components/home/自定义学习对话框.ets', 'components/common/TagTreeList.ets']) {
    assert.match(read(path), /DirectoryTree\(/, path);
  }
  assert.doesNotMatch(read('components/common/TagTreeList.ets'), /LazyForEach|ListItem|DisclosureChevron|Checkbox/);
  assert.doesNotMatch(read('components/home/自定义学习对话框.ets'), /ForEach\(this\.默认值\.tags/);
  assert.match(read('components/common/DirectoryTree.ets'), /LazyForEach/);
  assert.match(read('components/common/DirectorySelectDialog.ets'), /DirectoryTree\([\s\S]*DialogFrame\(/);
  assert.match(read('components/agent/AgentSetupCard.ets'), /Select\(this\.editNotetypeOptions\(\)\)/);
});
