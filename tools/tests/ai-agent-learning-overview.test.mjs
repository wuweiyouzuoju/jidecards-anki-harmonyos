// SPDX-License-Identifier: AGPL-3.0-or-later
import assert from 'node:assert/strict';
import test from 'node:test';
import { buildAgentLearningOverview } from '../../entry/src/main/ets/model/agent/AgentLearningOverview.ts';
import { buildDeckStudyHistory } from '../../entry/src/main/ets/model/DeckStudyHistory.ts';
import { decodeGraphsResponse } from '../../entry/src/main/ets/proto/messages/StatsMessages.ts';
import { 协议写入器 } from '../../entry/src/main/ets/proto/core/ProtoWriter.ts';
import { agentFunctionTools } from '../../entry/src/main/ets/model/agent/AgentToolCatalog.ts';
import { toolRiskOf } from '../../entry/src/main/ets/model/agent/AgentPolicy.ts';
import { AgentRetrieval } from '../../entry/src/main/ets/model/agent/AgentRetrieval.ts';
import { AgentApprovalRequired } from '../../entry/src/main/ets/model/agent/AgentAction.ts';
import { decodeAgentToolArguments, parseAgentToolJsonObject, AgentToolSchemaError } from '../../entry/src/main/ets/model/agent/AgentToolSchemas.ts';
import { decodeAgentClarificationRequest, decodeAgentCreateTargetRequest } from '../../entry/src/main/ets/model/agent/AgentClarification.ts';
import { loadPlatformModule } from './platform-module-harness.mjs';

const kinds = (learn = 0, relearn = 0, young = 0, mature = 0, filtered = 0) => ({learn,relearn,young,mature,filtered});
function graphs() {
  return {...decodeGraphsResponse(new Uint8Array()), rolloverHour:4, fsrs:true,
    reviewCountsByDaysAgo:new Map([[0,kinds(2)],[-1,kinds(1,2,3,4,5)],[-6,kinds(3)],[-7,kinds(99)],[1,kinds(99)]]),
    reviewTimesByDaysAgo:new Map([[0,kinds(2500)],[-1,kinds(100,200,300,400,500)]]),
    futureDue:{futureDue:new Map([[-3,8],[-1,2],[0,4],[1,6],[6,7],[7,99]]),dailyLoad:12,haveBacklog:true},
    retrievability:{buckets:new Map([[80,10]]),average:80,sumByCard:8,sumByNote:6},
    cardCounts:{includingInactive:{newCards:8,learn:2,relearn:1,young:4,mature:5,suspended:0,buried:0},
      excludingInactive:{newCards:6,learn:2,relearn:1,young:3,mature:3,suspended:4,buried:1}}};
}

test('overview shares signed history buckets, retains milliseconds and distinguishes overdue from forecast', () => {
  const data = graphs();
  const result = buildAgentLearningOverview(data,'tag:English',7,7);
  assert.deepEqual(result.history,buildDeckStudyHistory(data));
  assert.equal(result.history.totalCount,20);
  assert.equal(result.history.totalMillis,4000);
  assert.equal(result.history.activeDays,3);
  assert.equal(result.rolloverHour,4);
  assert.deepEqual(result.forecast,{dueThroughToday:14,overdue:10,
    days:[4,6,0,0,0,0,7].map((count,daysFromToday)=>({daysFromToday,count})),scheduledInWindow:17,dailyLoad:12});
  assert.deepEqual(result.cardCounts,data.cardCounts);
  assert.equal(result.averageRetrievabilityPercent,80);
  assert.equal(result.contentRead,false);
  assert.equal(result.query,'tag:English');
  assert.equal(JSON.stringify(result).includes('{}'),false,'no Map data is silently lost in JSON');
});

test('one-day and bounded longer windows preserve absent data; absent history fails instead of inventing zero', () => {
  const data = graphs();
  assert.deepEqual(buildAgentLearningOverview(data,'',1,1).history.days,[{daysAgo:0,count:2}]);
  assert.equal(buildAgentLearningOverview(data,'',90,30).history.totalCount,119);
  assert.equal(buildAgentLearningOverview({...data,futureDue:null,today:null,cardCounts:null,fsrs:false},'',7,7).forecast,null);
  assert.equal(buildAgentLearningOverview({...data,fsrs:false},'',7,7).averageRetrievabilityPercent,null);
  assert.equal(buildAgentLearningOverview({...data,retrievability:{...data.retrievability,buckets:new Map()}},'',7,7).averageRetrievabilityPercent,null);
  assert.equal(buildAgentLearningOverview({...data,retrievability:{...data.retrievability,buckets:new Map([[0,1]]),average:0}},'',7,7).averageRetrievabilityPercent,0);
  assert.throws(()=>buildAgentLearningOverview({...data,reviewTimesByDaysAgo:null},'',7,7),/Missing/);
  for (const days of [0,-1,91,1.5,NaN]) assert.throws(()=>buildAgentLearningOverview(data,'',days,7));
  for (const days of [0,-1,31,1.5,NaN]) assert.throws(()=>buildAgentLearningOverview(data,'',7,days));
  const empty = buildAgentLearningOverview({...data,reviewCountsByDaysAgo:new Map(),reviewTimesByDaysAgo:new Map(),
    futureDue:{...data.futureDue,futureDue:new Map()}},'',7,7);
  assert.equal(empty.history.totalCount,0); assert.equal(empty.forecast.dueThroughToday,0);
});

