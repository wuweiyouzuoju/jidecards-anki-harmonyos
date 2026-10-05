// SPDX-License-Identifier: AGPL-3.0-or-later
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { deckOrderSnapshot, planDeckReorder, assertDeckOrderUnchanged, planDeckDrop, deckDropParent,
  deckSiblingDrop, reorderDeckRows } from '../../entry/src/main/ets/model/DeckReorder.ts';
import { planDeckReparent, assertDeckReparentUnchanged } from '../../entry/src/main/ets/model/DeckReparent.ts';
import { 平铺牌组树, 可见牌组行 } from '../../entry/src/main/ets/model/牌组层级.ets';
import { 牌组列表数据源, 牌组色调 } from '../../entry/src/main/ets/model/主页模型.ets';
import { AutoSyncScheduler } from '../../entry/src/main/ets/model/AutoSyncScheduler.ts';
import { SyncActivity } from '../../entry/src/main/ets/model/SyncSettings.ts';
import { AppInterfaceTracker } from '../../entry/src/main/ets/model/AppInterface.ts';
import { OFFICIAL_ANNOUNCEMENTS_ENABLED } from '../../entry/src/main/ets/model/官方公告配置.ts';
import { buildAgentAppStructure } from '../../entry/src/main/ets/model/agent/AgentAppStructure.ts';
import { agentFunctionTools } from '../../entry/src/main/ets/model/agent/AgentToolCatalog.ts';
import { loadPlatformModule } from './platform-module-harness.mjs';
import { isDoubleColumnDeckListStyle } from '../../entry/src/main/ets/model/DeckListAppearance.ts';

const node = (id, name, children = [], filtered = false) => ({ deckId:id, name, children, filtered,
  level:0, collapsed:false, reviewCount:0, learnCount:0, newCount:0, totalInDeck:0, totalIncludingChildren:0 });
const tree = () => node(0, '', [node(1,'A',[node(2,'X',[node(8,'Z')]),node(3,'Y')]), node(4,'B'),node(6,'Filtered',[],true)]);
const deferred = () => { let resolve; const promise = new Promise(r => resolve = r); return {promise, resolve}; };
const read = path => readFileSync(new URL('../../entry/src/main/ets/' + path, import.meta.url), 'utf8');

test('actual local sibling order preserves hidden and new IDs, and proposals require a complete permutation', () => {
  const root=tree(); const snapshot=deckOrderSnapshot(root,0,['6','99','1','1']);
  assert.deepEqual(snapshot.decks.map(x=>x.id),[6,1,4]);
  const plan=planDeckReorder(snapshot,[4,6,1]); assertDeckOrderUnchanged(snapshot,plan);
  assert.deepEqual(plan.after.map(x=>x.path),['B','Filtered','A']);
  for(const ids of [[],[1,1,4],[1,2,4],[1,4],['1',4,6],[0,4,6]]) assert.throws(()=>planDeckReorder(snapshot,ids));
  assert.throws(()=>planDeckReorder(snapshot,[6,1,4]),/unchanged/);
  assert.throws(()=>assertDeckOrderUnchanged(deckOrderSnapshot(root,0,null),plan),/stale/);
  root.children.push(node(9,'New'));assert.throws(()=>assertDeckOrderUnchanged(deckOrderSnapshot(root,0,['6','1','4']),plan),/stale/);
});

test('top-level and nested sibling drops accept expanded target subtrees without changing parents', () => {
  const root=tree(), rows=平铺牌组树(root);
  const top=deckSiblingDrop(rows,4,2);
  assert.deepEqual(top,{sourceId:4,targetId:1,position:'before',sourcePath:'B',targetPath:'A'});
  assert.deepEqual(planDeckDrop(root,top,null).after.map(x=>x.id),[4,1,6]);
  const nested=deckSiblingDrop(rows,3,2);
  assert.equal(nested.sourceId,3);assert.equal(nested.targetId,2);assert.equal(nested.position,'before');
  assert.deepEqual(planDeckDrop(root,nested,null).after.map(x=>x.id),[3,2]);
  assert.equal(deckSiblingDrop(rows,0,2),null,'a parent cannot move into its own subtree');
  assert.equal(deckSiblingDrop(rows,1,4),null,'different parents cannot be mixed');
  for(const [from,to] of [[0,0],[-1,2],[2,99]]) assert.equal(deckSiblingDrop(rows,from,to),null);
});

