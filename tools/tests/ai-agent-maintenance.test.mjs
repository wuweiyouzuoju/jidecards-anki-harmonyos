// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadPlatformModule } from './platform-module-harness.mjs';
import { agentMaintenanceTools, decodeMaintenanceArguments, collectionPreferenceEdits } from '../../entry/src/main/ets/model/agent/AgentMaintenanceTools.ts';
import { agentFunctionTools } from '../../entry/src/main/ets/model/agent/AgentToolCatalog.ts';
import { toolRiskOf } from '../../entry/src/main/ets/model/agent/AgentPolicy.ts';
import { parseAgentToolJsonObject } from '../../entry/src/main/ets/model/agent/AgentToolSchemas.ts';
import { AgentApprovalRequired, AgentActionLedger, createAgentAction } from '../../entry/src/main/ets/model/agent/AgentAction.ts';
import { decodeAgentClarificationRequest } from '../../entry/src/main/ets/model/agent/AgentClarification.ts';
import { agentRestoreStockKind, patchAgentNotetypeFields, agentStockRestoreMatches,agentNotetypeFieldPreview,agentNotetypeLayout } from '../../entry/src/main/ets/model/agent/AgentNotetypeFields.ts';
import { patchAgentNotetypeLatex, agentNotetypeLatexMatches, agentNotetypeLatexPreview } from '../../entry/src/main/ets/model/agent/AgentNotetypeLatex.ts';
import { defaultStudyControls, validateStudyControls } from '../../entry/src/main/ets/model/StudyControls.ts';
import { ReviewPreferencesStore } from '../../entry/src/main/ets/model/ReviewPreferencesStore.ts';
import { decodeReviewPreferences, patchReviewPreferences, ReviewPreferenceField as F } from '../../entry/src/main/ets/proto/messages/PreferencesMessages.ts';
import { 协议写入器 as Writer } from '../../entry/src/main/ets/proto/core/ProtoWriter.ts';
import { AgentConfirmationManager } from '../../entry/src/main/ets/model/agent/AgentConfirmation.ts';
import { AgentRetrieval } from '../../entry/src/main/ets/model/agent/AgentRetrieval.ts';
import { sameAgentIds } from '../../entry/src/main/ets/model/agent/AgentTemplateUpdate.ts';
import { maintenancePreviewRows } from '../../entry/src/main/ets/model/agent/AgentMaintenancePreview.ts';
import { buildFailedOperationsRetryDraft } from '../../entry/src/main/ets/model/agent/AgentDraftRetry.ts';

