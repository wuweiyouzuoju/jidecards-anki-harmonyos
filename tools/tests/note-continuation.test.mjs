// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeNotetype } from '../../entry/src/main/ets/proto/messages/NotetypeMessages.ts';
import { 协议写入器 } from '../../entry/src/main/ets/proto/core/ProtoWriter.ts';
import { updateNotetypeFieldSticky } from '../../entry/src/main/ets/model/NotetypeFieldDraft.ts';
import { NoteCreationSession } from '../../entry/src/main/ets/model/NoteCreationSession.ts';
import { addNoteInterfaceControls } from '../../entry/src/main/ets/model/AppInterface.ts';
import { creationPageHarness, creationType, deferredCreation } from './note-creation-harness.mjs';
import { loadPlatformModule } from './platform-module-harness.mjs';
import { prepareNoteImageFields } from '../../entry/src/main/ets/model/NoteImageDraft.ts';
import { NoteDuplicateWarning } from '../../entry/src/main/ets/model/NoteDuplicateSession.ts';
import { 生成Occlusions字符串 } from '../../entry/src/main/ets/model/图片遮罩模型.ts';
const rectMask = (编号 = 1) => ({形状:'rect',编号,左:0.2,顶:0.1,宽:0.3,高:0.4});

function ioBackend() {
  const writes=[], imports=[]; let fail=false;
  const Adapter=loadPlatformModule('backend/AnkiNoteCreation.ets','AnkiNoteCreation',{
    笔记服务:class {async 新建笔记(){return {fields:['','','','','extra'],tags:[]};}
      async 添加笔记(note,deck){writes.push({note:structuredClone(note),deck});if(fail)throw Error('Core write failed');}},
    笔记类型服务:class {}, 笔记字段校验错误:class extends Error {}, NoteDuplicateWarning,
    图片遮罩服务:class {async 获取图片遮罩字段(){return {遮罩:2,图片:0,标题:3,额外:1};}},
    prepareNoteImageFields, importNoteImage:async uri=>{imports.push(uri);return 'permanent.png';}
  });
  return {adapter:new Adapter(),writes,imports,set fail(value){fail=value;}};
}

test('IO failure retains imported media and all masks; continuation honors sticky fields by Core index', async () => {
  const io=ioBackend(); io.fail=true;
  const type={...creationType(1,[true,false,true,true,false]),imageOcclusionFields:[2,0,3,1]};
  const h=creationPageHarness({type,backend:{saveOcclusion:input=>io.adapter.saveOcclusion(input)}}); await h.ready;
  h.page.图片遮盖_源图Uri='photo://one'; h.page.图片遮盖_遮罩列表=[rectMask()];
  h.page.图片遮盖_标题='header'; h.page.图片遮盖_额外='back'; h.page.标签='io';
  await h.page.提交(false); assert.equal(io.imports.length,1); assert.equal(h.pops.length,0);
  assert.equal(h.page.图片遮盖_源图Uri,'photo://one'); assert.equal(h.page.图片遮盖_额外,'back');
  assert.deepEqual(h.page.图片遮盖_遮罩列表,[rectMask()]);
  io.fail=false; await h.page.提交(false); assert.equal(io.imports.length,1); assert.equal(io.writes.length,2);
  assert.equal(io.writes[1].deck,123); assert.deepEqual(io.writes[1].note.fields,
    ['<img src="permanent.png">','back',生成Occlusions字符串([rectMask()]),'header','extra']);
  assert.match(h.page.图片遮盖_源图Uri,/collection\.media\/permanent\.png/);
  assert.deepEqual(h.page.图片遮盖_遮罩列表,[rectMask()]); assert.equal(h.page.图片遮盖_标题,'header');
  assert.equal(h.page.图片遮盖_额外,''); assert.equal(h.page.hasDraft(),false);
  h.page.图片遮盖_额外='next'; await h.page.提交(true);
  assert.equal(io.imports.length,1); assert.equal(h.pops.length,1); assert.equal(io.writes[2].note.fields[1],'next');
});

