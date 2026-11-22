// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildResponsesPayload, providerRequestFitsContext } from '../../entry/src/main/ets/model/agent/ProviderProtocol.ts';
import { ResponsesEventNormalizer } from '../../entry/src/main/ets/model/agent/ResponsesEventNormalizer.ts';
import { IncrementalSseParser } from '../../entry/src/main/ets/model/agent/SseParser.ts';
import { fitAgentRequestContext, safeAgentSessionState } from '../../entry/src/main/ets/model/agent/AgentSessionState.ts';
import { loadComponentLogic, loadPlatformModule } from './platform-module-harness.mjs';

const item=(kind,extra={})=>({kind,role:'',content:'',callId:'',name:'',argumentsJson:'',output:'',...extra});
const request=()=>({apiKey:'test',baseUrl:'https://api.deepseek.com',model:'deepseek-flash',instructions:'Finish the task.',
 input:[item('message',{role:'user',content:'Read https://example.com and check sources.'})],functionTools:[],searchMode:'always',
 nativeWebTools:true,requiresWebSearch:true,requiresSearchEvidence:true,requiresDraft:false,expectedDraftCount:0,
 reasoningEffort:'high',maxOutputTokens:131072});

test('native DeepSeek search uses supported tools and auto choice, and respects the web switch',()=>{
 const enabled=request();const body=JSON.parse(buildResponsesPayload(enabled));
 assert.deepEqual(body.tools,[{type:'deepseek_web_search'},{type:'deepseek_read_url'}]);
 assert.equal(body.tool_choice,'auto');assert.deepEqual(body.safety_check,{level:'high'});
 enabled.nativeReadUrlOnly=true;
 assert.deepEqual(JSON.parse(buildResponsesPayload(enabled)).tools,[{type:'deepseek_read_url'}]);
 enabled.searchMode='off';assert.deepEqual(JSON.parse(buildResponsesPayload(enabled)).tools,[]);
 enabled.nativeWebTools=false;enabled.model='deepseek-v4-pro';enabled.searchMode='always';
 const legacy=JSON.parse(buildResponsesPayload(enabled));assert.deepEqual(legacy.tools,[{type:'web_search'}]);
 assert.deepEqual(legacy.tool_choice,{type:'web_search'});assert.equal(legacy.safety_check,undefined);
});

test('native URL sources and opaque signatures survive terminal-only output and checkpoint replay',()=>{
 const n=new ResponsesEventNormalizer();
 const raw={type:'web_search_call',id:'read-link',status:'completed',kind:'read_link',action:{type:'open_page',url:'https://example.com'},
 page:{url:'https://example.com',title:'Original page'},signature:'opaque-original-page'};
 const events=n.accept({event:'response.completed',data:JSON.stringify({type:'response.completed',response:{output:[raw]}}),done:false});
 assert.equal(n.hasTerminalEvent(),true);
 assert.equal(events.find(e=>e.kind==='search_source').source.title,'Original page');
 const continuation=events.find(e=>e.kind==='continuation_item');assert.deepEqual(JSON.parse(continuation.text),raw);
 const state=safeAgentSessionState({input:[item('output_item',{content:continuation.text})],readableIds:[],
 retrieval:{},action:null,waitingCallId:'',paused:true});
 const next=request();next.input=[...state.input,item('message',{role:'user',content:'Continue.'})];
 assert.deepEqual(JSON.parse(buildResponsesPayload(next)).input[0],raw);
});

test('one long task compacts only completed tool rounds and preserves its request and newest raw reasoning',()=>{
 const value=request();value.nativeWebTools=false;value.searchMode='off';value.contextBudgetChars=20000;
 const original=value.input[0].content;
 for(let i=0;i<18;i++)value.input.push(item('reasoning',{content:'thought-'+i+'x'.repeat(5000)}),
  item('function_call',{callId:'read-'+i,name:'get_task_plan',argumentsJson:'{}'}),
  item('function_call_output',{callId:'read-'+i,output:JSON.stringify({revision:i,saved:false})}));
 fitAgentRequestContext(value);assert.ok(providerRequestFitsContext(value));
 assert.ok(value.input.some(x=>x.role==='user'&&x.content===original));
 assert.ok(value.input.some(x=>x.kind==='reasoning'&&x.content.startsWith('thought-17')));
 const calls=value.input.filter(x=>x.kind==='function_call');const outputs=value.input.filter(x=>x.kind==='function_call_output');
 assert.deepEqual(calls.map(x=>x.callId),outputs.map(x=>x.callId));
 assert.ok(calls.length<18);assert.match(value.input[0].content,/Historical|historical/);
});

