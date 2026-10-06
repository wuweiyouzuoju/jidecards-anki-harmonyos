// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadPlatformModule } from './platform-module-harness.mjs';
import { AutoSyncScheduler } from '../../entry/src/main/ets/model/AutoSyncScheduler.ts';
import { SyncActivity } from '../../entry/src/main/ets/model/SyncSettings.ts';
import { DeckPreviewSession, DeckPreviewScope } from '../../entry/src/main/ets/model/DeckPreviewSession.ts';
import { DECK_PREVIEW_SERVICE, encodeDeckPreviewRequest, decodeDeckPreviewIds } from '../../entry/src/main/ets/proto/messages/DeckPreviewMessages.ts';
import { 协议写入器 } from '../../entry/src/main/ets/proto/core/ProtoWriter.ts';

const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const tick = () => new Promise(resolve => setImmediate(resolve));
const response = () => {
  const writer = new 协议写入器();
  writer.写入打包64位整数(1, [90, 3, 12]);
  return writer.转为字节();
};
function harness() {
  const events = [], scheduler = new AutoSyncScheduler(), activity = new SyncActivity();
  const native = {
    确保已打开: async filesDir => { events.push(['open', filesDir]); },
    调用: async (...args) => { events.push(['call', ...args]); return response(); }
  };
  const Service = loadPlatformModule('backend/DeckPreviewService.ts', 'DeckPreviewService', {
    后端会话: { 获取实例: () => native }, syncActivity: activity, autoSyncScheduler: scheduler,
    DECK_PREVIEW_SERVICE, encodeDeckPreviewRequest, decodeDeckPreviewIds,
    console: { info() {} }
  });
  return { backend: new Service(), events, native, scheduler, activity };
}

test('preview waits for the collection, reopens it and then queries all four scopes', async () => {
  const h = harness(), sync = {};
  assert.equal(h.activity.acquire(sync), true);
  const loading = h.backend.cardIds('42', DeckPreviewScope.All, '/collection');
  await tick();
  assert.deepEqual(h.events, [], 'cannot reopen a collection owned by synchronization');
  assert.equal(h.scheduler.canSync(), false, 'waiting read prevents a new automatic sync');
  h.activity.release(sync, 0);
  assert.deepEqual(await loading, [90, 3, 12]);
  assert.equal(h.events[0][0], 'open');
  assert.equal(h.events[0][1], '/collection');
  assert.deepEqual(h.events[1].slice(0, 3), ['call', 1001, 0]);
  assert.equal(h.scheduler.canSync(), true);
  for (const scope of [0, 1, 2, 3]) {
    assert.deepEqual(await h.backend.cardIds('42', scope, '/collection'), [90, 3, 12]);
  }
});

test('canceling or disposing a preview does not release a snapshot still executing in the backend', async () => {
  for (const cancel of ['invalidate', 'dispose']) {
    const h = harness(), pending = deferred();
    h.native.调用 = async () => pending.promise;
    const session = new DeckPreviewSession(h.backend);
    const loading = session.load('42', DeckPreviewScope.All, '/collection');
    await tick();
    session[cancel]();
    assert.equal(h.scheduler.canSync(), false, cancel);
    pending.resolve(response());
    assert.equal(await loading, null);
    assert.equal(h.scheduler.canSync(), true, cancel);
  }
});

test('open, native and decoding failures release the operation and allow a real retry', async () => {
  for (const stage of ['open', 'native', 'decode']) {
    const h = harness(), originalOpen = h.native.确保已打开, originalCall = h.native.调用;
    if (stage === 'open') h.native.确保已打开 = async () => { throw new Error('open failed'); };
    if (stage === 'native') h.native.调用 = async () => { throw new Error('snapshot failed'); };
    if (stage === 'decode') h.native.调用 = async () => Uint8Array.of(10, 127);
    await assert.rejects(h.backend.cardIds('42', DeckPreviewScope.All, '/collection'),
      stage === 'decode' ? /proto:/ : /failed/);
    assert.equal(h.scheduler.canSync(), true, stage);
    if (stage === 'open') assert.deepEqual(h.events, [], 'no RPC after reopening failed');
    h.native.确保已打开 = originalOpen; h.native.调用 = originalCall;
    assert.deepEqual(await h.backend.cardIds('42', DeckPreviewScope.All, '/collection'), [90, 3, 12]);
  }
});

test('overlapping previews retain separate operation ownership until the final snapshot finishes', async () => {
  const h = harness(), pending = [deferred(), deferred()];
  let index = 0;
  h.native.调用 = async () => pending[index++].promise;
  const first = h.backend.cardIds('42', DeckPreviewScope.All, '/collection');
  const second = h.backend.cardIds('43', DeckPreviewScope.Due, '/collection');
  await tick();
  pending[0].resolve(response()); await first;
  assert.equal(h.scheduler.canSync(), false, 'the first request cannot release the second request');
  pending[1].resolve(response()); await second;
  assert.equal(h.scheduler.canSync(), true);
});

test('invalid preview input never opens the collection or starts a native request', async () => {
  const h = harness();
  await assert.rejects(h.backend.cardIds('bad', DeckPreviewScope.All, '/collection'), /Invalid deck preview request/);
  assert.deepEqual(h.events, []);
  assert.equal(h.scheduler.canSync(), true);
});