function fixture() {
  const state = { writes:[], creates:[], exports:[], saved:true, controls:defaultStudyControls(),
    note:{id:41,guid:'source',notetypeId:7,mtime:1,usn:0,tags:['source-tag'],fields:['Question <img src="existing.png">','Answer']},
    type:JSON.stringify({id:7,name:'Type',type:0,css:'keep',sortf:0,latexPre:'\\documentclass{article}',latexPost:'\\end{document}',latexsvg:true,
      flds:[{name:'Front',ord:0,id:91,rtl:false,font:'Arial',size:20,external:3},{name:'Back',ord:1,id:92}],tmpls:[{ord:0,name:'Card',qfmt:'{{Front}}',afmt:'{{Back}}'}],external:{keep:true}}),
    notes:[41], cards:[71], card:{id:71,noteId:41,deckId:1,queue:2,reps:3} };
  const w=new Writer();w.写入字节(1,new Uint8Array([16,4]));w.写入字节(2,new Uint8Array([48,1,56,0]));w.写入字节(3,new Uint8Array([8,1]));w.写入字节(4,new Uint8Array([8,12,16,5,24,2,32,30]));
  let raw=w.转为字节();
  const reviewPreferences=new ReviewPreferencesStore({read:async()=>raw,write:async bytes=>{state.writes.push('preferences');raw=bytes;},changed(){} });
  const Scope=loadPlatformModule('backend/agent/AgentScope.ets','AgentScope',{AgentRetrieval});
  const scope=new Scope();scope.registerReadableNoteIds([41]);scope.registerReadableCardIds([71]);scope.registerReadableDeckIds([1]);scope.registerReadableNotetypeIds([7]);
  class Notes {
    async 获取笔记() { return structuredClone(state.note); }
    async 新建笔记(id) { return {id:0,guid:'new-guid',notetypeId:id,mtime:0,usn:0,tags:[],fields:['','']}; }
    async 添加笔记(note,deck) { state.creates.push({note:structuredClone(note),deck});return 99; }
  }
  class Types {
    async 获取标准笔记类型JSON() { return JSON.stringify({...JSON.parse(state.type),css:'stock'}); }
    async 获取笔记类型旧版() { return state.type; }
    async 获取笔记类型能力() { return {fieldNames:['Front','Back']}; }
    async 更新笔记类型旧版(json) {
      if(state.typeWriteError)throw Error(state.typeWriteError);
      state.writes.push('fields');state.type=json;
      if(state.corruptLatexAfterSave)state.type=JSON.stringify({...JSON.parse(json),latexPre:'not saved'});
    }
    async restoreNotetypeToStock(id,force) { state.writes.push(['restore',id,force]);state.type=JSON.stringify({...JSON.parse(state.type),css:'stock'}); }
  }
  class Cards { async 获取卡片() { return structuredClone(state.card); } }
  class Decks { async 获取牌组树() { return {deckId:0,name:'',children:[{deckId:1,name:'Default',children:[]}]}; } }
  const readAgentNotetypeImpact=async()=>({noteIds:state.notes.slice(),cardIds:state.cards.slice()});
  const readAgentExportSnapshot=loadPlatformModule('backend/agent/AgentExportSnapshot.ets','readAgentExportSnapshot',{});
  const dependencies={decodeMaintenanceArguments,collectionPreferenceEdits,agentRestoreStockKind,patchAgentNotetypeFields,patchAgentNotetypeLatex,createAgentAction,
    validateStudyControls,reviewPreferences,readStudyControls:async()=>structuredClone(state.controls),
    笔记服务:Notes,卡片服务:Cards,笔记类型服务:Types,readAgentNotetypeImpact,readAgentExportSnapshot};
  const Registry=loadPlatformModule('backend/agent/AgentToolRegistry.ets','AgentToolRegistry',{
    toolRiskOf,parseAgentToolJsonObject,decodeAgentClarificationRequest,AgentApprovalRequired});
  const registry=new Registry();
  const Tools=loadPlatformModule('backend/agent/AgentMaintenanceTools.ets','AgentMaintenanceTools',dependencies);
  const tools=new Tools(scope);tools.register(registry);
  const call=(name,args)=>registry.execute({id:'call',name,argumentsJson:JSON.stringify(args)});
  const Executor=loadPlatformModule('backend/agent/AgentActionExecutor.ets','AgentActionExecutor',{
    AgentActionLedger,牌组服务:Decks,笔记类型服务:Types,笔记服务:Notes,卡片服务:Cards,collectionPreferenceEdits,reviewPreferences,
    readAgentExportSnapshot,saveStudyControls:async(after,before)=>{assert.equal(JSON.stringify(state.controls),JSON.stringify(before));state.writes.push('controls');state.controls=structuredClone(after);return after;},
    AppStorage:{get:()=>({filesDir:'/sandbox'})},autoSyncScheduler:{beginOperation(){},endOperation(){}},syncActivity:{waitForCollection:async()=>{}},
    exportSubset:async(...args)=>{state.exports.push(args);return '/sandbox/approved.apkg';},完成导出:async()=>state.saved?'uri':null,
    LocalPreferenceWriteError:class extends Error{}});
  const executor=new Executor(scope,{});
  const DraftExecutor=loadPlatformModule('backend/agent/AgentDraftExecutor.ets','AgentDraftExecutor',{
    AgentConfirmationManager,牌组服务:Decks,笔记类型服务:Types,笔记服务:Notes,卡片服务:Cards,
    媒体服务:class{},WikimediaImageService:class{},readAgentNotetypeImpact,sameAgentIds,agentStockRestoreMatches,agentNotetypeLatexMatches});
  const drafts=new DraftExecutor();
  return {state,scope,tools,registry,call,executor,drafts,reviewPreferences,readRaw:()=>raw,
    externalPreferences:()=>{raw=patchReviewPreferences(raw,[{field:F.LoadBalancer,value:0}]);}};
}

