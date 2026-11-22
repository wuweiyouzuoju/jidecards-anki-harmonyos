// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { syncCloudCollection, latestCloudGenerations, parseCloudGeneration, cloudSyncFailureKey, uploadCloudCollection, downloadCloudCollection, legacyCloudSummary } from '../../entry/src/main/ets/model/cloud-sync/CloudCollectionSync.ts';
const own='a'.repeat(32),peer='b'.repeat(32),generation='c'.repeat(32);
const file={bytes:8,hash:'d'.repeat(64)};
const publication=(device=peer,sequence=1,id=generation)=>({version:2,device,generation:id,sequence,snapshot:file});
function fixture(values=[publication()]) {
 const calls=[];let failure='';
 const action=async name=>{calls.push(name);if(failure===name)throw Error(name);};
 const port={acquire:()=>action('acquire'),release:()=>action('release'),refresh:()=>action('refresh'),
  list:async()=>{await action('list');return values;},
  download:async()=>{await action('download');return 'snapshot';},
  apply:async(snapshot,mode)=>{assert.equal(snapshot,'snapshot');await action('apply:'+mode);return {updatedObjects:2,addedReviews:1,updatedMedia:3,deletedMedia:0};},
  capture:async()=>{await action('capture');return {...file,token:'local'};},
   publish:async value=>{await action('publish');port.published=value;},confirm:()=>action('confirm')};
 return {calls,port,fail:name=>{failure=name;}};
}
test('immutable generations select highest per writer and reject malformed or ambiguous versions',()=>{
 assert.deepEqual(latestCloudGenerations([publication(peer,2),publication(peer,1,'e'.repeat(32)),publication(own)]).map(x=>[x.device,x.sequence]),[[own,1],[peer,2]]);
 for(const patch of [{version:1},{device:'../escape'},{snapshot:{...file,bytes:Infinity}},{sequence:0},{snapshot:null}])assert.throws(()=>parseCloudGeneration(JSON.stringify({...publication(),...patch})));
 assert.throws(()=>latestCloudGenerations([publication(),publication(peer,1,'e'.repeat(32))]));
});
test('download and validation precede merge; durable publication precedes deletion acknowledgement',async()=>{
 const f=fixture([publication(),{...publication(own,7),snapshot:{...file,hash:'e'.repeat(64)}}]);
 assert.deepEqual(await syncCloudCollection(f.port,own,generation),{updatedObjects:2,addedReviews:1,updatedMedia:3,deletedMedia:0});
 assert.deepEqual(f.calls,['acquire','refresh','list','download','apply:cloud','capture','publish','confirm','release']);
 assert.equal(f.port.published.sequence,8);
});
test('first device publishes an empty-cloud baseline without overwriting another collection',async()=>{
 const f=fixture([]);await syncCloudCollection(f.port,own,generation);
 assert.equal(f.port.published.sequence,1);assert.ok(!f.calls.some(x=>x.startsWith('apply:')));
});
test('incomplete download, merge failure and failed upload never acknowledge deletion and always release',async()=>{
 for(const failure of ['refresh','download','apply:cloud','publish']){
  const f=fixture();f.fail(failure);await assert.rejects(syncCloudCollection(f.port,own,generation));
  assert.equal(f.calls.at(-1),'release');assert.ok(!f.calls.includes('confirm'));
  if(failure==='download')assert.ok(!f.calls.includes('apply:cloud'));
 }
});
test('restore requires an explicit existing source and uses the backup replacement path',async()=>{
 const f=fixture([publication(),publication('f'.repeat(32))]);await syncCloudCollection(f.port,own,generation,peer);
 assert.equal(f.calls.filter(x=>x==='apply:cloud_replace').length,1);
 const missing=fixture([]);await assert.rejects(syncCloudCollection(missing.port,own,generation,peer));
 assert.ok(!missing.calls.includes('capture'));
});
test('lease refusal does not release someone else lease or start cloud IO',async()=>{
 const f=fixture();f.fail('acquire');await assert.rejects(syncCloudCollection(f.port,own,generation));assert.deepEqual(f.calls,['acquire']);
});

import fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { loadPlatformModule } from './platform-module-harness.mjs';
import * as model from '../../entry/src/main/ets/model/cloud-sync/CloudCollectionSync.ts';
import { cloudSyncProgressText } from '../../entry/src/main/ets/utils/CloudSyncProgressText.ts';
import { cloudGenerationText } from '../../entry/src/main/ets/utils/CloudGenerationText.ts';
import { localeDate } from '../../entry/src/main/ets/utils/LocaleFormatting.ts';

