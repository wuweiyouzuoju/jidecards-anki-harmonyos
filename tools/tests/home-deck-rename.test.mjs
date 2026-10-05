// SPDX-License-Identifier: AGPL-3.0-or-later
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { deckRenameName, planDeckRename, assertDeckRenameUnchanged } from '../../entry/src/main/ets/model/DeckRename.ts';
import { deckHierarchyEntries } from '../../entry/src/main/ets/model/DeckReparent.ts';
import { AutoSyncScheduler } from '../../entry/src/main/ets/model/AutoSyncScheduler.ts';
import { SyncActivity } from '../../entry/src/main/ets/model/SyncSettings.ts';
import { AppInterfaceTracker, APP_INTERFACE_SURFACES } from '../../entry/src/main/ets/model/AppInterface.ts';
import { buildAgentAppStructure } from '../../entry/src/main/ets/model/agent/AgentAppStructure.ts';
import { agentFunctionTools } from '../../entry/src/main/ets/model/agent/AgentToolCatalog.ts';
import { agentSettingDefinitions } from '../../entry/src/main/ets/model/agent/AgentSettingsTools.ts';
import { loadComponentLogic, loadPlatformModule } from './platform-module-harness.mjs';
import * as codec from '../../entry/src/main/ets/proto/messages/DeckMessages.ts';
import { 协议读取器 } from '../../entry/src/main/ets/proto/core/ProtoReader.ts';
import { 牌组方法, 服务号 } from '../../entry/src/main/ets/backend/服务索引.ts';

const node=(id,name,children=[],filtered=false)=>({deckId:id,name,children,filtered});
const tree=()=>node(0,'',[node(1,'English',[node(2,'Words',[node(3,'Week 1')])]),node(4,'Exam'),node(5,'Filtered',[],true)]);
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
const tick=()=>new Promise(resolve=>setImmediate(resolve));

test('real rename changes only the selected level and previews every descendant by stable ID',()=>{
  const plan=planDeckRename(tree(),2,' New words ');
  assert.deepEqual(plan.changes.map(x=>[x.id,x.before,x.after]),[[2,'English::Words','English::New words'],[3,'English::Words::Week 1','English::New words::Week 1']]);
  assert.equal(planDeckRename(tree(),1,'英文').changes.length,3);
  assert.equal(planDeckRename(tree(),5,'Filtered 2').changes[0].filtered,true);
  assert.equal(deckRenameName(1,'cafe\u0301'),'café');
  assert.equal(deckRenameName(1,'"quote"'),'"quote"');
  assertDeckRenameUnchanged(tree(),plan);
});

test('invalid paths, empty names, collisions and stale subtree snapshots cannot be submitted',()=>{
  for(const name of ['', '  ', 'A::B', ':A', 'A:', 'a\u001fb', 'a\u007fb', 'x'.repeat(201), null])
    assert.throws(()=>planDeckRename(tree(),2,name),/invalid/);
  for(const id of [0,-1,1.2,'2',NaN])assert.throws(()=>planDeckRename(tree(),id,'New'),/invalid/);
  assert.throws(()=>planDeckRename(tree(),99,'New'),/missing/);
  assert.throws(()=>planDeckRename(tree(),2,'Words'),/unchanged/);
  assert.throws(()=>planDeckRename(tree(),1,'exam'),/conflict/);
  const plan=planDeckRename(tree(),2,'New');
  for(const mutate of [t=>t.children[0].name='Changed',t=>t.children[0].children[0].children.push(node(7,'Added')),
    t=>t.children[0].children[0].children[0].deckId=10,t=>t.children[0].children.push(node(9,'new'))]) {
    const changed=tree();mutate(changed);assert.throws(()=>assertDeckRenameUnchanged(changed,plan));
  }
  const reordered=tree();reordered.children.reverse();assertDeckRenameUnchanged(reordered,plan);
  const forged=structuredClone(plan);forged.changes[0].after='Wrong';assert.throws(()=>assertDeckRenameUnchanged(tree(),forged),/stale/);
});

function commandsHarness() {
  const state={root:tree(),writes:[],gate:null,error:null};
  const scheduler=new AutoSyncScheduler(),activity=new SyncActivity();
  class Decks {async 获取牌组树(){return state.root;} async 重命名牌组(...args){
    state.writes.push(args);if(state.gate)await state.gate.promise;if(state.error)throw state.error;
    const source=state.root.children.flatMap(x=>[x,...x.children]).find(x=>x.deckId===args[0]);source.name=args[1].split('::').at(-1);
  }}
  const Commands=loadPlatformModule('backend/DeckHierarchyCommands.ets','DeckHierarchyCommands',{
    牌组服务:Decks,planDeckRename,assertDeckRenameUnchanged,autoSyncScheduler:scheduler,syncActivity:activity
  });
  return {commands:new Commands(),state,scheduler,activity,Decks};
}

