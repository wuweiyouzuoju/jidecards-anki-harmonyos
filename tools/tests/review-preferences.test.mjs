// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { 协议写入器 as Writer } from '../../entry/src/main/ets/proto/core/ProtoWriter.ts';
import { 协议读取器 as Reader } from '../../entry/src/main/ets/proto/core/ProtoReader.ts';
import { ReviewPreferences, ReviewPreferenceField as F, decodeReviewPreferences, patchReviewPreferences } from '../../entry/src/main/ets/proto/messages/PreferencesMessages.ts';
import { ReviewPreferencesStore, preferenceSeconds } from '../../entry/src/main/ets/model/ReviewPreferencesStore.ts';
import { AutoSyncScheduler } from '../../entry/src/main/ets/model/AutoSyncScheduler.ts';
import { SyncActivity } from '../../entry/src/main/ets/model/SyncSettings.ts';
import { decodeOpChanges } from '../../entry/src/main/ets/proto/messages/CollectionMessages.ts';
import { 服务号, 配置方法 } from '../../entry/src/main/ets/backend/服务索引.ts';
import { loadPlatformModule, loadComponentLogic } from './platform-module-harness.mjs';

export function preferencesFixture() {
  const scheduling = new Writer();
  scheduling.写入变长整数(2, 4); scheduling.写入变长整数(3, 1201);
  scheduling.写入变长整数(4, 2); scheduling.写入布尔(5, true); scheduling.写入布尔(6, true);
  scheduling.写入字符串(80, 'future-scheduling');
  const reviewing = new Writer();
  for (const [key, value] of [[1, 1], [2, 1], [3, 1], [4, 1], [5, 60], [6, 1], [7, 1]]) reviewing.写入变长整数(key, value);
  reviewing.写入浮点(81, 3.25);
  reviewing.写入标签(83, 0);
  reviewing.写入原始字节(new Uint8Array([255,255,255,255,255,255,255,255,255,1]));
  reviewing.写入标签(84, 1);
  reviewing.写入原始字节(new Uint8Array([255,0,128,1,2,3,4,5]));
  const root = new Writer();
  root.写入字节(1, scheduling.转为字节()); root.写入字节(2, reviewing.转为字节());
  root.写入字节(3, new Uint8Array([8, 1, 34, 3, 97, 98, 99]));
  root.写入字节(4, new Uint8Array([8, 12, 16, 5, 24, 2, 32, 30]));
  root.写入字节(82, new Uint8Array([255, 0, 128]));
  return root.转为字节();
}

function fields(bytes) {
  const reader = new Reader(bytes), result = [];
  while (!reader.已读完) {
    const start = reader.当前位置, tag = reader.读取标签();
    let payload;
    if (tag.线类型 === 2) payload = reader.读取字节(); else reader.跳过字段(tag.线类型);
    result.push({number: tag.字段号, wire: tag.线类型, raw: reader.截取片段(start), payload});
  }
  return result;
}
const turn = () => new Promise(resolve => setImmediate(resolve));

test('Preferences wire fields and RPCs match the locked Anki 26.05 contract', async () => {
  const proto = readFileSync(new URL('../../third_party/anki/proto/anki/config.proto', import.meta.url), 'utf8');
  for (const line of ['uint32 rollover = 2;', 'uint32 learn_ahead_secs = 3;', 'bool show_remaining_due_counts = 3;',
    'bool show_intervals_on_buttons = 4;', 'uint32 time_limit_secs = 5;']) assert.ok(proto.includes(line));
  const calls = [];
  const Config = loadPlatformModule('backend/配置服务.ts', '配置服务', {服务号, 配置方法, decodeOpChanges,
    后端会话: {获取实例: () => ({调用: async (...args) => { calls.push(args); return args[1] === 9 ? preferencesFixture() : new Uint8Array(); }})}});
  const config = new Config(); const raw = await config.getPreferences();
  await config.setPreferences(patchReviewPreferences(raw, [{field:F.Rollover, value:0}]));
  assert.deepEqual(calls.map(call => call.slice(0, 2)), [[9,9],[9,10]]);
  assert.equal(calls[0][2].length, 0);
  assert.equal(decodeReviewPreferences(calls[1][2]).rollover, 0);
});

