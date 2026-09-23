// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadComponentLogic } from './platform-module-harness.mjs';
import { CloudDeckImportController } from '../../entry/src/main/ets/model/CloudDeckImportController.ts';
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return{promise,resolve};};
function harness(){
  const events=[];let confirm=1, quota=true, acknowledged=true;
  const backend={清理残留下载:()=>events.push('cleanup'),加载目录:async()=>({decks:[]}),
    下载牌组:async(_,dir,deck)=>{events.push(['download',deck.id]);return deck.id;}};
  const Feature=loadComponentLogic('components/home/CloudDeckFeature.ets','CloudDeckFeature',{
    $r:(key,...args)=>({key,args}),颜色键:{动作主色:'action'},云端牌组服务:class{constructor(){return backend;}},
    云端牌组服务错误:class extends Error{},CloudDeckImportController,
    AppStorage:{get:()=>({filesDir:'sandbox'}),setOrCreate:()=>events.push('committed')},resourceText:(_,r)=>r.key,
    showToastSafely:(_,x)=>events.push(['toast',x.message]),
    后端会话:{获取实例:()=>({确保已打开:async()=>events.push('prepare')})},
    执行牌组导入:async path=>events.push(['import',path]),
    标记已用尽云端牌组下载配额:async()=>{events.push('quota');return quota;},
    标记已完成云端牌组引导:async()=>{events.push('acknowledge');return acknowledged;},
    pasteboard:{MIMETYPE_TEXT_PLAIN:'text',createData:(_,text)=>text,getSystemPasteboard:()=>({setData:async data=>events.push(['copy',data])})}
  });
  const feature=new Feature();feature.getUIContext=()=>({getPromptAction:()=>({showDialog:async()=>({index:confirm})})});
  feature.onClose=welcome=>events.push(['close',welcome]);feature.onImported=async()=>events.push('refresh');
  feature.onQuota=value=>events.push(['quotaValue',value]);
  return{feature,backend,events,setConfirm:x=>{confirm=x;},setQuota:x=>{quota=x;},setAcknowledged:x=>{acknowledged=x;}};
}
test('cloud selection enforces three-deck limit while permitting deselection and excluding completed decks',()=>{
  const {feature:f}=harness();for(const id of ['a','b','c','d'])f.切换云端牌组选择(id);
  assert.deepEqual(f.云端牌组选中ID列表,['a','b','c']);f.切换云端牌组选择('b');f.切换云端牌组选择('d');
  assert.deepEqual(f.云端牌组选中ID列表,['a','c','d']);f.云端牌组成功ID列表=['e'];f.切换云端牌组选择('e');
  assert.deepEqual(f.云端牌组选中ID列表,['a','c','d']);
});
test('cloud imports public selection serially, preserves successes on retry, and completes after quota persistence',async()=>{
  const h=harness(),f=h.feature;f.云端牌组列表=['a','b','c'].map(id=>({id,name:id,accessType:'public'}));
  f.云端牌组选中ID列表=['a','b'];let fail=true;
  h.backend.下载牌组=async(_,dir,deck)=>{if(deck.id==='b'&&fail)throw Error('offline');h.events.push(['download',deck.id]);return deck.id;};
  await f.下载选中云端牌组();assert.deepEqual(f.云端牌组成功ID列表,['a']);assert.deepEqual(f.云端牌组选中ID列表,['b']);
  assert.equal(h.events.some(e=>Array.isArray(e)&&e[0]==='close'),false);assert.ok(h.events.includes('quota'));
  fail=false;await f.下载选中云端牌组();assert.deepEqual(f.云端牌组成功ID列表,['a','b']);
  assert.equal(h.events.filter(e=>Array.isArray(e)&&e[0]==='import'&&e[1]==='a').length,1);
  assert.deepEqual(h.events.at(-1),['close',true]);assert.equal(f.云端牌组忙碌,false);
});
test('cloud skip requires explicit confirmation and persistence, while menu close never consumes quota',async()=>{
  const h=harness();h.setConfirm(0);await h.feature.跳过云端牌组引导();assert.deepEqual(h.events,[]);
  h.setConfirm(1);h.setAcknowledged(false);await h.feature.跳过云端牌组引导();assert.equal(h.events.some(e=>Array.isArray(e)&&e[0]==='close'),false);
  h.setAcknowledged(true);await h.feature.跳过云端牌组引导();assert.deepEqual(h.events.at(-1),['close',true]);assert.equal(h.events.includes('quota'),false);
  h.feature.云端牌组从菜单打开=true;await h.feature.跳过云端牌组引导();assert.deepEqual(h.events.at(-1),['close',false]);
});
test('cloud catalog cleans temporary downloads and rejects results after feature disposal',async()=>{
  const h=harness(),pending=deferred();h.backend.加载目录=()=>pending.promise;const work=h.feature.加载云端牌组目录();
  assert.equal(h.events[0],'cleanup');h.feature.aboutToDisappear();pending.resolve({decks:[{id:'late'}]});await work;
  assert.deepEqual(h.feature.云端牌组列表,[]);
});
test('cloud completion cannot close without success, and clipboard uses the displayed group',async()=>{
  const h=harness();await h.feature.完成云端牌组首次引导();assert.deepEqual(h.events,[]);
  await h.feature.复制云端牌组QQ群号();assert.ok(h.events.some(e=>Array.isArray(e)&&e[0]==='copy'&&e[1]==='726837065'));
});

test('cloud skip persistence cannot close a disposed feature',async()=>{
  const h=harness(),pending=deferred(); h.setAcknowledged(pending.promise);
  const work=h.feature.跳过云端牌组引导();
  await Promise.resolve(); h.feature.aboutToDisappear(); pending.resolve(true); await work;
  assert.ok(h.events.includes('acknowledge'));
  assert.equal(h.events.some(e=>Array.isArray(e)&&e[0]==='close'),false);
});

test('accepted cloud import finishes cleanup and quota after disposal without UI callbacks',async()=>{
  const h=harness(),pending=deferred(),f=h.feature;
  f.云端牌组列表=[{id:'a',name:'A',accessType:'public'}]; f.云端牌组选中ID列表=['a'];
  h.backend.下载牌组=()=>pending.promise;
  const work=f.下载选中云端牌组(); f.aboutToDisappear();
  pending.resolve('a'); await work;
  assert.ok(h.events.some(e=>Array.isArray(e)&&e[0]==='import'));
  assert.ok(h.events.includes('cleanup')); assert.ok(h.events.includes('quota'));
  assert.ok(h.events.includes('committed'));
  assert.equal(h.events.includes('refresh'),false);
  assert.equal(h.events.some(e=>Array.isArray(e)&&['close','quotaValue','toast'].includes(e[0])),false);
  assert.deepEqual(f.云端牌组选中ID列表,['a']); assert.deepEqual(f.云端牌组成功ID列表,[]);
});
