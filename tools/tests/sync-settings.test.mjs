// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { normalizeSyncServer, isSyncEndpointVisible, SyncActivity } from '../../entry/src/main/ets/model/SyncSettings.ts';
import { componentMethods, settle } from './sync-panel-harness.mjs';

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

function preferencesHarness(officialUiEnabled = false) {
  const source = readFileSync(new URL('../../entry/src/main/ets/model/同步凭证存储.ets', import.meta.url), 'utf8')
    .replace(/^import .*;\r?\n/gm, '').replace(/export /g, '');
  const state = { values: new Map(), durable: new Map(), fail: false, readFail: false, unavailable: false };
  const store = {
    getSync: (key, fallback) => { if (state.readFail) throw new Error('read failed'); return state.values.has(key) ? state.values.get(key) : fallback; },
    putSync: (key, value) => state.values.set(key, value),
    deleteSync: key => state.values.delete(key),
    flush: async () => { if (state.fail) throw new Error('disk full'); state.durable = new Map(state.values); }
  };
  const names = ['loadCustomSyncServer', 'saveCustomSyncServer', 'loadAutoSyncEnabled', 'saveAutoSyncEnabled',
    'loadVisibleSyncAuth', '保存同步凭证', '加载同步凭证', '保存同步端点', '清除同步凭证', '设置媒体待同步', '加载媒体待同步'];
  const api = new Function('preferences', 'AppStorage', 'hilog', 'normalizeSyncServer', 'isSyncEndpointVisible', 'OFFICIAL_ANKIWEB_SYNC_UI_ENABLED',
    stripTypeScriptTypes(source, { mode: 'transform' }) + '\nreturn {' + names.join(',') + '};')(
    { getPreferencesSync: () => { if (state.unavailable) throw Error('unavailable'); return store; } },
    { get: () => ({}) }, { info() {}, error() {}, warn() {} }, normalizeSyncServer, isSyncEndpointVisible, officialUiEnabled);
  return { state, ...api };
}

