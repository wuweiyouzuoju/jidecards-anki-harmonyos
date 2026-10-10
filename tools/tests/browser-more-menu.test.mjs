// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { browserInterfaceMenu, AppInterfaceTracker, visibleInterfaceItems } from '../../entry/src/main/ets/model/AppInterface.ts';
import { actionMenuRows, visibleActionMenuRows, toggleActionMenuBranch } from '../../entry/src/main/ets/components/common/ActionMenuTree.ts';
import { loadComponentLogic, loadPlatformModule } from './platform-module-harness.mjs';

function harness(locale = 'base') {
  const strings = new Map(JSON.parse(readFileSync(new URL(
    `../../entry/src/main/resources/${locale}/element/string.json`, import.meta.url), 'utf8')).string.map(e => [e.name, e.value]));
  const tracker = new AppInterfaceTracker();
  const dependencies = { browserInterfaceMenu, visibleInterfaceItems, actionMenuRows, visibleActionMenuRows, toggleActionMenuBranch,
    appInterface: tracker, namedResourceText: (_, key) => strings.get(key),
    localizedNamedResourceText: (_, language, key) => strings.get(key),
    actionIcon: loadPlatformModule('utils/ActionIcons.ets', 'actionIcon', { $r: key => key }) };
  const More = loadComponentLogic('components/browser/BrowserMoreMenu.ets', 'BrowserMoreMenu', dependencies);
  const menu = new More(); menu.getUIContext = () => ({}); menu.filterActive = true;
  return { menu, tracker, dependencies, strings };
}

test('seven main entries retain all previous actions through one mutually exclusive child panel', () => {
  for (const locale of ['base', 'en_US']) {
    const { menu, tracker, strings } = harness(locale), calls = [];
    const root = menu.entries();
    assert.deepEqual(root.map(e => e.id), ['filter', 'select_all', 'find_replace', 'search_tools', 'display_settings', 'history', 'more_settings']);
    const callbacks = { filter:'onFilter', select_all:'onSelectAll', find_replace:'onFindReplace', history:'onHistory',
      save_search:'onSaveSearch', flag_names:'onFlagNames' };
    for (const [id, callback] of Object.entries(callbacks)) menu[callback] = () => calls.push(id);
    menu.onDisplay = kind => calls.push(kind); menu.onSubtitle = index => calls.push(index);
    for (const item of root.flatMap(item => [item, ...(item.children ?? [])])) {
      assert.ok(item.icon?.startsWith('app.media.'), item.id);
      assert.ok(typeof item.value === 'string' && item.value.length > 0, item.id);
    }
    menu.aboutToAppear();
    assert.deepEqual(tracker.snapshot().map(e => e.surface), ['browser_more']);
    for (const id of ['filter', 'select_all', 'find_replace', 'history']) menu.selectItem(id);
    menu.selectItem('columns'); assert.equal(calls.length, 4, 'closed children reject delayed selection');
    menu.selectItem('search_tools');
    assert.equal(menu.entries().find(e => e.id === 'search_tools').value, strings.get('browser_search_tools'));
    menu.publishInterface(); assert.ok(tracker.snapshot().some(e => e.surface === 'browser_search_tools'));
    for (const id of ['search_options', 'recent_searches', 'save_search']) menu.selectItem(id);
    menu.selectItem('display_settings'); menu.publishInterface();
    assert.deepEqual(menu.expandedIds, ['display_settings']);
    assert.ok(!tracker.snapshot().some(e => e.surface === 'browser_search_tools'));
    menu.selectItem('save_search'); assert.equal(calls.length, 7);
    for (const id of ['columns', 'subtitle_deck', 'subtitle_answer', 'subtitle_due']) menu.selectItem(id);
    menu.selectItem('more_settings');
    for (const id of ['flag_names', 'keyboard']) menu.selectItem(id);
    assert.deepEqual(calls, ['filter','select_all','find_replace','history','search','recent','save_search','columns',1,4,2,'flag_names','keyboard']);
    let closed = 0; menu.onClose = () => closed++;
    menu.handleBackRequest(); assert.deepEqual(menu.expandedIds, []); assert.equal(closed, 0);
    menu.handleBackRequest(); assert.equal(closed, 1);
    menu.aboutToDisappear(); assert.equal(tracker.snapshot().length, 0);
  }
});

test('save requires a current filter; display choices retain exact single selection and busy boundaries', () => {
  const { menu } = harness(), calls = [];
  menu.onSaveSearch = () => calls.push('save'); menu.onSubtitle = value => calls.push(value);
  menu.filterActive = false; menu.selectItem('search_tools'); menu.selectItem('save_search'); assert.deepEqual(calls, []);
  for (const index of [1,4,2]) {
    menu.subtitleIndex = index;
    const entries = menu.entries().find(e => e.id === 'display_settings').children;
    assert.equal(entries.filter(e => e.selected).length, 1);
    assert.ok(entries.filter(e => e.id.startsWith('subtitle_')).every(e => e.showSelectionMark));
  }
  menu.available = false; menu.selectItem('display_settings'); menu.selectItem('subtitle_due');
  assert.deepEqual(calls, [2]);
  menu.onDisplay = () => assert.fail('column editing must stay disabled while unavailable'); menu.selectItem('columns');
});

test('search options and recent queries use distinct real dialog contents and JIDE observations', () => {
  const { dependencies, tracker } = harness();
  const Dialog = loadComponentLogic('components/browser/BrowserDisplayDialog.ets', 'BrowserDisplayDialog', dependencies);
  const dialog = new Dialog(); dialog.getUIContext = () => ({}); dialog.recentSearches = ['deck:French', 'tag:today'];
  dialog.kind = 'search'; dialog.aboutToAppear();
  let view = tracker.snapshot()[0]; assert.equal(view.surface, 'browser_search_options');
  assert.deepEqual(view.optionIds, []); assert.deepEqual(view.items.map(e => e.id), ['ignore_accents','builder','close']);
  dialog.aboutToDisappear(); dialog.kind = 'recent'; dialog.aboutToAppear();
  view = tracker.snapshot()[0]; assert.equal(view.surface, 'browser_recent_searches');
  assert.deepEqual(view.optionIds, ['0','1']); assert.deepEqual(view.optionLabels, dialog.recentSearches);
  dialog.aboutToDisappear(); assert.equal(tracker.snapshot().length, 0);
});