test('IO clears every non-sticky input only after success, and any new source invalidates old masks', async () => {
  const io=ioBackend();
  const h=creationPageHarness({type:{...creationType(1,[false,false,false,false,false]),imageOcclusionFields:[2,0,3,1]},
    backend:{saveOcclusion:input=>io.adapter.saveOcclusion(input)},picker:async()=> 'photo://new'}); await h.ready;
  h.page.图片遮盖_源图Uri='photo://one'; h.page.图片遮盖_遮罩列表=[rectMask()];
  h.page.图片遮盖_标题='h'; h.page.图片遮盖_额外='b'; h.page.标签='keep';
  await h.page.提交(false); assert.equal(h.page.图片遮盖_源图Uri,''); assert.deepEqual(h.page.图片遮盖_遮罩列表,[]);
  assert.equal(h.page.图片遮盖_标题,''); assert.equal(h.page.图片遮盖_额外,''); assert.equal(h.page.标签,'keep');
  assert.equal(h.page.hasDraft(),false); assert.equal(h.page.保存按钮可用(),false);
  h.page.图片遮盖_遮罩列表=[rectMask(2)]; await h.page.选取图片遮盖源图();
  assert.deepEqual(h.page.图片遮盖_遮罩列表,[]); assert.equal(h.page.occlusionImage.filename,'');
});

test('ordinary and Cloze creation share sticky rules while a retained Cloze supplies valid numbering', async () => {
  const h=creationPageHarness({type:{...creationType(1,[true,false]),kind:1,clozeFieldOrds:[0]}}); await h.ready;
  h.page.字段值列表=['{{c1::fixed cloze}}','extra']; await h.page.提交(false);
  assert.deepEqual(h.page.字段值列表,['{{c1::fixed cloze}}','']); assert.equal(h.page.提交前校验填空(),true);
  h.page.字段值列表[0]='plain text'; await h.page.提交(true);
  assert.equal(h.writes.length,1); assert.equal(h.pops.length,0); assert.match(h.page.错误信息,/cloze_missing/);
});

test('sticky decoding follows config field 5 and field ordering, absent flags are not sticky', () => {
  const type = new 协议写入器();
  for (const [ord, sticky] of [[2, undefined], [0, true], [1, false]]) {
    const field = new 协议写入器(), order = new 协议写入器(); order.写入变长整数(1, ord);
    field.写入子消息(1, order); field.写入字符串(2, 'Renamed ' + ord);
    if (sticky !== undefined) {
      const config = new 协议写入器(); config.写入变长整数(1, sticky ? 1 : 0);
      config.写入字符串(3, 'Font'); field.写入子消息(5, config);
    }
    type.写入子消息(8, field);
  }
  const view = decodeNotetype(type.转为字节());
  assert.deepEqual(view.fields.map(f => [f.ord, f.sticky === true]), [[0, true], [1, false], [2, false]]);
});

test('sticky service edits the latest full type by ord and preserves schema, templates and unknown data', async () => {
  const type = {id:7, flds:[{ord:2,name:'Moved',sticky:false,rtl:true,id:900},{ord:0,name:'First',future:{v:3}}],
    tmpls:[{qfmt:'{{First}}',afmt:'answer'}],css:'css',mod:42,future:{x:3}};
  const expected = structuredClone(type); expected.flds[0].sticky = true;
  assert.deepEqual(JSON.parse(updateNotetypeFieldSticky(JSON.stringify(type),2,true)), expected);
  assert.throws(() => updateNotetypeFieldSticky(JSON.stringify(type),1,true), /Missing/);
  const Service = loadPlatformModule('backend/笔记类型服务.ts', '笔记类型服务', {
    后端会话:{获取实例:()=>({})}, updateNotetypeFieldSticky
  });
  const service = new Service(), writes = [];
  service.获取笔记类型旧版 = async id => {assert.equal(id,7); return JSON.stringify(type);};
  service.更新笔记类型旧版 = async json => writes.push(JSON.parse(json));
  await service.setFieldSticky(7,2,true); assert.deepEqual(writes,[expected]);
  service.获取笔记类型旧版 = async () => {throw Error('read failed');};
  await assert.rejects(service.setFieldSticky(7,2,false), /read failed/); assert.equal(writes.length,1);
});