test('real protobuf signed buckets reach the overview without reversal', () => {
  const response = new 协议写入器();
  const reviews = new 协议写入器();
  for (const [day,count] of [[0,2],[-1,3],[-6,4],[-7,100],[1,100]]) {
    const value = new 协议写入器(); value.写入变长整数(1,count);
    const entry = new 协议写入器(); entry.写入64位整数(1,day); entry.写入子消息(2,value);
    reviews.写入子消息(1,entry);
  }
  response.写入子消息(9,reviews); response.写入变长整数(10,4);
  assert.equal(buildAgentLearningOverview(decodeGraphsResponse(response.转为字节()),'',7,7).history.totalCount,9);
});

function fixture(mode='assistant') {
  const state = {calls:[],failure:null};
  const Scope = loadPlatformModule('backend/agent/AgentScope.ets','AgentScope',{AgentRetrieval});
  const Registry = loadPlatformModule('backend/agent/AgentToolRegistry.ets','AgentToolRegistry',{
    toolRiskOf,parseAgentToolJsonObject,decodeAgentClarificationRequest,decodeAgentCreateTargetRequest,AgentApprovalRequired});
  const emptyService = class {};
  const Tools = loadPlatformModule('backend/agent/CardAgentTools.ets','CardAgentTools',{
    decodeAgentToolArguments,AgentToolSchemaError,buildAgentLearningOverview,
    笔记服务:emptyService,卡片服务:emptyService,笔记类型服务:emptyService,搜索服务:emptyService,
    牌组服务:emptyService,标签服务:emptyService,WikimediaImageService:emptyService,
    统计服务:class { async 获取图表统计(days,query) {
      state.calls.push({days,query}); if(state.failure) throw state.failure; return graphs();
    }}
  });
  const scope = new Scope(); const registry = new Registry(); const tools = new Tools(scope);
  tools.register(registry,mode);
  const call = args=>registry.execute({id:'overview',name:'get_learning_overview',argumentsJson:JSON.stringify(args)});
  return {scope,registry,state,call};
}

test('every task mode advertises and executes a strict read-only overview without granting IDs or analysis progress', async () => {
  for (const mode of ['assistant','create','edit']) {
    const definition = agentFunctionTools(25,mode).find(tool=>tool.name==='get_learning_overview');
    assert.ok(definition); assert.equal(toolRiskOf(definition.name),'read');
    const f=fixture(mode); const args=JSON.parse(definition.exampleArgumentsJson);
    const before=f.scope.readableIds();
    const result=await f.call(args);
    assert.equal(result.draft,null); assert.equal(result.clarification,null);
    assert.deepEqual(f.state.calls,[{days:6,query:''}]);
    assert.deepEqual(f.scope.readableIds(),before); assert.equal(f.scope.retrieval.readCount(),0);
    assert.equal(f.registry.isDraftTool(definition.name),false);
    assert.equal(JSON.parse(result.outputJson).history.totalCount,20);
    assert.throws(()=>f.registry.registerDraft(definition.name,{}),/tool_registration_rejected/);
  }
});

test('create target does not restrict reads, one day never requests all history, errors do not become success', async () => {
  const f=fixture(); f.scope.configureCardSearchPrefix('did:12');
  const result=JSON.parse((await f.call({query:' tag:hard ',days:1,forecastDays:1})).outputJson);
  assert.equal(result.query,'tag:hard');
  assert.deepEqual(f.state.calls,[{days:1,query:'tag:hard'}]);
  await f.call({query:'',days:90,forecastDays:30});
  assert.deepEqual(f.state.calls[1],{days:89,query:''});
  f.state.failure=Error('backend unavailable');
  await assert.rejects(f.call({query:'',days:7,forecastDays:7}),/backend unavailable/);
  assert.equal(f.scope.retrieval.readCount(),0);
});

test('missing, extra, mistyped and out-of-range arguments fail before touching statistics', async () => {
  const good={query:'',days:7,forecastDays:7};
  const f=fixture();
  for(const bad of [{...good,query:undefined},{...good,days:undefined},{...good,forecastDays:undefined},
    {...good,query:'x'.repeat(2001)},{...good,days:0},{...good,days:91},{...good,days:'7'},
    {...good,forecastDays:31},{...good,forecastDays:1.1},{...good,rpc:5},{...good,query:[] }]) {
    await assert.rejects(f.call(bad),/invalid_tool_arguments/);
  }
  assert.deepEqual(f.state.calls,[]);
});
