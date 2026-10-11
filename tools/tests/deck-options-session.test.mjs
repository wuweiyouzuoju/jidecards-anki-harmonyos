// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { DeckOptionsSession } from '../../entry/src/main/ets/model/home/DeckOptionsSession.ts';
import { emptyDeckConfigSettings } from '../../entry/src/main/ets/proto/messages/DeckConfigMessages.ts';
import { copyDeckConfig } from '../../entry/src/main/ets/model/DeckConfigSave.ts';

const deferred = () => { let resolve, reject; const promise = new Promise((a,b) => {resolve=a; reject=b;}); return {promise,resolve,reject}; };
const flush = () => new Promise(resolve => setImmediate(resolve));
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
  const first=h.session.load(); await flush(); h.backend.load=async()=>h.view; await h.session.load();
  old.reject(new Error('stale')); await first; assert.equal(h.states.at(-1).phase,'ready');
  const late=deferred(); h.backend.load=()=>late.promise; const pending=h.session.load(); await flush();
  h.session.dispose(); const count=h.states.length; late.resolve(h.view); await pending; assert.equal(h.states.length,count);
});
test('accepted deck save freezes its request, rejects duplicate clicks, and broadcasts after disposal',async()=>{
  const h=setup(),pending=deferred(); await h.session.load();
  h.backend.save=async request=>{h.writes.push(request);await pending.promise;};
  const draft={...h.config,config:{...h.config.config,newPerDay:12}};
  const work=h.session.save(draft,false,h.options); draft.config.newPerDay=99;
  assert.equal(await h.session.save(draft,false,h.options),false);
  await flush();
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

test('rename and switching back retain the persisted baseline and isolate current-deck edits',async()=>{
  for(const action of ['rename','switch']) {
    const h=setup();const other=copyDeckConfig(h.config);other.id=2;other.name='Other';
    h.view.allConfigs.push({config:other,useCount:1});await h.session.load();
    const draft=copyDeckConfig(h.config);draft.config.newPerDay=13;
    if(action==='rename') h.session.editPreset('rename','Private',draft,false);
    else {h.session.editPreset('select','2',draft,false);h.session.editPreset('select','1',h.states.at(-1).config,false);}
    await h.session.save(h.states.at(-1).config,false,h.options);
    const current=h.writes[0].configs.at(-1);
    assert.equal(current.id,0);assert.equal(current.config.newPerDay,13);
    assert.equal(current.name,action==='rename'?'Private':'Deck');
    assert.equal(h.config.config.newPerDay,0,'persisted baseline is unchanged');
  }
});

test('each staged preset keeps its scope across switches, failed saves and final shared edits',async()=>{
  for(const scope of [false,true]) {
    const h=setup();const other=copyDeckConfig(h.config);other.id=2;other.name='Other';
    h.view.allConfigs.push({config:other,useCount:2});await h.session.load();
    const draft=copyDeckConfig(h.config);draft.config.newPerDay=13;
    h.session.editPreset('select','2',draft,scope);
    h.session.editPreset('select','1',h.states.at(-1).config,true);
    assert.equal(h.states.at(-1).presetShared,scope);
    h.session.editPreset('select','2',h.states.at(-1).config,scope);
    const selected=copyDeckConfig(h.states.at(-1).config);selected.config.reviewsPerDay=40;
    h.backend.save=async request=>{h.writes.push(request);throw Error('disk full');};
    assert.equal(await h.session.save(selected,true,h.options),false);
    h.backend.save=async request=>h.writes.push(request);
    assert.equal(await h.session.save(selected,true,h.options),true);
    assert.deepEqual(h.writes[0],h.writes[1]);
    assert.deepEqual(h.writes[0].configs.map(config=>config.id),[scope?1:0,2]);
    assert.equal(h.writes[0].configs[0].config.newPerDay,13);
    assert.equal(h.writes[0].configs.at(-1).config.reviewsPerDay,40);
    assert.notEqual(h.writes[0].configs[0].name,h.writes[0].configs.at(-1).name);
  }
});

test('selecting a preset used by a single other deck still isolates current-deck changes',async()=>{
  const h=setup();const other=copyDeckConfig(h.config);other.id=2;other.name='Other';
  h.view.allConfigs.push({config:other,useCount:1});await h.session.load();
  h.session.editPreset('select','2',h.config,false);
  const draft=copyDeckConfig(h.states.at(-1).config);draft.config.newPerDay=13;
  await h.session.save(draft,false,h.options);
  assert.equal(h.writes[0].configs.at(-1).id,0);
});
