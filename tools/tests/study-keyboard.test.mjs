// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { defaultStudyKeyboard, normalizeStudyChord, studyChord, validateStudyKeyboard,
  studyKeyboardCommand, StudyKeyboardSession, STUDY_KEYBOARD_ACTIONS, studyBindingConflict } from '../../entry/src/main/ets/model/StudyKeyboard.ts';
import { defaultStudyControls, validateStudyControls, effectiveStudyKeyboard, configuredStudyCommand } from '../../entry/src/main/ets/model/StudyControls.ts';
import { loadPlatformModule } from './platform-module-harness.mjs';
import { defaultStudyGestureConfig } from '../../entry/src/main/ets/model/StudyGestureConfig.ts';

test('free bindings accept combinations, multiple keys, arbitrary device codes and distinct card sides', () => {
  const config = validateStudyKeyboard({version:1,bindings:[
    {key:'ALT+Ctrl+Shift+F5',command:'replay',side:'both'},
    {key:'x',command:'flip',side:'question'}, {key:'x',command:'easy',side:'answer'},
    {key:'code:2401',command:'replay',side:'both'}, {key:'numpad9',command:'mark',side:'both'}]});
  assert.equal(config.bindings[0].key,'ctrl+shift+alt+f5');
  assert.equal(studyKeyboardCommand(config.bindings,'x','question'),'flip');
  assert.equal(studyKeyboardCommand(config.bindings,'x','answer'),'easy');
  assert.equal(studyKeyboardCommand(config.bindings,'code:2401','answer'),'replay');
  for(const key of ['control','back','ctrl+ctrl+x','meta+x','ctrl+','f0','code:0','x+y']) assert.throws(()=>normalizeStudyChord(key),/invalid/);
  for(const side of ['both','answer']) assert.throws(()=>validateStudyKeyboard({version:1,bindings:[
    {key:'x',command:'flip',side:'both'}, {key:'x',command:'easy',side}]}),/conflict/);
  assert.throws(()=>validateStudyKeyboard({version:1,bindings:[{key:'x',command:'pretend',side:'both'}]}),/invalid/);
});

test('defaults match exact modifiers and protect unseen answers and blocked scopes', () => {
  const controls = defaultStudyControls();
  for(const [key,command] of [['space','good'],['enter','good'],['1','again'],['2','hard'],['3','good'],['4','easy'],
    ['numpad1','again'],['numpadenter','good'],['f5','replay'],['shift+8','mark'],['star','mark'],['shift+2','suspend'],['minus','bury'],['equals','bury_note'],['shift+1','suspend_note'],['ctrl+shift+z','redo'],['ctrl+1','flag1']]) {
    assert.equal(configuredStudyCommand(controls,key,'answer',false),command);
    assert.equal(configuredStudyCommand(controls,key,'answer',true),'none');
  }
  assert.equal(configuredStudyCommand(controls,'space','question',false),'flip');
  assert.equal(configuredStudyCommand(controls,'1','question',false),'none');
  for(const key of ['ctrl+space','alt+3']) assert.equal(configuredStudyCommand(controls,key,'answer',false),'none');
  assert.equal(configuredStudyCommand(controls,'ctrl+z','done',false),'undo');
  assert.equal(configuredStudyCommand(controls,'escape','loading',false),'back');
  assert.equal(configuredStudyCommand(controls,'x','loading',false),'none');
  assert.equal(studyChord('back',{ctrl:false,alt:false,shift:false}),'');
  validateStudyKeyboard(defaultStudyKeyboard());
});

test('legacy overrides survive migration; complete empty bindings disable defaults', () => {
  const legacy = validateStudyControls({...defaultStudyControls(),keys:[{input:'space',command:'easy'},{input:'r',command:'none'}]});
  const migrated = effectiveStudyKeyboard(legacy);
  assert.equal(studyKeyboardCommand(migrated.bindings,'space','answer'),'easy');
  assert.equal(studyKeyboardCommand(migrated.bindings,'space','question'),'none');
  assert.equal(studyKeyboardCommand(migrated.bindings,'r','answer'),'none');
  assert.equal(studyKeyboardCommand(migrated.bindings,'enter','question'),'flip');
  const explicit = validateStudyControls({...defaultStudyControls(),keyboard:{version:1,bindings:[]}});
  assert.deepEqual(effectiveStudyKeyboard(explicit).bindings,[]);
  assert.equal(configuredStudyCommand(explicit,'space','answer',false),'none');
  assert.throws(()=>validateStudyControls({...legacy,keyboard:{version:1,bindings:[]}}),/ambiguous/);
});

test('holding a key across card flips executes once until release; reset permits fresh input', () => {
  const session = new StudyKeyboardSession();
  assert.equal(session.update(2050,true),true);
  for(let count=0;count<5;count++)assert.equal(session.update(2050,true),false);
  session.update(2050,false);assert.equal(session.update(2050,true),true);
  session.reset();assert.equal(session.update(2050,true),true);
});

