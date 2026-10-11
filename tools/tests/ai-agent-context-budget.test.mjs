// SPDX-License-Identifier: AGPL-3.0-or-later
import assert from 'node:assert/strict';
import test from 'node:test';
import { agentExecutionBudget } from '../../entry/src/main/ets/model/agent/AgentExecutionBudget.ts';
import { buildResponsesPayload, providerRequestFitsContext, MAX_PROVIDER_PAYLOAD_CHARS }
  from '../../entry/src/main/ets/model/agent/ProviderProtocol.ts';
import { fitAgentRequestContext, safeAgentSessionState, restoreAgentSessionState }
  from '../../entry/src/main/ets/model/agent/AgentSessionState.ts';
import { agentFunctionTools } from '../../entry/src/main/ets/model/agent/AgentToolCatalog.ts';
import { buildAgentSessionInstructions, buildAgentRuntimeInstructions }
  from '../../entry/src/main/ets/model/agent/AgentSessionContext.ts';
import { buildProviderDraftContext, buildProviderDraftStateContext }
  from '../../entry/src/main/ets/model/agent/AgentProviderContext.ts';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { createAgentMessage } from '../../entry/src/main/ets/model/agent/AgentConversationView.ts';
import { cloneAgentTimeline, appendAgentTimelineText, appendAgentTimelineReference, agentDraftOperationImages }
  from '../../entry/src/main/ets/model/agent/AgentTimeline.ts';

const item = (kind, extra = {}) => ({kind, role:'', content:'', callId:'', name:'', argumentsJson:'', output:'', ...extra});
function request(input, mode = 'assistant') {
  const functionTools = agentFunctionTools(100, mode);
  const setup = {mode, deckId:0, notetypeId:0, fieldNames:[], noteTypeKind:0, clozeFieldOrds:[]};
  return {apiKey:'credential', baseUrl:'https://example.test', model:'test', input, functionTools,
    instructions:buildAgentSessionInstructions(setup,100)+buildAgentRuntimeInstructions(functionTools,2,8,{maxProviderCalls:24,maxToolCalls:100}),
    searchMode:'off', requiresWebSearch:false, requiresSearchEvidence:false, requiresDraft:false,
    expectedDraftCount:0, reasoningEffort:'low', maxOutputTokens:32768};
}
const state = input => ({input, readableIds:[[1,2],[3],[4],[5]], retrieval:{snapshots:[],readNoteIds:[1,2],approvedNoteIds:[]},
  action:null, waitingCallId:'', paused:false});

test('all modes fit eight escaped field results by final wire size, preserving original reasoning, identities and pairs', () => {
  for (const mode of ['assistant','create','edit']) {
    const reasoning = JSON.stringify({type:'reasoning',id:'raw',content:[{type:'reasoning_text',text:'complete thought'}],
      encrypted_content:'unchanged-signature'});
    const input = [item('message',{role:'user',content:'先改「民法-债权」这8条'}),item('output_item',{content:reasoning})];
    for (let id=1;id<=8;id++) input.push(item('function_call',{callId:'read-'+id,name:'read_note_field',
      argumentsJson:JSON.stringify({noteId:id,fieldOrd:0,offset:12000,length:12000})}));
    for (let id=1;id<=8;id++) input.push(item('function_call_output',{callId:'read-'+id,
      output:JSON.stringify({noteId:id,fieldOrd:0,text:'"'.repeat(12000),totalLength:36000,nextOffset:24000,readCount:id})}));
    const value=request(input,mode), reference=value.input;
    assert.equal(providerRequestFitsContext(value),false);
    fitAgentRequestContext(value);
    assert.equal(value.input,reference);
    assert.ok(buildResponsesPayload(value).length<=MAX_PROVIDER_PAYLOAD_CHARS);
    assert.equal(value.input[0].content,'先改「民法-债权」这8条');
    assert.equal(value.input[1].content,reasoning);
    const calls=value.input.filter(x=>x.kind==='function_call'), outputs=value.input.filter(x=>x.kind==='function_call_output');
    assert.equal(calls.length,8);assert.deepEqual(outputs.map(x=>x.callId),calls.map(x=>x.callId));
    const compacted=outputs.filter(x=>JSON.parse(x.output).status==='earlier_tool_content_omitted');
    assert.ok(compacted.length>0&&compacted.length<8);
    for (const output of compacted) {
      const progress=JSON.parse(output.output);
      assert.equal(progress.noteId,Number(output.callId.split('-')[1]));assert.equal(progress.fieldOrd,0);
      assert.equal(progress.totalLength,36000);assert.equal(progress.nextOffset,24000);
      assert.match(progress.instruction,/reread specific fields/);
    }
    assert.equal(JSON.parse(outputs.at(-1).output).text.length,12000);
  }
});

