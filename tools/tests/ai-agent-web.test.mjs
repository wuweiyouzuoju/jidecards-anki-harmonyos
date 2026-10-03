// SPDX-License-Identifier: AGPL-3.0-or-later
import assert from 'node:assert/strict';
import test from 'node:test';
import { register } from 'node:module';
import { AgentWebAccess, validateAgentWebUrl, agentWebRedirectUrl, agentWebResultSources, filterAgentWebTools, isAgentPublicIp } from '../../entry/src/main/ets/model/agent/AgentWeb.ts';
import { agentFunctionTools } from '../../entry/src/main/ets/model/agent/AgentToolCatalog.ts';

const response = (body, extra={}) => ({status:200,body,contentType:'text/html; charset=utf-8',location:'',...extra});
function harness(responses) {
  const calls=[];
  const http={cancelled:false,
    async get(url,headers){calls.push({url,headers,method:'GET'});const next=responses.shift();if(next instanceof Error)throw next;return next;},
    async post(url,headers,body){calls.push({url,headers,body,method:'POST'});const next=responses.shift();if(next instanceof Error)throw next;return next;},
    cancel(){this.cancelled=true;}};
  return {access:new AgentWebAccess(http),http,calls};
}

test('local search uses the fixed endpoint and returns bounded real sources without credentials', async()=>{
  const {access,calls}=harness([response(JSON.stringify({web:{results:[
    {url:'https://example.com/fact',title:'<b>Fact</b>',description:'Content &amp; detail'},
    {url:'http://example.com/insecure',title:'Skip'},
    {url:'https://example.com/fact',title:'Duplicate'}]}}))]);
  const output=await access.search('{"query":"化学 & 钠","limit":5}','test-secret','brave');
  assert.equal(new URL(calls[0].url).hostname,'api.search.brave.com');
  assert.equal(new URL(calls[0].url).searchParams.get('q'),'化学 & 钠');
  assert.equal(calls[0].headers['X-Subscription-Token'],'test-secret');
  assert.deepEqual(JSON.parse(output).results,[{url:'https://example.com/fact',title:'Fact',description:'Content & detail'}]);
  assert.ok(!output.includes('test-secret'));
  assert.deepEqual(agentWebResultSources('web_search',output),[{kind:'search_source',url:'https://example.com/fact',title:'Fact'}]);
});
test('default Doubao search follows the official POST contract and normalizes bounded sources', async()=>{
  const {access,calls}=harness([response(JSON.stringify({ResponseMetadata:{RequestId:'request'},Result:{ResultCount:4,WebResults:[
    {Url:'https://example.com/a',Title:'<b>来源</b>',Summary:'详细 &amp; 摘要',Snippet:'短片段'},
    {Url:'https://example.com/b',Title:'第二项',Snippet:'片段'},
    {Url:'https://example.com/a',Title:'重复'},
    {Url:'https://a.local',Title:'内网'}]}}))]);
  const output=await access.search('{"query":"化学与钠","limit":2}','doubao-key');
  assert.equal(calls[0].url,'https://open.feedcoopapi.com/search_api/web_search');
  assert.equal(calls[0].method,'POST');
  assert.equal(calls[0].headers.Authorization,'Bearer doubao-key');
  assert.deepEqual(JSON.parse(calls[0].body),{Query:'化学与钠',SearchType:'web',Count:2,Filter:{NeedUrl:true},ContentFormats:'text'});
  assert.deepEqual(JSON.parse(output).results,[{url:'https://example.com/a',title:'来源',description:'详细 & 摘要'},
    {url:'https://example.com/b',title:'第二项',description:'片段'}]);
  assert.ok(!output.includes('doubao-key'));
});
test('Doubao empty results are real execution; malformed and error responses cannot become evidence', async()=>{
  assert.deepEqual(JSON.parse(await harness([response('{"Result":{"ResultCount":0}}')]).access.search('{"query":"x"}','key')).results,[]);
  assert.deepEqual(JSON.parse(await harness([response('{"ResponseMetadata":{"Error":null},"Result":{"ResultCount":0,"WebResults":null}}')]).access.search('{"query":"x"}','key')).results,[]);
  for(const body of ['{}','{"Result":null}','{"Result":{"ResultCount":1}}',
    '{"ResponseMetadata":{"Error":{"Code":"InvalidAPIKey"}},"Result":{"ResultCount":0}}']){
    await assert.rejects(()=>harness([response(body)]).access.search('{"query":"x"}','key'),/web_search_response_invalid/);
  }
  const {access,calls}=harness([]);
  await assert.rejects(()=>access.search(JSON.stringify({query:'x'.repeat(101)}),'key'),/web_arguments_invalid/);
  assert.deepEqual(calls,[]);
});
test('missing search key fails without request; webpage read still works',async()=>{
  const {access,calls}=harness([response('<title>Example</title><p>Hello</p><script>alert(1)</script>')]);
  await assert.rejects(()=>access.search('{"query":"example"}',''),/web_search_key_missing/);
  assert.equal(calls.length,0);
  const read=JSON.parse(await access.read('{"url":"https://example.com"}'));
  assert.equal(read.title,'Example');assert.match(read.text,/Hello/);assert.ok(!read.text.includes('alert'));
  assert.equal(read.nextOffset,-1);assert.equal(calls[0].headers['X-Subscription-Token'],undefined);
});
test('webpage reads follow validated redirects and page through extracted text',async()=>{
  const page=response('<title>Title</title><p>'+ 'abcd'.repeat(20000)+'</p>');
  const {access,calls}=harness([response('',{status:302,location:'/article'}),page,page]);
  const a=JSON.parse(await access.read('{"url":"https://example.com/start","length":12000}'));
  const b=JSON.parse(await access.read(JSON.stringify({url:a.url,offset:a.nextOffset,length:24000})));
  assert.equal(calls[1].url,'https://example.com/article');
  assert.equal(a.text.length,12000);assert.equal(a.nextOffset,12000);
  assert.equal(b.text.length,24000);assert.equal(b.nextOffset,36000);
});
test('unsupported URLs and redirects never issue a request to the target',async()=>{
  assert.equal(validateAgentWebUrl('https://example.com?query=x#part'),'https://example.com/?query=x');
  assert.equal(agentWebRedirectUrl('https://example.com/article?old','?new'),'https://example.com/article?new');
  for(const url of ['http://example.com','file:///x','https://127.0.0.1','https://[::1]','https://localhost','https://a.local','https://user:pass@example.com','https://example.com:8080','https://example.com\\@localhost']){
    assert.throws(()=>validateAgentWebUrl(url),/web_url/);
  }
  const {access,calls}=harness([response('',{status:302,location:'http://127.0.0.1/private'})]);
  await assert.rejects(()=>access.read('{"url":"https://example.com"}'),/web_redirect_invalid/);
  assert.equal(calls.length,1);
});
test('HTTP failures, binary pages, malformed responses and invalid parameters stay failures',async()=>{
  for(const value of [response('',{status:403}),response('pdf',{contentType:'application/pdf'}),response('')]){
    await assert.rejects(()=>harness([value]).access.read('{"url":"https://example.com"}'),/web_/);
  }
  await assert.rejects(()=>harness([response('{}')]).access.search('{"query":"x"}','key'),/web_search_response_invalid/);
  const {access,calls}=harness([]);
  for(const args of ['{"url":"https://example.com","length":24001}','{"url":"https://example.com","offset":-1}','{"url":"https://example.com","headers":{}}']){
    await assert.rejects(()=>access.read(args),/web_arguments_invalid/);
  }
  assert.equal(calls.length,0);
});
test('cancel during pending request rejects late content and allows the next explicit operation',async()=>{
  let resolve;const http={get:()=>new Promise(r=>{resolve=r;}),cancel(){this.cancelled=true;}};
  const access=new AgentWebAccess(http);const pending=access.read('{"url":"https://example.com"}');
  access.cancel();resolve(response('Late',{contentType:'text/plain'}));await assert.rejects(()=>pending,/cancelled/);
  assert.equal(http.cancelled,true);access.begin();
  const next=access.read('{"url":"https://example.com"}');resolve(response('Next',{contentType:'text/plain'}));
  assert.equal(JSON.parse(await next).text,'Next');
});
test('all entry modes share local web declarations and disabling web preserves local capabilities',()=>{
  for(const mode of ['assistant','create','edit']){
    const tools=agentFunctionTools(100,mode);const enabled=filterAgentWebTools(tools,true);const disabled=filterAgentWebTools(tools,false);
    for(const name of ['web_search','read_webpage']) assert.ok(enabled.some(t=>t.name===name));
    assert.deepEqual(disabled.map(t=>t.name),tools.filter(t=>!['web_search','read_webpage'].includes(t.name)).map(t=>t.name));
    assert.ok(disabled.some(t=>t.name==='execute_code'));
  }
  assert.deepEqual(agentWebResultSources('execute_code','{}'),[]);
  assert.throws(()=>agentWebResultSources('web_search','{"status":"failed"}'),/web_result_invalid/);
});

