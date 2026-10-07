// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { FilteredDeckCommands, filteredDeckPatch, FILTERED_DECK_ACTIONS } from '../../entry/src/main/ets/model/FilteredDeckCommands.ts';
import { decode过滤牌组更新 as decode, encode过滤牌组更新 as encode } from '../../entry/src/main/ets/proto/messages/DeckMessages.ts';
import { AutoSyncScheduler } from '../../entry/src/main/ets/model/AutoSyncScheduler.ts';
import { SyncActivity } from '../../entry/src/main/ets/model/SyncSettings.ts';
import { maintenancePreviewRows } from '../../entry/src/main/ets/model/agent/AgentMaintenancePreview.ts';
import { createAgentAction } from '../../entry/src/main/ets/model/agent/AgentAction.ts';
import { APP_INTERFACE_SURFACES, deckDetailsMoreItems } from '../../entry/src/main/ets/model/AppInterface.ts';
import { loadPlatformModule, loadComponentLogic } from './platform-module-harness.mjs';
import { readFileSync } from 'node:fs';
import { FILTERED_DECK_ORDERS, filteredDeckOrderTitleKey } from '../../entry/src/main/ets/model/FilteredDeckOptions.ts';
import { 过滤牌组排序 } from '../../entry/src/main/ets/proto/messages/DeckMessages.ts';
import { agentMaintenanceTools, decodeMaintenanceArguments, collectionPreferenceEdits } from '../../entry/src/main/ets/model/agent/AgentMaintenanceTools.ts';
import { AgentActionLedger } from '../../entry/src/main/ets/model/agent/AgentAction.ts';
import { toolRiskOf } from '../../entry/src/main/ets/model/agent/AgentPolicy.ts';
import { parseAgentToolJsonObject } from '../../entry/src/main/ets/model/agent/AgentToolSchemas.ts';
import { AgentApprovalRequired } from '../../entry/src/main/ets/model/agent/AgentAction.ts';
import { 协议写入器 as Writer } from '../../entry/src/main/ets/proto/core/ProtoWriter.ts';

const deck=()=>({id:42,name:'Synthetic filtered',allowEmpty:false,preserved:[new Uint8Array([152,6,1])],config:{reschedule:true,
  searchTerms:[{search:'tag:sample',limit:20,order:6,preserved:[new Uint8Array([160,6,7])]}],previewDelay:10,previewAgainSecs:60,previewHardSecs:120,previewGoodSecs:0,
  preserved:[new Uint8Array([26,4,0,0,128,63]),new Uint8Array([152,6,3])]}});
const strings=locale=>new Map(JSON.parse(readFileSync(new URL(`../../entry/src/main/resources/${locale}/element/string.json`,import.meta.url),'utf8')).string.map(item=>[item.name,item.value]));

test('filtered confirmation separates search, card limit and translated sorting instead of raw configuration',()=>{
  const before=deck(),resources=strings('base');
  const action=createAgentAction('filtered_deck_change',JSON.stringify({deckId:42,before:Array.from(encode(before)),
    changesJson:JSON.stringify({searchTerms:[{search:'tag:sample',limit:5,order:6}]})}));
  const rows=maintenancePreviewRows(action,key=>resources.get(key));
  assert.deepEqual(rows,[{title:'仅此牌组',before:'',after:'Synthetic filtered'},
    {title:'搜索条件',before:'',after:'tag:sample'}, {title:'数量上限',before:'20',after:'5'},
    {title:'排序方式',before:'',after:resources.get('filtered_deck_order_due')}]);
});

test('filtered confirmation identifies removed second search and describes empty search as collection scope',()=>{
  const before=deck();before.config.searchTerms.push({search:'tag:second',limit:10,order:1});
  const action=createAgentAction('filtered_deck_change',JSON.stringify({deckId:42,before:Array.from(encode(before)),
    changesJson:JSON.stringify({searchTerms:[{search:'',limit:30,order:5}]})}));
  for(const locale of ['base','en_US']) {
    const resources=strings(locale),rows=maintenancePreviewRows(action,key=>resources.get(key));
    assert.equal(rows[1].title,resources.get('filtered_deck_search_label')+' 1');
    assert.equal(rows[1].before,'tag:sample');assert.equal(rows[1].after,resources.get('deck_scope_collection'));
    assert.equal(rows[3].before,resources.get('filtered_deck_order_due'));assert.equal(rows[3].after,resources.get('filtered_deck_order_added'));
    assert.equal(rows[4].title,resources.get('filtered_deck_search_label')+' 2');
    assert.equal(rows[4].before,'tag:second');assert.equal(rows[4].after,resources.get('deck_option_unset'));
    assert.equal(rows[5].after,resources.get('deck_option_unset'));assert.equal(rows[6].after,resources.get('deck_option_unset'));
  }
});

