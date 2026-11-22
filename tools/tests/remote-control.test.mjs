// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import {generateKeyPairSync,sign,verify,createPublicKey,randomUUID} from 'node:crypto';
import * as protocol from '../../entry/src/main/ets/model/RemoteControlProtocol.ts';
const pair=generateKeyPairSync('ed25519'),user='A'.repeat(32);
const diagnostic={queued_events:5,foreground:true,heartbeat_seconds:10,configuration_revision:0};
function token(payload,key=pair.privateKey){const raw=Buffer.from(JSON.stringify({protocol_version:1,platform:'harmony',user_id:user,...payload})).toString('base64url');const message='JCP1.'+raw;return message+'.'+sign(null,Buffer.from(message),key).toString('base64url');}
function config(revision,heartbeat_seconds=30){return token({kind:'configuration',revision,settings:{heartbeat_seconds,announcements_enabled:true}});}
function command(action,extra={}){return token({kind:'command',action,id:randomUUID(),expires_at:new Date(Date.now()+60000).toISOString(),...extra});}
function client(disk=new Map(),fail=false){
 const cache=new Map(disk);
 const prefs={get:async(k,f)=>cache.has(k)?cache.get(k):f,put:async(k,v)=>cache.set(k,v),flush:async()=>{if(fail)throw Error('disk full');disk.clear();for(const [k,v]of cache)disk.set(k,v);}};
 const dependencies={...protocol,preferences:{getPreferences:async()=>prefs},
  util:{Base64Helper:class{decodeSync(s){return Buffer.from(s,'base64');}},TextEncoder:class{encodeInto(s){return Buffer.from(s);}},TextDecoder:class{decodeToString(b){return Buffer.from(b).toString('utf8');}}},
  cryptoFramework:{createAsyKeyGenerator:()=>({convertKey:async b=>({pubKey:createPublicKey({key:b.data,type:'spki',format:'der'})})}),createVerify:()=>{let key;return{init:async k=>{key=k;},verify:async(d,s)=>verify(null,d.data,key,s.data)};}}};
 let source=readFileSync(new URL('../../entry/src/main/ets/backend/RemoteControl.ets',import.meta.url),'utf8').replace(/^import[^;]+;\s*/gm,'').replace(/^export /gm,'').replace(/const PUBLIC_KEY: string = '[^']+';/,`const PUBLIC_KEY: string = '${pair.publicKey.export({type:'spki',format:'der'}).toString('base64')}';`);
 const exports='{restoreRemoteControl,applyRemoteControl,remoteControlReport,remoteHeartbeatMs,remoteAnnouncementsEnabled,remoteSnapshotPending,remoteAnnouncementRefreshPending,completeRemoteSnapshot,completeRemoteAnnouncementRefresh,setRemoteAnnouncementListener}';
 return {disk,...new Function(...Object.keys(dependencies),stripTypeScriptTypes(source,{mode:'transform'})+';return '+exports)(...Object.values(dependencies))};
}
const envelope=(configuration=null,commands=[],ids=[])=>({protocol_version:1,configuration,commands,acknowledged_receipt_ids:ids});
test('signed configuration restores offline, ignores replay and rejects invalid intervals',async()=>{
 const first=client();await first.restoreRemoteControl({},user);await first.applyRemoteControl(envelope(config(2)),diagnostic);
 assert.equal(first.remoteHeartbeatMs(),30000);assert.equal(first.remoteControlReport().configuration_revision,2);
 await first.applyRemoteControl(envelope(config(1,60)),diagnostic);assert.equal(first.remoteHeartbeatMs(),30000);
 await first.applyRemoteControl(envelope(config(3,1)),diagnostic);assert.equal(first.remoteHeartbeatMs(),30000);
 const restart=client(first.disk);await restart.restoreRemoteControl({},user);assert.equal(restart.remoteHeartbeatMs(),30000);
 const wrong=client(first.disk);await wrong.restoreRemoteControl({},'B'.repeat(32));assert.equal(wrong.remoteHeartbeatMs(),10000);
});
test('durable command receipts survive lost responses, restart and duplicate delivery',async()=>{
 const first=client();await first.restoreRemoteControl({},user);
 const full=command('refresh_snapshot'),notice=command('refresh_announcements'),diag=command('report_diagnostics');
 let notified=0;first.setRemoteAnnouncementListener(()=>{notified++;});
 await first.applyRemoteControl(envelope(null,[full,notice,diag]),diagnostic);
 assert.equal(first.remoteSnapshotPending(),true);assert.equal(first.remoteAnnouncementRefreshPending(),true);assert.equal(notified,1);
 assert.deepEqual(first.remoteControlReport().receipts[2].diagnostics,diagnostic);
 const restart=client(first.disk);await restart.restoreRemoteControl({},user);await restart.applyRemoteControl(envelope(null,[full,notice,diag]),diagnostic);
 assert.equal(restart.remoteControlReport().receipts.length,3);
 const ids=restart.remoteControlReport().receipts.map(x=>x.id);
 await restart.completeRemoteSnapshot();await restart.completeRemoteAnnouncementRefresh();
 await restart.applyRemoteControl(envelope(null,[full,notice,diag],ids),diagnostic);
 assert.equal(restart.remoteControlReport().receipts.length,0);assert.equal(restart.remoteSnapshotPending(),false);assert.equal(restart.remoteAnnouncementRefreshPending(),false);
});
test('unsupported, expired, wrong-install, wrong-platform and forged commands have no effect',async()=>{
 const c=client();await c.restoreRemoteControl({},user);
 const other=generateKeyPairSync('ed25519');
 await c.applyRemoteControl(envelope(null,[command('delete_collection'),command('refresh_snapshot',{expires_at:'2020-01-01T00:00:00Z'}),command('refresh_snapshot',{platform:'ios'}),command('refresh_snapshot',{user_id:'B'.repeat(32)}),token({kind:'command',id:randomUUID(),action:'refresh_snapshot'},other.privateKey)]),diagnostic);
 assert.equal(c.remoteSnapshotPending(),false);
 assert.deepEqual(c.remoteControlReport().receipts.map(x=>x.code),['unsupported_action','expired']);
});
test('failed storage never acknowledges or publishes configuration or commands',async()=>{
 const c=client(new Map(),true);await c.restoreRemoteControl({},user);
 await assert.rejects(()=>c.applyRemoteControl(envelope(config(1),[command('refresh_snapshot')]),diagnostic));
 assert.equal(c.remoteHeartbeatMs(),10000);assert.equal(c.remoteSnapshotPending(),false);assert.deepEqual(c.remoteControlReport().receipts,[]);assert.equal(c.disk.size,0);
});