test('shared command rechecks state, guards sync, freezes accepted input and queues one Core transaction',async()=>{
  const h=commandsHarness();const plan=await h.commands.prepareRename(2,'New');
  h.state.root.children[0].name='Changed';await assert.rejects(h.commands.executeRename(plan),/stale/);
  h.state.root=tree();h.activity.reserveCollection();await assert.rejects(h.commands.executeRename(plan),/sync_busy/);
  h.activity.cancelReservation();assert.deepEqual(h.state.writes,[]);
  h.state.gate=deferred();const pending=h.commands.executeRename(plan);plan.changes[0].after='Forged';await tick();
  assert.equal(h.scheduler.canSync(),false);assert.deepEqual(h.state.writes,[[2,'English::New']]);
  h.state.gate.resolve();await pending;assert.equal(h.scheduler.canSync(),true);assert.equal(h.scheduler.hasPending(),true);
});

test('Core failures release operation ownership and a failed queue does not block a later rename',async()=>{
  const h=commandsHarness();h.state.error=Error('Core failure');
  await assert.rejects(h.commands.executeRename(await h.commands.prepareRename(2,'New')),/Core failure/);
  assert.equal(h.scheduler.canSync(),true);assert.equal(h.scheduler.hasPending(),false);
  h.state.error=null;await h.commands.executeRename(await h.commands.prepareRename(2,'Retry'));
  assert.deepEqual(h.state.writes,[[2,'English::New'],[2,'English::Retry']]);
});

test('production service sends RenameDeck to the locked Core ID with a full path and 64-bit ID',async()=>{
  const calls=[];const Service=loadPlatformModule('backend/牌组服务.ts','牌组服务',{
    ...codec,服务号,牌组方法,后端会话:{获取实例:()=>({调用:async(...args)=>{calls.push(args);return new Uint8Array();}})}
  });
  await new Service().重命名牌组(1750000000001,'English::New');
  assert.deepEqual(calls[0].slice(0,2),[7,18]);const r=new 协议读取器(calls[0][2]);
  assert.equal(r.读取标签().字段号,1);assert.equal(r.读取64位整数(),1750000000001);
  assert.equal(r.读取标签().字段号,2);assert.equal(r.读取字符串(),'English::New');assert.equal(r.读取标签(),null);
});

function componentHarness() {
  const h=commandsHarness(),events=[],tracker=new AppInterfaceTracker();
  const Feature=loadComponentLogic('components/home/DeckRenameFeature.ets','DeckRenameFeature',{
    DeckHierarchyCommands:class {executeRename(plan){return h.commands.executeRename(plan);}},牌组服务:h.Decks,
    deckHierarchyEntries,planDeckRename,appInterface:tracker,$r:key=>key,namedResourceText:(_ui,key)=>key,
    AppStorage:{setOrCreate:()=>events.push('broadcast')},showToastSafely:()=>events.push('refresh-error')
  });
  const feature=new Feature();feature.deckId=2;feature.localDisplayName='My alias';feature.getUIContext=()=>({});
  feature.onBusy=busy=>events.push(busy?'busy':'idle');feature.onClose=()=>events.push('close');feature.onSaved=async()=>events.push('saved');
  return {...h,feature,tracker,events};
}

test('rename panel starts from Core name, previews children and blocks double submission, edits and back while saving',async()=>{
  const h=componentHarness();await h.feature.load(true);assert.equal(h.feature.name,'Words');assert.equal(h.feature.plan,null);
  h.feature.changeName('New');assert.equal(h.feature.plan.changes.length,2);
  h.state.gate=deferred();const pending=h.feature.save();await tick();
  await h.feature.save();h.feature.changeName('Late');h.feature.handleBackRequest();
  assert.equal(h.feature.name,'New');assert.equal(h.state.writes.length,1);assert.ok(!h.events.includes('close'));
  assert.equal(h.tracker.snapshot()[0].items.find(x=>x.id==='confirm').enabled,false);
  h.state.gate.resolve();await pending;assert.ok(h.events.includes('close'));assert.equal(h.feature.plan,null);
  await h.feature.save();assert.equal(h.state.writes.length,1);
});