const component=readFileSync(new URL('../../entry/src/main/ets/components/settings/StudyKeyboardSettings.ets',import.meta.url),'utf8');
function editor(deps={}) {
  const names=['add','remove','reset','save','reload','capture'];
  const methods=names.map(name=>{const start=component.search(new RegExp(`  private (?:async )?${name}\\(`));
    assert.notEqual(start,-1);return component.slice(start,component.indexOf('\n  }',start)+4);}).join('\n');
  // side() is intentionally a one-line pure method.
  const side=component.match(/  private side\(\)[^\n]+/)[0];
  const body=methods.slice(methods.indexOf('  private add('));
  const Host=new Function('deps',`with(deps){${stripTypeScriptTypes('class Host{'+side+'\n'+body+'}',{mode:'transform'})};return Host;}`)({
    STUDY_KEYBOARD_ACTIONS,defaultStudyKeyboard,normalizeStudyChord,effectiveStudyKeyboard,
    studyBindingConflict,
    KeyType:{Down:0},studyKeyName:key=>key,studyEventChord:event=>event.chord,...deps});
  return Object.assign(new Host(),{before:defaultStudyControls(),loaded:true,busy:false,alive:true,generation:0,bindings:[],keyText:'',commandIndex:0,sideIndex:0,errorKey:'',capturing:false});
}
test('real settings actions reject overlaps, delete only their row and save complete bindings through the shared service',async()=>{
  const calls=[];const page=editor({saveStudyControls:async(after,before)=>{calls.push({after,before});}});
  page.keyText='ctrl+x';page.add();page.add(); // empty entry rejected
  assert.equal(page.bindings.length,1);
  page.keyText='ctrl+x';page.add();assert.equal(page.errorKey,'study_keyboard_conflict');
  page.keyText='ctrl+y';page.add();page.remove(0);assert.equal(page.bindings[0].key,'ctrl+y');
  let closed=0;page.onClose=()=>closed++;await page.save();
  assert.equal(closed,1);assert.equal(calls[0].after.keys.length,0);assert.deepEqual(calls[0].after.keyboard.bindings,page.bindings);
  page.reset();assert.deepEqual(page.bindings,defaultStudyKeyboard().bindings);
});
test('settings retain the draft on save failure, ignore obsolete reads, and finish accepted writes after leaving',async()=>{
  const failed=editor({saveStudyControls:async()=>{throw Error('changed_since_proposal');}});
  failed.onClose=()=>assert.fail('failed save closed');failed.keyText='x';failed.add();await failed.save();
  assert.equal(failed.errorKey,'study_keyboard_save_failed');assert.equal(failed.bindings.length,1);assert.equal(failed.busy,false);
  let release;const page=editor({readStudyControls:()=>new Promise(resolve=>{release=resolve;})});
  const read=page.reload();page.alive=false;page.generation++;release(defaultStudyControls());await read;
  assert.equal(page.loaded,false);assert.deepEqual(page.bindings,[]);
  let finish;const leaving=editor({saveStudyControls:()=>new Promise(resolve=>{finish=resolve;})});
  leaving.onClose=()=>assert.fail('closed a departed dialog');const save=leaving.save();leaving.alive=false;finish();await save;
});
test('recording consumes modifiers without completing and records the next full chord',()=>{
  const page=editor();page.capturing=true;
  assert.equal(page.capture({keyCode:'control',type:0,chord:''}),true);assert.equal(page.capturing,true);
  assert.equal(page.capture({keyCode:'x',type:0,chord:'ctrl+shift+x'}),true);assert.equal(page.keyText,'ctrl+shift+x');
  page.capturing=true;assert.equal(page.capture({keyCode:'back',type:0,chord:''}),false);
});

test('keyboard edits preserve an existing complete gesture configuration',async()=>{
  const config={...defaultStudyGestureConfig(),enabled:true};let saved;
  const page=editor({saveStudyControls:async after=>{saved=after;}});
  page.before={...defaultStudyControls(),gestureConfig:config};await page.save();
  assert.deepEqual(saved.gestureConfig,config);
});

test('key adapter recognizes alphabet, number pad, function and device keys and reads event modifiers',()=>{
  const KeyCode={KEYCODE_A:2017,KEYCODE_Z:2042,KEYCODE_0:2000,KEYCODE_9:2009,KEYCODE_F1:2090,KEYCODE_F12:2101,
    KEYCODE_NUMPAD_0:2103,KEYCODE_NUMPAD_9:2112,KEYCODE_BACK:2,KEYCODE_CTRL_LEFT:2072,KEYCODE_CTRL_RIGHT:2073,
    KEYCODE_SHIFT_LEFT:2047,KEYCODE_SHIFT_RIGHT:2048,KEYCODE_ALT_LEFT:2045,KEYCODE_ALT_RIGHT:2046,
    KEYCODE_META_LEFT:2076,KEYCODE_META_RIGHT:2077,KEYCODE_SPACE:2050,KEYCODE_ENTER:2054};
  const adapter=loadPlatformModule('utils/KeyboardKeyAdapter.ets','({studyKeyName:keyboardKeyName,studyEventChord:keyboardEventChord})',{KeyCode,keyboardChord:studyChord});
  assert.equal(adapter.studyKeyName(2040),'x');assert.equal(adapter.studyKeyName(2100),'f11');
  assert.equal(adapter.studyKeyName(2112),'numpad9');assert.equal(adapter.studyKeyName(2401),'code:2401');
  assert.equal(adapter.studyEventChord({keyCode:2040,getModifierKeyState:keys=>['Ctrl','Shift'].includes(keys[0])}),'ctrl+shift+x');
  assert.equal(adapter.studyEventChord({keyCode:2}),'');
  assert.equal(adapter.studyEventChord({keyCode:2001,metaKey:1}),'','Meta+1 cannot fall through to a rating');
});
