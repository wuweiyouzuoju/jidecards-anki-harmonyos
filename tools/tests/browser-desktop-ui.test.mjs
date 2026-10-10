// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { compileWithUiFeedback } from './ui-feedback-harness.mjs';
import { loadComponentLogic, loadPlatformModule } from './platform-module-harness.mjs';
import { editorPageHarness } from './editor-page-harness.mjs';
import { browserKeyCommand } from '../../entry/src/main/ets/model/BrowserKeyboard.ts';
import { selectBrowserRange, resolveBrowserRepresentativeCard } from '../../entry/src/main/ets/model/BrowserSelection.ts';
import { defaultBrowserPreferences, updateBrowserPreferences, parseBrowserPreferences } from '../../entry/src/main/ets/model/BrowserPreferences.ts';
import { ConfigKeyBool } from '../../entry/src/main/ets/proto/messages/ConfigMessages.ts';
import { AppInterfaceTracker, visibleInterfaceItems } from '../../entry/src/main/ets/model/AppInterface.ts';

const source = readFileSync(new URL('../../entry/src/main/ets/pages/浏览页.ets', import.meta.url), 'utf8');
const strings = new Map(JSON.parse(readFileSync(new URL('../../entry/src/main/resources/base/element/string.json', import.meta.url), 'utf8')).string.map(e => [e.name, e.value]));
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
const settle = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };
function pageMethods(names, dependencies = {}) {
  const methods = names.map(name => {
    const start = source.search(new RegExp(`^  (?:private )?(?:async )?${name}\\(`, 'm'));
    assert.ok(start >= 0, name);
    return source.slice(start, source.indexOf('\n  }', start) + 4);
  });
  const deps = { browserKeyCommand, selectBrowserRange, resolveBrowserRepresentativeCard, $r: name => ({id:-1,type:10003,params:[name]}),
    ...dependencies };
  const Page = compileWithUiFeedback(...Object.keys(deps), stripTypeScriptTypes(`class Page {${methods.join('\n')}}`, {mode:'transform'}) + ';return Page;')(...Object.values(deps));
  return Object.assign(new Page(), {
    operations: {isAlive: () => true, isBusy: () => false}, searchVersion: 1, selectionVersion: 0,
    阶段: 'list', 浏览模式值: 'cards', 结果ID列表: [1,2,3], 行列表: [{id:1}], 选中ID列表: [],
    mutationBusy: false, 批量忙碌: false, refreshingSearch: false, infoVersion: 0, infoCardId: 0,
    displayDialog: '', batchDialog: 'none', inlineEditorId: 0, browserVisible: true, interfaceMounted: true,
    selectionAnchor: 0, focusedRowId: 0, searchFocused: false, refreshError: '',
    getUIContext: () => ({getHostContext: () => ({resourceManager: {getStringByNameSync: key => strings.get(key)}})})
  });
}

test('page select all includes unloaded results, range uses the full order, and empty selection still exposes select all', () => {
  const p = pageMethods(['setBrowserSelection','selectAllResults','selectRangeTo','onBackPress','退出多选','返回']);
  p.结果ID列表 = Array.from({length:1000}, (_,i) => i+1);
  p.selectAllResults(); assert.equal(p.选中ID列表.length,1000); assert.equal(p.多选模式值,true);
  p.setBrowserSelection([]); p.selectionAnchor = 1; p.selectRangeTo(500);
  assert.equal(p.选中ID列表.length,500); assert.equal(p.focusedRowId,500);
  p.showBatchMenu = true; p.batchBackRequest = 0;
  p.返回(); assert.equal(p.batchBackRequest,1); assert.equal(p.选中ID列表.length,500);
  p.showBatchMenu = false; p.返回(); assert.equal(p.选中ID列表.length,0); assert.equal(p.多选模式值,false);
  p.mutationBusy = true; p.selectAllResults(); assert.equal(p.选中ID列表.length,0);
});

test('page note info converts identities, rejects stale reads and reports empty notes', async () => {
  const p = pageMethods(['打开卡片信息','关闭卡片信息']); p.浏览模式值 = 'notes';
  const old = deferred(); p.笔记服务实例 = {获取笔记的卡片: async id => id === 11 ? old.promise : [202]};
  const request = p.打开卡片信息(11); await p.打开卡片信息(22);
  assert.equal(p.infoCardId,202); old.resolve([101]); await request; assert.equal(p.infoCardId,202);
  p.关闭卡片信息(); p.笔记服务实例.获取笔记的卡片 = async () => [];
  await p.打开卡片信息(33); assert.equal(p.显示卡片信息,false); assert.match(p.refreshError,/卡片/);
});

test('preview edit preserves narrow-screen preview and opens the visible wide-screen editor', () => {
  const p = pageMethods(['打开编辑区For']);const calls=[];p.openEditPage=(...args)=>calls.push(args);
  p.browserWidth=800;p.显示预览=true;p.打开编辑区For(101);assert.equal(p.显示预览,true);
  p.browserWidth=1200;p.打开编辑区For(202);assert.equal(p.显示预览,false);
  assert.deepEqual(calls,[[101,false],[202,false]]);
});

