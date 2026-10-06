// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { HomeSyncStatusController, homeSyncIndicator, homeSyncLabelKey } from '../../entry/src/main/ets/model/HomeSyncStatusController.ts';
import { componentMethods } from './sync-panel-harness.mjs';
import { AppInterfaceTracker } from '../../entry/src/main/ets/model/AppInterface.ts';
import { buildAgentAppStructure } from '../../entry/src/main/ets/model/agent/AgentAppStructure.ts';
import { isDoubleColumnDeckListStyle } from '../../entry/src/main/ets/model/DeckListAppearance.ts';

const read = path => readFileSync(new URL('../../entry/src/main/ets/' + path, import.meta.url), 'utf8');
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
function harness() {
  const state = { auth: { hkey: 'key', endpoint: 'https://sync.example/', ioTimeoutSecs: 0 }, safe: true,
    icon: 'normal', response: { required: 0, newEndpoint: '' }, calls: [], endpoints: [], failures: 0 };
  const host = {
    auth: () => state.auth, canRead: () => state.safe,
    read: async auth => { state.calls.push(auth); return state.response; },
    saveEndpoint: endpoint => { state.endpoints.push(endpoint); state.auth = { ...state.auth, endpoint }; },
    changed: icon => { state.icon = icon; }, failed: () => { state.failures++; }
  };
  return { state, host, controller: new HomeSyncStatusController(host) };
}

test('AnkiDroid account/full-sync exclamations and ordinary changes use real Core required values', async () => {
  const h = harness(); h.state.auth = null;
  await h.controller.refresh();
  assert.equal(h.state.icon, 'not_logged_in'); assert.equal(h.state.calls.length, 0);
  assert.equal(homeSyncIndicator(h.state.icon, 'hidden'), 'attention');
  assert.equal(homeSyncLabelKey(h.state.icon, 'hidden'), 'home_sync_not_logged_in');
  h.state.auth = { hkey: 'new-key', endpoint: '', ioTimeoutSecs: 0 };
  for (const [required, icon, badge, label] of [
    [0, 'normal', 'hidden', 'home_sync'],
    [1, 'pending_changes', 'pending', 'home_sync_pending_changes'],
    [2, 'one_way', 'attention', 'home_sync_one_way']
  ]) {
    h.state.response.required = required; h.controller.invalidate(); await h.controller.refresh();
    assert.equal(h.state.icon, icon); assert.equal(homeSyncIndicator(icon, 'hidden'), badge);
    assert.equal(homeSyncLabelKey(icon, 'hidden'), label);
  }
  for (const task of ['syncing', 'attention', 'waiting']) {
    assert.equal(homeSyncIndicator('one_way', task), task);
    assert.equal(homeSyncLabelKey('one_way', task), 'home_sync');
  }
});

test('status reads coalesce, wait for collection safety, and keep redirected endpoints', async () => {
  const h = harness(); h.state.safe = false;
  await h.controller.refresh(); assert.equal(h.state.calls.length, 0);
  h.state.safe = true; const wait = deferred();
  h.host.read = async auth => { h.state.calls.push(auth); return wait.promise; };
  const first = h.controller.refresh(); await h.controller.refresh();
  assert.equal(h.state.calls.length, 1);
  wait.resolve({ required: 2, newEndpoint: 'https://redirect.example/' }); await first;
  assert.equal(h.state.icon, 'one_way'); assert.deepEqual(h.state.endpoints, ['https://redirect.example/']);
  await h.controller.refresh(); assert.equal(h.state.calls.length, 1);
});

test('navigation, an active sync, account changes and disposal discard late reads and redirects', async () => {
  for (const change of ['unsafe', 'account', 'disposed']) {
    const h = harness(), wait = deferred(); h.host.read = () => wait.promise;
    const first = h.controller.refresh();
    if (change === 'unsafe') h.state.safe = false;
    if (change === 'account') { h.state.auth = null; await h.controller.refresh(); }
    if (change === 'disposed') h.controller.dispose();
    wait.resolve({ required: 2, newEndpoint: 'https://stale.example/' }); await first;
    assert.deepEqual(h.state.endpoints, [], change);
    assert.equal(h.state.icon, change === 'account' ? 'not_logged_in' : 'normal', change);
  }
});

test('a newer refresh during an in-flight read is executed after its stale result is discarded', async () => {
  const h = harness(), wait = deferred(); let calls = 0;
  h.host.read = async () => ++calls === 1 ? wait.promise : { required: 1, newEndpoint: '' };
  const first = h.controller.refresh(); h.controller.invalidate(); await h.controller.refresh();
  wait.resolve({ required: 2, newEndpoint: 'https://stale.example/' }); await first;
  assert.equal(calls, 2); assert.equal(h.state.icon, 'pending_changes'); assert.deepEqual(h.state.endpoints, []);
});

