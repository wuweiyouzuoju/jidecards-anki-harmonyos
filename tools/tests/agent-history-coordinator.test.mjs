// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { AgentHistoryCoordinator } from '../../entry/src/main/ets/model/agent/AgentHistoryCoordinator.ts';
import { createAgentMessage } from '../../entry/src/main/ets/model/agent/AgentConversationView.ts';
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
const settle=async()=>{for(let i=0;i<5;i++)await new Promise(setImmediate);};
const setup=()=>({mode:'create',deckId:1,deckName:'d',notetypeId:2,notetypeName:'t',fieldNames:['Front'],noteTypeKind:0,clozeFieldOrds:[],expanded:false});
const conversation=()=>({id:'c',mode:'create',title:'title',updatedAt:1,setup:setup(),messages:[],audits:[],sources:[],results:[]});
test('history save snapshots visible data and accepted writes finish before deletion even after disposal',async()=>{
  const gate=deferred(),events=[],saved=[];
  const h=new AgentHistoryCoordinator({saveCheckpoint:(id)=>events.push('checkpoint:'+id),
    save:async c=>{saved.push(c);events.push('save:'+c.id);if(c.id==='first')await gate.promise;},
    remove:async id=>events.push('remove:'+id),removeCheckpoint:id=>events.push('remove-checkpoint:'+id)});
  const runtime={exportState:()=>({})},message=createAgentMessage(1,'user','original',false),config=setup();
  const first=h.save('first','create',config,[message],[],'title',runtime);await settle();
  const next=h.save('next','create',config,[message],[],'title',runtime);
  config.fieldNames[0]='changed';message.正文='changed';h.dispose();const removing=h.remove('next');await settle();
  assert.deepEqual(events,['checkpoint:first','save:first','checkpoint:next']);
  gate.resolve();await Promise.all([first,next]);assert.equal(await removing,false);
  assert.equal(saved[1].setup.fieldNames[0],'Front');assert.equal(saved[1].messages[0].text,'original');
  assert.deepEqual(events.slice(-3),['save:next','remove:next','remove-checkpoint:next']);
});
test('history checkpoint failure never publishes a misleading saved conversation',async()=>{
  let writes=0;const h=new AgentHistoryCoordinator({saveCheckpoint:()=>{throw Error('disk');},save:async()=>writes++});
  assert.throws(()=>h.save('c','create',setup(),[createAgentMessage(1,'user','x',false)],[],'title',{exportState:()=>({})}),/disk/);
  await settle();assert.equal(writes,0);
});
test('history restore reconciles actions through the runtime without restoring card-write tokens',()=>{
  let nextId=100;const selected=conversation();
  selected.messages=[{id:1,role:'assistant',text:'old',kind:'normal',clarification:null,expanded:false,
    action:{id:'old',kind:'write',payloadJson:'{}',status:'executing',resultJson:''}},
    {id:2,role:'assistant',text:'current',kind:'normal',clarification:null,expanded:false,
    action:{id:'current',kind:'read',payloadJson:'{}',status:'pending',resultJson:''}}];
  const events=[],action={...selected.messages[1].action,status:'cancelled'};
  const h=new AgentHistoryCoordinator({loadCheckpoint:()=>({marker:'saved'})});
  const result=h.restore(selected,[1],[2],()=>++nextId,'tools',true,{
    clear:()=>events.push('clear'),restore:s=>events.push(s.marker),getAction:()=>action,isPaused:()=>true});
  assert.deepEqual(events,['clear','saved']);assert.equal(result.messages[0].action.status,'cancelled');
  assert.equal(result.messages[1].action,action);assert.equal(result.messages.at(-1).taskStatus,'paused');
  assert.ok(result.messages.every(m=>m.卡片列表.length===0&&m.变更草稿列表.length===0));
  assert.equal(selected.messages[0].action.status,'executing');assert.equal(result.contextValid,true);
  assert.equal(h.isCurrent(result.generation),true);h.invalidateRestore();assert.equal(h.isCurrent(result.generation),false);
});
test('history validates deleted deck/type context in create mode while edit keeps optional selections',()=>{
  const h=new AgentHistoryCoordinator({});const selected=conversation();
  let result=h.restore(selected,[],[2],()=>1,'',false,null);
  assert.equal(result.deckId,0);assert.equal(result.notetypeId,0);assert.equal(result.contextValid,false);
  result=h.restore(selected,[1],[],()=>1,'',false,null);assert.equal(result.deckId,1);assert.equal(result.notetypeId,0);
  selected.mode='edit';selected.setup.deckId=0;selected.setup.notetypeId=0;
  result=h.restore(selected,[],[],()=>1,'',false,null);assert.equal(result.contextValid,true);
});