test('all three modes expose the actual maintenance schemas; manual interface catalogs do not gain entry points', () => {
  for(const mode of ['assistant','create','edit'])for(const tool of agentMaintenanceTools()) {
    assert.ok(agentFunctionTools(100,mode).some(item=>item.name===tool.name));
    assert.doesNotThrow(()=>decodeMaintenanceArguments(tool.name,tool.exampleArgumentsJson));
    assert.notEqual(toolRiskOf(tool.name),'blocked');
  }
  assert.equal(toolRiskOf('get_advanced_settings'),'read');
  assert.equal(toolRiskOf('propose_restore_notetype'),'high_risk');
  for(const file of ['model/SettingsStructure.ts','model/AppInterface.ts']) {
    const source=readFileSync(new URL('../../entry/src/main/ets/'+file,import.meta.url),'utf8');
    for(const tool of agentMaintenanceTools())assert.equal(source.includes(tool.name),false);
  }
  const f=fixture();assert.throws(()=>f.registry.registerRead('propose_restore_notetype',{}),/registration_rejected/);
});

test('advanced settings read the current Core state and proposals are read-only; confirmation preserves unrelated bytes and rejects stale/replayed payloads', async () => {
  const f=fixture();const before=f.readRaw();
  const read=JSON.parse((await f.call('get_advanced_settings',{group:'collection'})).outputJson);
  assert.equal(read.backupDaily,12);assert.equal(read.backupIncludesMedia,false);assert.equal(read.loadBalancer,true);
  const proposed=await f.call('propose_update_collection_preferences',{changesJson:'{"backupInterval":0,"shortTermWithSteps":true}'});
  assert.deepEqual(f.state.writes,[]);f.executor.registerPending(proposed.action);
  await f.executor.executeConfirmed(proposed.action);
  assert.deepEqual(f.state.writes,['preferences']);assert.equal(decodeReviewPreferences(f.readRaw()).shortTermWithSteps,true);
  assert.equal(decodeReviewPreferences(f.readRaw()).backupInterval,0);
  assert.equal(decodeReviewPreferences(f.readRaw()).rollover,decodeReviewPreferences(before).rollover);
  await assert.rejects(f.executor.executeConfirmed(proposed.action),/confirmation_mismatch/);
  const stale=(await f.call('propose_update_collection_preferences',{changesJson:'{"backupDaily":3}'})).action;
  f.executor.registerPending(stale);f.externalPreferences();await assert.rejects(f.executor.executeConfirmed(stale),/changed_since_proposal/);
  const tampered=(await f.call('propose_update_collection_preferences',{changesJson:'{"backupDaily":4}'})).action;
  f.executor.registerPending(tampered);tampered.payloadJson+=' ';await assert.rejects(f.executor.executeConfirmed(tampered),/confirmation_mismatch/);
  assert.deepEqual(f.state.writes,['preferences']);
});

test('study controls and subset export use confirmation, exact discovered IDs, target rechecks and honest save cancellation', async () => {
  const f=fixture();const controls={...defaultStudyControls(),keepScreenOn:true,keys:[{input:'space',command:'easy'}]};
  const action=(await f.call('propose_update_study_controls',{controlsJson:JSON.stringify(controls)})).action;
  assert.deepEqual(f.state.writes,[]);f.executor.registerPending(action);await f.executor.executeConfirmed(action);
  assert.equal(f.state.controls.keepScreenOn,true);
  const args={ids:[41],mode:'notes',format:'apkg',withMedia:true,withScheduling:false};
  await assert.rejects(f.call('propose_export_subset',{...args,ids:[999]}),/out_of_scope/);
  const exportAction=(await f.call('propose_export_subset',args)).action;
  assert.equal(f.state.exports.length,0);f.executor.registerPending(exportAction);f.state.saved=false;
  assert.equal(JSON.parse(await f.executor.executeConfirmed(exportAction)).saved,false);assert.equal(exportAction.status,'cancelled');
  assert.deepEqual(f.state.exports[0][1],{mode:'notes',ids:[41]});
  const stale=(await f.call('propose_export_subset',args)).action;f.executor.registerPending(stale);f.state.note.fields[0]='changed';
  await assert.rejects(f.executor.executeConfirmed(stale),/changed_since_proposal/);assert.equal(f.state.exports.length,1);
  const cardAction=(await f.call('propose_export_subset',{...args,ids:[71],mode:'cards'})).action;
  f.executor.registerPending(cardAction);f.state.note.fields[1]='changed linked note';
  await assert.rejects(f.executor.executeConfirmed(cardAction),/changed_since_proposal/);assert.equal(f.state.exports.length,1);
});

