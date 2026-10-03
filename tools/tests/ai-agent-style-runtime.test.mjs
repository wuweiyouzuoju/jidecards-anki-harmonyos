// SPDX-License-Identifier: AGPL-3.0-or-later
import assert from 'node:assert/strict';
import { register } from 'node:module';
import test from 'node:test';
import { applyAgentCardStyle } from '../../entry/src/main/ets/model/agent/AgentCardStyle.ts';
import { decodeAgentToolArguments } from '../../entry/src/main/ets/model/agent/AgentToolSchemas.ts';
import { agentFunctionTools } from '../../entry/src/main/ets/model/agent/AgentToolCatalog.ts';
import { decodeExtensionArguments } from '../../entry/src/main/ets/model/agent/AgentExtensionTools.ts';
import { buildAgentNotetypeJson } from '../../entry/src/main/ets/model/agent/AgentNotetypeDesign.ts';
import { buildFailedOperationsRetryDraft } from '../../entry/src/main/ets/model/agent/AgentDraftRetry.ts';

const stub = `
export const common = {};
export const fixture = { json: '', count: 2507, writes: [], queries: [], failure: false, ignoreWrite: false };
export class 笔记类型服务 {
 async 获取笔记类型旧版() { if(fixture.failure)throw Error('collection_busy');return fixture.json; }
 async 更新笔记类型旧版(json) { fixture.writes.push(json);if(!fixture.ignoreWrite)fixture.json=json; }
}
export class 搜索服务 {
 async 搜索笔记(request) { fixture.queries.push(request.search);return Array.from({length:fixture.count},(_,i)=>i+1); }
 async 搜索卡片(request) { fixture.queries.push(request.search);return Array.from({length:fixture.count},(_,i)=>10000+i); }
}
export class 笔记服务 {} export class 卡片服务 {} export class 牌组服务 {}
export class 媒体服务 {} export class WikimediaImageService {}
`;
const stubUrl = 'data:text/javascript;base64,' + Buffer.from(stub).toString('base64');
const names = ['笔记类型服务','搜索服务','笔记服务','卡片服务','牌组服务','媒体服务','WikimediaImageService'];
register('data:text/javascript;base64,' + Buffer.from(`export function resolve(s,c,next) {
 if(s==='@kit.AbilityKit'||${JSON.stringify(names)}.some(n=>s.endsWith('/'+n)))return {url:${JSON.stringify(stubUrl)},shortCircuit:true};
 return next(s,c);
}`).toString('base64'), import.meta.url);
const { fixture } = await import(stubUrl);
const { AgentScope } = await import('../../entry/src/main/ets/backend/agent/AgentScope.ets');
const { AgentToolRegistry } = await import('../../entry/src/main/ets/backend/agent/AgentToolRegistry.ets');
const { HighRiskAgentTools } = await import('../../entry/src/main/ets/backend/agent/HighRiskAgentTools.ets');
const { AgentDraftExecutor } = await import('../../entry/src/main/ets/backend/agent/AgentDraftExecutor.ets');

const original = { id: 2, name: 'Shared * name', css: '.card { background: white; } .extra { color: red; }',
 flds: [{name:'Front',ord:0},{name:'Back',ord:1}],
 tmpls: [{name:'Card 1',ord:0,qfmt:'{{Front}}',afmt:'{{FrontSide}}<hr>{{Back}}',bqfmt:'keep me'}],
 type:0,sortf:0,latexPre:'preserve metadata' };
