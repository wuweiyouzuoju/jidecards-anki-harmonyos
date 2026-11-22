// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import {generateKeyPairSync,sign,verify,createPublicKey} from 'node:crypto';
const pair=generateKeyPairSync('ed25519');
const user='A'.repeat(32);
function token(feature,identity=user,platform='harmony',key=pair.privateKey){const message=`JGE1.${platform}.${identity}.${feature}`;return message+'.'+sign(null,Buffer.from(message),key).toString('base64url');}
function service(disk=new Map(),fail=false){
 const app=new Map(),cache=new Map(disk);
 let source=readFileSync(new URL('../../entry/src/main/ets/backend/RemoteEntitlements.ets',import.meta.url),'utf8')
  .replace(/^import[^;]+;\s*/gm,'').replace(/^export /gm,'')
  .replace(/const PUBLIC_KEY: string = '[^']+';/,`const PUBLIC_KEY: string = '${pair.publicKey.export({type:'spki',format:'der'}).toString('base64')}';`);
 const deps={REMOTE_AI_KEY:'remoteAiEntitlement',AI_AGENT_CHANNELS_APP_STORAGE_KEY:'aiAgentChannelsEnabled',UNLOCKED_CONTENTS_KEY:'contents',IRIDESCENT_CONTENT:'theme-iridescent',
  AppStorage:{get:key=>key==='abilityContext'?{}:app.get(key),setOrCreate:(key,value)=>app.set(key,value)},
  preferences:{getPreferences:async()=>({get:async(k,f)=>cache.has(k)?cache.get(k):f,put:async(k,v)=>cache.set(k,v),flush:async()=>{if(fail)throw Error('disk full');disk.clear();for(const [k,v]of cache)disk.set(k,v);}})},
  util:{Base64Helper:class{decodeSync(v){return Buffer.from(v,'base64');}},TextEncoder:class{encodeInto(v){return Buffer.from(v);}}},
  cryptoFramework:{createAsyKeyGenerator:()=>({convertKey:async b=>({pubKey:createPublicKey({key:b.data,type:'spki',format:'der'})})}),createVerify:()=>{let key;return{init:async k=>{key=k;},verify:async(d,s)=>verify(null,d.data,key,s.data)};}}
 };
 const api=new Function(...Object.keys(deps),stripTypeScriptTypes(source,{mode:'transform'})+';return {restoreRemoteEntitlements,applyRemoteGrants,appliedRemoteGrants};')(...Object.values(deps));
 return {...api,app,disk};
}
test('signed AI and theme grants persist and restore without network',async()=>{
 const first=service();assert.equal(await first.applyRemoteGrants({},user,['ai','iridescent'].map(feature=>({feature,token:token(feature)}))),true);
 assert.equal(first.app.get('aiAgentChannelsEnabled'),true);assert.deepEqual(first.app.get('contents'),['theme-iridescent']);
 const restart=service(first.disk);await restart.restoreRemoteEntitlements(user);
 assert.deepEqual(restart.appliedRemoteGrants(),['ai','iridescent']);assert.equal(restart.app.get('remoteAiEntitlement'),true);
 assert.equal(await restart.applyRemoteGrants({},user,[{feature:'ai',token:token('ai')}]),false);
});
test('foreign users, platforms, issuers and tampering cannot grant rights',async()=>{
 const client=service(),foreign=generateKeyPairSync('ed25519').privateKey;
 for(const value of [token('ai','B'.repeat(32)),token('ai',user,'ios'),token('ai',user,'harmony',foreign),token('ai').replace('.ai.','.iridescent.')]){
  await client.applyRemoteGrants({},user,[{feature:'ai',token:value}]);
 }
 assert.deepEqual(client.appliedRemoteGrants(),[]);assert.equal(client.app.has('aiAgentChannelsEnabled'),false);
});
test('failed persistence never publishes or acknowledges a grant',async()=>{
 const client=service(new Map(),true);
 await assert.rejects(()=>client.applyRemoteGrants({},user,[{feature:'ai',token:token('ai')}]));
 assert.deepEqual(client.appliedRemoteGrants(),[]);assert.equal(client.app.has('aiAgentChannelsEnabled'),false);assert.equal(client.disk.size,0);
});
