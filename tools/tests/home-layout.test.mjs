import { AppInterfaceTracker, visibleInterfaceItems } from '../../entry/src/main/ets/model/AppInterface.ts';
import { loadComponentLogic } from './platform-module-harness.mjs';
import { homeSyncIndicator, homeSyncLabelKey } from '../../entry/src/main/ets/model/HomeSyncStatusController.ts';
// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import * as layout from '../../entry/src/main/ets/model/HomeLayout.ts';
import { isHomeSummaryPage } from '../../entry/src/main/ets/model/HomeHeaderLayout.ts';
import { localPreferenceApi } from './local-preference-harness.mjs';
import { loadPlatformModule } from './platform-module-harness.mjs';

function storeHarness(initial = []) {
  let disk=new Map(initial),cache=new Map(disk),fail=false;
  const active=new Map([['abilityContext',{}]]);
  const store={getSync:(key,fallback)=>cache.has(key)?cache.get(key):fallback,
    putSync:(key,value)=>cache.set(key,value),flush:async()=>{if(fail)throw Error('disk full');disk=new Map(cache);}};
  const storage={get:key=>active.get(key),setOrCreate:(key,value)=>active.set(key,value)};
  const api=loadPlatformModule('utils/HomeLayoutStore.ets',
    '({initializeHomeLayout,saveHomeLayout,saveHomeWheelExpanded,readHomeSummaryPage,rememberHomeSummaryPage})',{
    ...layout,isHomeSummaryPage,...localPreferenceApi(storage),AppStorage:storage,
    preferences:{getPreferencesSync:()=>store},hilog:{warn(){}}
  });
  return {api,active,disk:()=>disk,restart:()=>{cache=new Map(disk);api.initializeHomeLayout();},fail:value=>fail=value};
}

test('the two home summary carousels remember their pages independently across a fresh process',async()=>{
  const { api, disk } = storeHarness();
  assert.equal(api.readHomeSummaryPage(0), 0);
  assert.equal(api.readHomeSummaryPage(1), 1);
  const left = api.rememberHomeSummaryPage(0, 5);
  const right = api.rememberHomeSummaryPage(1, 3);
  assert.equal(api.readHomeSummaryPage(0), 5);
  assert.equal(api.readHomeSummaryPage(1), 3);
  await Promise.all([left, right, api.rememberHomeSummaryPage(0, 7)]);
  const restarted = storeHarness(disk()).api;
  assert.equal(restarted.readHomeSummaryPage(0), 7);
  assert.equal(restarted.readHomeSummaryPage(1), 3);
  await restarted.rememberHomeSummaryPage(1, 8);
  assert.equal(restarted.readHomeSummaryPage(1), 3);
});

test('missing layout preference keeps existing users on top buttons without writing a migration',async()=>{
  const h=storeHarness([['unrelated_user_preference',42]]);h.api.initializeHomeLayout();
  assert.equal(h.active.get(layout.HOME_LAYOUT_KEY),'classic');
  assert.equal(h.disk().has(layout.HOME_LAYOUT_KEY),false);
  assert.equal(h.disk().get('unrelated_user_preference'),42);
  await h.api.saveHomeLayout('wheel');h.restart();assert.equal(h.active.get(layout.HOME_LAYOUT_KEY),'wheel');
  await h.api.saveHomeLayout('classic','wheel');h.restart();assert.equal(h.active.get(layout.HOME_LAYOUT_KEY),'classic');
});

test('failed and stale layout writes cannot publish a new mode',async()=>{
  const h=storeHarness([[layout.HOME_LAYOUT_KEY,'classic']]);h.api.initializeHomeLayout();h.fail(true);
  await assert.rejects(h.api.saveHomeLayout('wheel'),/disk full/);
  assert.equal(h.active.get(layout.HOME_LAYOUT_KEY),'classic');h.fail(false);
  await assert.rejects(h.api.saveHomeLayout('wheel','wheel'),/setting_changed_since_proposal/);
  await assert.rejects(h.api.saveHomeLayout('auto'),/invalid_setting_value/);
  h.restart();assert.equal(h.active.get(layout.HOME_LAYOUT_KEY),'classic');
});

test('side wheels require the saved mode and a large landscape window; rotation does not rewrite the choice',()=>{
  for(const [width,height,expected] of [[940,660,true],[840,400,true],[839,400,true],[672,460,true],[600,400,true],[599,400,false],[460,672,false],[940,664,true],[664,940,false],[Infinity,400,false],[700,NaN,false],[1100,1200,false],[840,840,false],[0,0,false]]) {
    assert.equal(layout.useHomeActionWheels('wheel',width,height),expected);
    assert.equal(layout.useHomeActionWheels('classic',width,height),false);
  }
  const h=storeHarness([[layout.HOME_LAYOUT_KEY,'wheel']]);h.api.initializeHomeLayout();
  assert.equal(layout.useHomeActionWheels(h.active.get(layout.HOME_LAYOUT_KEY),660,940),false);
  h.restart();assert.equal(layout.useHomeActionWheels(h.active.get(layout.HOME_LAYOUT_KEY),940,660),true);
});

