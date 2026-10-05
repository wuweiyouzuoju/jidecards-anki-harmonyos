// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { CollectionHistorySession } from '../../entry/src/main/ets/model/CollectionHistorySession.ts';
import { autoSyncScheduler } from '../../entry/src/main/ets/model/AutoSyncScheduler.ts';
import { syncActivity } from '../../entry/src/main/ets/model/SyncSettings.ts';
const deferred = () => { let resolve; const promise = new Promise(r => resolve = r); return { promise, resolve }; };
const tick = () => new Promise(r => setImmediate(r));
function harness() {
  const states = [], writes = [];
  let current = { undo: 'Delete note', redo: '', lastStep: 4 }, refreshed = 0, changed = 0;
  const backend = { status: async () => ({...current}), apply: async (redo, status) => {
    assert.deepEqual(status, current); writes.push(redo); current = {undo: '', redo: 'Delete note', lastStep: 3};
  } };
  const session = new CollectionHistorySession(backend, state => states.push(state),
    async () => { refreshed++; }, () => { changed++; });
  return { session, backend, states, writes, get refreshed() { return refreshed; }, get changed() { return changed; } };
}
test('history disables unavailable directions, serializes accepted writes and publishes fresh status', async () => {
  const h = harness(); await h.session.load(); await h.session.apply(true); assert.equal(h.writes.length, 0);
  const gate = deferred(), original = h.backend.apply;
  h.backend.apply = async (...args) => { await gate.promise; await original(...args); };
  const work = h.session.apply(false); await tick();
  assert.equal(autoSyncScheduler.canSync(), false); await h.session.apply(false);
  gate.resolve(); await work;
  assert.deepEqual(h.writes, [false]); assert.equal(h.refreshed, 1); assert.equal(h.changed, 1);
  assert.equal(h.states.at(-1).status.redo, 'Delete note');
});
test('history waits for collection sync and leaves without starting a new write', async () => {
  const h = harness(); await h.session.load(); syncActivity.reserveCollection();
  try {
    const work = h.session.apply(false); await tick(); h.session.dispose();
    syncActivity.cancelReservation(); await work; assert.equal(h.writes.length, 0);
  } finally { syncActivity.cancelReservation(); }
});
test('accepted history write survives disposal and broadcasts once without refreshing the old page', async () => {
  const h = harness(); await h.session.load(); const gate = deferred();
  h.backend.apply = async () => { h.writes.push(false); await gate.promise; };
  const work = h.session.apply(false); await tick(); h.session.dispose(); const count = h.states.length;
  gate.resolve(); await work; assert.equal(h.changed, 1); assert.equal(h.refreshed, 0);
  assert.equal(h.states.length, count);
});
test('failed status refresh after commit is never presented as a repeatable write', async () => {
  const h = harness(); await h.session.load(); h.backend.status = async () => { throw Error('read failed'); };
  await h.session.apply(false);
  assert.equal(h.states.at(-1).error, 'collection_history_refresh_error');
  assert.equal(h.states.at(-1).status, null); await h.session.apply(false); assert.equal(h.writes.length, 1);
});

test('history changes, native execution errors and read failures retain distinct causes', async () => {
  for (const [message, expected] of [
    ['collection_history_changed', 'collection_history_changed_error'],
    ['Invalid deck preview request', 'collection_history_apply_error']
  ]) {
    const h = harness(); await h.session.load();
    h.backend.apply = async () => { throw new Error(message); };
    await h.session.apply(false);
    assert.equal(h.states.at(-1).error, expected);
    assert.equal(h.states.at(-1).errorDetail, message === 'collection_history_changed' ? '' : message);
    assert.equal(h.states.at(-1).status, null);
    assert.equal(h.changed, 0); assert.equal(h.refreshed, 0);
    await h.session.load();
    assert.equal(h.states.at(-1).error, ''); assert.equal(h.states.at(-1).errorDetail, '');
  }
  const h = harness(); h.backend.status = async () => { throw new Error('collection unavailable'); };
  await h.session.load();
  assert.equal(h.states.at(-1).error, 'collection_history_load_error');
  assert.equal(h.states.at(-1).errorDetail, 'collection unavailable');
  assert.equal(autoSyncScheduler.canSync(), true);
});