test('custom configuration survives redirects/logout; switching servers drops old credentials and pending media', async () => {
  const h = preferencesHarness();
  assert.equal(h.loadAutoSyncEnabled(), false);
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
  await h.saveAutoSyncEnabled(true);
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

test('unreadable preferences cannot enable auto sync or fall back to another server', async () => {
  const h = preferencesHarness();
  await h.saveCustomSyncServer('https://private.example/');
  h.state.readFail = true;
  assert.throws(() => h.loadCustomSyncServer(), /read failed/);
  assert.equal(h.loadAutoSyncEnabled(), false);
  await assert.rejects(h.saveCustomSyncServer(''), /read failed/);
  h.state.readFail = false;
  assert.equal(h.loadCustomSyncServer(), 'https://private.example/');
});

test('automatic sync defaults off and explicit choices survive reload and logout', async () => {
  const h = preferencesHarness();
  assert.equal(h.loadAutoSyncEnabled(), false);
  await h.saveAutoSyncEnabled(false);
  h.state.values = new Map(h.state.durable);
  h.清除同步凭证();
  assert.equal(h.loadAutoSyncEnabled(), false);
  await h.saveAutoSyncEnabled(true);
  h.state.values = new Map(h.state.durable);
  h.清除同步凭证();
  assert.equal(h.loadAutoSyncEnabled(), true);
});

test('upgrade ignores legacy automatic opt-in until the user confirms again', async () => {
  const h = preferencesHarness();
  h.state.values.set('auto_sync_enabled', true);
  h.保存同步凭证({ username: 'user', hkey: 'existing-key', endpoint: 'https://sync.example/' });
  h.设置媒体待同步(true);
  h.state.values = new Map(h.state.durable);
  assert.equal(h.loadAutoSyncEnabled(), false, 'legacy opt-in must not survive the upgrade');
  assert.equal(h.加载同步凭证().hkey, 'existing-key');
  assert.equal(h.加载媒体待同步(), true);
  h.state.fail = true;
  await assert.rejects(h.saveAutoSyncEnabled(true), /disk full/);
  assert.equal(h.loadAutoSyncEnabled(), false);
  h.state.fail = false;
  await h.saveAutoSyncEnabled(true);
  h.state.values = new Map(h.state.durable);
  assert.equal(h.loadAutoSyncEnabled(), true, 'new consent persists across restarts');
  await h.saveAutoSyncEnabled(false);
  h.state.values = new Map(h.state.durable);
  assert.equal(h.loadAutoSyncEnabled(), false, 'legacy true cannot override a new opt-out');
});

test('unavailable storage and failed first opt-in keep automatic sync disabled', async () => {
  const h = preferencesHarness();
  h.state.unavailable = true;
  assert.equal(h.loadAutoSyncEnabled(), false);
  h.state.unavailable = false;
  h.state.fail = true;
  await assert.rejects(h.saveAutoSyncEnabled(true), /disk full/);
  assert.equal(h.loadAutoSyncEnabled(), false);
});

function autoSyncSettingHarness() {
  const source = readFileSync(new URL('../../entry/src/main/ets/components/settings/同步分组.ets', import.meta.url), 'utf8');
  const state = { dialogs: [], saves: [], fail: false };
  const Group = componentMethods(source, ['changeAutoSync', 'aboutToDisappear'], {
    $r: key => key, DialogAlignment: { Center: 'center' },
    saveAutoSyncEnabled: async enabled => {
      state.saves.push(enabled);
      if (state.fail) throw Error('disk full');
    }
  });
  const group = new Group();
  Object.assign(group, {
    autoSyncEnabled: false, disposed: false, settingsSaving: false,
    错误文本: '', 取本地化文本: key => key,
    getUIContext: () => ({ showAlertDialog: options => { state.dialogs.push(options); } })
  });
  return { group, state };
}

test('automatic sync opt-in is saved only after the warning is confirmed', async () => {
  const { group, state } = autoSyncSettingHarness();
  const enabling = group.changeAutoSync(true);
  assert.equal(state.dialogs.length, 1);
  assert.equal(state.dialogs[0].message, 'app.string.sync_auto_confirm_message');
  assert.deepEqual(state.saves, []);
  await group.changeAutoSync(true);
  assert.equal(state.dialogs.length, 1, 'repeated input does not duplicate confirmation');
  state.dialogs[0].secondaryButton.action();
  await enabling;
  assert.deepEqual(state.saves, [true]);
  assert.equal(group.autoSyncEnabled, true);
  assert.equal(group.settingsSaving, false);
  await group.changeAutoSync(false);
  assert.deepEqual(state.saves, [true, false]);
  assert.equal(state.dialogs.length, 1, 'disabling never requires confirmation');
});

test('cancel, dismissal and leaving settings cannot enable automatic sync', async () => {
  for (const action of ['cancel-button', 'dismiss', 'leave']) {
    const { group, state } = autoSyncSettingHarness();
    const enabling = group.changeAutoSync(true);
    if (action === 'cancel-button') state.dialogs[0].primaryButton.action();
    if (action === 'dismiss') state.dialogs[0].cancel();
    if (action === 'leave') {
      group.aboutToDisappear();
      state.dialogs[0].secondaryButton.action();
    }
    await enabling;
    assert.deepEqual(state.saves, [], action);
    assert.equal(group.autoSyncEnabled, false, action);
    assert.equal(group.settingsSaving, false, action);
  }
});

test('failed opt-in rolls back the switch and reports a retryable error', async () => {
  const { group, state } = autoSyncSettingHarness();
  state.fail = true;
  const enabling = group.changeAutoSync(true);
  state.dialogs[0].secondaryButton.action();
  await enabling;
  assert.equal(group.autoSyncEnabled, false);
  assert.equal(group.错误文本, 'app.string.sync_settings_save_failed');
  assert.equal(group.settingsSaving, false);
  await settle();
});


test('restored official UI keeps the default login path and stored accounts available', async () => {
  const flags = readFileSync(new URL('../../entry/src/main/ets/model/ReleaseFeatures.ets', import.meta.url), 'utf8');
  assert.match(flags, /OFFICIAL_ANKIWEB_SYNC_UI_ENABLED: boolean = true/);
  const source = readFileSync(new URL('../../entry/src/main/ets/components/settings/同步分组.ets', import.meta.url), 'utf8');
  assert.match(source, /if \(!isSyncEndpointVisible\(this.savedServer, OFFICIAL_ANKIWEB_SYNC_UI_ENABLED\)\)/);
  assert.match(source, /if \(OFFICIAL_ANKIWEB_SYNC_UI_ENABLED && this.savedServer === ''\)/);
  const saved = [], calls = [];
  const Group = componentMethods(source, ['点击登录'], { 保存同步凭证: auth => saved.push(auth) });
  const group = new Group();
  Object.assign(group, { syncSettingsBusy: () => false, serverLoaded: true, savedServer: '', serverInput: '',
    登录中: false, settingsSaving: false, 用户名输入: 'existing-user', 密码输入: 'transient-password',
    同步服务实例: { 同步登录: async (...args) => { calls.push(args); return { hkey: 'token', endpoint: '' }; } } });
  await group.点击登录();
  assert.deepEqual(calls, [['existing-user', 'transient-password', '']]);
  assert.deepEqual(saved, [{ hkey: 'token', username: 'existing-user', endpoint: '' }]);
  assert.equal(group.当前状态, '已登录');
  const h = preferencesHarness(true);
  h.保存同步凭证(saved[0]);
  assert.deepEqual(h.loadVisibleSyncAuth(), saved[0]);
  assert.deepEqual(h.加载同步凭证(), saved[0]);
  assert.equal(h.loadCustomSyncServer(), '');
});


test('official UI gate covers default and explicit official hosts and can be restored by a developer', () => {
  for (const endpoint of ['', 'https://ankiweb.net/', 'https://SYNC2.ANKIWEB.NET.:443/']) {
    assert.equal(isSyncEndpointVisible(endpoint, false), false);
    assert.equal(isSyncEndpointVisible(endpoint, true), true);
  }
  for (const endpoint of ['https://custom.example/anki/', 'http://192.168.1.2:8080/', 'http://[::1]:8080/']) {
    assert.equal(isSyncEndpointVisible(endpoint, false), true);
    assert.equal(isSyncEndpointVisible(endpoint, true), true);
  }
  for (const enabled of [false, true]) {
    const h = preferencesHarness(enabled);
    const auth = { username: 'existing', hkey: 'retained-token', endpoint: '' };
    h.保存同步凭证(auth);
    assert.deepEqual(h.加载同步凭证(), auth, 'raw credentials are never removed by hiding UI');
    assert.deepEqual(h.loadVisibleSyncAuth(), enabled ? auth : null);
    h.保存同步端点('https://custom.example/');
    assert.equal(h.loadVisibleSyncAuth().hkey, auth.hkey);
  }
  for (const path of ['components/settings/同步分组.ets', 'pages/首页.ets']) {
    const ui = readFileSync(new URL('../../entry/src/main/ets/' + path, import.meta.url), 'utf8');
    assert.match(ui, /loadVisibleSyncAuth/);
    assert.doesNotMatch(ui, /加载同步凭证\(/);
  }
});
