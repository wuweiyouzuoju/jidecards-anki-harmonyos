// SPDX-License-Identifier: AGPL-3.0-or-later
import assert from 'node:assert/strict';
import { register } from 'node:module';
import test from 'node:test';
import { agentFunctionTools } from '../../entry/src/main/ets/model/agent/AgentToolCatalog.ts';
import { decodeAgentToolArguments } from '../../entry/src/main/ets/model/agent/AgentToolSchemas.ts';
import { buildFailedOperationsRetryDraft } from '../../entry/src/main/ets/model/agent/AgentDraftRetry.ts';

const stub=`
export const common={};
export class AgentStreamObserver {} export class AgentTransportError extends Error {} export class AgentTransportSession {}
export class DeepSeekAdapter {} export class OpenAIAdapter {} export class CustomAdapter {}
export const fixture={tree:null,cards:[],writes:[],queries:[],failed:[]};
export class 牌组服务 {
 async 获取牌组树(){return structuredClone(fixture.tree);}
 async 删除牌组(ids){
  if(ids.some(id=>fixture.failed.includes(id)))throw Error('backend_write_failed');
  fixture.writes.push(ids);
  const remove=node=>{node.children=node.children.filter(child=>!ids.includes(child.deckId));node.children.forEach(remove);};
  remove(fixture.tree);return 0;
 }
}
export class 搜索服务 {
 async 搜索卡片({search}){fixture.queries.push(search);const ids=search.slice(4).split(',').map(Number);
  return fixture.cards.filter(card=>ids.includes(card.deckId)||ids.includes(card.originalDeckId)).map(card=>card.id);}
}
export class 卡片服务 {async 获取卡片(id){const card=fixture.cards.find(card=>card.id===id);if(!card)throw Error('card_not_found');return {...card};}}
export class 笔记服务 {} export class 笔记类型服务 {} export class 媒体服务 {} export class WikimediaImageService {}
`;
const stubUrl='data:text/javascript;base64,'+Buffer.from(stub).toString('base64');
const names=['牌组服务','搜索服务','卡片服务','笔记服务','笔记类型服务','媒体服务','WikimediaImageService',
 'AgentTransport','DeepSeekAdapter','OpenAIAdapter','CustomAdapter'];
register('data:text/javascript;base64,'+Buffer.from(`export function resolve(s,c,next){
 if(s==='@kit.AbilityKit'||${JSON.stringify(names)}.some(n=>s.endsWith('/'+n)))return {url:${JSON.stringify(stubUrl)},shortCircuit:true};
 return next(s,c);
}`).toString('base64'),import.meta.url);
const {fixture}=await import(stubUrl);
const {AgentScope}=await import('../../entry/src/main/ets/backend/agent/AgentScope.ets');
const {HighRiskAgentTools}=await import('../../entry/src/main/ets/backend/agent/HighRiskAgentTools.ets');
const {AgentToolRegistry}=await import('../../entry/src/main/ets/backend/agent/AgentToolRegistry.ets');
const {AgentDraftExecutor}=await import('../../entry/src/main/ets/backend/agent/AgentDraftExecutor.ets');
const {AgentRunner}=await import('../../entry/src/main/ets/backend/agent/AgentRunner.ets');

function deck(id,name=`Deck ${id}`,children=[]){return {deckId:id,name,children,level:0,collapsed:false,
 reviewCount:0,learnCount:0,newCount:0,totalInDeck:0,totalIncludingChildren:0,filtered:false};}
function harness(count=10){
 fixture.tree=deck(0,'',Array.from({length:count},(_,i)=>deck(i+11)));
 fixture.cards=Array.from({length:count},(_,i)=>({id:i+100,noteId:i+200,deckId:i+11,originalDeckId:0}));
 fixture.writes=[];fixture.queries=[];fixture.failed=[];
 const scope=new AgentScope();scope.configureBatchLimit(1000);scope.registerReadableDeckIds(Array.from({length:count},(_,i)=>i+11));
 const registry=new AgentToolRegistry();new HighRiskAgentTools(scope).register(registry,'assistant');
 return {scope,registry};
}
const call=(ids,draftId='delete-1')=>({id:'call-1',name:'propose_delete_deck',
 argumentsJson:JSON.stringify({deckIds:ids,draftId,reason:'Delete requested decks'})});
async function save(draft){
 const executor=new AgentDraftExecutor();const prepared=await executor.prepare(draft);
 const second=executor.authorizeHighRisk(prepared,prepared.firstToken);
 return executor.executeHighRisk(prepared,prepared.firstToken,second);
}

for(const count of [1,2,9,10])test(`${count} decks produce one actual Registry draft, with complete impact and no writes`,async()=>{
 const {registry}=harness();const ids=Array.from({length:count},(_,i)=>i+11);
 const {draft,outputJson}=await registry.execute(call(ids));
 assert.equal(draft.status,'pending');assert.equal(draft.risk,'high_risk');assert.equal(draft.confirmationLevel,2);
 assert.deepEqual(draft.operations.map(op=>op.deckId),ids);assert.deepEqual(draft.affectedDeckIds,ids);
 assert.equal(draft.affectedCardIds.length,count);assert.equal(draft.affectedNoteIds.length,count);
 assert.equal(JSON.parse(outputJson).affectedCardIds.length,count);assert.deepEqual(fixture.writes,[]);
});

