// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import assert from 'node:assert/strict';
import { HOME_SHORTCUTS, EDITOR_SHORTCUTS, FIELD_SHORTCUTS, TEMPLATE_SHORTCUTS, KEYBOARD_HELP_SECTIONS,
  keyboardHelpSections, editorShortcutCommand, shortcutCommand, studyShortcutRows } from '../../entry/src/main/ets/model/KeyboardShortcuts.ts';
import { BROWSER_SHORTCUTS } from '../../entry/src/main/ets/model/BrowserKeyboard.ts';
import { defaultStudyControls, STUDY_CONTROLS_KEY } from '../../entry/src/main/ets/model/StudyControls.ts';
import { AppInterfaceTracker, APP_INTERFACE_SURFACES } from '../../entry/src/main/ets/model/AppInterface.ts';
import { SETTINGS_GROUPS } from '../../entry/src/main/ets/model/SettingsStructure.ts';
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

test('learning help uses every executing shortcut table and the current study configuration', () => {
  const controls=defaultStudyControls(), sections=keyboardHelpSections(JSON.stringify(controls));
  assert.deepEqual(sections.map(item=>item.id),['home','study','browser','editor','template']);
  assert.deepEqual(sections[0].shortcuts,HOME_SHORTCUTS);
  assert.deepEqual(sections[1].shortcuts,studyShortcutRows(defaultStudyKeyboard().bindings));
  assert.deepEqual(sections[2].shortcuts,BROWSER_SHORTCUTS);
  assert.deepEqual(sections[3].shortcuts,EDITOR_SHORTCUTS.concat(FIELD_SHORTCUTS));
  assert.deepEqual(sections[4].shortcuts,TEMPLATE_SHORTCUTS);
  controls.keyboard={version:1,bindings:[{key:'ctrl+x',command:'easy',side:'answer'}]};
  assert.deepEqual(keyboardHelpSections(JSON.stringify(controls))[1].shortcuts,[{command:'easy:answer',keys:'Ctrl+X [A]',titleKey:'rating_easy'}]);
  controls.keyboard.bindings=[];assert.deepEqual(keyboardHelpSections(JSON.stringify(controls))[1].shortcuts,[]);
  assert.deepEqual(keyboardHelpSections('invalid')[1].shortcuts,sections[1].shortcuts);
  for(const locale of ['base','en_US']){
    const strings=new Map(JSON.parse(readFileSync(new URL(`../../entry/src/main/resources/${locale}/element/string.json`,import.meta.url),'utf8')).string.map(item=>[item.name,item.value]));
    for(const section of sections)for(const key of [section.titleKey,section.hintKey,...section.shortcuts.map(item=>item.titleKey)])assert.ok(strings.get(key),locale+': '+key);
  }
});

test('learning help forwards its existing entry, expands shared rows, updates JIDE and releases observations', async () => {
  const tracker=new AppInterfaceTracker(), events=[];
  const Glossary=loadComponentLogic('components/settings/术语分组.ets','术语分组',{$r:key=>key});
  const glossary=new Glossary();glossary.onKeyboardHelp=()=>events.push('keyboard');
  glossary.打开说明回调=(...args)=>events.push(args);
  glossary.openEntry(glossary.条目列表.find(item=>item.目录ID==='help_shortcuts'));
  glossary.openEntry(glossary.条目列表.find(item=>item.目录ID==='help_bury'));
  assert.deepEqual(events,['keyboard',['app.string.glossary_bury_label','app.string.glossary_bury_help']]);
  const Help=loadComponentLogic('components/KeyboardShortcutHelp.ets','KeyboardShortcutHelp',{
    keyboardHelpSections,defaultStudyControls,STUDY_CONTROLS_KEY,appInterface:tracker,readStudyControls:async()=>defaultStudyControls(),
    localizedNamedResourceText:(_context,_locale,key)=>key
  });
  const help=new Help();help.getUIContext=()=>({});help.toggleSection('home');assert.deepEqual(help.expandedIds,[]);
  help.aboutToAppear();help.toggleSection('home');help.toggleSection('browser');help.toggleSection('missing');
  await new Promise(setImmediate);
  assert.deepEqual(help.expandedIds,['home','browser']);
  const observation=()=>tracker.snapshot().find(item=>item.surface==='keyboard_shortcuts');
  assert.equal(observation().sectionId,'help');
  assert.deepEqual(observation().items.filter(item=>item.selected).map(item=>item.id),['home','browser']);
  help.toggleSection('home');assert.deepEqual(help.expandedIds,['browser']);
  help.controlsJson=JSON.stringify({...defaultStudyControls(),keyboard:{version:1,bindings:[]}});help.publishInterface();
  assert.equal(observation().values.find(item=>item.id==='study_bindings').value,'[]');
  help.aboutToDisappear();help.toggleSection('study');help.publishInterface();assert.deepEqual(tracker.snapshot(),[]);
  const source=readFileSync(new URL('../../entry/src/main/ets/components/设置面板.ets',import.meta.url),'utf8');
  const start=source.indexOf('  private handleBackRequest('),method=source.slice(start,source.indexOf('\n  }',start)+4);
  const Host=new Function(stripTypeScriptTypes('class Host{'+method+'}')+';return Host;')();
  const host=Object.assign(new Host(),{keyboardHelpOpen:true,navigateBack:()=>events.push('back')});
  host.handleBackRequest();assert.equal(host.keyboardHelpOpen,false);assert.equal(events.length,2);
  host.handleBackRequest();assert.equal(events.at(-1),'back');
});

