// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { StatsSession } from '../../entry/src/main/ets/model/StatsSession.ts';
import { loadPlatformModule } from './platform-module-harness.mjs';
const deferred = () => { let resolve, reject; const promise = new Promise((a,b) => { resolve=a; reject=b; }); return {promise,resolve,reject}; };
const settle = async () => { for(let i=0;i<5;i++) await new Promise(setImmediate); };
const request = { days: 365, search: '', hours: 0 };
function harness() {
  const states=[], widgets=[], reads=[];
  const backend={ waitForCollection: async()=>{}, graphs: async r=>{ reads.push(r); return {id:r.days}; },
    preferences: async()=>({cardCountsSeparateInactive:false}), savePreferences:async()=>{},
    publishWidget:async(...args)=>widgets.push(args) };
  const session=new StatsSession(backend, {id:'cached'}, {cardCountsSeparateInactive:false}, s=>states.push(s));
  return {session,backend,states,widgets,reads};
}
test('stats session discards late graphs and errors and freezes full-collection scope', async()=>{
  for(const reject of [false,true]) {
    const h=harness(), first=deferred(); let calls=0;
    h.backend.graphs=async r=>++calls===1?first.promise:{id:'new'};
    const mutable={...request,search:'deck:old'};
    const old=h.session.load(mutable); await settle(); mutable.search='';
    await h.session.load({...request,search:'deck:new'});
    if(reject) first.reject(Error('old')); else first.resolve({id:'old'});
    await old;
    assert.equal(h.states.at(-1).graphs.id,'new'); assert.equal(h.states.at(-1).phase,'content');
    assert.deepEqual(h.widgets,[]);
  }
  const h=harness(), gate=deferred(); h.backend.waitForCollection=()=>gate.promise;
  const mutable={...request}; const pending=h.session.load(mutable); mutable.search='deck:new'; mutable.days=0;
  gate.resolve(); await pending;
  assert.deepEqual(h.reads,[request]); assert.equal(h.widgets.length,1);
});
test('stats invalidates widget work on newer requests and on disposal',async()=>{
  const h=harness(); await h.session.load(request);
  const current=h.widgets[0][3]; assert.equal(current(),true);
  await h.session.load({...request,search:'deck:one'}); assert.equal(current(),false);
  await h.session.refreshWidget({...request,search:'deck:one'}); assert.equal(h.widgets.length,1);
  h.session.dispose(); await h.session.load(request); assert.equal(h.widgets.length,1);
});
test('stats preference writes are serialized and stale preferences cannot reset a user choice',async()=>{
  const h=harness(), read=deferred(), write=deferred(), saved=[];
  h.backend.preferences=()=>read.promise;
  h.backend.savePreferences=async value=>{saved.push(value); if(saved.length===1) await write.promise;};
  const loading=h.session.load(request); await settle();
  const one=h.session.updatePreferences(p=>({...p,cardCountsSeparateInactive:true})); await settle();
  const two=h.session.updatePreferences(p=>({...p,extra:true})); await settle(); assert.equal(saved.length,1);
  read.resolve({cardCountsSeparateInactive:false}); await loading;
  assert.equal(h.states.at(-1).preferences.cardCountsSeparateInactive,true);
  write.resolve(); await Promise.all([one,two]); assert.equal(saved[1].cardCountsSeparateInactive,true);
});
test('stats platform stops after collection open or deck lookup if the request expired',async()=>{
  for(const stage of ['open','tree']) {
    const gate=deferred(), events=[]; let current=true;
    const Adapter=loadPlatformModule('backend/AnkiStatsSession.ets','AnkiStatsSession',{
      后端会话:{获取实例:()=>({确保已打开:()=>gate.promise})}, syncActivity:{waitForCollection:async()=>{}},
      统计服务:class {async 获取图表统计(){events.push('graphs');return {}; }},
      牌组服务:class {async 获取牌组树(){events.push('tree');return gate.promise;}},
      createStatsWidget:()=>{events.push('extract');return {};},publishStatsWidget:async()=>events.push('publish'),hilog:{error(){}}
    });
    const adapter=new Adapter('/');
    const work=stage==='open'?adapter.graphs(request,()=>current).catch(e=>e):adapter.publishWidget({},0,false,()=>current);
    await settle(); current=false; gate.resolve({children:[]}); await work;
    assert.deepEqual(events,stage==='tree'?['tree']:[]);
  }
});
test('widget publisher preserves aggregation and serializes accepted writes across callers and failures',async()=>{
  const gate=deferred(), calls=[];
  const p=loadPlatformModule('backend/StatsWidgetPublisher.ets','{createStatsWidget,publishStatsWidget}',{
    平铺牌组树:()=>[1,2,3],提取卡片数据:(...args)=>args,
    保存卡片数据:async value=>{calls.push(value);if(value==='old')await gate.promise;if(value==='bad')throw Error('disk');}
  });
  assert.deepEqual(p.createStatsWidget('graph',{children:[{newCount:2,learnCount:3,reviewCount:4}]},2,true),['graph',9,3,2,true]);
  const old=p.publishStatsWidget('old'), next=p.publishStatsWidget('next');await settle();assert.deepEqual(calls,['old']);
  gate.resolve();await Promise.all([old,next]);
  await assert.rejects(p.publishStatsWidget('bad'),/disk/);await p.publishStatsWidget('recovered');
  assert.deepEqual(calls,['old','next','bad','recovered']);
});
