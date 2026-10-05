// SPDX-License-Identifier: AGPL-3.0-or-later
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';
import { loadComponentLogic } from './platform-module-harness.mjs';
import { visibleInterfaceItems } from '../../entry/src/main/ets/model/AppInterface.ts';

const source = path => readFileSync(new URL('../../entry/src/main/ets/' + path, import.meta.url), 'utf8');
const List = loadComponentLogic('components/common/ActionMenuList.ets', 'ActionMenuList', {});
const menus = [
  { path: 'components/home/主页更多面板.ets', name: '主页更多面板', surface: 'home_more',
    callbacks: { history:'onHistory', settings: '设置回调',
      stats: '统计回调', reminders: '提醒回调', intro: 'onIntro' } },
  { path: 'components/主页操作面板.ets', name: '主页操作面板', surface: 'home_create',
    callbacks: { create_deck: '创建牌组回调', import: '导入牌组回调', cloud_deck: '获取直链牌组回调',
      filtered_deck: 'onCreateFilteredDeck' } }
];

test('shared action list rejects disabled, removed and unknown entries before forwarding a current ID', () => {
  const list = new List(), selections = [];
  list.onSelect = id => selections.push(id);
  list.items = [{ id: 'import', label: 'Import a deck' }];
  list.selectEntry('import');
  list.items = [{ id: 'import', label: 'Import a deck', available: false }];
  list.selectEntry('import');
  list.items = [];
  list.selectEntry('import'); list.selectEntry('unknown');
  list.items = [{ id: 'create', label: 'Create a deck', available: true }];
  list.selectEntry('create');
  assert.deepEqual(selections, ['import', 'create']);
});

test('both home menus retain registry order, full localized labels, icons and callbacks through the shared list', () => {
  for (const locale of ['base', 'en_US']) {
    const strings = new Map(JSON.parse(readFileSync(new URL(
      `../../entry/src/main/resources/${locale}/element/string.json`, import.meta.url), 'utf8')).string
      .map(entry => [entry.name, entry.value]));
    for (const spec of menus) {
      const Menu = loadComponentLogic(spec.path, spec.name, {
        visibleInterfaceItems, $r: key => key, namedResourceText: (_context, key) => strings.get(key)
      });
      const menu = new Menu(), list = new List(), selections = [], covered = new Set();
      menu.getUIContext = () => undefined;
      for (const [id, callback] of Object.entries(spec.callbacks)) menu[callback] = () => selections.push(id);
      list.onSelect = id => menu.selectItem(id);
      for (const simple of [true, false]) {
        for (const enabled of [true, false]) {
          menu.简洁模式 = simple; menu.Agent入口已启用 = enabled; menu.显示获取直链牌组 = enabled;
          const declarations = visibleInterfaceItems(spec.surface, {
            simple: spec.surface === 'home_create' ? simple : false,
            agent: spec.surface === 'home_more' ? enabled : false,
            cloudDeck: spec.surface === 'home_create' ? enabled : false, themeHasTextures: false
          });
          list.items = menu.menuEntries();
          assert.deepEqual(list.items.map(entry => entry.id), declarations.map(entry => entry.id));
          assert.deepEqual(list.items.map(entry => entry.label), declarations.map(entry => strings.get(entry.titleKey)));
          for (const entry of list.items) {
            covered.add(entry.id);
            assert.match(entry.icon, /^app\.media\.ic_(home|study)_/);
            const name = entry.icon.slice('app.media.'.length);
            for (const theme of ['base', 'dark']) {
              assert.ok(existsSync(new URL(`../../entry/src/main/resources/${theme}/media/${name}.svg`, import.meta.url)));
            }
            const before = selections.length;
            list.selectEntry(entry.id);
            assert.deepEqual(selections.slice(before), [entry.id]);
          }
        }
      }
      assert.deepEqual([...covered].sort(), Object.keys(spec.callbacks).sort());
    }
  }
});

test('home lists delegate row geometry and theme tint to the existing public menu components', () => {
  const shared = source('components/common/ActionMenuList.ets');
  assert.match(shared, /AnchoredMenuItem\(/);
  assert.match(shared, /icon:\s*item\.icon,\s*iconTint:\s*item\.iconTint/);
  assert.match(shared, /available:\s*item\.available !== false/);
  assert.match(shared, /selected:\s*item\.selected === true/);
  assert.match(shared, /divider:\s*index > 0/);
  assert.doesNotMatch(shared, /Image\(|\.padding\(|\.margin\(|\.fontSize\(|\.fillColor\(/);
  for (const menu of menus) {
    const host = source(menu.path);
    assert.match(host, /ActionMenuList\(\{ items: this\.menuEntries\(\), onSelect:/);
    assert.doesNotMatch(host, /AnchoredMenuItem\(|ForEach\(/);
  }
});
