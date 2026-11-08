// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { AiContentExportPolicy, AI_CONTENT_PROVENANCE_KEY, AI_CONTENT_EXPORT_BLOCKED, AI_CONTENT_EXPORT_SUPPORT } from '../../entry/src/main/ets/model/AiContentExportPolicy.ts';
import { loadPlatformModule } from './platform-module-harness.mjs';
import { deckScopeSearch } from '../../entry/src/main/ets/model/DeckScope.ts';
import { DataTransferSession } from '../../entry/src/main/ets/model/home/DataTransferSession.ts';

const note = (guid='generated', id=1, notetypeId=2) => ({id,guid,notetypeId,fields:['Front','Back'],tags:[]});
function fixture() {
  const state = {config:{},scope:null,notes:[],readError:false,writeError:false};
  const backend = {read:async()=>{if(state.readError)throw Error('read failed');return JSON.stringify(state.config);},
    write:async value=>{if(state.writeError)throw Error('write failed');state.config[AI_CONTENT_PROVENANCE_KEY]=JSON.parse(value);},
    notes:async scope=>{state.scope=scope;return state.notes;}};
  return {state,backend,policy:new AiContentExportPolicy(backend)};
}
test('AI provenance survives reopening and edits to fields/tags; manual ranges remain exportable', async()=>{
  const h=fixture();await h.policy.recordNotes([note()]);
  const reopened=new AiContentExportPolicy(h.backend);
  h.state.notes=[{...note(),fields:['Edited manually',''],tags:['anything']}];
  await assert.rejects(reopened.assertExport({deckId:3}),new RegExp(AI_CONTENT_EXPORT_BLOCKED));
  h.state.notes=[note('manual',10)];await reopened.assertExport({deckId:4});
  assert.deepEqual(h.state.scope,{deckId:4});
  h.state.notes=[];await reopened.assertExport({});
});
test('template provenance blocks notes using the type; concurrent source writes merge without losing entries',async()=>{
  const h=fixture();await Promise.all([h.policy.recordNotes([note('one')]),h.policy.recordNotes([note('two')]),h.policy.recordNotetypes([9])]);
  assert.deepEqual(h.state.config[AI_CONTENT_PROVENANCE_KEY],{version:1,noteGuids:['one','two'],notetypeIds:[9]});
  h.state.notes=[note('manual',3,9)];await assert.rejects(h.policy.assertExport({}),new RegExp(AI_CONTENT_EXPORT_BLOCKED));
});
test('source read/write failures never become a successful unmarked AI save or an allowed export',async()=>{
  const h=fixture();h.state.writeError=true;await assert.rejects(h.policy.recordNotes([note()]),/write failed/);
  h.state.writeError=false;await h.policy.recordNotes([note()]);
  h.state.readError=true;await assert.rejects(h.policy.assertExport({}),/read failed/);
  h.state.readError=false;h.state.config[AI_CONTENT_PROVENANCE_KEY]={version:2};
  await assert.rejects(h.policy.assertExport({}),/provenance_invalid/);
  await assert.rejects(h.policy.recordNotes([{...note(),guid:''}]),/provenance_invalid/);
});
test('untracked legacy collections are unchanged and do not require scanning or guessing content',async()=>{
  const h=fixture();h.backend.notes=async()=>{throw Error('unexpected scan');};await h.policy.assertExport({});
});
test('all four file exporters stop before allocating files or calling Core; the collection stays open',async()=>{
  const scopes=[],events=[];
  const deps={aiContentExportPolicy:{assertExport:async scope=>{scopes.push(scope);throw Error(AI_CONTENT_EXPORT_BLOCKED);}},
    后端会话:{获取实例:()=>{events.push('session');return {};}}};
  const api=loadPlatformModule('backend/数据迁移服务.ts','({导出牌组,导出集合,exportText,exportSubset})',deps);
  for(const run of [()=>api.导出牌组('/data',3,{}),()=>api.导出集合('/data',{}),
    ()=>api.exportText('/data',3,{kind:'notes'}),()=>api.exportSubset('/data',{mode:'cards',ids:[7]},'apkg',true,true)])
    await assert.rejects(run(),new RegExp(AI_CONTENT_EXPORT_BLOCKED));
  assert.deepEqual(scopes,[{deckId:3},{},{deckId:3},{mode:'cards',ids:[7]}]);assert.deepEqual(events,[]);
});
test('adapter includes children with escaped deck names, maps card subsets to notes and rejects missing targets',async()=>{
  const notes=new Map([[1,note('ai',1)],[2,note('manual',2)]]),queries=[];
  const Backend=loadPlatformModule('backend/AiContentExportService.ts','AnkiAiContentExportBackend',{
    AiContentExportPolicy,AI_CONTENT_PROVENANCE_KEY,
    配置服务:class{},牌组服务:class{async 获取牌组树(){return {deckId:0,name:'Root',children:[{deckId:3,name:'A*',children:[{deckId:4,name:'B',children:[]}]}]};}},
    搜索服务:class{async 搜索笔记(request){queries.push(request.search);return [1,2];}},
    笔记服务:class{async 获取笔记(id){return notes.get(id);}},卡片服务:class{async 获取卡片(id){return {noteId:id===7?1:2};}},
    deckScopeSearch
  });
  const backend=new Backend();
  assert.equal((await backend.notes({deckId:4})).length,2);assert.deepEqual(queries,['deck:"A\\*::B"']);
  assert.deepEqual(await backend.notes({mode:'cards',ids:[7,7]}),[note('ai',1)]);
  await assert.rejects(backend.notes({deckId:99}),/deck_not_found/);
  await assert.rejects(backend.notes({mode:'cards',ids:[]}),/invalid_export_subset/);
});
test('blocked transfer stays visible with an explanation and never reports success or commits',async()=>{
  let last,success=0,commits=0;
  const session=new DataTransferSession({exportData:async()=>{throw Error(AI_CONTENT_EXPORT_BLOCKED);},committed:()=>commits++},s=>last=s,async()=>{},()=>success++);
  session.open('exportDeck',3,false);await session.execute({kind:'exportDeck',deckId:3,options:{}});
  assert.equal(last.error,AI_CONTENT_EXPORT_BLOCKED);assert.equal(last.visible,true);assert.equal(last.phase,'idle');
  assert.equal(success,0);assert.equal(commits,0);
  const raw=readFileSync(new URL('../../entry/src/main/resources/base/element/string.json',import.meta.url),'utf8');
  const zh=JSON.parse(raw).string.find(x=>x.name===last.error).value;
  assert.match(zh,/根据《人工智能生成合成内容标识办法》/);assert.match(zh,/本应用暂不支持导出/);
  assert.equal(AI_CONTENT_EXPORT_SUPPORT.errorKey,last.error);
});