test('manual filtered form and JIDE translate the same complete Core order catalog and refresh language',()=>{
  assert.deepEqual(FILTERED_DECK_ORDERS.map(choice=>choice.value),Object.values(过滤牌组排序));
  let locale='base';const resources={base:strings('base'),en_US:strings('en_US')};
  const Form=loadComponentLogic('components/home/创建过滤牌组面板.ets','创建过滤牌组面板',{
    FILTERED_DECK_ORDERS,filteredDeckOrderTitleKey,过滤牌组排序,牌组服务:class{},
    namedResourceText:(_context,key)=>resources[locale].get(key)
  });
  const form=new Form();form.getUIContext=()=>({});form.uiLanguage='zh-Hans';
  const original=form.orderOptions();assert.equal(form.orderValue(),resources.base.get('filtered_deck_order_added'));
  form.排序值=过滤牌组排序.随机;locale='en_US';form.uiLanguage='en';
  assert.deepEqual(form.orderOptions().map(item=>item.value),FILTERED_DECK_ORDERS.map(choice=>resources.en_US.get(choice.titleKey)));
  assert.equal(form.orderValue(),resources.en_US.get('filtered_deck_order_random'));
  assert.notDeepEqual(form.orderOptions(),original);assert.equal(form.排序值,过滤牌组排序.随机);
});
test('the shared details menu excludes normal preset options from filtered decks',()=>{
  const regular=deckDetailsMoreItems(true,false).map(item=>item.id),filtered=deckDetailsMoreItems(true,true).map(item=>item.id);
  assert.ok(regular.includes('options'));assert.ok(!filtered.includes('options'));
  for(const action of FILTERED_DECK_ACTIONS){assert.ok(filtered.includes(action.id));assert.ok(!regular.includes(action.id));}
  for(const id of ['rename','move','export']){assert.ok(regular.includes(id));assert.ok(filtered.includes(id));}
});
function fixture(){let current=deck();const writes=[],scheduler=new AutoSyncScheduler(),activity=new SyncActivity();let gate;
  const backend={read:async()=>structuredClone(current),save:async value=>{writes.push(['save',value]);if(gate)await gate;current=value;return value.id;},
    empty:async id=>writes.push(['empty',id]),rebuild:async id=>{writes.push(['rebuild',id]);return 7;},changed:()=>writes.push(['changed'])};
  return {commands:new FilteredDeckCommands(backend,scheduler,activity),writes,scheduler,activity,setCurrent:value=>current=value,setGate:value=>gate=value};}

