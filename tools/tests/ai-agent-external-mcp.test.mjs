// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { LocalHttpFrame, localMcpGuard, LocalMcpProtocol, LOCAL_MCP_VERSION, LOCAL_MCP_MAX_BYTES } from '../../entry/src/main/ets/model/external-agent/LocalMcpProtocol.ts';
import { agentFunctionTools } from '../../entry/src/main/ets/model/agent/AgentToolCatalog.ts';
import { AgentToolDiscovery } from '../../entry/src/main/ets/model/agent/AgentToolDiscovery.ts';
import { loadPlatformModule } from './platform-module-harness.mjs';
const encoder = new TextEncoder();
const token = 'a'.repeat(64);
const port = 28761;
const wire = (body, headers = '', method = 'POST') => encoder.encode(`${method} /mcp HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\nAuthorization: Bearer ${token}\r\nContent-Type: application/json\r\nContent-Length: ${encoder.encode(body).length}\r\n${headers}\r\n${body}`);
const rpc = (method, params = {}, id = 1) => JSON.stringify({jsonrpc:'2.0',id,method,params});
const result = response => JSON.parse(response.body).result;

test('HTTP frames preserve Chinese UTF-8 across every TCP split and count bytes', () => {
  const body = rpc('tools/call',{name:'create_flashcards',arguments:{cards:[{fields:['正面🙂','背面']}]}});
  const bytes = wire(body);
  for(let split=1;split<bytes.length;split++) {
    const frame = new LocalHttpFrame();
    assert.equal(frame.push(bytes.slice(0,split)),null);
    const request = frame.push(bytes.slice(split));
    assert.equal(new TextDecoder().decode(request.body),body);
    assert.equal(localMcpGuard(request,token,port),200);
  }
});

test('HTTP rejects smuggling, overlong frames, duplicate headers and pipelining', () => {
  for(const headers of ['Transfer-Encoding: chunked\r\n','Content-Length: 2\r\n','Bad Header: value\r\n'])
    assert.throws(()=>new LocalHttpFrame().push(wire('{}',headers)));
  assert.throws(()=>new LocalHttpFrame().push(encoder.encode('x'.repeat(16385))));
  assert.throws(()=>new LocalHttpFrame().push(wire('x'.repeat(LOCAL_MCP_MAX_BYTES+1))));
  const combined = new Uint8Array(wire('{}').length*2);combined.set(wire('{}'));combined.set(wire('{}'),wire('{}').length);
  assert.throws(()=>new LocalHttpFrame().push(combined));
  const once=new LocalHttpFrame();once.push(wire('{}'));assert.throws(()=>once.push(new Uint8Array()));
});

test('every HTTP request checks exact Host, optional Origin and a nonempty bearer token', () => {
  const request = new LocalHttpFrame().push(wire('{}'));
  assert.equal(localMcpGuard(request,'',port),401);
  assert.equal(localMcpGuard(request,'x'.repeat(64),port),401);
  for(const host of ['evil.example','127.0.0.1.evil:28761','127.0.0.1:80']) {
    request.headers.set('host',host);assert.equal(localMcpGuard(request,token,port),403);
  }
  request.headers.set('host',`localhost:${port}`);
  for(const origin of ['null','https://evil.example','http://127.0.0.1:80']) {
    request.headers.set('origin',origin);assert.equal(localMcpGuard(request,token,port),403);
  }
  request.headers.set('origin',`http://localhost:${port}`);assert.equal(localMcpGuard(request,token,port),200);
  request.method='GET';assert.equal(localMcpGuard(request,token,port),405);
  request.method='POST';request.headers.set('mcp-protocol-version','1900-01-01');assert.equal(localMcpGuard(request,token,port),400);
});

test('MCP negotiates supported versions, accepts notifications, publishes the actual JIDE schemas', async () => {
  const tools=agentFunctionTools('assistant');
  const protocol=new LocalMcpProtocol({tools:async()=>tools,call:async()=>{throw Error('unexpected call')}});
  for(const version of ['2025-03-26','2025-06-18',LOCAL_MCP_VERSION])
    assert.equal(result(await protocol.handle(rpc('initialize',{protocolVersion:version}))).protocolVersion,version);
  assert.equal(result(await protocol.handle(rpc('initialize',{protocolVersion:'future'}))).protocolVersion,LOCAL_MCP_VERSION);
  assert.deepEqual(await protocol.handle(JSON.stringify({jsonrpc:'2.0',method:'notifications/initialized'})),{status:202,body:''});
  assert.deepEqual(result(await protocol.handle(rpc('ping'))),{});
  const actual=result(await protocol.handle(rpc('tools/list'))).tools;
  assert.equal(actual.length,tools.length);
  for(const tool of tools) assert.deepEqual(actual.find(x=>x.name===tool.name).inputSchema,JSON.parse(tool.parametersJson));
});