test('each single-field patch preserves all other fields and unknown bytes, including editing and backup limits', () => {
  const original = preferencesFixture();
  assert.deepEqual(fields(patchReviewPreferences(original, [])).map(f => f.raw), fields(original).map(f => f.raw));
  for (const [field, section, tag, value] of [[F.Rollover,1,2,0],[F.LearnAheadSecs,1,3,0],[F.TimeLimitSecs,2,5,0],
    [F.ShowRemaining,2,3,0],[F.ShowIntervals,2,4,0]]) {
    const result = patchReviewPreferences(original,[{field,value}]);
    const before = fields(original), after = fields(result);
    for (const untouched of before.filter(f => f.number !== section)) assert.deepEqual(after.find(f => f.number === untouched.number).raw, untouched.raw);
    const childrenBefore = fields(before.find(f=>f.number===section).payload).filter(f => f.number !== tag);
    const childrenAfter = fields(after.find(f=>f.number===section).payload).filter(f => f.number !== tag);
    assert.deepEqual(childrenAfter, childrenBefore);
    const scalar = fields(after.find(f=>f.number===section).payload).find(f=>f.number===tag);
    assert.deepEqual(scalar.raw, new Uint8Array([tag*8,0]));
  }
  assert.throws(()=>patchReviewPreferences(new Uint8Array(),[{field:F.Rollover,value:4}]),/missing_preferences/);
  for (const value of [-1,24,0.5,NaN,Infinity]) assert.throws(()=>patchReviewPreferences(original,[{field:F.Rollover,value}]),/invalid/);
  for (const field of [F.ShowRemaining,F.ShowIntervals]) assert.throws(()=>patchReviewPreferences(original,[{field,value:2}]),/invalid/);
});

test('zero defaults, duplicate submessages and unknown wire types survive edits', () => {
  assert.deepEqual({...decodeReviewPreferences(new Uint8Array())},{rollover:0,learnAheadSecs:0,timeLimitSecs:0,showRemaining:false,showIntervals:false});
  const w=new Writer();w.写入字节(1,new Uint8Array([16,4]));w.写入字节(1,new Uint8Array([24,60]));
  w.写入字节(2,new Uint8Array([24,1,32,1]));
  assert.equal(decodeReviewPreferences(patchReviewPreferences(w.转为字节(),[{field:F.Rollover,value:0}])).learnAheadSecs,60);
  assert.throws(()=>decodeReviewPreferences(new Uint8Array([10,255])),/proto/);
});

test('saving reads the latest Core values, serializes concurrent edits and protects accepted writes until completion', async () => {
  let raw=preferencesFixture(), changed=0, release;
  const scheduler=new AutoSyncScheduler(), activity=new SyncActivity(), syncOwner={};
  const store=new ReviewPreferencesStore({read:async()=>raw,write:async bytes=>{raw=bytes;},changed:()=>changed++},scheduler,activity);
  const stale=await store.read();assert.equal(stale.rollover,4);
  raw=patchReviewPreferences(raw,[{field:F.LearnAheadSecs,value:1337}]);
  activity.acquire(syncOwner);
  const edit={field:F.Rollover,value:5};const first=store.save([edit]);edit.value=9;
  const second=store.save([{field:F.ShowIntervals,value:0}]);
  assert.equal(scheduler.canSync(),false);await turn();assert.equal(changed,0);
  activity.release(syncOwner,0);
  await Promise.all([first,second]);
  assert.equal(changed,2);assert.equal(scheduler.canSync(),true);
  const result=decodeReviewPreferences(raw);assert.equal(result.rollover,5);assert.equal(result.learnAheadSecs,1337);assert.equal(result.showIntervals,false);
  let fail=true;
  const failing=new ReviewPreferencesStore({read:async()=>raw,write:async()=>{if(fail)throw Error('write failed');},changed:()=>changed++},scheduler,activity);
  await assert.rejects(failing.save([{field:F.TimeLimitSecs,value:0}]),/write failed/);
  assert.equal(changed,2);assert.equal(scheduler.canSync(),true);fail=false;
  await failing.read();
});

