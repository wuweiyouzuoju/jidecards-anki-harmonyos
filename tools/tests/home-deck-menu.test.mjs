// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { loadComponentLogic, loadPlatformModule } from './platform-module-harness.mjs';
import { uiFeedback } from './ui-feedback-harness.mjs';
import { AppInterfaceTracker, APP_INTERFACE_SURFACES, deckRowMenuItems } from '../../entry/src/main/ets/model/AppInterface.ts';
import { DECK_TONE_CHOICES, 牌组色调 } from '../../entry/src/main/ets/model/DeckTone.ts';
import { 牌组显示名 } from '../../entry/src/main/ets/model/主页模型.ets';
import { deckScopeSearch } from '../../entry/src/main/ets/model/DeckScope.ts';
import { ActionMenuPointerSide, actionMenuBubbleOutline, actionMenuHostAnchor, placeAnchoredActionMenu, actionMenuGroupInset, placeActionMenuGroups } from '../../entry/src/main/ets/components/common/ActionMenuLayout.ts';
import { actionMenuRows, visibleActionMenuRows } from '../../entry/src/main/ets/components/common/ActionMenuTree.ts';
import { HOME_SHORTCUTS, shortcutCommand } from '../../entry/src/main/ets/model/KeyboardShortcuts.ts';
import { KeyboardPressSession } from '../../entry/src/main/ets/model/KeyboardInput.ts';
import { safeMenuGeometry, keyboardViewportHeight } from '../../entry/src/main/ets/model/WindowSafeLayout.ts';

const read = path => readFileSync(new URL('../../entry/src/main/ets/' + path, import.meta.url), 'utf8');
const dictionaries = Object.fromEntries(['base', 'en_US'].map(locale => [locale,
  Object.fromEntries(JSON.parse(readFileSync(new URL('../../entry/src/main/resources/' + locale + '/element/string.json', import.meta.url), 'utf8')).string.map(item => [item.name, item.value]))]));
function menuHarness(locale = 'base') {
  const tracker = new AppInterfaceTracker();
  const Menu = loadComponentLogic('components/home/HomeDeckRowMenu.ets', 'HomeDeckRowMenu', {
    DECK_TONE_CHOICES, 牌组色调, deckRowMenuItems, appInterface: tracker, actionMenuHostAnchor,
    interfaceItemText: loadPlatformModule('utils/AppInterfaceText.ets', 'interfaceItemText', { APP_INTERFACE_SURFACES, ...uiFeedback }),
    $r: id => id
  });
  const menu = new Menu(), events = [];
  Object.assign(menu, {
    deckId: '42', deckName: 'Parent::Deck', tone: 牌组色调.Blue,
    getUIContext: () => ({ getHostContext: () => ({ resourceManager: { getStringByNameSync: key => dictionaries[locale][key] } }) }),
    onClose: () => events.push('close'),
    onToneChange: (deckId, tone) => events.push([deckId, tone]),
    onAction: (deckId, action) => events.push([deckId, action])
  });
  menu.aboutToAppear();
  return { menu, events, tracker };
}

