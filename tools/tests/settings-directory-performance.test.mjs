// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { filterSettingsEntries, settingsEntryVisible, SETTINGS_ENTRIES } from '../../entry/src/main/ets/model/SettingsNavigation.ts';

test('empty directory queries never read search resources and retain visibility gates', () => {
  for (const simple of [false, true]) for (const agent of [false, true]) {
    for (const query of ['', '  \t\n']) {
      assert.deepEqual(filterSettingsEntries(query, simple, agent, () => assert.fail('unneeded resource read')),
        SETTINGS_ENTRIES.filter(entry => settingsEntryVisible(entry, simple, agent)));
    }
  }
});

// Execute the actual component method to cover repeated layout reads and cache invalidation.
const source = readFileSync(new URL('../../entry/src/main/ets/components/设置面板.ets', import.meta.url), 'utf8');
const start = source.indexOf('  private directoryEntries():');
assert.ok(start >= 0);
const body = source.indexOf('{', start);
let end = body + 1, depth = 1;
while (depth) { if (source[end] === '{') depth++; else if (source[end] === '}') depth--; end++; }
const Host = new Function('filterSettingsEntries', stripTypeScriptTypes(
  `class Host { ${source.slice(start, end)} }`, { mode: 'transform' }) + '; return Host;')(filterSettingsEntries);

test('directory layout reuses search results and invalidates on query, mode, permission and language', () => {
  let reads = 0;
  const host = new Host();
  Object.assign(host, { settingsQuery: 'FSRS', 简洁模式: false, Agent入口已启用: false, uiLanguage: 'zh-Hans',
    directoryQueryKey: '', directoryQueryEntries: [],
    sectionText: key => {
      reads++;
      if (key === 'deck_fsrsParameters_label') return host.uiLanguage === 'zh-Hans' ? 'FSRS' : 'algorithm';
      if (key === 'ai_agent_settings_title') return 'assistant';
      return key;
    } });
  const first = host.directoryEntries();
  assert.deepEqual(first.map(entry => entry.id), ['scheduler']);
  assert.ok(reads > 0);
  const initialReads = reads;
  for (let index = 0; index < 100; index++) assert.equal(host.directoryEntries(), first);
  assert.equal(reads, initialReads, 'layout must not repeat resource scans');
  host.简洁模式 = true;
  assert.deepEqual(host.directoryEntries(), []);
  host.简洁模式 = false;
  assert.deepEqual(host.directoryEntries().map(entry => entry.id), ['scheduler']);
  host.uiLanguage = 'en-US';
  assert.deepEqual(host.directoryEntries(), []);
  host.settingsQuery = 'assistant';
  assert.deepEqual(host.directoryEntries(), []);
  host.Agent入口已启用 = true;
  assert.deepEqual(host.directoryEntries().map(entry => entry.id), ['ai']);
  host.settingsQuery = '';
  const beforeEmpty = reads;
  assert.equal(host.directoryEntries().length, SETTINGS_ENTRIES.length);
  assert.equal(reads, beforeEmpty);
});

test('opening settings uses the live mode and selects its initial section before the first build', () => {
  const signature = source.match(/(?:async )?aboutToAppear\(\)[^{]*\{/);
  assert.ok(signature);
  const start = signature.index;
  let end = start + signature[0].length, depth = 1;
  while (depth) { if (source[end] === '{') depth++; else if (source[end] === '}') depth--; end++; }
  const Panel = new Function('AppStorage', '加载简洁模式',
    stripTypeScriptTypes(`class Panel { ${source.slice(start, end)} }`, { mode: 'transform' }) + '; return Panel;')(
    { setOrCreate: () => assert.fail('opening must not overwrite live mode') },
    () => assert.fail('mode is restored by EntryAbility, not each settings visit'));
  for (const simple of [true, false]) {
    const events = [], panel = new Panel();
    Object.assign(panel, { disposed: true, lifecycleVersion: 0, 简洁模式: simple, openAiSettings: false,
      initialSectionId: 'data', initialActionId: 'media', activeSection: '',
      publishInterface: () => {}, maintenanceSession: { attach: () => events.push('attached') },
      directoryEntries: () => filterSettingsEntries('', simple, false, () => assert.fail()),
      openSection: id => { panel.activeSection = id; events.push(id); } });
    assert.equal(panel.aboutToAppear(), undefined, 'initial navigation must not wait for preferences');
    assert.equal(panel.简洁模式, simple);
    assert.deepEqual(events, ['attached', 'data']);
    assert.equal(panel.显示媒体管理, true);
    assert.equal(panel.previousSection, 'data');
    assert.equal(panel.sectionNavigationReady, true);
  }
});
