// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadPlatformModule } from './platform-module-harness.mjs';
import { agentFsrsTools, decodeAgentFsrsArguments } from '../../entry/src/main/ets/model/agent/AgentFsrsTools.ts';
import { agentFunctionTools } from '../../entry/src/main/ets/model/agent/AgentToolCatalog.ts';
import { parseAgentToolJsonObject } from '../../entry/src/main/ets/model/agent/AgentToolSchemas.ts';
import { toolRiskOf } from '../../entry/src/main/ets/model/agent/AgentPolicy.ts';
import { AgentActionLedger, createAgentAction, AgentApprovalRequired } from '../../entry/src/main/ets/model/agent/AgentAction.ts';
import { AgentRetrieval } from '../../entry/src/main/ets/model/agent/AgentRetrieval.ts';
import { emptyDeckConfigSettings } from '../../entry/src/main/ets/proto/messages/DeckConfigMessages.ts';
import { fsrsOptimizeInput, fsrsWorkloadInput } from '../../entry/src/main/ets/model/FsrsOptions.ts';
import { maintenancePreviewRows } from '../../entry/src/main/ets/model/agent/AgentMaintenancePreview.ts';

function fixture() {
  const state={calls:[],writeCount:0,fail:false,config:{id:1,name:'Preset',mtimeSecs:0,usn:0,
    config:{...emptyDeckConfigSettings(),desiredRetention:0.9,historicalRetention:0.9,maximumReviewInterval:36500,
      newPerDay:20,reviewsPerDay:200,ignoreRevlogsBeforeDate:'2025-01-01',learnSteps:[1,10],relearnSteps:[10]}}};
  const context=()=>({deckId:1,config:structuredClone(state.config),search:'did:1,2 -is:suspended',
    options:{limits:null,newCardsIgnoreReviewLimit:true,fsrs:true,applyAllParentLimits:false,fsrsHealthCheck:true,fsrsReschedule:false}});
  class Fsrs {
    async deckContext(id){assert.equal(id,1);return context();}
    async evaluate(input){state.calls.push(['evaluate',input]);if(state.fail)throw Error('empty_history');return {logLoss:0.4,rmseBins:0.05};}
    async historyCount(date,search){state.calls.push(['count',date,search]);return {included:12,total:40};}
    async memoryState(id){state.calls.push(['memory',id]);return {state:null,desiredRetention:0.9,decay:-0.5};}
    async daily(input){state.calls.push(['daily',input]);state.writeCount++;if(state.fail)throw Error('simulation_failed');
      return {accumulatedKnowledge:[1,2],dailyReviews:[3,4],dailyNew:[5,6],dailyTimeSeconds:[7,8]};}
  }
  const Scope=loadPlatformModule('backend/agent/AgentScope.ets','AgentScope',{AgentRetrieval});
  const scope=new Scope();scope.registerReadableDeckIds([1]);scope.registerReadableCardIds([11]);
  const fsrsContextSnapshot=ctx=>JSON.stringify(ctx);
  const Tools=loadPlatformModule('backend/agent/AgentFsrsTools.ets','AgentFsrsTools',{
    FsrsService:Fsrs,fsrsContextSnapshot,agentFsrsTools,decodeAgentFsrsArguments,fsrsOptimizeInput,fsrsWorkloadInput,createAgentAction});
  const Registry=loadPlatformModule('backend/agent/AgentToolRegistry.ets','AgentToolRegistry',{toolRiskOf,parseAgentToolJsonObject,AgentApprovalRequired});
  const registry=new Registry(),tools=new Tools(scope);tools.register(registry);
  const lease=[];
  const Executor=loadPlatformModule('backend/agent/AgentActionExecutor.ets','AgentActionExecutor',{
    AgentActionLedger,牌组服务:class{},笔记类型服务:class{},FsrsService:Fsrs,fsrsContextSnapshot,
    autoSyncScheduler:{beginOperation:owner=>lease.push(owner),endOperation:owner=>assert.equal(lease.pop(),owner),request(){}},
    syncActivity:{waitForCollection:async()=>{}},LocalPreferenceWriteError:class extends Error{}});
  const executor=new Executor(scope,{});
  const call=(name,args)=>registry.execute({id:name,name,argumentsJson:JSON.stringify(args)});
  return {state,scope,tools,registry,executor,call,lease};
}