test('duplicate notes stay draft-only, copy tags and media references, use new identity and reject a changed source', async () => {
  const f=fixture();const draft=(await f.call('propose_duplicate_note',{noteId:41,deckId:1,draftId:'copy',reason:'Copy'})).draft;
  assert.deepEqual(f.state.creates,[]);assert.equal(draft.duplicateSource.noteId,41);
  const prepared=await f.drafts.prepare(draft);await f.drafts.executeOrdinary(prepared,prepared.firstToken);
  assert.equal(f.state.creates.length,1);assert.equal(f.state.creates[0].note.id,0);assert.equal(f.state.creates[0].note.guid,'new-guid');
  assert.deepEqual(f.state.creates[0].note.tags,['source-tag']);assert.deepEqual(f.state.creates[0].note.fields,f.state.note.fields);
  assert.equal('reps' in f.state.creates[0].note,false);
  const stale=(await f.call('propose_duplicate_note',{noteId:41,deckId:1,draftId:'copy-stale',reason:'Copy'})).draft;
  f.state.note.tags.push('changed');await assert.rejects(f.drafts.prepare(stale),/draft_conflict/);
  const retry=buildFailedOperationsRetryDraft(draft,{failed:1,items:[{targetId:-1,succeeded:false}]},'retry');
  assert.deepEqual(retry.duplicateSource,draft.duplicateSource);
});

test('shared field metadata requires two confirmations, preserves identities and rejects changed impact; stock restore calls the real service boundary', async () => {
  const f=fixture();f.state.cards=Array.from({length:1500},(_,i)=>i+100);
  const args={notetypeId:7,fieldsJson:'[{"fieldOrd":0,"rtl":true,"font":"Serif","size":30}]',sortFieldIndex:1,draftId:'fields',reason:'RTL'};
  const response=await f.call('propose_update_notetype_fields',args);const draft=response.draft;
  assert.equal(JSON.parse(response.outputJson).affectedCardCount,1500);assert.equal('affectedCardIds' in JSON.parse(response.outputJson),false);
  assert.deepEqual(f.state.writes,[]);const prepared=await f.drafts.prepare(draft);
  await assert.rejects(f.drafts.executeOrdinary(prepared,prepared.firstToken),/ordinary_execution_not_allowed/);
  const second=f.drafts.authorizeHighRisk(prepared,prepared.firstToken);const result=await f.drafts.executeHighRisk(prepared,prepared.firstToken,second);
  assert.equal(result.failed,0);const saved=JSON.parse(f.state.type);
  assert.equal(saved.flds[0].id,91);assert.equal(saved.flds[0].external,3);assert.equal(saved.flds[0].rtl,true);assert.equal(saved.sortf,1);
  assert.deepEqual(saved.external,{keep:true});
  f.state.cards=[71];const restore=(await f.call('propose_restore_notetype',{notetypeId:7,forceKind:0,draftId:'restore',reason:'Stock'})).draft;
  const p=await f.drafts.prepare(restore);const token=f.drafts.authorizeHighRisk(p,p.firstToken);
  const restored=await f.drafts.executeHighRisk(p,p.firstToken,token);assert.equal(restored.failed,0);
  assert.deepEqual(f.state.writes.at(-1),['restore',7,0]);
  const stale=(await f.call('propose_update_notetype_fields',{...args,draftId:'stale'})).draft;
  const pending=await f.drafts.prepare(stale);f.state.cards.push(72);
  await assert.rejects(f.drafts.executeHighRisk(pending,pending.firstToken,f.drafts.authorizeHighRisk(pending,pending.firstToken)),/impact_changed/);
});

