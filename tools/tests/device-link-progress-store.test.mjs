// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname, basename } from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import { loadPlatformModule } from './platform-module-harness.mjs';
import { GenericString } from '../../entry/src/main/ets/proto/generated/CoreMessages.ts';
import { SyncActivity } from '../../entry/src/main/ets/model/SyncSettings.ts';
import { AutoSyncScheduler } from '../../entry/src/main/ets/model/AutoSyncScheduler.ts';
import * as progress from '../../entry/src/main/ets/model/device-link/ProgressSync.ts';
import * as collection from '../../entry/src/main/ets/model/device-link/CollectionSync.ts';
import { bytesHex } from '../../entry/src/main/ets/model/device-link/DevicePairing.ts';

async function fixture(t,full=false) {
  const root=await fs.mkdtemp(join(tmpdir(),'jide-progress-'));
  t.after(async()=>{ assert.equal(dirname(root),tmpdir()); assert.ok(basename(root).startsWith('jide-progress-')); await fs.rm(root,{recursive:true,force:true}); });
  const handles=new Map(), calls=[], values=new Map();
  const payload=Buffer.from('完整复习历史📘'.repeat(80));
  const activity=new SyncActivity(),scheduler=new AutoSyncScheduler();
  let failWrite=false,failApply=false;
  const fileIo={OpenMode:{READ_ONLY:0,READ_WRITE:2},
    async open(path,mode) { const handle=await fs.open(path,mode===0?'r':'r+');handles.set(handle.fd,handle);return {fd:handle.fd}; },
    async close(file) { const handle=handles.get(file.fd);handles.delete(file.fd);await handle.close(); },
    async read(fd,buffer,options={}) { return (await handles.get(fd).read(new Uint8Array(buffer),0,Math.min(options.length??buffer.byteLength,37),null)).bytesRead; },
    async write(fd,buffer,options={}) { if(failWrite) throw new Error('disk full');return (await handles.get(fd).write(new Uint8Array(buffer),0,Math.min(options.length??buffer.byteLength,17),null)).bytesWritten; },
    async fsync(fd) { await handles.get(fd).sync(); },stat:fs.stat,unlink:fs.unlink};
  const transport={async 确保已打开(path){assert.equal(path,root);},async 调用(service,method,input){
    assert.equal(service,full?1006:1005);const request=new GenericString(input).getVal();
    const value=full?JSON.parse(request):null,token=full?(value.out||value.token):request;assert.match(token,/^[a-f0-9]{32}$/);
    if(full)assert.match(value.own,/^[a-f0-9]{32}$/);
    calls.push(method);const folder=join(root,full?'.device-collection':'.device-progress'),path=join(folder,token+(full?'.bin':'.jsonl'));await fs.mkdir(folder,{recursive:true});
    if(method===1&&failApply)throw new Error('device_collection_recovery');
    if(method===0) await fs.writeFile(path,payload,{flag:'wx'});
    if(method===2) { const handle=await fs.open(path,'wx');await handle.close(); }
    if(method===1) assert.deepEqual(await fs.readFile(path),payload);
    if(method===3||method===4)await fs.writeFile(path,payload,{flag:'wx'});
    const response=new GenericString();response.setVal(JSON.stringify({cards:1,reviews:1,added_reviews:method===1?1:0,updated_cards:method===1?1:0,
      updated_objects:method===1?2:0,updated_media:method===1?3:0,deleted_media:0,bytes:method===0||method>2?payload.length:0}));return response.toBytes();
  }};
  const name=full?'DeviceCollectionStore':'DeviceProgressStore';
  const Store=loadPlatformModule('backend/device-link/'+name+'.ets',name,{
    ...progress,...collection,bytesHex,fs:fileIo,后端会话:{获取实例:()=>transport},syncActivity:activity,autoSyncScheduler:scheduler,
    notifyFsrsStateChanged:()=>values.set('fsrs_refresh',true),
    AppStorage:{setOrCreate:(key,value)=>values.set(key,value)},linkRandom:async size=>randomBytes(size).toString('hex'),
    cryptoFramework:{createMd:()=>{const hash=createHash('sha256');return {async update(blob){hash.update(blob.data);},async digest(){return {data:new Uint8Array(hash.digest())};}};}}
  });
  return {root,Store,calls,handles,activity,scheduler,payload,values,setFailWrite:()=>{failWrite=true;},setFailApply:()=>{failApply=true;}};
}