test('unchanged snapshots do not publish again',async()=>{
 const f=fixture([publication(own)]);
 await syncCloudCollection(f.port,own,generation);
 assert.ok(!f.calls.includes('publish'));
});

test('complete COLPKG generations include validated counts and accept large archives without changing the legacy limit',async()=>{
 const summary={cards:7512,notes:7512,decks:2,reviews:53};
 const backup={...publication(),version:3,summary,snapshot:{...file,bytes:512*1024*1024}};
 assert.deepEqual(parseCloudGeneration(JSON.stringify(backup)),backup);
 for(const patch of [{version:2},{summary:undefined},{summary:{...summary,cards:-1}},{summary:{...summary,reviews:1.5}},{snapshot:{...file,bytes:4*1024**3+1}}])
  assert.throws(()=>parseCloudGeneration(JSON.stringify({...backup,...patch})));
 const f=fixture([]);
 f.port.capture=async()=>({...file,token:'local',version:3,summary});
 await uploadCloudCollection(f.port,own,generation);
 assert.equal(f.port.published.version,3);
 assert.deepEqual(f.port.published.summary,summary);
 assert.deepEqual(legacyCloudSummary(JSON.stringify({version:2,objects:{'cards:1':{value:[1]},'cards:2':{value:null},'notes:1':{value:[1]},'decks:1':{value:{}},'revlog:1':{value:[1]}}})),
  {cards:1,notes:1,decks:1,reviews:1});
});