test('MCP invalid messages and tool errors cannot become successful domain results', async () => {
  let calls=0;
  const tools=agentFunctionTools('assistant').filter(x=>x.name==='list_decks');
  const protocol=new LocalMcpProtocol({tools:async()=>tools,call:async()=>{calls++;throw Error('collection_busy')}});
  assert.equal(JSON.parse((await protocol.handle('{')).body).error.code,-32700);
  for(const value of [null,[],{jsonrpc:'1.0',id:1,method:'ping'},{jsonrpc:'2.0',id:null,method:'ping'}])
    assert.equal(JSON.parse((await protocol.handle(JSON.stringify(value))).body).error.code,-32600);
  assert.equal(JSON.parse((await protocol.handle(rpc('tools/call',{name:'delete_everything'}))).body).error.code,-32602);
  assert.equal(calls,0);
  const output=result(await protocol.handle(rpc('tools/call',{name:'list_decks',arguments:{query:'',limit:20}})));
  assert.equal(output.isError,true);assert.match(output.content[0].text,/collection_busy/);assert.equal(calls,1);
});

test('MCP preserves text and image tool output without executing a draft', async () => {
  const tools=agentFunctionTools('assistant').filter(x=>x.name==='create_flashcards');
  const protocol=new LocalMcpProtocol({tools:async()=>tools,call:async(name,args)=>{
    assert.equal(name,'create_flashcards');assert.deepEqual(JSON.parse(args),{cards:[{fields:['a','b']}]});
    return {text:'{"status":"awaiting_confirmation"}',images:['data:image/png;base64,YQ==']};
  }});
  const output=result(await protocol.handle(rpc('tools/call',{name:'create_flashcards',arguments:{cards:[{fields:['a','b']}]}})));
  assert.equal(output.isError,false);assert.deepEqual(output.content,[{type:'text',text:'{"status":"awaiting_confirmation"}'},{type:'image',mimeType:'image/png',data:'YQ=='}]);
});

function bridgeFixture(overrides={}) {
  const calls=[];let ready=true;
  const catalog=agentFunctionTools('assistant');
  const registry={supports:name=>name!=='read_document_page',execute:async call=>{
    calls.push(call);return {outputJson:'{"decks":[]}',draft:null,clarification:null};
  },...overrides.registry};
  const host={tools:async()=>catalog,ready:()=>ready,receive:async(call,res)=>{calls.push({received:res});return call.id;},
    status:()=>'{"status":"awaiting_confirmation"}',immediate:async()=>{throw Error('user_confirmation_required');},...overrides.host};
  const Bridge=loadPlatformModule('backend/external-agent/ExternalAgentBridge.ets','ExternalAgentBridge',{AgentToolDiscovery,externalToolOutcomeStatus});
  return {bridge:new Bridge(registry,host),calls,catalog,setReady:value=>{ready=value;}};
}

test('external bridge exposes all currently registered JIDE tools and the result query',async()=>{
  const f=bridgeFixture();const tools=await f.bridge.tools();
  assert.deepEqual(tools.map(x=>x.name),f.catalog.filter(x=>x.name!=='read_document_page').map(x=>x.name).concat(['get_external_request_status']));
  for(const name of ['list_decks','create_flashcards','propose_delete_notes','get_settings','propose_set_setting','get_app_structure','execute_code'])
    assert.ok(tools.some(x=>x.name===name),name);
  const output=await f.bridge.call('list_decks','{"query":"","limit":20}');
  assert.deepEqual(f.calls[0].argumentsJson,'{"query":"","limit":20}');
  assert.equal(JSON.parse(output.text).status,'completed');
  await f.bridge.call('discover_tools','{"names":["create_flashcards"]}');assert.equal(f.calls.length,2,'discovery does not execute a domain tool');
});

test('external draft, action and clarification results retain the original confirmation-owned objects',async()=>{
  for(const result of [
    {outputJson:'{"id":"draft"}',draft:{id:'draft',status:'pending'},clarification:null},
    {outputJson:'{"actionId":"action"}',draft:null,action:{id:'action',status:'pending'},clarification:null},
    {outputJson:'{"clarificationId":"ask"}',draft:null,clarification:{id:'ask'}}
  ]) {
    let received;
    const f=bridgeFixture({registry:{execute:async()=>result},host:{receive:async(call,value)=>{received=value;return call.id;}}});
    const output=JSON.parse((await f.bridge.call('create_flashcards','{}')).text);
    assert.equal(received,result);
    assert.equal(output.status,result.clarification?'awaiting_user':'awaiting_confirmation');
  }
});

