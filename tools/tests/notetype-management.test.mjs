// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { serializeNotetypeTemplates, cloneNotetypeJson, previewFieldsUnchanged, templateStructureChanged, notetypeStructureChanges,
  NotetypeOperationSession } from '../../entry/src/main/ets/model/NotetypeManagement.ts';
import { autoSyncScheduler } from '../../entry/src/main/ets/model/AutoSyncScheduler.ts';
import { syncActivity } from '../../entry/src/main/ets/model/SyncSettings.ts';
import { encodeRenderUncommittedCardRequest } from '../../entry/src/main/ets/proto/messages/CardRenderingMessages.ts';
import { decodeNote } from '../../entry/src/main/ets/proto/messages/NoteMessages.ts';
import { 协议读取器 } from '../../entry/src/main/ets/proto/core/ProtoReader.ts';
import { loadComponentLogic, loadPlatformModule } from './platform-module-harness.mjs';
import { serializeNotetypeFields } from '../../entry/src/main/ets/model/NotetypeFieldDraft.ts';

const original = { id: 123, mod: 55, usn: 2, name: 'Original', type: 0, css: '.card{color:red}', future: {keep:true},
  flds:[{ord:0,name:'Front'},{ord:1,name:'Back'}], tmpls:[
    {ord:0,name:'A',qfmt:'{{Front}}',afmt:'{{Back}}',did:7,id:101},
    {ord:1,name:'B',qfmt:'{{Back}}',afmt:'{{Front}}',did:8,id:102},
    {ord:2,name:'C',qfmt:'{{Front}}',afmt:'{{Back}}',did:9,id:103,future:{keep:9}}
  ] };
const json = JSON.stringify(original);
const draft = t => ({ord:t.ord,name:t.name,qfmt:t.qfmt,afmt:t.afmt});
const deferred = () => { let resolve; const promise=new Promise(r=>resolve=r); return {promise,resolve}; };

test('deleting a middle template preserves survivor ord, metadata and new-template null identity', () => {
  const templates=[draft(original.tmpls[0]),draft(original.tmpls[2]),{ord:null,name:'D',qfmt:'{{Back}}',afmt:'{{Front}}'}];
  const result=serializeNotetypeTemplates(original.tmpls,templates);
  assert.deepEqual(result.map(t=>t.ord),[0,2,null]);assert.equal(result[1].did,9);assert.equal(result[1].id,103);
  assert.deepEqual(result[1].future,{keep:9});assert.equal(result[2].did,undefined);assert.equal(original.tmpls[2].ord,2);
  assert.equal(templateStructureChanged(json,templates),true);
  assert.equal(templateStructureChanged(json,original.tmpls.map(draft)),false);
  assert.throws(()=>serializeNotetypeTemplates(original.tmpls,[]),/last_template/);
  assert.throws(()=>serializeNotetypeTemplates(original.tmpls,[draft(original.tmpls[0]),draft(original.tmpls[0])]),/Duplicate/);
  assert.throws(()=>serializeNotetypeTemplates(original.tmpls,[{...draft(original.tmpls[0]),ord:8}]),/Missing/);
});

test('clone resets collection identity and keeps imported custom fields, templates and future metadata', () => {
  const clone=JSON.parse(cloneNotetypeJson(json,' Copy 中文 '));
  assert.equal(clone.id,0);assert.equal(clone.mod,0);assert.equal(clone.usn,0);assert.equal(clone.name,'Copy 中文');
  assert.deepEqual(clone.flds,original.flds);assert.deepEqual(clone.tmpls,original.tmpls);assert.deepEqual(clone.future,original.future);
  assert.equal(clone.css,original.css);assert.equal(original.id,123);assert.throws(()=>cloneNotetypeJson(json,' '),/name_required/);
  assert.equal(previewFieldsUnchanged(json,original.flds),true);
  assert.equal(previewFieldsUnchanged(json,[{ord:0,name:'Renamed'},original.flds[1]]),false);
  assert.equal(previewFieldsUnchanged(json,[original.flds[1],original.flds[0]]),false);
});

