// SPDX-License-Identifier: AGPL-3.0-or-later
import assert from 'node:assert/strict';
import test from 'node:test';
import { agentDeckOptionsFunctionTools,decodeAgentDeckOptionsArguments,agentDeckOptionsFingerprint,agentWritableDeckOptionFields } from '../../entry/src/main/ets/model/agent/AgentDeckOptionsTools.ts';
import { prepareAgentDeckOptions } from '../../entry/src/main/ets/model/agent/AgentDeckOptionsDraft.ets';
import { DeckOptionsSession } from '../../entry/src/main/ets/model/home/DeckOptionsSession.ts';
import { emptyDeckConfigSettings,encodeDeckConfig,encodeUpdateDeckConfigsRequest,decodeUpdateDeckConfigsRequest } from '../../entry/src/main/ets/proto/messages/DeckConfigMessages.ts';
import { toolRiskOf } from '../../entry/src/main/ets/model/agent/AgentPolicy.ts';
import { agentFunctionTools } from '../../entry/src/main/ets/model/agent/AgentToolCatalog.ts';
import { parseAgentToolJsonObject } from '../../entry/src/main/ets/model/agent/AgentToolSchemas.ts';
import { AgentActionLedger,createAgentAction,AgentApprovalRequired } from '../../entry/src/main/ets/model/agent/AgentAction.ts';
import { maintenancePreviewRows } from '../../entry/src/main/ets/model/agent/AgentMaintenancePreview.ts';
import { loadPlatformModule } from './platform-module-harness.mjs';