test('save and continue keeps deck, type, tags and sticky HTML including imported media, then accepts a second note', async () => {
  const h = creationPageHarness(); await h.ready;
  h.page.字段值列表 = ['Question', '<b>fixed</b><img src="pending">[sound:pending]']; h.page.标签 = 'topic topic group::one';
  h.page.fieldImages = [{id:1,fieldIndex:1,uri:'photo://one',filename:'',reference:'<img src="pending">'}];
  h.page.fieldAudios = [{id:1,fieldIndex:1,uri:'/cache/note-audio-1-1.mp3',filename:'',temporary:true,label:'a',reference:'[sound:pending]'}];
  await h.page.提交(false);
  assert.equal(h.pops.length,0); assert.equal(h.page.牌组ID,123); assert.equal(h.page.已选笔记类型ID,1);
  assert.deepEqual(h.page.字段值列表,['','<b>fixed</b><img src="saved.png">[sound:saved.mp3]']);
  assert.equal(h.page.标签,'topic group::one'); assert.equal(h.page.hasDraft(),false);
  assert.deepEqual(h.page.fieldImages,[]); assert.deepEqual(h.page.fieldAudios,[]);
  assert.equal(h.toasts.length,1); assert.deepEqual(h.imports,[['image','photo://one'],['audio','/cache/note-audio-1-1.mp3']]);
  h.page.更新字段(0,'Next question'); assert.equal(h.page.hasDraft(),true);
  await h.page.提交(false); assert.equal(h.writes.length,2); assert.equal(h.imports.length,2);
  assert.deepEqual(h.writes[1].fields,['Next question','<b>fixed</b><img src="saved.png">[sound:saved.mp3]']);
  assert.equal(h.page.hasDraft(),false);
});

test('failed saves keep complete draft and import cache; concurrent save and return cannot duplicate commits', async () => {
  const gate = deferredCreation(); let attempts = 0;
  const h = creationPageHarness({backend:{saveNote: async () => {attempts++; await gate.promise; if(attempts===1)throw Error('write failed');}}});
  await h.ready; h.page.字段值列表=['Question','fixed']; h.page.标签='topic';
  h.page.fieldImages=[{id:1,fieldIndex:0,uri:'photo://one',filename:''}];
  const pending = h.page.提交(false); await h.page.提交(true); await h.page.加载笔记类型(2); await h.page.requestExit();
  assert.equal(h.page.处理中,true); assert.deepEqual(h.page.字段值列表,['Question','fixed']);
  gate.resolve(); await pending;
  assert.equal(attempts,1); assert.equal(h.pops.length,0); assert.deepEqual(h.page.字段值列表,['Question','fixed']);
  assert.equal(h.page.fieldImages[0].filename,'saved.png'); assert.equal(h.page.标签,'topic'); assert.equal(h.page.hasDraft(),true);
  await h.page.提交(true); assert.equal(attempts,2); assert.equal(h.pops.length,1); assert.equal(h.imports.length,1);
  await h.page.提交(false); assert.equal(attempts,2);
});

test('partial image/audio import failure keeps successful filenames and retries only unfinished media', async () => {
  let audioAttempts = 0;
  const h=creationPageHarness({backend:{importAudio:async()=>{if(++audioAttempts===1)throw Error('audio');return 'voice.mp3';}}});
  await h.ready; h.page.字段值列表=['Q','sticky']; h.page.标签='t';
  h.page.fieldImages=[{id:1,fieldIndex:0,uri:'image',filename:''}];
  h.page.fieldAudios=[{id:1,fieldIndex:1,uri:'audio',filename:'',temporary:true,label:'a'}];
  await h.page.提交(false); assert.equal(h.writes.length,0); assert.equal(h.page.fieldImages[0].filename,'saved.png');
  assert.deepEqual(h.page.字段值列表,['Q','sticky']); assert.equal(h.page.fieldAudios.length,1);
  await h.page.提交(false); assert.equal(h.writes.length,1); assert.equal(h.imports.length,1); assert.equal(audioAttempts,2);
  assert.equal(h.page.字段值列表[1],'sticky[sound:voice.mp3]');
});