test('cross-parent, nesting and renamed drops are rejected by the production order planner', () => {
  const root=tree();
  assert.throws(()=>planDeckDrop(root,{sourceId:1,targetId:2,position:'inside'},null),/cycle/);
  assert.throws(()=>planDeckDrop(root,{sourceId:2,targetId:4,position:'inside',sourcePath:'old'},null),/stale/);
  assert.throws(()=>planDeckDrop(root,{sourceId:2,targetId:4,position:'before'},null),/siblings/);
  assert.throws(()=>planDeckDrop(root,{sourceId:4,targetId:1,position:'inside'},null),/invalid_ids/);
  const rows=平铺牌组树(root);
  assert.deepEqual(reorderDeckRows(rows,'1','2','after'),rows);
});

test('vertical sorting moves a whole expanded subtree and preserves its depth and parent metadata', () => {
  const rows=平铺牌组树(tree());
  const moved=reorderDeckRows(rows,'1','4','after');
  assert.deepEqual(moved.map(x=>x.id),['4','1','2','8','3','6']);
  assert.deepEqual(rows.map(x=>x.id),['1','2','8','3','4','6']);
  assert.equal(moved.find(x=>x.id==='8'),rows.find(x=>x.id==='8'));
  assert.deepEqual(reorderDeckRows(moved,'1','4','before'),rows);
});

function commandsHarness() {
  const state={root:tree(),orders:new Map(),writes:[],gate:null,fail:false};
  const scheduler=new AutoSyncScheduler(), activity=new SyncActivity();
  const detach=(parent,id)=>{ const index=parent.children.findIndex(x=>x.deckId===id);
    if(index>=0)return parent.children.splice(index,1)[0];
    for(const child of parent.children){const found=detach(child,id);if(found)return found;} };
  const find=(root,id)=>root.deckId===id?root:root.children.map(x=>find(x,id)).find(Boolean);
  const Commands=loadPlatformModule('backend/DeckHierarchyCommands.ets','DeckHierarchyCommands',{
    牌组服务:class {async 获取牌组树(){return state.root;} async 调整牌组父级(ids,parent){
      state.writes.push(['core',ids.slice(),parent]);for(const id of ids)find(state.root,parent).children.push(detach(state.root,id));return ids.length; }},
    planDeckReparent,assertDeckReparentUnchanged,deckOrderSnapshot,planDeckReorder,assertDeckOrderUnchanged,deckDropParent,planDeckDrop,
    autoSyncScheduler:scheduler,syncActivity:activity,
    加载牌组顺序:async parent=>state.orders.get(parent)??null,
    保存牌组顺序:async(parent,ids)=>{state.writes.push(['order',parent,ids.slice()]);if(state.gate)await state.gate.promise;
      if(state.fail)throw Error('deck_reorder_storage_unavailable');state.orders.set(parent,ids.slice());}
  });
  return {state,scheduler,activity,commands:new Commands()};
}

test('shared write freezes confirmed order, holds an independent lease, rejects stale order and excludes sync',async()=>{
  const h=commandsHarness();const plan=await h.commands.prepareReorder(0,[4,1,6]);
  h.state.orders.set('',['6','1','4']);await assert.rejects(h.commands.executeReorder(plan),/stale/);assert.equal(h.state.writes.length,0);
  h.state.orders.clear();h.activity.reserveCollection();await assert.rejects(h.commands.executeReorder(plan),/sync_busy/);
  h.activity.cancelReservation();h.state.gate=deferred();const pending=h.commands.executeReorder(plan);plan.after[0].id=99;
  await new Promise(r=>setImmediate(r));assert.equal(h.scheduler.canSync(),false);
  assert.deepEqual(h.state.writes,[['order','',['4','1','6']]]);h.state.gate.resolve();await pending;
  assert.equal(h.scheduler.canSync(),true);assert.equal(h.scheduler.hasPending(),false);
});