test('duplicate and parent/child selections merge independent of order, while shared notes count once',async()=>{
 for(const ids of [[111,11,12,11],[11,12,111]]){
  const {registry,scope}=harness(2);fixture.tree.children[0].children=[deck(111,'Child')];scope.registerReadableDeckIds([111]);
  fixture.cards.push({id:300,noteId:200,deckId:111,originalDeckId:0});
  const {draft}=await registry.execute(call(ids));
  assert.deepEqual(draft.operations.map(op=>op.deckId),[11,12]);assert.deepEqual(draft.affectedDeckIds,[11,111,12]);
  assert.deepEqual(draft.affectedCardIds,[100,300,101]);assert.deepEqual(draft.affectedNoteIds,[200,201]);
  const result=await save(draft);assert.equal(result.status,'completed');assert.deepEqual(fixture.writes,[[11],[12]]);
 }
});

test('ID searches avoid wildcard names and distinguish normal-deck borrowed cards from filtered-deck returns',async()=>{
 const {registry}=harness(2);fixture.tree.children[0].name='* [odd] "name"';
 fixture.cards[1].originalDeckId=11;
 const {draft}=await registry.execute(call([11]));assert.deepEqual(fixture.queries,['did:11']);
 assert.deepEqual(draft.affectedCardIds,[100,101]);assert.deepEqual(draft.affectedDeckIds,[11]);
 fixture.tree.children[0].filtered=true;
 const filtered=await registry.execute(call([11],'filtered'));assert.match(filtered.draft.summary,/归还/);
 assert.deepEqual(filtered.draft.affectedCardIds,[100]);
});

test('empty decks may be proposed and deleted without invented card IDs',async()=>{
 const {registry}=harness(2);fixture.cards=[];const {draft}=await registry.execute(call([11,12]));
 assert.deepEqual(draft.affectedCardIds,[]);assert.deepEqual(draft.affectedNoteIds,[]);
 assert.equal((await save(draft)).status,'completed');
});

test('empty, mistyped, undiscovered and vanished deck IDs identify the failing field and reason',async()=>{
 const {registry,scope}=harness(2);
 for(const [ids,code,path] of [[[],'invalid_value','deckIds'],[[11,'12'],'invalid_value','deckIds[1]'],
  [[11,99],'id_out_of_scope','deckIds[1]']]){
  await assert.rejects(registry.execute(call(ids)),e=>e.code===code&&e.path===path&&e.detailMessage.length>20);
 }
 scope.registerReadableDeckIds([99]);
 await assert.rejects(registry.execute(call([11,99])),e=>e.code==='deck_not_found'&&e.path==='deckIds[1]'&&e.detailMessage.includes('99'));
 assert.deepEqual(fixture.writes,[]);assert.ok((await registry.execute(call([11,12]))).draft);
});

test('combined card limit is enforced across all selected decks, and failed proposal IDs can be reused',async()=>{
 const {registry,scope}=harness(2);scope.configureBatchLimit(1);
 await assert.rejects(registry.execute(call([11,12])),e=>e.code==='tool_batch_too_large'&&e.path==='deckIds'&&e.detailMessage.includes('2 cards'));
 scope.configureBatchLimit(2);assert.ok((await registry.execute(call([11,12]))).draft);
 await assert.rejects(registry.execute(call([11,12])),e=>e.code==='duplicate_draft_id');assert.deepEqual(fixture.writes,[]);
 const hard=harness(2);fixture.cards=Array.from({length:1100},(_,i)=>({id:i+1,noteId:i+1,deckId:i<600?11:12,originalDeckId:0}));
 await assert.rejects(hard.registry.execute(call([11,12])),e=>e.code==='high_risk_batch_too_large'&&e.path==='deckIds');
 assert.deepEqual(fixture.writes,[]);
});

test('multiple-deck deletion still requires two distinct confirmation tokens',async()=>{
 const {registry}=harness(2);const {draft}=await registry.execute(call([11,12]));const executor=new AgentDraftExecutor();
 const prepared=await executor.prepare(draft);
 await assert.rejects(executor.executeOrdinary(prepared,prepared.firstToken),/ordinary_execution_not_allowed/);
 await assert.rejects(executor.executeHighRisk(prepared,prepared.firstToken,prepared.firstToken),/confirmation_tokens_not_distinct/);
 assert.deepEqual(fixture.writes,[]);
 const second=executor.authorizeHighRisk(prepared,prepared.firstToken);
 assert.equal((await executor.executeHighRisk(prepared,prepared.firstToken,second)).status,'completed');
 assert.deepEqual(fixture.writes,[[11],[12]]);
});