test('cloud adapter reuses shared attachments and rotates metadata without imposing an account budget',async t=>{
 const root=await fs.mkdtemp(join(tmpdir(),'jide-cloud-'));
 t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const cloud=join(root,'cloud');
 await fs.mkdir(cloud);
 await fs.mkdir(join(root,'collection.media'));
 const bytes=Buffer.from('media');
 const hash=createHash('sha256').update(bytes).digest('hex');
 await fs.writeFile(join(root,'collection.media','a.png'),bytes);
 await fs.writeFile(join(root,'collection.media','b.png'),bytes);
 const snapshotPath=join(root,'snapshot');
 const snapshotBytes=Buffer.from(JSON.stringify({version:2,objects:{'cards:1':{value:[1]}},media:{'a.png':{bytes:bytes.length,version:{hash}},'b.png':{bytes:bytes.length,version:{hash}}}}));
 await fs.writeFile(snapshotPath,snapshotBytes);
 const handles=new Map();
 const received=[];
 let copyCount=0; let hashes=0; let blobAccesses=0; let cloudLocation=3;
 let mediaPending=false;
 const leaseEvents=[];
 let largeCloudFile=false;
 const cloudDir=join(cloud,'jidecards-v2');
 const fileIo={OpenMode:{CREATE:1,WRITE_ONLY:2,READ_ONLY:0,TRUNC:4},
  async access(path){if(path.endsWith('.blob'))blobAccesses++;try{await fs.access(path);return true;}catch{return false;}},
  mkdir:fs.mkdir,rename:fs.rename,listFile:fs.readdir,unlink:fs.unlink,readText:path=>fs.readFile(path,'utf8'),
  async stat(path){const info=await fs.stat(path);return {size:largeCloudFile&&path.endsWith('/'+ 'f'.repeat(64)+'.blob')?512*1024*1024:info.size,location:mediaPending&&path.endsWith(hash+'.blob')?1:cloudLocation,mtime:Math.floor(info.mtimeMs/1000)};},
  async copyFile(from,to){if(from.includes('collection.media'))copyCount++;await fs.copyFile(from,to);},
  async open(path,mode){const f=await fs.open(path,mode===0?'r':'w');handles.set(f.fd,f);return {fd:f.fd};},
  async close(file){await handles.get(file.fd).close();handles.delete(file.fd);},
  async fsync(fd){await handles.get(fd).sync();},
  async read(fd,buffer,opts){return (await handles.get(fd).read(new Uint8Array(buffer),0,Math.min(opts.length,3),null)).bytesRead;},
  async write(fd,data){const buf=Buffer.from(data);return (await handles.get(fd).write(buf,0,Math.min(buf.length,13),null)).bytesWritten;}
 };
 class FileSync {on(_,cb){this.cb=cb;cb({state:4,error:0});}off(){this.cb=undefined;}async start(){mediaPending=false;this.cb({state:4,error:0});}async stop(){}}
 const Port=loadPlatformModule('backend/cloud-sync/HuaweiCloudSync.ets','HuaweiCloudPort',{
  ...model,hilog:{info(){}},DeviceCollectionStore:class {
    packetPath(){return snapshotPath;}
    async hashFile(path){hashes++;return createHash('sha256').update(await fs.readFile(path)).digest('hex');}
    async acquire(){leaseEvents.push('acquire');}
    yieldCollection(){leaseEvents.push('yield');}
    async confirm(){leaseEvents.push('confirm');}
    async receiveFile(){received.length=0;return 'received';}
    async write(_,bytes){received.push(Buffer.from(bytes));}
    async verify(_,descriptor){assert.equal(createHash('sha256').update(Buffer.concat(received)).digest('hex'),descriptor.hash);}
  },DevicePairingStore:class{},fs:fileIo,
  cloudSync:{FileSync,SyncState:{COMPLETED:4},ErrorType:{NO_ERROR:0}},canIUse:()=>true});
 const port=new Port({cloudFileDir:cloud,filesDir:root},own);
 await port.refresh();
 const snapshot={token:'s',bytes:snapshotBytes.length,hash:createHash('sha256').update(snapshotBytes).digest('hex')};
 const value={...publication(own),snapshot:{bytes:snapshot.bytes,hash:snapshot.hash}};
 for(let sequence=1;sequence<=6;sequence++)await port.publish({...value,sequence},snapshot);
 assert.equal(copyCount,1);
 assert.equal(hashes,7, 'one attachment hash plus six snapshot hashes; no redundant source hash');
 assert.equal(blobAccesses,0, 'one directory inventory replaces per-attachment existence queries');
 assert.deepEqual((await fs.readdir(cloudDir)).sort(),[
  `${own}_0.ready.json`,`${own}_0.snapshot.bin`,`${own}_1.ready.json`,`${own}_1.snapshot.bin`,`${hash}.blob`].sort());
 assert.equal(latestCloudGenerations(await port.list())[0].sequence,6);
 assert.ok((await port.list()).every(item => item.uploadedAt > 0), 'legacy manifests inherit the file modification time');
 const secondPort=new Port({cloudFileDir:cloud,filesDir:root},peer);
 await secondPort.publish({...value,device:peer},snapshot);
 assert.equal(copyCount,1,'a second device reuses the same cloud attachment');
 mediaPending=true;
 await fs.writeFile(join(cloudDir,'f'.repeat(64)+'.blob'),'');
 largeCloudFile=true;
 await port.publish({...value,sequence:7},snapshot);
 assert.equal(latestCloudGenerations(await port.list())[0].sequence,7);
 const uploadPort=new Port({cloudFileDir:cloud,filesDir:root},own,true);
 await uploadPort.acquire();
 await uploadPort.publish({...value,sequence:8},snapshot);
 assert.deepEqual(leaseEvents,['acquire','yield']);
 await uploadPort.confirm(snapshot.token);
 assert.deepEqual(leaseEvents,['acquire','yield','acquire','confirm']);
 cloudLocation=2;
 await port.publish({...value,sequence:9},snapshot);
 assert.equal(latestCloudGenerations(await port.list())[0].sequence,9, 'cloud-only files remain completed after cache eviction');
 const downloadReports=[];
 const downloadPort=new Port({cloudFileDir:cloud,filesDir:root},own,false,(...args)=>downloadReports.push(args));
 await downloadPort.download({...value,sequence:9});
 assert.deepEqual(Buffer.concat(received),snapshotBytes);
 assert.deepEqual(downloadReports.at(-1),['huawei_cloud_downloading_snapshot',snapshotBytes.length,snapshotBytes.length,'bytes']);
 assert.equal(handles.size,0);
 const backupToken='1'.repeat(32),backupBytes=Buffer.from('PK\x03\x04complete COLPKG with media');
 await fs.mkdir(join(root,'.cloud-backups'));
 await fs.writeFile(join(root,'.cloud-backups',backupToken+'.colpkg'),backupBytes);
 const full={...value,version:3,sequence:10,summary:{cards:7512,notes:7512,decks:2,reviews:5},snapshot:{bytes:backupBytes.length,hash:createHash('sha256').update(backupBytes).digest('hex')}};
 await port.publish(full,{...full.snapshot,token:backupToken});
 assert.deepEqual(await fs.readFile(join(cloudDir,own+'_0.snapshot.bin')),backupBytes,'binary archive is uploaded intact without parsing it as a media index');
 assert.equal((await port.list()).find(item=>item.device===own).summary.cards,7512);
 await fs.unlink(join(cloudDir,hash+'.blob'));
 await fs.writeFile(join(root,'collection.media','a.png'),'other');
 await assert.rejects(port.publish({...value,sequence:10},snapshot),/huawei_cloud_invalid/);
 assert.equal(await fileIo.access(join(cloudDir,hash+'.blob')),false,'changed source cannot publish a content-addressed blob');
 assert.equal(await fileIo.access(join(cloudDir,own+'.blob.pending')),false,'failed staging is cleaned');
});