test('successful continuation establishes a clean baseline; edits, pending media and IO title changes require exit confirmation', async () => {
  let confirms=0; const h=creationPageHarness({confirm:async()=>{confirms++;return false;}}); await h.ready;
  h.page.字段值列表=['Q','fixed']; h.page.标签='t'; await h.page.提交(false);
  await h.page.requestExit(); assert.equal(confirms,0); assert.equal(h.pops.length,1);
  h.page.更新字段(1,'edited'); await h.page.requestExit(); assert.equal(confirms,1); assert.equal(h.pops.length,1);
  h.page.字段值列表=['','fixed']; h.page.标签='new-tag'; await h.page.requestExit(); assert.equal(confirms,2);
  const io=creationPageHarness({type:{...creationType(1,[false,false,true,false]),imageOcclusionFields:[0,1,2,3]},confirm:async()=>false});
  await io.ready; io.page.图片遮盖_标题='unsaved'; assert.equal(io.page.hasDraft(),true);
});

test('type switch cancellation and read failure preserve all content; only successful switch drops old attachments and sticky ordinals', async () => {
  const h=creationPageHarness({confirm:async()=>true}); await h.ready;
  h.page.字段值列表=['Q','sticky']; h.page.fieldImages=[{id:1,fieldIndex:0,uri:'image',filename:'imported.png'}];
  h.page.fieldAudios=[{id:1,fieldIndex:1,uri:'audio',filename:'imported.mp3',temporary:true}]; h.page.标签='topic';
  h.backend.loadType=async()=>{throw Error('type unavailable');}; await h.page.加载笔记类型(2);
  assert.equal(h.page.已选笔记类型ID,1); assert.deepEqual(h.page.字段值列表,['Q','sticky']); assert.equal(h.page.fieldImages.length,1);
  assert.equal(h.page.fieldAudios.length,1); assert.equal(h.page.标签,'topic'); assert.equal(h.cleanups.length,1);
  h.backend.loadType=async id=>creationType(id,[false,false]); await h.page.加载笔记类型(2);
  assert.equal(h.page.已选笔记类型ID,2); assert.deepEqual(h.page.字段值列表,['','']); assert.deepEqual(h.page.fieldSticky,[false,false]);
  assert.equal(h.page.fieldImages.length,0); assert.equal(h.page.fieldAudios.length,0); assert.equal(h.page.标签,'topic');
  assert.equal(h.cleanups.at(-1)[0].filename,'imported.mp3');
});

test('sticky update is a serialized type-property write; failure preserves config and draft, success never clears content', async () => {
  const gate=deferredCreation(), h=creationPageHarness({backend:{setFieldSticky:()=>gate.promise}}); await h.ready;
  h.page.字段值列表=['Q','A']; const pending=h.page.changeFieldSticky(0,true);
  assert.equal(h.page.处理中,false); assert.equal(h.page.stickySaving,true);
  const saving=h.page.提交(false); await h.page.加载笔记类型(2);
  assert.equal(h.writes.length,0); assert.equal(h.loads.length,1);
  gate.reject(Error('config')); await Promise.all([pending,saving]);
  assert.equal(h.page.stickySaving,false); assert.equal(h.page.处理中,false);
  assert.deepEqual(h.page.fieldSticky,[false,true]); assert.deepEqual(h.page.字段值列表,['Q','A']); assert.match(h.page.错误信息,/sticky_failed/);
  h.backend.setFieldSticky=async(...args)=>h.configs.push(args); await h.page.changeFieldSticky(0,true);
  assert.deepEqual(h.configs,[[1,0,true]]); assert.deepEqual(h.page.fieldSticky,[true,true]);
  assert.deepEqual(h.page.字段值列表,['Q','A']); await h.page.提交(false); assert.deepEqual(h.page.字段值列表,['Q','A']);
});

