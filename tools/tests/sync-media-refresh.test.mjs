// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { panelHarness, settle } from './sync-panel-harness.mjs';

const status = (active, checked = '') => ({ active, progress: { checked, added: '', removed: '' } });
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };

for (const required of [0, 1, 2, 3, 4]) {
  test(`media stage publishes its first progress without waiting for a timer (required=${required})`, async () => {
    const { panel, state } = panelHarness({ required, media: true });
    let reads = 0;
    panel.同步服务实例.媒体同步状态 = async () => { reads++; return status(true, 'checked: 12'); };
    panel.aboutToAppear(); await settle();
    if (required >= 2) { await panel.冲突确认(required !== 3); await settle(); }
    assert.equal(reads, 1);
    assert.match(state.status, /checked: 12/);
    assert.match(state.snapshot.媒体进度文案, /checked: 12/);
    assert.equal(state.indicator, 'syncing');
    assert.equal(state.closed, 0);
  });
}

test('opening details and returning to foreground refresh progress and completion immediately', async () => {
  for (const trigger of ['showDetails', 'syncForegroundChanged']) {
    const { panel, state, gate } = panelHarness({ media: true, automatic: false });
    let current = status(true, 'checked: 1'), reads = 0;
    panel.同步服务实例.媒体同步状态 = async () => { reads++; return current; };
    panel.aboutToAppear(); await settle();
    current = status(true, 'checked: 20');
    panel[trigger](); await settle();
    assert.equal(reads, 2, trigger);
    assert.match(state.status, /checked: 20/, trigger);
    current = status(false);
    panel[trigger](); await settle();
    assert.equal(state.indicator, 'done', trigger);
    assert.equal(state.closed, 1, trigger);
    assert.equal(state.pending, false, trigger);
    assert.equal(gate.isActive(), false, trigger);
    assert.deepEqual(state.toasts, ['app.string.sync_collection_complete', 'app.string.sync_media_complete']);
    assert.equal(state.timers.size, 0);
  }
});

test('an already finished or failed media task updates the button on the first read', async () => {
  for (const failure of [false, true]) {
    const { panel, state, gate } = panelHarness({ media: true, automatic: false });
    panel.同步服务实例.媒体同步状态 = async () => {
      if (failure) throw Error('network timeout');
      return status(false);
    };
    panel.aboutToAppear(); await settle();
    assert.equal(state.indicator, failure ? 'failure' : 'done');
    assert.equal(state.closed, failure ? 0 : 1);
    assert.equal(state.pending, failure);
    assert.equal(gate.isActive(), false);
    assert.equal(state.refreshed, 1);
    assert.equal(state.timers.size, 0);
  }
});

test('refresh triggers coalesce behind an in-flight read and cannot consume a terminal result twice', async () => {
  const { panel, state } = panelHarness({ media: true });
  const wait = deferred(); let reads = 0;
  panel.同步服务实例.媒体同步状态 = () => ++reads === 1 ? wait.promise : Promise.resolve(status(false));
  panel.aboutToAppear(); await settle();
  const tick = state.timers.get(1);
  panel.showDetails(); panel.syncForegroundChanged(); tick(); tick();
  assert.equal(reads, 1);
  wait.resolve(status(true, 'older progress')); await settle();
  assert.equal(reads, 2, 'one refresh follows the older in-flight sample');
  assert.equal(state.closed, 1);
  panel.showDetails(); panel.syncForegroundChanged(); tick(); await settle();
  assert.equal(reads, 2, 'completed tasks never poll again');
  assert.equal(state.closed, 1);
});

test('explicit media start is acknowledged before foreground or detail refreshes may read status', async () => {
  const { panel, state } = panelHarness({ required: 2, media: true });
  const wait = deferred(); let reads = 0;
  panel.同步服务实例.同步媒体 = () => wait.promise;
  panel.同步服务实例.媒体同步状态 = async () => { reads++; return status(false); };
  panel.aboutToAppear(); await settle();
  state.response.required = 0;
  await panel.冲突确认(true); await settle();
  panel.showDetails(); panel.syncForegroundChanged(); await settle();
  assert.equal(reads, 0);
  assert.equal(state.closed, 0);
  wait.resolve(); await settle();
  assert.equal(reads, 1);
  assert.equal(state.closed, 1);
});

test('disposing an in-flight media read waits before cleanup consumes another result', async () => {
  const { panel, state, gate } = panelHarness({ media: true });
  const wait = deferred(); let reads = 0, aborts = 0;
  panel.同步服务实例.媒体同步状态 = () => ++reads === 1 ? wait.promise : Promise.resolve(status(false));
  panel.同步服务实例.中止媒体同步 = async () => { aborts++; };
  panel.aboutToAppear(); await settle();
  const tick = state.timers.get(1); tick();
  panel.showDetails(); panel.aboutToDisappear(); await settle();
  assert.equal(reads, 1);
  assert.equal(aborts, 0);
  assert.equal(gate.isActive(), true);
  wait.resolve(status(false)); await settle();
  assert.equal(reads, 2);
  assert.equal(aborts, 1);
  assert.equal(gate.isActive(), false);
  panel.syncForegroundChanged(); tick(); await settle();
  assert.equal(reads, 2);
  assert.equal(state.closed, 0, 'no callback into a destroyed host');
});

test('regular polling continues after the immediate sample and empty progress preserves the last counters', async () => {
  const { panel, state } = panelHarness({ media: true });
  let current = status(true), reads = 0;
  panel.同步服务实例.媒体同步状态 = async () => { reads++; return current; };
  panel.aboutToAppear(); await settle();
  assert.equal(state.status, 'app.string.sync_syncing_media');
  const tick = state.timers.get(1);
  current = status(true, 'checked: 35'); tick(); await settle();
  const progress = state.status;
  assert.match(progress, /checked: 35/);
  current = status(true); tick(); await settle();
  assert.equal(state.status, progress);
  assert.equal(state.snapshot.媒体进度文案, progress);
  current = status(false); tick(); await settle();
  assert.equal(reads, 4);
  assert.equal(state.closed, 1);
});
