// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {loadPlatformSource} from './platform-module-harness.mjs';
import {pack,unpack} from './protocol-oracle.mjs';
import {协议写入器 as OldWriter} from './fixtures/protocol-legacy/proto/core/ProtoWriter.ts';
import {协议读取器 as OldReader} from './fixtures/protocol-legacy/proto/core/ProtoReader.ts';
import {协议写入器 as Writer} from '../../entry/src/main/ets/proto/core/ProtoWriter.ts';
import {协议读取器 as Reader} from '../../entry/src/main/ets/proto/core/ProtoReader.ts';

const cases=JSON.parse(readFileSync(new URL('./fixtures/protocol-service-cases.json',import.meta.url))).cases;
const modules=new Map();
async function dependencies(source,legacy){
  const deps={协议写入器:legacy?OldWriter:Writer,协议读取器:legacy?OldReader:Reader};
  // fields() does not use search(), but its real class constructs this collaborator.
  if(source.includes('new 搜索服务(')&&!source.includes('export class 搜索服务'))deps.搜索服务=class {};
  for(const match of source.matchAll(/import(?: type)?\s*\{([^}]+)\}\s*from\s*'([^']+)'/g)){
    const location=match[2];let target;
    if(location==='./服务索引')target=legacy?'./fixtures/protocol-legacy/backend/服务索引.ts':'../../entry/src/main/ets/backend/服务索引.ts';
    else if(location.startsWith('../proto/'))target=(legacy?'./fixtures/protocol-legacy/proto/':'../../entry/src/main/ets/proto/')+location.slice(9)+'.ts';
    else if(location.startsWith('../model/'))target='../../entry/src/main/ets/'+location.slice(3)+'.ts';
    if(!target)continue;
    if(!modules.has(target))modules.set(target,await import(target));
    for(const name of match[1].split(',').map(name=>name.trim())){
      const [original,alias]=name.split(/\s+as\s+/);const value=modules.get(target)[original];
      if(value!==undefined)deps[alias??original]=value;
    }
  }
  return deps;
}

test('83 real domain Service forwarders retain request bytes, dispatch, response values, mutation and failure identity',async t=>{
  let successful=0;
  for(const item of cases){
    const runs=[];
    for(const legacy of [true,false]){
      const source=readFileSync(new URL((legacy?'./fixtures/protocol-legacy/backend/':'../../entry/src/main/ets/backend/')+item.file,import.meta.url),'utf8');
      const W=legacy?OldWriter:Writer,R=legacy?OldReader:Reader,calls=[],failure=Error('same native failure');let shouldFail=false;
      const session={调用:async(...args)=>{calls.push(pack(args));if(shouldFail)throw failure;return unpack(item.response,W,R);}};
      const deps=await dependencies(source,legacy);deps.后端会话={获取实例:()=>session};
      const Model=loadPlatformSource(source,item.model,deps),service=new Model();
      async function run(){
        const args=unpack(item.args,W,R);
        try{return {value:pack(await service[item.method](...args)),after:pack(args)};}
        catch(error){assert.notEqual(error.name,'ReferenceError','missing harness dependency');return {error:{name:error.name,message:error.message,sameFailure:error===failure},after:pack(args)};}
      }
      const value=await run();shouldFail=true;const error=await run();
      assert.equal(calls.length,item.expectedCalls,`${item.file}#${item.method}: legacy request count, including nested media resolution`);
      assert.equal(!value.error,item.successful,`${item.file}#${item.method}: legacy outcome category`);
      assert.equal(error.error?.sameFailure,item.expectedCalls!==0,`${item.file}#${item.method}: native failure identity or pre-dispatch guard`);
      if(legacy&&!value.error)successful++;
      runs.push({value,error,calls});
    }
    assert.deepEqual(runs[1],runs[0],`${item.file}#${item.method}: ${JSON.stringify(item.args).slice(0,160)}`);
  }
  assert.ok(successful>0);
  t.diagnostic(JSON.stringify({cases:cases.length,successful,methods:new Set(cases.map(item=>item.file+'#'+item.method)).size,files:new Set(cases.map(item=>item.file)).size}));
});
