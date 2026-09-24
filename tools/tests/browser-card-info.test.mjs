// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
const source=readFileSync(new URL('../../entry/src/main/ets/components/browser/卡片信息.ets',import.meta.url),'utf8');
const code=(source.slice(0,source.indexOf('  build() {'))+'\n}')
  .replace(/^import[^;]+;\s*/gm,'').replace(/@(Component|Prop|State|StorageProp|Watch)(?:\([^\n]*?\))?\s*/g,'')
  .replace('export struct 卡片信息','class CardInfo');
function panel(read) {
  const Panel=new Function('统计服务','颜色键','$r','resourceText',
    stripTypeScriptTypes(code,{mode:'transform'})+';return CardInfo;')(class{获取卡片统计(id){return read(id);}}, {},key=>key,(_ui,key)=>key);
  const instance=new Panel();instance.getUIContext=()=>({});return instance;
}
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};

test('card info only publishes the latest card and cannot update after unmount',async()=>{
  const first=deferred(),last=deferred();const p=panel(id=>id===1?first.promise:id===3?last.promise:Promise.resolve({id}));
  p.cardId=1;const old=p.load();p.cardId=2;await p.load();first.resolve({id:1});await old;
  assert.equal(p.stats.id,2);assert.equal(p.errorMessage,'');
  p.cardId=3;const gone=p.load();p.aboutToDisappear();last.resolve({id:3});await gone;
  assert.equal(p.stats,null);
});

test('card info failures are visible and a new request can recover',async()=>{
  let fail=true;const p=panel(async id=>{if(fail)throw new Error('offline');return {id};});
  p.cardId=1;await p.load();assert.equal(p.errorMessage,'app.string.browser_info_load_error');
  fail=false;await p.load();assert.equal(p.stats.id,1);assert.equal(p.errorMessage,'');
});
