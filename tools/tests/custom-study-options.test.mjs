import { loadPlatformModule } from './platform-module-harness.mjs';
// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { customStudyInitialValue, customStudyValueValid } from '../../entry/src/main/ets/model/CustomStudyOptions.ts';
import { encodeCustomStudyCramRequest, 自定义学习预设 as presets } from '../../entry/src/main/ets/proto/messages/SchedulerMessages.ts';

test('all six custom study presets first default to 20 regardless of deck suggestions', () => {
 for(const defaults of [null,{extendNew:0,extendReview:80}])
  for(const preset of [2,3,4,5,6,7]) assert.equal(customStudyInitialValue(preset,defaults),20);
});

test('custom study rejects invalid integers and only permits negative limit deltas', () => {
  for (const value of ['', '0', '1.5', '1e2', 'Infinity', '2147483648', '-2147483649']) {
    assert.equal(customStudyValueValid(presets.新卡上限增量, value), false, value);
  }
  assert.equal(customStudyValueValid(presets.新卡上限增量, '-3'), true);
  assert.equal(customStudyValueValid(presets.复习上限增量, '2147483647'), true);
  for (const preset of [presets.复习遗忘天数, presets.提前复习天数, presets.预览新卡天数, presets.按状态或标签]) {
    assert.equal(customStudyValueValid(preset, '-3'), false);
    assert.equal(customStudyValueValid(preset, '1'), true);
  }
  assert.equal(customStudyValueValid(presets.提前复习天数, '100000'), false);
});

test('custom study cram uses protobuf oneof 7 with distinct include/exclude tags', () => {
  // scheduler.proto: deck_id=1, cram=7; kind=1, card_limit=2, includes=3, excludes=4.
  for (const kind of [0, 1, 2, 3]) {
    const bytes = encodeCustomStudyCramRequest(1, {
      kind, cardLimit: 100, tagsToInclude: ['a', 'b'], tagsToExclude: ['c']
    });
    assert.deepEqual([...bytes], [8, 1, 58, 13, 8, kind, 16, 100, 26, 1, 97, 26, 1, 98, 34, 1, 99]);
  }
});

test('real custom study preferences remember each preset across instances and roll back failed saves',async()=>{
 const values=new Map();let fail=false;
 const store={getSync:(key,fallback)=>values.has(key)?values.get(key):fallback,putSync:(key,value)=>values.set(key,value),
  flush:async()=>{if(fail)throw Error('disk full');}};
 const Prefs=loadPlatformModule('backend/CustomStudyPreferences.ets','CustomStudyPreferences',{
  customStudyValueValid,AppStorage:{get:()=>({})},preferences:{getPreferencesSync:()=>store}
 });
 for(const preset of [2,3,4,5,6,7])assert.equal(new Prefs().read(preset,20),20);
 await new Prefs().save(2,-8);await new Prefs().save(3,35);await new Prefs().save(4,9);
 assert.equal(new Prefs().read(2,20),-8);assert.equal(new Prefs().read(3,20),35);assert.equal(new Prefs().read(4,20),9);
 values.set('custom_study_value_5',-8);assert.equal(new Prefs().read(5,20),20);
 fail=true;await assert.rejects(new Prefs().save(3,40),/could not be saved/);assert.equal(new Prefs().read(3,20),35);
});
