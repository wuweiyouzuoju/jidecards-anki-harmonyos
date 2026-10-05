// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { toggleBrowserCardState } from '../../entry/src/main/ets/model/BrowserCardState.ts';
import { BURY_SUSPEND_MODE_BURY_USER, BURY_SUSPEND_MODE_SUSPEND } from '../../entry/src/main/ets/proto/messages/SchedulerMessages.ts';

function backend(queues) {
  const calls = [];
  return { calls, queues, queue: async id => { calls.push(['read', id]); return queues.get(id); },
    restore: async ids => { calls.push(['restore', ids]); },
    buryOrSuspend: async (ids, mode) => { calls.push(['set', ids, mode]); } };
}

test('AnkiDroid toggles clear only all-suspended or all-buried selections; mixed selections set the requested state', async () => {
  for (const [kind, queues, action, mode] of [
    ['suspend', [-1,-1], 'restore'], ['suspend', [-1,2], 'set', BURY_SUSPEND_MODE_SUSPEND],
    ['suspend', [-3,-2], 'set', BURY_SUSPEND_MODE_SUSPEND],
    ['bury', [-2,-3], 'restore'], ['bury', [-3,2], 'set', BURY_SUSPEND_MODE_BURY_USER],
    ['bury', [-1,-1], 'set', BURY_SUSPEND_MODE_BURY_USER]
  ]) {
    const service = backend(new Map([[1, queues[0]], [2, queues[1]]]));
    await toggleBrowserCardState(service, [1,2,1], kind);
    assert.deepEqual(service.calls, [['read',1],['read',2],
      action === 'restore' ? ['restore',[1,2]] : ['set',[1,2],mode]]);
  }
});

test('state toggles reread latest queues and freeze selection before the first asynchronous lookup', async () => {
  const service = backend(new Map([[1,-1],[2,-1]])), ids = [1,2];
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const read = service.queue;
  service.queue = async id => { await gate; return read(id); };
  const work = toggleBrowserCardState(service, ids, 'suspend');
  ids.splice(0, 2, 3); release(); await work;
  assert.deepEqual(service.calls.at(-1), ['restore',[1,2]]);
  service.queues.set(2, 0); service.calls.length = 0;
  await toggleBrowserCardState(service, [1,2], 'suspend');
  assert.deepEqual(service.calls.at(-1), ['set',[1,2],BURY_SUSPEND_MODE_SUSPEND]);
});

test('empty selection and failed queue lookup never write a partial batch; failed writes propagate', async () => {
  const service = backend(new Map([[1,-1],[2,-1]]));
  await toggleBrowserCardState(service, [], 'suspend');
  assert.deepEqual(service.calls, []);
  service.queue = async id => { if (id === 2) throw new Error('read failure'); return 2; };
  await assert.rejects(toggleBrowserCardState(service, [1,2], 'bury'), /read failure/);
  assert.deepEqual(service.calls, []);
  service.queue = async () => -1;
  service.restore = async () => { throw new Error('write failure'); };
  await assert.rejects(toggleBrowserCardState(service, [1,2], 'suspend'), /write failure/);
});
