// SPDX-License-Identifier: AGPL-3.0-or-later
import assert from 'node:assert/strict';
import { register } from 'node:module';
import test from 'node:test';
import { codeUtf8Bytes, decodeCodeArguments, decodeCodeResult } from '../../entry/src/main/ets/model/agent/AgentCodeExecution.ts';
import { agentFunctionTools } from '../../entry/src/main/ets/model/agent/AgentToolCatalog.ts';
import { toolRiskOf } from '../../entry/src/main/ets/model/agent/AgentPolicy.ts';
import { buildResponsesPayload, MAX_PROVIDER_PAYLOAD_CHARS } from '../../entry/src/main/ets/model/agent/ProviderProtocol.ts';

const stub = `
export const state = { next: 0, calls: [], cancelled: [], pending: null };
export default {
 start(source,input) { const id=++state.next;state.calls.push({id,source,input});
   return {id,result:new Promise((resolve,reject)=>{state.pending={resolve,reject};})}; },
 cancel(id) { state.cancelled.push(id); }
};
export class AgentStreamObserver {} export class AgentTransportError extends Error {} export class AgentTransportSession {}
export class DeepSeekAdapter {} export class OpenAIAdapter {} export class CustomAdapter {}
`;
const stubUrl = 'data:text/javascript;base64,' + Buffer.from(stub).toString('base64');
register('data:text/javascript;base64,' + Buffer.from(`export function resolve(s,c,next) {
 if(s==='libagent_sandbox.so'||['./AgentTransport','./DeepSeekAdapter','./OpenAIAdapter','./CustomAdapter'].includes(s))
 return {url:${JSON.stringify(stubUrl)},shortCircuit:true};return next(s,c);
}`).toString('base64'), import.meta.url);
const { state } = await import(stubUrl);
const { AgentCodeTool } = await import('../../entry/src/main/ets/backend/agent/AgentCodeTool.ets');
const { AgentToolRegistry } = await import('../../entry/src/main/ets/backend/agent/AgentToolRegistry.ets');
const { AgentRunner } = await import('../../entry/src/main/ets/backend/agent/AgentRunner.ets');
const args = JSON.stringify({ source: 'return input;', inputJson: '{"hello":"world"}' });
const call = { id: 'code-1', name: 'execute_code', argumentsJson: args };
function harness() {
  state.calls=[];state.cancelled=[];state.pending=null;
  const registry=new AgentToolRegistry();new AgentCodeTool().register(registry);return registry;
}
function success(resultJson='42') { return JSON.stringify({ok:true,resultJson}); }

test('code schema and risk agree in both modes; limits count UTF-8, not JS characters',()=>{
  for(const mode of ['create','edit']) {
    const tool=agentFunctionTools(100,mode).find(t=>t.name==='execute_code');
    assert.ok(tool);assert.equal(toolRiskOf(tool.name),'read');
    assert.equal(JSON.parse(tool.parametersJson).additionalProperties,false);
    assert.ok(decodeCodeArguments(tool.exampleArgumentsJson));
  }
  for(const text of ['ASCII','中文','\ud83d\ude00','\ud800','\udc00','\ud800x']) {
    assert.equal(codeUtf8Bytes(text),Buffer.byteLength(text));
  }
  assert.equal(decodeCodeArguments(args).source,'return input;');
  for(const value of ['{','null','[]','{}','{"source":3,"inputJson":"null"}',
    JSON.stringify({source:'return 1;',inputJson:'null',tools:['remove_notes']}),
    JSON.stringify({source:'x'.repeat(65501),inputJson:'null'}),
    JSON.stringify({source:'return input;',inputJson:'中'.repeat(44000)})]) {
    assert.throws(()=>decodeCodeArguments(value));
  }
});

test('native responses are checked and failures carry correction advice; proposal-looking data stays data',()=>{
  const proposal={status:'awaiting_confirmation',action:{kind:'delete_notes'},draft:{operations:[]}};
  assert.deepEqual(JSON.parse(decodeCodeResult(success(JSON.stringify(proposal)))),{status:'completed',result:proposal});
  assert.deepEqual(JSON.parse(decodeCodeResult(success('null'))),{status:'completed',result:null});
  for(const json of ['null','[]','{}','{',success('{'),success(JSON.stringify('x'.repeat(65536))),
    '{"ok":"true","resultJson":"1"}','{"ok":false,"error":"secret injected message"}']) {
    assert.throws(()=>decodeCodeResult(json),/sandbox_invalid_response/);
  }
  for(const error of ['sandbox_script_error','sandbox_fuel','sandbox_deadline','sandbox_output_limit','cancelled']) {
    assert.throws(()=>decodeCodeResult(JSON.stringify({ok:false,error})),e=>e.code===error&&e.detailMessage.length>10);
  }
});

