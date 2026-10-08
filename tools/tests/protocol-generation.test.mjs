// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { checkGenerated, diffSchemas, className } from '../core-protocol.mjs';
import { execute, pack } from './protocol-oracle.mjs';
import { 协议写入器 as OldWriter } from './fixtures/protocol-legacy/proto/core/ProtoWriter.ts';
import { 协议读取器 as OldReader } from './fixtures/protocol-legacy/proto/core/ProtoReader.ts';
import { 协议写入器 as Writer } from '../../entry/src/main/ets/proto/core/ProtoWriter.ts';
import { 协议读取器 as Reader } from '../../entry/src/main/ets/proto/core/ProtoReader.ts';
import * as generated from '../../entry/src/main/ets/proto/generated/CoreMessages.ts';
import { CoreRpc } from '../../entry/src/main/ets/proto/generated/CoreRpc.ts';
import * as privateRpc from '../../entry/src/main/ets/proto/generated/PrivateRpc.ts';
import * as scheduling from '../../entry/src/main/ets/proto/messages/SchedulerMessages.ts';
import * as oldScheduling from './fixtures/protocol-legacy/proto/messages/SchedulerMessages.ts';
import { encodeDeck } from '../../entry/src/main/ets/proto/messages/DeckMessages.ts';
import { encodeDeck as oldEncodeDeck } from './fixtures/protocol-legacy/proto/messages/DeckMessages.ts';
import { decodeGraphsResponse } from '../../entry/src/main/ets/proto/messages/StatsMessages.ts';
import { decodeGraphsResponse as oldGraphs } from './fixtures/protocol-legacy/proto/messages/StatsMessages.ts';
import { decodeCard } from '../../entry/src/main/ets/proto/messages/CardsMessages.ts';
import { decodeCard as oldCard } from './fixtures/protocol-legacy/proto/messages/CardsMessages.ts';
import { encodeCardId } from '../../entry/src/main/ets/proto/messages/CardsMessages.ts';
import { encodeCardId as oldCardId } from './fixtures/protocol-legacy/proto/messages/CardsMessages.ts';
const read=file=>readFileSync(new URL(file,import.meta.url));
const schema=JSON.parse(read('../core-protocol-schema.json'));
const corpus=JSON.parse(read('./fixtures/protocol-legacy/corpus.json'));