function fixture(){
 const config={id:1,name:'Shared',mtimeSecs:1,usn:2,config:{...emptyDeckConfigSettings(),newPerDay:20,reviewsPerDay:200,desiredRetention:.9,historicalRetention:.9,
   learnSteps:[1,10],relearnSteps:[10],initialEase:2.5,easyMultiplier:1.3,hardMultiplier:1.2,intervalMultiplier:1,
   maximumReviewInterval:36500,minimumLapseInterval:1,graduatingIntervalGood:1,graduatingIntervalEasy:4,leechThreshold:8,capAnswerTimeToSecs:60,
   other:Uint8Array.of(8,1),preserved:[Uint8Array.of(0xc0,0x0c,42)]}};
 const limits={new:null,review:null,newToday:null,reviewToday:null,newTodayActive:false,reviewTodayActive:false,desiredRetention:null};
 const view={allConfigs:[{config,useCount:3}],currentDeck:{name:'English',configId:1,parentConfigIds:[1],limits},defaults:config,
   schemaModified:false,cardStateCustomizer:'keep script',fsrs:false,fsrsHealthCheck:true,newCardsIgnoreReviewLimit:false,applyAllParentLimits:false};
 const state={view,writes:[],committed:0,reads:0,fail:false,changeAtSubmit:false};
 class Backend {
   async load(){state.reads++;if(state.changeAtSubmit&&state.reads===3)state.view.allConfigs[0].config.config.reviewsPerDay=300;return state.view;}
   async save(request){if(state.fail)throw Error('disk full');state.writes.push(decodeUpdateDeckConfigsRequest(encodeUpdateDeckConfigsRequest(request)));}
   committed(){state.committed++;}
 }
 const scope={assertReadableDeckIds:ids=>{if(ids.some(id=>id!==7))throw Error('scope');},currentCreateTarget:()=>[]};
 const api=loadPlatformModule('backend/agent/AgentDeckOptionsTools.ets','({AgentDeckOptionsTools,executeAgentDeckOptionsAction})',{
   AnkiDeckOptions:Backend,DeckOptionsSession,decodeAgentDeckOptionsArguments,agentDeckOptionsFingerprint,prepareAgentDeckOptions,createAgentAction});
 const Registry=loadPlatformModule('backend/agent/AgentToolRegistry.ets','AgentToolRegistry',{toolRiskOf,parseAgentToolJsonObject,AgentApprovalRequired});
 const registry=new Registry();new api.AgentDeckOptionsTools(scope).register(registry);
 const Executor=loadPlatformModule('backend/agent/AgentActionExecutor.ets','AgentActionExecutor',{
   AgentActionLedger,牌组服务:class{},笔记类型服务:class{},LocalPreferenceWriteError:class extends Error{},executeAgentDeckOptionsAction:api.executeAgentDeckOptionsAction});
 const executor=new Executor(scope,{});
 const args=(changes,scope='preset')=>({deckId:7,scope,changes});
 const propose=changes=>registry.execute({id:'call',name:'propose_update_deck_options',argumentsJson:JSON.stringify(changes)});
 return {state,config,view,executor,propose,args};
}
test('deck options are a real registered write proposal in all modes, with a shared field allowlist and strict schema',()=>{
 const [tool]=agentDeckOptionsFunctionTools();assert.equal(toolRiskOf(tool.name),'write');
 for(const mode of ['create','edit','assistant'])assert.ok(agentFunctionTools(100,mode).some(x=>x.name===tool.name));
 assert.deepEqual(JSON.parse(tool.parametersJson).properties.changes.items.properties.key.enum,agentWritableDeckOptionFields().map(x=>x.key));
 parseAgentToolJsonObject(tool.name,tool.exampleArgumentsJson);
 for(const bad of [null,{}, {deckId:7,scope:'all',changes:[]}, {deckId:7,scope:'deck',changes:[{key:'other',value:'anything'}]},
   {deckId:7,scope:'deck',changes:[{key:'customScheduling',value:'code'}]}, {deckId:7,scope:'deck',changes:[{key:'fsrsEnabled',value:'1'}]},
   {deckId:7,scope:'deck',changes:[{key:'newPerDay',value:'20',rpc:1}]}, {deckId:7,scope:'deck',changes:[{key:'newPerDay',value:'20'},{key:'newPerDay',value:'21'}]},
   {deckId:7,scope:'deck',changes:[{key:'easyDaysPercentages',value:'1 1 1 1 1 1 .3'}]}])assert.throws(()=>decodeAgentDeckOptionsArguments(JSON.stringify(bad)));
});
test('JIDE can propose SM-2 Easy Days and confirm a real Core request once, preserving all unmentioned fields',async()=>{
 const f=fixture();const before=encodeDeckConfig(f.config);
 await assert.rejects(f.propose({...f.args([]),deckId:99}),/invalid/);
 await assert.rejects(f.propose({...f.args([{key:'newPerDay',value:'20'}]),deckId:99}),/scope/);
 const {action,outputJson}=await f.propose(f.args([{key:'easyDaysPercentages',value:'1 1 1 1 1 0.5 0'}]));
 assert.equal(JSON.parse(outputJson).status,'awaiting_confirmation');assert.equal(f.state.writes.length,0);
 const payload=JSON.parse(action.payloadJson);assert.equal(payload.presetUseCount,3);assert.equal(payload.preview.length,1);
 const rows=maintenancePreviewRows(action,key=>key);assert.equal(rows.length,4);assert.equal(rows[0].after,'English');
 assert.equal(rows[3].after.split('\n')[5],'deck_weekday_5: deck_easy_day_reduced');
 assert.equal(rows[3].after.split('\n')[6],'deck_weekday_6: deck_easy_day_minimum');
 assert.equal(rows[3].before.split('\n')[6],'deck_weekday_6: deck_easy_day_normal');
 f.executor.registerPending(action);const result=JSON.parse(await f.executor.executeConfirmed(action));
 assert.equal(result.saved,true);assert.equal(action.status,'completed');assert.equal(f.state.writes.length,1);assert.equal(f.state.committed,1);
 const saved=f.state.writes[0];assert.equal(saved.configs[0].id,1);assert.equal(saved.fsrs,false);
 assert.deepEqual(saved.configs[0].config.easyDaysPercentages,[1,1,1,1,1,.5,0]);assert.deepEqual(saved.configs[0].config.preserved,f.config.config.preserved);
 assert.deepEqual(saved.configs[0].config.other,f.config.config.other);assert.equal(saved.cardStateCustomizer,'keep script');
 assert.deepEqual(encodeDeckConfig(f.config),before);await assert.rejects(f.executor.executeConfirmed(action),/confirmation_mismatch/);
});
test('deck-only scope clones changed shared settings while per-deck zero, clearing and global switches keep their real scope',async()=>{
 const f=fixture();const {action}=await f.propose(f.args([{key:'newPerDay',value:'10'},{key:'newToday',value:'0'},
   {key:'reviewLimit',value:'0'},{key:'fsrsEnabled',value:'true'},{key:'desiredRetentionOverride',value:'0.85'}],'deck'));
 f.executor.registerPending(action);await f.executor.executeConfirmed(action);const request=f.state.writes[0];
 assert.equal(request.configs[0].id,0);assert.equal(request.configs[0].name,'English');assert.equal(request.fsrs,true);
 assert.equal(request.limits.newToday,0);assert.equal(request.limits.review,0);assert.ok(Math.abs(request.limits.desiredRetention-.85)<1e-6);
 const clear=await f.propose(f.args([{key:'newToday',value:''},{key:'reviewLimit',value:''}],'deck'));
 const rows=maintenancePreviewRows(action,key=>key);
 assert.equal(rows.find(row=>row.title==='deck_desiredRetentionOverride_label').after,'85%');
 assert.equal(rows.find(row=>row.title==='deck_fsrsEnabled_label').after,'deck_option_on');
 assert.equal(maintenancePreviewRows(clear.action,key=>key).find(row=>row.title==='deck_reviewLimit_label').after,'deck_option_unset');
 f.executor.registerPending(clear.action);await f.executor.executeConfirmed(clear.action);assert.equal(f.state.writes[1].configs[0].id,1);
 assert.equal(f.state.writes[1].limits.review,null);assert.equal(f.state.writes[1].limits.newToday,null);
});
test('stale, tampered and failed proposals never report success; recheck occurs inside the queued save',async()=>{
 for(const when of ['before_confirm','at_submit','tampered','write_failure']){
  const f=fixture();const {action}=await f.propose(f.args([{key:'newPerDay',value:'10'}]));f.executor.registerPending(action);
  if(when==='before_confirm')f.config.config.reviewsPerDay=300;
  if(when==='at_submit')f.state.changeAtSubmit=true;
  if(when==='tampered')action.payloadJson+=' ';
  if(when==='write_failure')f.state.fail=true;
  await assert.rejects(f.executor.executeConfirmed(action));assert.equal(f.state.writes.length,0);assert.equal(f.state.committed,0);
  assert.notEqual(action.status,'completed');
 }
});
test('invalid and partial edits fail atomically, including hidden fields, and gather changes disclose implicit sort reset',async()=>{
 const f=fixture();for(const change of [{key:'desiredRetention',value:'90'},{key:'capAnswerTimeToSecs',value:'0'},
  {key:'newLimit',value:'10000'},{key:'fsrsParameters',value:'1 2'}])await assert.rejects(f.propose(f.args([{key:'newPerDay',value:'10'},change])));
 assert.equal(f.state.writes.length,0);assert.equal(f.config.config.newPerDay,20);
 await assert.rejects(f.propose(f.args([{key:'newCardGatherPriority',value:'4'},{key:'newCardSortOrder',value:'4'}])),/incompatible_new_card_sort_order/);
 f.config.config.newCardSortOrder=4;
 const {action}=await f.propose(f.args([{key:'newCardGatherPriority',value:'4'}]));
 assert.deepEqual(JSON.parse(action.payloadJson).preview.map(x=>x.key),['newCardGatherPriority','newCardSortOrder']);
});
