// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { wrapFieldSelection, nextClozeNumber, noteDraftChanged, parseNoteTags } from '../../entry/src/main/ets/model/NoteFieldEditing.ts';
import { serializeNotetypeFields } from '../../entry/src/main/ets/model/NotetypeFieldDraft.ts';
import { prepareNoteImageFields } from '../../entry/src/main/ets/model/NoteImageDraft.ts';
import { loadComponentLogic, loadPlatformModule } from './platform-module-harness.mjs';
import { noteInterfaceDependencies } from './app-interface-harness.mjs';
import { decodeNotetype } from '../../entry/src/main/ets/proto/messages/NotetypeMessages.ts';
import { 协议写入器 } from '../../entry/src/main/ets/proto/core/ProtoWriter.ts';
import { creationPageHarness } from './note-creation-harness.mjs';

test('formatting changes only selection and empty wrappers put caret inside, preserving imported HTML', () => {
  const source = '<img src="a&b.png"><span data-x="custom">中文😀</span>[sound:a.mp3]';
  const start = source.indexOf('中文');
  const result = wrapFieldSelection(source, start, start + 4, '<b>', '</b>');
  assert.equal(result.text, source.slice(0,start) + '<b>中文😀</b>' + source.slice(start+4));
  assert.equal(result.start, start+11);
  assert.deepEqual(wrapFieldSelection('abc', 1, 1, '{{c10::', '}}'), {text:'a{{c10::}}bc',start:8,end:8});
  assert.equal(wrapFieldSelection('abc', -1, -1, '<br>', '').text, 'abc<br>');
  assert.equal(wrapFieldSelection('abc', 3, 0, '<i>', '</i>').text,'<i>abc</i>');
});

test('cloze numbering spans all fields and handles nested and multi-number imported clozes', () => {
  const fields=['{{c2::outer {{c6::inner}}}}', '{{c1,10::text::hint}}'];
  assert.equal(nextClozeNumber(fields,false),11);
  assert.equal(nextClozeNumber(fields,true),10);
  assert.equal(nextClozeNumber([''],true),1);
  assert.deepEqual(parseNoteTags('a a\n中文::标签  b'),['a','中文::标签','b']);
  assert.equal(noteDraftChanged(['<br>'],['<br>'],'a  a','a'),false);
  assert.equal(noteDraftChanged(['<br> '],['<br>'],'a','a'),true);
});

test('field reorder and deletion preserve old ord, metadata and Core content mapping; new fields use null', () => {
  const original=[{ord:0,name:'A',font:'Font-A',sticky:true},{ord:1,name:'B',font:'Font-B',rtl:true},{ord:2,name:'C',future:{value:7}}];
  const moved=serializeNotetypeFields(original,[{ord:1,name:'B'},{ord:0,name:'A'},{ord:2,name:'C'}]);
  assert.deepEqual(moved.map(f=>['value-A','value-B','value-C'][f.ord]),['value-B','value-A','value-C']);
  assert.equal(moved[0].font,'Font-B');assert.equal(moved[0].rtl,true);assert.equal(moved[1].sticky,true);
  const deleted=serializeNotetypeFields(original,[{ord:0,name:'A'},{ord:2,name:'Renamed C'},{ord:null,name:'New'}]);
  assert.deepEqual(deleted.map(f=>f.ord),[0,2,null]);assert.deepEqual(deleted[1].future,{value:7});
  assert.equal(original[2].name,'C');assert.throws(()=>serializeNotetypeFields(original,[{ord:8,name:'Bad'}]));
});

test('renamed IO stock identity is decoded from Core config, independent of name', () => {
  const config=new 协议写入器();config.写入变长整数(1,1);config.写入变长整数(9,6);
  const type=new 协议写入器();type.写入字符串(2,'任意导入名称');type.写入子消息(7,config);
  const view=decodeNotetype(type.转为字节());assert.equal(view.kind,1);assert.equal(view.originalStockKind,6);
});

