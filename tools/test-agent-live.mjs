// SPDX-License-Identifier: AGPL-3.0-or-later
// Opt-in live model evaluation. Synthetic collection only; real parser, Runner, Registry and draft validation.
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { writeFile } from 'node:fs/promises';
import { buildResponsesPayload } from '../entry/src/main/ets/model/agent/ProviderProtocol.ts';
import { ResponsesEventNormalizer } from '../entry/src/main/ets/model/agent/ResponsesEventNormalizer.ts';
import { IncrementalSseParser } from '../entry/src/main/ets/model/agent/SseParser.ts';
import { agentFunctionTools } from '../entry/src/main/ets/model/agent/AgentToolCatalog.ts';
import { buildAgentSessionInstructions } from '../entry/src/main/ets/model/agent/AgentSessionContext.ts';
import { DEEPSEEK_PROVIDER } from '../entry/src/main/ets/model/agent/ProviderCatalog.ts';

if (!process.argv.includes('--run')) {
 console.error('Opt-in: DEEPSEEK_API_KEY required. Run with --run; synthetic text is sent to the provider and billed.');
 process.exit(1);
}
const apiKey=process.env.DEEPSEEK_API_KEY;
if(!apiKey) { console.error('Missing DEEPSEEK_API_KEY');process.exit(1); }
const model=process.env.AGENT_EVAL_MODEL || DEEPSEEK_PROVIDER.defaultModel;
const baseUrl=process.env.AGENT_EVAL_BASE_URL || 'https://api.deepseek.com';

// These services expose only fixed, non-user fixtures. No storage, media download or write service exists.
const stub=`
export class AgentStreamObserver {} export class AgentTransportError extends Error {} export class AgentTransportSession {}
export class DeepSeekAdapter {} export class OpenAIAdapter {} export class CustomAdapter {}
export class WikimediaImageService {} export class WikimediaImageServiceError extends Error {}
export class 牌组服务 {async 获取牌组树(){return {deckId:0,name:'',children:[{deckId:1,name:'化学',children:[]}]};}}
export class 笔记类型服务 {async 获取笔记类型能力(){return {notetypeId:2,name:'Basic',kind:0,fieldNames:['Front','Back'],clozeFieldOrds:[]};}}
export class 卡片服务 {} export class 搜索服务 {} export class 笔记服务 {} export class 标签服务 {} export class 统计服务 {}
`;
const stubUrl='data:text/javascript;base64,'+Buffer.from(stub).toString('base64');
const names=['AgentTransport','DeepSeekAdapter','OpenAIAdapter','CustomAdapter','WikimediaImageService',
 '牌组服务','笔记类型服务','卡片服务','搜索服务','笔记服务','标签服务','统计服务'];
register('data:text/javascript;base64,'+Buffer.from(`export function resolve(s,c,next){
 if(${JSON.stringify(names)}.some(n=>s.endsWith('/'+n)))return {url:${JSON.stringify(stubUrl)},shortCircuit:true};
 return next(s,c);}`).toString('base64'),import.meta.url);
const {AgentRunner}=await import('../entry/src/main/ets/backend/agent/AgentRunner.ets');
const {AgentToolRegistry}=await import('../entry/src/main/ets/backend/agent/AgentToolRegistry.ets');
const {AgentScope}=await import('../entry/src/main/ets/backend/agent/AgentScope.ets');
const {CardAgentTools}=await import('../entry/src/main/ets/backend/agent/CardAgentTools.ets');
const setup={mode:'create',deckId:1,deckName:'化学',notetypeId:2,notetypeName:'Basic',
 fieldNames:['Front','Back'],noteTypeKind:0,clozeFieldOrds:[]};
const material='钠应保存在煤油中。钠与水反应生成氢氧化钠和氢气：2Na + 2H₂O = 2NaOH + H₂↑。'+
 '碳酸氢钠受热分解：2NaHCO₃ = Na₂CO₃ + H₂O + CO₂↑。';