test('filtered config patch preserves unknown fields, v1 delays, identity and omitted preview values',()=>{
  const before=deck(),round=decode(encode(before));assert.deepEqual(round,before);
  const after=filteredDeckPatch(round,JSON.stringify({reschedule:false,searchTerms:[{search:'deck:Default',limit:30,order:1}]}));
  assert.equal(after.id,42);assert.equal(after.name,before.name);assert.equal(after.config.previewAgainSecs,60);assert.equal(after.allowEmpty,true);
  assert.deepEqual(after.config.preserved,before.config.preserved);assert.deepEqual(after.config.searchTerms[0].preserved,before.config.searchTerms[0].preserved);
  assert.deepEqual(decode(encode(after)),after);
  for(const patch of [{},{name:'other'},{searchTerms:[]},{searchTerms:[{search:'x',limit:0,order:0}]},{searchTerms:[{search:'x',limit:1,order:11}]},
    {searchTerms:[{search:'x',limit:1,order:1,extra:1}]},{reschedule:1},{previewDelay:-1},{previewGoodSecs:86401}])assert.throws(()=>filteredDeckPatch(before,JSON.stringify(patch)),/invalid/);
});
test('existing deck maintenance is serialized, blocks auto sync and requests refresh only after Core success',async()=>{
  const f=fixture();assert.equal(await f.commands.maintain(42,'empty_filtered'),0);assert.equal(await f.commands.maintain(42,'rebuild_filtered'),7);
  assert.deepEqual(f.writes,[['empty',42],['changed'],['rebuild',42],['changed']]);assert.equal(f.scheduler.hasPending(),true);assert.equal(f.scheduler.canSync(),true);
  assert.throws(()=>f.commands.maintain(0,'empty_filtered'));assert.throws(()=>f.commands.maintain(42,'delete'));
  f.setCurrent({...deck(),id:99});await assert.rejects(f.commands.maintain(42,'rebuild_filtered'),/missing/);
});
test('read-only proposals, stale recheck, accepted payload freezing and shared confirmation preview',async()=>{
  const f=fixture(),proposal=await f.commands.prepare(42,'{"previewHardSecs":180,"reschedule":false}');assert.deepEqual(f.writes,[]);
  const rows=maintenancePreviewRows(createAgentAction('filtered_deck_change',JSON.stringify(proposal)),key=>key);
  assert.equal(rows[0].after,'Synthetic filtered');assert.equal(rows[1].before,'120');assert.equal(rows[1].after,'180');
  f.setCurrent({...deck(),name:'Changed'});await assert.rejects(f.commands.save(proposal),/changed_since/);assert.deepEqual(f.writes,[]);
  f.setCurrent(deck());let resolve;f.setGate(new Promise(r=>resolve=r));const saved=f.commands.save(proposal);proposal.changesJson='{"previewHardSecs":999}';
  await new Promise(r=>setImmediate(r));assert.equal(f.scheduler.canSync(),false);resolve();assert.equal((await saved).config.previewHardSecs,180);
  assert.equal(f.scheduler.canSync(),true);assert.equal(f.scheduler.hasPending(),true);
});
test('both deck menus declare the same actual maintenance labels for JIDE',()=>{
  for(const id of ['deck_details_more','deck_row_menu'])for(const action of FILTERED_DECK_ACTIONS){
    const item=APP_INTERFACE_SURFACES.find(x=>x.id===id).items.find(x=>x.id===action.id);assert.equal(item.titleKey,action.titleKey);assert.equal(item.condition,'filtered_deck');}
});
test('scheduler rebuild decodes actual Core card count',async()=>{
  const writer=new Writer();writer.写入变长整数(2,17);
  const codec=await import('../../entry/src/main/ets/proto/messages/CollectionMessages.ts');
  const deckCodec=await import('../../entry/src/main/ets/proto/messages/DeckMessages.ts');
  const Service=loadPlatformModule('backend/调度器服务.ts','调度器服务',{...codec,...deckCodec,服务号:{后端调度器:31},调度器方法:{重建过滤牌组:16},
    后端会话:{获取实例:()=>({调用:async()=>writer.转为字节()})}});
  assert.equal(await new Service().重建过滤牌组(42),17);
});

test('actual JIDE registry reads, proposes and confirms filtered config through the shared queue',async()=>{
  const f=fixture(),discovered=new Set([42]),scope={assertReadableDeckIds:ids=>{if(ids.some(id=>!discovered.has(id)))throw Error('scope');},currentCreateTarget:()=>[1,1]};
  const Registry=loadPlatformModule('backend/agent/AgentToolRegistry.ets','AgentToolRegistry',{toolRiskOf,parseAgentToolJsonObject,AgentApprovalRequired});
  const registry=new Registry();
  const Tools=loadPlatformModule('backend/agent/AgentMaintenanceTools.ets','AgentMaintenanceTools',{decodeMaintenanceArguments,collectionPreferenceEdits,
    filteredDeckCommands:f.commands,createAgentAction,笔记服务:class{},卡片服务:class{},笔记类型服务:class{}});
  new Tools(scope).register(registry);
  const call=(name,args)=>registry.execute({id:'call',name,argumentsJson:JSON.stringify(args)});
  assert.equal(JSON.parse((await call('get_filtered_deck',{deckId:42})).outputJson).config.previewHardSecs,120);
  await assert.rejects(call('get_filtered_deck',{deckId:99}),/scope/);
  const proposal=(await call('propose_update_filtered_deck',{deckId:42,changesJson:'{"previewHardSecs":240}'})).action;
  assert.deepEqual(f.writes,[]);
  const Executor=loadPlatformModule('backend/agent/AgentActionExecutor.ets','AgentActionExecutor',{AgentActionLedger,filteredDeckCommands:f.commands,
    牌组服务:class{},笔记类型服务:class{},LocalPreferenceWriteError:class extends Error{}});
  const executor=new Executor(scope,{});executor.registerPending(proposal);
  assert.equal(JSON.parse(await executor.executeConfirmed(proposal)).config.previewHardSecs,240);
  await assert.rejects(executor.executeConfirmed(proposal),/confirmation_mismatch/);
  const pending=(await call('propose_update_filtered_deck',{deckId:42,changesJson:'{"reschedule":false}'})).action;
  executor.registerPending(pending);f.setCurrent({...deck(),name:'Changed'});await assert.rejects(executor.executeConfirmed(pending),/changed_since/);
  assert.equal(f.writes.filter(row=>row[0]==='save').length,1);
  for(const tool of agentMaintenanceTools().filter(x=>x.name.includes('filtered_deck')))assert.doesNotThrow(()=>JSON.parse(tool.exampleArgumentsJson));
});
