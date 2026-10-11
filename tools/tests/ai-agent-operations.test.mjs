// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { loadPlatformModule } from './platform-module-harness.mjs';
import * as operations from '../../entry/src/main/ets/model/agent/AgentOperations.ts';
import { AgentOperationHosts } from '../../entry/src/main/ets/model/agent/AgentOperationHost.ts';
import { agentOperationPreview } from '../../entry/src/main/ets/model/agent/AgentOperationPreview.ts';
import { agentFunctionTools } from '../../entry/src/main/ets/model/agent/AgentToolCatalog.ts';
import { toolRiskOf } from '../../entry/src/main/ets/model/agent/AgentPolicy.ts';
import { AgentConfirmationManager } from '../../entry/src/main/ets/model/agent/AgentConfirmation.ts';
import { buildFailedOperationsRetryDraft } from '../../entry/src/main/ets/model/agent/AgentDraftRetry.ts';
import * as sidebar from '../../entry/src/main/ets/model/BrowserSidebar.ts';
import * as marking from '../../entry/src/main/ets/model/CardMarking.ts';
import { cloneNotetypeJson } from '../../entry/src/main/ets/model/NotetypeManagement.ts';
import { serializeNotetypeFields } from '../../entry/src/main/ets/model/NotetypeFieldDraft.ts';
import { filteredDeckPatch } from '../../entry/src/main/ets/model/FilteredDeckCommands.ts';
import { customStudyValueValid } from '../../entry/src/main/ets/model/CustomStudyOptions.ts';
import { DeckOptionsPresets } from '../../entry/src/main/ets/model/DeckOptionsPresets.ts';
import * as configSave from '../../entry/src/main/ets/model/DeckConfigSave.ts';
import { emptyDeckConfigSettings } from '../../entry/src/main/ets/proto/messages/DeckConfigMessages.ts';
import * as scheduler from '../../entry/src/main/ets/proto/messages/SchedulerMessages.ts';
import { fsrsOptimizeInput } from '../../entry/src/main/ets/model/FsrsOptions.ts';
import { validateSchedulingScript } from '../../entry/src/main/ets/model/CustomScheduling.ts';
import { agentPreferenceDefinitions, agentWritablePreferenceIds, decodeWritablePreference } from '../../entry/src/main/ets/model/agent/AgentPreferenceSettings.ts';
import { collectionPreferenceEdits } from '../../entry/src/main/ets/model/agent/AgentMaintenanceTools.ts';
import { NoteDuplicateSession, initialDuplicateScanState } from '../../entry/src/main/ets/model/NoteDuplicateSession.ts';
import { DataTransferSession } from '../../entry/src/main/ets/model/home/DataTransferSession.ts';