test('retention switches keep the rest of the editor available and an immediate save waits for persisted settings', async () => {
  const gate=deferredCreation(), h=creationPageHarness({backend:{setFieldSticky:()=>gate.promise}}); await h.ready;
  h.page.字段值列表=['Q','A']; const stateCount=h.states.length;
  const pending=h.page.changeFieldSticky(0,true);
  assert.equal(h.page.处理中,false); assert.equal(h.page.stickySaving,true);
  assert.ok(h.states.slice(stateCount).every(state=>state.busy===false));
  await h.page.changeFieldSticky(1,false);
  const saving=h.page.提交(false);
  assert.equal(h.writes.length,0);
  gate.resolve(); await Promise.all([pending,saving]);
  assert.equal(h.writes.length,1); assert.deepEqual(h.page.字段值列表,['Q','A']);
  assert.equal(h.page.stickySaving,false); assert.equal(h.page.处理中,false);
});

test('a type switch waits for retention settings and disposal cancels an unaccepted queued save', async () => {
  const gate=deferredCreation(), h=creationPageHarness({backend:{setFieldSticky:()=>gate.promise}}); await h.ready;
  const pending=h.page.changeFieldSticky(0,true), switching=h.page.加载笔记类型(2);
  assert.equal(h.loads.length,1); gate.resolve(); await Promise.all([pending,switching]);
  assert.deepEqual(h.loads,[1,2]); assert.deepEqual(h.page.fieldSticky,[false,false]);
  const exitGate=deferredCreation(), exit=creationPageHarness({backend:{setFieldSticky:()=>exitGate.promise}}); await exit.ready;
  exit.page.字段值列表=['Q','A']; const setting=exit.page.changeFieldSticky(0,true), saving=exit.page.提交(false);
  exit.page.aboutToDisappear(); const count=exit.states.length; exitGate.resolve(); await Promise.all([setting,saving]);
  assert.equal(exit.writes.length,0); assert.equal(exit.states.length,count); assert.equal(exit.pops.length,0);
});

test('an immediate IO save waits for source-image retention and uses the updated Core field setting', async () => {
  const gate=deferredCreation();
  const type={...creationType(1,[false,false,true,false]),imageOcclusionFields:[2,0,3,1]};
  const h=creationPageHarness({type,backend:{setFieldSticky:()=>gate.promise}}); await h.ready;
  h.page.图片遮盖_源图Uri='photo://one'; h.page.图片遮盖_遮罩列表=[rectMask()];
  const pending=h.page.changeFieldSticky(0,true);
  assert.equal(h.page.处理中,false); const saving=h.page.提交(false); assert.equal(h.writes.length,0);
  gate.resolve(); await Promise.all([pending,saving]);
  assert.equal(h.writes.length,1); assert.equal(h.page.图片遮盖_源图Uri,'photo://one');
  assert.deepEqual(h.page.图片遮盖_遮罩列表,[rectMask()]); assert.equal(h.page.stickySaving,false);
});

test('accepted save finishes after disposal without navigation, cleanup, toast or late draft reset', async () => {
  const gate=deferredCreation(); let commits=0;
  const h=creationPageHarness({backend:{saveNote:()=>gate.promise,committed:()=>commits++}}); await h.ready;
  h.page.字段值列表=['Q','fixed']; const pending=h.page.提交(false); await new Promise(setImmediate);
  h.page.aboutToDisappear(); const count=h.states.length; gate.resolve(); await pending;
  assert.equal(commits,1); assert.equal(h.states.length,count); assert.deepEqual(h.page.字段值列表,['Q','fixed']);
  assert.equal(h.pops.length,0); assert.equal(h.toasts.length,0);
});

test('notification failure after a successful write still completes and never exposes that note for retry', async () => {
  const h=creationPageHarness({backend:{committed:()=>{throw Error('storage');}}}); await h.ready;
  h.page.字段值列表=['Q','fixed']; await h.page.提交(false);
  assert.equal(h.writes.length,1); assert.deepEqual(h.page.字段值列表,['','fixed']); assert.equal(h.page.hasDraft(),false);
  assert.match(h.page.错误信息,/refresh_failed/);
});