test('actual key handler protects native input selection and busy writes, and Escape uses the overlay owner', () => {
  const p = pageMethods(['handleBrowserKey','keyboardBlocked'], {KeyType:{Down:0},browserKeyName: code => code});
  const commands = []; let stopped = 0;
  p.dispatchBrowserShortcut = command => commands.push(command);
  const event = key => ({type:0,keyCode:key,getModifierKeyState: list => list.includes('Ctrl'),stopPropagation: () => stopped++});
  p.handleBrowserKey(event('a')); assert.deepEqual(commands,['select_all']);
  p.searchFocused = true; p.handleBrowserKey(event('a')); assert.equal(stopped,1);
  p.searchFocused = false; p.mutationBusy = true; p.handleBrowserKey(event('Delete')); assert.equal(stopped,1);
  p.mutationBusy = false; p.displayDialog = 'columns'; p.onBackPress = () => {commands.push('close');return true;};
  p.handleBrowserKey(event('escape')); assert.deepEqual(commands,['select_all']);
  p.handleBrowserKey({...event('escape'),getModifierKeyState:()=>false}); assert.deepEqual(commands,['select_all','close']);
  p.browserVisible = false; p.handleBrowserKey(event('a')); assert.equal(stopped,2);
});

test('keyboard undo and redo invoke the guarded history backend directly', async () => {
  const calls = []; const status = {undo:'Edit',redo:'Delete',lastStep:3};
  const p = pageMethods(['applyBrowserHistory'], {AnkiCollectionHistoryBackend: class {
    async status() {return status;} async apply(redo, expected) {calls.push([redo,expected]);}
  }});
  p.runBrowserOperation = async action => {await action();return true;};
  await p.applyBrowserHistory(false); await p.applyBrowserHistory(true);
  assert.deepEqual(calls,[[false,status],[true,status]]);
  p.mutationBusy = true; await p.applyBrowserHistory(true); assert.equal(calls.length,2);
});

test('export freezes all IDs and options, releases collection before the picker, and reports cancellation without losing selection', async () => {
  const exportGate = deferred(), pickerGate = deferred(), calls = []; let leased = false;
  const p = pageMethods(['exportSelection','captureBrowserSelection'], {
    autoSyncScheduler: {beginOperation(){leased=true;},endOperation(){leased=false;}},syncActivity:{waitForCollection:async()=>{}},
    exportSubset: async (...args) => {calls.push(structuredClone(args));await exportGate.promise;return '/files/subset.apkg';},
    完成导出: async () => {assert.equal(leased,false);return pickerGate.promise;}
  });
  p.取能力上下文 = () => ({filesDir:'/files'}); p.选中ID列表 = [11,22];p.batchDialog='export';
  const options = {format:'apkg',media:true,scheduling:false}; const work = p.exportSelection(options);
  await settle(); options.media=false; options.format='text'; p.选中ID列表.push(33);
  assert.deepEqual(calls[0],['/files',{mode:'cards',ids:[11,22]},'apkg',true,false]);
  exportGate.resolve(); await settle(); pickerGate.resolve(null);await work;
  assert.equal(p.mutationBusy,false);assert.equal(p.批量忙碌,false);assert.equal(p.batchDialog,'none');
  assert.deepEqual(p.选中ID列表,[11,22,33]);assert.equal(p.resultMessage,strings.get('browser_export_cancelled'));
});

test('note save rejects concurrent edits before media import and preserves the original draft for retry', async () => {
  const h = editorPageHarness(); await h.page.load();
  const baseline = structuredClone(h.note); h.io.note = async () => ({...baseline,tags:['external']});
  assert.equal(await h.page.save(['my draft','answer'],['tag'],[]),false);
  assert.equal(h.writes.length,0);assert.equal(h.imports.length,0);assert.equal(h.page.editor.visible,true);
  assert.equal(h.page.editor.error,'save'); assert.equal(h.scheduler.canSync(),true);
  h.io.note = async () => baseline; assert.equal(await h.page.save(['my draft','answer'],['tag'],[]),true);
  assert.equal(h.writes[0].notes[0].fields[0],'my draft');
});