function coreFixture() {
  const s={writes:[],version:1,templateRevision:0,saved:'{}',labels:'{}',notes:[{id:11,notetypeId:5,fields:['A','B'],tags:['source']},{id:12,notetypeId:5,fields:['A','C'],tags:[]}],
    cards:[{id:21,noteId:11,deckId:1,ctype:0,queue:0,due:10,flags:128},{id:22,noteId:12,deckId:1,ctype:0,queue:-1,due:20,flags:0},{id:23,noteId:12,deckId:1,ctype:2,queue:-2,due:10,flags:0}],
    type:JSON.stringify({id:5,name:'Basic',mod:1,usn:0,sortf:0,flds:[{ord:0,name:'Front',id:91,sticky:true},{ord:1,name:'Back',id:92}],tmpls:[{ord:0,name:'Card',qfmt:'{{Front}}',afmt:'{{Back}}'}],css:'preserved',unknown:{x:1}})};
  const config=id=>({id,name:'Preset '+id,mtimeSecs:0,usn:0,config:emptyDeckConfigSettings()});
  s.view={currentDeck:{configId:1,name:'Deck',parentConfigIds:[],limits:null},allConfigs:[{config:config(1),useCount:1},{config:config(2),useCount:2}],defaults:config(1),
    cardStateCustomizer:'old',schemaModified:false,newCardsIgnoreReviewLimit:false,fsrs:true,applyAllParentLimits:false,fsrsHealthCheck:true};
  const clone=value=>structuredClone(value); const write=(name,...args)=>{s.writes.push([name,...clone(args)]);s.version++;};
  class Cards {
    async 获取卡片(id){const c=s.cards.find(c=>c.id===id);if(!c)throw Error('card_missing');return clone(c);}
    async 设置标志(ids,flag){write('flag',ids,flag);for(const c of s.cards.filter(c=>ids.includes(c.id)))c.flags=(c.flags&~7)|flag;}
  }
  class Notes {
    async 获取笔记(id){return clone(s.notes.find(n=>n.id===id));}
    async 获取笔记的卡片(id){return s.cards.filter(c=>c.noteId===id).map(c=>c.id);}
    async 更新笔记(notes){write('notes',notes);for(const note of notes)s.notes[s.notes.findIndex(n=>n.id===note.id)]=clone(note);}
  }
  class Scheduler {
    async scheduleCardsAsNewDefaults(){return {restorePosition:true,resetCounts:false};}
    async scheduleCardsAsNew(ids,options){write('reset',ids,options);}
    async 设置到期日(ids,days){write('due',ids,days);}
    async 排序卡片(...args){write('reposition',...args);}
    async gradeNow(...args){write('grade',...args);}
    async 批量埋藏或暂停卡片(ids,mode){write('state',ids,mode);}
    async 恢复埋藏与暂停的卡片(ids){write('restore',ids);for(const c of s.cards.filter(c=>ids.includes(c.id)))c.queue=0;}
    async 获取自定义学习默认值(){return {extendNew:10,extendReview:20,tags:[]};}
    async 自定义学习(...args){write('custom',...args);}
    async customStudyByStateOrTags(...args){write('cram',...args);}
    async 清空过滤牌组(id){write('empty',id);}
    async 重建过滤牌组(id){write('rebuild',id);return 2;}
  }
  class Collection {
    async 获取撤销状态(){return {undo:'edit',redo:'',lastStep:s.version};}
    async 撤销(){write('undo');return {changed:true};}
    async 重做(){write('redo');return {changed:true};}
    async 检查数据库(){write('check_db');return ['ok'];}
  }
  class Search {
    async 搜索卡片(){return s.cards.map(c=>c.id);}
    async 搜索笔记(){return s.notes.map(n=>n.id);}
    async 构建搜索串(node){return 'tag:'+node.tag;}
    async 查找并替换(args){write('replace',args);return 2;}
  }
  class Tags {
    async 标签树(){return {name:'',children:[{name:'source',children:[]}]};}
    async 添加笔记标签(args){write('add_tags',args);return 1;}
    async 移除笔记标签(args){write('remove_tags',args);return 1;}
    async 重命名标签(args){write('rename_tag',args);return 2;}
    async 移除标签(name){write('delete_tag',name);return 2;}
    async 清除未用标签(){write('unused_tags');return 1;}
  }
  class Types {
    async 获取笔记类型旧版(){return s.type;}
    async 获取笔记类型名列表(){return [{id:5,name:'Basic'}];}
    async 添加笔记类型旧版(json){write('clone_type',JSON.parse(json));return 9;}
    async 更新笔记类型旧版(json,skip){write('type',JSON.parse(json),skip);s.type=json;}
    async impact(_id,_before,after){return {noteIds:[11,12],cardIds:[21,22,23],removedCardIds:JSON.parse(after).flds.length<2?[23]:[],movedCardIds:[]};}
  }
  class Decks {
    async 获取牌组树(){return {deckId:0,name:'',children:[{deckId:1,name:'Deck',children:[]},{deckId:2,name:'Other',children:[]}]};}
    async 获取或创建过滤牌组(id){return {id,name:id===0?'Filtered '+(++s.templateRevision):'Filtered',allowEmpty:false,config:{reschedule:true,searchTerms:[{search:'is:due',limit:100,order:0}],previewDelay:0,previewAgainSecs:0,previewHardSecs:0,previewGoodSecs:0}};}
    async 添加或更新过滤牌组(deck){write('filtered',deck);return 3;}
  }
  class Configs {async 获取牌组配置编辑视图(){return clone(s.view);}async 更新牌组配置(value){write('config',value);s.view.cardStateCustomizer=value.cardStateCustomizer;}}
  class Sidebar {async savedSearches(){return s.saved;}async saveSavedSearches(json){write('saved',json);s.saved=json;}}
  class Marking extends Cards {async setFlag(ids,flag){await this.设置标志(ids,flag);}async labels(){return s.labels;}async saveLabels(json){write('labels',json);s.labels=json;}}
  class Fsrs {async presetSearch(id){return id===2?'did:1,2 -is:suspended':'did:1 -is:suspended';}async optimize(input){write('optimize',input);return {params:[1,2],healthCheckPassed:true,fsrsItems:2};}}
  const dependencies={...operations,...sidebar,...marking,...scheduler,...configSave,validateSchedulingScript,cloneNotetypeJson,serializeNotetypeFields,filteredDeckPatch,customStudyValueValid,DeckOptionsPresets,fsrsOptimizeInput,
    卡片服务:Cards,笔记服务:Notes,调度器服务:Scheduler,集合服务:Collection,搜索服务:Search,标签服务:Tags,笔记类型服务:Types,牌组服务:Decks,牌组配置服务:Configs,AnkiBrowserSidebar:Sidebar,AnkiCardMarking:Marking,FsrsService:Fsrs,
    卡片渲染服务:class {async 获取空卡报告(){return {笔记列表:[{笔记ID:11,卡片IDs:[21],删除后无卡:true}]};}},NoteDuplicateSession,initialDuplicateScanState};
  const api=loadPlatformModule('backend/agent/CoreAgentOperations.ts','({CoreAgentOperations,operationSnapshot})',dependencies);
  return {s,backend:new api.CoreAgentOperations(),dependencies,operationSnapshot:api.operationSnapshot};
}