const cases=[
 {name:'chemistry-draft',count:3,prompt:`根据以下材料直接制作3张问答闪卡，使用当前Basic类型。只覆盖材料中的3个知识点。\n${material}`},
 {name:'quoted-content',count:1,prompt:'把以下材料制作1张问答卡，答案完整保留原文里的引号、反斜杠与换行：\n'+
  '问题：这个字符串怎样写？\n答案：第一行说“你好”。\n第二行的路径是 C:\\study\\cards。'},
 {name:'injected-json-repair',count:3,inject:true,prompt:`根据以下材料直接制作3张问答闪卡，不要只在正文列出。\n${material}`}
];
const report={model,scope:'live model, synthetic collection, real SSE/Runner/Registry/CardAgentTools; no device or sandbox evaluation',cases:[]};
for(const scenario of cases) {
 const started=Date.now(),scope=new AgentScope();scope.configureCreateTarget(1,2);
 const registry=new AgentToolRegistry();new CardAgentTools(scope).register(registry,'create');
 const runner=new AgentRunner(registry),events=[];let requests=0,injected=false;
 runner.createSession=(_provider,request,observer)=>{
  const controller=new AbortController();
  return {cancel(){controller.abort();},async start(){
   requests++;const timeout=setTimeout(()=>controller.abort(),Math.max(1,180000-(Date.now()-started)));
   try {
    const response=await fetch(baseUrl.replace(/\/$/,'')+'/responses',{method:'POST',
     headers:{'Content-Type':'application/json',Accept:'text/event-stream',Authorization:`Bearer ${apiKey}`},
     body:buildResponsesPayload(request),signal:controller.signal});
    if(!response.ok) {await response.body?.cancel();throw Error(`provider_http_${response.status}`);}
    const parser=new IncrementalSseParser(),normalizer=new ResponsesEventNormalizer();
    const emit=messages=>{for(const message of messages)for(const event of normalizer.accept(message)) {
     // Controlled transport corruption tests recovery; it is not a naturally occurring model error.
     if(scenario.inject&&!injected&&event.kind==='tool_call'&&event.toolCall.name==='create_flashcards') {
      event.toolCall.argumentsJson=event.toolCall.argumentsJson.slice(0,-1);injected=true;
     }
     observer.onEvent(event);
    }};
    for await(const chunk of response.body)emit(parser.push(chunk));
    emit(parser.finish());
   } finally {clearTimeout(timeout);}
  }};
 };
 try {
  const result=await runner.run('deepseek',{apiKey,baseUrl,model,instructions:buildAgentSessionInstructions(setup,100),
   input:[{kind:'message',role:'user',content:scenario.prompt,callId:'',name:'',argumentsJson:'',output:''}],
   functionTools:agentFunctionTools(100,'create').filter(t=>['create_flashcards','request_clarification'].includes(t.name)),
   searchMode:'off',requiresWebSearch:false,requiresSearchEvidence:false,requiresDraft:true,
   expectedDraftCount:scenario.count,reasoningEffort:'low',maxOutputTokens:32768},{onEvent:e=>events.push(e)});
  const notes=new Map();
  for(const draft of result.drafts)for(const operation of draft.operations) {
   if(!notes.has(operation.noteId))notes.set(operation.noteId,[]);
   notes.get(operation.noteId)[operation.fieldOrd]=operation.after;
  }
  assert.equal(result.status,'completed');assert.equal(notes.size,scenario.count);
  assert.ok([...notes.values()].every(fields=>fields.length===2&&fields.every(x=>typeof x==='string'&&x.trim())));
  if(scenario.inject) {assert.ok(injected);assert.ok(events.some(e=>e.kind==='tool_failed'&&e.errorCode==='invalid_json'));}
  if(scenario.name==='quoted-content') {
   const answer=[...notes.values()][0][1];assert.match(answer,/“你好”/);assert.ok(answer.includes('C:\\study\\cards'));assert.ok(answer.includes('\n'));
  }
  report.cases.push({name:scenario.name,passed:true,requests,toolFailures:events.filter(e=>e.kind==='tool_failed').length,
   cards:notes.size,elapsedMs:Date.now()-started,controlledFault:scenario.inject===true});
 } catch(error) {
  report.cases.push({name:scenario.name,passed:false,requests,elapsedMs:Date.now()-started,
   error:error.message,toolFailures:events.filter(e=>e.kind==='tool_failed').map(e=>e.errorCode)});
 }
 console.log(JSON.stringify(report.cases.at(-1)));
 if(['provider_http_401','provider_http_403'].includes(report.cases.at(-1).error))break;
}
if(process.env.AGENT_EVAL_REPORT)await writeFile(process.env.AGENT_EVAL_REPORT,JSON.stringify(report,null,2)+'\n');
process.exitCode=report.cases.every(x=>x.passed)?0:1;
