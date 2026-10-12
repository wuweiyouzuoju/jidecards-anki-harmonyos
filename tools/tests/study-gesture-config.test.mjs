// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import * as gestures from '../../entry/src/main/ets/model/StudyGestureConfig.ts';
import { defaultStudyControls, validateStudyControls, STUDY_CONTROLS_KEY } from '../../entry/src/main/ets/model/StudyControls.ts';
import { SIMPLE_MODE_KEY } from '../../entry/src/main/ets/model/AppLayoutState.ts';
import { visibleInterfaceItems } from '../../entry/src/main/ets/model/AppInterface.ts';
import { loadComponentLogic, loadPlatformModule } from './platform-module-harness.mjs';
import { localPreferenceApi } from './local-preference-harness.mjs';

test('complete schema validates side conflicts, inputs, actions and limits while preserving old controls',()=>{
  const config=gestures.defaultStudyGestureConfig();
  assert.equal(config.enabled,false);assert.deepEqual(validateStudyControls(defaultStudyControls()),defaultStudyControls());
  assert.deepEqual(gestures.validateStudyGestureConfig(config),config);
  const valid={version:1,enabled:true,tapLayout:'nine',bindings:[{input:'up',command:'edit',side:'question'},{input:'up',command:'replay',side:'answer'}]};
  assert.deepEqual(gestures.validateStudyGestureConfig(valid),valid);
  for(const invalid of [null,{...valid,version:2},{...valid,enabled:1},{...valid,tapLayout:'ten'},{...valid,extra:true},
    {...valid,bindings:[...valid.bindings,{input:'up',command:'undo',side:'both'}]},
    {...valid,bindings:[{input:'unknown',command:'good',side:'both'}]},
    {...valid,bindings:[{input:'up',command:'unknown',side:'both'}]},
    {...valid,bindings:[{input:'up',command:'good',side:'front'}]},
    {...valid,bindings:[{input:'up',command:'good',side:'both',extra:1}]},
    {...valid,bindings:Array(65).fill({input:'up',command:'good',side:'both'})}]) assert.throws(()=>gestures.validateStudyGestureConfig(invalid));
  assert.throws(()=>validateStudyControls({...defaultStudyControls(),gestureConfig:null}));
  assert.equal(gestures.completeStudyGestures({...config,enabled:true},true),undefined);
  assert.equal(gestures.completeStudyGestures(config,false),undefined);
});

test('tap layouts use card-local bounds; full bindings never inherit defaults or grade unseen answers',()=>{
  const config={...gestures.defaultStudyGestureConfig(),enabled:true};
  for(const [x,y,command] of [[0,0,'again'],[1,0,'hard'],[0,1,'good'],[1,1,'easy']]) {
    const input=gestures.studyGestureTapInput('four',x,y);
    assert.equal(gestures.studyGestureCommand(config,input,'answer'),command);
    assert.equal(gestures.studyGestureCommand(config,input,'question'),'flip');
  }
  assert.equal(gestures.studyGestureTapInput('nine',0.5,0.5),'nine_center');
  assert.equal(gestures.studyGestureTapInput('nine',1,1),'nine_bottom_right');
  for(const x of [-1,1.01,NaN,Infinity]) assert.equal(gestures.studyGestureTapInput('nine',x,0.5),'');
  assert.equal(gestures.studyGestureTapInput('invalid',0.5,0.5),'');
  assert.equal(gestures.studyGestureCommand({...config,bindings:[]},'left','answer'),'none');
  assert.equal(gestures.studyGestureCommand({...config,bindings:[{input:'up',command:'good',side:'both'}]},'up','question'),'none');
  assert.equal(gestures.studyGestureCommand(config,'double','answer'),'none');
  assert.ok(!gestures.activeStudyGestureInputs(config,'answer').includes('double'));
  assert.ok(gestures.activeStudyGestureInputs(config,'question').includes('double'));
  assert.deepEqual(gestures.activeStudyGestureInputs(config,'loading'),[]);
});

