// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { BrowserNotetypeSession } from '../../entry/src/main/ets/model/browser/BrowserNotetypeSession.ts';
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return{promise,resolve};};
const info=id=>({input:{oldNotetypeId:1,newNotetypeId:id,newFields:[0,1],newTemplates:[0],currentSchema:123,oldNotetypeName:'Basic',isCloze:false},oldFieldNames:['A','B'],newFieldNames:['A','B'],oldTemplateNames:['Card'],newTemplateNames:['Card']});
test('notetype reads preserve cards/notes semantics and freeze editable mappings',async()=>{
  const events=[],states=[];
  const backend={noteForCard:async id=>{events.push(['card',id]);return 17;},notetypeForNote:async id=>{events.push(['note',id]);return 1;},names:async()=>[{id:2,name:'Next'}],mapping:async()=>info(2)};
  const session=new BrowserNotetypeSession(backend,s=>states.push(s));await session.load(7,false);
  assert.deepEqual(events,[['card',7],['note',17]]);await session.select(2);session.setField(0,-1);
  const request=session.request();session.setField(0,1);assert.deepEqual(request.newFields,[-1,1]);assert.equal(request.currentSchema,123);
  events.length=0;await session.load(99,true);assert.deepEqual(events,[['note',99]]);
});
test('notetype selection discards late mapping and disposal forbids submission',async()=>{
  const pending=deferred(),states=[];const backend={notetypeForNote:async()=>1,names:async()=>[],mapping:async(_,id)=>id===2?pending.promise:info(id)};
  const session=new BrowserNotetypeSession(backend,s=>states.push(s));await session.load(1,true);
  const old=session.select(2);assert.equal(session.request(),null);await session.select(3);
  pending.resolve(info(2));await old;assert.equal(session.request().newNotetypeId,3);
  session.dispose();const count=states.length;await session.select(4);assert.equal(states.length,count);assert.equal(session.request(),null);
});
test('failed mapping cannot submit an earlier schema and can be retried',async()=>{
  const states=[];let fail=false;const backend={notetypeForNote:async()=>1,names:async()=>[],mapping:async(_,id)=>{if(fail)throw Error('schema');return info(id);}};
  const session=new BrowserNotetypeSession(backend,s=>states.push(s));await session.load(1,true);await session.select(2);
  fail=true;await session.select(3);assert.equal(session.request(),null);assert.equal(states.at(-1).error,'schema');
  fail=false;await session.select(3);assert.equal(session.request().newNotetypeId,3);
});
