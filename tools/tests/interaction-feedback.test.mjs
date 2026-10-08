// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { resultUndoStatus, FEEDBACK_ACTIONS, INTERACTION_FEEDBACK_SUPPORT } from '../../entry/src/main/ets/model/InteractionFeedback.ts';
import { keyboardViewportHeight } from '../../entry/src/main/ets/model/WindowSafeLayout.ts';
import { NoteEditorWheelSession } from '../../entry/src/main/ets/model/NoteEditorWheel.ts';
import { buildAgentAppStructure } from '../../entry/src/main/ets/model/agent/AgentAppStructure.ts';
import { loadComponentLogic } from './platform-module-harness.mjs';

test('nearby undo is limited to a new single Core step; unavailable, unchanged and multiple steps have no undo',()=>{
  const before={undo:'old',redo:'',lastStep:4}, after={undo:'bury',redo:'',lastStep:5};
  assert.equal(resultUndoStatus(before,after),after);
  for(const current of [before,{...after,lastStep:6},{...after,undo:''},null]) assert.equal(resultUndoStatus(before,current),null);
  assert.equal(resultUndoStatus(null,after),null);
});

test('rapid text updates finish the current transition then animate the latest value; disposal rejects late completion',()=>{
  const finishes=[], changes=[];
  const Text=loadComponentLogic('components/common/ChangingText.ets','ChangingText',{
    $r:k=>k,TextAlign:{Center:0},currentMotionProfile:()=>({textMs:120}),motionAnimation:duration=>({duration})});
  const text=new Text(); text.value='1'; text.getUIContext=()=>({animateTo(options,change){changes.push(options.duration);change();finishes.push(options.onFinish);}});
  text.aboutToAppear();assert.deepEqual(changes,[]);
  text.value='2';text.changed();assert.equal(text.previous,'1');assert.equal(text.current,'2');
  text.value='3';text.changed();text.value='4';text.changed();assert.equal(text.current,'2');
  finishes.shift()();assert.equal(text.previous,'2');assert.equal(text.current,'4');assert.deepEqual(changes,[120,120]);
  text.aboutToDisappear();text.value='5';finishes.shift()();assert.equal(text.current,'4');
});

test('result notice owns and cancels expiry; persistent recovery cannot disappear on the old result timer',()=>{
  const timers=new Map();let next=0,dismissed=0;
  const Notice=loadComponentLogic('components/common/ResultNotice.ets','ResultNotice',{
    setTimeout:(fn)=>{timers.set(++next,fn);return next;},clearTimeout:id=>timers.delete(id)});
  const notice=new Notice();notice.duration=6000;notice.onDismiss=()=>dismissed++;notice.aboutToAppear();assert.equal(timers.size,1);
  notice.duration=0;notice.restart();assert.equal(timers.size,0);assert.equal(dismissed,0);
  notice.duration=6000;notice.restart();const late=[...timers.values()][0];notice.aboutToDisappear();late();assert.equal(dismissed,0);
});

test('keyboard clipping uses the measured window origin and avoids double shrinking an already resized viewport',()=>{
  assert.equal(keyboardViewportHeight(800,0,500),500);
  assert.equal(keyboardViewportHeight(500,0,500),500);
  assert.equal(keyboardViewportHeight(760,40,500),460);
  assert.equal(keyboardViewportHeight(760,40,0),760);
});

