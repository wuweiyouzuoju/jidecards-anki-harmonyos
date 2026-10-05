// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { encodeComputeFsrsParams, decodeComputeFsrsParams, encodeSimulateFsrs, decodeFsrsWorkload } from '../../entry/src/main/ets/proto/messages/FsrsMessages.ts';
import { 协议写入器 } from '../../entry/src/main/ets/proto/core/ProtoWriter.ts';
import { 协议读取器 } from '../../entry/src/main/ets/proto/core/ProtoReader.ts';
import { 调度器方法, 牌组方法 } from '../../entry/src/main/ets/backend/服务索引.ts';
import { encodeEvaluateFsrs, decodeEvaluateFsrs, decodeFsrsMemory, encodeFsrsHistoryCount,
  decodeFsrsHistoryCount, decodeFsrsDaily } from '../../entry/src/main/ets/proto/messages/FsrsMessages.ts';

export const optimizeInput={search:'did:1 -is:suspended',currentParams:[],ignoreRevlogsBeforeMs:0,numOfRelearningSteps:1,healthCheck:true};
export const simulateInput={params:[],desiredRetention:0.9,deckSize:0,daysToSimulate:30,newLimit:10,reviewLimit:100,
  maxInterval:36500,search:'did:1 -is:suspended',newCardsIgnoreReviewLimit:true,easyDaysPercentages:[1,1,1,1,1,1,1],
  reviewOrder:8,suspendAfterLapseCount:8,historicalRetention:0.9,learningStepCount:2,relearningStepCount:1};

test('request golden wire bytes are consumed by real Core Rust tests, with exact locked dispatch',()=>{
  for(const [name,bytes] of [['optimize',encodeComputeFsrsParams(optimizeInput)],['workload',encodeSimulateFsrs(simulateInput)]]){
    assert.equal(Buffer.from(bytes).toString('hex'),readFileSync(new URL(`./fixtures/fsrs-${name}.hex`,import.meta.url),'utf8').trim());
  }
  assert.equal(调度器方法.computeFsrsParams,30);assert.equal(调度器方法.simulateFsrsWorkload,34);assert.equal(牌组方法.getAllDecksLegacy,6);
  assert.equal(Object.keys(调度器方法).some(x=>/optimal|minimum/i.test(x)),false);
});

test('diagnostic golden requests and daily response use the real Core wire layouts',()=>{
 for(const [name,bytes] of [['evaluate',encodeEvaluateFsrs({params:[],search:'did:1 -is:suspended',ignoreRevlogsBeforeMs:0})],
  ['history-count',encodeFsrsHistoryCount('2099-01-01','did:1 -is:suspended')]])
  assert.equal(Buffer.from(bytes).toString('hex'),readFileSync(new URL(`./fixtures/fsrs-${name}.hex`,import.meta.url),'utf8').trim());
 const response=new 协议写入器();response.写入打包浮点(1,[1.5,2.5]);response.写入打包64位整数(2,[3,0]);
 response.写入变长整数(3,0);response.写入变长整数(3,4);response.写入打包浮点(4,[12.5,0]);
 const result=decodeFsrsDaily(response.转为字节(),2);
 assert.deepEqual(result,{accumulatedKnowledge:[1.5,2.5],dailyReviews:[3,0],dailyNew:[0,4],dailyTimeSeconds:[12.5,0]});
 assert.throws(()=>decodeFsrsDaily(response.转为字节(),3),/Incomplete/);
 const count=new 协议写入器();count.写入64位整数(1,0);count.写入64位整数(2,6);
 assert.deepEqual(decodeFsrsHistoryCount(count.转为字节()),{included:0,total:6});
 count.写入64位整数(1,7);assert.throws(()=>decodeFsrsHistoryCount(count.转为字节()),/Invalid/);
 const memory=new 协议写入器();memory.写入浮点(2,0.9);memory.写入浮点(3,-0.5);
 assert.equal(decodeFsrsMemory(memory.转为字节()).state,null);
 const state=new 协议写入器();state.写入浮点(1,8);state.写入浮点(2,5);memory.写入子消息(1,state);
 assert.deepEqual(decodeFsrsMemory(memory.转为字节()).state,{stability:8,difficulty:5});
 const evaluation=new 协议写入器();evaluation.写入浮点(1,0.5);evaluation.写入浮点(2,0.125);
 assert.deepEqual(decodeEvaluateFsrs(evaluation.转为字节()),{logLoss:0.5,rmseBins:0.125});
 evaluation.写入浮点(2,Number.NaN);assert.throws(()=>decodeEvaluateFsrs(evaluation.转为字节()),/Invalid/);
});

test('optimization response accepts packed and unpacked floats, skips unknown fields, distinguishes optional false from absent',()=>{
  const w=new 协议写入器();w.写入打包浮点(1,[1,2]);w.写入浮点(1,3);w.写入变长整数(2,401);w.写入布尔(3,false);w.写入字符串(99,'future');
  assert.deepEqual(decodeComputeFsrsParams(w.转为字节()),{params:[1,2,3],fsrsItems:401,healthCheckPassed:false});
  assert.deepEqual(decodeComputeFsrsParams(new Uint8Array()),{params:[],fsrsItems:0,healthCheckPassed:null});
  assert.throws(()=>decodeComputeFsrsParams(Uint8Array.from([10,4,0])),/exceeds input/);
});

test('optional zero lapse count is encoded while absence is omitted and numeric arrays are packed',()=>{
  const fields=bytes=>{const r=new 协议读取器(bytes),out=[];let t;while((t=r.读取标签())!==null){out.push(t.字段号);r.跳过字段(t.线类型);}return out;};
  assert.ok(fields(encodeSimulateFsrs({...simulateInput,suspendAfterLapseCount:0})).includes(12));
  assert.ok(!fields(encodeSimulateFsrs({...simulateInput,suspendAfterLapseCount:null})).includes(12));
  const out=encodeComputeFsrsParams({...optimizeInput,currentParams:[1,2],ignoreRevlogsBeforeMs:Date.UTC(2026,0,2)});
  const r=new 协议读取器(out);r.读取标签();r.读取字符串();assert.deepEqual(r.读取标签(),{字段号:2,线类型:2});
  assert.deepEqual(r.读取打包浮点(),[1,2]);r.读取标签();assert.equal(r.读取64位整数(),Date.UTC(2026,0,2));
});

test('unordered protobuf maps decode by retention key, including zero values and duplicate last-value semantics',()=>{
  const w=new 协议写入器();
  for(let key=99;key>=70;key--){
    for(const field of [4,1,3]){const e=new 协议写入器();e.写入变长整数(1,key);if(field===4)e.写入变长整数(2,key-70);else e.写入浮点(2,field===1?(key-70)*60:key-70);w.写入子消息(field,e);}
  }
  const dup=new 协议写入器();dup.写入变长整数(1,90);dup.写入浮点(2,123);w.写入子消息(1,dup);w.写入浮点(2,5);w.写入布尔(99,true);
  const response=decodeFsrsWorkload(w.转为字节());
  assert.equal(response.points.length,30);assert.equal(response.points[0].costSeconds,0);assert.equal(response.points[20].costSeconds,123);
  assert.equal(response.points[29].reviewCount,29);assert.equal(response.reviewlessEndMemorized,5);
  assert.throws(()=>decodeFsrsWorkload(new Uint8Array()),/Incomplete/);
});
