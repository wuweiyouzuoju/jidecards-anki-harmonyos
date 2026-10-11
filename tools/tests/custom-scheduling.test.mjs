// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import { readFileSync } from 'node:fs';
import { schedulingScriptSource, validateSchedulingScript, customSchedulingInfo } from '../../entry/src/main/ets/model/CustomScheduling.ts';
import { CUSTOM_SCHEDULING_SERVICE, encodeCustomScheduling } from '../../entry/src/main/ets/proto/messages/CustomSchedulingMessages.ts';
import { encodeSchedulingStates, decodeSchedulingStates } from '../../entry/src/main/ets/proto/messages/SchedulerMessages.ts';
import { decodeStringResponse } from '../../entry/src/main/ets/proto/messages/LinksMessages.ts';
import { 协议写入器 } from '../../entry/src/main/ets/proto/core/ProtoWriter.ts';
import { 协议读取器 } from '../../entry/src/main/ets/proto/core/ProtoReader.ts';
import { loadPlatformModule } from './platform-module-harness.mjs';
import { decodeCodeArguments, decodeCodeResult } from '../../entry/src/main/ets/model/agent/AgentCodeExecution.ts';
import { AgentToolSchemaError } from '../../entry/src/main/ets/model/agent/AgentToolSchemas.ts';

const fixture=JSON.parse(readFileSync(new URL('./fixtures/custom-scheduling.json',import.meta.url),'utf8'));
const run=(script,input)=>JSON.parse(JSON.stringify(runInNewContext('(function(input){'+schedulingScriptSource(script)+'})',{}, {timeout:1000})(input)));

test('the same checked-in invocation runs in Node and the real QuickJS sandbox test',()=>{
  assert.equal(schedulingScriptSource(fixture.script),fixture.source);
  assert.deepEqual(run(fixture.script,fixture.input),fixture.expected);
  assert.equal(fixture.input.states.good.normal.review.scheduledDays,10,'input remains immutable');
  assert.equal(fixture.expected.good.customData,'{"c":2}');
  assert.equal(fixture.expected.hard.customData,'{"c":1}','candidate custom data is independent');
});
test('context seed retains all uint64 bits and filtered states use the same script arguments',()=>{
  const input=structuredClone(fixture.input);
  input.states.good={filtered:{rescheduling:{originalState:{learning:{scheduledSecs:60,remainingSteps:2,elapsedSecs:0}}}}};
  const after=run('if (ctx.seed !== 18446744073709551615n) throw Error("seed"); states.good.filtered.rescheduling.originalState.learning.scheduledSecs=180;',input);
  assert.equal(after.good.filtered.rescheduling.originalState.learning.scheduledSecs,180);
  assert.throws(()=>run('return Promise.resolve();',input),/Async scheduling/);
  assert.throws(()=>run('await Promise.resolve();',input),error=>error.name==='SyntaxError');
  assert.throws(()=>run('states.good.filtered.rescheduling.originalState.learning.scheduledSecs = Infinity;',input),/Non-finite/);
});
test('UTF-8 limits and capability projection expose execution without granting Agent writes',()=>{
  assert.equal(validateSchedulingScript('中'.repeat(20000)),true);
  assert.equal(validateSchedulingScript('中'.repeat(20001)),false);
  assert.equal(customSchedulingInfo('').configured,false);
  assert.deepEqual(customSchedulingInfo('script'),{configured:true,runtime:'bounded_synchronous_javascript',synchronous:true,asyncSupported:false,writableByAgent:true,maxScriptBytes:60000});
});
test('the native request preserves states and context as opaque bytes',()=>{
  const states={current:Uint8Array.of(10,0),again:Uint8Array.of(20,0),hard:Uint8Array.of(30,0),good:Uint8Array.of(40,0),easy:Uint8Array.of(50,0)};
  const card={states,schedulingContext:Uint8Array.of(16,255,255,255,255,255,255,255,255,255,1),customData:'{"c":1}'};
  const reader=new 协议读取器(encodeCustomScheduling(card,'{"states":1}'));
  reader.读取标签();const raw=reader.读取字节();assert.ok(raw.length>0);
  reader.读取标签();assert.deepEqual(reader.读取字节(),card.schedulingContext);
  reader.读取标签();assert.equal(reader.读取字符串(),card.customData);
  reader.读取标签();assert.equal(reader.读取字符串(),'{"states":1}');
});
test('native scheduling adapter validates actual sandbox envelopes and propagates failures',async()=>{
  const calls=[];const Runtime=loadPlatformModule('backend/NativeSchedulingScript.ets','NativeSchedulingScript',{
    decodeCodeArguments,decodeCodeResult,AgentToolSchemaError,sandbox:{start(source,inputJson){calls.push({source,inputJson});return {id:1,result:Promise.resolve(JSON.stringify({ok:true,resultJson:JSON.stringify(fixture.expected)}))};}}
  });
  assert.deepEqual(JSON.parse(await new Runtime().execute(fixture.source,JSON.stringify(fixture.input))),fixture.expected);
  assert.equal(calls.length,1);
  const Failed=loadPlatformModule('backend/NativeSchedulingScript.ets','NativeSchedulingScript',{
    decodeCodeArguments,decodeCodeResult,AgentToolSchemaError,sandbox:{start(){return {id:1,result:Promise.resolve('{"ok":false,"error":"sandbox_deadline"}')};}}
  });
  await assert.rejects(new Failed().execute('return input;','{}'),/deadline/);
});

test('the service prepares input, runs the injected runtime, and returns only native-validated states',async()=>{
  const calls=[];
  const states={current:Uint8Array.of(10,0),again:Uint8Array.of(20,0),hard:Uint8Array.of(30,0),good:Uint8Array.of(40,0),easy:Uint8Array.of(50,0)};
  const card={states,schedulingContext:Uint8Array.of(16,1),customData:'{"c":1}'};
  const response=new 协议写入器();response.写入字符串(1,JSON.stringify(fixture.input));
  const Service=loadPlatformModule('backend/CustomSchedulingService.ts','CustomSchedulingService',{
    CUSTOM_SCHEDULING_SERVICE,encodeCustomScheduling,decodeSchedulingStates,decodeStringResponse,schedulingScriptSource,
    后端会话:{获取实例:()=>({调用:async(service,method,request)=>{
      calls.push({service,method,request});
      assert.equal(service,CUSTOM_SCHEDULING_SERVICE);
      if(method===0){assert.deepEqual(request,encodeCustomScheduling(card));return response.转为字节();}
      assert.equal(method,1);assert.deepEqual(request,encodeCustomScheduling(card,JSON.stringify(fixture.expected)));
      return encodeSchedulingStates(states);
    }})}
  });
  const runtime={execute:async(source,input)=>{
    assert.equal(calls.length,1);assert.equal(source,fixture.source);assert.deepEqual(JSON.parse(input),fixture.input);
    return JSON.stringify(fixture.expected);
  }};
  assert.deepEqual(await new Service(runtime).apply(card,fixture.script),{...states,raw:encodeSchedulingStates(states)});
  assert.deepEqual(calls.map(call=>call.method),[0,1]);
  calls.length=0;
  await assert.rejects(new Service({execute:async()=>{throw Error('script failed');}}).apply(card,fixture.script),/script failed/);
  assert.deepEqual(calls.map(call=>call.method),[0],'a failed script cannot reach the native apply step');
});