function editor(overrides={}) {
  const Dialog=loadComponentLogic('components/settings/StudyGestureSettings.ets','StudyGestureSettings',{
    ...gestures,defaultStudyControls,SIMPLE_MODE_KEY,namedResourceText:(_context,key)=>key,
    appInterface:{observe(){},leave(){}},readStudyControls:async()=>defaultStudyControls(),
    saveStudyControls:async next=>next,...overrides});
  return Object.assign(new Dialog(),{simple:false,alive:true,loaded:true,busy:false,getUIContext:()=>({})});
}
test('real settings replace overlapping bindings, retain other layout and keyboard, and save only in experimental mode',async()=>{
  const saved=[];const before={...defaultStudyControls(),keyboard:{version:1,bindings:[]},gestureConfig:gestures.defaultStudyGestureConfig()};
  const page=editor({readStudyControls:async()=>before,saveStudyControls:async(next,expected)=>saved.push({next,expected})});
  await page.reload();page.gesturesEnabled=true;page.inputIndex=0;page.commandIndex=gestures.STUDY_GESTURE_ACTIONS.findIndex(item=>item.id==='edit');
  page.sideIndex=1;page.add();page.sideIndex=2;page.add();
  assert.equal(page.bindings.filter(item=>item.input==='up').length,2);
  page.sideIndex=0;page.add();assert.equal(page.bindings.filter(item=>item.input==='up').length,1);
  const four=page.bindings.filter(item=>item.input.startsWith('four_'));
  page.setLayout(1);assert.ok(page.visibleBindings().every(item=>!item.input.startsWith('four_')));
  assert.deepEqual(page.bindings.filter(item=>item.input.startsWith('four_')),four);
  page.remove(page.bindings.find(item=>item.input==='up'));assert.ok(!page.bindings.some(item=>item.input==='up'));
  await page.save();assert.equal(saved.length,1);assert.deepEqual(saved[0].next.keyboard,before.keyboard);
  assert.equal(saved[0].next.gestureConfig.enabled,true);assert.equal(saved[0].next.gestureConfig.tapLayout,'nine');assert.equal(saved[0].expected,before);
  page.simple=true;page.add();await page.save();assert.equal(saved.length,1);
  assert.equal(visibleInterfaceItems('study_gestures',{simple:true,agent:true,cloudDeck:false,themeHasTextures:false}).length,0);
  assert.ok(visibleInterfaceItems('study_gestures',{simple:false,agent:true,cloudDeck:false,themeHasTextures:false}).some(item=>item.id==='enabled'));
});
test('settings retain failed drafts, ignore old reads, and finish accepted writes without closing a departed dialog',async()=>{
  const failed=editor({saveStudyControls:async()=>{throw Error('disk');}});failed.gesturesEnabled=true;await failed.save();
  assert.equal(failed.errorKey,'study_keyboard_save_failed');assert.equal(failed.gesturesEnabled,true);assert.equal(failed.busy,false);
  let release;const page=editor({readStudyControls:()=>new Promise(resolve=>{release=resolve;})});
  const read=page.reload();page.aboutToDisappear();release(defaultStudyControls());await read;assert.equal(page.loaded,false);
  const leaving=editor({saveStudyControls:()=>new Promise(resolve=>{release=resolve;})});
  leaving.onClose=()=>assert.fail('closed departed dialog');const save=leaving.save();leaving.aboutToDisappear();release();await save;
});

test('shared persistence rejects full-gesture edits in simple mode and keeps old configurations across unrelated saves',async()=>{
  let saved=JSON.stringify(defaultStudyControls()),simple=true,puts=0;
  const AppStorage={get:key=>key===SIMPLE_MODE_KEY?simple:{},setOrCreate(){}};
  const prefs={getSync:(_key,fallback)=>saved??fallback,putSync:(_key,value)=>{puts++;saved=value;},flush:async()=>{}};
  const local=localPreferenceApi(AppStorage);
  const api=loadPlatformModule('backend/StudyControlsService.ets','({readStudyControls,saveStudyControls})',{
    ...gestures,SIMPLE_MODE_KEY,STUDY_CONTROLS_KEY,defaultStudyControls,validateStudyControls,AppStorage,
    preferences:{getPreferences:async()=>prefs},...local});
  const before=await api.readStudyControls(),after={...before,gestureConfig:{...gestures.defaultStudyGestureConfig(),enabled:true}};
  await assert.rejects(api.saveStudyControls(after,before),/experimental_only/);assert.equal(puts,0);
  simple=false;await api.saveStudyControls(after,before);simple=true;
  await api.saveStudyControls({...after,keepScreenOn:true},after);
  assert.deepEqual((await api.readStudyControls()).gestureConfig,after.gestureConfig);
  await assert.rejects(api.saveStudyControls({...after,gestureConfig:undefined},await api.readStudyControls()),/experimental_only/);
  let release;const current=await api.readStudyControls();simple=false;
  const other={getSync:()=>false,putSync(){},flush:()=>new Promise(resolve=>{release=resolve;})};
  const blocking=local.saveLocalPreference(other,'other',true,false);await new Promise(resolve=>setImmediate(resolve));
  const pending=api.saveStudyControls({...current,gestureConfig:{...current.gestureConfig,enabled:false}},current);
  await new Promise(resolve=>setImmediate(resolve));simple=true;release();
  // The unrelated store need not pass readback; its completion still releases the common queue.
  await assert.rejects(blocking,/setting_save_unverified/);await assert.rejects(pending,/experimental_only/);
});