test('preference store serializes patches, retains another writer changes, verifies saves and rejects stale confirmations', async () => {
  let values = {}, fail = false; const ticks = [];
  const Store = loadPlatformModule('backend/BrowserPreferencesStore.ets','({loadBrowserPreferences,saveBrowserPreferences})',{
    ConfigKeyBool,parseBrowserPreferences,updateBrowserPreferences,
    配置服务: class {
      async 获取全部配置(){return JSON.stringify(values);} async 获取配置布尔(){return false;}
      async 设置配置JSON(input){if(fail)throw Error('disk');values[input.key]=JSON.parse(input.valueJson);}
    },AppStorage:{setOrCreate: (...args) => ticks.push(args)}
  });
  const before = await Store.loadBrowserPreferences();assert.deepEqual(before,defaultBrowserPreferences());
  await Promise.all([Store.saveBrowserPreferences({cardsColumns:['answer','question']}),Store.saveBrowserPreferences({subtitleIndex:4})]);
  const after = await Store.loadBrowserPreferences();assert.deepEqual(after.cardsColumns,['answer','question']);assert.equal(after.subtitleIndex,4);
  await assert.rejects(Store.saveBrowserPreferences({mode:'notes'},JSON.stringify(before)),/changed/);assert.equal(ticks.length,2);
  fail = true; await assert.rejects(Store.saveBrowserPreferences({mode:'notes'}),/disk/);assert.equal(ticks.length,2);
  fail = false;await Store.saveBrowserPreferences({mode:'notes'});assert.equal((await Store.loadBrowserPreferences()).mode,'notes');
});
test('an edit arriving during media import is checked again before the note write', async () => {
  const h=editorPageHarness();await h.page.load();const baseline=structuredClone(h.note);let current=baseline;
  h.io.note=async()=>current;
  h.io.image=async()=>{current={...baseline,fields:['external','answer']};return 'saved.png';};
  const images=[{id:'image',fieldIndex:0,uri:'file://image',filename:''}];
  assert.equal(await h.page.save(['my draft','answer'],['tag'],images),false);
  assert.equal(h.writes.length,0);assert.equal(h.page.editor.visible,true);
});
test('confirmed preferences refresh the mounted browser but wait until its editor closes', async () => {
  const after=updateBrowserPreferences(defaultBrowserPreferences(),{mode:'notes',notesColumns:['answer']});
  let reads=0, searches=0, clears=0;
  const p=pageMethods(['refreshBrowserPreferences','keyboardBlocked'],{loadBrowserPreferences:async()=>{reads++;return after;}});
  Object.assign(p,{preferencesLoaded:true,preferencesReloadPending:true,preferencesReloading:false,browserPreferences:defaultBrowserPreferences(),
    displayBusy:false,inlineEditorId:101,sortColumn:'',sortReverse:false,subtitleIndex:1,
    关闭卡片信息(){},退出多选(){clears++;},publishInterface(){},执行搜索:async()=>{searches++;}});
  await p.refreshBrowserPreferences();assert.equal(reads,0);assert.equal(p.preferencesReloadPending,true);
  p.inlineEditorId=0;p.显示查找替换=true;await p.refreshBrowserPreferences();assert.equal(reads,0);
  p.显示查找替换=false;await p.refreshBrowserPreferences();assert.equal(p.浏览模式值,'notes');
  assert.deepEqual(p.browserPreferences.notesColumns,['answer']);assert.equal(searches,1);assert.equal(clears,1);
});

test('find replace lists actual fields, distinguishes a real Tags field from the tags target, and blocks execution while fields fail to load', async () => {
  const Form = loadComponentLogic('components/browser/查找替换对话框.ets','查找替换对话框',{$r:key=>key});
  const f = new Form();f.有选中笔记=true;f.onLoadFields=async()=>['Front','Tags'];f.getUIContext=()=>({});
  await f.loadFields();assert.deepEqual(f.fieldNames,['Front','Tags']);f.查找文本='old';f.字段名='Tags';f.targetIndex=3;
  const calls=[];f.onExecute=async (...args)=>{calls.push(args);return false;};
  await f.提交();assert.equal(calls[0][2],'Tags');assert.equal(calls[0][6],false);
  f.targetIndex=1;f.字段名='';await f.提交();assert.equal(calls[1][6],true);
  f.onLoadFields=async()=>{throw Error('offline');};await f.loadFields();await f.提交();assert.equal(calls.length,2);assert.equal(f.fieldsError,true);
});
test('JIDE observes the real reposition eligibility and failed default loading blocks confirmation', async () => {
  const tracker=new AppInterfaceTracker();let fail=false;
  const Form=loadComponentLogic('components/browser/BrowserRepositionDialog.ets','BrowserRepositionDialog',{
    appInterface:tracker,visibleInterfaceItems,namedResourceText:(_,key)=>key,
    调度器服务:class {async 获取重新定位默认值(){if(fail)throw Error('offline');return {random:true,shift:false};}}
  });
  const form=new Form();form.getUIContext=()=>({});form.scope={ids:[1,2],unsupported:3,minimum:10,maximum:20};
  await form.aboutToAppear();let view=tracker.snapshot()[0];assert.equal(view.surface,'browser_reposition');
  assert.equal(view.items.find(item=>item.id==='random').selected,true);
  assert.deepEqual(view.values.map(item=>item.value),['2','3','10','20']);
  fail=true;await form.aboutToAppear();view=tracker.snapshot()[0];assert.equal(view.sectionId,'error');
  assert.equal(view.items.find(item=>item.id==='confirm').enabled,false);form.aboutToDisappear();assert.equal(tracker.snapshot().length,0);
});
