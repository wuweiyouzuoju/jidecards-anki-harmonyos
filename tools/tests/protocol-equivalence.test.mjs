// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execute} from './protocol-oracle.mjs';
import {协议写入器 as OldWriter} from './fixtures/protocol-legacy/proto/core/ProtoWriter.ts';
import {协议读取器 as OldReader} from './fixtures/protocol-legacy/proto/core/ProtoReader.ts';
import {协议写入器 as Writer} from '../../entry/src/main/ets/proto/core/ProtoWriter.ts';
import {协议读取器 as Reader} from '../../entry/src/main/ets/proto/core/ProtoReader.ts';
import {decodeCard,encodeCard} from '../../entry/src/main/ets/proto/messages/CardsMessages.ts';
import {decodeCard as oldCard,encodeCard as oldEncodeCard} from './fixtures/protocol-legacy/proto/messages/CardsMessages.ts';
import {decodeCsvMetadata} from '../../entry/src/main/ets/proto/messages/CsvImportMessages.ts';
import {decodeCsvMetadata as oldCsv} from './fixtures/protocol-legacy/proto/messages/CsvImportMessages.ts';
import {encodeDeckConfig} from '../../entry/src/main/ets/proto/messages/DeckConfigMessages.ts';
import {encodeDeckConfig as oldDeckConfig} from './fixtures/protocol-legacy/proto/messages/DeckConfigMessages.ts';
import {CardsCardId, SchedulerSchedulingContext, DeckConfigDeckConfig, DeckConfigUpdateDeckConfigsRequest, ImportExportCsvMetadata} from '../../entry/src/main/ets/proto/generated/CoreMessages.ts';

const read=file=>JSON.parse(readFileSync(new URL(file,import.meta.url)));
const corpus=read('./fixtures/protocol-legacy/corpus.json');
const reviewed=read('./fixtures/protocol-equivalence-differences.json').cases;
const modules=new Map();
for(const file of new Set(corpus.map(row=>row.file)))modules.set(file,[await import('./fixtures/protocol-legacy/proto/messages/'+file),await import('../../entry/src/main/ets/proto/messages/'+file)]);
function normalized(entry,result){
  if(!result.error&&entry==='decodeSchedulingStates')delete result.value.raw;
  if(!result.error&&entry==='decodeQueuedCards')for(const card of result.value.cards)delete card.states.raw;
  return result;
}
function fields(hex){
  const bytes=new Uint8Array(Buffer.from(hex,'hex')),reader=new OldReader(bytes),out=[];
  while(!reader.已读完){
    const start=reader.当前位置,tag=reader.读取标签();
    const payload=tag.线类型===2?reader.读取字节():null;
    if(payload===null)reader.跳过字段(tag.线类型);
    out.push({tag,payload,raw:Buffer.from(bytes.slice(start,reader.当前位置)).toString('hex')});
  }
  return out;
}
function nestedVariants(hex,depth=0){
  let parts;try{parts=fields(hex);}catch{return [];}
  const out=[];
  for(const [index,field]of parts.entries()){
    const replacements=[];
    if(field.tag.线类型===0)for(const value of [0,1,127,128,2147483647]){
      const writer=new OldWriter();writer.写入变长整数(field.tag.字段号,value);
      replacements.push(['scalar:'+value,Buffer.from(writer.转为字节()).toString('hex')]);
    }
    if(field.payload?.length&&depth<2)for(const [reason,payload]of nestedVariants(Buffer.from(field.payload).toString('hex'),depth+1)){
      const writer=new OldWriter();writer.写入字节(field.tag.字段号,new Uint8Array(Buffer.from(payload,'hex')));
      replacements.push(['nested:'+reason,Buffer.from(writer.转为字节()).toString('hex')]);
    }
    for(const [reason,piece]of replacements)out.push([reason+'@'+depth+'/'+index,parts.map(item=>item.raw).join('')+piece]);
  }
  if(depth>0)out.push(['duplicate-nested',hex+hex],['reverse-nested',[...parts].reverse().map(item=>item.raw).join('')]);
  return out;
}
function leaves(value,path=[],out=[]){
  if(['number','string','boolean'].includes(typeof value))out.push([path,value]);
  else if(value&&typeof value==='object'&&!Object.keys(value).some(key=>key.startsWith('$')))for(const [key,item]of Object.entries(value))leaves(item,[...path,key],out);
  return out;
}