test('LaTeX patches preserve the full raw type, accept empty source and false, and reject malformed or unbounded arguments',()=>{
  const before=fixture().state.type;
  const after=JSON.parse(patchAgentNotetypeLatex(before,{latexPre:'',latexSvg:false}));
  const expected={...JSON.parse(before),latexPre:'',latexsvg:false};
  assert.deepEqual(after,expected);assert.equal('latexSvg' in after,false);
  const base={notetypeId:7,draftId:'latex',reason:'Change'};
  assert.doesNotThrow(()=>decodeMaintenanceArguments('propose_update_notetype_latex',JSON.stringify({...base,latexPre:'',latexSvg:false})));
  for(const patch of [{},{latexPre:2},{latexPost:null},{latexSvg:0},{latexPre:'x'.repeat(30001)}]) {
    assert.throws(()=>decodeMaintenanceArguments('propose_update_notetype_latex',JSON.stringify({...base,...patch})),/latex/);
  }
  assert.throws(()=>decodeMaintenanceArguments('propose_update_notetype_latex',JSON.stringify({...base,latexSvg:true,css:'extra'})),/invalid/);
  assert.equal(agentNotetypeLatexMatches(before,JSON.stringify(after)),false);
});

test('JIDE LaTeX modification is draft-only until two confirmations, preserves all identities and exposes compact shared impact',async()=>{
  const f=fixture();f.state.cards=Array.from({length:1500},(_,i)=>i+100);
  const before=f.state.type;
  const response=await f.call('propose_update_notetype_latex',{notetypeId:7,latexPre:'\\documentclass{standalone}\n% source',
    latexPost:'',latexSvg:false,draftId:'latex',reason:'LaTeX'});
  const draft=response.draft;
  assert.equal(draft.risk,'high_risk');assert.equal(draft.operations[0].kind,'update_notetype_latex');
  assert.deepEqual(f.state.writes,[]);assert.equal(f.state.type,before);
  const modelOutput=JSON.parse(response.outputJson);
  assert.equal(modelOutput.affectedCardCount,1500);assert.equal('affectedCardIds' in modelOutput,false);
  const prepared=await f.drafts.prepare(draft);
  await assert.rejects(f.drafts.executeOrdinary(prepared,prepared.firstToken),/ordinary_execution_not_allowed/);
  const second=f.drafts.authorizeHighRisk(prepared,prepared.firstToken);
  const result=await f.drafts.executeHighRisk(prepared,prepared.firstToken,second);
  assert.equal(result.failed,0);
  const saved=JSON.parse(f.state.type);
  assert.deepEqual(saved,{...JSON.parse(before),latexPre:'\\documentclass{standalone}\n% source',latexPost:'',latexsvg:false});
  assert.equal(f.state.writes.length,1);
  await assert.rejects(f.drafts.executeHighRisk(prepared,prepared.firstToken,second));
  assert.equal(f.state.writes.length,1);
});

test('LaTeX confirmation rejects undiscovered types, stale snapshots and changed impact, and reports failed readback or Core writes',async()=>{
  const args={notetypeId:7,latexSvg:false,draftId:'latex',reason:'Change'};
  await assert.rejects(fixture().call('propose_update_notetype_latex',{...args,notetypeId:999}),/out_of_scope/);
  for(const change of ['snapshot','impact','readback','write']) {
    const f=fixture();const draft=(await f.call('propose_update_notetype_latex',args)).draft;
    const prepared=await f.drafts.prepare(draft);
    const second=f.drafts.authorizeHighRisk(prepared,prepared.firstToken);
    if(change==='snapshot')f.state.type=JSON.stringify({...JSON.parse(f.state.type),css:'Changed elsewhere'});
    if(change==='impact')f.state.cards.push(72);
    if(change==='readback')f.state.corruptLatexAfterSave=true;
    if(change==='write')f.state.typeWriteError='Core rejected configuration';
    if(change==='snapshot'||change==='impact'){
      await assert.rejects(f.drafts.executeHighRisk(prepared,prepared.firstToken,second),/draft_conflict|impact_changed/);
      assert.deepEqual(f.state.writes,[]);
    }else{
      const result=await f.drafts.executeHighRisk(prepared,prepared.firstToken,second);
      assert.equal(result.failed,1);assert.equal(result.succeeded,0);
      const retry=buildFailedOperationsRetryDraft(draft,result,'retry');
      assert.deepEqual(retry.affectedNoteIds,draft.affectedNoteIds);assert.deepEqual(retry.affectedCardIds,draft.affectedCardIds);
      assert.equal(retry.operations[0].kind,'update_notetype_latex');
      if(change==='readback')assert.match(JSON.stringify(result),/notetype_latex_save_unverified/);
    }
  }
});

