// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { BrowserSearchSession } from '../../entry/src/main/ets/model/BrowserSearchSession.ts';
const query = {filesDir: '/files', notes: false, text: '', filter: '', sortColumn: '', sortReverse: false};
const deferred = () => { let resolve; const promise = new Promise(r => resolve = r); return {promise, resolve}; };
function harness() {
  const calls = [];
  const backend = {open: async () => {}, setNotesMode: async () => {}, columns: async () => ({columns: []}), activateColumns: async () => {},
    buildSearch: async node => node.kind === 'card_state' ? 'suspended' : '',
    search: async request => request.search === 'suspended' ? [] : Array.from({length: 303}, (_, i) => i + 1),
    row: async id => {calls.push(id); if (id === 202) throw Error('bad row'); return {cells: [], color: 0};}};
  return {backend, calls, session: new BrowserSearchSession(backend)};
}
test('failed rows consume IDs and repeated pagination never repeats successes', async () => {
  const h = harness(); await h.session.search(query, () => true);
  const result = await h.session.more(() => true); assert.equal(result.consumed, 300); assert.equal(result.rows.length, 299);
  const last = await h.session.more(() => true); assert.equal(last.consumed, 303); assert.equal(last.rows.length, 302);
  assert.equal(await h.session.more(() => true), null); assert.equal(new Set(h.calls).size, h.calls.length);
});
test('a new search invalidates old pagination and old finally cannot unlock its successor', async () => {
  const h = harness(); await h.session.search(query, () => true); const pending = deferred();
  h.backend.row = async () => pending.promise;
  const old = h.session.more(() => true); await new Promise(setImmediate);
  h.backend.row = async id => ({cells: [id], color: 0});
  const newer = h.session.search({...query, text: 'new'}, () => true);
  pending.resolve({cells: ['old'], color: 0}); assert.equal(await old, null);
  const result = await newer; assert.equal(result.rows.length, 200); assert.deepEqual(result.rows[0].cells, [1]);
  const load = deferred(); h.backend.row = async () => load.promise;
  const first = h.session.more(() => true); assert.equal(await h.session.more(() => true), null);
  load.resolve({cells: [], color: 0}); assert.equal((await first).consumed, 300);
});