test('external immediate operations require the UI host, closed or busy sessions cannot call registry',async()=>{
  const f=bridgeFixture();
  await assert.rejects(f.bridge.call('set_theme_mode','{"mode":"dark"}'),/user_confirmation_required/);
  await assert.rejects(f.bridge.call('navigate_app','{"action":"open_settings"}'),/user_confirmation_required/);
  assert.equal(f.calls.length,0);
  f.setReady(false);await assert.rejects(f.bridge.call('list_decks','{}'),/external_session_busy/);
  assert.match((await f.bridge.call('get_external_request_status','{}')).text,/awaiting_confirmation/);
  f.bridge.close();await assert.rejects(f.bridge.tools(),/external_session_closed/);
  await assert.rejects(f.bridge.call('list_decks','{}'),/external_session_closed/);
});

test('external bridge refuses overlapping calls rather than racing the shared JIDE scope',async()=>{
  let release;const wait=new Promise(resolve=>{release=resolve});
  const f=bridgeFixture({registry:{execute:async()=>{await wait;return {outputJson:'{}',draft:null,clarification:null};}}});
  const first=f.bridge.call('list_decks','{}');
  await assert.rejects(f.bridge.call('list_decks','{}'),/external_session_busy/);release();await first;
});

test('same JSON-RPC request id replays a tool receipt, never a second proposal',async()=>{
  let calls=0;let release;const wait=new Promise(resolve=>{release=resolve});
  const tools=agentFunctionTools('assistant').filter(x=>x.name==='create_flashcards');
  const protocol=new LocalMcpProtocol({tools:async()=>tools,call:async()=>{calls++;await wait;return {text:'{"status":"awaiting_confirmation"}',images:[]}}});
  const request=rpc('tools/call',{name:'create_flashcards',arguments:{cards:[]}},42);
  const first=protocol.handle(request),second=protocol.handle(request);release();
  assert.deepEqual(await first,await second);assert.equal(calls,1);
  assert.equal(JSON.parse((await protocol.handle(rpc('tools/call',{name:'create_flashcards',arguments:{cards:[{}]}},42))).body).error.code,-32600);
  assert.equal(calls,1);
});

test('navigation completion is deferred until the real transport sends its receipt',async()=>{
  let finished=false;
  const tools=agentFunctionTools('assistant').filter(x=>x.name==='navigate_app');
  const protocol=new LocalMcpProtocol({tools:async()=>tools,call:async()=>({text:'{"status":"queued"}',images:[],afterSend:async()=>{finished=true;}})});
  const reply=await protocol.handle(rpc('tools/call',{name:'navigate_app',arguments:{action:'open_settings'}}));
  assert.equal(result(reply).isError,false);assert.equal(finished,false);await reply.afterSend();assert.equal(finished,true);
});

import { externalRequestId, externalRequestStatus, externalToolOutcomeStatus } from '../../entry/src/main/ets/model/external-agent/ExternalRequestStatus.ts';
import { createAgentMessage } from '../../entry/src/main/ets/model/agent/AgentConversationView.ts';

test('result queries reflect actual drafts, card saves, actions, rejection and uncertain outcomes',()=>{
  const message=createAgentMessage(1,'ai','',false);
  const state=()=>JSON.parse(externalRequestStatus('r1',message,'{}')).status;
  assert.equal(state(),'completed');
  for(const json of ['null','[]','42','"text"']) assert.equal(JSON.parse(externalRequestStatus('r1',message,json)).status,'completed');
  message.卡片列表=[{fields:['a','b'],已选中:true,状态:'draft',失败提示:''}];assert.equal(state(),'awaiting_confirmation');
  message.批次保存中=true;assert.equal(state(),'executing');message.批次保存中=false;
  message.卡片列表[0].状态='failed';assert.equal(state(),'failed');
  message.卡片列表[0].状态='saved';assert.equal(state(),'completed');
  message.action={id:'a1',kind:'create_deck',status:'pending',payloadJson:'{}',resultJson:''};assert.equal(state(),'awaiting_confirmation');
  message.action.status='cancelled';assert.equal(state(),'cancelled');
  message.action.status='completed';message.action.resultJson='{"status":"partial"}';assert.equal(state(),'partial');
  message.action=null;message.卡片列表=[];message.变更草稿列表=[{status:'pending'}];assert.equal(state(),'awaiting_confirmation');
  message.变更草稿列表[0].status='conflict';assert.equal(state(),'conflict');
  message.变更草稿列表=[];assert.equal(JSON.parse(externalRequestStatus('r1',message,'{"status":"queued"}')).status,'queued');assert.equal(JSON.parse(externalRequestStatus('r1',message,'{"status":"execution_outcome_unknown"}')).status,'execution_outcome_unknown');
  assert.equal(externalRequestId('{"requestId":"r1"}'),'r1');
  for(const json of ['null','[]','{}','{"requestId":true}','{"requestId":""}','{"requestId":"r1","confirmed":true}'])assert.throws(()=>externalRequestId(json));
});

