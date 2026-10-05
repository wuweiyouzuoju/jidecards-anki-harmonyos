// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadComponentLogic, loadPlatformModule } from './platform-module-harness.mjs';
import { uiFeedback } from './ui-feedback-harness.mjs';
import { THEME_CATALOG, isThemeAvailable, UNLOCKED_CONTENTS_KEY } from '../../entry/src/main/ets/model/ThemeCatalog.ts';
import { OFFICIAL_QQ_GROUP } from '../../entry/src/main/ets/model/OfficialCommunity.ts';
import { themeDefinition } from '../../entry/src/main/ets/model/ThemeCatalog.ts';
import { 规范化主题模式, 解析是否深色 } from '../../entry/src/main/ets/model/主题设置.ets';
import JSON5 from 'json5';
import { HomeStartupSequence } from '../../entry/src/main/ets/model/HomeStartupSequence.ts';

const resource = key => ({ id: key, type: 10003, params: [key] });
const read = path => readFileSync(new URL('../../' + path, import.meta.url), 'utf8');

test('both languages use the current application version in gift and eligibility text', () => {
  const version = JSON5.parse(read('AppScope/app.json5')).app.versionName;
  for (const locale of ['base', 'en_US']) {
    const labels = new Map(JSON.parse(read(`entry/src/main/resources/${locale}/element/string.json`)).string.map(x => [x.name, x.value]));
    for (const key of ['iridescent_gift_announcement', 'redemption_contents_eligibility']) {
      assert.ok(labels.get(key).includes(version), `${locale}/${key} must describe the current version`);
      assert.ok(labels.get(key).includes('3.0.0'), 'gift eligibility remains unchanged');
    }
  }
});

test('overview and both gift dialog modes share the existing theme screenshot renderer', () => {
  const preview = read('entry/src/main/ets/components/common/IridescentThemePreview.ets');
  assert.match(preview, /Image\(\$r\('app.media.iridescent_preview'\)\)/);
  assert.match(preview, /aspectRatio\(1320 \/ 2856\)/);
  assert.match(preview, /maxWidth: 260/);
  assert.match(preview, /accessibilityText\(\$r\('app.string.home_intro_theme_preview'\)\)/);
  for (const name of ['HomeIntroPanel', 'IridescentGiftPanel']) {
    const panel = read(`entry/src/main/ets/components/${name}.ets`);
    assert.match(panel, /IridescentThemePreview\(\)/);
    assert.doesNotMatch(panel, /Image\(\$r\('app.media.iridescent_preview'\)\)/);
  }
});

test('locked dialog is declared as CustomDialog and embeds the same gift panel', () => {
  const dialog = read('entry/src/main/ets/components/IridescentGiftDialog.ets');
  assert.match(dialog, /@CustomDialog\s+export struct IridescentGiftDialog/);
  assert.match(dialog, /IridescentGiftPanel\(\{ onClose:/);
  assert.match(read('entry/src/main/ets/components/settings/外观分组.ets'), /builder: IridescentGiftDialog\(/);
});

test('gift labels use the Iridescent catalog colors even while a regular theme is active', () => {
  const Panel = loadComponentLogic('components/IridescentGiftPanel.ets', 'IridescentGiftPanel', {
    颜色键: {动作主色: 'primary'}, themeDefinition, 规范化主题模式, 解析是否深色
  });
  const panel = new Panel();
  for (const dark of [false, true]) {
    panel.themeMode = 'system'; panel.systemDark = dark;
    assert.deepEqual(panel.iridescentTextColors(), dark ? themeDefinition('iridescent').darkActionColors : themeDefinition('iridescent').lightActionColors);
    panel.themeMode = dark ? 'light' : 'dark';
    assert.deepEqual(panel.iridescentTextColors(), dark ? themeDefinition('iridescent').lightActionColors : themeDefinition('iridescent').darkActionColors);
  }
});

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
    ...uiFeedback, $r: resource, THEME_CATALOG, isThemeAvailable,
    CustomDialogController: class { open() { this.isOpen = true; } close() { this.isOpen = false; } },
    IridescentGiftDialog: () => ({}), DialogAlignment: {}, Color: {}
  });
  const component = new Appearance();
  const applied = [];
  component.getUIContext = () => ui;
  component.颜色主题切换回调 = theme => applied.push(theme);
  return { component, applied };
}