test('the live JIDE structure exposes the same restriction and its legacy boundary',async()=>{
  const {buildAgentAppStructure}=await import('../../entry/src/main/ets/model/agent/AgentAppStructure.ts');
  const structure=buildAgentAppStructure({simple:true,agent:true,cloudDeck:false,themeHasTextures:false},'app','',key=>key,[],[],[]);
  assert.deepEqual(structure.aiContentExport,AI_CONTENT_EXPORT_SUPPORT);
});

test('actual AI create and rewrite executors persist provenance before saving; failed provenance prevents the content write',async()=>{
  const {componentMethods}=await import('./sync-panel-harness.mjs');
  const source=readFileSync(new URL('../../entry/src/main/ets/backend/agent/AgentDraftExecutor.ets',import.meta.url),'utf8');
  for(const mode of ['create','update'])for(const fail of [false,true]){
    const h=fixture(),events=[];
    h.backend.write=async value=>{events.push('provenance');if(fail)throw Error('provenance write failed');h.state.config[AI_CONTENT_PROVENANCE_KEY]=JSON.parse(value);};
    const Executor=componentMethods(source,['executeOrdinaryOperations'],{aiContentExportPolicy:h.policy});
    const executor=new Executor(),saved=note();
    executor.notes={新建笔记:async()=>saved,获取笔记:async()=>saved,
      添加笔记:async()=>{events.push('note');return 1;},更新笔记:async()=>{events.push('note');}};
    executor.emptyResult=()=>({items:[]});executor.groupCreateOperations=operations=>[{noteId:0,operations}];
    executor.appendImages=async()=>{};executor.failureWithMediaCompensation=async error=>error;
    executor.appendSuccess=result=>result.items.push({succeeded:true});
    executor.appendFailure=(result,_kind,_id,error)=>result.items.push({succeeded:false,error:error.message});
    const result=await executor.executeOrdinaryOperations({id:'draft',affectedNoteIds:[1],affectedDeckIds:[3],affectedNotetypeIds:[2],
      operations:[{kind:mode==='create'?'create_note':'update_field',noteId:1,fieldOrd:0,after:'AI content'}]});
    assert.deepEqual(events,fail?['provenance']:['provenance','note']);
    assert.equal(result.items[0].succeeded,!fail);
    if(!fail){h.state.notes=[saved];await assert.rejects(h.policy.assertExport({}),new RegExp(AI_CONTENT_EXPORT_BLOCKED));}
  }
});