test('complete descriptor generation is deterministic and semantic drift is visible',()=>{
  checkGenerated(schema);
  for(const group of ['services','messages','enums']){const changed=structuredClone(schema);changed[group][0].name+='changed';assert.ok(diffSchemas(schema,changed).some(row=>row.kind===group));}
  for(const property of ['kind','default','optional','oneof','packed','presence','target','list','id']){
    const changed=structuredClone(schema);changed.messages.find(m=>m.fields.length).fields[0][property]='changed';assert.ok(diffSchemas(schema,changed).some(row=>row.kind==='messages'));
  }
  const stale=structuredClone(schema);stale.privateFingerprint='changed';assert.throws(()=>checkGenerated(stale),/stale/);
  for(const service of schema.services)for(const method of service.methods)assert.equal(method.id,method.protoIndex+(method.delegated?service.ownMethodCount:0),`${service.name}.${method.name}: official delegation rule`);
});
test('frozen working-tree oracle is immutable and every exported adapter has successful differential inputs',()=>{
  const manifest=JSON.parse(read('./fixtures/protocol-legacy/manifest.json'));
  for(const[file,hash]of Object.entries(manifest.files))assert.equal(createHash('sha256').update(read('./fixtures/protocol-legacy/'+file)).digest('hex'),hash,file);
  const inventory=JSON.parse(read('../protocol/inventory.json'));
  const oldEntries=[];
  for(const file of readdirSync(new URL('./fixtures/protocol-legacy/proto/messages/',import.meta.url)))for(const match of read('./fixtures/protocol-legacy/proto/messages/'+file).toString().matchAll(/export function ([\w\u0080-\uffff]+)\(/g))oldEntries.push(file+'#'+match[1]);
  assert.equal(inventory.migrations.length,oldEntries.length);
  for(const name of oldEntries)assert.ok(corpus.some(row=>row.file+'#'+row.entry===name&&!row.outcome.error),name+' has no successful oracle input');
});
for(const file of [...new Set(corpus.map(row=>row.file))]){
  const old=await import('./fixtures/protocol-legacy/proto/messages/'+file);
  const now=await import('../../entry/src/main/ets/proto/messages/'+file);
  for(const entry of [...new Set(corpus.filter(row=>row.file===file).map(row=>row.entry))])test(`old/new bytes, values, presence, errors and mutation: ${file}#${entry}`,()=>{
    for(const row of corpus.filter(row=>row.file===file&&row.entry===entry)){
      const before=execute(old[entry],row.inputs,OldWriter,OldReader);assert.deepEqual(before,row.outcome,'frozen oracle outcome changed');
      const after=execute(now[entry],row.inputs,Writer,Reader);
      if(entry==='decodeSchedulingStates'&&!after.error){assert.equal(after.value.raw.$bytes,row.inputs[0].$bytes);delete after.value.raw;}
      if(entry==='decodeQueuedCards'&&!after.error)for(const card of after.value.cards)if(card.states.raw)delete card.states.raw;
      assert.deepEqual(after,before,JSON.stringify(row.inputs).slice(0,180));
    }
  });
}
test('all generated RPC wrappers preserve input, output and error identity without exposing capabilities',async()=>{
  const error=Error('native failure');const response=new Uint8Array([8,1]);const input=new Uint8Array([16,42]);let called;
  const transport={调用:async(...args)=>{called=args;return response;}};const rpc=new CoreRpc(transport);
  for(const service of schema.services)for(const method of service.methods){const name=service.name.replace(/^Backend/,'').replace(/Service$/,'')+'_'+method.name;assert.equal(await rpc[name](input),response);assert.deepEqual(called,[service.id,method.id,input]);transport.调用=async()=>{throw error;};await assert.rejects(rpc[name](input),e=>e===error);transport.调用=async(...args)=>{called=args;return response;};}
  const spec=JSON.parse(read('../protocol/private-rpc.json'));
  for(const[name,service]of Object.entries(spec))for(const[method,id]of Object.entries(service.methods)){assert.equal(await new privateRpc[name+'Rpc'](transport)[method](input),response);assert.deepEqual(called,[service.id,id,input]);}
});
test('every generated message preserves raw unknown fields; defaults, presence and oneof follow descriptors',()=>{
  for(const message of schema.messages){const Model=generated[className(message.name)];assert.equal(typeof Model,'function',message.name);const unknown=new Uint8Array([0xf8,0x3e,42]);assert.deepEqual(new Model(unknown).toBytes(),unknown);
    const value=new Model();for(const field of message.fields){const name=field.jsonName[0].toUpperCase()+field.jsonName.slice(1);assert.equal(value['has'+name](),false);const decoded=value['get'+name]();if(field.list||field.map)assert.deepEqual(decoded,[]);else if(field.kind==='message')assert.equal(decoded,null);else if(field.kind==='bytes')assert.equal(decoded.length,0);else assert.equal(decoded,field.kind==='string'?'':field.kind==='bool'?false:0);}
  }
  const a=new generated.SchedulerSchedulingState();a.setNormal(new Uint8Array());a.setFiltered(new Uint8Array());assert.equal(a.hasNormal(),false);assert.equal(a.hasFiltered(),true);assert.equal(a.getNormal(),null);
  const memory=new generated.CardsFsrsMemoryState();memory.setStability(1.25);const first=new generated.CardsCard();first.setMemoryState(memory.toBytes());const secondMemory=new generated.CardsFsrsMemoryState();secondMemory.setDifficulty(2.5);first.setMemoryState(secondMemory.toBytes());assert.deepEqual(new generated.CardsFsrsMemoryState(first.getMemoryState()).getStability(),1.25);assert.equal(new generated.CardsFsrsMemoryState(first.getMemoryStateLast()).getStability(),0);
});
test('uint64 and int64 full width are lossless; domain numbers reject unsafe precision',()=>{
  const context=new generated.SchedulerSchedulingContext();context.setSeedBig((1n<<64n)-1n);assert.equal(new generated.SchedulerSchedulingContext(context.toBytes()).getSeedBig(),(1n<<64n)-1n);assert.throws(()=>context.getSeed(),/safe integer/);
  const ids=new generated.CardsCardIds();ids.setCidsBig([-(1n<<63n),(1n<<63n)-1n]);assert.deepEqual(new generated.CardsCardIds(ids.toBytes()).getCidsBig(),[-(1n<<63n),(1n<<63n)-1n]);assert.throws(()=>ids.getCids(),/safe integer/);assert.throws(()=>context.setSeedBig(1n<<64n),/64-bit range/);
});
test('integer writer boundary differences are explicit; lifecycle calls are not falsely unconnected',()=>{
  assert.deepEqual(encodeCardId(Number.MAX_SAFE_INTEGER),oldCardId(Number.MAX_SAFE_INTEGER));
  assert.ok(oldCardId(Number.MAX_SAFE_INTEGER+1).length);assert.throws(()=>encodeCardId(Number.MAX_SAFE_INTEGER+1),/safe integer/);
  for(const value of [1.5,NaN]){assert.throws(()=>oldCardId(value),RangeError);assert.throws(()=>encodeCardId(value),error=>error.constructor===Error&&/safe integer/.test(error.message));}
  const inventory=JSON.parse(read('../protocol/inventory.json'));
  for(const method of ['open_collection','close_collection','latest_progress','set_wants_abort','import_collection_package'])assert.equal(inventory.rpc.find(r=>r.method===method).status,'生命周期/控制契约已调用');
});
test('Core-supported wide bool and malformed known wire have explicit legacy differences',()=>{
  const writer=new Writer();writer.写入标签(1,0);writer.写入宽整数载荷('uint64',(1n<<64n)-1n);
  assert.equal(new generated.GenericBool(writer.转为字节()).getVal(),true);
  assert.throws(()=>new OldReader(writer.转为字节().slice(1)).读取变长整数(),/safe integer/);
  const wrongWire=new Uint8Array([10,0]);assert.equal(oldCard(wrongWire).id,0);
  assert.throws(()=>decodeCard(wrongWire),/invalid wire type/);
});
test('SchedulingStates raw bytes retain envelope unknowns and explicit field edits remain effective',()=>{
  const original=new Writer();original.写入字节(4,new Uint8Array([10,0]));original.写入变长整数(99,17);original.写入字节(1,new Uint8Array());
  const bytes=original.转为字节(),value=scheduling.decodeSchedulingStates(bytes);assert.deepEqual(scheduling.encodeSchedulingStates(value),bytes);assert.notDeepEqual(oldScheduling.encodeSchedulingStates(oldScheduling.decodeSchedulingStates(bytes)),bytes);
  value.good=new Uint8Array([18,0]);const changed=scheduling.encodeSchedulingStates(value);assert.deepEqual(new generated.SchedulerSchedulingStates(changed).getGoodLast(),value.good);assert.deepEqual(new generated.SchedulerSchedulingStates(changed).preserved(),[new Uint8Array([0x98,6,17])]);
});
test('documented Core corrections: signed Deck fields and concatenated packed button counts',()=>{
  const deck={id:17,name:'signed',mtimeSecs:0,usn:-1,common:null,normal:null};assert.notDeepEqual(encodeDeck(deck),oldEncodeDeck(deck));assert.equal(new generated.DecksDeck(encodeDeck(deck)).getUsn(),-1);assert.equal(new generated.DecksDeck(oldEncodeDeck(deck)).getUsn(),0);
  const buttons=new Writer();buttons.写入打包64位整数(1,[1,2]);buttons.写入变长整数(1,3);buttons.写入打包64位整数(1,[4,5]);const intervals=new generated.StatsGraphsResponseButtons();intervals.setOneMonth(buttons.转为字节());const graph=new generated.StatsGraphsResponse();graph.setButtons(intervals.toBytes());
  assert.deepEqual(decodeGraphsResponse(graph.toBytes()).buttons.oneMonth.learning,[1,2,3,4,5]);assert.deepEqual(oldGraphs(graph.toBytes()).buttons.oneMonth.learning,[4,5]);
});