test('shortcut guide has one learning-help entry and reuses the shared settings rows and dialog', () => {
  assert.equal(SETTINGS_GROUPS.find(group=>group.id==='help').items.find(item=>item.id==='help_shortcuts').opens,'keyboard_shortcuts');
  const surface=APP_INTERFACE_SURFACES.find(item=>item.id==='keyboard_shortcuts');
  assert.equal(surface.parent,'settings');assert.deepEqual(surface.items.map(item=>item.id),[...KEYBOARD_HELP_SECTIONS.map(item=>item.id),'retry','close']);
  for(const id of ['home_more','study_more','browser_more_settings','add_note','edit_note_form','notetype_editor']){
    assert.ok(APP_INTERFACE_SURFACES.find(surface=>surface.id===id).items.every(item=>item.id!=='keyboard'),id);
  }
  const root=new URL('../../entry/src/main/ets/',import.meta.url),read=path=>readFileSync(new URL(path,root),'utf8');
  for(const path of ['pages/首页.ets','pages/学习页.ets','pages/添加笔记页.ets','components/browser/浏览编辑区.ets','components/settings/笔记类型编辑器.ets'])assert.doesNotMatch(read(path),/KeyboardShortcutHelp|keyboardHelpOpen/);
  assert.match(read('components/设置面板.ets'),/术语分组\(\{[\s\S]*?onKeyboardHelp:[^\n]*this\.keyboardHelpOpen = true/);
  assert.match(read('components/设置面板.ets'),/KeyboardShortcutHelp\(\{ onClose:[^\n]*this\.keyboardHelpOpen = false/);
  const help=read('components/KeyboardShortcutHelp.ets');
  assert.match(help,/字段帮助面板\(/);assert.match(help,/SettingsActionRow\(\{/);assert.match(help,/expanded: this\.expandedIds\.includes\(section\.id\)/);
  assert.match(help,/KeyboardShortcutList\(\{ shortcuts: section\.shortcuts/);
});

test('learning help reads saved bindings on cold entry, supports failure retry and ignores late reads', async () => {
  const tracker=new AppInterfaceTracker(), saved={...defaultStudyControls(),keyboard:{version:1,bindings:[{key:'x',command:'easy',side:'answer'}]}};
  let fail=true,release,pending=false;
  const Help=loadComponentLogic('components/KeyboardShortcutHelp.ets','KeyboardShortcutHelp',{
    keyboardHelpSections,defaultStudyControls,STUDY_CONTROLS_KEY,appInterface:tracker,
    localizedNamedResourceText:(_context,_locale,key)=>key,
    readStudyControls:async()=>{if(pending)await new Promise(resolve=>release=resolve);if(fail)throw Error('disk');return saved;}
  });
  const help=new Help();help.getUIContext=()=>({});help.aboutToAppear();help.toggleSection('study');
  assert.equal(help.studyLoading,true);assert.deepEqual(help.sections().find(section=>section.id==='study').shortcuts,[]);
  await new Promise(setImmediate);assert.equal(help.studyFailed,true);
  assert.ok(tracker.snapshot()[0].items.some(item=>item.id==='retry'));
  help.toggleSection('study');assert.ok(tracker.snapshot()[0].items.every(item=>item.id!=='retry'));help.toggleSection('study');
  fail=false;await help.reloadStudyControls();assert.equal(help.studyReady,true);assert.equal(help.studyFailed,false);
  assert.deepEqual(help.sections().find(section=>section.id==='study').shortcuts,[{command:'easy:answer',keys:'X [A]',titleKey:'rating_easy'}]);
  pending=true;const old=help.reloadStudyControls();help.aboutToDisappear();release();await old;
  assert.deepEqual(tracker.snapshot(),[]);assert.equal(help.studyReady,false);
  pending=false;help.aboutToAppear();await new Promise(setImmediate);assert.equal(help.studyReady,true);
  pending=true;const reading=help.reloadStudyControls();help.controlsJson=JSON.stringify({...defaultStudyControls(),keyboard:{version:1,bindings:[]}});
  release();await reading;assert.deepEqual(help.sections().find(section=>section.id==='study').shortcuts,[],'newer configuration wins');
  help.aboutToDisappear();
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
