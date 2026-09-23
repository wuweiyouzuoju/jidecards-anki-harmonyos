// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { DataTransferSession } from '../../entry/src/main/ets/model/home/DataTransferSession.ts';
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
function harness(){
  const events=[],states=[];
  const backend={pickDeck:async()=>null,pickCollection:async()=>null,
    importDeck:async(uri,progress)=>{events.push(['import',uri]);progress(1);return null;},
    replaceCollection:async uri=>events.push(['replace',uri]),exportData:async()=>true,
    committed:()=>events.push('committed')};
  const session=new DataTransferSession(backend,s=>states.push(s),async()=>events.push('refresh'),()=>events.push('success'));
  return {events,states,backend,session};
}
test('transfer reserves file selection and suppresses duplicate pickers and close',async()=>{
  const h=harness(),picker=deferred();let picks=0;h.backend.pickDeck=()=>{picks++;return picker.promise;};
  h.session.open('importDeck',0,false);const work=h.session.execute({kind:'importDeck'});
  h.session.close();await h.session.execute({kind:'importDeck'});assert.equal(picks,1);
  assert.equal(h.states.at(-1).visible,true);assert.equal(h.states.at(-1).phase,'picking');
  picker.resolve(null);await work;assert.equal(h.states.at(-1).phase,'idle');assert.deepEqual(h.events,[]);
});
test('replacement requires confirmation before selecting a collection and starts no write after disposal',async()=>{
  const h=harness(),picker=deferred();let picks=0;h.backend.pickCollection=()=>{picks++;return picker.promise;};
  h.session.open('importPersonalData',0,false);const intent={kind:'replacePersonalData',confirmed:true};
  await h.session.execute(intent);assert.equal(picks,0);assert.equal(h.states.at(-1).replacementStep,1);
  const work=h.session.execute(intent);assert.equal(picks,1);h.session.dispose();const count=h.states.length;
  picker.resolve('collection.colpkg');await work;assert.deepEqual(h.events,[]);assert.equal(h.states.length,count);
});
test('accepted import survives disposal, broadcasts once, and never refreshes or publishes to departed UI',async()=>{
  const h=harness(),gate=deferred();h.backend.importDeck=()=>gate.promise;
  const work=h.session.importUri('deck.apkg');await h.session.importUri('duplicate.apkg');
  h.session.dispose();const count=h.states.length;gate.resolve(null);await work;
  assert.deepEqual(h.events,['committed']);assert.equal(h.states.length,count);
});
test('failed import retains error and retry; success refreshes before closing',async()=>{
  const h=harness();h.backend.importDeck=async()=>{throw new Error('invalid package');};
  await h.session.importUri('broken');assert.equal(h.states.at(-1).visible,true);
  assert.equal(h.states.at(-1).error,'invalid package');assert.equal(h.states.at(-1).phase,'idle');
  h.backend.importDeck=async()=>null;await h.session.importUri('valid');
  assert.deepEqual(h.events,['committed','refresh','success']);assert.equal(h.states.at(-1).visible,false);
});
test('refresh failure after successful write closes resubmission and still releases occupancy',async()=>{
  const states=[],events=[];const backend={importDeck:async()=>null,committed:()=>events.push('committed')};
  const session=new DataTransferSession(backend,s=>states.push(s),async()=>{throw new Error('refresh');},()=>events.push('success'));
  await session.importUri('deck');assert.deepEqual(events,['committed']);
  assert.equal(states.at(-1).visible,false);assert.equal(states.at(-1).phase,'idle');assert.equal(states.at(-1).error,'refresh');
});