test('writes wait for collection, prevent duplicate submissions and finish after disposal with refresh and sync', async () => {
  autoSyncScheduler.consume();const owner={};syncActivity.acquire(owner);
  const gate=deferred(),calls=[];let changes=0;
  const backend={获取笔记类型旧版:async id=>{calls.push(['read',id]);return json;},
    获取标准笔记类型JSON:async kind=>{calls.push(['stock',kind]);return json;},
    添加笔记类型旧版:async value=>{calls.push(['add',JSON.parse(value)]);await gate.promise;return 456;}};
  const session=new NotetypeOperationSession(backend,()=>changes++);
  const pending=session.create(0,123,'Copy');await session.create(4,0,'Should not execute');
  assert.equal(calls.length,0);assert.equal(autoSyncScheduler.canSync(),false);
  syncActivity.release(owner,0);await new Promise(r=>setImmediate(r));assert.equal(calls.length,2);
  session.dispose();gate.resolve();assert.equal(await pending,456);assert.equal(changes,1);
  assert.equal(autoSyncScheduler.hasPending(),true);assert.equal(autoSyncScheduler.canSync(),true);
  assert.equal(await session.create(0,0,'Disposed'),0);
  autoSyncScheduler.consume();
});

test('standard type selection reaches Core, stale baseline refuses save, and failed writes release protection', async () => {
  autoSyncScheduler.consume();let writes=0,changes=0,kind;
  const backend={获取标准笔记类型JSON:async k=>{kind=k;return json;},添加笔记类型旧版:async()=>456,
    获取笔记类型旧版:async()=>json,更新笔记类型旧版:async()=>{writes++;throw new Error('Core validation');}};
  const session=new NotetypeOperationSession(backend,()=>changes++);
  assert.equal(await session.create(4,0,'Cloze copy'),456);assert.equal(kind,4);
  autoSyncScheduler.consume();changes=0;
  await assert.rejects(session.save(123,'changed',json),/notetype_changed/);assert.equal(writes,0);
  await assert.rejects(session.save(123,json,json),/Core validation/);assert.equal(writes,1);
  assert.equal(changes,0);assert.equal(autoSyncScheduler.hasPending(),false);assert.equal(autoSyncScheduler.canSync(),true);
});

test('uncommitted preview uses UTF-8 template bytes and sample filling without add-note fields', () => {
  const note={id:0,guid:'',notetypeId:123,mtimeSecs:0,usn:0,tags:[],fields:['','']};
  const template=JSON.stringify({ord:null,name:'中文',qfmt:'{{Front}}',afmt:'{{FrontSide}}'});
  const reader=new 协议读取器(encodeRenderUncommittedCardRequest(note,2,template,true));let tag;const values={};
  while((tag=reader.读取标签())!==null){
    if(tag.字段号===1)values.note=decodeNote(reader.读取字节());
    else if(tag.字段号===3)values.template=reader.读取字符串();
    else values[tag.字段号]=reader.读取变长整数();
  }
  assert.deepEqual(values.note,note);assert.equal(values.template,template);assert.equal(values[2],2);assert.equal(values[4],1);
});

function editor() {
  let writeCount=0,changes=0,closes=0,confirm=true,previewRequests=[];
  const Editor=loadComponentLogic('components/settings/笔记类型编辑器.ets','笔记类型编辑器',{
    THEME_TEXT_COLORS_KEY:'theme',颜色键:{主色按钮背景:'color'},
    笔记类型服务:class {async 获取笔记类型旧版(){return json;} async 更新笔记类型旧版(){writeCount++;}
      async impact(){return {noteIds:[1],cardIds:[2,3,4],removedCardIds:[],movedCardIds:[]};}},
    卡片渲染服务:class {async renderUncommittedCard(...args){previewRequests.push(args);return {css:args[3]};}},
    NotetypeOperationSession,serializeNotetypeTemplates,serializeNotetypeFields,previewFieldsUnchanged,templateStructureChanged,
    notetypeStructureChanges,notetypeImpactText:()=> 'Impact',confirmNoteDiscard:async()=>confirm,
    syncActivity,AppStorage:{setOrCreate:()=>changes++},resourceText:(_ctx,key)=>key,$r:key=>key,showToastSafely:()=>{}
  });
  const instance=new Editor();instance.notetypeId=123;instance.原始JSON=json;instance.解析JSON(json);
  instance.baselineDraft=instance.序列化JSON();
  instance.getUIContext=()=>({getPromptAction:()=>({showDialog:async()=>({index:confirm?1:0})})});
  instance.onSaved=()=>{};instance.onClose=()=>closes++;
  return {instance,previewRequests,get writes(){return writeCount;},get closes(){return closes;},set confirm(value){confirm=value;}};
}

