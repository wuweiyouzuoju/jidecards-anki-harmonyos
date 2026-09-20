// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dueOverview, forecastAverage } from '../../entry/src/main/ets/model/StatsOverview.ts';
import { browserFilterNode, BROWSER_QUICK_FILTERS } from '../../entry/src/main/ets/model/BrowserQuickFilter.ts';
import { filterSettingsEntries, SETTINGS_ENTRIES } from '../../entry/src/main/ets/model/SettingsNavigation.ts';
import { SearchNodeJoiner, encodeSearchNode, decodeSearchNode } from '../../entry/src/main/ets/proto/messages/SearchMessages.ts';

test('due overview counts backlog once, excludes future days and distinguishes unavailable data', () => {
  assert.equal(dueOverview(null), null);
  assert.equal(dueOverview({ futureDue: null }), null);
  assert.deepEqual(dueOverview({ futureDue: new Map() }), { due: 0, overdue: 0 });
  assert.deepEqual(dueOverview({ futureDue: new Map([[-8, 4], [-1, 3], [0, 2], [1, 10], [30, 20]]) }),
    { due: 9, overdue: 7 });
});

test('nonzero forecast averages never masquerade as zero', () => {
  assert.equal(forecastAverage(4, 32), '0.1');
  assert.equal(forecastAverage(1, 366), '<0.1');
  assert.equal(forecastAverage(0, 32), '0');
  assert.equal(forecastAverage(128, 32), '4');
});

test('quick filters preserve complex searches and roundtrip their AND group', () => {
  const original = 'deck:"Law" OR tag:important';
  for (const filter of BROWSER_QUICK_FILTERS.slice(1)) {
    const result = browserFilterNode(original, filter.id);
    assert.equal(result.group.joiner, SearchNodeJoiner.AND);
    assert.deepEqual(result.group.nodes.map(node => node.text), [original, filter.query]);
    const decoded = decodeSearchNode(encodeSearchNode(result).转为字节());
    assert.equal(decoded.kind, 'group');
    assert.deepEqual(decoded.group, result.group);
  }
  assert.equal(browserFilterNode(original, 'all').text, original);
  assert.equal(browserFilterNode('', 'due').text, 'is:due');
  assert.equal(browserFilterNode(original, 'invalid').text, original);
});

test('localized settings search respects simple and developer gates', () => {
  for (const locale of ['base', 'en_US']) {
    const values = new Map(JSON.parse(readFileSync(new URL(`../../entry/src/main/resources/${locale}/element/string.json`, import.meta.url))).string.map(item => [item.name, item.value]));
    const localize = key => { assert.ok(values.has(key), key); return values.get(key); };
    SETTINGS_ENTRIES.forEach(entry => { localize(entry.titleKey); localize(entry.descriptionKey); if (entry.simpleDescriptionKey) localize(entry.simpleDescriptionKey); });
    assert.equal(filterSettingsEntries('', false, true, localize).length, SETTINGS_ENTRIES.length);
    const simple = filterSettingsEntries('', true, false, localize).map(entry => entry.id);
    assert.ok(!simple.includes('scheduler') && !simple.includes('ai'));
    assert.deepEqual(simple, ['general', 'sync', 'appearance', 'controls', 'data', 'help', 'redemption', 'about']);
    for (const simpleMode of [true, false]) {
      for (const query of (locale === 'base' ? ['指纹', '识别码', '兑换'] : ['fingerprint', 'app ID', 'redeem'])) {
        assert.deepEqual(filterSettingsEntries(query, simpleMode, false, localize).map(entry => entry.id), ['redemption']);
      }
    }
    assert.deepEqual(filterSettingsEntries(locale === 'base' ? '答题工具栏' : 'answer toolbar', true, false, localize).map(entry => entry.id), ['appearance']);
    assert.deepEqual(filterSettingsEntries(locale === 'base' ? '复习布局' : 'review layout', false, false, localize).map(entry => entry.id), ['appearance']);
    assert.deepEqual(filterSettingsEntries(locale === 'base' ? '评分振动' : 'answer vibration', true, false, localize).map(entry => entry.id), ['controls']);
    assert.deepEqual(filterSettingsEntries(locale === 'base' ? '分区点击' : 'tap zones', true, false, localize), []);
    assert.deepEqual(filterSettingsEntries(locale === 'base' ? '自定义服务器' : 'custom server', true, false, localize).map(entry => entry.id), ['sync']);
    assert.ok(simple.includes('controls') && !simple.includes('advanced'));
    assert.ok(simple.includes('about') && simple.includes('sync'));
    assert.deepEqual(filterSettingsEntries('FsRs', false, false, localize).map(entry => entry.id), ['scheduler']);
    assert.deepEqual(filterSettingsEntries(locale === 'base' ? '字体' : 'FONT', true, false, localize).map(entry => entry.id), ['appearance']);
    assert.deepEqual(filterSettingsEntries('zzzzunmatched', false, true, localize), []);
  }
});