// 执行真实设备适配器与注册表；只替换 RCP 和偏好/凭据 IO。
const stub=`export const state={responses:[],calls:[],enabled:true,key:'separate-search-key',sessions:[],addresses:[{address:'93.184.216.34'}]};
export const connection={getAddressesByName:async()=>state.addresses};
export const loadAgentWebEnabled=async()=>state.enabled;
export const loadAgentSearchProvider=async()=>state.provider||'doubao';
export const loadAgentSearchSecret=async()=>state.key;
export const rcp={Request:class{constructor(url,method,headers,content,_b,_c,configuration){Object.assign(this,{url,method,headers,content,configuration});}},
createSession(){const session={closed:false,cancelled:false,cancel(){this.cancelled=true;},close(){this.closed=true;},async fetch(request){
state.calls.push(request);const result=state.responses.shift();if(result instanceof Error)throw result;
for(const data of result.chunks??[])request.configuration.tracing.httpEventsHandler.onDataReceive(data.buffer);
if(this.cancelled)throw Error('cancel');return {statusCode:result.status??200,headers:result.headers??{'content-type':'text/plain'}};}};
state.sessions.push(session);return session;}};`;
const stubUrl='data:text/javascript;base64,'+Buffer.from(stub).toString('base64');
register('data:text/javascript;base64,'+Buffer.from(`export function resolve(s,c,n){if(s==='@kit.RemoteCommunicationKit'||s==='@kit.NetworkKit'||s==='./AgentSettingsStore'||s==='./AgentSecretStore')return {url:${JSON.stringify(stubUrl)},shortCircuit:true};return n(s,c);}`).toString('base64'),import.meta.url);
const {state}=await import(stubUrl);
const {AgentWebTools}=await import('../../entry/src/main/ets/backend/agent/AgentWebTools.ets');
const {AgentToolRegistry}=await import('../../entry/src/main/ets/backend/agent/AgentToolRegistry.ets');
test('device GET adapter disables automatic redirects, bounds bytes, closes sessions and observes settings',async()=>{
  const registry=new AgentToolRegistry();new AgentWebTools().register(registry);
  const execute=()=>registry.execute({id:'read',name:'read_webpage',argumentsJson:'{"url":"https://example.com"}'});
  state.calls=[];state.sessions=[];
  state.responses=[{chunks:[new Uint8Array(Buffer.from('中文网页'))]}];
  assert.equal(JSON.parse((await execute()).outputJson).text,'中文网页');
  assert.equal(state.calls[0].configuration.transfer.autoRedirect,false);
  assert.deepEqual(state.calls[0].configuration.dns.dnsRules,[{host:'example.com',port:443,ipAddresses:['93.184.216.34']}]);
  assert.equal(state.sessions[0].closed,true);assert.equal(state.calls[0].headers['X-Subscription-Token'],undefined);
  state.responses=[{chunks:[new Uint8Array(2*1024*1024+1)]}];
  await assert.rejects(execute,/web_response_too_large/);
  assert.equal(state.sessions[1].cancelled,true);assert.equal(state.sessions[1].closed,true);
  state.enabled=false;const count=state.calls.length;await assert.rejects(execute,/web_search_disabled/);assert.equal(state.calls.length,count);
  state.enabled=true;state.responses=[Error('request failure containing separate-search-key')];
  await assert.rejects(execute,e=>e.message==='web_request_failed');assert.equal(state.sessions.at(-1).closed,true);
  state.addresses=[{address:'192.168.1.1'}];const previous=state.calls.length;
  await assert.rejects(execute,/web_url_not_public/);assert.equal(state.calls.length,previous);
  state.addresses=[{address:'93.184.216.34'}];
});
test('real Registry uses selected Doubao POST with separate credentials and never forwards them to pages',async()=>{
  const registry=new AgentToolRegistry();new AgentWebTools().register(registry);
  state.calls=[];state.enabled=true;state.provider='doubao';
  state.responses=[{chunks:[new Uint8Array(Buffer.from('{"Result":{"ResultCount":0}}'))]}];
  await registry.execute({id:'search',name:'web_search',argumentsJson:'{"query":"事实"}'});
  assert.equal(state.calls[0].method,'POST');assert.equal(state.calls[0].headers.Authorization,'Bearer separate-search-key');
  assert.equal(JSON.parse(state.calls[0].content).Query,'事实');
  state.responses=[{chunks:[new Uint8Array(Buffer.from('正文'))]}];
  await registry.execute({id:'read',name:'read_webpage',argumentsJson:'{"url":"https://example.com"}'});
  assert.equal(state.calls[1].method,'GET');assert.equal(state.calls[1].headers.Authorization,undefined);
});
test('resolved local, reserved and IPv6 private addresses are excluded',()=>{
  for(const ip of ['127.0.0.1','10.0.0.1','192.168.1.1','172.16.0.1','169.254.169.254','100.64.0.1','0.0.0.0','224.0.0.1','::1','fc00::1','fe80::1','::ffff:192.168.1.1','2001:db8::1']) assert.equal(isAgentPublicIp(ip),false,ip);
  for(const ip of ['93.184.216.34','8.8.8.8','2606:4700:4700::1111']) assert.equal(isAgentPublicIp(ip),true,ip);
});
