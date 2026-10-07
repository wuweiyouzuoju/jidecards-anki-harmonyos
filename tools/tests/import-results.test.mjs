// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeImportResponse } from '../../entry/src/main/ets/proto/messages/ImportExportMessages.ts';
import { importResultBatch, importResultCategories } from '../../entry/src/main/ets/model/ImportResults.ts';
import { DataTransferSession } from '../../entry/src/main/ets/model/home/DataTransferSession.ts';
import { 协议写入器 as Writer } from '../../entry/src/main/ets/proto/core/ProtoWriter.ts';

function response(groups) {
  const log = new Writer();
  for (const [category, ids] of groups) for (const id of ids) {
    const noteId = new Writer(); noteId.写入变长整数(1, id);
    const note = new Writer(); note.写入字节(1, noteId.转为字节());
    note.写入字符串(2, 'source contents are not needed for navigation');
    log.写入字节(category, note.转为字节());
  }
  const outer = new Writer(); outer.写入字节(2, log.转为字节());
  return decodeImportResponse(outer.转为字节());
}
test('compact import logs retain only target note IDs, including duplicate destinations', () => {
  const summary = response([[1,[1700000000001,1700000000002]],[2,[1700000000003]],[3,[1700000000004]],[4,[1700000000001]],[8,[0]]]);
  assert.deepEqual(summary.newNoteIds,[1700000000001,1700000000002]);
  assert.deepEqual(summary.updatedNoteIds,[1700000000003]);
  assert.deepEqual(summary.duplicateNoteIds,[1700000000004]);
  assert.equal(summary.conflictingNotes,1);
  assert.equal(importResultBatch(summary,'conflict',0),null);
  assert.equal(importResultCategories(summary).find(x=>x.id==='empty').noteIds.length,0);
  assert.equal(importResultBatch(summary,'duplicate',0).query,'nid:1700000000004');
});
test('large import results have bounded precise batches with no lost final IDs', () => {
  const ids=Array.from({length:513},(_,i)=>1700000000000+i);
  const summary=response([[1,ids]]);
  const batches=[0,1,2].map(i=>importResultBatch(summary,'new',i));
  assert.equal(batches[0].first,1); assert.equal(batches[0].last,256);
  assert.equal(batches[1].first,257); assert.equal(batches[1].last,512);
  assert.deepEqual(batches[2],{query:'nid:1700000000512',first:513,last:513,total:513});
  assert.deepEqual(batches.flatMap(b=>b.query.slice(4).split(',').map(Number)),ids);
  for(const page of [-1,0.5,3,Infinity]) assert.equal(importResultBatch(summary,'new',page),null);
});
test('result navigation requires a completed import and never repeats its write', async () => {
  let writes=0;
  const session=new DataTransferSession({importPackagePresets:async()=>({}),
    importDeck:async()=>{writes++;return response([[1,[1700000000001]]]);}, committed:()=>{}},()=>{},async()=>{},()=>{});
  assert.equal(session.resultQuery('new',0),null);
  const pending=session.importUri('test.apkg'); await new Promise(r=>setImmediate(r));
  await session.execute({kind:'importDeck'}); await pending;
  assert.equal(session.resultQuery('new',0),'nid:1700000000001');
  assert.equal(session.resultQuery('new',0),'nid:1700000000001'); assert.equal(writes,1);
  session.dispose(); assert.equal(session.resultQuery('new',0),null);
});
