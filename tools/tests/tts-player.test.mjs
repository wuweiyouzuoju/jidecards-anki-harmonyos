// SPDX-License-Identifier: AGPL-3.0-or-later
import assert from 'node:assert/strict';
import test from 'node:test';
import { loadPlatformModule } from './platform-module-harness.mjs';
import { AudioQueueCompletion } from '../../entry/src/main/ets/model/AudioQueueCompletion.ts';
import { harmonyTtsVoiceName, ttsSpeakOptions } from '../../entry/src/main/ets/model/CardRenderingSupport.ts';

function harness() {
  const created = [], spoken = [], warnings = [], stopped = [];
  let voices = [{language:'zh_CN',person:13,status:'INSTALLED'}, {language:'zh_CN',person:21,status:'INSTALLED'},
    {language:'en_US',person:8,status:'INSTALLED'}], failQuery = false;
  const focus = {beginPlayback:async()=>{},endPlayback:async()=>{}};
  const Player = loadPlatformModule('utils/TTS播放器.ets', 'TTS播放器', {
    AudioQueueCompletion, harmonyTtsVoiceName, ttsSpeakOptions,
    AudioFocusCoordinator:{getInstance:()=>focus}, 获取语音版本号:()=>1, 加载语音人物:async()=>13,
    hilog:{info:()=>{},warn:(...args)=>warnings.push(args),error:(...args)=>warnings.push(args)},
    textToSpeech:{listVoices:async()=>{if(failQuery)throw Error('query unavailable');return voices;},
      createEngine:async params=>{
        const engine = {stop:async()=>stopped.push('stop'),shutdown:async()=>stopped.push('shutdown'),
          setListener:listener=>{engine.listener=listener;},speak:(text,params)=>spoken.push({text,params,engine})};
        created.push(params);return engine;
      }}
  });
  return {player:new Player(),created,spoken,warnings,stopped,setVoices:value=>{voices=value;},failQuery:()=>{failQuery=true;}};
}
const item = (voices=[],speed=1,otherArgs=[]) => ({text:'测试',language:'zh_CN',voices,speed,otherArgs});

test('template candidates select installed voices in order, and speed/volume/pitch reach the real speak call', async () => {
  const h=harness();
  await h.player.播放队列([item(['Microsoft_Unavailable','HarmonyOS_21','HarmonyOS_13'],1.5,['volume=0.8','pitch=1.2'])]);
  assert.equal(h.created[0].person,21);
  assert.deepEqual(h.spoken[0].params.extraParams,{speed:1.5,volume:0.8,pitch:1.2});
  let done=false;const completion=h.player.waitForCompletion().then(()=>{done=true;});
  await Promise.resolve();assert.equal(done,false);
  const call=h.spoken[0];call.engine.listener.onComplete(call.params.requestId,{});
  await completion;assert.equal(done,true);
  await h.player.释放();
});

test('unavailable and failed voice queries use the saved local voice with diagnostics', async () => {
  for(const failure of [false,true]) {
    const h=harness();if(failure)h.failQuery();else h.setVoices([{language:'zh_CN',person:13,status:'INSTALLED'},
      {language:'zh_CN',person:21,status:'GA'}]);
    await h.player.播放队列([item(['HarmonyOS_21'],4,['vendor=value'])]);
    assert.equal(h.created[0].person,13);assert.equal(h.spoken[0].params.extraParams.speed,2);
    assert.ok(h.warnings.some(row=>row.includes('vendor=value')));
    assert.ok(h.warnings.some(row=>String(row[2]).includes(failure?'lookup failed':'voices unavailable')));
    await h.player.释放();
  }
});

test('changing template voices rebuilds the engine and stopped requests cannot advance the new queue', async () => {
  const h=harness();
  await h.player.播放队列([item(['HarmonyOS_21'])]);const old=h.spoken[0];
  await h.player.播放队列([item(['HarmonyOS_13']),item(['HarmonyOS_13'])]);
  assert.deepEqual(h.created.map(row=>row.person),[21,13]);
  old.engine.listener.onComplete(old.params.requestId,{});
  await new Promise(resolve=>setImmediate(resolve));assert.equal(h.spoken.length,2);
  await h.player.停止();
  h.spoken[1].engine.listener.onComplete(h.spoken[1].params.requestId,{});
  await new Promise(resolve=>setImmediate(resolve));assert.equal(h.spoken.length,2);
  await h.player.释放();
});