test('all operation definitions are discoverable in every mode, strictly validated and localized',()=>{
  for(const mode of ['assistant','edit','create']) {
    const catalog=agentFunctionTools(100,mode);
    for(const tool of operations.agentOperationDefinitions()){
      assert.equal(catalog.filter(t=>t.name===tool.name).length,1);assert.equal(toolRiskOf(tool.name),tool.risk);
      assert.doesNotThrow(()=>operations.decodeOperationArguments(tool.name,tool.exampleArgumentsJson));
      assert.throws(()=>operations.decodeOperationArguments(tool.name,JSON.stringify({...JSON.parse(tool.exampleArgumentsJson),rpc:4})),/invalid_operation_argument/);
      for(const locale of ['base','en_US'])assert.ok(JSON.parse(fs.readFileSync(`entry/src/main/resources/${locale}/element/string.json`)).string.some(item=>item.name===tool.titleKey));
    }
  }
  for(const json of ['null','[]','{"cardIds":[1,1]}','{"cardIds":[0]}','{"cardIds":[1.1]}'])assert.throws(()=>operations.decodeOperationArguments('get_card_states',json));
});
const cases=[
  ['propose_reset_cards',{cardIds:[21],restorePosition:true,resetCounts:false},'reset'],
  ['propose_set_due_date',{cardIds:[21],days:'1-3'},'due'],
  ['propose_reposition_cards',{cardIds:[21],start:10,step:2,random:true,shift:true},'reposition'],
  ['propose_grade_cards',{cardIds:[21],rating:3},'grade'],
  ['propose_set_card_flag',{cardIds:[21],flag:7},'flag'],
  ['propose_update_note_tags',{noteIds:[11],operation:'replace',value:''},'notes'],
  ['propose_update_note_tags',{noteIds:[11],operation:'add',value:'tag'},'add_tags'],
  ['propose_update_note_tags',{noteIds:[11],operation:'remove',value:'tag'},'remove_tags'],
  ['propose_rename_tag',{name:'source',value:'renamed'},'rename_tag'],
  ['propose_delete_tag',{name:'source'},'delete_tag'],['propose_clear_unused_tags',{},'unused_tags'],
  ['propose_saved_search',{operation:'save',name:'Mine',query:'is:due'},'saved'],
  ['propose_find_replace',{noteIds:[11],field:'Front',find:'A',replace:'B',regex:false,matchCase:true},'replace'],
  ['propose_collection_history',{operation:'undo'},'undo'],['propose_collection_history',{operation:'redo'},'redo'],
  ['propose_check_database',{},'check_db'],['propose_flag_name',{flag:1,name:'Important'},'labels'],
  ['propose_clone_notetype',{notetypeId:5,name:'Copy'},'clone_type'],['propose_rename_notetype',{notetypeId:5,name:'Renamed'},'type'],
  ['propose_edit_notetype_structure',{notetypeId:5,changesJson:JSON.stringify([{ord:1,name:'Answer'},{ord:0,name:'Question'},{ord:null,name:'Extra'}])},'type'],
  ['propose_create_filtered_deck',{name:'Filtered',changesJson:'{"reschedule":false}'},'filtered'],
  ['propose_maintain_filtered_deck',{deckId:1,operation:'empty_filtered'},'empty'],['propose_maintain_filtered_deck',{deckId:1,operation:'rebuild_filtered'},'rebuild'],
  ...['extend_new','extend_review','forgotten_days','review_ahead','preview_new'].map(operation=>['propose_custom_study',{deckId:1,operation,value:'2'},'custom']),
  ['propose_custom_study',{deckId:1,operation:'state_or_tags',value:'{"kind":3,"cardLimit":20,"tagsToInclude":[],"tagsToExclude":[]}'},'cram'],
  ...['rename','clone','delete','assign'].map(operation=>['propose_manage_deck_preset',{deckId:1,presetId:2,operation,name:'Changed'},'config']),
  ['propose_custom_scheduling',{deckId:1,value:'states.good.normal.review.scheduledDays = 4;'},'config'],
  ['propose_optimize_fsrs',{deckId:1,scope:'all_presets'},'optimize']
];
for(const [name,args,command]of cases)test(name+' delegates '+command+' only after exact confirmation',async()=>{
  const {backend,s}=coreFixture();const coordinator=new operations.AgentOperationCoordinator(backend);
  const draft=await coordinator.propose(name,JSON.stringify(args));assert.equal(s.writes.length,0);
  await coordinator.check(draft);assert.equal(s.writes.length,0);
  const result=JSON.parse(await coordinator.execute(draft));assert.equal(result.status,'completed');assert.ok(s.writes.some(w=>w[0]===command));
  await assert.rejects(coordinator.execute(draft),/confirmation_mismatch/);
  assert.equal(buildFailedOperationsRetryDraft(draft,{failed:1,items:[{targetId:0,succeeded:false}]},'retry'),null);
});