test('sorting persists only sibling order; cross-parent and nesting attempts never write Core or preferences',async()=>{
  const h=commandsHarness(), original=JSON.stringify(h.state.root);
  await h.commands.executeDrop({sourceId:4,targetId:1,position:'before'});
  assert.deepEqual(h.state.writes,[['order','',['4','1','6']]]);
  await h.commands.executeDrop({sourceId:3,targetId:2,position:'before'});
  assert.deepEqual(h.state.orders.get('1'),['3','2']);
  const count=h.state.writes.length;
  for(const drop of [{sourceId:2,targetId:4,position:'before'},{sourceId:4,targetId:1,position:'inside'}])
    await assert.rejects(h.commands.executeDrop(drop));
  assert.equal(h.state.writes.length,count);assert.equal(JSON.stringify(h.state.root),original);
  assert.equal(h.state.writes.some(x=>x[0]==='core'),false);assert.equal(h.scheduler.hasPending(),false);
  const sort=commandsHarness();sort.state.fail=true;
  await assert.rejects(sort.commands.executeDrop({sourceId:4,targetId:1,position:'before'}),/storage_unavailable/);
  assert.equal(sort.state.writes.some(x=>x[0]==='core'),false);assert.equal(sort.scheduler.hasPending(),false);
});

test('preference write serializes inputs before awaiting and strict reads report actual failures',async()=>{
  const gate=deferred(), puts=[];let fail=false;
  const dependencies={AppStorage:{get:()=>({})},preferences:{getPreferences:async()=>{await gate.promise;if(fail)throw Error('IO');
    return {has:async()=>true,get:async()=>'{bad',put:async(...args)=>puts.push(args),flush:async()=>{}};}}};
  const save=loadPlatformModule('model/牌组顺序存储.ets','保存牌组顺序',dependencies);
  const load=loadPlatformModule('model/牌组顺序存储.ets','加载牌组顺序',dependencies);
  const ids=['1','2'];const pending=save('',ids);ids.reverse();gate.resolve();await pending;
  assert.deepEqual(puts,[['deck_order_root','["1","2"]']]);
  await assert.rejects(load('',true),/storage_unavailable/);assert.equal(await load(''),null);
  fail=true;await assert.rejects(save('1',['2']),/storage_unavailable/);
});

const homeSource=read('pages/首页.ets');
function homeMethod(name){const start=homeSource.search(new RegExp('  (?:private )?(?:async )?'+name+'\\('));
  assert.ok(start>=0,name);return homeSource.slice(start,homeSource.indexOf('\n  }',start)+4);}
function pageHarness(){
  const h=commandsHarness(), events=[], tracker=new AppInterfaceTracker();
  const methods=['处理牌组移动','saveDeckArrangement','退出排序模式','homeActionControls','publishHomeInterface'];
  const dependencies={DeckHierarchyCommands:class{executeDrop(drop){return h.commands.executeDrop(drop);}},
    deckSiblingDrop,reorderDeckRows,可见牌组行,appInterface:tracker,OFFICIAL_ANNOUNCEMENTS_ENABLED,isDoubleColumnDeckListStyle,
    AppStorage:{setOrCreate:()=>events.push('broadcast')},$r:key=>key};
  const Page=new Function(...Object.keys(dependencies),stripTypeScriptTypes('class Page {\n'+methods.map(homeMethod).join('\n')+'\n}',{mode:'transform'})+';return Page;')(...Object.values(dependencies));
  const page=new Page();Object.assign(page,{排序模式中:true,deckReorderBusy:false,homeDisposed:false,
    homeDeckTree:h.state.root,主页快照数据:{decks:平铺牌组树(h.state.root)},牌组数据源:new 牌组列表数据源(平铺牌组树(h.state.root)),
    展开的牌组ID集合:new Set(['1','2']),隐藏的牌组ID集合:new Set(),选中的牌组ID:'',homeActivity:()=>({collectionBusy:page.deckReorderBusy}),
    按ID查牌组:id=>page.主页快照数据.decks.find(x=>x.id===id)??{id:'',ancestorIds:[]},显示提示:key=>events.push(key),
    加载主页数据:async()=>{events.push('refresh');page.homeDeckTree=h.state.root;
      page.主页快照数据={decks:平铺牌组树(h.state.root,null,null,h.state.orders)};
      page.牌组数据源.replaceAll(可见牌组行(page.主页快照数据.decks,page.展开的牌组ID集合,page.隐藏的牌组ID集合));}
  });return {...h,page,events,tracker};
}
const settle=()=>new Promise(r=>setImmediate(r));

