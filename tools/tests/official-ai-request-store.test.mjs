// SPDX-License-Identifier: AGPL-3.0-or-later
import assert from 'node:assert/strict';
import { createHash,randomUUID } from 'node:crypto';
import test from 'node:test';
import { loadPlatformModule } from './platform-module-harness.mjs';

test('paid request IDs survive restart and distinguish account and payload without storing either',async()=>{
  const data=new Map();let fail=false;
  const store={get:async(k,d)=>data.get(k)??d,put:async(k,v)=>data.set(k,v),flush:async()=>{if(fail)throw Error('disk')},delete:async k=>data.delete(k)};
  function load(){return loadPlatformModule('backend/agent/OfficialAIRequestStore.ets','({prepareOfficialRequest,completeOfficialRequest})',{
    AppStorage:{get:()=>({})},preferences:{getPreferences:async()=>store},
    util:{TextEncoder:class {encodeInto(text){return new TextEncoder().encode(text)}},generateRandomUUID:randomUUID},cryptoFramework:{createMd:()=>{
      const hash=createHash('sha256');return {update:async blob=>hash.update(blob.data),digest:async()=>({data:hash.digest()})};
    }}
  });}
  const first=load();const [a,b]=await Promise.all([first.prepareOfficialRequest('secret','private text'),first.prepareOfficialRequest('secret','private text')]);
  assert.equal(a.id,b.id);
  const restarted=load();assert.deepEqual(await restarted.prepareOfficialRequest('secret','private text'),a);
  assert.notEqual((await restarted.prepareOfficialRequest('another account','private text')).id,a.id);
  assert.notEqual((await restarted.prepareOfficialRequest('secret','different text')).id,a.id);
  assert.equal(JSON.stringify([...data]).includes('secret'),false);assert.equal(JSON.stringify([...data]).includes('private text'),false);
  await restarted.completeOfficialRequest(a);assert.notEqual((await restarted.prepareOfficialRequest('secret','private text')).id,a.id);
  fail=true;await assert.rejects(restarted.prepareOfficialRequest('new','unsaved request'),/disk/);
});