import { GenericJson } from '../../entry/src/main/ets/proto/generated/CoreMessages.ts';
test('production COLPKG boundary includes media, reopens Core after export and validates before accepting a restore',async()=>{
 const expected={cards:7512,notes:7512,decks:2,reviews:9};
 const events=[],values=new Map();let counts=expected,failExport=false;
 const session={async 标记集合已消费(){events.push('consumed');},async 确保已打开(root){assert.equal(root,'/files');events.push('open');}};
 const rpc=class {
  async Ankidroid_run_db_command(bytes){const query=JSON.parse(new TextDecoder().decode(new GenericJson(bytes).getJson()));assert.match(query.sql,/^select /);assert.deepEqual(query.args,[]);
   const result=new GenericJson();result.setJson(new TextEncoder().encode(JSON.stringify([[counts.cards,counts.notes,counts.decks,counts.reviews]])));return result.toBytes();}
  async ImportExport_export_collection_package(request){assert.deepEqual(request,{path:'/backup.colpkg',options:{includeMedia:true,legacy:false}});events.push('export');if(failExport)throw Error('export failed');}
 };
 const api=loadPlatformModule('backend/cloud-sync/AnkiCollectionBackup.ets','({createAnkiCloudBackup,restoreAnkiCloudBackup})',{
  ...model,CoreRpc:rpc,GenericJson,util:{TextEncoder:class{encodeInto(value){return new TextEncoder().encode(value);}},TextDecoder:{create:()=>({decodeToString:bytes=>new TextDecoder().decode(bytes)})}},
  fs:{access:async()=>true},后端会话:{获取实例:()=>session},集合服务:class{async createBackup(){events.push('local backup');}},
  encodeExportCollectionPackageRequest:(path,options)=>({path,options}),
  替换集合:async(root,path,confirmed,progress,operation,verify)=>{assert.equal(confirmed,true);events.push('import');await verify();events.push('commit');},
  autoSyncScheduler:{request(){events.push('request');}},notifyFsrsStateChanged(){events.push('refresh config');},AppStorage:{setOrCreate:(key,value)=>values.set(key,value)}
 });
 assert.deepEqual(await api.createAnkiCloudBackup('/files','/backup.colpkg'),expected);
 assert.deepEqual(events,['export','consumed','open']);
 failExport=true;await assert.rejects(api.createAnkiCloudBackup('/files','/backup.colpkg'),/export failed/);
 assert.deepEqual(events.slice(-3),['export','consumed','open']);
 events.length=0;await api.restoreAnkiCloudBackup('/files','/backup.colpkg',expected);
 assert.deepEqual(events,['local backup','import','commit','request','refresh config']);
 assert.ok(values.has('需要刷新主页'));assert.ok(values.has('cardContentChangedTick'));
 events.length=0;counts={...expected,cards:0};
 await assert.rejects(api.restoreAnkiCloudBackup('/files','/backup.colpkg',expected),/restore_mismatch/);
 assert.deepEqual(events,['local backup','import','refresh config']);
});

test('legacy restore deduplicates media, bounds cloud reads and drains every active task before failing',async()=>{
 const wanted={files:{}};
 for(let i=0;i<19;i++)wanted.files['media'+i]={bytes:4,version:{hash:i.toString(16).padStart(64,'0')}};
 wanted.files.duplicate=wanted.files.media0;
 let applied=0,active=0,peak=0,completed=0,fail=true;
 const Port=loadPlatformModule('backend/cloud-sync/HuaweiCloudSync.ets','HuaweiCloudPort',{
  ...model,hilog:{info(){}},DeviceCollectionStore:class{
   async capture(){return {token:'local'};}async plan(remote,local,mode){assert.equal(mode,'cloud_replace');return {token:'wanted'};}
   packetPath(token){return token;}async receiveFile(){return 'empty';}async write(){}async verify(){}
   async apply(){assert.equal(active,0);applied++;return {updatedObjects:3,addedReviews:0,updatedMedia:19,deletedMedia:0};}
  },fs:{access:async()=>true,readText:async()=>JSON.stringify(wanted)},canIUse:()=>true
 });
 const reports=[];
 const port=new Port({filesDir:'/files',cloudFileDir:'/cloud'},own,false,(...args)=>reports.push(args));
 port.prepareMedia=async(cache,media)=>{
  active++;peak=Math.max(peak,active);
  try{await new Promise(resolve=>setTimeout(resolve,media.hash.endsWith('3')?1:4));if(fail&&media.hash.endsWith('3'))throw Error('cloud read failed');completed++;}
  finally{active--;}
 };
 await assert.rejects(port.apply('snapshot','cloud_replace'),/cloud read failed/);
 assert.equal(active,0);assert.equal(completed,7);assert.equal(peak,8);assert.equal(applied,0);
 fail=false;completed=0;reports.length=0;
 await port.apply('snapshot','cloud_replace');
 assert.equal(completed,19);assert.equal(applied,1);
 assert.deepEqual(reports.filter(value=>value[0]==='huawei_cloud_preparing_restore_media').at(-1),['huawei_cloud_preparing_restore_media',19,19]);
});