test('actual home move callback retains expanded subtrees, rejects cross-parent drag, and guards double submission/exit',async()=>{
  const h=pageHarness();h.state.gate=deferred();h.page.处理牌组移动(0,1);assert.equal(h.state.writes.length,0);
  h.page.处理牌组移动(0,4);
  assert.deepEqual(h.page.牌组数据源.snapshotDecks().map(x=>x.id),['4','1','2','8','3','6']);
  await settle();assert.equal(h.page.deckReorderBusy,true);h.page.处理牌组移动(0,5);h.page.退出排序模式();
  assert.equal(h.page.排序模式中,true);assert.equal(h.state.writes.length,1);
  h.state.gate.resolve();await settle();assert.equal(h.page.deckReorderBusy,false);
  assert.deepEqual(h.state.orders.get(''),['4','1','6']);
});

test('actual home drag accepts sibling descendant rows as targets while retaining tree metadata and expansion',async()=>{
  const h=pageHarness(), original=JSON.stringify(h.state.root);
  h.page.处理牌组移动(4,2);await settle();
  assert.deepEqual(h.page.牌组数据源.snapshotDecks().map(x=>x.id),['4','1','2','8','3','6']);
  h.page.处理牌组移动(4,3);await settle();
  assert.deepEqual(h.page.牌组数据源.snapshotDecks().map(x=>x.id),['4','1','3','2','8','6']);
  assert.equal(JSON.stringify(h.state.root),original);assert.deepEqual([...h.page.展开的牌组ID集合],['1','2']);
  assert.ok(h.state.writes.every(x=>x[0]==='order'));assert.equal(h.scheduler.hasPending(),false);
});

test('accepted home writes finish after disposal and failed writes refresh the true order without a success broadcast',async()=>{
  const h=pageHarness();h.state.gate=deferred();h.page.处理牌组移动(0,4);await settle();h.page.homeDisposed=true;
  h.state.gate.resolve();await settle();assert.deepEqual(h.events,['broadcast']);assert.equal(h.scheduler.canSync(),true);
  const failed=pageHarness();failed.state.fail=true;failed.page.处理牌组移动(0,4);await settle();
  assert.equal(failed.events.includes('broadcast'),false);assert.ok(failed.events.includes('app.string.deck_reorder_failed'));
  assert.deepEqual(failed.page.牌组数据源.snapshotDecks().map(x=>x.id),['1','2','8','3','4','6']);
  assert.equal(failed.page.deckReorderBusy,false);
});

test('JIDE observes sibling sorting and its busy state with no promote or demote surface in either language',()=>{
  const h=pageHarness();h.page.publishHomeInterface();
  const view=(surface,locale)=>{const strings=new Map(JSON.parse(readFileSync(new URL(`../../entry/src/main/resources/${locale}/element/string.json`,import.meta.url))).string.map(x=>[x.name,x.value]));
    return buildAgentAppStructure({simple:false,agent:true,cloudDeck:false,themeHasTextures:false},surface,'',key=>strings.get(key),[],agentFunctionTools(100,'assistant'),h.tracker.snapshot(),'home');};
  for(const locale of ['base','en_US']){const sort=view('deck_reorder',locale);
    assert.match(sort.surfaces[0].instructions,locale==='base'?/同一个父牌组.*顶级牌组/:/same parent.*top-level decks/);
    assert.ok(sort.tools.some(x=>x.name==='get_deck_order'));assert.ok(sort.tools.some(x=>x.name==='propose_reorder_decks'));
    assert.notEqual(sort.surfaces[0].items.find(x=>x.id==='decks').opens,'deck_level_menu');
    assert.equal(view('',locale).surfaces.some(x=>x.id==='deck_level_menu'),false);
    assert.deepEqual(sort.observations[0].optionIds,['1','2','8','3','4','6']);}
  h.page.deckReorderBusy=true;h.page.publishHomeInterface();assert.ok(view('deck_reorder','base').surfaces[0].items.every(x=>!x.enabled));
  h.page.deckReorderBusy=false;h.page.排序模式中=false;h.page.publishHomeInterface();
  assert.equal(h.tracker.snapshot().some(x=>x.surface==='deck_reorder'||x.surface==='deck_level_menu'),false);
});

test('row leaves native sorting gestures unblocked and has no sorting popup callbacks',()=>{
  const row=read('components/牌组列表项.ets');
  assert.match(row,/\.parallelGesture\(/);
  assert.match(row,/\.bindPopup\(!this\.reorderMode && this\.显示牌组菜单/);
  assert.doesNotMatch(row,/onLevelMenu|onLevelChange|levelMenuDeckId|99999999/);
  assert.match(read('components/home/主页牌组列表.ets'),/\.onMove\(this\.排序模式中 && !this\.reorderBusy \? this\.onMove : undefined/);
});
