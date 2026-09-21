// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { HomeWorkCoordinator } from '../../entry/src/main/ets/model/HomeWorkCoordinator.ts';
import { HomeStartupSequence } from '../../entry/src/main/ets/model/HomeStartupSequence.ts';
import { ExternalDeckOpenQueue } from '../../entry/src/main/ets/model/ExternalDeckOpen.ts';

function deferred() {
  let resolve, reject;
  const promise = new Promise((a, b) => { resolve = a; reject = b; });
  return { promise, resolve, reject };
}
const settle = async () => { for (let i = 0; i < 15; i++) await Promise.resolve(); };
function harness() {
  const queue = new ExternalDeckOpenQueue(), timers = new Map(), events = [];
  let serial = 0;
  const activity = { foreground: true, atHome: true, collectionReady: true, collectionBusy: false,
    dialogOpen: false, interactionBusy: false, startupChecking: false };
  const coordinator = new HomeWorkCoordinator(queue, {
    schedule: fn => { timers.set(++serial, fn); return serial; }, cancel: id => timers.delete(id)
  });
  const host = { activity: () => activity, hasDeferredNavigation: () => false,
    importDeck: async uri => { events.push(uri); }, importFailed: e => events.push(e.message),
    flushNavigation: () => events.push('navigation'), manualSyncPending: () => false,
    startManualSync: () => events.push('manual'), presentAnnouncement: () => false,
    continueStartup: () => events.push('startup'), scheduleSync: () => events.push('sync') };
  const tick = () => { const pending = [...timers.values()]; timers.clear(); for (const fn of pending) fn(); };
  return { queue, coordinator, host, activity, events, timers, tick };
}

test('one wake per turn; deferred navigation is rechecked before any prompt or sync', () => {
  const h = harness();
  h.host.flushNavigation = () => { h.events.push('navigation'); h.activity.atHome = false; };
  h.coordinator.wake(h.host); h.coordinator.wake(h.host);
  assert.equal(h.timers.size, 1); h.tick();
  assert.deepEqual(h.events, ['navigation']);
});

test('platform request delivered during navigation is reconsidered before showing startup prompts', async () => {
  const h = harness();
  h.host.flushNavigation = () => { h.events.push('navigation'); h.queue.enqueue('late-deck'); };
  h.coordinator.wake(h.host); h.tick();
  assert.deepEqual(h.events, ['navigation']);
  h.tick(); await settle();
  assert.deepEqual(h.events, ['navigation', 'late-deck']);
});

test('disposal inside a host effect stops further callbacks in the same turn', () => {
  const h = harness(); h.host.manualSyncPending = () => true;
  h.host.startManualSync = () => h.coordinator.dispose();
  h.coordinator.wake(h.host); h.tick();
  assert.deepEqual(h.events, ['navigation']);
});

test('accepted import serializes queue, outranks manual sync and survives disposal', async () => {
  const h = harness(), gate = deferred();
  h.queue.enqueue('first'); h.queue.enqueue('second');
  h.host.manualSyncPending = () => true;
  h.host.importDeck = async uri => { h.events.push(uri); await gate.promise; };
  h.coordinator.wake(h.host); h.tick();
  h.coordinator.wake(h.host); h.tick();
  assert.deepEqual(h.events, ['first']);
  h.coordinator.dispose(); gate.resolve(); await settle();
  assert.equal(h.timers.size, 0);
  assert.equal(h.queue.begin(), 'second', 'dispose does not erase queued platform events');
  assert.deepEqual(h.events, ['first']);
});

test('failed and synchronously throwing imports release ownership and wake the next item', async () => {
  for (const synchronous of [false, true]) {
    const h = harness(); h.queue.enqueue('bad'); h.queue.enqueue('good');
    h.host.importDeck = uri => {
      h.events.push(uri);
      if (uri === 'good') return Promise.resolve();
      if (synchronous) throw new Error('broken');
      return Promise.reject(new Error('broken'));
    };
    h.coordinator.wake(h.host); h.tick(); await settle(); h.tick(); await settle();
    assert.deepEqual(h.events, ['bad', 'broken', 'good']);
    assert.equal(h.queue.hasPending(), false);
  }
});