test('production file adapter handles short reads/writes, validates SHA256, calls generated Core RPC and cleans only owned files',async t=>{
  const f=await fixture(t),store=new f.Store({filesDir:f.root});await store.acquire();
  const exported=await store.exportFile();assert.equal(exported.hash,createHash('sha256').update(f.payload).digest('hex'));
  const incoming=await store.receiveFile();let count=0;
  while(count<exported.bytes){const data=await store.read(exported.token,Math.min(64*1024,exported.bytes-count));count+=data.length;await store.write(incoming,data);}
  await store.verify(incoming,{...exported,token:incoming});
  assert.deepEqual(await store.merge(incoming),{addedReviews:1,updatedCards:1});
  assert.equal(f.scheduler.hasPending(),true);assert.ok(f.values.get('需要刷新主页'));
  const sentinel=join(f.root,'.device-progress','do-not-remove.txt');await fs.writeFile(sentinel,'retained');
  await store.release();assert.equal(f.activity.isActive(),false);assert.equal(f.handles.size,0);
  assert.deepEqual(await fs.readdir(join(f.root,'.device-progress')),['do-not-remove.txt']);assert.deepEqual(f.calls,[0,2,1]);
});

test('collection adapter streams files through generated extension RPC, holds the shared lease and cleans owned packets',async t=>{
  const f=await fixture(t,true),store=new f.Store({filesDir:f.root},'a'.repeat(32));await store.acquire();
  const exported=await store.capture(),incoming=await store.receiveFile();let count=0;
  while(count<exported.bytes){const data=await store.read(exported.token,Math.min(65536,exported.bytes-count));count+=data.length;await store.write(incoming,data);}
  await store.verify(incoming,{...exported,token:incoming});
  const wanted=await store.plan(incoming,exported.token,'merge');const packed=await store.pack(incoming,exported.token);
  assert.ok(wanted.bytes&&packed.bytes);
  assert.deepEqual(await store.apply(incoming,incoming,'final'),{updatedObjects:2,addedReviews:1,updatedMedia:3,deletedMedia:0});
  assert.equal(f.scheduler.hasPending(),true);assert.equal(f.activity.isActive(),true);
  assert.ok(f.values.get('cardContentChangedTick'),'received content invalidates existing card render sessions');
  assert.equal(f.values.get('fsrs_refresh'),true,'received collection settings refresh mounted FSRS controls through their owner');
  await store.confirm(exported.token);
  await store.release();assert.equal(f.activity.isActive(),false);assert.equal(f.handles.size,0);
  assert.deepEqual(await fs.readdir(join(f.root,'.device-collection')),[]);assert.deepEqual(f.calls,[0,2,3,4,1,5]);
});

test('failed native collection apply refreshes stale content and undo views without scheduling an unconfirmed cloud upload',async t=>{
  const f=await fixture(t,true),store=new f.Store({filesDir:f.root},'a'.repeat(32));await store.acquire();
  const incoming=await store.receiveFile();f.values.clear();f.setFailApply();
  await assert.rejects(store.apply(incoming,incoming,'final'),/recovery/);
  assert.ok(f.values.get('cardContentChangedTick'));assert.ok(f.values.get('需要刷新主页'));assert.equal(f.scheduler.hasPending(),false);
  assert.equal(f.values.get('fsrs_refresh'),true);
  await store.release();assert.equal(f.activity.isActive(),false);assert.equal(f.handles.size,0);
});

test('production adapter rejects overlapping collection work and failed writes without calling merge',async t=>{
  const f=await fixture(t),a=new f.Store({filesDir:f.root}),b=new f.Store({filesDir:f.root});
  const foreign={};f.scheduler.beginOperation(foreign);await assert.rejects(a.acquire(),/busy/);f.scheduler.endOperation(foreign);
  await a.acquire();await assert.rejects(b.acquire(),/busy/);
  const incoming=await a.receiveFile();f.setFailWrite();await assert.rejects(a.write(incoming,new Uint8Array([1,2,3])),/disk full/);
  await a.release();assert.equal(f.activity.isActive(),false);assert.equal(f.scheduler.canSync(),true);assert.equal(f.handles.size,0);
  assert.equal(f.calls.includes(1),false);assert.deepEqual(await fs.readdir(join(f.root,'.device-progress')),[]);
});