test('expanded old/new comparison covers scalar changes, unknowns, nested duplicates, ordering and local preference edits',t=>{
  const seen=new Set(),usedReviewed=new Set(),counts={cases:0,bytes:0,values:0,errors:0,reviewedDifferences:0};
  function compare(row,inputs,reason){
    const key=JSON.stringify([row.file,row.entry,inputs]);if(seen.has(key))return;seen.add(key);
    const [old,now]=modules.get(row.file);
    const before=normalized(row.entry,execute(old[row.entry],inputs,OldWriter,OldReader));
    const after=normalized(row.entry,execute(now[row.entry],inputs,Writer,Reader));
    counts.cases++;counts[before.error?'errors':before.value?.$bytes||before.value?.$writer?'bytes':'values']++;
    const expected=reviewed.find(item=>JSON.stringify([item.file,item.entry,item.inputs])===key);
    if(expected){
      assert.deepEqual(before,expected.before,'reviewed legacy evidence changed');
      assert.deepEqual(after,expected.after,'reviewed Core correction changed');
      usedReviewed.add(key);counts.reviewedDifferences++;
    }else assert.deepEqual(after,before,`${row.file}#${row.entry} ${reason}: ${JSON.stringify(inputs).slice(0,240)}`);
  }
  for(const row of corpus){
    compare(row,row.inputs,'frozen input');
    if(/^encode/.test(row.entry))for(const [path,value]of leaves(row.inputs)){
      // Shared valid 32-bit range; negative enums and out-of-range integers are checked separately.
      const variants=typeof value==='number'?[0,1,127,128,2147483647]:typeof value==='string'?['','中文🙂é\u0000尾','a\u0301']:[!value];
      for(const variant of variants){const inputs=structuredClone(row.inputs);let target=inputs;for(const key of path.slice(0,-1))target=target[key];target[path.at(-1)]=variant;compare(row,inputs,'scalar:'+path.join('.'));}
    }
    if(!/^encode/.test(row.entry))for(const [index,input]of row.inputs.entries()){
      const holder=input?.$bytes!==undefined?input:input?.$reader;if(holder?.$bytes===undefined)continue;
      let pieces;try{pieces=fields(holder.$bytes).map(field=>field.raw);}catch{continue;}
      const variants=[['unknown-first','f83e2a'+holder.$bytes],['unknown-last',holder.$bytes+'f83e2a'],['repeat-message',holder.$bytes+holder.$bytes],['reverse-fields',[...pieces].reverse().join('')],...nestedVariants(holder.$bytes)];
      for(let i=0;i<pieces.length;i++)variants.push(['duplicate-field:'+i,[...pieces.slice(0,i),pieces[i],...pieces.slice(i)].join('')],['drop-field:'+i,[...pieces.slice(0,i),...pieces.slice(i+1)].join('')]);
      for(const [reason,hex]of variants){const inputs=structuredClone(row.inputs);(input.$bytes!==undefined?inputs[index]:inputs[index].$reader).$bytes=hex;compare(row,inputs,reason);}
    }
  }
  assert.equal(usedReviewed.size,reviewed.length,'reviewed correction must remain exercised');
  t.diagnostic(JSON.stringify(counts));
});

