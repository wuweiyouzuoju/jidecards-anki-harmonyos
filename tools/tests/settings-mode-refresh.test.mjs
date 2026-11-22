// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { filterSettingsEntries } from '../../entry/src/main/ets/model/SettingsNavigation.ts';
const source = readFileSync(new URL('../../entry/src/main/ets/components/设置面板.ets', import.meta.url), 'utf8');
function method(name) {
  const start = source.indexOf(`  private ${name}(`); assert.ok(start >= 0, name);
  const body = source.indexOf('{', start); let end = body + 1, depth = 1;
  while (depth) { if (source[end] === '{') depth++; else if (source[end] === '}') depth--; end++; }
  return source.slice(start, end);
}
function harness(save = async () => {}) {
  const errors = [];
  const Host = new Function('保存简洁模式', 'showToastSafely', '$r',
    stripTypeScriptTypes(`class Host { ${['sectionContentKey', 'interfaceModeChanged', 'changeInterfaceMode', 'sectionChanged'].map(method).join('\n')} }`, { mode: 'transform' }) + ';return Host;')(
    save, (_context, error) => errors.push(error), resource => resource);
  const host = new Host();
  Object.assign(host, { 简洁模式: true, uiLanguage: 'zh-Hans', activeSection: '', previousSection: '',
    animateSection: true, sectionNavigationReady: true, disposed: false,
    getUIContext: () => ({}), publishInterface: () => { host.publishedMode = host.简洁模式; } });
  // Read the real ForEach input; retained keys deliberately skip rebuilding, as ArkUI does.
  const input = source.match(/ForEach\(\[(this\.[^\]]+)\], \(_section:/); assert.ok(input);
  const actualKey = new Function(`return ${input[1]};`);
  const cache = new Map();
  return { host, errors, render() {
    const key = actualKey.call(host);
    // 目录项的说明随模式变化（如「高级」在简洁版只含排行榜），用它判断内容是否按新模式重建。
    if (!cache.has(key)) cache.set(key, filterSettingsEntries('', host.简洁模式, false, key => key)
      .map(entry => `${entry.id}:${host.简洁模式 ? (entry.simpleDescriptionKey ?? entry.descriptionKey) : entry.descriptionKey}`));
    return cache.get(key);
  } };
}
test('mode changes rebuild the actual keyed content in both directions, even when already in the directory', () => {
  const h = harness();
  const simpleAdvanced = 'advanced:leaderboard_title', fullAdvanced = 'advanced:settings_directory_advanced_hint';
  assert.ok(h.render().includes(simpleAdvanced));
  for (const simple of [false, true, false, true]) {
    h.host.简洁模式 = simple; h.host.interfaceModeChanged();
    assert.ok(h.render().includes(simple ? simpleAdvanced : fullAdvanced));
    assert.equal(h.render().includes(simple ? fullAdvanced : simpleAdvanced), false);
    assert.equal(h.host.publishedMode, simple);
    assert.equal(h.host.animateSection, false);
  }
});
test('switching from a section returns to the updated directory without a stale navigation animation', () => {
  const h = harness(); h.host.activeSection = 'scheduler'; h.host.previousSection = 'scheduler';
  h.host.简洁模式 = false; h.host.interfaceModeChanged(); h.host.sectionChanged();
  assert.equal(h.host.activeSection, ''); assert.equal(h.host.animateSection, false);
  assert.ok(h.render().includes('advanced:settings_directory_advanced_hint'));
  const key = h.host.sectionContentKey(); h.host.activeSection = 'general';
  assert.notEqual(h.host.sectionContentKey(), key);
  const sectionKey = h.host.sectionContentKey(); h.host.uiLanguage = 'en-US';
  assert.notEqual(h.host.sectionContentKey(), sectionKey);
});
test('failed saves preserve the current mode and section and show the failure', async () => {
  const h = harness(async () => { throw Error('disk failure'); }); h.host.activeSection = 'data';
  h.host.changeInterfaceMode(false); await Promise.resolve(); await Promise.resolve();
  assert.equal(h.host.简洁模式, true); assert.equal(h.host.activeSection, 'data');
  assert.equal(h.errors[0].message, 'app.string.settings_local_save_failed');
});
