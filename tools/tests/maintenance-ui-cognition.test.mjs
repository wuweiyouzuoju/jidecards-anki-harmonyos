// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadComponentLogic } from './platform-module-harness.mjs';
import { AppInterfaceTracker, visibleInterfaceItems } from '../../entry/src/main/ets/model/AppInterface.ts';
import { CollectionHistorySession, CollectionHistoryState } from '../../entry/src/main/ets/model/CollectionHistorySession.ts';
const tick = () => new Promise(r => setImmediate(r));

test('collection history publishes live availability and releases JIDE observation after leaving', async () => {
  const tracker = new AppInterfaceTracker(); let writes = 0;
  class Backend {
    async status() { return {undo: writes === 0 ? 'Delete note' : '', redo: writes === 0 ? '' : 'Delete note', lastStep:4-writes}; }
    async apply(redo) { assert.equal(redo,false); writes++; }
  }
  const Dialog = loadComponentLogic('components/CollectionHistoryDialog.ets','CollectionHistoryDialog', {
    CollectionHistorySession,CollectionHistoryState,AnkiCollectionHistoryBackend:Backend,appInterface:tracker,
    AppStorage:{setOrCreate(){}},$r:key=>key
  });
  const dialog = new Dialog(); dialog.aboutToAppear(); await tick();
  const view = () => tracker.snapshot().find(v => v.surface === 'collection_history');
  assert.equal(view().items.find(i=>i.id==='undo').enabled,true);
  assert.equal(view().items.find(i=>i.id==='redo').enabled,false);
  assert.equal(view().values.find(i=>i.id==='undo_operation').value,'Delete note');
  await dialog.session.apply(false);
  assert.equal(view().items.find(i=>i.id==='redo').enabled,true);
  assert.equal(view().items.find(i=>i.id==='undo').enabled,false);
  dialog.aboutToDisappear(); assert.equal(tracker.snapshot().length,0);
});

test('JIDE observes the same history failure cause as the dialog without enabling another write', async () => {
  const tracker = new AppInterfaceTracker();
  class Backend {
    async status() { return { undo: 'Delete deck', redo: '', lastStep: 7 }; }
    async apply() { throw new Error('Invalid deck preview request'); }
  }
  const Dialog = loadComponentLogic('components/CollectionHistoryDialog.ets', 'CollectionHistoryDialog', {
    CollectionHistorySession, CollectionHistoryState, AnkiCollectionHistoryBackend: Backend, appInterface: tracker,
    AppStorage: { setOrCreate() {} }, $r: key => key
  });
  const dialog = new Dialog(); dialog.aboutToAppear(); await tick();
  await dialog.session.apply(false);
  const view = tracker.snapshot().find(view => view.surface === 'collection_history');
  assert.equal(view.values.find(value => value.id === 'error_kind').value, 'collection_history_apply_error');
  assert.equal(view.values.find(value => value.id === 'error_detail').value, 'Invalid deck preview request');
  assert.equal(view.items.find(item => item.id === 'undo').enabled, false);
  assert.equal(view.items.find(item => item.id === 'reload').enabled, true);
  dialog.aboutToDisappear();
});

test('reset defaults failure disables confirmation and exposes a real retry which can recover', async () => {
  const tracker = new AppInterfaceTracker(); let fail=true, submitted=null;
  class Scheduler { async scheduleCardsAsNewDefaults() {
    if(fail)throw Error('Core read failed');return {restorePosition:true,resetCounts:false};
  } }
  const Dialog = loadComponentLogic('components/browser/BrowserResetDialog.ets','BrowserResetDialog',{
    调度器服务:Scheduler,appInterface:tracker,$r:key=>key
  });
  const dialog = new Dialog(); dialog.onSubmit = options => submitted=options;
  dialog.aboutToAppear(); await tick(); dialog.submit(); assert.equal(submitted,null);
  let view=tracker.snapshot()[0]; assert.equal(view.items.find(i=>i.id==='confirm').enabled,false);
  assert.equal(view.items.find(i=>i.id==='retry').enabled,true);
  fail=false; await dialog.load(); dialog.submit(); assert.deepEqual(submitted,{restorePosition:true,resetCounts:false});
  view=tracker.snapshot()[0]; assert.equal(view.items.some(i=>i.id==='retry'),false);
  dialog.aboutToDisappear();assert.equal(tracker.snapshot().length,0);
});

test('home history is disabled when the collection is unavailable, and Notes exposes reset with its own dialog', () => {
  const Menu = loadComponentLogic('components/home/主页更多面板.ets','主页更多面板',{
    visibleInterfaceItems,appInterface:new AppInterfaceTracker(),namedResourceText:(_context,key)=>key,$r:key=>key
  });
  const menu = new Menu();menu.getUIContext=()=>({});let opened=0;menu.onHistory=()=>opened++;
  menu.historyAvailable=false;assert.equal(menu.menuEntries().find(i=>i.id==='history').available,false);
  menu.selectItem('history');assert.equal(opened,0);
  menu.historyAvailable=true;menu.selectItem('history');assert.equal(opened,1);
  const reset=visibleInterfaceItems('browser_batch',{simple:false,agent:false,cloudDeck:false,themeHasTextures:false}).find(i=>i.id==='reset');
  assert.equal(reset.opens,'browser_reset');
});

test('media observation contains only rendered controls and preserves committed tag count on refresh failure', () => {
  const tracker = new AppInterfaceTracker();
  class Maintenance { constructor(_backend, publish) { this.publish = publish; } dispose() {} }
  const Panel = loadComponentLogic('components/settings/媒体管理面板.ets','媒体管理面板',{
    媒体服务:class {}, MediaMaintenanceSession:Maintenance, appInterface:tracker,
    THEME_TEXT_COLORS_KEY:'theme', 颜色键:{动作主色:'action',主色按钮背景:'button'},
    syncActivity:{isActive:()=>true}, namedResourceText:(_context,key)=>'localized:'+key
  });
  const panel = new Panel(); panel.getUIContext=()=>({}); panel.aboutToAppear();
  const view = () => tracker.snapshot().find(v=>v.surface==='media_maintenance');
  assert.deepEqual(view().items.map(i=>i.id),['check','close']);
  assert.equal(view().items.find(i=>i.id==='close').titleKey,'close');
  panel.maintenance.publish({busy:false,checked:true,unusedCount:2,missingCount:3,haveTrash:true,
    revision:7,reports:[],next:false,error:'',missingNoteCount:2,taggedCount:-1});
  assert.equal(view().items.find(i=>i.id==='trash_unused').enabled,true);
  assert.equal(view().items.find(i=>i.id==='empty').enabled,true);
  assert.equal(view().items.find(i=>i.id==='view_missing').enabled,false);
  assert.equal(view().items.find(i=>i.id==='tag_missing').enabled,false);
  panel.maintenance.publish({busy:false,checked:false,unusedCount:2,missingCount:3,haveTrash:true,
    revision:0,reports:[],next:false,error:'media_tag_refresh_error',missingNoteCount:2,taggedCount:2});
  assert.deepEqual(view().items.map(i=>i.id),['check','close']);
  assert.equal(view().values.find(i=>i.id==='tagged_notes').value,'2');
  assert.equal(panel.错误信息,'localized:media_tag_refresh_error');
  panel.aboutToDisappear(); assert.equal(tracker.snapshot().length,0);
});
