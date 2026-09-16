// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { normalizeSyncServer, SyncActivity } from '../../entry/src/main/ets/model/SyncSettings.ts';

test('custom sync URLs preserve proxy paths and normalize trailing slashes', () => {
  for (const [input, output] of [
    ['', ''], ['  ', ''], [' HTTPS://Sync.EXAMPLE.com ', 'https://sync.example.com/'],
    ['http://192.168.1.200:8080', 'http://192.168.1.200:8080/'],
    ['https://example.com/Anki', 'https://example.com/Anki/'],
    ['https://example.com/Anki/', 'https://example.com/Anki/'],
    ['http://[::1]:8080/', 'http://[::1]:8080/'], ['http://server.local:8000/', 'http://server.local:8000/']
  ]) assert.equal(normalizeSyncServer(input), output);
});

test('invalid URLs never reach the sync backend', () => {
  for (const value of ['server.local:8080', 'file:///tmp', 'ftp://host/', 'https://',
    'https://user:pass@host/', 'https://host/?token=secret', 'https://host/#fragment',
    'https://host:0/', 'https://host:65536/', 'https://host:abc/', 'https://host/path with space',
    'https://host\\other/', 'https://host/../', 'https://host/%2e%2e/', 'https://host/%zz/',
    'https://host/%00/', 'https://ho\nst/', 'https://./']) {
    assert.throws(() => normalizeSyncServer(value), undefined, value);
  }
});

test('manual and automatic sync share a lease and cooldown without losing a queued request', () => {
  const gate = new SyncActivity(), manual = {}, automatic = {};
  assert.equal(gate.canAutoSync(0), true);
  assert.equal(gate.acquire(manual), true);
  assert.equal(gate.acquire(automatic), false);
  gate.release(automatic, 500);
  assert.equal(gate.canAutoSync(100000), false);
  gate.release(manual, 1000);
  assert.equal(gate.canAutoSync(30999), false);
  assert.equal(gate.canAutoSync(31000), true);
  assert.equal(gate.acquire(automatic), true);
  assert.equal(gate.acquire(manual), false);
  gate.release(automatic, 40000);
  assert.equal(gate.canAutoSync(100), true, 'a wall clock correction must not suppress sync indefinitely');
});

function preferencesHarness() {
  const source = readFileSync(new URL('../../entry/src/main/ets/model/同步凭证存储.ets', import.meta.url), 'utf8')
    .replace(/^import .*;\r?\n/gm, '').replace(/export /g, '');
  const state = { values: new Map(), durable: new Map(), fail: false };
  const store = {
    getSync: (key, fallback) => state.values.has(key) ? state.values.get(key) : fallback,
    putSync: (key, value) => state.values.set(key, value),
    deleteSync: key => state.values.delete(key),
    flush: async () => { if (state.fail) throw new Error('disk full'); state.durable = new Map(state.values); }
  };
  const names = ['loadCustomSyncServer', 'saveCustomSyncServer', 'loadAutoSyncEnabled', 'saveAutoSyncEnabled',
    '保存同步凭证', '加载同步凭证', '保存同步端点', '清除同步凭证', '设置媒体待同步', '加载媒体待同步'];
  const api = new Function('preferences', 'AppStorage', 'hilog', 'normalizeSyncServer',
    stripTypeScriptTypes(source, { mode: 'transform' }) + '\nreturn {' + names.join(',') + '};')(
    { getPreferencesSync: () => store }, { get: () => ({}) }, { info() {}, error() {} }, normalizeSyncServer);
  return { state, ...api };
}

test('custom configuration survives redirects/logout; switching servers drops old credentials and pending media', async () => {
  const h = preferencesHarness();
  assert.equal(h.loadAutoSyncEnabled(), true);
  assert.equal(h.loadCustomSyncServer(), '');
  await h.saveCustomSyncServer('https://one.example/anki');
  h.保存同步凭证({ username: 'user', hkey: 'one-only', endpoint: 'https://one.example/anki/' });
  h.保存同步端点('https://redirect.example/');
  assert.equal(h.loadCustomSyncServer(), 'https://one.example/anki/');
  assert.equal(h.加载同步凭证().endpoint, 'https://redirect.example/');
  h.清除同步凭证();
  assert.equal(h.加载同步凭证(), null);
  assert.equal(h.loadCustomSyncServer(), 'https://one.example/anki/');
  h.保存同步凭证({ username: 'user', hkey: 'one-only', endpoint: 'https://one.example/anki/' });
  h.设置媒体待同步(true);
  await h.saveCustomSyncServer('https://two.example/');
  assert.equal(h.加载同步凭证(), null);
  assert.equal(h.加载媒体待同步(), false);
  assert.equal(h.loadCustomSyncServer(), 'https://two.example/');
  await h.saveAutoSyncEnabled(true);
  await h.saveCustomSyncServer('');
  assert.equal(h.loadCustomSyncServer(), '');
  assert.equal(h.loadAutoSyncEnabled(), true);
  assert.equal([...h.state.durable.keys()].some(key => /password/.test(key)), false);
});

test('settings failures leave previous server/session and auto-sync preference intact', async () => {
  const h = preferencesHarness();
  await h.saveCustomSyncServer('https://one.example/');
  h.保存同步凭证({ username: 'user', hkey: 'one-only', endpoint: 'https://one.example/' });
  h.设置媒体待同步(true);
  h.state.fail = true;
  await assert.rejects(h.saveCustomSyncServer('https://two.example/'), /disk full/);
  assert.equal(h.loadCustomSyncServer(), 'https://one.example/');
  assert.equal(h.加载同步凭证().hkey, 'one-only');
  assert.equal(h.加载媒体待同步(), true);
  await assert.rejects(h.saveAutoSyncEnabled(false), /disk full/);
  assert.equal(h.loadAutoSyncEnabled(), true);
  await assert.rejects(h.saveCustomSyncServer('not-a-url'));
  assert.equal(h.loadCustomSyncServer(), 'https://one.example/');
  h.state.fail = false;
  await h.saveCustomSyncServer('https://two.example/');
  assert.equal(h.加载同步凭证(), null);
});

test('automatic sync defaults on while an explicit saved opt-out survives reload and logout', async () => {
  const h = preferencesHarness();
  assert.equal(h.loadAutoSyncEnabled(), true);
  await h.saveAutoSyncEnabled(false);
  h.state.values = new Map(h.state.durable);
  h.清除同步凭证();
  assert.equal(h.loadAutoSyncEnabled(), false);
  await h.saveAutoSyncEnabled(true);
  assert.equal(h.loadAutoSyncEnabled(), true);
});