test('shared version label displays a localized zero count for an empty backup',()=>{
 const labels=[];
 const display=loadPlatformModule('utils/CloudGenerationDisplayText.ets','cloudGenerationDisplayText',{
  cloudGenerationText,namedResourceText:(_context,key,count)=>{labels.push([key,count]);return `${count} cards`;}
 });
 const value={...publication(),summary:{cards:0,notes:0,decks:1,reviews:0}};
 assert.match(display({},value,'en-US'),/0 cards$/);
 assert.deepEqual(labels,[['huawei_cloud_card_count','0']]);
});

import { loadComponentLogic } from './platform-module-harness.mjs';
import { AppInterfaceTracker, appInterfaceSurfaceIds } from '../../entry/src/main/ets/model/AppInterface.ts';
import { SETTINGS_GROUPS } from '../../entry/src/main/ets/model/SettingsStructure.ts';
test('settings and JIDE share cloud priority, live controls, explicit restore confirmation and page lifecycle',async()=>{
 const tracker=new AppInterfaceTracker();let active=false,finishRun;const writes=[];let alert;const timers=new Map();let timer=0;
 const service={isBusy:()=>active,progress:()=>-1,stage:()=>'huawei_cloud_working',async upload(context){writes.push('upload');},async download(context,source){active=true;writes.push(source.device);await new Promise(resolve=>{finishRun=resolve;});active=false;},async devices(){return [publication()];}};
 const Component=loadComponentLogic('components/settings/HuaweiCloudSettings.ets','HuaweiCloudSettings',{
  cloudSyncProgressText, cloudGenerationText, cloudGenerationDisplayText: (_context, value, locale) => cloudGenerationText(value, locale), cloudSyncFailureKey,recordSyncSetup:()=>{},huaweiCloudSync:service,appInterface:tracker,settingsItemText:(_,id)=>id,namedResourceText:(_,id)=>id,
  setInterval:fn=>{timers.set(++timer,fn);return timer;},clearInterval:id=>timers.delete(id),DialogButtonDirection:{AUTO:0}});
 let settingsOpens=0;
 const view=new Component();view.getUIContext=()=>({getHostContext:()=>({startAbility:async()=>{settingsOpens++;}}),showAlertDialog:opts=>{alert=opts;}});
 assert.deepEqual(SETTINGS_GROUPS.filter(group=>group.sectionId==='sync').map(group=>group.id),['sync','huawei_cloud','device_link']);assert.ok(appInterfaceSurfaceIds().includes('huawei_cloud'));
 view.aboutToAppear();assert.deepEqual(tracker.snapshot()[0].items.map(item=>item.id),['huawei_cloud_sync','huawei_cloud_sources','huawei_cloud_settings']);
 view.peers=[publication()];view.publish();view.restore(publication());assert.deepEqual(writes,[],'opening confirmation must not write');
 alert.buttons[0].action();assert.deepEqual(writes,[]);
 view.restore(publication());alert.buttons[1].action();await Promise.resolve();assert.deepEqual(writes,[peer]);
 assert.equal(tracker.snapshot()[0].busy,true);
 view.aboutToDisappear();assert.equal(timers.size,0);assert.equal(tracker.snapshot().length,0);
 view.aboutToAppear();assert.equal(view.busy,true,'reopened page sees task owned by service');
 assert.equal(tracker.snapshot()[0].values[0].value,'huawei_cloud_working');
 assert.deepEqual(tracker.snapshot()[0].items.filter(item=>item.enabled).map(item=>item.id),['huawei_cloud_settings']);
 await view.settings();assert.equal(settingsOpens,1);
 finishRun();for(let i=0;i<10;i++)await Promise.resolve();for(const tick of timers.values())tick();
 assert.equal(view.busy,false,'reopened page becomes usable after old task settles');assert.notEqual(view.status,'huawei_cloud_complete','old completion must not update new page');
 view.aboutToDisappear();assert.equal(timers.size,0);
});