test('editor restores source and visual ranges, collapsed caret, and rejects stale, hidden or disabled focus',()=>{
  const callbacks=[],selected=[],focus=[];
  const Editor=loadComponentLogic('components/common/NoteFieldEditor.ets','NoteFieldEditor',{
    NoteEditorWheelSession,TextAreaController:class{},RichEditorController:class{},MenuPolicy:{HIDE:0},setTimeout:fn=>{callbacks.push(fn);return 1;}});
  const editor=new Editor();Object.assign(editor,{sourceMode:true,foreground:true,wheelActive:true,inputKey:'field',selectionStart:2,selectionEnd:5});
  editor.getUIContext=()=>({getFocusController:()=>({requestFocus:id=>focus.push(id)})});
  editor.controller={setTextSelection:(...range)=>selected.push(range),caretPosition:pos=>selected.push(['caret',pos])};
  editor.richController={setSelection:(...range)=>selected.push(range),setCaretOffset:pos=>selected.push(['caret',pos])};
  editor.focusInput(true);callbacks.shift()();assert.deepEqual(selected[0],[2,5,{menuPolicy:0}]);assert.equal(focus[0],'field-source');
  editor.sourceMode=false;editor.ready=true;editor.focusInput(false);callbacks.shift()();assert.deepEqual(selected[1],[2,5,{menuPolicy:0}]);
  editor.selectionEnd=2;editor.focusInput(false);callbacks.shift()();assert.deepEqual(selected[2],['caret',2]);
  editor.focusInput(false);editor.focusInput(false);callbacks.shift()();assert.equal(selected.length,3);callbacks.shift()();assert.equal(selected.length,4);
  for(const flag of ['foreground','disabled','disposed']){
    editor.foreground=true;editor.disabled=false;editor.disposed=false;editor.focusInput(false);
    editor[flag]=flag==='foreground'?false:true;callbacks.shift()();assert.equal(selected.length,4);
  }
});

test('JIDE reads shared feedback declarations and actual enabled state without inventing an executable agent action',()=>{
  const observed={surface:'study_feedback',sectionId:'recovery',selectedId:'',optionIds:[],optionLabels:[],busy:false,controlsComplete:true,
    items:FEEDBACK_ACTIONS.map(item=>({...item,title:'',enabled:item.id==='retry',selected:false})),values:[{id:'message',value:'offline'}]};
  const structure=buildAgentAppStructure({simple:true,agent:true,cloudDeck:false,themeHasTextures:false},'study_feedback','',key=>key,[],[],[observed],'study');
  assert.equal(structure.interactionFeedback,INTERACTION_FEEDBACK_SUPPORT);
  const surface=structure.surfaces.find(item=>item.id==='study_feedback');
  assert.equal(surface.items.find(item=>item.id==='retry').enabled,true);
  assert.equal(surface.items.find(item=>item.id==='result_undo').enabled,false);
  assert.equal(surface.items.find(item=>item.id==='retry').writeTool,'');
  assert.equal(structure.observations[0].values[0].value,'offline');
  assert.equal(structure.interactionFeedback.cardFlipAnimation,false);
  assert.match(structure.interactionFeedback.pageMotion, /shared_navigation_and_local_sections/);
  assert.match(structure.interactionFeedback.dialogMotion, /one_owner_per_surface/);
});

test('failed bury and unbury execute the real page recovery paths; unbury retry reloads without repeating the write',async()=>{
  const source=readFileSync(new URL('../../entry/src/main/ets/pages/学习页.ets',import.meta.url),'utf8');
  const names=['recoverStudy','retryStudy','埋藏或暂停当前卡','恢复埋藏'];
  const methods=names.map(name=>{const marker='  private '+(name==='recoverStudy'?'':'async ')+name+'(';const start=source.indexOf(marker);assert.ok(start>=0);return source.slice(start,source.indexOf('\n  }',start)+4);});
  const Host=new Function(stripTypeScriptTypes('class Host {'+methods.join('\n')+'}',{mode:'transform'})+';return Host;')();
  let writes=0,reads=0;
  const page=Object.assign(new Host(),{mounted:true,阶段:'answer',hasRenderedCard:true,recoveryMessage:'',当前卡片:{cardId:7},评分中:false,requestVersion:1,
    stopStudyTimers(){},audioSession:{stop(){}},publishInterface(){},isCurrentRequest:()=>true,消费待重渲染(){},maybeShowStudyGuide(){},startStudyTimers(){},invalidateCardWork(){},
    studySession:{historyStatus:async()=>null,buryCard:async()=>{writes++;throw Error('offline');},unburyDeck:async()=>{writes++;throw Error('offline');}},加载下一张卡:async()=>{reads++;}});
  await page.埋藏或暂停当前卡(2);assert.equal(page.阶段,'answer');assert.equal(page.recoveryMessage,'offline');assert.equal(writes,1);
  page.recoveryMessage='';await page.恢复埋藏();assert.equal(writes,2);await page.retryStudy();assert.equal(writes,2);assert.equal(reads,1);
});
