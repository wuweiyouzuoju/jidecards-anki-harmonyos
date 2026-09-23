// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { CollectionMaintenanceSession } from '../../entry/src/main/ets/model/settings/CollectionMaintenanceSession.ts';

function deferred() {
  let resolve, reject;
  const promise = new Promise((ok, fail) => { resolve = ok; reject = fail; });
  return { promise, resolve, reject };
}

test('database maintenance exposes pass, problem and failure outcomes with retry', async () => {
  const session = new CollectionMaintenanceSession();
  let state;
  session.attach(value => { state = value; });
  await session.checkDatabase(async () => []);
  assert.equal(state.checked, true);
  assert.equal(state.checking, false);
  const problems = ['orphan card'];
  await session.checkDatabase(async () => problems);
  problems.push('external mutation');
  assert.deepEqual(state.problems, ['orphan card']);
  await session.checkDatabase(() => { throw Error('database unavailable'); });
  assert.equal(state.checked, false);
  assert.equal(state.checking, false);
  assert.equal(state.error, 'database unavailable');
  await session.checkDatabase(async () => []);
  assert.equal(state.error, '');
  assert.equal(state.checked, true);
});

test('maintenance retains real operation ownership across detach and reattach', async () => {
  const session = new CollectionMaintenanceSession();
  const oldSnapshots = [];
  session.attach(value => oldSnapshots.push(value));
  const pending = deferred();
  const operation = session.checkDatabase(() => pending.promise);
  let duplicateCalls = 0;
  await session.checkDatabase(async () => { duplicateCalls++; return []; });
  session.detach();
  pending.resolve(['repair needed']);
  await operation;
  assert.equal(oldSnapshots.length, 2, 'no late UI publication after detach');
  oldSnapshots[1].problems.push('snapshot mutation');
  let current;
  session.attach(value => { current = value; });
  assert.equal(current.checking, false, 'remount never retains a stale busy flag');
  assert.deepEqual(current.problems, ['repair needed']);
  assert.equal(duplicateCalls, 0);
});

test('accepted tag writes complete after leaving and reject duplicates through remount', async () => {
  const session = new CollectionMaintenanceSession();
  const pending = deferred();
  let calls = 0, state;
  const clear = () => { calls++; return pending.promise; };
  assert.equal(await session.clearUnusedTags(clear), null);
  session.attach(value => { state = value; });
  const operation = session.clearUnusedTags(clear);
  assert.equal(state.clearingTags, true);
  session.detach();
  session.attach(value => { state = value; });
  assert.equal(await session.clearUnusedTags(clear), null);
  pending.resolve(4);
  assert.equal(await operation, 4);
  assert.equal(calls, 1);
  assert.equal(state.clearingTags, false);
  await assert.rejects(session.clearUnusedTags(() => { throw Error('write failed'); }), /write failed/);
  assert.equal(state.clearingTags, false);
});
