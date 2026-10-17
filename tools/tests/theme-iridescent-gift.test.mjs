// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadComponentLogic } from './platform-module-harness.mjs';
import { uiFeedback } from './ui-feedback-harness.mjs';
import { surfaceMotionApi } from './motion-harness.mjs';
import { THEME_CATALOG, isThemeAvailable } from '../../entry/src/main/ets/model/ThemeCatalog.ts';

const resource = key => ({ id: key, type: 10003, params: [key] });
const read = path => readFileSync(new URL('../../' + path, import.meta.url), 'utf8');

function appearanceHarness(locale = 'base') {
  const labels = new Map(JSON.parse(read(`entry/src/main/resources/${locale}/element/string.json`)).string.map(x => [x.name, x.value]));
  const ui = { getHostContext: () => ({ resourceManager: {
    getStringByNameSync: name => labels.get(name),
    getStringSync: (key, ...args) => {
      let value = labels.get(key.replace('app.string.', ''));
      for (const arg of args) value = value.replace('%s', String(arg));
      return value;
    }
  } }) };
  const Appearance = loadComponentLogic('components/settings/外观分组.ets', '外观分组', {
    ...uiFeedback, ...surfaceMotionApi(), $r: resource, THEME_CATALOG, isThemeAvailable,
    CustomDialogController: class { constructor() { assert.fail('theme selection must not create a gift popup'); } },
    DialogAlignment: {}, Color: {}
  });
  const component = new Appearance();
  const applied = [];
  component.getUIContext = () => ui;
  component.颜色主题切换回调 = theme => applied.push(theme);
  return { component, applied };
}

test('locked Iridescent retains its label and restores selection without a popup or theme write', () => {
  for (const locale of ['base', 'en_US']) {
    const { component, applied } = appearanceHarness(locale);
    const index = component.displayedThemes().indexOf('iridescent');
    assert.ok(index >= 0);
    assert.equal(component.颜色主题选项().length, THEME_CATALOG.length);
    component.selectColorTheme(component.颜色主题索引());
    assert.equal(component.themeSelectionRevision, 0, 'native Select initialization must not cause a rebuild loop');
    assert.deepEqual(applied, []);
    assert.equal(component.颜色主题选项()[index].value, locale === 'base' ? '幻彩 🔒' : 'Iridescent 🔒 (locked)');
    component.selectColorTheme(index);
    assert.deepEqual(applied, []);
    assert.equal(component.当前颜色主题, 'aurora');
    assert.equal(component.颜色主题索引(), 0);
    assert.equal(component.themeSelectionRevision, 1);
    component.selectColorTheme(-1);
    component.selectColorTheme(THEME_CATALOG.length);
    assert.deepEqual(applied, []);
  }
});

test('restored and newly redeemed entitlement removes the lock and applies Iridescent', () => {
  const { component, applied } = appearanceHarness();
  const index = component.displayedThemes().indexOf('iridescent');
  component.unlockedContents = ['theme-iridescent'];
  assert.equal(component.颜色主题选项()[index].value, '幻彩');
  component.selectColorTheme(index);
  component.selectColorTheme(1);
  assert.deepEqual(applied, ['iridescent', 'forest']);
});

test('retired Iridescent popup copy is absent in both languages and the overview', () => {
  for (const locale of ['base','en_US']) {
    const labels=JSON.parse(read(`entry/src/main/resources/${locale}/element/string.json`)).string;
    assert.deepEqual(labels.filter(item => /^(iridescent_gift_|home_intro_theme_|redemption_contents_|redemption_gift_received$|redemption_contact_developer$|redemption_iridescent_unlocked_)/.test(item.name)), []);
  }
  assert.doesNotMatch(read('entry/src/main/ets/components/HomeIntroPanel.ets'), /home_intro_theme_|IridescentThemePreview/);
});