test('shake requires two separated peaks, finite data and cooldown; surface reset clears peaks while retaining cooldown',()=>{
  const detector=new gestures.StudyShakeDetector();
  assert.equal(detector.sample(0,0,9.8,0),false);assert.equal(detector.sample(NaN,0,30,1),false);
  assert.equal(detector.sample(0,0,25,100),false);assert.equal(detector.sample(0,0,25,150),false);
  detector.sample(0,0,9.8,200);assert.equal(detector.sample(0,0,25,300),true);
  detector.clearPending();detector.sample(0,0,25,400);detector.sample(0,0,9.8,500);assert.equal(detector.sample(0,0,25,600),false);
  detector.sample(0,0,9.8,2000);assert.equal(detector.sample(0,0,25,2100),false);
  detector.clearPending();detector.sample(0,0,9.8,2150);assert.equal(detector.sample(0,0,25,2200),false);
  detector.sample(0,0,9.8,2250);assert.equal(detector.sample(0,0,25,2300),true);
});
test('accelerometer owns only its callback, reuses active subscription and suppresses events after failed unsubscribe',()=>{
  let time=1000,callback,offFails=false;const calls=[],actions=[];
  const sensor={SensorId:{ACCELEROMETER:1},getSingleSensorSync:()=>{},on:(...args)=>{calls.push(['on',...args]);callback=args[1];},
    off:(...args)=>{calls.push(['off',...args]);if(offFails)throw Error('off');}};
  const Sensor=loadPlatformModule('backend/StudyShakeSensor.ets','StudyShakeSensor',{sensor,StudyShakeDetector:gestures.StudyShakeDetector,
    Date:{now:()=>time},console:{error(){}}});
  const session=new Sensor();assert.equal(session.update(true,()=>actions.push('old')),'available');
  session.update(true,()=>actions.push('current'));assert.equal(calls.length,1);
  const peak=()=>callback({x:0,y:0,z:25}),low=()=>callback({x:0,y:0,z:9.8});peak();low();time+=100;peak();assert.deepEqual(actions,['current']);
  session.update(false,()=>{});session.update(true,()=>actions.push('new-side'));time+=100;low();peak();low();peak();
  assert.deepEqual(actions,['current'],'one shake cannot grade the newly revealed answer');
  offFails=true;assert.equal(session.update(false,()=>actions.push('disabled')),'failed');time+=2000;low();peak();low();peak();assert.equal(actions.length,1);
  offFails=false;assert.equal(session.update(false,()=>{}),'off');assert.equal(calls.at(-1)[2],callback);
  sensor.getSingleSensorSync=()=>{throw Error('unsupported');};assert.equal(session.update(true,()=>{}),'failed');
});
test('real page listens for shake only on an enabled visible foreground regular card; callbacks carry original surface',()=>{
  const source=readFileSync(new URL('../../entry/src/main/ets/pages/学习页.ets',import.meta.url),'utf8');
  const methods=['updateShakeSensor','studyGestureBlocked'].map(name=>{const start=source.indexOf('  private '+name+'(');return source.slice(start,source.indexOf('\n  }',start)+4);}).join('\n');
  const Page=new Function('completeStudyGestures','studyGestureCommand','showToastSafely','$r',stripTypeScriptTypes('class Page{'+methods+'}',{mode:'transform'})+';return Page;')(
    gestures.completeStudyGestures,gestures.studyGestureCommand,()=>{},key=>key);
  const config={version:1,enabled:true,tapLayout:'four',bindings:[{input:'shake',command:'replay',side:'both'}]};
  const calls=[];const page=Object.assign(new Page(),{简洁模式:false,controls:()=>({...defaultStudyControls(),gestureConfig:config}),
    阶段:'question',mounted:true,页面已显示:true,foreground:true,choiceQuestion:null,recoveryMessage:'',timeboxNotice:null,
    controllerReady:true,pendingHtml:'',requestVersion:7,interactionVersion:9,
    shakeSensor:{update:(enabled,listener)=>{calls.push({enabled,listener});return enabled?'available':'off';}},handleStudyGesture:(...args)=>calls.push(args)});
  page.updateShakeSensor();assert.equal(calls[0].enabled,true);const listener=calls[0].listener;page.requestVersion=8;listener();assert.deepEqual(calls.at(-1),['shake',0,0,7,9]);
  for(const [key,value] of [['简洁模式',true],['mounted',false],['页面已显示',false],['foreground',false],['choiceQuestion',{}],
    ['studyMenuOpen',true],['手写模式',true],['webInputFocused',true],['answerInputFocused',true],['cardRenderPending',true],['阶段','loading']]) {
    const old=page[key];page[key]=value;page.updateShakeSensor();assert.equal(calls.at(-1).enabled,false,key);page[key]=old;
  }
});