test('minutes convert exactly to Core seconds, including existing fractional minutes', () => {
  for(const seconds of [0,1,59,60,1201,59940]) assert.equal(preferenceSeconds(String(seconds/60)),seconds);
  for(const text of ['', '-1','NaN','Infinity','1e2','0.001','1000','1:20']) assert.throws(()=>preferenceSeconds(text),/invalid/);
});

test('settings expose failure, validate edited fields only, and ignore late reads after leaving', async () => {
  const writes=[];let actual=decodeReviewPreferences(preferencesFixture()), fail=false, resolve;
  const backend={read:async()=>{if(fail)throw Error('unavailable');return actual;},save:async edits=>{writes.push(edits);return actual;}};
  const Component=loadComponentLogic('components/settings/ReviewPreferencesSettings.ets','ReviewPreferencesSettings',{
    reviewPreferences:backend,ReviewPreferences,ReviewPreferenceField:F,preferenceSeconds,颜色键:{动作主色:'primary'}});
  const c=new Component();c.aboutToAppear();await turn();assert.equal(c.loaded,true);
  c.changeDisplay(F.ShowIntervals,true);assert.equal(writes.length,0,'programmatic confirmation does not repeat a write');
  c.rollover='0';c.rolloverEdited=true;c.learnAhead='not edited';c.saveScheduling();await turn();
  assert.deepEqual(writes,[[{field:F.Rollover,value:0}]]);
  c.rollover='24';c.rolloverEdited=true;c.saveScheduling();assert.equal(c.invalid,true);assert.equal(writes.length,1);
  c.busy=true;c.changeDisplay(F.ShowIntervals,false);assert.equal(writes.length,1);c.busy=false;
  fail=true;await c.reload();assert.equal(c.failed,true);assert.equal(c.loaded,false);
  backend.read=()=>new Promise(r=>resolve=r);const reading=c.reload();c.aboutToDisappear();resolve(actual);await reading;
  assert.equal(c.loaded,false,'departed read cannot apply');
});

test('display saves recover the actual Core value on failure and cannot apply late completion after departure', async () => {
  let actual=decodeReviewPreferences(preferencesFixture()), saved;
  const backend={read:async()=>actual,save:async()=>{throw Error('write failed');}};
  const Component=loadComponentLogic('components/settings/ReviewPreferencesSettings.ets','ReviewPreferencesSettings',{
    reviewPreferences:backend,ReviewPreferences,ReviewPreferenceField:F,preferenceSeconds,颜色键:{动作主色:'primary'}});
  const c=new Component();c.aboutToAppear();await turn();
  c.changeDisplay(F.ShowRemaining,false);assert.equal(c.remaining,false);assert.equal(c.busy,true);
  await turn();assert.equal(c.failed,true);assert.equal(c.remaining,true);assert.equal(c.busy,false);
  backend.save=async()=>{actual.showRemaining=false;throw Error('readback failed after accepted write');};
  c.changeDisplay(F.ShowRemaining,false);await turn();
  assert.equal(c.remaining,false);assert.equal(c.failed,true,'accepted write is re-read but failed confirmation remains visible');
  backend.save=()=>new Promise(resolve=>saved=resolve);
  c.changeDisplay(F.ShowIntervals,false);c.aboutToDisappear();
  saved(Object.assign(new ReviewPreferences(),{showIntervals:true}));await turn();
  assert.equal(c.intervals,false,'departed completion cannot reapply UI state');
});