function serverFixture(host) {
  const listeners=new Map();const sent=[];let listens;let stopEvents=0;
  const socketServer={on:(name,fn)=>listeners.set(name,fn),listen:async address=>{listens=address},close:async()=>{}};
  const sockets={constructTCPSocketServerInstance:()=>socketServer};
  const util={TextEncoder:class{encodeInto(value){return encoder.encode(value)}},TextDecoder:{create:()=>({decodeToString:value=>new TextDecoder('utf-8',{fatal:true}).decode(value)})}};
  const Server=loadPlatformModule('backend/external-agent/LocalMcpServer.ets','LocalMcpServer',{
    socket:sockets,util,linkRandom:async()=>token,LocalHttpFrame,LocalMcpProtocol,LOCAL_MCP_PORT:port,localMcpGuard
  });
  const server=new Server(host,()=>{stopEvents++});
  function connect() {
    const handlers=new Map();let closed=false;
    const client={on:(name,fn)=>handlers.set(name,fn),send:async({data})=>{sent.push(new TextDecoder().decode(data))},
      close:async()=>{if(closed)return;closed=true;handlers.get('close')?.()}};
    listeners.get('connect')(client);
    return {send:bytes=>handlers.get('message')?.({message:bytes.buffer}),closed:()=>closed};
  }
  return {server,connect,sent,listens:()=>listens,stopEvents:()=>stopEvents};
}
const flush=async()=>{for(let i=0;i<5;i++)await new Promise(resolve=>setImmediate(resolve))};

test('actual socket adapter binds only loopback, refuses unauthenticated requests, sends receipt before navigation',async()=>{
  let calls=0;let receiptSent=false;
  const f=serverFixture({tools:async()=>agentFunctionTools('assistant').filter(x=>x.name==='list_decks'),call:async()=>{
    calls++;return {text:'{"decks":[]}',images:[],afterSend:async()=>{receiptSent=f.sent.length===2;f.server.stop()}};
  }});
  assert.equal(await f.server.start(),token);assert.deepEqual(f.listens(),{address:'127.0.0.1',family:1,port});
  try {
    const bad=f.connect();const badWire=wire('{}');const changed=new TextDecoder().decode(badWire).replace('Bearer '+token,'Bearer '+'b'.repeat(64));
    bad.send(encoder.encode(changed));await flush();assert.match(f.sent[0],/HTTP\/1.1 401/);assert.equal(calls,0);assert.equal(bad.closed(),true);
    const good=f.connect();good.send(wire(rpc('tools/call',{name:'list_decks',arguments:{query:'',limit:20}})));await flush();
    assert.equal(calls,1);assert.match(f.sent[1],/HTTP\/1.1 200/);assert.equal(receiptSent,true);assert.equal(f.stopEvents(),1);assert.equal(good.closed(),true);
  } finally {f.server.stop()}
});

test('actual socket adapter stops partial requests and refuses malformed UTF-8 without executing tools',async()=>{
  let calls=0;
  const f=serverFixture({tools:async()=>[],call:async()=>{calls++;return {text:'{}',images:[]}}});
  await f.server.start();
  try {
    const bad=f.connect();const bytes=wire('x');bytes[bytes.length-1]=255;bad.send(bytes);await flush();assert.match(f.sent[0],/HTTP\/1.1 400/);assert.equal(calls,0);
    const partial=f.connect();partial.send(encoder.encode('POST /mcp HTTP/1.1\r\n'));
    f.server.stop();assert.equal(partial.closed(),true);assert.equal(calls,0);
  } finally {f.server.stop()}
});

import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';

