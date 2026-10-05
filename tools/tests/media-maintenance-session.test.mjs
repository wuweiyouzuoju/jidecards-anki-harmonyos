// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MediaMaintenanceSession } from '../../entry/src/main/ets/model/settings/MediaMaintenanceSession.ts';
import { decodeMediaSnapshotPage, encodeMediaSnapshotRequest } from '../../entry/src/main/ets/proto/messages/MediaSnapshotMessages.ts';
import { 协议写入器 } from '../../entry/src/main/ets/proto/core/ProtoWriter.ts';
const deferred = () => { let resolve; const promise = new Promise(r => resolve = r); return {promise, resolve}; };
const page = (report, nextOffset = 0) => ({token: 7, unusedCount: 100000, missingCount: 3, haveTrash: false, report, nextOffset, files: []});
function harness() {
  const states = [], calls = [];
  const backend = {createSnapshot: async () => page('first', 16384), reportPage: async (token, offset) => {calls.push(['page', token, offset]); return page('second');},
    trashSnapshot: async token => calls.push(['trash', token]), releaseSnapshot: async token => calls.push(['release', token]),
    emptyTrash: async () => {}, restoreTrash: async () => {}, isSyncing: async () => false};
  return {backend, states, calls, session: new MediaMaintenanceSession(backend, s => states.push(s))};
}
test('continuous scrolling appends ordered bounded chunks and preserves previous text', async () => {
  const h = harness(); await h.session.check();
  assert.deepEqual(h.states.at(-1).reports, ['first']);
  const pending = deferred(); h.backend.reportPage = () => pending.promise;
  const work = h.session.loadMore(); await h.session.loadMore();
  pending.resolve(page('second')); await work;
  assert.deepEqual(h.states.at(-1).reports, ['first', 'second']);
  assert.equal(h.states.at(-1).next, false); await h.session.loadMore();
  assert.deepEqual(h.states.at(-1).reports, ['first', 'second']);
});
test('late check releases native snapshot after disposal without publishing', async () => {
  const h = harness(), pending = deferred(); h.backend.createSnapshot = () => pending.promise;
  const work = h.session.check(); await Promise.resolve(); h.session.dispose(); const count = h.states.length;
  pending.resolve(page('late')); await work;
  assert.equal(h.states.length, count); assert.deepEqual(h.calls, [['release', 7]]);
});
test('accepted cleanup finishes after disposal; no new check or write starts after disposed preconditions', async () => {
  const h = harness(); await h.session.check(); const write = deferred();
  h.backend.trashSnapshot = async token => {h.calls.push(['trash', token]); await write.promise;};
  const work = h.session.trash(); await Promise.resolve(); h.session.dispose(); write.resolve(); await work;
  assert.deepEqual(h.calls, [['trash', 7], ['release', 7]]);
  const next = harness(), sync = deferred(); next.backend.isSyncing = () => sync.promise;
  const check = next.session.check(); next.session.dispose(); sync.resolve(false); await check;
  assert.equal(next.states.at(-1).checked, false); assert.deepEqual(next.calls, []);
});
test('media sync and expired snapshots fail visibly and require a fresh check', async () => {
  const h = harness(); await h.session.check(); h.backend.isSyncing = async () => true; await h.session.trash();
  assert.match(h.states.at(-1).error, /Media sync active/); assert.equal(h.calls.some(c => c[0] === 'trash'), false);
});
test('application media wire schema decodes counts, UTF-8 and continuation offsets', () => {
  const w = new 协议写入器(); w.写入变长整数(1, 7); w.写入变长整数(2, 100000); w.写入变长整数(3, 3);
  w.写入字符串(5, '媒体😀'); w.写入变长整数(6, 16383); w.写入字符串(7, 'file.png');
  assert.deepEqual(decodeMediaSnapshotPage(w.转为字节()), {...page('媒体😀', 16383), files: ['file.png'], noteIds: [], missingNoteCount: 0, taggedCount: 0});
  assert.deepEqual([...encodeMediaSnapshotRequest(7, 128)], [8, 7, 16, 128, 1]);
});

test('missing-note pages form an exact query and an expired page cannot navigate', async () => {
  const h = harness(); await h.session.check(); const offsets = [];
  h.backend.missingNotesPage = async (token, offset) => {
    offsets.push(offset); return {...page(''), token, noteIds: offset === 0 ? [1700000000001] : [1700000000002], nextOffset: offset === 0 ? 1 : 0};
  };
  assert.equal(await h.session.missingNotesSearch(), 'nid:1700000000001,1700000000002');
  assert.deepEqual(offsets, [0,1]);
  h.backend.missingNotesPage = async () => ({...page(''), token:99});
  assert.equal(await h.session.missingNotesSearch(), ''); assert.equal(h.states.at(-1).checked, false);
});
test('late missing-note reads never navigate and accepted tagging completes after disposal', async () => {
  const h = harness(); await h.session.check(); const read = deferred();
  h.backend.missingNotesPage = () => read.promise;
  const search = h.session.missingNotesSearch(); h.session.dispose(); read.resolve({...page(''), noteIds:[42]});
  assert.equal(await search, '');
  const next = harness(); await next.session.check(); const write = deferred(); let changed=0;
  next.backend.tagMissingNotes = async () => { await write.promise; return 3; }; next.backend.changed = () => changed++;
  const tag = next.session.tagMissing(); await Promise.resolve(); next.session.dispose(); write.resolve(); await tag;
  assert.equal(changed,1); assert.equal(next.calls.filter(c => c[0] === 'release').length,1);
});
test('missing-note wire supports packed and unpacked int64 without narrowing IDs', () => {
  const writer = new 协议写入器(); writer.写入64位整数(8,1700000000001); writer.写入打包64位整数(8,[1700000000002]);
  writer.写入变长整数(9,2); writer.写入变长整数(10,1);
  const decoded = decodeMediaSnapshotPage(writer.转为字节());
  assert.deepEqual(decoded.noteIds,[1700000000001,1700000000002]); assert.equal(decoded.missingNoteCount,2); assert.equal(decoded.taggedCount,1);
});

test('a committed tag write remains successful when the follow-up media check fails', async () => {
  const h = harness(); await h.session.check(); let writes = 0, changed = 0;
  h.backend.tagMissingNotes = async token => { assert.equal(token, 7); writes++; return 3; };
  h.backend.changed = () => changed++;
  h.backend.createSnapshot = async () => { throw Error('Recheck unavailable'); };
  await h.session.tagMissing();
  assert.equal(writes, 1); assert.equal(changed, 1);
  assert.equal(h.states.at(-1).taggedCount, 3);
  assert.equal(h.states.at(-1).error, 'media_tag_refresh_error');
  assert.equal(h.states.at(-1).checked, false);
  await h.session.tagMissing(); assert.equal(writes, 1);
  assert.deepEqual(h.calls, [['release', 7]]);
});
test('media UI retains continuous scrolling without page navigation controls', () => {
  const source = readFileSync(new URL('../../entry/src/main/ets/components/settings/媒体管理面板.ets', import.meta.url), 'utf8');
  assert.match(source, /Scroll\(\)/); assert.match(source, /onScrollEdge[\s\S]*maintenance\.loadMore\(\)/);
  assert.match(source, /ForEach\(this\.reportChunks/);
  assert.doesNotMatch(source, /media_report_previous|media_report_next|未使用全部/);
});