test('editor refuses cloze template changes, previews the current draft and blocks unsaved field structure',async()=>{
  const h=editor();h.instance.CSS文本='.card{color:blue}';h.instance.更新正面模板('{{Back}}');await h.instance.previewTemplate();
  const preview=h.instance.preview;assert.equal(preview.css,'.card{color:blue}');
  assert.equal(JSON.parse(preview.templateJson).qfmt,'{{Back}}');assert.equal(preview.sample,true);assert.equal(h.writes,0);
  h.instance.字段列表[0].name='Renamed';await h.instance.previewTemplate();assert.equal(h.instance.preview,preview);
  assert.equal(h.instance.错误信息,'app.string.notetype_preview_save_fields');
  h.instance.isCloze=true;const length=h.instance.模板列表.length;h.instance.addTemplate();h.instance.removeTemplate();
  assert.equal(h.instance.模板列表.length,length);
});

test('template structure save requires confirmation, cancellation preserves draft, accepted save closes once',async()=>{
  const h=editor();h.instance.addTemplate();h.confirm=false;await h.instance.保存();
  assert.equal(h.writes,0);assert.equal(h.closes,0);assert.equal(h.instance.模板列表.at(-1).ord,null);
  h.confirm=true;await h.instance.保存();assert.equal(h.writes,1);assert.equal(h.closes,1);
});

test('editor Back closes preview first, blocks accepted writes, and confirms discarding its draft',async()=>{
  const h=editor();h.instance.baselineDraft=h.instance.序列化JSON();h.instance.保存中=true;
  h.instance.handleBackRequest();assert.equal(h.closes,0);h.instance.保存中=false;
  h.instance.preview={sample:true};await h.instance.requestClose();assert.equal(h.instance.preview,null);assert.equal(h.closes,0);
  h.instance.CSS文本='changed';h.confirm=false;await h.instance.requestClose();assert.equal(h.closes,0);
  h.confirm=true;await h.instance.requestClose();assert.equal(h.closes,1);
  h.instance.aboutToDisappear();await h.instance.requestClose();assert.equal(h.closes,1);
});

function manager() {
  let confirms=true,writes=0,closes=0,edited=[],refreshes=0;
  const Manager=loadComponentLogic('components/settings/笔记类型管理面板.ets','笔记类型管理面板',{
    THEME_TEXT_COLORS_KEY:'theme',颜色键:{主色按钮背景:'color'},
    笔记类型服务:class {async 获取笔记类型旧版(){return json;}async 获取标准笔记类型JSON(){return json;}
      async 添加笔记类型旧版(value){writes++;return 456;}async 移除笔记类型(){writes++;}
      async impact(){return {noteIds:[1],cardIds:[2,3,4],removedCardIds:[],movedCardIds:[]};}
      async 获取笔记类型名列表(){refreshes++;return [{id:123,name:'Original'},{id:456,name:'Copy'}];}},
    NotetypeOperationSession,confirmNoteDiscard:async()=>confirms,notetypeImpactText:()=> 'Impact',syncActivity,
    AppStorage:{setOrCreate:()=>{}},resourceText:(_ctx,key)=>key,noteTypeText:(_ctx,value)=>value,$r:key=>key,
    showToastSafely:()=>{}
  });
  const instance=new Manager();instance.类型列表=[{id:123,name:'Original'},{id:456,name:'Copy'}];
  instance.getUIContext=()=>({getPromptAction:()=>({showDialog:async()=>({index:confirms?1:0})})});
  instance.onClose=()=>closes++;instance.onEdit=(...args)=>edited.push(args);
  return {instance,edited,get writes(){return writes;},get closes(){return closes;},get refreshes(){return refreshes;},set confirm(value){confirms=value;}};
}

test('manager selects and clones a source, protects busy Back and confirms deletion before writing',async()=>{
  const h=manager();h.instance.openCreate(123,'Custom');assert.equal(h.instance.cloneSourceId,123);
  h.instance.createName='Copy';h.instance.处理中=true;h.instance.handleBackRequest();assert.equal(h.closes,0);
  h.instance.处理中=false;await h.instance.新建笔记类型();assert.deepEqual(h.edited,[[456,'Copy']]);assert.equal(h.writes,1);
  h.confirm=false;await h.instance.确认删除({id:123,name:'Original'});assert.equal(h.writes,1);
  h.confirm=true;await h.instance.确认删除({id:123,name:'Original'});assert.equal(h.writes,2);assert.equal(h.refreshes,1);
  h.instance.aboutToDisappear();await h.instance.确认删除({id:123,name:'Original'});assert.equal(h.writes,2);
});