test('locked Iridescent remains visible, opens the gift dialog and never applies a theme', () => {
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
    assert.equal(component.giftDialog.isOpen, true);
    assert.equal(component.当前颜色主题, 'aurora');
    assert.equal(component.颜色主题索引(), 0);
    assert.equal(component.themeSelectionRevision, 1);
    component.aboutToDisappear();
    assert.equal(component.giftDialog.isOpen, false);
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
  assert.notEqual(component.giftDialog.isOpen, true);
});

function noticeHarness() {
  const values = new Map(), storage = new Map([['abilityContext', {}]]);
  let fail = false, restore = async () => {};
  const store = { getSync: (key, fallback) => values.get(key) ?? fallback,
    putSync: (key, value) => values.set(key, value), flush: async () => { if (fail) throw Error('disk'); } };
  const api = loadPlatformModule('utils/IridescentGiftStore.ets', '{ isIridescentGiftNoticeCompleted, completeIridescentGiftNotice }', {
    preferences: { getPreferencesSync: () => store }, AppStorage: { get: key => storage.get(key) },
    initializeRedemption: () => restore(), isThemeAvailable, UNLOCKED_CONTENTS_KEY
  });
  return { api, storage, values, fail: () => { fail = true; }, recover: () => { fail = false; },
    restore: fn => { restore = fn; } };
}

test('notice waits for verified entitlement and skips existing owners', async () => {
  const h = noticeHarness();
  let finish;
  h.restore(() => new Promise(resolve => { finish = resolve; }));
  let settled = false;
  const pending = h.api.isIridescentGiftNoticeCompleted().then(value => { settled = true; return value; });
  await Promise.resolve(); assert.equal(settled, false);
  h.storage.set(UNLOCKED_CONTENTS_KEY, ['theme-iridescent']); finish();
  assert.equal(await pending, true);
  assert.equal(h.values.size, 0);
});

test('the original 2.9.9 notice record suppresses the gift after the wording version changes', async () => {
  const h = noticeHarness();
  h.values.set('iridescent_gift_notice_299_completed', true);
  for (let launch = 0; launch < 2; launch++) {
    const sequence = new HomeStartupSequence();
    await sequence.start({
      canPresent: () => true, checkAnnouncement: async () => false, activateAnnouncementChecks() {},
      cloudCompleted: async () => true, introCompleted: async () => true,
      giftCompleted: h.api.isIridescentGiftNoticeCompleted,
      showCloud: () => assert.fail('cloud intro is complete'), showIntro: () => assert.fail('intro is complete'),
      showGift: () => assert.fail('users with the original seen record must not see the gift again')
    });
    assert.equal(sequence.hasPending(), false);
  }
  assert.deepEqual([...h.values], [['iridescent_gift_notice_299_completed', true]]);
});

test('unowned users get one notice; failed confirmation rolls back and remains retryable', async () => {
  const h = noticeHarness();
  assert.equal(await h.api.isIridescentGiftNoticeCompleted(), false);
  h.fail(); await assert.rejects(h.api.completeIridescentGiftNotice());
  assert.equal(await h.api.isIridescentGiftNoticeCompleted(), false);
  h.recover(); await h.api.completeIridescentGiftNotice();
  assert.equal(await h.api.isIridescentGiftNoticeCompleted(), true);
  assert.equal(h.storage.has(UNLOCKED_CONTENTS_KEY), false, 'confirmation never grants a theme');
  h.restore(async () => { throw Error('receipt read failed'); });
  await assert.rejects(h.api.isIridescentGiftNoticeCompleted(), /receipt read failed/);
});

test('gift dialog copies only the official group and reports clipboard failure', async () => {
  const copied = [], messages = []; let fail = false;
  const Panel = loadComponentLogic('components/IridescentGiftPanel.ets', 'IridescentGiftPanel', {
    OFFICIAL_QQ_GROUP, 颜色键: { 动作主色: 'primary' }, $r: resource,
    pasteboard: { MIMETYPE_TEXT_PLAIN: 'text/plain', createData: (_type, value) => value,
      getSystemPasteboard: () => ({ setData: async value => { if (fail) throw Error('clipboard'); copied.push(value); } }) },
    showToastSafely: (_ui, options) => messages.push(options.message.params[0])
  });
  const panel = new Panel(); panel.getUIContext = () => ({});
  await panel.copyGroup(); fail = true; await panel.copyGroup();
  assert.deepEqual(copied, ['726837065']);
  assert.deepEqual(messages, ['app.string.about_qq_group_copied', 'app.string.redemption_copy_failed']);
});