function harness(mode = 'edit') {
 Object.assign(fixture,{json:JSON.stringify(original),count:2507,writes:[],queries:[],failure:false,ignoreWrite:false});
 const scope=new AgentScope();scope.registerReadableNotetypeIds([2]);scope.configureBatchLimit(1);
 const registry=new AgentToolRegistry();new HighRiskAgentTools(scope).register(registry,mode);
 return {scope,registry};
}
function call(name='propose_update_card_style', args={style:{backgroundColor:'#FFF4CC',textColor:'#222222'}}) {
 return {id:'call-1',name,argumentsJson:JSON.stringify({notetypeIds:[2],draftId:'style-1',reason:'Yellow background',...args})};
}
async function save(draft) {
 const executor=new AgentDraftExecutor();const prepared=await executor.prepare(draft);
 const second=executor.authorizeHighRisk(prepared,prepared.firstToken);
 return executor.executeHighRisk(prepared,prepared.firstToken,second);
}

for(const mode of ['create','edit']) {
 test(`${mode}: declared style tools really draft and save shared CSS for 2507 cards without replacing templates`,async()=>{
  const {registry}=harness(mode);
  for(const name of ['propose_update_card_style','propose_update_note_type_templates']) {
   assert.ok(agentFunctionTools(1,mode).some(t=>t.name===name));
  }
  const {draft,outputJson}=await registry.execute(call());
  assert.equal(JSON.parse(outputJson).affectedCardCount,2507);
  assert.equal(outputJson.includes('affectedCardIds'),false);
  assert.ok(outputJson.length<2000);
  assert.equal(fixture.writes.length,0);
  assert.equal(draft.risk,'high_risk');assert.equal(draft.confirmationLevel,2);
  assert.equal(draft.affectedCardIds.length,2507);assert.equal(draft.affectedNoteIds.length,2507);
  assert.deepEqual(fixture.queries,['mid:2','mid:2']);
  assert.match(draft.summary,/2507/);
  const result=await save(draft);assert.equal(result.status,'completed');
  const saved=JSON.parse(fixture.json);assert.match(saved.css,/#FFF4CC/);
  assert.ok(saved.css.startsWith(original.css));
  assert.deepEqual({...saved,css:original.css},original);
 });
}

test('legacy CSS-only minimal call preserves templates and accepts empty CSS as an explicit clear',async()=>{
 for(const css of ['.card{background:#abc}','']) {
  const {registry}=harness();const {draft}=await registry.execute(call('propose_update_note_type_templates',{css}));
  const result=await save(draft);assert.equal(result.status,'completed');
  assert.deepEqual(JSON.parse(fixture.json),{...original,css});
 }
});

test('failed proposal can retry the same draft ID; successful proposals still reject duplicates',async()=>{
 const {registry}=harness();fixture.failure=true;
 await assert.rejects(registry.execute(call()),/collection_busy/);
 fixture.failure=false;assert.ok((await registry.execute(call())).draft);
 await assert.rejects(registry.execute(call()),e=>e.code==='duplicate_draft_id');
});

test('bad templates fail before confirmation and do not consume draft ID',async()=>{
 const {registry}=harness();
 for(const templateJson of ['[]','{','[{}]']) {
  await assert.rejects(registry.execute(call('propose_update_note_type_templates',{templateJson})),
   e=>e.code==='invalid_value'&&e.path==='templateJson');
 }
 assert.ok((await registry.execute(call())).draft);
 assert.equal(fixture.writes.length,0);
});

test('real template changes retain batch limits while omitted CSS is preserved',async()=>{
 const {registry,scope}=harness();const templates=[{...original.tmpls[0],qfmt:'<b>{{Front}}</b>'}];
 await assert.rejects(registry.execute(call('propose_update_note_type_templates',{templateJson:JSON.stringify(templates)})),
  e=>e.code==='high_risk_batch_too_large');
 fixture.count=2;
 await assert.rejects(registry.execute(call('propose_update_note_type_templates',{templateJson:JSON.stringify(templates)})),/tool_batch_too_large/);
 scope.configureBatchLimit(2);
 const {draft}=await registry.execute(call('propose_update_note_type_templates',{templateJson:JSON.stringify(templates)}));
 assert.equal(JSON.parse(draft.operations[0].after).css,original.css);
 assert.equal((await save(draft)).status,'completed');
 assert.deepEqual(JSON.parse(fixture.json).tmpls,templates);
});

test('unknown note type cannot be styled, and create mode does not register deletion tools',async()=>{
 const {registry}=harness('create');
 await assert.rejects(registry.execute(call('propose_update_card_style',{notetypeIds:[99],style:{fontSize:24}})),/id_out_of_scope/);
 await assert.rejects(registry.execute(call('propose_delete_notes',{noteIds:[1]})),/tool_unavailable/);
 assert.equal(fixture.writes.length,0);
});

test('changed audience or CSS invalidates confirmation before any write',async()=>{
 for(const change of ['audience','css']) {
  const {registry}=harness();const {draft}=await registry.execute(call());
  const executor=new AgentDraftExecutor();const prepared=await executor.prepare(draft);
  const second=executor.authorizeHighRisk(prepared,prepared.firstToken);
  if(change==='audience')fixture.count++;else fixture.json=JSON.stringify({...original,css:'new external css'});
  await assert.rejects(executor.executeHighRisk(prepared,prepared.firstToken,second),/draft_(impact_changed|conflict)/);
  assert.equal(fixture.writes.length,0);
 }
});

test('saving requires both confirmations and validates persisted CSS before reporting success',async()=>{
 const {registry}=harness();const {draft}=await registry.execute(call());const executor=new AgentDraftExecutor();
 const prepared=await executor.prepare(draft);
 await assert.rejects(executor.executeOrdinary(prepared,prepared.firstToken),/ordinary_execution_not_allowed/);
 await assert.rejects(executor.executeHighRisk(prepared,prepared.firstToken,prepared.firstToken),/confirmation_tokens_not_distinct/);
 assert.equal(fixture.writes.length,0);
 const second=executor.authorizeHighRisk(prepared,prepared.firstToken);fixture.ignoreWrite=true;
 const result=await executor.executeHighRisk(prepared,prepared.firstToken,second);
 assert.equal(result.status,'failed');assert.equal(result.items[0].errorCode,'style_verification_failed');
 const retry=buildFailedOperationsRetryDraft(draft,result,'retry-1');
 assert.deepEqual(retry.affectedNoteIds,draft.affectedNoteIds);
 assert.deepEqual(retry.affectedCardIds,draft.affectedCardIds);
 fixture.ignoreWrite=false;assert.equal((await save(retry)).status,'completed');
});

test('appearance patches merge with previous patches, preserve imported CSS and reject code injection',()=>{
 const initial=applyAgentCardStyle(original.css,{backgroundColor:'#FFF4CC',darkBackgroundColor:'#18202B'});
 const next=applyAgentCardStyle(initial,{fontSize:24,textAlign:'left'});
 assert.ok(next.startsWith(original.css));assert.match(next,/#FFF4CC/);assert.match(next,/#18202B/);
 assert.equal(next.split('jidecards-agent-style:start').length,2);assert.match(next,/font-size: 24px/);
 for(const style of [{},{backgroundColor:'red;}</style><script>alert(1)</script>'},{fontSize:1},{textAlign:'bad'},{extra:1}]) {
  assert.throws(()=>decodeAgentToolArguments('propose_update_card_style',call(undefined,{style}).argumentsJson));
 }
});

test('new note type includes requested appearance while retaining stock metadata',()=>{
 const design=decodeExtensionArguments('propose_create_note_type',JSON.stringify({name:'Yellow',kind:'normal',
  fields:['Front','Back'],frontFields:['Front'],backFields:['Back'],style:{backgroundColor:'#FFF4CC'}}));
 const result=JSON.parse(buildAgentNotetypeJson(JSON.stringify(original),design));
 assert.match(result.css,/#FFF4CC/);assert.equal(result.latexPre,original.latexPre);
 assert.equal(result.tmpls[0].bqfmt,'keep me');
});
