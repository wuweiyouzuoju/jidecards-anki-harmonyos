// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadComponentLogic } from './platform-module-harness.mjs';
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};

function harness(name, commands) {
  const events=[];
  const Feature=loadComponentLogic('components/home/'+name+'.ets',name,{
    HomeDeckCommands:class { create(...args){return commands.create(...args);} customize(...args){return commands.customize(...args);} },
    空牌组汇总:{}, $r:key=>key, resourceText:(_ui,key)=>key, showToastSafely:()=>events.push('refresh-error'),
    AppStorage:{get:()=>({filesDir:'/data'}),setOrCreate:()=>events.push('broadcast')}
  });
  const feature=new Feature(); feature.getUIContext=()=>({});
  feature.onBusy=busy=>events.push(busy?'busy':'idle');feature.onClose=()=>events.push('close');
  feature.onCreated=async(id,name)=>events.push(['created',id,name]);feature.onSaved=async()=>events.push('saved');
  feature.deck={id:'10',name:'original',displayName:''};
  return {feature,events};
}

test('creation rejects double submission, reports failure locally and can retry',async()=>{
  const gate=deferred();let calls=0;
  const h=harness('CreateDeckFeature',{create:async()=>{calls++;return gate.promise;}});
  const first=h.feature.create('deck');await h.feature.create('again');assert.equal(calls,1);
  gate.reject(new Error('write failed'));await first;
  assert.equal(h.feature.busy,false);assert.equal(h.feature.error,'write failed');assert.ok(!h.events.includes('close'));
  h.feature.commands.create=async()=>123;await h.feature.create('retry');
  assert.ok(h.events.includes('broadcast'));assert.deepEqual(h.events.find(Array.isArray),['created','123','retry']);
  assert.ok(h.events.includes('close'));
});

test('accepted creation completes after disposal and only broadcasts committed data',async()=>{
  const gate=deferred();const h=harness('CreateDeckFeature',{create:()=>gate.promise});
  const pending=h.feature.create('deck');h.feature.aboutToDisappear();gate.resolve(4);await pending;
  assert.deepEqual(h.events,['busy','broadcast']);
});

test('customization owns validation and partial background failure; committed retry refreshes before close',async()=>{
  let saved=false,calls=0;const h=harness('DeckCustomizationFeature',{customize:async()=>{calls++;return saved;}});
  await h.feature.save({新名:' '});assert.equal(calls,0);
  await h.feature.save({新名:'alias'});assert.equal(h.feature.error,'app.string.deck_customize_background_save_failed');
  assert.ok(!h.events.includes('close'));saved=true;await h.feature.save({新名:'alias'});
  assert.ok(h.events.indexOf('saved')<h.events.indexOf('close'));assert.equal(h.feature.busy,false);
});

test('customization does not notify a destroyed UI when the accepted write completes',async()=>{
  const gate=deferred();const h=harness('DeckCustomizationFeature',{customize:()=>gate.promise});
  const pending=h.feature.save({新名:'alias'});h.feature.aboutToDisappear();gate.resolve(true);await pending;
  assert.deepEqual(h.events,['busy','broadcast']);
});

test('post-commit refresh failure closes the form without inviting another write',async()=>{
  for (const name of ['CreateDeckFeature','DeckCustomizationFeature']) {
    const h=harness(name,{create:async()=>1,customize:async()=>true});
    h.feature.onCreated=h.feature.onSaved=async()=>{throw new Error('refresh failed');};
    if(name==='CreateDeckFeature')await h.feature.create('deck');else await h.feature.save({新名:'alias'});
    assert.ok(h.events.includes('refresh-error'));assert.ok(h.events.includes('close'));
    assert.equal(h.feature.error,'');
  }
});