test('reordering preserves template identities, cloning preserves unknown config and returning protects every dirty draft',async()=>{
  const h=editor();h.instance.当前模板索引=2;h.instance.moveTemplate(-1);
  assert.deepEqual(h.instance.模板列表.map(t=>t.ord),[0,2,1]);assert.equal(h.instance.当前模板索引,1);
  h.instance.addTemplate();h.instance.更新模板名('New name');h.instance.更新正面模板('new front');
  const serialized=JSON.parse(h.instance.序列化JSON());
  assert.equal(serialized.tmpls.at(-1).ord,null);assert.deepEqual(serialized.tmpls.at(-1).future,{keep:9});
  assert.equal(serialized.tmpls.at(-1).did,9);assert.equal(serialized.tmpls.at(-1).id,null);
  assert.deepEqual(serialized.future,{keep:true});
  h.confirm=false;await h.instance.requestClose();assert.equal(h.closes,0);
  h.instance.preview={};await h.instance.requestClose();assert.equal(h.instance.preview,null);assert.equal(h.closes,0);
  h.instance.保存中=true;await h.instance.requestClose();assert.equal(h.closes,0);
  h.instance.保存中=false;h.confirm=true;await h.instance.requestClose();assert.equal(h.closes,1);
});

test('field and template changes list concrete identities/positions and changed impact refuses accepted write',async()=>{
  const next=structuredClone(original);next.flds=[{ord:1,name:'Renamed'},{ord:null,name:'Added'}];
  next.tmpls=[original.tmpls[2],original.tmpls[0],{ord:null,name:'New',qfmt:'{{Front}}',afmt:'{{Back}}'}];
  const changes=notetypeStructureChanges(json,JSON.stringify(next));
  assert.deepEqual(changes.find(c=>c.kind==='field_removed'),{kind:'field_removed',name:'Front',oldName:'',from:1,to:0});
  assert.deepEqual(changes.find(c=>c.kind==='field_renamed'),{kind:'field_renamed',name:'Renamed',oldName:'Back',from:2,to:1});
  assert.ok(changes.some(c=>c.kind==='template_moved'&&c.name==='C'&&c.from===3&&c.to===1));
  let writes=0;
  const impact={noteIds:[1],cardIds:[2],removedCardIds:[],movedCardIds:[]};
  const session=new NotetypeOperationSession({获取笔记类型旧版:async()=>json,
    impact:async()=>({...impact,cardIds:[2,3]}),更新笔记类型旧版:async()=>{writes++;},移除笔记类型:async()=>{writes++;}},()=>{});
  await assert.rejects(session.save(123,json,JSON.stringify(next),impact),/notetype_impact_changed/);
  await assert.rejects(session.remove(123,json,impact),/notetype_impact_changed/);assert.equal(writes,0);
});

test('impact counts use Core note/card searches and old template numbers even after deletion and reordering',async()=>{
  const calls=[];
  const Service=loadPlatformModule('backend/笔记类型服务.ts','笔记类型服务',{
    后端会话:{获取实例:()=>({})},搜索服务:class {
      async 搜索笔记(value){calls.push(['notes',value]);return [10,11];}
      async 搜索卡片(value){calls.push(['cards',value]);
        if(value.search.endsWith('card:1'))return [100,101];
        if(value.search.endsWith('card:2'))return [102];
        if(value.search.endsWith('card:3'))return [103];return [100,101,102,103];}
    }
  });
  const next={...original,tmpls:[original.tmpls[2],original.tmpls[0]]};
  const impact=await new Service().impact(123,json,JSON.stringify(next));
  assert.deepEqual(impact,{noteIds:[10,11],cardIds:[100,101,102,103],removedCardIds:[102],movedCardIds:[100,101,103]});
  assert.deepEqual(calls.map(c=>c[1].search),['mid:123','mid:123','mid:123 card:1','mid:123 card:2','mid:123 card:3']);
  calls.length=0;await new Service().impact(123,JSON.stringify({...original,type:1}),json);
  assert.deepEqual(calls.map(c=>c[1].search),['mid:123','mid:123']);
});

test('manager protects edited standard/clone names and refuses create or delete while discard confirmation is pending',async()=>{
  const h=manager();h.instance.openCreate();h.instance.stockKind=4;h.confirm=false;
  await h.instance.requestClose();assert.equal(h.instance.createVisible,true);assert.equal(h.closes,0);
  h.instance.confirmingClose=true;h.instance.createName='Cloze';await h.instance.新建笔记类型();
  await h.instance.确认删除({id:123,name:'Original'});h.instance.openCreate(123,'Changed');
  assert.equal(h.writes,0);assert.equal(h.instance.cloneSourceId,0);
  h.instance.confirmingClose=false;h.confirm=true;await h.instance.requestClose();assert.equal(h.instance.createVisible,false);
  await h.instance.requestClose();assert.equal(h.closes,1);
});
