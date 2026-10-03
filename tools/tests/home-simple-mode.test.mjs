// SPDX-License-Identifier: AGPL-3.0-or-later
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { loadPlatformModule } from './platform-module-harness.mjs';
import { visibleInterfaceItems } from '../../entry/src/main/ets/model/AppInterface.ts';

function harness(saved = undefined) {
  const disk = new Map(saved === undefined ? [] : [['simple_mode', saved]]);
  const app = new Map([['abilityContext', {}]]);
  let unreadable = false;
  const store = {
    getSync: (key, fallback) => disk.has(key) ? disk.get(key) : fallback,
    get: async (key, fallback) => disk.has(key) ? disk.get(key) : fallback,
    put: async (key, value) => disk.set(key, value), flush: async () => {}
  };
  const api = loadPlatformModule('model/简洁模式存储.ets',
    '({ initializeSimpleMode, 加载简洁模式, 保存简洁模式 })', {
      AppStorage: { get: key => app.get(key), setOrCreate: (key, value) => app.set(key, value) },
      preferences: {
        getPreferencesSync: () => { if (unreadable) throw Error('unreadable'); return store; },
        getPreferences: async () => store
      }
    });
  const menu = cloudDeck => visibleInterfaceItems('home_create', {
    simple: app.get('simpleMode'), agent: false, cloudDeck, themeHasTextures: false
  }).map(item => item.id);
  return { api, app, disk, menu, failRead: () => { unreadable = true; } };
}

test('a saved experimental mode exposes filtered creation on the first home menu without visiting settings', () => {
  const h = harness(false);
  h.api.initializeSimpleMode();
  assert.equal(h.app.get('simpleMode'), false);
  assert.deepEqual(h.menu(false), ['create_deck', 'import', 'filtered_deck']);
  assert.deepEqual(h.menu(true), ['create_deck', 'import', 'cloud_deck', 'filtered_deck']);
  assert.deepEqual([...h.disk], [['simple_mode', false]], 'initialization must only read saved preferences');
});

test('new and simple installs hide filtered creation; saved mode switches survive a cold restart', async () => {
  for (const value of [undefined, true, 'false']) {
    const h = harness(value);h.api.initializeSimpleMode();
    assert.equal(h.app.get('simpleMode'), true);
    assert.deepEqual(h.menu(true), ['create_deck', 'import', 'cloud_deck']);
  }
  const h = harness();h.api.initializeSimpleMode();
  await h.api.保存简洁模式(false);
  h.app.delete('simpleMode');h.api.initializeSimpleMode();
  assert.equal(h.app.get('simpleMode'), false);assert.equal(h.menu(false).at(-1), 'filtered_deck');
  await h.api.保存简洁模式(true);
  h.app.delete('simpleMode');h.api.initializeSimpleMode();
  assert.equal(h.app.get('simpleMode'), true);assert.ok(!h.menu(false).includes('filtered_deck'));
});

test('startup read failures and absent context preserve the known mode and default new installs to simple', () => {
  const h = harness(false);h.api.initializeSimpleMode();h.failRead();h.api.initializeSimpleMode();
  assert.equal(h.app.get('simpleMode'), false);
  h.app.delete('abilityContext');h.api.initializeSimpleMode();assert.equal(h.app.get('simpleMode'), false);
  const fresh = harness();fresh.app.delete('abilityContext');fresh.api.initializeSimpleMode();
  assert.equal(fresh.app.get('simpleMode'), true);
});

test('ability initializes mode after publishing its context and before creating the first page', () => {
  const source = readFileSync(new URL('../../entry/src/main/ets/entryability/EntryAbility.ets', import.meta.url), 'utf8');
  const onCreate = source.slice(source.indexOf('  onCreate('), source.indexOf('  onNewWant('));
  assert.match(onCreate, /initializeSimpleMode\(\);/);
  assert.ok(onCreate.indexOf("'abilityContext'") < onCreate.indexOf('initializeSimpleMode();'));
});