for (const [field, value] of [['foreground', false], ['atHome', false], ['collectionReady', false],
  ['collectionBusy', true], ['dialogOpen', true], ['interactionBusy', true]]) {
  test(`external imports wait for ${field} and resume once released`, async () => {
    const h = harness(); h.queue.enqueue('deck'); h.activity[field] = value;
    h.coordinator.wake(h.host); h.tick(); assert.deepEqual(h.events, []);
    h.activity[field] = !value; h.coordinator.wake(h.host); h.tick(); await settle();
    assert.deepEqual(h.events, ['deck']);
  });
}

test('manual sync outranks unseen announcement; shown announcement owns the prompt slot', () => {
  const h = harness();
  h.host.presentAnnouncement = () => { h.events.push('announcement'); return true; };
  h.host.manualSyncPending = () => true;
  h.coordinator.wake(h.host); h.tick();
  assert.deepEqual(h.events, ['navigation', 'manual', 'sync']);
  h.events.length = 0; h.host.manualSyncPending = () => false;
  h.coordinator.wake(h.host); h.tick();
  assert.deepEqual(h.events, ['navigation', 'announcement']);
  h.events.length = 0; h.activity.dialogOpen = true;
  h.coordinator.wake(h.host); h.tick(); assert.deepEqual(h.events, []);
});

test('disposal cancels scheduled work and rejects all later wakes', () => {
  const h = harness(); h.coordinator.wake(h.host);
  h.coordinator.dispose(); h.tick(); h.coordinator.wake(h.host);
  assert.deepEqual(h.events, []); assert.equal(h.timers.size, 0);
});

function startupHarness() {
  const sequence = new HomeStartupSequence(), events = [];
  let allowed = true;
  const host = { canPresent: () => allowed, checkAnnouncement: async () => false, activateAnnouncementChecks() {},
    cloudCompleted: async () => false, introCompleted: async () => false,
    showCloud: () => { events.push('cloud'); allowed = false; }, showIntro: () => { events.push('intro'); allowed = false; } };
  return { sequence, host, events, allow: value => { allowed = value; } };
}

test('initial announcement precedes cloud and intro; repeated start and disposed checks never replay', async () => {
  for (const found of [false, true]) {
    for (const disposed of [false, true]) {
      const h = startupHarness(), gate = deferred(); let checks = 0;
      h.host.checkAnnouncement = () => { checks++; return gate.promise; };
      const initial = h.sequence.start(h.host); await h.sequence.start(h.host);
      assert.equal(checks, 1); assert.deepEqual(h.events, []);
      if (disposed) h.sequence.dispose();
      gate.resolve(found); await initial;
      assert.deepEqual(h.events, found || disposed ? [] : ['cloud']);
      if (found && !disposed) {
        await h.sequence.continue(h.host); assert.deepEqual(h.events, ['cloud']);
      }
    }
  }
});

test('startup defers cloud guide behind active UI, then shows intro only after cloud completion', async () => {
  const h = startupHarness(); h.allow(false);
  await h.sequence.continue(h.host); assert.deepEqual(h.events, []);
  h.allow(true); await h.sequence.resume(h.host); await h.sequence.resume(h.host);
  assert.deepEqual(h.events, ['cloud']);
  h.allow(true); await h.sequence.welcome(h.host);
  assert.deepEqual(h.events, ['cloud', 'intro']);
});

test('preference reads coalesce; background and disposal reject late presentation', async () => {
  for (const kind of ['cloud', 'intro']) {
    for (const disposed of [false, true]) {
      const h = startupHarness(), gate = deferred(); let reads = 0;
      h.host[kind === 'cloud' ? 'cloudCompleted' : 'introCompleted'] = () => { reads++; return gate.promise; };
      const call = () => kind === 'cloud' ? h.sequence.continue(h.host) : h.sequence.welcome(h.host);
      const first = call(); await call(); assert.equal(reads, 1);
      if (disposed) h.sequence.dispose(); else h.allow(false);
      gate.resolve(false); await first; assert.deepEqual(h.events, []);
      h.allow(true); await h.sequence.resume(h.host);
      assert.deepEqual(h.events, disposed ? [] : [kind]);
    }
  }
});

test('failed preference reads release busy state and remain retryable; completed intro is not shown', async () => {
  const h = startupHarness();
  h.host.cloudCompleted = async () => { throw new Error('disk'); };
  await assert.rejects(h.sequence.continue(h.host), /disk/);
  h.host.cloudCompleted = async () => true; h.host.introCompleted = async () => true;
  await h.sequence.resume(h.host);
  assert.deepEqual(h.events, []); assert.equal(h.sequence.hasPending(), false);
});
