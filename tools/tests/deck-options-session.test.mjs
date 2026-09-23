// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { DeckOptionsSession } from '../../entry/src/main/ets/model/home/DeckOptionsSession.ts';
import { emptyDeckConfigSettings } from '../../entry/src/main/ets/proto/messages/DeckConfigMessages.ts';

const deferred = () => { let resolve, reject; const promise = new Promise((a,b) => {resolve=a; reject=b;}); return {promise,resolve,reject}; };
function setup() {
  const config = {id: 1,name: 'Default',mtimeSecs: 0,usn: 0,config: emptyDeckConfigSettings()};
  const view = {allConfigs: [{config,useCount: 2}], currentDeck: {name:'Deck',configId:1,parentConfigIds:[],limits:null},
    defaults:null,schemaModified:false,cardStateCustomizer:'',newCardsIgnoreReviewLimit:false,fsrs:false,applyAllParentLimits:false,fsrsHealthCheck:false};
  const options = {limits:null,newCardsIgnoreReviewLimit:false,fsrs:false,applyAllParentLimits:false,fsrsReschedule:false,fsrsHealthCheck:false};
  const states=[], writes=[]; let committed=0;
  const backend = {load:async()=>view,save:async request=>writes.push(request),committed:()=>committed++};
  const session=new DeckOptionsSession(7,backend,s=>states.push(s));
  return {config,view,options,states,writes,backend,session,committed:()=>committed};
}
test('deck option reads discard out-of-order results and errors after disposal',async()=>{
  const h=setup(),old=deferred(); h.backend.load=()=>old.promise;
  const first=h.session.load(); h.backend.load=async()=>h.view; await h.session.load();
  old.reject(new Error('stale')); await first; assert.equal(h.states.at(-1).phase,'ready');
  const late=deferred(); h.backend.load=()=>late.promise; const pending=h.session.load();
  h.session.dispose(); const count=h.states.length; late.resolve(h.view); await pending; assert.equal(h.states.length,count);
});
test('accepted deck save freezes its request, rejects duplicate clicks, and broadcasts after disposal',async()=>{
  const h=setup(),pending=deferred(); await h.session.load();
  h.backend.save=async request=>{h.writes.push(request);await pending.promise;};
  const draft={...h.config,config:{...h.config.config,newPerDay:12}};
  const work=h.session.save(draft,false,h.options); draft.config.newPerDay=99;
  assert.equal(await h.session.save(draft,false,h.options),false);
  assert.equal(h.writes[0].configs[0].config.newPerDay,12); assert.equal(h.writes[0].targetDeckId,7);
  h.session.dispose(); const count=h.states.length; pending.resolve(); assert.equal(await work,true);
  assert.equal(h.committed(),1); assert.equal(h.states.length,count);
});
test('failed saves preserve the editing session for retry',async()=>{
  const h=setup(); await h.session.load(); h.backend.save=async()=>{throw new Error('disk full');};
  assert.equal(await h.session.save(h.config,false,h.options),false);
  assert.equal(h.states.at(-1).phase,'ready'); assert.equal(h.states.at(-1).error,'disk full');
  assert.equal(h.committed(),0); h.backend.save=async()=>{};
  assert.equal(await h.session.save(h.config,false,h.options),true); assert.equal(h.committed(),1);
});

test('a committed save cannot be repeated when its notification fails',async()=>{
  const h=setup(); await h.session.load();
  h.backend.committed=()=>{throw new Error('notification failed');};
  assert.equal(await h.session.save(h.config,false,h.options),true);
  assert.equal(h.states.at(-1).phase,'saved');
  assert.equal(h.states.at(-1).error,'notification failed');
  assert.equal(await h.session.save(h.config,false,h.options),false);
  await h.session.load();
  assert.equal(h.states.at(-1).phase,'saved'); assert.equal(h.writes.length,1);
});