test('failed numeric saves preserve edited drafts through readback and reload; retry submits the same edits', async () => {
  let actual=decodeReviewPreferences(preferencesFixture()), fail=true;
  const writes=[];
  const backend={read:async()=>actual,save:async edits=>{
    writes.push(structuredClone(edits));
    if(fail)throw Error('write failed');
    actual=decodeReviewPreferences(patchReviewPreferences(preferencesFixture(),edits));
    return actual;
  }};
  const Component=loadComponentLogic('components/settings/ReviewPreferencesSettings.ets','ReviewPreferencesSettings',{
    reviewPreferences:backend,ReviewPreferences,ReviewPreferenceField:F,preferenceSeconds,颜色键:{动作主色:'primary'}});
  const c=new Component();c.aboutToAppear();await turn();
  c.rollover='7';c.rolloverEdited=true;c.timeLimit='3';c.timeEdited=true;
  actual.learnAheadSecs=777;actual.showIntervals=false;
  c.saveScheduling();await turn();
  assert.equal(c.failed,true);assert.equal(c.loaded,true);
  assert.equal(c.rollover,'7');assert.equal(c.timeLimit,'3');
  assert.equal(c.rolloverEdited,true);assert.equal(c.timeEdited,true);
  assert.equal(c.learnAhead,String(777/60),'unedited values still follow Core');
  assert.equal(c.intervals,false,'confirmed display values follow readback');
  await c.reload();assert.equal(c.rollover,'7');assert.equal(c.timeLimit,'3');
  fail=false;c.saveScheduling();await turn();
  assert.deepEqual(writes,Array(2).fill([{field:F.Rollover,value:7},{field:F.TimeLimitSecs,value:180}]));
  assert.equal(c.failed,false);assert.equal(c.rolloverEdited,false);assert.equal(c.timeEdited,false);
  assert.equal(c.rollover,'7');assert.equal(c.timeLimit,'3');c.aboutToDisappear();
});

test('unconfirmed accepted saves retain numeric drafts even if recovery read also fails', async () => {
  let actual=decodeReviewPreferences(preferencesFixture()), failRead=false;
  const backend={read:async()=>{if(failRead)throw Error('read failed');return actual;},save:async edits=>{
    actual=decodeReviewPreferences(patchReviewPreferences(preferencesFixture(),edits));
    failRead=true;throw Error('confirmation read failed');
  }};
  const Component=loadComponentLogic('components/settings/ReviewPreferencesSettings.ets','ReviewPreferencesSettings',{
    reviewPreferences:backend,ReviewPreferences,ReviewPreferenceField:F,preferenceSeconds,颜色键:{动作主色:'primary'}});
  const c=new Component();c.aboutToAppear();await turn();
  c.learnAhead='0';c.learnEdited=true;c.saveScheduling();await turn();
  assert.equal(c.failed,true);assert.equal(c.loaded,false);
  assert.equal(c.learnAhead,'0');assert.equal(c.learnEdited,true);assert.equal(c.busy,false);
  failRead=false;await c.reload();
  assert.equal(c.loaded,true);assert.equal(c.learnAhead,'0');assert.equal(c.learnEdited,true);
  backend.save=async()=>actual;c.saveScheduling();await turn();
  assert.equal(c.failed,false);assert.equal(c.learnEdited,false);c.aboutToDisappear();
});

test('failure recovery completing after departure cannot replace the numeric draft or clear edited flags', async () => {
  let recover;
  const actual=decodeReviewPreferences(preferencesFixture());
  const backend={read:async()=>actual,save:async()=>{throw Error('write failed');}};
  const Component=loadComponentLogic('components/settings/ReviewPreferencesSettings.ets','ReviewPreferencesSettings',{
    reviewPreferences:backend,ReviewPreferences,ReviewPreferenceField:F,preferenceSeconds,颜色键:{动作主色:'primary'}});
  const c=new Component();c.aboutToAppear();await turn();
  c.rollover='7';c.rolloverEdited=true;backend.read=()=>new Promise(resolve=>recover=resolve);
  const saving=c.save([{field:F.Rollover,value:7}]);await turn();c.aboutToDisappear();
  recover(actual);await saving;
  assert.equal(c.rollover,'7');assert.equal(c.rolloverEdited,true);
});