function pageActions() {
  const source=readFileSync(new URL('../../entry/src/main/ets/pages/首页.ets',import.meta.url),'utf8');
  const name='homeWheelParams',start=source.indexOf('  private '+name+'(');
  const method=source.slice(start,source.indexOf('\n  }',start)+4);
  class Params{constructor(state,onAction){this.state=state;this.onAction=onAction;}}
  const deps={...layout,homeSyncIndicator,homeSyncLabelKey,NoteEditorWheelParams:Params};
  const Page=new Function(...Object.keys(deps),stripTypeScriptTypes('class Page{'+method+'}',{mode:'transform'})+';return Page;')(...Object.values(deps));
  const calls=[];const page=Object.assign(new Page(),{homeAgentEnabled:false,syncChoiceChecking:false,
    homeActivity:()=>({collectionReady:true,collectionBusy:false}),closeHomeActions:()=>calls.push('close'),
    openSettings:()=>calls.push('settings'),openReminders:()=>calls.push('reminders'),打开统计页:()=>calls.push('stats'),
    打开浏览页:()=>calls.push('browser'),startSyncFromMenu:()=>calls.push('sync'),openAgent:()=>calls.push('agent')});
  return {page,calls};
}

test('four extracted actions are direct visible wheel controls and invoke the existing domains',()=>{
  const {page,calls}=pageActions(),params=page.homeWheelParams();
  assert.deepEqual(params.customTools.slice(0,4).map(item=>item.id),['settings','reminders','stats','history']);
  assert.ok(!params.customTools.some(item=>item.id==='more'||item.id==='software_help'));
  assert.deepEqual(params.customTools.slice(4).map(item=>item.id),['browser','search','create','sync']);
  for(const id of ['reminders','settings','stats','history'])params.onAction(id);
  assert.deepEqual(calls.filter(id=>id!=='close'),['reminders','settings','stats']);
  assert.equal(page.collectionHistoryOpen,true);
  page.collectionHistoryOpen=false;page.homeActivity=()=>({collectionReady:true,collectionBusy:true});
  const busy=page.homeWheelParams();assert.equal(busy.customTools.find(item=>item.id==='history').enabled,false);
  busy.onAction('history');assert.equal(page.collectionHistoryOpen,false);
});

test('home wheel expansion is remembered separately on each side and is not overwritten by mode changes',async()=>{
 const h=storeHarness();h.api.initializeHomeLayout();
 assert.equal(h.active.get(layout.HOME_LEFT_WHEEL_OPEN_KEY),true);
 assert.equal(h.active.get(layout.HOME_RIGHT_WHEEL_OPEN_KEY),true);
 await h.api.saveHomeWheelExpanded(layout.HOME_LEFT_WHEEL_OPEN_KEY,false);
 await h.api.saveHomeLayout('wheel');h.restart();
 assert.equal(h.active.get(layout.HOME_LEFT_WHEEL_OPEN_KEY),false);
 assert.equal(h.active.get(layout.HOME_RIGHT_WHEEL_OPEN_KEY),true);
 await h.api.saveHomeWheelExpanded(layout.HOME_RIGHT_WHEEL_OPEN_KEY,false);
 await h.api.saveHomeLayout('classic');h.restart();
 assert.equal(h.active.get(layout.HOME_LEFT_WHEEL_OPEN_KEY),false);
 assert.equal(h.active.get(layout.HOME_RIGHT_WHEEL_OPEN_KEY),false);
 h.fail(true);await assert.rejects(h.api.saveHomeWheelExpanded(layout.HOME_LEFT_WHEEL_OPEN_KEY,true));h.restart();
 assert.equal(h.active.get(layout.HOME_LEFT_WHEEL_OPEN_KEY),false);
 await assert.rejects(h.api.saveHomeWheelExpanded('arbitrary_key',true));
});

test('sidebar create presents the same choices in a centered dialog while top buttons retain a popup',()=>{
 const tracker=new AppInterfaceTracker();
 const Menu=loadComponentLogic('components/主页操作面板.ets','主页操作面板',{
  appInterface:tracker,visibleInterfaceItems,namedResourceText:(_ctx,key)=>key
 });
 const menu=new Menu();menu.getUIContext=()=>({});menu.显示获取直链牌组=true;
 menu.centeredDialog=false;menu.publishInterface();const popup=tracker.snapshot()[0];
 assert.equal(popup.values[0].value,'button_anchored_popup');
 menu.centeredDialog=true;menu.publishInterface();const dialog=tracker.snapshot()[0];
 assert.equal(dialog.values[0].value,'centered_dialog');assert.deepEqual(dialog.optionIds,popup.optionIds);
 assert.equal(dialog.optionIds.length,3);assert.ok(dialog.items.some(item=>item.id==='close'));
 assert.ok(!popup.items.some(item=>item.id==='close'));
});