test('FSRS schemas, runtime registration and risks agree in every mode',()=>{
 for(const mode of ['assistant','create','edit'])for(const definition of agentFsrsTools()){
  assert.ok(agentFunctionTools(100,mode).some(tool=>tool.name===definition.name));
  assert.doesNotThrow(()=>decodeAgentFsrsArguments(definition.name,definition.exampleArgumentsJson));
  assert.equal(toolRiskOf(definition.name),definition.name.startsWith('propose_')?'write':'read');
 }
 for(const args of [{deckId:1,params:[1]},{deckId:1,params:'unsafe'},{deckId:1,rpc:3}])
  assert.throws(()=>decodeAgentFsrsArguments('evaluate_fsrs',JSON.stringify(args)));
 for(const args of [{deckId:1,days:366},{deckId:1,days:0},{deckId:1,days:2,newLimit:-1},
  {deckId:1,days:2,desiredRetention:1},{deckId:1,days:2,reviewLimit:'0'}])
  assert.throws(()=>decodeAgentFsrsArguments('propose_simulate_fsrs',JSON.stringify(args)));
});

test('evaluation and history counting report exact preset scope, cutoff, candidate params and card units without writes',async()=>{
 const f=fixture();await assert.rejects(f.call('evaluate_fsrs',{deckId:999}),/scope/);
 const params=Array.from({length:21},(_,i)=>i/10);
 const result=JSON.parse((await f.call('evaluate_fsrs',{deckId:1,params})).outputJson);
 assert.equal(result.method,'EvaluateParamsLegacy');assert.equal(result.validation,'historical_fit');
 assert.equal(result.search,'did:1,2 -is:suspended');assert.deepEqual(result.params,params);
 assert.deepEqual(f.state.calls[0],['evaluate',{params,search:result.search,ignoreRevlogsBeforeMs:Date.UTC(2025,0,1)}]);
 f.state.config.config.paramSearch='tag:override';
 const count=JSON.parse((await f.call('get_fsrs_history_count',{deckId:1})).outputJson);
 assert.equal(count.search,'tag:override');assert.equal(count.unit,'non_new_cards');assert.deepEqual(count.result,{included:12,total:40});
 assert.deepEqual(f.state.calls.at(-1),['count','2025-01-01','tag:override']);assert.equal(f.state.writeCount,0);
 f.state.fail=true;await assert.rejects(f.call('evaluate_fsrs',{deckId:1}),/empty_history/);
});

test('memory diagnostics require discovered card identity and preserve absent state',async()=>{
 const f=fixture();await assert.rejects(f.call('compute_fsrs_memory_state',{cardId:99}),/scope/);
 const output=JSON.parse((await f.call('compute_fsrs_memory_state',{cardId:11})).outputJson);
 assert.equal(output.result.state,null);assert.equal(output.saved,false);assert.equal(f.state.writeCount,0);
});

test('simulation proposes exact scenario, confirms once, and returns actual daily Core data',async()=>{
 const f=fixture();const action=(await f.call('propose_simulate_fsrs',{deckId:1,days:2,newLimit:0,reviewLimit:0,desiredRetention:0.8})).action;
 assert.equal(f.state.writeCount,0);const payload=JSON.parse(action.payloadJson);
 assert.equal(payload.input.newLimit,0);assert.equal(payload.input.reviewLimit,0);assert.equal(payload.input.daysToSimulate,2);
 assert.equal(payload.input.desiredRetention,0.8);assert.equal(payload.input.search,'did:1,2 -is:suspended');
 assert.equal(payload.input.learningStepCount,2);assert.equal(payload.input.relearningStepCount,1);
 assert.equal(maintenancePreviewRows(action,key=>key).length,5);
 f.executor.registerPending(action);const result=JSON.parse(await f.executor.executeConfirmed(action));
 assert.deepEqual(result.result.dailyReviews,[3,4]);assert.equal(result.rescheduled,false);assert.equal(result.memoryStateCacheMayHaveChanged,true);
 assert.equal(f.state.writeCount,1);assert.equal(f.lease.length,0);
 await assert.rejects(f.executor.executeConfirmed(action),/confirmation_mismatch/);assert.equal(f.state.writeCount,1);
});

test('changed or tampered simulations never run; Core failures remain failed and release occupancy',async()=>{
 const f=fixture(),args={deckId:1,days:2};
 const stale=(await f.call('propose_simulate_fsrs',args)).action;f.executor.registerPending(stale);
 f.state.config.config.desiredRetention=0.85;await assert.rejects(f.executor.executeConfirmed(stale),/changed_since_proposal/);
 assert.equal(f.state.writeCount,0);assert.equal(f.lease.length,0);
 const tampered=(await f.call('propose_simulate_fsrs',args)).action;f.executor.registerPending(tampered);
 tampered.payloadJson+=' ';await assert.rejects(f.executor.executeConfirmed(tampered),/confirmation_mismatch/);
 assert.equal(f.state.writeCount,0);
 const failed=(await f.call('propose_simulate_fsrs',args)).action;f.executor.registerPending(failed);f.state.fail=true;
 await assert.rejects(f.executor.executeConfirmed(failed),/simulation_failed/);assert.equal(failed.status,'failed');assert.equal(f.lease.length,0);
});
