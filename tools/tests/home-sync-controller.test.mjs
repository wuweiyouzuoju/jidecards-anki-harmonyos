// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { HomeSyncController } from '../../entry/src/main/ets/model/HomeSyncController.ts';
import { AutoSyncScheduler } from '../../entry/src/main/ets/model/AutoSyncScheduler.ts';
import { SyncActivity } from '../../entry/src/main/ets/model/SyncSettings.ts';

const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
function harness() {
  const facts = { foreground: true, atHome: true, collectionReady: true, collectionBusy: false,
    dialogOpen: false, interactionBusy: false, startupChecking: false };
  const state = { busy: false, panel: false, disposed: false, depth: 0, load: 'ready', status: '', refreshes: 0, warnings: 0, wakes: 0 };
  const scheduler = new AutoSyncScheduler(), activity = new SyncActivity(), timers = new Map(); let id = 0;
  const host = {
    activity: () => facts, syncCollectionBusy: () => state.busy, isDisposed: () => state.disposed,
    isForeground: () => facts.foreground, isPanelOpen: () => state.panel,
    pageDepth: () => state.depth, pathNames: () => [], loadState: () => state.load,
    startupReady: () => true, externalImportPending: () => false, autoSyncEnabled: () => true,
    auth: () => ({ hkey: 'key', endpoint: '', ioTimeoutSecs: 0 }), username: () => 'user',
    setStatus: value => { state.status = value; }, notifyWait() {}, popPage() {}, requestPanelDetails() {},
    openPanel() { state.panel = true; }, closePanel() { state.panel = false; },
    setCollectionBusy: value => { state.busy = value; }, setPanelModal: value => { facts.dialogOpen = value; },
    refreshAfterCollection: async () => { state.refreshes++; },
    presentFsrsWarning: async () => { state.warnings++; }, activityChanged: () => { state.wakes++; }
  };
  const controller = new HomeSyncController(scheduler, activity, () => host, {
    now: () => 100000, setTimeout: (fn, delay) => { timers.set(++id, { fn, delay }); return id; }, clearTimeout: id => timers.delete(id)
  });
  scheduler.setListener(() => controller.schedule());
  return { facts, state, scheduler, activity, timers, host, controller };
}

test('sync reserves the collection before mounting UI and cancels stale timers', async () => {
  const h = harness(); let released = false, release;
  h.host.openPanel = () => {
    assert.equal(h.state.busy, true);
    release = h.activity.waitForCollection().then(() => { released = true; });
    h.state.panel = true;
  };
  h.controller.request(); const stale = [...h.timers.values()][0]; assert.equal(stale.delay, 3000);
  h.controller.stopTimer(); h.controller.schedule(); stale.fn(); assert.equal(h.state.panel, false);
  h.controller.tryStart(); await Promise.resolve(); assert.equal(released, false);
  h.activity.cancelReservation(); await release; assert.equal(released, true);
});

test('ordinary home busy state blocks sync but does not capture navigation', () => {
  const h = harness(); h.facts.collectionBusy = true;
  h.controller.request(); h.controller.tryStart();
  assert.equal(h.state.panel, false); assert.equal(h.scheduler.hasPending(), true);
  assert.equal(h.controller.defer(() => assert.fail('must not queue')), false);
  assert.equal(h.controller.hasDeferredNavigation(), false);
});

test('closing sync details flushes only the latest deferred intent', () => {
  const h = harness(), calls = [];
  h.controller.panelStateChanged(true, true);
  h.controller.defer(() => calls.push('old')); h.controller.defer(() => calls.push('latest'));
  h.controller.closePanel(); h.controller.flush(); assert.deepEqual(calls, ['latest']);
});

test('dispose during refresh suppresses late navigation, warning and UI wakeups', async () => {
  const h = harness(), wait = deferred(); h.host.refreshAfterCollection = () => wait.promise;
  h.controller.panelStateChanged(true, false); h.controller.defer(() => assert.fail('late navigation'));
  const finish = h.controller.collectionFinished(true); assert.equal(h.controller.isRefreshing(), true);
  h.controller.dispose(); wait.resolve(); await finish;
  h.controller.panelStateChanged(true, true); h.controller.requestManual(); h.controller.yielded(false);
  assert.equal(h.state.warnings, 0); assert.equal(h.state.wakes, 0); assert.equal(h.facts.dialogOpen, false);
  assert.equal(h.controller.isRefreshing(), false); assert.equal(h.scheduler.hasPending(), false);
});

test('refresh rejection releases navigation gate and remains observable', async () => {
  const h = harness(); h.state.load = 'error';
  h.host.refreshAfterCollection = async () => { throw new Error('refresh failed'); };
  h.controller.panelStateChanged(true, false); h.controller.defer(() => assert.fail('failed snapshot navigation'));
  await assert.rejects(h.controller.collectionFinished(false), /refresh failed/);
  assert.equal(h.controller.isRefreshing(), false); assert.equal(h.controller.hasDeferredNavigation(), false);
  assert.equal(h.state.wakes, 1);
});