test('a failed status probe does not claim sync failure or override an active task', async () => {
  const h = harness(); h.state.response.required = 2; await h.controller.refresh();
  h.host.read = async () => { throw new Error('offline'); }; h.controller.invalidate(); await h.controller.refresh();
  assert.equal(h.state.icon, 'normal'); assert.equal(h.state.failures, 1);
  assert.equal(homeSyncIndicator(h.state.icon, 'attention'), 'attention');
});

test('status requests freeze credentials and retry a discarded read once home is safe again', async () => {
  const h = harness(), wait = deferred(); let requestAuth;
  h.host.read = auth => { requestAuth = auth; return wait.promise; };
  const first = h.controller.refresh();
  h.state.auth.hkey = 'changed-key';
  assert.equal(requestAuth.hkey, 'key');
  h.state.safe = false; h.controller.invalidate();
  wait.resolve({ required: 2, newEndpoint: 'https://stale.example/' }); await first;
  assert.equal(h.state.icon, 'normal'); assert.deepEqual(h.state.endpoints, []);
  h.host.read = async () => ({ required: 1, newEndpoint: '' }); h.state.safe = true;
  await h.controller.refresh(); assert.equal(h.state.icon, 'pending_changes');
});

test('the real home eligibility gate skips foreground/navigation, collection and task occupancy', () => {
  const Page = componentMethods(read('pages/首页.ets'), ['canReadHomeSyncStatus'], {
    syncActivity: { isActive: () => page.active }
  });
  const page = Object.assign(new Page(), { homeDisposed: false, syncForeground: true, 主页允许公告检查: true, depth: 0,
    显示同步面板: false, active: false, manual: false, canSync: true,
    页面栈: { size: () => page.depth }, syncScheduler: { isManualPending: () => page.manual, canSync: () => page.canSync },
    facts: { collectionReady: true, collectionBusy: false, dialogOpen: false, interactionBusy: false },
    homeActivity: () => page.facts });
  assert.equal(page.canReadHomeSyncStatus(), true);
  for (const [key, value] of [['homeDisposed', true], ['syncForeground', false], ['主页允许公告检查', false], ['depth', 1],
    ['显示同步面板', true], ['active', true], ['manual', true], ['canSync', false]]) {
    const old = page[key]; page[key] = value; assert.equal(page.canReadHomeSyncStatus(), false, key); page[key] = old;
  }
  for (const key of ['collectionReady', 'collectionBusy', 'dialogOpen', 'interactionBusy']) {
    const old = page.facts[key]; page.facts[key] = !old;
    assert.equal(page.canReadHomeSyncStatus(), false, key); page.facts[key] = old;
  }
});

test('JIDE reads the live sync marker and the same localized button label as the header', () => {
  const tracker = new AppInterfaceTracker();
  const Page = componentMethods(read('pages/首页.ets'), ['homeActionControls', 'publishHomeInterface'], {
    appInterface: tracker, OFFICIAL_ANNOUNCEMENTS_ENABLED: false, isDoubleColumnDeckListStyle,
    homeSyncLabelKey, homeSyncIndicator
  });
  const Header = componentMethods(read('components/home/HomeSummaryHeader.ets'), ['syncLabel'], {
    homeSyncLabelKey, $r: key => key
  });
  const page = Object.assign(new Page(), { homeDisposed: false, 排序模式中: false, homeAgentEnabled: false,
    牌组数据源: { snapshotDecks: () => [] }, homeActivity: () => ({ collectionBusy: false }),
    deckListStyle: 'single_wide', 显示今日进度卡: true, syncIndicator: 'hidden', syncStatusText: '' });
  const header = Object.assign(new Header(), { syncIndicator: 'hidden', syncStatusText: '' });
  for (const locale of ['base', 'en_US']) {
    const labels = new Map(JSON.parse(readFileSync(new URL(`../../entry/src/main/resources/${locale}/element/string.json`, import.meta.url))).string.map(x => [x.name, x.value]));
    for (const account of ['normal', 'not_logged_in', 'one_way', 'pending_changes']) {
      page.syncAccountState = account; header.syncAccountState = account; page.publishHomeInterface();
      const structure = buildAgentAppStructure({ simple: true, agent: true, cloudDeck: false }, 'home', '',
        key => labels.get(key), [], [], tracker.snapshot());
      const observation = structure.observations.find(item => item.surface === 'home');
      assert.equal(observation.values.find(item => item.id === 'sync_account_state').value, account);
      assert.equal(observation.values.find(item => item.id === 'sync_indicator').value, homeSyncIndicator(account, 'hidden'));
      const key = page.homeActionControls().find(item => item.id === 'sync').titleKey;
      assert.ok(labels.has(key)); assert.equal(header.syncLabel(), 'app.string.' + key);
    }
  }
  header.syncIndicator = 'syncing'; header.syncStatusText = 'Media progress';
  assert.equal(header.syncLabel(), 'Media progress');
});