test('CSV same oneof branch accumulates columns and changing branches clears previous columns, matching old and Core',()=>{
  const cases=[
    [66,4,8,7,16,1,66,4,18,2,2,3],
    [66,4,8,7,16,1,66,4,18,2,2,3,72,5,66,2,16,4]
  ];
  for(const [index,values]of cases.entries()){
    const bytes=new Uint8Array(values),after=decodeCsvMetadata(bytes);
    assert.deepEqual(after,oldCsv(bytes));
    assert.deepEqual(after.fieldColumns,index===0?[1,2,3]:[4]);
    assert.equal(after.notetypeId,index===0?7:0);
    assert.equal(after.notetypeColumn,0);
    assert.deepEqual(new ImportExportCsvMetadata(bytes).toBytes(),bytes);
  }
});

test('sint32 narrows before zigzag and valid signed boundaries retain legacy bytes and values',()=>{
  const over32=new Uint8Array([72,128,128,128,128,16]);
  assert.equal(decodeCard(over32).due,0);assert.equal(oldCard(over32).due,0);
  const seed=oldCard(new Uint8Array());
  for(const key of ['usn','queue','due','originalDue'])for(const value of [-2147483648,-1,0,1,2147483647]){
    const card={...seed,[key]:value};assert.deepEqual(encodeCard(card),oldEncodeCard(card));assert.deepEqual(decodeCard(oldEncodeCard(card)),oldCard(oldEncodeCard(card)));
  }
});

test('DeckConfig negative usn is an explicit Core correction, including nested update requests',()=>{
  const value={id:0,name:'',mtimeSecs:0,usn:-1,config:null};
  const before=oldDeckConfig(value),after=encodeDeckConfig(value);
  assert.equal(new DeckConfigDeckConfig(before).getUsn(),0);
  assert.equal(new DeckConfigDeckConfig(after).getUsn(),-1);
  assert.deepEqual(after,new Uint8Array([32,255,255,255,255,255,255,255,255,255,1]));
  const row=corpus.find(row=>row.entry==='encodeUpdateDeckConfigsRequest'&&row.inputs[0]?.configs?.length);
  const inputs=structuredClone(row.inputs);inputs[0].configs[0].usn=-1;
  const [old,now]=modules.get('DeckConfigMessages.ts');
  for(const [codec,expected]of [[old,0],[now,-1]]){
    const request=new DeckConfigUpdateDeckConfigsRequest(codec.encodeUpdateDeckConfigsRequest(...inputs));
    assert.equal(new DeckConfigDeckConfig(request.getConfigs()[0]).getUsn(),expected);
  }
});

test('overflowing uint64/int64 varints and field tags are rejected; maximum valid width remains raw',()=>{
  const overflow=new Uint8Array([8,128,128,128,128,128,128,128,128,128,2]);
  assert.equal(new OldReader(overflow.slice(1)).读取64位整数(),0);
  assert.throws(()=>new CardsCardId(overflow),/64-bit range/);
  assert.throws(()=>new SchedulerSchedulingContext(new Uint8Array([16,...overflow.slice(1)])),/64-bit range/);
  const tag=new Uint8Array([128,128,128,128,16,0]);assert.equal(new OldReader(tag).读取标签().字段号,536870912);
  assert.throws(()=>new CardsCardId(tag),/tag exceeds 32-bit range/);
  const max=new Uint8Array([8,255,255,255,255,255,255,255,255,255,1]);assert.equal(new CardsCardId(max).getCidBig(),-1n);assert.deepEqual(new CardsCardId(max).toBytes(),max);
});

test('149 explicitly reviewed signed, negative-enum and out-of-range input differences cannot silently change',()=>{
  for(const row of read('./fixtures/protocol-boundary-differences.json').cases){
    const [old,now]=modules.get(row.file);
    assert.deepEqual(execute(old[row.entry],row.inputs,OldWriter,OldReader),row.before,'legacy boundary evidence changed');
    assert.deepEqual(execute(now[row.entry],row.inputs,Writer,Reader),row.after,'reviewed boundary behavior changed: '+row.file+'#'+row.entry+' '+row.reason);
    assert.notDeepEqual(row.after,row.before,'must remain an explicit difference');
  }
});