test('the shared provider boundary accounts for serialized instructions, schemas, arguments and output without breaking pairs',()=>{
  const base={model:'test',instructions:'',input:[],functionTools:[],searchMode:'off',reasoningEffort:'',maxOutputTokens:100};
  const message={kind:'message',role:'user',content:'',callId:'',name:'',argumentsJson:'',output:''};
  const emptyLength=buildResponsesPayload({...base,input:[message]}).length;
  const atLimit={...base,input:[{...message,content:'x'.repeat(MAX_PROVIDER_PAYLOAD_CHARS-emptyLength)}]};
  assert.equal(buildResponsesPayload(atLimit).length,MAX_PROVIDER_PAYLOAD_CHARS);
  assert.throws(()=>buildResponsesPayload({...atLimit,instructions:'x'}),/agent_context_limit/);
  assert.throws(()=>buildResponsesPayload({...base,instructions:'x'.repeat(240001)}),/agent_context_limit/);
  assert.throws(()=>buildResponsesPayload({...base,functionTools:[{name:'large',description:'x'.repeat(240001),
    parametersJson:'{"type":"object"}',rules:'',exampleArgumentsJson:'{}'}]}),/agent_context_limit/);
  const pair=[{...message,kind:'function_call',callId:'c',name:'execute_code',argumentsJson:args},
    {...message,kind:'function_call_output',callId:'c',output:JSON.stringify({result:'x'.repeat(240001)})}];
  const before=JSON.stringify(pair);
  assert.throws(()=>buildResponsesPayload({...base,input:pair}),/agent_context_limit/);
  assert.equal(JSON.stringify(pair),before);
  assert.throws(()=>buildResponsesPayload({...base,input:[{...message,content:'"'.repeat(130000)}]}),/agent_context_limit/);
});

test('registry cancellation reaches only active native handle and slot recovers on success or rejection',async()=>{
  const registry=harness();registry.cancelActive();assert.deepEqual(state.cancelled,[]);
  const pending=registry.execute(call);assert.equal(state.calls.length,1);
  await assert.rejects(registry.execute(call),/tool_busy/);
  state.pending.resolve(success());const result=await pending;
  assert.equal(result.draft,null);assert.equal(result.action,undefined);
  assert.deepEqual(JSON.parse(result.outputJson),{status:'completed',result:42});
  const second=registry.execute(call);registry.cancelActive();
  assert.deepEqual(state.cancelled,[state.calls[1].id]);
  state.pending.reject(new Error('sandbox_queue_failed'));await assert.rejects(second,/sandbox_queue_failed/);
  registry.cancelActive();assert.equal(state.cancelled.length,1);
  const third=registry.execute(call);state.pending.resolve(success());await third;
});

test('runner cancellation discards both late successes and late failures without continuing provider or publishing drafts',async()=>{
  for(const reject of [false,true]) {
    const registry=harness();const runner=new AgentRunner(registry);const events=[];let turns=0;
    runner.createSession=(_provider,_request,observer)=>({async start(){turns++;
      observer.onEvent({kind:'tool_call',text:'',toolCall:call,toolTrace:null,source:null,errorCode:''});},cancel(){}});
    const request={apiKey:'test',baseUrl:'https://example.test',model:'test',instructions:'',input:[],
      functionTools:agentFunctionTools(),searchMode:'off',requiresWebSearch:false,requiresSearchEvidence:false,
      requiresDraft:false,expectedDraftCount:0,reasoningEffort:'',maxOutputTokens:1024};
    const pending=runner.run('custom',request,{onEvent(event){events.push(event);}});
    while(!state.pending)await new Promise(resolve=>setImmediate(resolve));
    runner.cancel();assert.equal(state.cancelled.length,1);
    if(reject)state.pending.reject(new Error('sandbox_deadline'));else state.pending.resolve(success());
    await assert.rejects(pending,e=>e.code==='cancelled');
    assert.equal(turns,1);assert.equal(events.some(e=>e.kind==='tool_completed'||e.kind==='tool_failed'),false);
    assert.equal(request.input.some(i=>i.kind==='function_call_output'),false);
  }
});
