// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { HomeBackupController } from '../../entry/src/main/ets/model/HomeBackupController.ts';
import { BackupCoordinator } from '../../entry/src/main/ets/model/BackupCoordinator.ts';
import { AutoSyncScheduler } from '../../entry/src/main/ets/model/AutoSyncScheduler.ts';

const settle = async () => { for (let i = 0; i < 16; i++) await Promise.resolve(); };
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
function harness() {
  const state = { foreground: true, disposed: false, ready: true, idle: true, enabled: true, filesDir: '/data' };
  const timers = new Map(), calls = [], warnings = [];
  let sequence = 0;
  const scheduler = new AutoSyncScheduler();
  const coordinator = new BackupCoordinator(scheduler);
  const backend = { create: async force => { calls.push(force); return true; } };
  const host = {
    isDisposed: () => state.disposed, isForeground: () => state.foreground,
    canRun: () => state.ready && state.idle, canReschedule: () => state.ready,
    filesDir: () => state.filesDir, loadEnabled: async () => state.enabled, warn: error => warnings.push(error)
  };
  const controller = new HomeBackupController(() => host, () => backend, coordinator, {
    now: () => 100000, setTimeout: (fn, delay) => { assert.equal(delay, 5000); timers.set(++sequence, fn); return sequence; },
    clearTimeout: id => timers.delete(id)
  });
  const tick = async () => { const work = [...timers.values()]; timers.clear(); work.forEach(fn => fn()); await settle(); };
  return { state, timers, calls, warnings, controller, host, coordinator, scheduler, backend, tick };
}

test('backup coalesces wakeups, waits for idle and leaves retention to Core', async () => {
  const h = harness(); h.state.idle = false;
  h.controller.schedule(); h.controller.schedule(); assert.equal(h.timers.size, 1);
  await h.tick(); assert.deepEqual(h.calls, []); assert.equal(h.timers.size, 1);
  h.state.idle = true; await h.tick(); assert.deepEqual(h.calls, [false]); assert.equal(h.timers.size, 0);
});

test('background, disposal, disabled preference and missing context never start backups', async () => {
  for (const property of ['foreground', 'disposed', 'enabled', 'filesDir']) {
    const h = harness(); h.controller.schedule();
    h.state[property] = property === 'disposed' ? true : property === 'filesDir' ? null : false;
    await h.tick(); assert.deepEqual(h.calls, [], property); assert.equal(h.timers.size, 0);
  }
  const h = harness(); h.controller.schedule(); const stale = [...h.timers.values()][0];
  h.controller.dispose(); stale(); h.controller.schedule(); await settle();
  assert.deepEqual(h.calls, []); assert.equal(h.timers.size, 0);
});

test('preference read coalesces and stop/dispose invalidates late completion', async () => {
  for (const action of ['stop', 'dispose']) {
    const h = harness(), wait = deferred(); h.host.loadEnabled = () => wait.promise;
    h.controller.schedule(); await h.tick(); h.controller.schedule(); assert.equal(h.timers.size, 0);
    h.controller[action](); wait.resolve(true); await settle(); assert.deepEqual(h.calls, []);
  }
});

test('preference failures are caught and accepted writes retain ownership after disposal', async () => {
  const h = harness(); h.host.loadEnabled = async () => { throw new Error('preferences unavailable'); };
  h.controller.schedule(); await h.tick(); assert.equal(h.warnings[0].message, 'preferences unavailable');
  h.host.loadEnabled = async () => true;
  const wait = deferred(); h.backend.create = () => wait.promise;
  h.controller.schedule(); await h.tick(); h.controller.dispose();
  assert.equal(h.coordinator.isBusy(), true); assert.equal(h.scheduler.canSync(), false);
  wait.resolve(true); await settle(); assert.equal(h.coordinator.isBusy(), false); assert.equal(h.scheduler.canSync(), true);
});
