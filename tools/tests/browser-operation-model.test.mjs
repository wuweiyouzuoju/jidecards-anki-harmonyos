// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { BrowserOperationController } from '../../entry/src/main/ets/model/BrowserOperationController.ts';
import { resolveBrowserCardIds, resolveBrowserNoteIds, snapshotNotetypeChange } from '../../entry/src/main/ets/model/BrowserSelection.ts';
import { AutoSyncScheduler } from '../../entry/src/main/ets/model/AutoSyncScheduler.ts';
import { SyncActivity } from '../../entry/src/main/ets/model/SyncSettings.ts';

const context = (mode, ids) => ({ mode, ids, viewVersion: 0, selectionVersion: 0 });
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };

test('selection conversion snapshots IDs, expands siblings and deduplicates stably', async () => {
  const selection = context('notes', [1, 2]), gate = deferred(), calls = [];
  const result = resolveBrowserCardIds(selection, async id => { calls.push(id); await gate.promise; return [id, id + 1]; });
  selection.ids[1] = 99; gate.resolve();
  assert.deepEqual(await result, [1, 2, 3]); assert.deepEqual(calls, [1, 2]);
  assert.deepEqual(await resolveBrowserNoteIds(context('cards', [1, 2, 3]), async id => id < 3 ? 10 : 20), [10, 20]);
});

test('conversion errors abort rather than returning a partial set; mapping owns all mutable arrays', async () => {
  await assert.rejects(resolveBrowserNoteIds(context('cards', [1, 2]), async id => { if (id === 2) throw new Error('missing'); return 10; }), /missing/);
  await assert.rejects(resolveBrowserCardIds(context('invalid', [1]), async () => []), /Invalid browser mode/);
  const original = { noteIds: [1], newFields: [], newTemplates: [], oldNotetypeId: 1, newNotetypeId: 2, currentSchema: 3, oldNotetypeName: 'old', isCloze: false };
  const fields = [0, -1], templates = [1], saved = snapshotNotetypeChange(original, fields, templates);
  fields[0] = 9; templates.push(2); original.currentSchema = 99;
  assert.deepEqual(saved, { noteIds: [], newFields: [0, -1], newTemplates: [1], oldNotetypeId: 1, newNotetypeId: 2, currentSchema: 3, oldNotetypeName: 'old', isCloze: false });
});

function harness() {
  const controller = new BrowserOperationController(), scheduler = new AutoSyncScheduler(), activity = new SyncActivity(), calls = [];
  const effects = { afterCommit: async () => calls.push('refresh'), changed: () => calls.push('changed'),
    failed: e => calls.push(['write failed', e.message]), refreshFailed: e => calls.push(['refresh failed', e.message]) };
  const selection = controller.begin('cards', [1], 0, 0);
  return { controller, scheduler, activity, calls, effects, selection };
}

test('accepted browser write survives disposal during collection wait and does not update old UI', async () => {
  const h = harness(); h.activity.reserveCollection();
  const result = h.controller.execute(h.selection, async selection => h.calls.push(selection.ids), h.effects, h.scheduler, h.activity);
  h.controller.dispose(); assert.equal(h.scheduler.canSync(), false);
  h.activity.cancelReservation(); assert.equal(await result, true);
  assert.deepEqual(h.calls, [[1], 'changed']); assert.equal(h.scheduler.hasPending(), true); assert.equal(h.scheduler.canSync(), true);
});

test('refresh failure after commit is reported separately and never turns success into a retryable write failure', async () => {
  const h = harness(); h.effects.afterCommit = async () => { throw new Error('refresh'); };
  assert.equal(await h.controller.execute(h.selection, async () => {}, h.effects, h.scheduler, h.activity), true);
  assert.deepEqual(h.calls, [['refresh failed', 'refresh'], 'changed']); assert.equal(h.controller.isBusy(), false);
});

test('failed browser write preserves selection and releases lease without broadcasting success', async () => {
  const h = harness();
  assert.equal(await h.controller.execute(h.selection, async () => { throw new Error('disk'); }, h.effects, h.scheduler, h.activity), false);
  assert.deepEqual(h.calls, [['write failed', 'disk']]); assert.equal(h.scheduler.hasPending(), false);
  assert.equal(h.scheduler.canSync(), true); assert.equal(h.controller.isBusy(), false);
});
