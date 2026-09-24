// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { NoteEditorSession, initialNoteEditorState } from '../../entry/src/main/ets/model/NoteEditorSession.ts';

const deferred = () => { let resolve, reject; const promise = new Promise((a,b) => { resolve=a; reject=b; }); return {promise,resolve,reject}; };
const note = id => ({ id, guid:'g', notetypeId:1, mtimeSecs:0, usn:0, fields:['front','back'], tags:['old'] });
function harness() {
  let state = initialNoteEditorState(); const events=[];
  const backend={ card:async id=>({noteId:id+10}), note:async id=>note(id), notetype:async()=>({fieldNames:['Front','Back']}) };
  const session=new NoteEditorSession(backend, value=>{state=value;events.push(value);});
  return {session,backend,events,get state(){return state;}};
}

test('editor loads card or note identity, latest open wins, close invalidates loading', async()=>{
  const h=harness(), gate=deferred();
  await h.session.open(2,false,()=>true); assert.equal(h.state.note.id,12);
  h.backend.note=async id=>id===1?gate.promise:note(id);
  const first=h.session.open(1,true,()=>true); await h.session.open(3,true,()=>true);
  gate.resolve(note(1)); await first; assert.equal(h.state.note.id,3);
  const late=deferred(); h.backend.note=()=>late.promise;
  const pending=h.session.open(4,true,()=>true); h.session.close(); late.resolve(note(4));
  assert.equal(await pending,'stale'); assert.deepEqual(h.state,initialNoteEditorState());
});

test('study editor stays unmounted until its fields arrive and expired reads release busy',async()=>{
  const h=harness(), gate=deferred(); let active=true;
  h.backend.note=()=>gate.promise;
  const pending=h.session.open(1,true,()=>active,false);
  assert.equal(h.state.visible,false); assert.equal(h.state.busy,true);
  active=false; gate.resolve(note(1)); assert.equal(await pending,'stale');
  assert.deepEqual(h.state,initialNoteEditorState());
  h.backend.note=async()=>{throw new Error('offline');};
  assert.equal(await h.session.open(1,true,()=>true,false),'failed');
  assert.equal(h.state.error,'load'); assert.equal(h.state.visible,false);
});

test('save freezes identity and input, rejects duplicate writes, and retains draft after failure',async()=>{
  const h=harness(); await h.session.open(1,true,()=>true);
  const gate=deferred(), fields=['new'], tags=['t']; let submitted,calls=0;
  const write=async value=>{calls++;submitted=value;await gate.promise;return false;};
  const pending=h.session.save(fields,tags,write,true); fields[0]='mutated';tags.push('mutated');
  assert.equal(await h.session.save([],[],write),false);
  assert.deepEqual(submitted,{...note(1),fields:['new',''],tags:['t']});
  gate.resolve(); assert.equal(await pending,false); assert.equal(calls,1);
  assert.equal(h.state.error,'save'); assert.equal(h.state.visible,true);assert.equal(h.state.busy,false);
  assert.equal(await h.session.save(['retry'],[],async()=>true),true);
  assert.deepEqual(h.state,initialNoteEditorState());
});

test('close/reopen and dispose do not revoke accepted writes or publish old completion',async()=>{
  for(const dispose of [false,true]) {
    const h=harness(),gate=deferred(); await h.session.open(1,true,()=>true);
    const pending=h.session.save(['saved'],[],async()=>{await gate.promise;return true;});
    if(dispose) h.session.dispose(); else {h.session.close();await h.session.open(2,true,()=>true);}
    const count=h.events.length;
    gate.resolve();assert.equal(await pending,true);assert.equal(h.events.length,count);
    if(!dispose) assert.equal(h.state.note.id,2);
  }
});