test('cloud battery errors publish a charging hint in settings and JIDE', async () => {
 const tracker = new AppInterfaceTracker();
 const Component = loadComponentLogic('components/settings/HuaweiCloudSettings.ets', 'HuaweiCloudSettings', {
  cloudSyncProgressText, cloudGenerationText, cloudGenerationDisplayText: (_context, value, locale) => cloudGenerationText(value, locale), cloudSyncFailureKey, huaweiCloudSync: { isBusy: () => false, progress: () => -1, stage: () => 'huawei_cloud_working' }, appInterface: tracker, settingsItemText: (_, id) => id,
  namedResourceText: (_, id) => id, setInterval: () => 1, clearInterval: () => {},
 });
 const view = new Component();
 view.getUIContext = () => ({});
 view.aboutToAppear();
 for (const [error, key] of [
  ['huawei_cloud_start_22400003', 'huawei_cloud_low_battery'],
  ['huawei_cloud_system_3', 'huawei_cloud_low_battery'],
  ['huawei_cloud_system_4', 'huawei_cloud_low_battery'],
  ['huawei_cloud_start_22400001', 'huawei_cloud_enable_required'],
  ['huawei_cloud_timeout', 'huawei_cloud_timeout'],
  ['huawei_cloud_incomplete', 'huawei_cloud_incomplete'],
 ]) {
  view.run(async () => { throw new Error(error); });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(view.status, key);
  assert.deepEqual(tracker.snapshot()[0].values, [{ id: 'status', value: key }, { id: 'progress', value: '' }]);
  assert.equal(view.busy, false);
 }
 view.aboutToDisappear();
});

test('explicit upload never applies cloud content and download never publishes or confirms deletion', async () => {
 const uploaded = fixture([{ ...publication(own), snapshot: { ...file, hash: 'e'.repeat(64) } }, publication(peer)]);
 await uploadCloudCollection(uploaded.port, own, generation);
 assert.ok(uploaded.calls.includes('publish'));
 assert.ok(!uploaded.calls.includes('download'));
 assert.ok(!uploaded.calls.some(x => x.startsWith('apply:')));
 for (const device of [own, peer]) {
  const downloaded = fixture([publication(device)]);
  await downloadCloudCollection(downloaded.port, publication(device));
  assert.deepEqual(downloaded.calls, ['acquire', 'refresh', 'list', 'download', 'apply:cloud_replace', 'release']);
 }
 const stale = fixture([publication(own, 2)]);
 await assert.rejects(downloadCloudCollection(stale.port, publication(own, 1)), /huawei_cloud_missing/);
 assert.ok(!stale.calls.includes('download'));
});

test('file refresh ignores registration history and waits for this request terminal event', async () => {
 let callback;
 let starts = 0;
 let stopped = 0;
 const Port = loadPlatformModule('backend/cloud-sync/HuaweiCloudSync.ets', 'HuaweiCloudPort', {
  ...model, hilog: { info() {} }, DeviceCollectionStore: class {}, DevicePairingStore: class {},
  fs: { access: async () => true }, canIUse: () => true,
  cloudSync: {
   FileSync: class {
    on(_, cb) { callback = cb; }
    off() { callback = undefined; }
    async start() { starts++; }
    async stop() { stopped++; }
   },
   SyncState: { UPLOADING: 0, DOWNLOADING: 2, COMPLETED: 4, STOPPED: 5, UPLOAD_FAILED: 1, DOWNLOAD_FAILED: 3 },
   ErrorType: { NO_ERROR: 0 },
  },
 });
 const port = new Port({ cloudFileDir: '/cloud', filesDir: '/files' }, own);
 let settled = false;
 const task = port.refresh().finally(() => { settled = true; });
 await new Promise(resolve => setImmediate(resolve));
 assert.equal(starts, 0);
 callback({ state: 4, error: 0 });
 await new Promise(resolve => setImmediate(resolve));
 assert.equal(starts, 1);
 assert.equal(settled, false, 'historical completion cannot finish this refresh');
 callback({ state: 5, error: 0 });
 await new Promise(resolve => setImmediate(resolve));
 assert.equal(settled, false, 'starting a new sync can stop the previous idle task without failing this request');
 callback({ state: 0, error: 0 });
 callback({ state: 4, error: 0 });
 await task;
 assert.equal(callback, undefined);
 assert.equal(stopped, 0);

 const batteryTask = port.refresh();
 await new Promise(resolve => setImmediate(resolve));
 callback({ state: 1, error: 3 });
 assert.equal(starts, 2, 'old failed state must still allow a fresh attempt');
 callback({ state: 1, error: 3 });
 await assert.rejects(batteryTask, /huawei_cloud_system_3/);
 assert.equal(stopped, 0, 'system failure must not stop a separate automatic upload');
 assert.equal(callback, undefined);
});