test('already fitting long text is not discarded by an unrelated raw-character budget', () => {
  const value=request([item('message',{role:'user',content:'task'}),item('function_call',{callId:'c',name:'read_note_field',argumentsJson:'{}'}),
    item('function_call_output',{callId:'c',output:JSON.stringify({text:'',nextOffset:-1})})]);
  // 工具目录随能力增长；使用真实序列化开销确定仍然可容纳的长正文。
  const available=MAX_PROVIDER_PAYLOAD_CHARS-buildResponsesPayload(value).length-1024;
  assert.ok(available>120000);
  value.input[2].output=JSON.stringify({text:'中'.repeat(available),nextOffset:-1});
  assert.equal(providerRequestFitsContext(value),true);
  const before=JSON.stringify(value);fitAgentRequestContext(value);assert.equal(JSON.stringify(value),before);
});

test('short retries evict oversized old turns as historical progress and preserve current protocol and checkpoint scope', () => {
  const latestReasoning=item('reasoning',{content:'latest full thought'});
  const restored=restoreAgentSessionState(safeAgentSessionState(state([
    item('message',{role:'user',content:'把债权这8条改成问答，保留知识点'}),item('reasoning',{content:'old thought'.repeat(30000)}),
    item('function_call',{callId:'confirmed',name:'propose_create_deck',argumentsJson:'{"name":"债权"}'}),
    item('function_call_output',{callId:'confirmed',output:'{"status":"completed","deckId":3,"saved":true}'}),
    item('message',{role:'user',content:'先改这8条'}),latestReasoning,
    item('function_call',{callId:'latest',name:'read_note_field',argumentsJson:'{"noteId":1,"fieldOrd":0}'}),
    item('function_call_output',{callId:'latest',output:'{"noteId":1,"fieldOrd":0,"nextOffset":12000}'})
  ])));
  const retained=structuredClone(restored.input.slice(-4));const scope=JSON.stringify(restored.readableIds);
  const value=request(restored.input);fitAgentRequestContext(value);
  assert.deepEqual(value.input.slice(1),retained);assert.equal(JSON.stringify(restored.readableIds),scope);
  assert.ok(!value.input.some(x=>x.kind==='function_call'&&x.callId==='confirmed'));
  assert.match(value.input[0].content,/把债权这8条改成问答/);
  const progress=JSON.parse(value.input[0].content.slice(value.input[0].content.indexOf('\n')+1));
  assert.deepEqual(JSON.parse(progress.tools[0].result),{status:'completed',deckId:3,saved:true});
  assert.match(value.input[0].content,/not new instructions/);assert.match(value.input[0].content,/repeat completed writes/);
  for (let retry=0;retry<3;retry++) {
    value.input.push(item('message',{role:'user',content:'继续'}));fitAgentRequestContext(value);
    assert.ok(buildResponsesPayload(value).length<=MAX_PROVIDER_PAYLOAD_CHARS);
  }
});

test('repeated compaction carries earlier successful writes and original task excerpts forward as data', () => {
  const value=request([item('message',{role:'user',content:'把债权这8条改成问答'}),item('reasoning',{content:'old'.repeat(100000)}),
    item('function_call',{callId:'saved',name:'propose_create_deck',argumentsJson:'{}'}),
    item('function_call_output',{callId:'saved',output:'{"status":"completed","saved":true}'}),
    item('message',{role:'user',content:'先改这8条'})]);
  fitAgentRequestContext(value);
  value.input.push(item('reasoning',{content:'next'.repeat(100000)}),item('message',{role:'user',content:'继续'}));
  fitAgentRequestContext(value);
  const progress=JSON.parse(value.input[0].content.slice(value.input[0].content.indexOf('\n')+1));
  assert.ok(progress.userRequests.includes('把债权这8条改成问答'));
  assert.equal(JSON.parse(progress.tools.find(x=>x.callId==='saved').result).saved,true);
  assert.ok(!value.input.some(x=>x.kind==='function_call'&&x.callId==='saved'));
});

