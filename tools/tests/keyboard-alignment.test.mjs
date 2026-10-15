// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import assert from 'node:assert/strict';
import { HOME_SHORTCUTS, editorShortcutCommand, shortcutCommand, studyShortcutRows } from '../../entry/src/main/ets/model/KeyboardShortcuts.ts';
import { defaultStudyKeyboard } from '../../entry/src/main/ets/model/StudyKeyboard.ts';
import { BrowserOperationController } from '../../entry/src/main/ets/model/BrowserOperationController.ts';
import { assertNoteEditorUnchanged } from '../../entry/src/main/ets/model/NoteEditorConflict.ts';
import { mapEditorFields, mapEditorImages, mapEditorAudios } from '../../entry/src/main/ets/model/NoteEditorDraftMapping.ts';
import { loadPlatformModule, loadComponentLogic } from './platform-module-harness.mjs';
import { creationPageHarness, creationType } from './note-creation-harness.mjs';

test('home and editor use exact AnkiDroid modifiers while blocked contexts keep their input', () => {
  for (const [key, command] of Object.entries({a:'add',b:'browse',y:'sync',s:'study',t:'stats','/':'search',d:'create_deck',f:'filtered',c:'check_database',p:'settings',m:'media',r:'rename',delete:'delete','shift+delete':'delete','ctrl+e':'export','ctrl+shift+i':'import','ctrl+shift+n':'notetypes','ctrl+b':'restore','ctrl+shift+b':'backup'})) {
    assert.equal(shortcutCommand(HOME_SHORTCUTS,key),command);
    assert.equal(shortcutCommand(HOME_SHORTCUTS,key,true),'');
  }
  for (const key of ['shift+a','ctrl+a','alt+s','ctrl+shift+e']) assert.equal(shortcutCommand(HOME_SHORTCUTS,key),'');
  for (const [key,command] of Object.entries({'ctrl+enter':'save','ctrl+numpadenter':'save','ctrl+s':'save','ctrl+d':'deck','ctrl+l':'templates','ctrl+n':'notetype','ctrl+shift+t':'tags','ctrl+p':'preview'})) {
    assert.equal(editorShortcutCommand(key,false),command); assert.equal(editorShortcutCommand(key,true),'');
  }
  for (let digit=0;digit<10;digit++) for (const pad of ['', 'numpad'])
    assert.equal(editorShortcutCommand('ctrl+shift+'+pad+digit,false),'field_'+(digit===0?9:digit-1));
  assert.equal(editorShortcutCommand('ctrl+alt+shift+1',false),'');
});

test('study help groups aliases but follows user bindings, card faces and disabled keyboards', () => {
  const rows=studyShortcutRows(defaultStudyKeyboard().bindings);
  assert.equal(rows.find(row=>row.command==='flip:question').keys,'Space / Enter / Numpadenter [Q]');
  assert.equal(rows.find(row=>row.command==='bury_note:both').keys,'=');
  assert.match(rows.find(row=>row.command==='suspend_note:both').keys,/!/);
  assert.deepEqual(studyShortcutRows([]),[]);
  assert.deepEqual(studyShortcutRows([{key:'x',command:'easy',side:'answer'}]),[
    {command:'easy:answer',keys:'X [A]',titleKey:'rating_easy'}]);
});

test('template-only refresh retains new-note fields, tags and temporary media on success and failure', async () => {
  const h=creationPageHarness();await h.ready;
  const p=h.page;p.字段值列表=['draft front','draft back'];p.标签='tag';
  p.fieldImages=[{id:1,fieldIndex:0,uri:'drawing',filename:'',kind:'drawing'}];
  p.fieldAudios=[{id:1,fieldIndex:1,uri:'recording',filename:'',temporary:true}];
  const before={fields:p.字段值列表.slice(),images:structuredClone(p.fieldImages),audios:structuredClone(p.fieldAudios)};
  h.backend.loadType=async()=>({...creationType(),name:'Template changed'});
  await p.refreshTemplates();assert.deepEqual(p.字段值列表,before.fields);assert.deepEqual(p.fieldImages,before.images);
  assert.deepEqual(p.fieldAudios,before.audios);assert.equal(p.标签,'tag');assert.equal(p.笔记类型名,'Template changed');
  h.backend.loadType=async()=>{throw Error('read failed');};await p.refreshTemplates();
  assert.deepEqual(p.字段值列表,before.fields);assert.deepEqual(p.fieldAudios,before.audios);assert.ok(p.错误信息);
});