test('file refresh starts without history and timeout leaves system transfer running', async () => {
 const timers = new Map();
 let callback, starts = 0, stops = 0;
 const Port = loadPlatformModule('backend/cloud-sync/HuaweiCloudSync.ets', 'HuaweiCloudPort', {
  ...model, hilog: { info() {}, warn() {} }, DeviceCollectionStore: class {},
  fs: { access: async () => true, stat: async path => ({ location: locations.get(path) ?? 1 }) }, canIUse: () => true,
  setTimeout(fn, ms) { timers.set(ms, fn); return ms; },
  clearTimeout(ms) { timers.delete(ms); },
  cloudSync: {
   FileSync: class {
    on(_, cb) { callback = cb; }
    off() { callback = undefined; }
    async start() { starts++; }
    stop() { stops++; return new Promise(() => {}); }
   },
   SyncState: { UPLOADING: 0, DOWNLOADING: 2, COMPLETED: 4, STOPPED: 5, UPLOAD_FAILED: 1, DOWNLOAD_FAILED: 3 },
   ErrorType: { NO_ERROR: 0 },
  },
 });
 const port = new Port({ cloudFileDir: '/cloud', filesDir: '/files' }, own);
 const locations = new Map();
 const startWithoutHistory = async () => {
  await new Promise(resolve => setImmediate(resolve));
  const start = [...timers].find(([ms]) => ms < 1000)?.[1];
  assert.ok(start);
  start();
  start();
 };
 const first = port.refresh();
 await startWithoutHistory();
 assert.equal(starts, 1);
 callback({ state: 4, error: 0 });
 await first;
 assert.equal(timers.size, 0);
 const second = port.refresh();
 await startWithoutHistory();
 const timeout = assert.rejects(second, /huawei_cloud_timeout/);
 [...timers.values()][0]();
 await timeout;
 assert.equal(starts, 2);
 assert.equal(stops, 0);
 assert.equal(callback, undefined);
 assert.equal(timers.size, 0);
 const scoped = port.refresh(['/cloud/first.blob', '/cloud/second.blob']);
 await startWithoutHistory();
 await new Promise(resolve => setImmediate(resolve));
 const poll = timers.get(3000);
 assert.ok(poll, 'local-only file cannot finish a backup');
 callback({ state: 4, error: 0 });
 await new Promise(resolve => setImmediate(resolve));
 assert.equal(typeof callback, 'function', 'stale completion after start must keep waiting for this publication');
 assert.ok(timers.has(3000), 'target files still require cloud visibility');
 const initialDeadline = timers.get(180000);
 locations.set('/cloud/first.blob', 3);
 poll();
 await new Promise(resolve => setImmediate(resolve));
 assert.notEqual(timers.get(180000), initialDeadline, 'verified file progress renews the idle deadline');
 locations.set('/cloud/second.blob', 3);
 timers.get(3000)();
 await scoped;
 assert.equal(timers.size, 0, 'cloud-visible files can finish while the system is still busy');
});


