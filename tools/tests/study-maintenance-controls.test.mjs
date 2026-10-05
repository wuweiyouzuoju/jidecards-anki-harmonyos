// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import {defaultStudyControls,validateStudyControls,mappedStudyCommand,STUDY_CONTROLS_KEY} from '../../entry/src/main/ets/model/StudyControls.ts';
import {StudyScreenAwakeSession} from '../../entry/src/main/ets/model/StudyScreenAwakeSession.ts';
import {resolveStudyKey} from '../../entry/src/main/ets/model/StudyInputPolicy.ts';
import {loadPlatformModule} from './platform-module-harness.mjs';
import {localPreferenceApi} from './local-preference-harness.mjs';

test('window state restores after a late enable, preserves the original value and retries uncertain failures',async()=>{
 for(const initial of [false,true]) {
  let value=initial,release;const calls=[];
  const session=new StudyScreenAwakeSession({read:async()=>value,set:async next=>{
   calls.push(next);if(calls.length===1)await new Promise(resolve=>{release=resolve;});value=next;
  }});
  const enable=session.update(true);await new Promise(resolve=>setImmediate(resolve));
  const hide=session.update(false);release();await enable;await hide;
  assert.equal(value,initial);assert.deepEqual(calls,[true,initial]);
  await session.update(false);assert.equal(calls.length,2);
 }
 let fail=true,value=false;
 const session=new StudyScreenAwakeSession({read:async()=>value,set:async next=>{value=next;if(fail)throw Error('platform');}});
 await assert.rejects(session.update(true),/platform/);fail=false;
 await session.update(true);assert.equal(value,true);
 fail=true;await assert.rejects(session.update(false),/platform/);fail=false;
 await session.update(false);assert.equal(value,false);
});

test('real study preference service serializes saves, rejects stale state and reports persistence/application failures',async()=>{
 let saved=JSON.stringify(defaultStudyControls()),failFlush=false,failApply=false;const app=new Map();
 const AppStorage={get:()=>({}),setOrCreate:(key,value)=>{if(failApply)throw Error('apply');app.set(key,value);}};
 const local=localPreferenceApi(AppStorage);
 const prefs={getSync:(_key,fallback)=>saved??fallback,putSync:(_key,value)=>{saved=value;},flush:async()=>{if(failFlush)throw Error('disk');}};
 const api=loadPlatformModule('backend/StudyControlsService.ets','({readStudyControls,loadStudyControls,saveStudyControls})',{
  AppStorage,preferences:{getPreferences:async()=>prefs},STUDY_CONTROLS_KEY,defaultStudyControls,validateStudyControls,
  ...local
 });
 const before=await api.readStudyControls(),after={...before,keepScreenOn:true};
 const first=api.saveStudyControls(after,before),second=api.saveStudyControls({...after,gestureMode:'off'},before);
 const stale=assert.rejects(second,/changed_since_proposal/);await first;await stale;
 assert.deepEqual(await api.readStudyControls(),after);assert.equal(JSON.parse(app.get(STUDY_CONTROLS_KEY)).keepScreenOn,true);
 failFlush=true;await assert.rejects(api.saveStudyControls(before,after),error=>error instanceof local.LocalPreferenceWriteError&&!error.saved);
 failFlush=false;assert.deepEqual(await api.readStudyControls(),after);
 failApply=true;await assert.rejects(api.saveStudyControls(before,after),error=>error instanceof local.LocalPreferenceWriteError&&error.saved);
 failApply=false;assert.deepEqual(await api.readStudyControls(),before);await api.loadStudyControls();
 saved='{"keepScreenOn":true}';await assert.rejects(api.readStudyControls(),/invalid/);
});

const source=readFileSync(new URL('../../entry/src/main/ets/pages/学习页.ets',import.meta.url),'utf8');
function methods(names) {return names.map(name=>{const start=source.indexOf('  private '+name+'(');assert.notEqual(start,-1);return source.slice(start,source.indexOf('\n  }',start)+4);}).join('\n');}
test('actual keyboard handler honors mappings, protected keys, modifiers and every blocking phase',()=>{
 const calls=[];
 const Host=new Function('validateStudyControls','mappedStudyCommand','resolveStudyKey','studyKeyName','KeyType',
  'RATING_AGAIN','RATING_HARD','RATING_GOOD','RATING_EASY','BURY_SUSPEND_MODE_BURY_USER','BURY_SUSPEND_MODE_SUSPEND',
  stripTypeScriptTypes('class Host{'+methods(['controls','处理按键'])+'}',{mode:'transform'})+';return Host;')(
   validateStudyControls,mappedStudyCommand,resolveStudyKey,key=>key,{Down:0,Up:1},0,1,2,3,4,5);
 const page=Object.assign(new Host(),{阶段:'answer',Ctrl按下:false,timeboxNotice:null,
  controlsJson:JSON.stringify({...defaultStudyControls(),keys:[{input:'space',command:'easy'}]}),
  评分:n=>calls.push(n),返回:()=>calls.push('back'),请求删除当前卡:()=>calls.push('delete'),撤销上次:()=>calls.push('undo')});
 const key=(keyCode,type=0)=>page.处理按键({keyCode,type});
 key('space');assert.deepEqual(calls,[3]);calls.length=0;
 page.阶段='question';key('space');assert.deepEqual(calls,[]);
 for(const phase of ['loading','done','error']) {page.阶段=phase;key('space');assert.deepEqual(calls,[]);}
 page.阶段='answer';
 for(const field of ['cardRenderPending','editingPageOpen','studyGuideVisible','autoAdvanceSettingsOpen']) {
  page[field]=true;key('space');assert.deepEqual(calls,[]);page[field]=false;
 }
 key('control');key('space');assert.deepEqual(calls,[2],'Ctrl uses the existing policy');calls.length=0;
 key('z');assert.deepEqual(calls,['undo']);calls.length=0;key('control',1);assert.equal(page.Ctrl按下,false);
 key('space',1);assert.deepEqual(calls,[]);key('escape');key('delete');assert.deepEqual(calls,['back','delete']);
});

test('actual lifecycle gate borrows the window only while the study page is mounted, visible and foreground',()=>{
 const calls=[];const Host=new Function('validateStudyControls',stripTypeScriptTypes('class Host{'+methods(['controls','updateScreenAwake'])+'}',{mode:'transform'})+';return Host;')(validateStudyControls);
 const page=Object.assign(new Host(),{mounted:true,页面已显示:true,foreground:true,controlsJson:JSON.stringify({...defaultStudyControls(),keepScreenOn:true}),screenAwake:{update:async value=>calls.push(value)}});
 page.updateScreenAwake();
 for(const field of ['foreground','页面已显示','mounted']) {page[field]=false;page.updateScreenAwake();page[field]=true;}
 page.controlsJson=JSON.stringify(defaultStudyControls());page.updateScreenAwake();
 assert.deepEqual(calls,[true,false,false,false,false]);
});

test('mapping whitelist rejects system navigation and aliases; rating mappings never grade an unseen answer',()=>{
 for(const input of ['escape','back','control','delete','z'])assert.throws(()=>validateStudyControls({...defaultStudyControls(),keys:[{input,command:'easy'}]}),/invalid/);
 const mappings=[{input:'double',command:'easy'}];
 assert.equal(mappedStudyCommand(mappings,'double','question','flip'),'none');
 assert.equal(mappedStudyCommand(mappings,'double','answer','none'),'easy');
 assert.equal(mappedStudyCommand(mappings,'double','loading','none'),'none');
 assert.equal(mappedStudyCommand([],'escape','error','back'),'back');
});