test('type field mapping preserves unsaved text and attachment identity without sharing old objects', () => {
  const mapping=[1,-1,0];assert.deepEqual(mapEditorFields(['draft front','draft back'],mapping),['draft back','','draft front']);
  const image={id:9,fieldIndex:0,uri:'image',filename:'',reference:'ref',kind:'video'};
  const audio={id:8,fieldIndex:1,uri:'recording',filename:'',reference:'sound',label:'label',temporary:true};
  const images=mapEditorImages([image],mapping),audios=mapEditorAudios([audio],mapping);
  assert.deepEqual(images,[{...image,id:1,fieldIndex:2}]);assert.deepEqual(audios,[{...audio,id:1,fieldIndex:0}]);
  images[0].uri='changed';audios[0].label='changed';assert.equal(image.uri,'image');assert.equal(audio.label,'label');
});

test('editor property writes move sibling cards, reject stale notes, and freeze type mappings', async () => {
  const note={id:1,guid:'guid',notetypeId:2,mtimeSecs:3,usn:4,fields:['front'],tags:['tag']}, writes=[];
  let current=structuredClone(note),release;const gate=new Promise(resolve=>{release=resolve;});let reading=false;
  const Properties=loadPlatformModule('backend/NoteEditorProperties.ts','NoteEditorProperties',{
    BrowserOperationController,assertNoteEditorUnchanged,AppStorage:{setOrCreate(){}},
    笔记服务:class {async 获取笔记(){if(reading)await gate;return current;}async 获取笔记的卡片(){return [11,12];}},
    卡片服务:class {async 设置牌组(...args){writes.push(['deck',...args]);}},
    笔记类型服务:class {async 变更笔记类型(input){writes.push(['type',input]);}}
  });
  const properties=new Properties();assert.equal(await properties.move(note,42),true);assert.deepEqual(writes,[['deck',[11,12],42]]);
  current.fields=['changed elsewhere'];assert.equal(await properties.move(note,99),false);assert.equal(writes.length,1);
  current=structuredClone(note);reading=true;const input={noteIds:[999],newFields:[0,-1],newTemplates:[0],newNotetypeId:3};
  const pending=properties.changeType(note,input);input.newFields[0]=9;properties.dispose();release();
  assert.equal(await pending,true);assert.deepEqual(writes[1][1].newFields,[0,-1]);assert.deepEqual(writes[1][1].noteIds,[1]);
});

test('study voice saves via the native picker, retains recordings after cancellation and reports copy errors', async () => {
  const copies=[],messages=[],audio={id:1,fieldIndex:0,uri:'recording',filename:'',temporary:true};let targets=[],fail=false;
  const Voice=loadComponentLogic('components/StudyVoiceDialog.ets','StudyVoiceDialog',{
    NoteAudioPreview:class {async stop(){} async dispose(){}},
    picker:{DocumentSaveOptions:class {},DocumentViewPicker:class {async save(){return targets;}}},
    按描述符复制文件:async(...args)=>{copies.push(args);if(fail)throw Error('disk full');},
    resourceText:(_ctx,key)=>key,$r:key=>key,appInterface:{observe:value=>messages.push(value),leave(){}}
  });
  const voice=new Voice();voice.audios=[audio];voice.getUIContext=()=>({getHostContext:()=>({})});
  await voice.save();assert.deepEqual(copies,[]);assert.equal(voice.audios[0],audio);assert.equal(voice.saving,false);
  targets=['saved.m4a'];await voice.save();assert.deepEqual(copies,[['recording','saved.m4a']]);assert.match(voice.message,/keyboard_voice_saved$/);
  fail=true;await voice.save();assert.match(voice.message,/keyboard_voice_save_failed$/);assert.equal(voice.saving,false);
  voice.busy=true;await voice.save();assert.equal(copies.length,2);assert.ok(messages.length>0);
});


test('keyboard database checks show actual results in the common dialog for simple mode and suppress late UI',async()=>{
 const source=readFileSync(new URL('../../entry/src/main/ets/components/设置面板.ets',import.meta.url),'utf8');
 const start=source.indexOf('  private async checkDatabaseFromKeyboard('),method=source.slice(start,source.indexOf('\n  }',start)+4);
 const Host=new Function('showToastSafely','resourceText','$r',stripTypeScriptTypes('class Host {'+method+'}')+';return Host;')(()=>{},(_ctx,key,...args)=>key+args.join(','),key=>key);
 const page=Object.assign(new Host(),{maintenance:{error:'',problems:[]},getUIContext:()=>({}),执行数据库检查:async()=>{}});
 await page.checkDatabaseFromKeyboard();assert.equal(page.显示说明浮层,true);assert.match(page.说明正文,/check_db_passed/);
 page.maintenance.problems=['repair one','repair two'];await page.checkDatabaseFromKeyboard();assert.match(page.说明正文,/repair one\nrepair two/);
 page.maintenance.error='read failed';await page.checkDatabaseFromKeyboard();assert.equal(page.说明正文,'read failed');
 page.disposed=true;page.显示说明浮层=false;await page.checkDatabaseFromKeyboard();assert.equal(page.显示说明浮层,false);
});