test('cloud publication records time, accepts legacy versions and rejects malformed times', async () => {
 const before = Date.now();
 const f = fixture([]);
 await uploadCloudCollection(f.port, own, generation);
 assert.ok(f.port.published.uploadedAt >= before && f.port.published.uploadedAt <= Date.now());
 assert.equal(parseCloudGeneration(JSON.stringify(publication())).uploadedAt, undefined);
 for (const uploadedAt of [0, -1, 1.5, '2026-11-19', null, 8640000000000001]) {
  assert.throws(() => parseCloudGeneration(JSON.stringify({...publication(), uploadedAt})), /huawei_cloud_invalid/);
 }
 const uploadedAt = Date.UTC(2026, 10, 19, 14, 30);
 const version = {...publication(), uploadedAt};
 assert.equal(cloudGenerationText(version, 'zh-Hans'), `${peer.slice(0,8)} · ${localeDate(uploadedAt, 'zh-Hans')}`);
 assert.equal(cloudGenerationText(publication(), 'en-US'), `${peer.slice(0,8)} · —`);
 const tracker = new AppInterfaceTracker();
 const Component = loadComponentLogic('components/settings/HuaweiCloudSettings.ets', 'HuaweiCloudSettings', {
  cloudSyncProgressText, cloudGenerationText, cloudGenerationDisplayText: (_context, value, locale) => cloudGenerationText(value, locale), cloudSyncFailureKey,
  huaweiCloudSync: { isBusy: () => false, progress: () => -1, stage: () => 'huawei_cloud_working', devices: async () => [version] },
  appInterface: tracker, settingsItemText: (_, id) => id, namedResourceText: (_, id) => id,
  setInterval: () => 1, clearInterval() {},
 });
 const view = new Component();
 view.getUIContext = () => ({getHostContext: () => ({})});
 view.aboutToAppear(); view.sources();
 await new Promise(resolve => setImmediate(resolve));
 const observed = tracker.snapshot()[0];
 assert.deepEqual(observed.optionLabels, [cloudGenerationText(version, 'zh-Hans')]);
 assert.equal(observed.items.find(item => item.id === `restore:${peer}`).title, observed.optionLabels[0]);
 view.busy=true;view.completedFiles=32;view.totalFiles=65;view.uploadProgress=49;view.publish();
 assert.equal(tracker.snapshot()[0].values.find(item=>item.id==='progress').value,cloudSyncProgressText(32,65,49,'zh-Hans'));
 view.aboutToDisappear();
});


test('cloud versions sort newest first after selecting each device latest generation', () => {
 const early = {...publication(peer, 2), uploadedAt: 1000};
 const late = {...publication(own), uploadedAt: 2000};
 const superseded = {...publication(peer, 1, 'e'.repeat(32)), uploadedAt: 3000};
 const undated = publication('f'.repeat(32));
 assert.deepEqual(latestCloudGenerations([late, superseded, undated, early]), [late, early, undated]);
 assert.deepEqual(latestCloudGenerations([{...early, uploadedAt:2000}, late]).map(x => x.device), [own, peer]);
});


test('upload polling checks at most 32 files together and publishes exact completed counts', async () => {
 let callback, active=0, peak=0;
 const reports=[];
 const Port=loadPlatformModule('backend/cloud-sync/HuaweiCloudSync.ets','HuaweiCloudPort',{
  ...model, hilog:{info(){},warn(){}}, DeviceCollectionStore:class{}, canIUse:()=>true,
  fs:{access:async()=>true,listFile:async()=>[],async stat(){active++;peak=Math.max(peak,active);await new Promise(resolve=>setImmediate(resolve));active--;return {location:3};}},
  cloudSync:{FileSync:class{on(_,cb){callback=cb;cb({state:4,error:0});}off(){callback=undefined;}async start(){}},SyncState:{COMPLETED:4},ErrorType:{NO_ERROR:0}},
 });
 const port=new Port({cloudFileDir:'/cloud',filesDir:'/files'},own,false,(...args)=>reports.push(args));
 await port.refresh(Array.from({length:65},(_,i)=>`/cloud/${i}.blob`),true);
 assert.equal(peak,32);
 assert.deepEqual(reports.at(-1),['huawei_cloud_uploading_media',65,65]);
 assert.equal(callback,undefined);
 assert.equal(cloudSyncProgressText(32,65,49,'en-US'),'32 / 65 · 49%');
 assert.equal(cloudSyncProgressText(0,0,-1,'zh-Hans'),'');
 assert.equal(cloudSyncProgressText(1024*1024,2*1024*1024,50,'en-US','bytes'),'1.0 / 2.0 MB · 50%');
});


test('service publishes counts, units and percentage together for current task consumers', () => {
 const published=new Map();
 const Service=loadPlatformModule('backend/cloud-sync/HuaweiCloudSync.ets','HuaweiCloudSyncService',{
  ...model,AppStorage:{setOrCreate:(key,value)=>published.set(key,value)},
 });
 const service=new Service();
 service.publishStage('huawei_cloud_downloading_snapshot',3,8,'bytes');
 assert.equal(service.progress(),37);
 assert.equal(published.get('huawei_cloud_completed_files'),3);
 assert.equal(published.get('huawei_cloud_total_files'),8);
 assert.equal(published.get('huawei_cloud_progress_unit'),'bytes');
 service.publishStage('huawei_cloud_applying',0,0);
 assert.equal(service.progress(),-1);
 assert.equal(published.get('huawei_cloud_total_files'),0);
 assert.equal(published.get('huawei_cloud_progress_unit'),'files');
});