function panel(confirm=async()=>false,picker=async()=>null) {
  const Panel=loadComponentLogic('components/browser/浏览编辑区.ets','浏览编辑区',{
    ...noteInterfaceDependencies(),
    noteDraftChanged,parseNoteTags,confirmNoteDiscard:confirm,从图库选取图片:picker,
    resourceText:(_ctx,key)=>key,$r:key=>key
    ,NoteAudioPreview:class {async dispose(){}},discardNoteRecordings:async()=>{}
  });
  const instance=new Panel();let closes=0;
  Object.assign(instance,{initialFieldValues:['old','<img src="existing.png">'],initialTags:'tag',fieldNames:['A','B'],
    onCancel:()=>closes++,getUIContext:()=>({getHostContext:()=>({})})});
  instance.aboutToAppear();
  return {instance,get closes(){return closes;}};
}

test('editor close guard preserves dirty draft on cancel, blocks busy, and ignores late confirmation after disposal', async()=>{
  const clean=panel();await clean.instance.requestClose();assert.equal(clean.closes,1);
  const dirty=panel();dirty.instance.更新字段(0,'new');await dirty.instance.requestClose();assert.equal(dirty.closes,0);
  const yes=panel(async()=>true);yes.instance.tags='changed';yes.instance.busy=true;await yes.instance.requestClose();assert.equal(yes.closes,0);
  yes.instance.busy=false;await yes.instance.requestClose();assert.equal(yes.closes,1);
  let resolve;const leaving=panel(()=>new Promise(r=>resolve=r));leaving.instance.tags='changed';
  const pending=leaving.instance.requestClose();leaving.instance.aboutToDisappear();resolve(true);await pending;assert.equal(leaving.closes,0);
});

test('existing-note image attachments keep imported HTML and failed saves retain draft and media cache',async()=>{
  const h=panel();h.instance.applyFieldMedia(1,h.instance.fieldValues[1],[{id:1,fieldIndex:1,uri:'photo://new',filename:''}],[]);
  let attempts=0,imports=0;const saved=[];
  h.instance.onSave=async(fields,tags,images)=>{
    const result=await prepareNoteImageFields(fields,images,async()=>{imports++;return 'safe.png';});
    saved.push({fields:result,tags});return ++attempts>1;
  };
  await h.instance.提交();assert.equal(h.closes,0);assert.equal(h.instance.images.length,1);
  await h.instance.提交();assert.equal(imports,1);assert.equal(h.closes,0,'successful save navigation belongs to the page, never the cancel callback');
  assert.deepEqual(saved[1].fields,['old','<img src="existing.png"><br><img src="safe.png">']);
  assert.deepEqual(h.instance.fieldValues,['old','<img src="existing.png">']);
});