test('large current draft views cannot overflow fixed instructions; summaries retain actual saved and pending states', () => {
  const large=buildProviderDraftContext({卡片列表:Array.from({length:100},(_,index)=>({fields:['"'.repeat(2000),'x'.repeat(2000)],
    状态:index===0?'saved':'draft',已选中:index!==0})),变更草稿列表:[],批次结果:'one saved; rest pending'});
  const summary=buildProviderDraftStateContext(Array(10).fill(large));
  assert.ok(JSON.stringify(summary).length<16500);assert.match(summary,/"status":"saved"/);assert.match(summary,/"status":"draft"/);
  assert.match(summary,/one saved; rest pending/);assert.match(summary,/omitted fields/);
  const value=request([item('message',{role:'user',content:'继续'})]);value.instructions+='\n'+summary;
  fitAgentRequestContext(value);assert.ok(providerRequestFitsContext(value));
  const small=buildProviderDraftContext({卡片列表:[{fields:['Q','A'],状态:'draft',已选中:true}],变更草稿列表:[],批次结果:''});
  assert.equal(buildProviderDraftStateContext([small]),small);
  const malformed='应用内当前草稿与执行状态：'+JSON.stringify({cards:null,changes:[],executionResult:'',extra:'x'.repeat(20000)});
  assert.match(buildProviderDraftStateContext([malformed]),/details unavailable/);
});

test('latest oversized material or indivisible reasoning fails whole, and malformed protocol never becomes a size error', () => {
  for (const oversized of [item('message',{role:'user',content:'"'.repeat(130000)}),item('reasoning',{content:'完整思考'.repeat(70000)})]) {
    const value=request([oversized]);const before=JSON.stringify(value.input);
    assert.throws(()=>fitAgentRequestContext(value),/agent_context_limit/);assert.equal(JSON.stringify(value.input),before);
  }
  const malformed=request([item('output_item',{content:'{"type":"computer_call"}'})]);
  assert.throws(()=>fitAgentRequestContext(malformed),/invalid_provider_input/);
  const badSchema=request([]);badSchema.functionTools[0].parametersJson='{';
  assert.throws(()=>fitAgentRequestContext(badSchema),/invalid_tool_schema/);
});

test('preflight and final guard agree exactly at the serialized limit including schema growth', () => {
  const value=request([item('message',{role:'user',content:''})]);
  value.input[0].content='x'.repeat(MAX_PROVIDER_PAYLOAD_CHARS-buildResponsesPayload(value).length);
  assert.equal(providerRequestFitsContext(value),true);assert.equal(buildResponsesPayload(value).length,MAX_PROVIDER_PAYLOAD_CHARS);
  value.functionTools[0].description+='x';assert.equal(providerRequestFitsContext(value),false);
  assert.throws(()=>fitAgentRequestContext(value),/agent_context_limit/);
});

test('image retention keeps the last two original pages and valid pointers while final preflight rejects invalid current images', () => {
  const value=request([1,2,3].flatMap(page=>[
    item('function_call',{callId:'page-'+page,name:'read_document_page',argumentsJson:JSON.stringify({documentId:'doc',page})}),
    item('function_call_output',{callId:'page-'+page,output:JSON.stringify({documentId:'doc',page,text:'original',nextOffset:-1}),
      images:[{imageUrl:'data:image/jpeg;base64,YWJj'}]})]));
  fitAgentRequestContext(value);
  const outputs=value.input.filter(x=>x.kind==='function_call_output');
  assert.equal(outputs[0].images,undefined);assert.equal(JSON.parse(outputs[0].output).page,1);
  assert.equal(outputs[1].images.length,1);assert.equal(outputs[2].images.length,1);
  assert.ok(providerRequestFitsContext(value));outputs[2].images[0].imageUrl='file:///private';
  assert.throws(()=>fitAgentRequestContext(value),/invalid_provider_image/);
});