for(const when of ['prepare','execute'])test(`a changed card identity with unchanged deck counts blocks deletion at ${when}`,async()=>{
 const {registry}=harness(2);const {draft}=await registry.execute(call([11,12]));const executor=new AgentDraftExecutor();
 let prepared;
 if(when==='execute')prepared=await executor.prepare(draft);
 fixture.cards[1]={...fixture.cards[1],id:999,noteId:888};
 if(when==='prepare')await assert.rejects(executor.prepare(draft),/draft_impact_changed/);
 else {const second=executor.authorizeHighRisk(prepared,prepared.firstToken);
  await assert.rejects(executor.executeHighRisk(prepared,prepared.firstToken,second),/draft_impact_changed/);}
 assert.equal(draft.status,'conflict');assert.deepEqual(fixture.writes,[]);
});

test('partial failure retries only remaining roots with their exact descendant/card/note impact',async()=>{
 const {registry,scope}=harness(2);fixture.tree.children[1].children=[deck(121,'Child')];scope.registerReadableDeckIds([121]);
 fixture.cards.push({id:301,noteId:201,deckId:121,originalDeckId:0});
 const {draft}=await registry.execute(call([11,12]));fixture.failed=[12];const result=await save(draft);
 assert.equal(result.status,'partial');assert.deepEqual(fixture.writes,[[11]]);
 const retry=buildFailedOperationsRetryDraft(draft,result,'retry');assert.deepEqual(retry.operations.map(op=>op.deckId),[12]);
 assert.deepEqual(retry.affectedDeckIds,[12,121]);assert.deepEqual(retry.affectedCardIds,[101,301]);assert.deepEqual(retry.affectedNoteIds,[201]);
 fixture.failed=[];assert.equal((await save(retry)).status,'completed');assert.deepEqual(fixture.writes,[[11],[12]]);
});

test('declared deck batches match the implementation; deliberate single-note-type deletion has a specific diagnostic',()=>{
 const tools=agentFunctionTools(100,'assistant');const deckTool=tools.find(t=>t.name==='propose_delete_deck');
 assert.equal(JSON.parse(deckTool.parametersJson).properties.deckIds.minItems,1);
 assert.equal(JSON.parse(deckTool.exampleArgumentsJson).deckIds.length,2);
 const noteType=tools.find(t=>t.name==='propose_delete_note_type');assert.equal(JSON.parse(noteType.parametersJson).properties.notetypeIds.maxItems,1);
 assert.throws(()=>decodeAgentToolArguments('propose_delete_note_type',JSON.stringify({notetypeIds:[1,2],draftId:'x',reason:'x'})),
  e=>e.code==='invalid_value'&&e.path==='notetypeIds'&&e.detailMessage.includes('exactly one'));
});

test('child-only drafts show the full path and ancestor renames invalidate confirmation',async()=>{
 const {registry,scope}=harness(2);fixture.tree.children[0].name='Four Levels';
 fixture.tree.children[0].children=[deck(111,'same name')];fixture.tree.children[1].children=[deck(121,'same name')];
 scope.registerReadableDeckIds([111,121]);
 const {draft}=await registry.execute(call([111,121]));assert.match(draft.summary,/Four Levels::same name/);
 assert.equal(JSON.parse(draft.operations[0].after).name,'Four Levels::same name');
 fixture.tree.children[0].name='Renamed';await assert.rejects(new AgentDraftExecutor().prepare(draft),/draft_impact_changed/);
 assert.deepEqual(fixture.writes,[]);
});

test('real Runner returns actionable field diagnostics and the model can correct a batch into one pending draft',async()=>{
 for(const [badIds,stage,path] of [[[],'arguments','deckIds'],[[11,99],'execution','deckIds[1]']]){
  const {registry}=harness(2);const runner=new AgentRunner(registry);const requests=[];const events=[];
  const rounds=[[call(badIds)],[{...call([11,12]),id:'corrected'}]];
  runner.createSession=(_provider,request,observer)=>({async start(){requests.push(structuredClone(request));
   for(const toolCall of rounds.shift())observer.onEvent({kind:'tool_call',text:'',toolCall,toolTrace:null,source:null,errorCode:''});
  },cancel(){}});
  const request={apiKey:'test',baseUrl:'https://example.test',model:'test',instructions:'',input:[],
   functionTools:agentFunctionTools(100,'assistant'),searchMode:'off',requiresWebSearch:false,requiresSearchEvidence:false,
   requiresDraft:false,expectedDraftCount:0,reasoningEffort:'',maxOutputTokens:1024};
  const result=await runner.run('custom',request,{onEvent:e=>events.push(e)});
  const diagnostic=JSON.parse(requests[1].input.find(item=>item.kind==='function_call_output').output);
  assert.equal(diagnostic.failureStage,stage);assert.equal(diagnostic.errorPath,path);assert.ok(diagnostic.message.length>40);
  assert.deepEqual(diagnostic.receivedKeys,['deckIds','draftId','reason']);assert.deepEqual(diagnostic.allowedKeys,['deckIds','draftId','reason']);
  assert.equal(result.drafts.length,1);assert.equal(result.drafts[0].operations.length,2);assert.equal(result.drafts[0].status,'pending');
  assert.deepEqual(fixture.writes,[]);
 }
});