test('LaTeX confirmation previews retain exact source and use real Chinese and English labels',()=>{
  const before=fixture().state.type;
  const after=patchAgentNotetypeLatex(before,{latexPre:'\\documentclass{standalone}\n% source',latexPost:'',latexSvg:false});
  for(const locale of ['base','en_US']){
    const strings=new Map(JSON.parse(readFileSync(new URL('../../entry/src/main/resources/'+locale+'/element/string.json',import.meta.url))).string.map(x=>[x.name,x.value]));
    const text=key=>{assert.ok(strings.has(key),key);return strings.get(key);};
    const rows=agentNotetypeLatexPreview(before,after,text);
    assert.equal(rows.length,3);assert.equal(rows[0].after,'\\documentclass{standalone}\n% source');
    assert.equal(rows[1].after,text('agent_latex_empty'));assert.equal(rows[2].after,text('agent_value_off'));
    assert.ok(rows.every(row=>row.before!==row.after));text('agent_latex_config_only');text('agent_tool_notetype_latex');
  }
});

test('unsafe preference names, field identities, protected keys, duplicate IDs and extra arguments are refused before proposal', async () => {
  for(const json of ['{}','{"password":1}','{"loadBalancer":1}','{"backupDaily":-1}','{"backupWeekly":0.5}'])assert.throws(()=>collectionPreferenceEdits(json),/invalid/);
  const before=fixture().state.type;
  for(const json of ['[{"fieldOrd":0,"id":1}]','[{"fieldOrd":0,"name":"Changed"}]','[{"fieldOrd":8,"rtl":true}]','[{"fieldOrd":0,"size":0}]'])assert.throws(()=>patchAgentNotetypeFields(before,json),/invalid/);
  assert.throws(()=>validateStudyControls({...defaultStudyControls(),keys:[{input:'escape',command:'easy'}]}),/invalid/);
  assert.throws(()=>agentRestoreStockKind(before,4),/kind_mismatch/);
  assert.throws(()=>agentRestoreStockKind(before),/unknown_original_stock_kind/);
  assert.throws(()=>decodeMaintenanceArguments('propose_export_subset',JSON.stringify({ids:[1,1],mode:'cards',format:'apkg',withMedia:false,withScheduling:false})),/invalid/);
  await assert.rejects(fixture().call('get_advanced_settings',{group:'collection',rpc:9}),/invalid/);
});

test('confirmation previews resolve current Chinese/English labels and do not show export snapshots or filesystem paths', async () => {
  const f=fixture();const prefs=(await f.call('propose_update_collection_preferences',{changesJson:'{"backupDaily":0,"loadBalancer":false}'})).action;
  const controls=(await f.call('propose_update_study_controls',{controlsJson:JSON.stringify({...defaultStudyControls(),gestureMode:'gestures',gestures:[{input:'left',command:'easy'}]})})).action;
  const exportAction=(await f.call('propose_export_subset',{ids:[41],mode:'notes',format:'apkg',withMedia:true,withScheduling:true})).action;
  for(const locale of ['base','en_US']) {
    const texts=new Map(JSON.parse(readFileSync(new URL('../../entry/src/main/resources/'+locale+'/element/string.json',import.meta.url))).string.map(v=>[v.name,v.value]));
    const text=key=>{assert.ok(texts.has(key),key);return texts.get(key);};
    for(const action of [prefs,controls,exportAction])assert.ok(maintenancePreviewRows(action,text).length>0);
    const changed=patchAgentNotetypeFields(f.state.type,'[{"fieldOrd":0,"rtl":true,"sticky":true}]',1);
    const fields=agentNotetypeFieldPreview(f.state.type,changed,text);
    assert.equal(fields.length,3);assert.ok(fields.every(row=>row.before!==row.after));
    assert.equal(agentNotetypeLayout(changed)[0],'Front, Back');text('agent_restore_structure_warning');text('agent_restore_layout');
    assert.equal(JSON.stringify(maintenancePreviewRows(exportAction,text)).includes('Question'),false);
  }
});