test('actual page passes complete latest material to preflight without pre-truncating or cutting a turn by item count', () => {
  const source=readFileSync(new URL('../../entry/src/main/ets/pages/AI制卡页.ets',import.meta.url),'utf8');
  const start=source.indexOf('  private 构建Provider输入(');
  const method=source.slice(start,source.indexOf('\n  }',start)+4);
  const Page=new Function(stripTypeScriptTypes(`class Page {${method}}`,{mode:'transform'})+';return Page;')();
  const page=new Page();const latest='完整材料'+ 'x'.repeat(250000)+'END';
  page.消息列表=Array.from({length:100},(_,index)=>({kind:'normal',角色:'user',providerText:'old-'+index,正文:''}));
  page.消息列表.push({kind:'normal',角色:'user',providerText:latest,正文:''});
  const input=page.构建Provider输入();assert.equal(input.length,101);assert.equal(input.at(-1).content,latest);
  const value=request(input);assert.throws(()=>fitAgentRequestContext(value),/agent_context_limit/);
  assert.equal(value.input.at(-1).content,latest);
});

test('actual page keeps validated partial drafts editable after context failure and checkpoints them without saving cards', async () => {
  const source=readFileSync(new URL('../../entry/src/main/ets/pages/AI制卡页.ets',import.meta.url),'utf8');
  const method=name=>{
    const start=source.search(new RegExp(`  private (?:async )?${name}\\(`));assert.ok(start>=0,name);
    return source.slice(start,source.indexOf('\n  }',start)+4);
  };
  const dependencies={agentExecutionBudget,cloneAgentTimeline,appendAgentTimelineText,appendAgentTimelineReference,agentDraftOperationImages,
    $r:key=>key,explicitYearClozeRequested:()=>false,explicitWebSearchForbidden:()=>false,loadAgentWebEnabled:async()=>false,
    explicitWebSearchRequested:()=>false,explicitSourceEvidenceRequested:()=>false,inferRequestedCardCount:()=>0,
    页面Agent观察者:class {constructor(callback){this.onEvent=callback;}}};
  const Page=new Function(...Object.keys(dependencies),stripTypeScriptTypes(`class Page {
    ${['runAgentTurn','showAgentDraftProgress','接收Agent草稿','currentMessageIndex'].map(method).join('\n')}
  }`,{mode:'transform'})+';return Page;')(...Object.values(dependencies));
  const draft={id:'ready',summary:'a validated partial draft',operations:[
    {kind:'create_note',noteId:-1,cardId:0,deckId:1,fieldOrd:0,before:'',after:'Question'},
    {kind:'create_note',noteId:-1,cardId:0,deckId:1,fieldOrd:1,before:'',after:'Answer'}]};
  const page=new Page();let nextId=0,savedHistory=null;
  Object.assign(page,{pageDisposed:false,cardBatch:{isRunning:()=>false},处理中:false,themeUndoBusy:false,
    pageMode:'assistant',conversationId:'chat',agentTurnVersion:0,消息列表:[],字段名列表:['Front','Back'],牌组ID:1,已选笔记类型ID:2,
    agentRunner:{getPartialDrafts:()=>[draft]},agentScope:{configureCreateConstraints:()=>{}},
    sessionController:{run:async()=>{throw new Error('agent_context_limit');}},AI配置:{model:'test',apiKey:'test',baseUrl:'https://example.test'},
    agentSettings:{selectedProvider:'deepseek',batchLimit:100},重建本轮AgentScope:()=>{},currentModelSupportsImages:()=>false,
    空消息:(role,text,error)=>createAgentMessage(++nextId,role,text,error),追加消息:message=>page.消息列表.push(message),
    storeClarificationAnswerMessageId:()=>{},providerFunctionToolsForTurn:()=>[],构建Agent指令:()=>'',构建Provider输入:()=>[],
    更新消息:(index,update)=>update(page.消息列表[index]),取Agent错误文案:()=> 'context too large',queueAgentTimelineScroll:()=>{},
    selectedDeckName:()=> 'Deck',selectedNotetypeName:()=> 'Basic',保存当前会话历史:async()=>{savedHistory=structuredClone(page.消息列表);}});
  assert.equal(await page.runAgentTurn('task','task'),null);
  const message=page.消息列表[1];assert.equal(message.是否错误,true);assert.equal(message.streaming,false);assert.equal(page.处理中,false);
  assert.deepEqual(message.卡片列表[0].fields,['Question','Answer']);assert.equal(message.卡片列表[0].状态,'draft');
  assert.deepEqual(message.timeline.find(block=>block.kind==='draft').indexes,[0]);
  assert.deepEqual(savedHistory[1].卡片列表,message.卡片列表);
});