test('foreground recovery resumes the interrupted conversation once and stops after explicit cancellation',async()=>{
 const View=loadComponentLogic('pages/AI制卡页.ets','AI制卡页',{APP_FOREGROUND_KEY:'appForeground'});
 const view=Object.create(View.prototype);let resumed=0;
 Object.assign(view,{pageDisposed:false,agentAppForeground:false,voiceState:'',speechMessageId:-1,isAgentPageVisible:true,处理中:true,conversationId:'one',
 sessionController:{isPaused:()=>true},hasPendingAction:()=>false,hasPendingClarification:()=>false,
 取本地化文案:()=> 'Continue',runAgentTurn:async()=>{resumed++;return null;},保存当前会话历史:async()=>{},
 navigationSession:null,agentRunner:{cancel(){},interruptProviderStream(){}},cancelPendingClarifications(){}});
 view.onAgentForegroundChanged();assert.equal(view.backgroundConversation,'one');
 view.处理中=false;view.agentAppForeground=true;await view.resumeBackgroundTask();await view.resumeBackgroundTask();
 assert.equal(resumed,1);
 view.agentAppForeground=false;view.处理中=true;view.onAgentForegroundChanged();view.取消当前请求();
 view.agentAppForeground=true;view.处理中=false;await view.resumeBackgroundTask();assert.equal(resumed,1);
 view.backgroundConversation='old';await view.resumeBackgroundTask();assert.equal(resumed,1);
});

test('stream transport keeps active streams unbounded, cleans its idle deadline and rejects a truncated success',async()=>{
 for(const terminal of [true,false]) {
  const listeners=new Map(),timers=new Map();let timer=0,options,destroyed=0;
  const client={on:(name,fn)=>listeners.set(name,fn),off:name=>listeners.delete(name),destroy(){destroyed++;},
   async requestInStream(url,opts){options=opts;
    for(let i=0;i<4;i++) {const bytes=new TextEncoder().encode(': keepalive\n\n');listeners.get('dataReceive')(bytes.buffer);
     assert.equal(timers.size,1,'each heartbeat replaces the previous idle deadline');}
    const bytes=new TextEncoder().encode('event: response.output_text.delta\ndata: {"type":"response.output_text.delta","delta":"hello"}\n\n'+
     (terminal?'event: response.completed\ndata: {"type":"response.completed","response":{"output":[]}}\n\n':''));
    listeners.get('dataReceive')(bytes.buffer);listeners.get('dataEnd')();return 200;
   }};
  const Transport=loadPlatformModule('backend/agent/AgentTransport.ets','AgentTransportSession',{
   http:{createHttp:()=>client,RequestMethod:{POST:'POST'}},IncrementalSseParser,ResponsesEventNormalizer,
   UTF8解码:b=>new TextDecoder().decode(b),setTimeout:fn=>{timers.set(++timer,fn);return timer;},clearTimeout:id=>timers.delete(id)});
  const session=new Transport({url:'https://example.test',apiKey:'secret',body:'{}'},{onEvent(){}});
  if(terminal)await session.start();else await assert.rejects(session.start(),e=>e.kind==='network'&&e.detailCode==='stream_interrupted');
  assert.equal(options.readTimeout,0);assert.equal(timers.size,0);assert.equal(listeners.size,0);assert.equal(destroyed,1);
 }
});


test('default requests omit an application output-token cap while explicit per-request limits remain valid',()=>{
 const value=request();delete value.maxOutputTokens;
 assert.equal(Object.hasOwn(JSON.parse(buildResponsesPayload(value)),'max_output_tokens'),false);
 value.maxOutputTokens=4096;assert.equal(JSON.parse(buildResponsesPayload(value)).max_output_tokens,4096);
 for(const invalid of [0,-1,Infinity,NaN,1.5]) {
   value.maxOutputTokens=invalid;assert.throws(()=>buildResponsesPayload(value),/invalid_provider_input/);
 }
});