test('stale rename requires reload and confirmation; dispose never cancels an accepted write; refresh failure closes after commit',async()=>{
  const h=componentHarness();await h.feature.load(true);h.feature.changeName('New');
  h.state.root.children[0].name='Changed';await h.feature.save();assert.equal(h.feature.errorCode,'deck_rename_stale');
  assert.equal(h.feature.tree,null);assert.equal(h.state.writes.length,0);
  await h.feature.load(false);assert.equal(h.feature.name,'New');assert.equal(h.feature.plan.changes[0].after,'Changed::New');
  h.feature.onSaved=async()=>{throw Error('refresh');};await h.feature.save();
  assert.ok(h.events.includes('refresh-error'));assert.ok(h.events.includes('close'));assert.equal(h.feature.plan,null);
  const disposed=componentHarness();await disposed.feature.load(true);disposed.feature.changeName('New');
  disposed.state.gate=deferred();const pending=disposed.feature.save();await tick();disposed.feature.aboutToDisappear();
  disposed.state.gate.resolve();await pending;assert.equal(disposed.state.writes.length,1);
  assert.deepEqual(disposed.events,['busy','broadcast']);assert.deepEqual(disposed.tracker.snapshot(),[]);
});

test('JIDE reads shared rename labels, actual draft state and the real proposal capability in both languages',async()=>{
  const h=componentHarness();await h.feature.load(true);h.feature.changeName('New');
  for(const locale of ['base','en_US']) {
    const strings=new Map(JSON.parse(readFileSync(new URL(`../../entry/src/main/resources/${locale}/element/string.json`,import.meta.url),'utf8')).string.map(x=>[x.name,x.value]));
    const structure=buildAgentAppStructure({simple:false,agent:true,cloudDeck:false,themeHasTextures:false},'deck_rename','',
      key=>strings.get(key),agentSettingDefinitions(),agentFunctionTools(),h.tracker.snapshot(),'home');
    assert.equal(structure.surfaces[0].items.find(x=>x.id==='confirm').title,strings.get('deck_rename_confirm'));
    assert.equal(structure.surfaces[0].items.find(x=>x.id==='confirm').enabled,true);
    assert.ok(structure.tools.some(x=>x.name==='propose_rename_deck'));
    assert.equal(structure.observations[0].values.find(x=>x.id==='local_display_name').value,'My alias');
  }
  for(const surface of ['deck_details_more','deck_row_menu'])assert.ok(APP_INTERFACE_SURFACES.find(x=>x.id===surface).items.some(x=>x.id==='rename'&&x.opens==='deck_rename'));
  assert.ok(APP_INTERFACE_SURFACES.find(x=>x.id==='deck_customize').instructionsKey);
});

test('clearing a local display name writes only preferences and never calls Core rename',async()=>{
  const events=[];const Commands=loadPlatformModule('backend/HomeDeckCommands.ets','HomeDeckCommands',{
    牌组服务:class {async 重命名牌组(){throw Error('local name must not rename Core');}},保存牌组别名:async(...args)=>events.push(args)
  });
  await new Commands().customize('2','Words','Alias',{新名:'',背景动作:'keep',背景像素图:null});
  assert.deepEqual(events,[['2','']]);
});

test('local alias storage deletes an empty override and propagates unavailable or failed persistence',async()=>{
  const values=new Map([['deck_display_name_2','Alias']]);let context={},fail=false;
  const save=loadPlatformModule('model/牌组元数据存储.ets','保存牌组别名',{
    AppStorage:{get:()=>context},preferences:{getPreferences:async()=>({
      put:async(key,value)=>values.set(key,value),delete:async key=>values.delete(key),
      flush:async()=>{if(fail)throw Error('flush failed');}
    })}
  });
  await save('2','  ');assert.equal(values.has('deck_display_name_2'),false);
  await save('2',' New alias ');assert.equal(values.get('deck_display_name_2'),'New alias');
  fail=true;await assert.rejects(save('2','Retry'),/flush failed/);
  context=undefined;await assert.rejects(save('2','Retry'),/storage_unavailable/);
});

test('local display form starts with the saved override, accepts empty input and publishes actual availability',()=>{
  const tracker=new AppInterfaceTracker();
  const Panel=loadComponentLogic('components/牌组定制面板.ets','牌组定制面板',{
    appInterface:tracker,牌组色调:{Blue:'blue'},IBestImageCropperController:class {}
  });
  const panel=new Panel();panel.deck={id:'2',name:'Words',fullName:'English::Words',displayName:'Alias',backgroundImage:''};
  panel.aboutToAppear();assert.equal(panel.编辑中名称,'Alias');
  panel.编辑中名称='';panel.publishInterface();assert.equal(panel.可提交(),true);
  assert.equal(tracker.snapshot()[0].values.find(x=>x.id==='core_name').value,'English::Words');
  assert.equal(tracker.snapshot()[0].values.find(x=>x.id==='local_display_name').value,'');
  panel.busy=true;panel.publishInterface();assert.ok(tracker.snapshot()[0].items.every(x=>!x.enabled));
  panel.busy=false;panel.裁剪模式=true;panel.publishInterface();assert.equal(tracker.snapshot()[0].sectionId,'crop');
  assert.deepEqual(tracker.snapshot()[0].items,[]);
  panel.aboutToDisappear();panel.publishInterface();assert.deepEqual(tracker.snapshot(),[]);
});