test('mixed suspended/buried selection restores only the requested state and preserves other flag bits',async()=>{
  const {backend,s}=coreFixture();const snapshot=await backend.snapshot('propose_set_card_state',{cardIds:[22,23],operation:'unsuspend'});
  await backend.execute('propose_set_card_state',{cardIds:[22,23],operation:'unsuspend'},snapshot);
  assert.deepEqual(s.writes[0],['restore',[22]]);assert.equal(s.cards[2].queue,-2);
  await backend.execute('propose_set_card_flag',{cardIds:[21],flag:3},snapshot);assert.equal(s.cards[0].flags,131);
});
test('shift impact includes suspended new cards; field edits preserve original identities and unknown properties',async()=>{
  const {backend,s}=coreFixture();const snap=await backend.snapshot('propose_reposition_cards',{cardIds:[21],start:10,step:1,random:false,shift:true});
  assert.deepEqual(snap.cardIds,[21,22]);
  await assert.rejects(backend.snapshot('propose_reposition_cards',{cardIds:[23],start:0,step:1,random:false,shift:false}),/requires_new_cards/);
  const args={notetypeId:5,changesJson:'[{"ord":1,"name":"Answer"},{"ord":0,"name":"Front"}]'};
  await backend.execute('propose_edit_notetype_structure',args,await backend.snapshot('propose_edit_notetype_structure',args));
  const type=JSON.parse(s.type);assert.deepEqual(type.unknown,{x:1});assert.equal(type.css,'preserved');assert.equal(type.flds[0].id,92);assert.equal(type.flds[1].sticky,true);
});
test('renaming a different preset keeps the current assignment and confirms all shared decks',async()=>{
  const {backend,s}=coreFixture();const args={deckId:1,presetId:2,operation:'rename',name:'Renamed'};
  const snap=await backend.snapshot('propose_manage_deck_preset',args);assert.deepEqual(snap.deckIds,[1,2]);
  await backend.execute('propose_manage_deck_preset',args,snap);
  const request=s.writes.find(w=>w[0]==='config')[1];assert.equal(request.configs.at(-1).id,1);assert.equal(request.configs.find(c=>c.id===2).name,'Renamed');
});
test('stale, mutated and restored proposals fail; concurrent accepts consume the operation only once',async()=>{
  const {backend,s}=coreFixture();const coordinator=new operations.AgentOperationCoordinator(backend);
  const make=()=>coordinator.propose('propose_reset_cards','{"cardIds":[21],"restorePosition":false,"resetCounts":false}');
  const stale=await make();s.version++;await assert.rejects(coordinator.execute(stale),/changed_since_proposal/);assert.equal(s.writes.length,0);
  const edited=await make();edited.summary='different action';await assert.rejects(coordinator.execute(edited),/confirmation_mismatch/);
  const restored=await make();await assert.rejects(new operations.AgentOperationCoordinator(backend).execute(restored),/confirmation_mismatch/);
  const draft=await make();const results=await Promise.allSettled([coordinator.execute(draft),coordinator.execute(draft)]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(s.writes.length,1);
});
test('the actual DraftExecutor requires two app tokens for reset and returns the backend report',async()=>{
  const {backend,dependencies,s}=coreFixture();const coordinator=new operations.AgentOperationCoordinator(backend);
  const Executor=loadPlatformModule('backend/agent/AgentDraftExecutor.ets','AgentDraftExecutor',{...dependencies,AgentConfirmationManager,
    agentOperationCoordinator:coordinator,媒体服务:class{},WikimediaImageService:class{}});
  const executor=new Executor();const draft=await coordinator.propose('propose_reset_cards','{"cardIds":[21],"restorePosition":true,"resetCounts":true}');
  const prepared=await executor.prepare(draft);await assert.rejects(executor.executeOrdinary(prepared,prepared.firstToken),/not_allowed/);assert.equal(s.writes.length,0);
  const second=executor.authorizeHighRisk(prepared,prepared.firstToken);const result=await executor.executeHighRisk(prepared,prepared.firstToken,second);
  assert.equal(result.status,'completed');assert.equal(JSON.parse(result.items[0].resultJson).status,'completed');
});
test('read paths expose actual states, saved searches, empty IDs, presets and custom-study defaults',async()=>{
  const {backend}=coreFixture();
  for(const [name,args]of [['get_card_states',{cardIds:[21]}],['get_saved_searches',{}],['get_collection_history',{}],['get_flag_names',{}],['get_deck_presets',{deckId:1}],['get_custom_scheduling',{deckId:1}],['get_custom_study_defaults',{deckId:1}],['get_empty_cards',{offset:0,limit:1}]])assert.ok(JSON.parse(await backend.read(name,args)),name);
  assert.equal(JSON.parse(await backend.read('get_empty_cards',{offset:0,limit:1})).rows[0].笔记ID,11);
  assert.equal(JSON.parse(await backend.read('get_card_states',{cardIds:[22]})).cards[0].queue,-1);
  assert.equal(JSON.parse(await backend.read('get_custom_scheduling',{deckId:1})).script,'old');
});
test('all newly writable settings reject arbitrary keys and preserve read-only observations',()=>{
  const values={language:'en',study_quick_answer:'2',graph_preferences:'{"calendarFirstDayOfWeek":1,"cardCountsSeparateInactive":true,"futureDueShowBacklog":false}',card_text_size:'120'};
  for(const definition of agentPreferenceDefinitions())if(definition.id!=='media_sync_pending')values[definition.id]=definition.encoding==='string_boolean'?'false':definition.allowedValues[0]??String(definition.defaultValue);
  values.card_text_size='120';for(const id of agentWritablePreferenceIds())assert.doesNotThrow(()=>decodeWritablePreference(id,values[id]),id);
  for(const id of ['system_dark','media_sync_pending','sync_hkey'])assert.throws(()=>decodeWritablePreference(id,'false'));
  assert.equal(collectionPreferenceEdits('{"rollover":4,"learnAheadSecs":1200,"timeLimitSecs":300,"showRemaining":true,"showIntervals":false}').length,5);
  assert.throws(()=>collectionPreferenceEdits('{"rollover":24}'));assert.throws(()=>decodeWritablePreference('graph_preferences','{}'));
});
test('workflow hosts reject replaced owners and wait for actual completion rather than opening a panel',async()=>{
  const hosts=new AgentOperationHosts();let complete;const host={snapshot:()=> 'session1',execute:()=>hosts.wait('sync',()=>{})};hosts.register('home',host);
  const task=hosts.execute('home','propose_sync',{},'session1').then(value=>{complete=value;});await Promise.resolve();assert.equal(complete,undefined);
  hosts.finish('sync','{"status":"cancelled"}');await task;assert.equal(JSON.parse(complete).status,'cancelled');
  hosts.register('home',{snapshot:()=> 'session2',execute:async()=>''});hosts.unregister('home',host);assert.equal(hosts.read('home'),'session2');assert.throws(()=>hosts.execute('home','propose_sync',{},'session1'),/host_changed/);
});
test('confirmation preview localizes operation arguments without exposing internal snapshots or tokens',async()=>{
  const {backend}=coreFixture();const draft=await new operations.AgentOperationCoordinator(backend).propose('propose_reset_cards','{"cardIds":[21],"restorePosition":true,"resetCounts":false}');
  const rows=agentOperationPreview(draft.operations[0],key=>key);assert.ok(rows.some(r=>r.title==='agent_operation_argument_cardIds'&&r.after==='21'));
  assert.ok(!JSON.stringify(rows).includes('lastStep'));assert.ok(!JSON.stringify(rows).includes('baseline'));
});

test('completed operation results can be read in full pages; a failed write is consumed and reported as unknown',async()=>{
  const {backend}=coreFixture();const coordinator=new operations.AgentOperationCoordinator(backend);
  const draft=await coordinator.propose('propose_reset_cards','{"cardIds":[21],"restorePosition":false,"resetCounts":false}');
  assert.throws(()=>coordinator.read('get_operation_result',JSON.stringify({name:draft.id})),/unavailable/);
  const output=await coordinator.execute(draft);let offset=0,text='';
  do {const page=JSON.parse(await coordinator.read('get_operation_result',JSON.stringify({name:draft.id,offset,limit:15})));text+=page.resultText;offset=page.nextOffset;}while(offset!==null);
  assert.equal(text,output);
  const failed=await coordinator.propose('propose_reset_cards','{"cardIds":[21],"restorePosition":false,"resetCounts":false}');
  backend.execute=async()=>{throw Error('lost connection after send');};await assert.rejects(coordinator.execute(failed),/lost connection/);
  const page=JSON.parse(await coordinator.read('get_operation_result',JSON.stringify({name:failed.id})));
  assert.equal(JSON.parse(page.resultText).status,'unknown');await assert.rejects(coordinator.execute(failed),/confirmation_mismatch/);
});
