// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadPlatformSource, loadPlatformModule } from './platform-module-harness.mjs';
import * as index from '../../entry/src/main/ets/backend/服务索引.ts';
import { 协议写入器 as Writer } from '../../entry/src/main/ets/proto/core/ProtoWriter.ts';
import { 协议读取器 as Reader } from '../../entry/src/main/ets/proto/core/ProtoReader.ts';
import { 协议写入器 as OldWriter } from './fixtures/protocol-legacy/proto/core/ProtoWriter.ts';
import { 协议读取器 as OldReader } from './fixtures/protocol-legacy/proto/core/ProtoReader.ts';
import * as noteCodec from '../../entry/src/main/ets/proto/messages/NoteMessages.ts';
import * as oldNoteCodec from './fixtures/protocol-legacy/proto/messages/NoteMessages.ts';
import { pack } from './protocol-oracle.mjs';
import { 后端错误 as NativeError } from '../../entry/src/main/ets/backend/错误类型.ts';
import { 后端错误 as OldNativeError } from './fixtures/protocol-legacy/backend/错误类型.ts';
const old=file=>readFileSync(new URL('./fixtures/protocol-legacy/backend/'+file,import.meta.url),'utf8');
test('generated error kinds preserve every old known value and unknown error identity',()=>{
  for(const kind of [-1,...Array.from({length:25},(_,index)=>index),25,999]) {
    const before=new OldNativeError('错误😀',kind,'context',3),after=new NativeError('错误😀',kind,'context',3);
    for(const key of ['message','name','kind','knownKind','context','nativeStatus','knownNativeStatus'])assert.equal(after[key],before[key]);
  }
});
test('inline Service mappings preserve bytes, request count, values and native failure identity',async()=>{
  const note={id:17,guid:'guid',notetypeId:1,mtimeSecs:0,usn:0,tags:[],fields:['{{c1::文字}}','']};
  const cases=[
    {file:'媒体服务.ts',name:'媒体服务',method:'添加媒体文件',args:['汉字😀.png',new Uint8Array([0,128,255])],response:()=>{const w=new Writer();w.写入字符串(1,'new.png');w.写入字符串(1,'last.png');w.写入变长整数(99,17);return w.转为字节();}},
    {file:'笔记服务.ts',name:'笔记服务',method:'clozeNumbersInNote',args:[note],response:()=>{const w=new Writer();w.写入变长整数(1,3);w.写入打包64位整数(1,[1,2,2,65536]);w.写入变长整数(99,17);return w.转为字节();}},
    {file:'笔记类型服务.ts',name:'笔记类型服务',method:'restoreNotetypeToStock',args:[17,1],response:()=>new Uint8Array()}
  ];
  for(const item of cases){const results=[];for(const legacy of [true,false]){const calls=[];let failure=null;const session={调用:async(...args)=>{calls.push(args);if(failure)throw failure;return item.response();}};
      const deps={...index,...(legacy?oldNoteCodec:noteCodec),协议读取器:legacy?OldReader:Reader,协议写入器:legacy?OldWriter:Writer,后端会话:{获取实例:()=>session}};
      const Model=legacy?loadPlatformSource(old(item.file),item.name,deps):loadPlatformModule('backend/'+item.file,item.name,deps);
      const service=new Model();const value=await service[item.method](...item.args);assert.equal(calls.length,1);results.push({calls:pack(calls),value:pack(value)});
      failure=Error('native typed failure');await assert.rejects(service[item.method](...item.args),error=>error===failure);
    }assert.deepEqual(results[0],results[1],item.file+'.'+item.method);}
});
test('import progress retains the first import text, UTF-8 and the existing polling contract',()=>{
  const previous=loadPlatformSource(old('ImportProgressService.ts'),'importProgressText',{协议读取器:OldReader});
  const current=loadPlatformModule('backend/ImportProgressService.ts','importProgressText',{});
  for(const values of [[],['汉字😀'],['first','last']]){const w=new Writer();w.写入变长整数(99,42);for(const value of values)w.写入字符串(7,value);assert.equal(current(w.转为字节()),previous(w.转为字节()));}
  for(const bytes of [new Uint8Array([58,5,1]),new Uint8Array([0xff])]){assert.throws(()=>current(bytes));assert.throws(()=>previous(bytes));}
});

test('history Service migration retains displayed status bytes, undo/redo dispatch and failure identity',async()=>{
  for(const status of [{undo:'',redo:'',lastStep:0},{undo:'删除🙂',redo:'恢复\u0000',lastStep:4294967295}])for(const redo of [false,true]){
    const runs=[];
    for(const legacy of [true,false]){
      const calls=[],failure=Error('history failure');let reject=false;
      const session={调用:async(...args)=>{calls.push(args);if(reject)throw failure;return new Uint8Array();}};
      const deps={协议写入器:legacy?OldWriter:Writer,集合服务:class {async 获取撤销状态(){return status;}},后端会话:{获取实例:()=>session}};
      const Model=loadPlatformSource(legacy?old('CollectionHistoryBackend.ts'):readFileSync(new URL('../../entry/src/main/ets/backend/CollectionHistoryBackend.ts',import.meta.url),'utf8'),'AnkiCollectionHistoryBackend',deps);
      const backend=new Model();assert.equal(await backend.status(),status);await backend.apply(redo,status);
      reject=true;await assert.rejects(backend.apply(redo,status),error=>error===failure);
      runs.push(pack(calls));
    }
    assert.deepEqual(runs[1],runs[0]);
  }
});