test('deck tone choices retain every persisted value inside the shared dialog', () => {
  const { menu, events } = menuHarness();
  assert.deepEqual(DECK_TONE_CHOICES.map(choice => choice.tone), [牌组色调.Blue, 牌组色调.Purple, 牌组色调.Mint, 牌组色调.Amber, 牌组色调.Red, 牌组色调.None]);
  menu.toggleBranch(menu.menuItems().find(item => item.id === 'tone'));
  for (const choice of DECK_TONE_CHOICES) {
    menu.tone = choice.tone;
    const items = menu.toneItems();
    assert.equal(items.filter(item => item.selected).length, 1);
    const item = items.find(item => item.id === String(choice.tone));
    assert.equal(item.label, dictionaries.base[choice.titleKey]);
    assert.equal(item.iconTint, choice.colorKey ? 'app.color.' + choice.colorKey : undefined);
    assert.equal(item.icon, 'app.media.' + choice.iconKey);
    assert.equal(APP_INTERFACE_SURFACES.find(surface => surface.id === 'deck_tones').items.find(item => item.id === String(choice.tone)).iconKey, choice.iconKey);
    menu.selectItem(item);
    assert.deepEqual(events.slice(-2), ['close', ['42', choice.tone]]);
  }
  menu.tone = 牌组色调.Black;
  assert.equal(menu.toneItems().some(item => item.selected), false, 'historical black is not mislabeled');
  const calls = events.length;
  menu.selectItem({ id: '-1' }); menu.selectItem({ id: '99' });
  assert.equal(events.length, calls);
  const source = read('components/home/HomeDeckRowMenu.ets');
  assert.match(source, /DialogFrame\(\{/);
  assert.match(source, /DialogHeader\(\{ title: this\.deckName/);
  assert.match(source, /selectionUsesAccent: choice\.id !== String\(牌组色调\.None\)/);
  assert.match(source, /if \(this\.point !== undefined\) \{[\s\S]*CardActionMenu\(/);
  assert.doesNotMatch(source, /AnchoredMenu\(/);
  assert.doesNotMatch(read('components/牌组列表项.ets'), /bindPopup\(|色条菜单|色条选项列表/);
});

test('menu and JIDE share localized actions, mode visibility, filtered state and current tone', () => {
  for (const locale of ['base', 'en_US']) for (const simple of [true, false]) for (const filtered of [true, false]) {
    const { menu, events, tracker } = menuHarness(locale);
    menu.simple = simple; menu.filtered = filtered; menu.publishInterface();
    const entries = menu.menuItems();
    assert.deepEqual(entries.map(item => item.id), deckRowMenuItems(simple, filtered).map(item => item.id));
    assert.equal(entries.some(item => item.id === 'custom_study'), !simple && !filtered);
    assert.equal(entries.some(item => item.id === 'empty_filtered'), filtered);
    assert.equal(entries.find(item => item.id === 'stats').label, dictionaries[locale].deck_menu_stats);
    assert.equal(entries.find(item => item.id === 'browser').label, dictionaries[locale].browser_title);
    for (const item of entries.filter(item => item.id !== 'tone')) {
      menu.selectItem(item); assert.deepEqual(events.slice(-2), ['close', ['42', item.id]]);
    }
    menu.toggleBranch(entries.find(item => item.id === 'tone')); menu.publishInterface();
    const observation = tracker.snapshot().find(item => item.surface === 'deck_tones');
    const state = tracker.snapshot().find(item => item.surface === 'deck_row_menu');
    assert.equal(state.items.some(item => item.id === 'custom_study'), !simple && !filtered);
    assert.equal(state.values.find(item => item.id === 'presentation').value, 'centered_dialog');
    assert.equal(state.values.find(item => item.id === 'deck_name').value, menu.deckName);
    assert.equal(state.items.find(item => item.id === 'close').title, dictionaries[locale].cancel);
    assert.ok(state.values.every(item => !['anchor', 'pointer'].includes(item.id)));
    assert.equal(observation.selectedId, String(牌组色调.Blue));
    assert.deepEqual(observation.items.map(item => item.title), DECK_TONE_CHOICES.map(choice => dictionaries[locale][choice.titleKey]));
    menu.aboutToDisappear();
    assert.equal(tracker.snapshot().some(item => ['deck_row_menu', 'deck_tones'].includes(item.surface)), false);
  }
});

test('switching to a filtered deck rejects a stale custom-study menu selection', () => {
  const { menu, events, tracker } = menuHarness();
  menu.simple = false;
  const stale = menu.menuItems().find(item => item.id === 'custom_study');
  assert.ok(stale);
  menu.filtered = true; menu.publishInterface();
  assert.equal(menu.menuItems().some(item => item.id === 'custom_study'), false);
  assert.equal(tracker.snapshot().find(item => item.surface === 'deck_row_menu').items.some(item => item.id === 'custom_study'), false);
  menu.selectItem(stale);
  assert.deepEqual(events, []);
});

test('busy, closed, removed and invalid entries cannot act; back closes colors before the menu', () => {
  const { menu, events } = menuHarness();
  menu.toggleBranch({ id: 'tone' }); menu.handleBack();
  assert.deepEqual(menu.expandedIds, []); assert.deepEqual(events, []);
  menu.handleBack(); assert.deepEqual(events, ['close']);
  events.length = 0; menu.busy = true;
  assert.ok(menu.menuItems().every(item => !item.available));
  assert.ok(menu.toneItems().every(item => !item.available));
  menu.selectItem({ id: 'stats' }); menu.toggleBranch({ id: 'tone' }); assert.deepEqual(events, []);
  menu.handleBack(); menu.dismiss(); assert.deepEqual(events, [], 'busy protects header, outside and system-back dismissal alike');
  menu.busy = false; menu.selectItem({ id: 'custom_study' }); menu.selectItem({ id: 'empty_filtered' });
  menu.selectItem({ id: 'invalid' }); menu.selectItem({ id: 'tone' }); assert.deepEqual(events, []);
  menu.aboutToDisappear(); menu.selectItem({ id: 'browser' }); menu.dismiss(); assert.deepEqual(events, []);
});

test('header and outside dismissal close the whole dialog even while colors are expanded', () => {
  const { menu, events, tracker } = menuHarness();
  menu.toggleBranch({ id: 'tone' }); menu.publishInterface();
  menu.busy = true; menu.publishInterface();
  assert.equal(tracker.snapshot().find(item => item.surface === 'deck_row_menu').items.find(item => item.id === 'close').enabled, false);
  menu.dismiss(); assert.deepEqual(events, []);
  menu.busy = false; menu.dismiss(); assert.deepEqual(events, ['close']);
});

test('closing the overlay cannot clear the accepted action target', () => {
  for (const color of [false, true]) {
    const { menu, events } = menuHarness();
    menu.onClose = () => { menu.deckId = ''; events.push('close'); };
    if (color) menu.toggleBranch({ id: 'tone' });
    menu.selectItem(color ? menu.toneItems()[0] : menu.menuItems().find(item => item.id === 'stats'));
    assert.deepEqual(events, ['close', ['42', color ? 牌组色调.Blue : 'stats']]);
  }
});

function homeHarness() {
  const source = read('pages/首页.ets');
  const methods = ['openDeckMenu', 'closeHomeActions', 'handleDeckMenuAction', '打开浏览页', '打开统计页', '打开自定义学习', '打开添加笔记', '打开牌组选项', 'openCreateDeck', 'openDeckExport'].map(name => {
    const start = source.indexOf('  private ' + name + '(');
    assert.ok(start >= 0, name);
    return source.slice(start, source.indexOf('\n  }', start) + 4);
  });
  const Home = new Function('deckScopeSearch', '牌组显示名', stripTypeScriptTypes('class Home { ' + methods.join('\n') + ' }', { mode: 'transform' }) + '; return Home;')(deckScopeSearch, deck => 牌组显示名(deck, 'zh-Hans'));
  const home = new Home(), paths = [], actions = [];
  const target = { id: '42', fullName: 'Parent::Deck "quoted" *_', displayName: 'Alias' };
  Object.assign(home, {
    排序模式中: false, deckMenuId: '', 选中的牌组ID: '999',
    按ID查牌组: id => id === target.id ? target : { id: '' },
    deferForSync: () => false, 添加笔记的牌组选项: () => [{id:42,name:target.fullName}],
    打开数据迁移: (...args) => actions.push(['export', ...args]),
    pushDeckOptionsPage: (id,name) => actions.push(['options',id,name]),
    暂停主页官方公告检查() {}, syncController: { cancel() {} },
    statsSnapshot: { graphs: { allDecks: true }, days: 365 },
    页面栈: { pushPath: path => paths.push(path) }, 返回主页后刷新: () => actions.push('refresh')
  });
  const closeHomeActions = home.closeHomeActions.bind(home);
  home.closeHomeActions = () => { actions.push('close'); closeHomeActions(); };
  return { home, paths, actions, target };
}

test('custom study opens only for an existing normal deck, including after sync deferral', () => {
  const { home, target } = homeHarness();
  home.显示自定义学习 = false;
  home.打开自定义学习('deleted');
  assert.equal(home.显示自定义学习, false);
  target.filtered = true;
  home.handleDeckMenuAction(target.id, 'custom_study');
  assert.equal(home.显示自定义学习, false);
  target.filtered = false;
  home.打开自定义学习(target.id);
  assert.equal(home.显示自定义学习, true);
  assert.equal(home.自定义学习牌组ID, target.id);
  assert.equal(home.自定义学习牌组名, target.displayName);
  home.显示自定义学习 = false;
  let pending;
  home.deferForSync = action => { pending = action; return true; };
  home.打开自定义学习(target.id);
  target.filtered = true;
  home.deferForSync = () => false; pending();
  assert.equal(home.显示自定义学习, false);
});

test('long pressing selects the target and opens statistics and browser with that deck preselected', () => {
  const { home, paths, actions, target } = homeHarness();
  home.openDeckMenu(target.id); assert.equal(home.deckMenuId, '42');
  assert.equal(home.选中的牌组ID, '42');
  home.handleDeckMenuAction(target.id, 'browser'); home.handleDeckMenuAction(target.id, 'stats');
  assert.equal(paths[0].name, 'BrowserPage');
  assert.deepEqual(paths[0].param, { deckId: '42', initialSearch: deckScopeSearch(target.fullName) });
  assert.equal(paths[1].name, 'StatsPage');
  assert.deepEqual(paths[1].param, { graphs: null, days: 365, deckId: '42', deckName: target.fullName });
  paths.forEach(path => path.onPop()); assert.equal(actions.filter(action => action === 'refresh').length, 2);
  home.打开浏览页(); home.打开统计页();
  assert.deepEqual(paths[2].param, {}); assert.equal(paths[3].param, home.statsSnapshot);
  home.openDeckMenu('deleted'); home.handleDeckMenuAction('deleted', 'stats');
  home.打开浏览页('deleted'); home.打开统计页('deleted'); assert.equal(paths.length, 4);
  home.排序模式中 = true; home.deckMenuId = ''; home.openDeckMenu(target.id); assert.equal(home.deckMenuId, '');
});

test('long press moves the row highlight from the previous selection and closing preserves the new selection', () => {
  const { home, paths, target } = homeHarness();
  const selectedExpression = read('components/home/主页牌组列表.ets').match(/selected: ([^,\r\n]+),/)?.[1];
  assert.ok(selectedExpression);
  const isHighlighted = new Function('deck', 'return ' + selectedExpression);
  const highlightedIds = () => ['999', '42', '43'].filter(id => isHighlighted.call(home, { id }));
  Object.assign(home, { 显示牌组详情: false,
    选择牌组: () => { throw new Error('long press must not open phone details'); } });
  assert.deepEqual(highlightedIds(), ['999']);
  home.openDeckMenu(target.id);
  assert.deepEqual(highlightedIds(), ['42']);
  assert.equal(home.deckMenuId, '42');
  assert.equal(home.显示牌组详情, false);
  assert.deepEqual(paths, []);
  home.closeHomeActions();
  assert.equal(home.deckMenuId, '');
  assert.deepEqual(highlightedIds(), ['42']);
  home.按ID查牌组 = id => ['42', '43'].includes(id) ? { ...target, id } : { id: '' };
  home.openDeckMenu('43');
  assert.deepEqual(highlightedIds(), ['43']);
  home.openDeckMenu('deleted');
  assert.equal(home.deckMenuId, '43');
  assert.deepEqual(highlightedIds(), ['43']);
  home.closeHomeActions(); home.排序模式中 = true;
  home.openDeckMenu('42');
  assert.equal(home.deckMenuId, '');
  assert.deepEqual(highlightedIds(), ['43']);
});

test('browser sync deferral retains the requested deck rather than the current selection', () => {
  const { home, paths, target } = homeHarness(); let pending;
  home.deferForSync = action => { pending = action; return true; };
  home.打开浏览页(target.id); assert.equal(paths.length, 0);
  home.选中的牌组ID = '1000'; home.deferForSync = () => false; pending();
  assert.equal(paths[0].param.deckId, '42');
  assert.equal(paths[0].param.initialSearch, deckScopeSearch(target.fullName));
});

test('existing deck actions retain their original domain callbacks and the long-pressed target', () => {
  const { home, actions } = homeHarness();
  const bindings = { reorder: '进入排序模式', rename: 'openDeckRename', customize: '打开牌组定制',
    custom_study: '打开自定义学习', hide: '隐藏牌组' };
  for (const [action, method] of Object.entries(bindings)) home[method] = id => actions.push([action, id]);
  home.deckDeletion = { request: id => actions.push(['delete', id]) };
  home.maintainFilteredDeck = (id, action) => actions.push([action, id]);
  for (const action of [...Object.keys(bindings), 'delete', 'empty_filtered', 'rebuild_filtered']) home.handleDeckMenuAction('42', action);
  assert.deepEqual(actions, [['reorder', undefined], ['rename', '42'], ['customize', '42'],
    ['custom_study', '42'], ['hide', '42'], ['delete', '42'], ['empty_filtered', '42'], ['rebuild_filtered', '42']]);
});

test('deck search uses the full hierarchy and escapes quotes, wildcards and backslashes', () => {
  assert.equal(deckScopeSearch('Parent::Two words'), 'deck:"Parent::Two words"');
  assert.equal(deckScopeSearch('a"b*_\\c'), 'deck:"a\\"b\\*\\_\\\\c"');
});

test('long press forwards the target through the list without row geometry or finger coordinates', () => {
  const source = read('components/牌组列表项.ets');
  const start = source.indexOf('  private openMenu(');
  const method = source.slice(start, source.indexOf('\n  }', start) + 4);
  const Row = new Function(stripTypeScriptTypes('class Row { ' + method + ' }', { mode: 'transform' }) + '; return Row;')();
  const row = new Row(), calls = [];
  const { home } = homeHarness();
  function boundCallback(source, property, owner) {
    const expression = source.match(new RegExp(String.raw`\b${property}:\s*(\([^)]*\)(?::\s*void)?\s*=>\s*\{[^}]*\})`))?.[1];
    assert.ok(expression, property + ' must forward the menu callback');
    const compiled = stripTypeScriptTypes('const callback = ' + expression + ';', { mode: 'transform' });
    return new Function(compiled + '; return callback;').call(owner);
  }
  const list = { onItemMenu: boundCallback(read('pages/首页.ets'), 'onItemMenu', home) };
  const onMenu = boundCallback(read('components/home/主页牌组列表.ets'), 'onMenu', list);
  Object.assign(row, { deck: { id: '42' }, reorderMode: false, menuOpen: false,
    onMenu: (...args) => { calls.push(args); onMenu(...args); } });
  row.openMenu();
  assert.deepEqual(calls, [['42']]);
  assert.equal(home.deckMenuId, '42');
  assert.equal(home.选中的牌组ID, '42');
  row.reorderMode = true; row.openMenu();
  row.reorderMode = false; row.menuOpen = true; row.openMenu();
  assert.equal(calls.length, 1);
  row.menuOpen = false; row.openMenu({x:250,y:400});
  assert.deepEqual(calls[1], ['42',{x:250,y:400}]); assert.deepEqual(home.deckMenuPoint,{x:250,y:400});
  assert.match(source, /this\.onMenu\(this\.deck\.id\)/);
  assert.doesNotMatch(source, /menuAnchor|fingerList/);
  assert.match(read('components/home/主页牌组列表.ets'), /this\.onItemMenu\(deckId, point\)/);
  assert.match(read('pages/首页.ets'), /this\.openDeckMenu\(deckId, point\)/);
  assert.match(read('pages/首页.ets'), /deckName: this\.按ID查牌组\(this\.deckMenuId\)\.fullName/);
});

test('context menu follows the row, opens above bottom rows and converts navigation offsets only once', () => {
  const bounds = { left: 12, top: 36, width: 816, height: 740 };
  const anchor = actionMenuHostAnchor({ left: 76, top: 210, width: 400, height: 68 }, 40, 50);
  assert.deepEqual(anchor, { left: 36, top: 160, width: 400, height: 68 });
  const below = placeAnchoredActionMenu(anchor, 136, 352, 136, bounds);
  assert.deepEqual(below, { left: 168, top: 234, width: 136, height: 352, pointerSide: ActionMenuPointerSide.Top, pointerCenter: 68 });
  const above = placeAnchoredActionMenu({ ...anchor, top: 680 }, 136, 352, 136, bounds);
  assert.equal(above.top, 322);
  assert.equal(above.pointerSide, ActionMenuPointerSide.Bottom);
  assert.equal(below.top - 6, anchor.top + anchor.height);
  assert.equal(above.top + above.height + 6, 680);
  const colors = placeAnchoredActionMenu(anchor, 284, 352, 136, bounds);
  assert.equal(colors.left + colors.width, below.left + below.width, 'main menu stays aligned while colors expand to its left');
  assert.equal(colors.top, below.top);
  const otherColumn = placeAnchoredActionMenu({ ...anchor, left: 460, width: 340 }, 136, 352, 136, bounds);
  assert.ok(otherColumn.left > below.left + below.width);
});

test('shared context positioning stays inside narrow/wide safe areas, short windows and keyboard bounds', () => {
  const Menu = loadComponentLogic('components/common/CardActionMenu.ets', 'CardActionMenu', {
    应用尺寸: { compactMenuWidth: 112, menuItemHeight: 44, cardActionGroupWidth: 136, radiusLg: 16,
      页面底部间距: narrow => narrow ? 8 : 12, pageContentTop: () => 70 },
    actionMenuRows, visibleActionMenuRows, actionMenuGroupInset, placeActionMenuGroups, placeAnchoredActionMenu,
    safeMenuGeometry, keyboardViewportHeight, MenuSurface: { pointerSpan: 20, pointerDepth: 6 }, ActionMenuPointerSide
  });
  const menu = new Menu(); menu.items = menuHarness().menu.menuItems(); menu.menuWidth = 136;
  assert.equal(menu.anchoredPlacement(), undefined); assert.equal(menu.menuTop(), 70, 'toolbar default remains');
  menu.topOffset = 99; assert.equal(menu.menuTop(), 99);
  for (const width of [180, 360, 840, 1400]) for (const height of [320, 640, 900])
    for (const narrow of [false, true]) for (const inset of [0, 24]) for (const expanded of [[], ['tone']]) {
      Object.assign(menu, { viewportWidth: width, viewportHeight: height, viewportLeft: 0, viewportTop: 40,
        safeLeft: inset, safeRight: inset, toolbarSafeTop: 64, safeBottom: inset, narrowDeckLayout: narrow,
        keyboardTop: 0, expandedIds: expanded });
      for (const top of [0, 140, height - 68]) {
        menu.anchor = { left: inset + 12, top, width: width - inset * 2 - 24, height: 68 };
        const placement = menu.anchoredPlacement(), gap = narrow ? 8 : 12;
        assert.ok(placement.left >= inset + 12);
        assert.ok(placement.left + menu.totalWidth() <= width - inset - 12 + 1e-8);
        assert.ok(placement.top >= 24 + gap);
        assert.ok(placement.top + placement.height <= height - inset - gap + 1e-8);
        if (top >= 24 + gap && top + 68 <= height - inset - gap) {
          assert.ok(placement.top >= top + 68 + 6 || placement.top + placement.height + 6 <= top,
            'short windows scroll the menu instead of covering the selected row');
        }
        const bubble = menu.menuBubble();
        assert.equal(bubble.left, menu.groupsOnRight() ? 0 : menu.totalWidth() - menu.primaryWidth());
        assert.equal(bubble.pointerSide, placement.pointerSide);
      }
    }
  Object.assign(menu, { viewportWidth: 360, viewportHeight: 800, viewportTop: 40, keyboardTop: 340,
    safeLeft: 0, safeRight: 0, safeBottom: 24, toolbarSafeTop: 24, narrowDeckLayout: false });
  const placement = menu.anchoredPlacement();
  assert.ok(placement.top + placement.height <= 300 - 12);
});

test('no tone uses a matching circle and slash in both themes, independently from the clear flag icon', () => {
  const choice = DECK_TONE_CHOICES.find(choice => choice.tone === 牌组色调.None);
  assert.equal(choice.iconKey, 'ic_deck_tone_none');
  const media = locale => readFileSync(new URL('../../entry/src/main/resources/' + locale + '/media/' + choice.iconKey + '.svg', import.meta.url), 'utf8');
  assert.equal(media('base').replace('#000000', '#E7ECF3'), media('dark'));
  assert.match(media('base'), /<circle cx="12" cy="12" r="7"\/>/);
  assert.match(media('base'), /<path d="M7\.05 7\.05l9\.9 9\.9"\/>/);
  assert.equal(choice.colorKey, '');
});

test('pointer follows the selected column when colors open near either screen edge', () => {
  const bounds = { left: 12, top: 36, width: 336, height: 728 };
  for (const left of [12, 188]) {
    const anchor = { left, top: 360, width: 160, height: 68 };
    const rightGroups = left === 12;
    const placement = placeAnchoredActionMenu(anchor, 284, 352, 136, bounds, 6, rightGroups);
    const mainLeft = placement.left + (rightGroups ? 0 : 148);
    const tip = mainLeft + Math.max(26.5, Math.min(136 - 26.5, placement.pointerCenter));
    assert.ok(tip >= anchor.left && tip <= anchor.left + anchor.width);
    assert.ok(placement.top + placement.height + 6 <= anchor.top || placement.top >= anchor.top + anchor.height + 6);
    const path = actionMenuBubbleOutline(136, placement.height, placement.pointerCenter, 1, 1, 16, 6, 20, placement.pointerSide);
    assert.equal((path.match(/M /g) ?? []).length, 1);
    assert.ok(path.endsWith(' Z'));
    const curve = path.match(/ C ([\d.\s-]+)(?= C)/)?.[1].trim().split(/\s+/).map(Number);
    assert.ok(curve);
    const tipX = mainLeft + curve[4];
    const tipY = placement.top - (placement.pointerSide === ActionMenuPointerSide.Top ? 6 : 0) + curve[5];
    assert.ok(tipX >= anchor.left && tipX <= anchor.left + anchor.width);
    assert.ok(Math.abs(tipY - (placement.pointerSide === ActionMenuPointerSide.Top ? anchor.top + anchor.height : anchor.top)) <= 0.5,
      'the actual outline tip meets the selected border, including the half-stroke inset');
  }
  const Shell = loadComponentLogic('components/common/AnchoredMenu.ets', 'AnchoredMenu', {
    应用尺寸: { compactMenuWidth: 136, 页面底部间距: () => 12 }, safeMenuGeometry
  });
  const shell = new Shell(); Object.assign(shell, { viewportHeight: 800, viewportTop: 0, topOffset: 430, maxHeight: 180 });
  assert.equal(shell.scrollMaxHeight(), 180, 'arrow stays outside the scrolling viewport');
  assert.match(read('components/common/AnchoredMenu.ets'), /MenuBubbleSurface\(\{/);
  assert.match(read('components/common/MenuBubble.ets'), /MenuBubbleSurface\(\{/);
});


test('right click uses the same current actions and guarded tone choices at a window pointer anchor', () => {
 const {menu,events,tracker}=menuHarness();menu.point={x:360,y:720};menu.hostLeft=40;menu.hostTop=64;
 assert.deepEqual(menu.contextAnchor(),{left:320,top:656,width:0,height:0});
 const entries=menu.contextEntries();assert.deepEqual(entries.map(item=>item.id),menu.menuItems().map(item=>item.id));
 assert.deepEqual(entries.map(item=>item.value),menu.menuItems().map(item=>item.label));
 menu.publishInterface();const observed=tracker.snapshot().find(view=>view.surface==='deck_row_menu');
 assert.equal(observed.values.find(value=>value.id==='presentation').value,'pointer_context_menu');
 assert.equal(observed.values.find(value=>value.id==='triggers').value,'long_press,right_click');
 const tones=entries.find(item=>item.id==='tone');menu.toggleBranch({id:'tone'});tones.children.find(item=>item.id===String(牌组色调.Mint)).action();
 assert.deepEqual(events,['close',['42',牌组色调.Mint]]);
 events.length=0;menu.busy=true;entries.find(item=>item.id==='rename').action();assert.deepEqual(events,[]);
 assert.ok(menu.contextEntries().every(item=>item.enabled===false));
 menu.busy=false;menu.point=undefined;menu.publishInterface();
 assert.equal(tracker.snapshot().find(view=>view.surface==='deck_row_menu').values.find(value=>value.id==='presentation').value,'centered_dialog');
});

test('mouse dispatch opens only for right press, keeps the exact deck and does not open phone details',()=>{
 const MouseButton={Left:1,Right:2,Middle:4},MouseAction={Press:1,Release:2,Move:3};
 const mouseContextPoint=loadPlatformModule('utils/MouseContextInput.ets','mouseContextPoint',{MouseButton,MouseAction});
 const source=read('components/牌组列表项.ets');
 const methods=['openMenu','handleMouse'].map(name=>{const start=source.indexOf('  private '+name+'(');return source.slice(start,source.indexOf('\n  }',start)+4);});
 const Row=new Function('mouseContextPoint',stripTypeScriptTypes('class Row{'+methods.join('\n')+'}')+';return Row;')(mouseContextPoint);
 const {home}=homeHarness(),calls=[],row=Object.assign(new Row(),{deck:{id:'42'},disposed:false,reorderMode:false,menuOpen:false,
  onMenu:(id,point)=>{calls.push([id,point]);home.openDeckMenu(id,point);}});
 let stopped=0;const event={button:2,action:1,windowX:340,windowY:580,stopPropagation:()=>stopped++};
 for(const button of [1,4])row.handleMouse({...event,button});assert.deepEqual(calls,[]);assert.equal(stopped,0);
 row.handleMouse(event);row.handleMouse({...event,action:2});row.handleMouse({...event,action:3});
 assert.deepEqual(calls,[['42',{x:340,y:580}]]);assert.equal(stopped,3);assert.equal(home.选中的牌组ID,'42');
 assert.deepEqual(home.deckMenuPoint,{x:340,y:580});assert.equal(home.显示牌组详情,undefined);
 row.reorderMode=true;row.handleMouse(event);row.reorderMode=false;row.menuOpen=true;row.handleMouse(event);
 row.menuOpen=false;row.disposed=true;row.handleMouse(event);row.disposed=false;row.handleMouse({...event,windowX:NaN});assert.equal(calls.length,1);
 home.closeHomeActions();assert.equal(home.deckMenuPoint,undefined);home.openDeckMenu('42');assert.equal(home.deckMenuPoint,undefined);
});


test('context menu exposes existing add, subdeck, options and export flows with deck type restrictions',()=>{
 for(const simple of [false,true]) for(const filtered of [false,true]) {
  const {menu,events}=menuHarness();menu.simple=simple;menu.filtered=filtered;
  const ids=menu.menuItems().map(item=>item.id);
  for(const id of ['add_note','export'])assert.ok(ids.includes(id),id);
  for(const id of ['create_child','options'])assert.equal(ids.includes(id),!filtered,id);
  for(const id of ['add_note','create_child','options','export'])menu.selectItem({id});
  assert.deepEqual(events.filter(Array.isArray), (filtered?['add_note','export']:['add_note','create_child','options','export']).map(id=>['42',id]));
 }
});

test('context menu operations retain the right-clicked target across sync and reject deleted or filtered targets',()=>{
 for(const action of ['add_note','create_child','options','export']) {
  const {home,paths,actions,target}=homeHarness();let pending;
  home.deferForSync=callback=>{pending=callback;return true;};
  home.handleDeckMenuAction('42',action);assert.equal(typeof pending,'function',action);
  home.选中的牌组ID='999';home.deferForSync=()=>false;pending();
  if(action==='add_note')assert.deepEqual(paths[0].param,{deckId:'42',deckName:'Alias',deckOptions:[{id:42,name:target.fullName}]});
  if(action==='create_child'){assert.equal(home.创建父牌组ID,'42');assert.equal(home.显示创建牌组,true);}
  if(action==='options')assert.deepEqual(actions.at(-1),['options',42,'Alias']);
  if(action==='export')assert.deepEqual(actions.at(-1),['export','exportDeck',42,false]);
  const deleted=homeHarness();let resume;deleted.home.deferForSync=callback=>{resume=callback;return true;};
  deleted.home.handleDeckMenuAction('42',action);deleted.home.按ID查牌组=()=>({id:''});deleted.home.deferForSync=()=>false;resume();
  assert.deepEqual(deleted.paths,[]);assert.deepEqual(deleted.actions,[]);assert.ok(!deleted.home.显示创建牌组&&!deleted.home.显示牌组选项);
 }
 for(const action of ['create_child','options']) {
  const {home,target}=homeHarness();target.filtered=true;home.handleDeckMenuAction('42',action);
  assert.ok(!home.显示创建牌组&&!home.显示牌组选项);
 }
});

test('Escape closes deck menu levels once per press, and D clears the previous subdeck parent',()=>{
 const source=read('pages/首页.ets'),start=source.indexOf('  private handleHomeKey(');
 const method=source.slice(start,source.indexOf('\n  }',start)+4);
 const Host=new Function('shortcutCommand','HOME_SHORTCUTS','studyEventChord','KeyType',stripTypeScriptTypes('class Host{'+method+'}')+';return Host;')(
  shortcutCommand,HOME_SHORTCUTS,event=>event.chord,{Down:0});
 const {home}=homeHarness(),{menu,events}=menuHarness();
 Object.assign(home,{homeKeys:new KeyboardPressSession(),页面栈:{size:()=>0},deckMenuId:'42',deckMenuBackRequest:0});
 const key={keyCode:1,type:0,chord:'escape'};
 assert.equal(Host.prototype.handleHomeKey.call(home,key),true);assert.equal(home.deckMenuBackRequest,1);
 Host.prototype.handleHomeKey.call(home,key);assert.equal(home.deckMenuBackRequest,1);
 menu.toggleBranch({id:'tone'});menu.handleBack();assert.deepEqual(menu.expandedIds,[]);assert.deepEqual(events,[]);
 Host.prototype.handleHomeKey.call(home,{...key,type:1});Host.prototype.handleHomeKey.call(home,key);assert.equal(home.deckMenuBackRequest,2);
 menu.handleBack();assert.deepEqual(events,['close']);events.length=0;menu.busy=true;menu.handleBack();assert.deepEqual(events,[]);
 home.deckMenuId='';home.创建父牌组ID='42';home.homeActivity=()=>({foreground:true,collectionReady:true});
 Host.prototype.handleHomeKey.call(home,{keyCode:2,type:0,chord:'d'});assert.equal(home.创建父牌组ID,'');assert.equal(home.显示创建牌组,true);
});