test('new and existing editors both use the shared selection toolbar and guard their close controls',()=>{
  const read=p=>readFileSync(new URL('../../entry/src/main/ets/'+p,import.meta.url),'utf8');
  for(const path of ['pages/添加笔记页.ets','components/browser/浏览编辑区.ets'])assert.match(read(path),/NoteFieldCard\(\{/);
  const panel=read('components/browser/浏览编辑区.ets');
  assert.match(panel,/onBack:[^]*?this\.requestClose\(\)/);
  assert.match(read('pages/EditNotePage.ets'),/backRequest: this\.backRequest/);
  assert.match(read('components/common/NoteFieldCard.ets'),/NoteAudioField\(/);
  assert.match(read('components/common/NoteAudioField.ets'),/NoteFieldEditor\(/);
  assert.match(read('pages/添加笔记页.ets'),/\.onBackPressed\([^]*?this\.onBackPress\(\)/);
});

test('IO save uses Core field indices, permanent media and explicit target deck, leaving extra fields intact',async()=>{
  const writes=[];
  const Adapter=loadPlatformModule('backend/AnkiNoteCreation.ets','AnkiNoteCreation',{
    笔记服务:class{async 新建笔记(){return {fields:['','','','','extra'],tags:[]};} async 添加笔记(note,deck){writes.push({note,deck});}},
    笔记类型服务:class{},图片遮罩服务:class{async 获取图片遮罩字段(){return {遮罩:2,图片:0,标题:3,额外:1};}},
    prepareNoteImageFields,importNoteImage:async()=> 'normalized.png'
  });
  const adapter=new Adapter();await adapter.saveOcclusion({deckId:123,notetypeId:4,uri:'photo://one',occlusions:'{{c1::image-occlusion:rect:left=0.1:top=0.1:width=0.2:height=0.2}}',header:'h',backExtra:'b',tags:['io']});
  assert.equal(writes[0].deck,123);assert.deepEqual(writes[0].note.fields,['<img src="normalized.png">','b','{{c1::image-occlusion:rect:left=0.1:top=0.1:width=0.2:height=0.2}}','h','extra']);
});


test('Core editing capabilities follow renamed IO and multi-field Cloze structure and propagate read errors', async()=>{
  const Service=loadPlatformModule('backend/笔记类型服务.ts','笔记类型服务',{
    后端会话:{获取实例:()=>({})},NOTE_TYPE_KIND_CLOZE:1,
    图片遮罩服务:class{async 获取图片遮罩字段(){return {遮罩:2,图片:0,标题:3,额外:1};}}
  });
  const service=new Service();let clozeReads=0;
  service.获取填空字段序号=async()=>{clozeReads++;return [2,4];};
  service.获取笔记类型=async()=>({name:'renamed',kind:1,originalStockKind:6});
  const io=await service.获取编辑笔记类型(9);
  assert.deepEqual(io.clozeFieldOrds,[2,4]);assert.deepEqual(io.imageOcclusionFields,[2,0,3,1]);
  service.获取笔记类型=async()=>({name:'Cloze',kind:0,originalStockKind:0});
  assert.deepEqual((await service.获取编辑笔记类型(8)).clozeFieldOrds,[]);assert.equal(clozeReads,1);
  service.获取笔记类型=async()=>({name:'custom',kind:1});
  service.获取填空字段序号=async()=>{throw Error('structure read failed');};
  await assert.rejects(service.获取编辑笔记类型(7),/structure read failed/);
});

test('pending discard blocks save, duplicate confirmation and media draft application',async()=>{
  let resolve,confirms=0,picks=0,saves=0;
  const h=panel(()=>{confirms++;return new Promise(r=>resolve=r);},async()=>{picks++;return 'photo://x';});
  h.instance.tags='dirty';h.instance.onSave=async()=>{saves++;return true;};
  const closing=h.instance.requestClose();await h.instance.requestClose();
  h.instance.applyFieldMedia(0,'late',[{id:1,fieldIndex:0,uri:'photo://x',filename:''}],[]);await h.instance.提交();
  assert.equal(h.instance.fieldValues[0],'old');assert.equal(h.instance.images.length,0);
  assert.equal(confirms,1);assert.equal(picks,0);assert.equal(saves,0);
  resolve(false);await closing;assert.equal(h.closes,0);assert.equal(h.instance.tags,'dirty');
});


async function creationPage(confirm) {
  const h=creationPageHarness({confirm}); await h.ready; h.loads.length=0;
  h.page.字段值列表=['draft']; h.page.标签='tag'; h.page.fieldImages=[{uri:'photo://one'}];
  return {page:h.page,loads:h.loads,closes:h.pops};
}

test('new note type cancellation restores selection while preserving fields, tags and images',async()=>{
  let resolve;const h=await creationPage(()=>new Promise(r=>resolve=r));
  const pending=h.page.加载笔记类型(2);
  assert.equal(h.page.confirmingDiscard,true);
  await h.page.加载笔记类型(3);await h.page.requestExit();assert.deepEqual(h.loads,[]);
  resolve(false);await pending;
  assert.equal(h.page.已选笔记类型ID,1);assert.equal(h.page.typeSelectorVersion,1);
  assert.deepEqual(h.page.字段值列表,['draft']);assert.equal(h.page.标签,'tag');assert.equal(h.page.fieldImages.length,1);
  assert.deepEqual(h.closes,[]);
  const yes=await creationPage(async()=>true);await yes.page.加载笔记类型(2);
  assert.deepEqual(yes.loads,[2]);assert.deepEqual(yes.page.fieldImages,[]);
});

test('new note discard blocks busy exit and cannot navigate or reload after disposal',async()=>{
  for(const operation of ['requestExit','加载笔记类型']){
    let resolve;const h=await creationPage(()=>new Promise(r=>resolve=r));
    const pending=h.page[operation](2);h.page.pageActive=false;resolve(true);await pending;
    assert.deepEqual(h.loads,[]);assert.deepEqual(h.closes,[]);
  }
  const h=await creationPage(async()=>true);h.page.pickingFieldImage=true;
  await h.page.requestExit();await h.page.加载笔记类型(2);assert.deepEqual(h.loads,[]);assert.deepEqual(h.closes,[]);
  h.page.pickingFieldImage=false;await h.page.requestExit();assert.deepEqual(h.closes,['pop']);
});