test('session rejects saves while a type read is pending and ignores late type response after disposal', async () => {
  const gate=deferredCreation(), states=[], writes=[];
  const session=new NoteCreationSession({loadType:()=>gate.promise,saveNote:async input=>writes.push(input)},s=>states.push(s));
  const reading=session.loadType(1); await session.save({deckId:1,notetypeId:1,fields:['Q'],tags:[],images:[]},false);
  assert.equal(writes.length,0); session.dispose(); const count=states.length; gate.resolve(creationType()); await reading;
  assert.equal(states.length,count);
});

test('both save controls share unavailable states and resource-backed action semantics', () => {
  for(const blocked of [false,true]) {
    const controls=addNoteInterfaceControls({simple:true,tagsExpanded:false,occlusion:false,hasSource:false,
      busy:blocked,blocked,saveEnabled:true,hasTypes:true});
    assert.equal(controls.find(c=>c.id==='save').enabled,!blocked);
    assert.equal(controls.find(c=>c.id==='save_return').enabled,!blocked);
    if(!blocked)assert.equal(controls.find(c=>c.id==='save').titleKey,'add_note_save_continue');
  }
});

test('sticky configuration finishes after disposal without late fields, toast or navigation', async () => {
  const gate=deferredCreation(), h=creationPageHarness({backend:{setFieldSticky:()=>gate.promise}}); await h.ready;
  h.page.字段值列表=['Q','A']; const pending=h.page.changeFieldSticky(0,true); h.page.aboutToDisappear();
  const count=h.states.length; gate.resolve(); await pending;
  assert.equal(h.states.length,count); assert.deepEqual(h.page.fieldSticky,[false,true]);
  assert.deepEqual(h.page.字段值列表,['Q','A']); assert.equal(h.pops.length,0); assert.equal(h.toasts.length,0);
});

test('discard confirmation freezes editing and a late response cannot exit or switch types', async () => {
  for(const operation of ['requestExit','加载笔记类型']) {
    const gate=deferredCreation(), h=creationPageHarness({confirm:()=>gate.promise}); await h.ready;
    h.page.字段值列表=['Q','A']; const pending=h.page[operation](2);
    await h.page.提交(false); await h.page.changeFieldSticky(0,true); h.page.更新字段(0,'late');
    assert.equal(h.writes.length,0); assert.equal(h.configs.length,0); assert.equal(h.page.字段值列表[0],'Q');
    h.page.aboutToDisappear(); gate.resolve(true); await pending;
    assert.equal(h.pops.length,0); assert.equal(h.loads.length,1);
  }
});

test('late metadata callbacks cannot mutate a saving, confirming or disposed draft', async () => {
  const h=creationPageHarness(); await h.ready;
  h.page.updateTags('topic'); h.page.updateOcclusionText('header',true); h.page.updateOcclusionText('extra',false);
  for(const state of ['处理中','confirmingDiscard','pickingFieldImage','audioBusy','disposed']) {
    if(state==='disposed') h.page.aboutToDisappear();
    else h.page[state]=true;
    h.page.updateTags('late'); h.page.updateOcclusionText('late',true); h.page.updateOcclusionText('late',false);
    assert.equal(h.page.标签,'topic'); assert.equal(h.page.图片遮盖_标题,'header'); assert.equal(h.page.图片遮盖_额外,'extra');
    if(state!=='disposed') h.page[state]=false;
  }
});

test('switching type after continuation uses a new editor generation even when field names match', async () => {
  const h=creationPageHarness(); await h.ready; h.page.字段值列表=['Q','fixed']; await h.page.提交(false);
  const previous=h.page.fieldEditorVersion;
  await h.page.加载笔记类型(2); assert.equal(h.page.已选笔记类型ID,2);
  assert.equal(h.page.fieldEditorVersion,previous+1); assert.deepEqual(h.page.字段值列表,['','']);
});