test('late native confirmation from a stopped session cannot authorize a new session',async()=>{
  const source=readFileSync(new URL('../../entry/src/main/ets/pages/AI制卡页.ets',import.meta.url),'utf8');
  const method=source.match(/  private async confirmExternalImmediate\([^]*?\n  }/)[0];
  const Page=new Function('$r','DialogButtonDirection','externalMcpService',stripTypeScriptTypes('class Page {'+method+'}',{mode:'transform'})+';return Page;')(x=>x,{AUTO:0},{isRunning:()=>true,generation:()=>1});
  let alert;let executed=0;const permissions=[];
  const page=Object.assign(new Page(),{externalGeneration:1,isAgentPageVisible:true,pageDisposed:false,
    取本地化文案:x=>x,getUIContext:()=>({showAlertDialog:value=>{alert=value}}),
    appSettingsTools:{beginTurn:value=>permissions.push(value),endTurn:()=>permissions.push('end')},externalNavigations:new Map()});
  const registry={execute:async()=>{executed++;return {outputJson:'{}',draft:null,clarification:null}}};
  const call={id:'r1',name:'set_theme_mode',argumentsJson:'{"mode":"dark"}'};
  const old=page.confirmExternalImmediate(call,registry,1);
  page.externalGeneration=2;alert.buttons[1].action();await assert.rejects(old,/external_call_cancelled/);
  assert.equal(executed,0);assert.deepEqual(permissions,[]);
  const current=page.confirmExternalImmediate(call,registry,2);alert.buttons[1].action();await current;
  assert.equal(executed,1);assert.deepEqual(permissions,['切换到深色','end']);
  const cancelled=page.confirmExternalImmediate(call,registry,2);alert.buttons[0].action();await assert.rejects(cancelled,/external_call_cancelled/);assert.equal(executed,1);
  await assert.rejects(page.confirmExternalImmediate({...call,argumentsJson:'x'.repeat(16385)},registry,2),/invalid_tool_arguments/);
});

test('desktop MCP authorization survives restart and detaching the confirmation page does not stop the listener', async () => {
  let saved = '', randoms = 0;
  const starts = [], stops = [], states = [], serverPorts = [];
  class Server {
    constructor(_host, onStopped, listenPort) {
      this.onStopped = onStopped;
      serverPorts.push(listenPort);
    }
    async start(value) { starts.push(value); return value; }
    stop() { stops.push(true); this.onStopped(); }
  }
  class Library {
    async tools() { return [{name:'list_decks'}]; }
    async call() { return {text:'library',images:[]}; }
  }
  const deps = { deviceInfo:{deviceType:'2in1'}, LocalMcpServer:Server, LocalMcp_PORT:port,
    LOCAL_MCP_PORT:port, ExternalMcpLibrary:Library, AppStorage:{setOrCreate:(_,value)=>states.push(value)},
    loadExternalMcpToken:async()=>saved, saveExternalMcpToken:async value=>{saved=value;},
    linkRandom:async()=> (++randoms === 1 ? token : 'b'.repeat(64)) };
  const Service=loadPlatformModule('backend/external-agent/ExternalMcpService.ets','ExternalMcpService',deps);
  const first=new Service();
  await first.restore(); assert.equal(starts.length,0);
  await first.setEnabled(true); assert.equal(saved,token); assert.equal(states.at(-1),'on');
  assert.equal((await first.call('list_decks','{}')).text,'library');
  const view={tools:async()=>[{name:'create_flashcards'}],call:async()=>({text:'view',images:[]})};
  first.attach(view); assert.equal((await first.call('create_flashcards','{}')).text,'view');
  first.detach(view); assert.equal((await first.call('list_decks','{}')).text,'library'); assert.equal(stops.length,0);
  first.dispose(); assert.equal(saved,token);
  const next=new Service(); await next.restore(); assert.deepEqual(starts,[token,token]);
  assert.equal(JSON.parse(next.configuration()).mcpServers.jidecards.headers.Authorization,'Bearer '+token);
  assert.equal(serverPorts.at(-1), port);
  assert.equal(JSON.parse(next.configuration()).mcpServers.jidecards.url, `http://127.0.0.1:${port}/mcp`);
  await next.setEnabled(false); assert.equal(saved,''); assert.equal(next.configuration(),'');
  await next.setEnabled(true); assert.notEqual(saved,token); assert.equal(randoms,2);
  next.dispose();
  const pc = new Service();
  await pc.restore('com.jide.kapian.pc');
  assert.equal(serverPorts.at(-1), port + 1);
  assert.equal(JSON.parse(pc.configuration()).mcpServers.jidecards.url, `http://127.0.0.1:${port + 1}/mcp`);
  pc.dispose();
  deps.deviceInfo.deviceType='tablet';
  await new Service().setEnabled(true); assert.equal(starts.length,4);
});
