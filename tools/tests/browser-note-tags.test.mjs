// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { flattenTagTree, visibleTagRows, TagSelection, newTagName, applyTagSelection,
  updateSelectedNoteTags, tagSearchNode } from '../../entry/src/main/ets/model/NoteTags.ts';
import { parseNoteTags } from '../../entry/src/main/ets/model/NoteFieldEditing.ts';
import { loadComponentLogic } from './platform-module-harness.mjs';
import { stripTypeScriptTypes } from 'node:module';
import { BrowserOperationController } from '../../entry/src/main/ets/model/BrowserOperationController.ts';
import { resolveBrowserNoteIds } from '../../entry/src/main/ets/model/BrowserSelection.ts';
import { AutoSyncScheduler } from '../../entry/src/main/ets/model/AutoSyncScheduler.ts';
import { APP_INTERFACE_SURFACES, AppInterfaceTracker } from '../../entry/src/main/ets/model/AppInterface.ts';

const node = (name, children = [], collapsed = true, level = 1) => ({name, children, collapsed, level});
const root = node('', [node('Science', [node('Biology', [node('Cell')]), node('Chemistry')]), node('Other')], false, 0);
const names = rows => rows.map(row => row.fullName);
const deferred = () => { let resolve, reject; const promise = new Promise((a,b) => {resolve=a; reject=b;}); return {promise,resolve,reject}; };

test('Core leaf names become full tag paths; filtering reveals ancestors without altering stored collapse', () => {
  const rows = flattenTagTree(root);
  assert.deepEqual(names(rows), ['Science','Science::Biology','Science::Biology::Cell','Science::Chemistry','Other']);
  assert.deepEqual(rows.map(row => row.level), [0,1,2,1,0]);
  assert.deepEqual(names(visibleTagRows(rows,'')), ['Science','Other']);
  const filtered = visibleTagRows(rows,'cELL');
  assert.deepEqual(names(filtered), ['Science','Science::Biology','Science::Biology::Cell']);
  assert.equal(filtered[0].collapsed,false); assert.equal(rows[0].collapsed,true);
  assert.deepEqual(names(visibleTagRows(rows,'nothing')), []);
  assert.deepEqual(names(visibleTagRows(rows,'')), ['Science','Other']);
});

test('three-state editing preserves mixed tags and never implicitly checks virtual ancestors', () => {
  const selection = new TagSelection(root, [['Science::Biology::Cell','Shared'],['shared','Other']]);
  const rows = selection.visible('');
  assert.equal(rows.find(row=>row.fullName==='Shared').selection,1);
  assert.equal(rows.find(row=>row.fullName==='Science::Biology::Cell').selection,2);
  assert.equal(rows.find(row=>row.fullName==='Science').selection,0);
  assert.deepEqual(selection.changes(),[]);
  selection.toggle('science::biology::CELL');
  assert.deepEqual(selection.changes(),[{name:'Science::Biology::Cell',selected:true}]);
  selection.toggle('Science::Biology::Cell');
  assert.deepEqual(selection.changes(),[{name:'Science::Biology::Cell',selected:false}]);
  selection.toggle('Science::Biology::Cell');
  assert.deepEqual(selection.changes(),[], 'mixed → all → none → mixed restores original');
  selection.toggle('SHARED');
  assert.deepEqual(applyTagSelection(['shared','Science::Biology::Cell'],selection.changes()),['Science::Biology::Cell']);
});

test('new hierarchical tags normalize spaces, remain drafts and allow explicit parent selection', () => {
  assert.deepEqual(parseNoteTags('Tag tag\tTAG 中文::词\u3000中文::词'),['Tag','中文::词']);
  assert.equal(newTagName('  English   Listening::  '),'English::Listening');
  assert.equal(newTagName('::Cell'),'blank::Cell');
  const selection = new TagSelection(root,[[]]);
  selection.add('New Topic Child');
  assert.deepEqual(selection.changes(),[{name:'New::Topic::Child',selected:true}]);
  selection.toggle('New::Topic');
  assert.deepEqual(selection.changes(),[{name:'New::Topic',selected:true},{name:'New::Topic::Child',selected:true}]);
  selection.add('new::topic::child');
  assert.equal(selection.visible('').filter(row=>row.fullName.toLowerCase()==='new::topic::child').length,1);
  assert.equal(flattenTagTree(root).some(row=>row.fullName.startsWith('New')),false);
});

test('batch tag commits read latest notes, deduplicate siblings and preserve fields and child tags', async () => {
  const notes = new Map([[1,{id:1,guid:'a',notetypeId:10,mtimeSecs:88,usn:4,fields:['new field','<img src="x">'],tags:['Old','Old::child','Concurrent']}],
    [2,{id:2,guid:'b',notetypeId:10,mtimeSecs:89,usn:5,fields:['other'],tags:['New','untouched']}]]);
  const reads=[], writes=[];
  const count=await updateSelectedNoteTags([1,1,2],[{name:'old',selected:false},{name:'New',selected:true}],
    async id=>{reads.push(id);return notes.get(id);},async batch=>writes.push(batch));
  assert.deepEqual(reads,[1,2]); assert.equal(count,1); assert.equal(writes.length,1);
  assert.deepEqual(writes[0][0],{...notes.get(1),tags:['Old::child','Concurrent','New']});
  assert.deepEqual(notes.get(1).tags,['Old','Old::child','Concurrent']);
  assert.deepEqual(writes[0][0].fields,notes.get(1).fields);
});

test('empty or unchanged selection performs no write; partial reads fail the entire batch', async () => {
  let writes=0,reads=0;
  const read=async id=>{reads++; if(id===2)throw Error('missing');return {id,fields:['keep'],tags:['old']};};
  const write=async()=>writes++;
  assert.equal(await updateSelectedNoteTags([], [{name:'new',selected:true}],read,write),0);
  assert.equal(await updateSelectedNoteTags([1], [],read,write),0); assert.equal(reads,0);
  await assert.rejects(updateSelectedNoteTags([1,2],[{name:'new',selected:true}],read,write),/missing/);
  assert.equal(writes,0);
});

test('batch captures change objects before asynchronous reads', async () => {
  const pending=deferred(); const changes=[{name:'new',selected:true}]; const writes=[];
  const request=updateSelectedNoteTags([1],changes,()=>pending.promise,async notes=>writes.push(notes));
  changes[0].name='wrong'; changes[0].selected=false;
  pending.resolve({id:1,fields:[],tags:[]}); await request;
  assert.deepEqual(writes[0][0].tags,['new']);
});

test('tag searches pass raw full names to Core and AND-group existing OR conditions', () => {
  const name='root::quote"star*slash\\';
  assert.deepEqual(tagSearchNode(name),{kind:'tag',tag:name});
  const combined=tagSearchNode(name,'deck:A OR deck:B');
  assert.equal(combined.group.joiner,0);
  assert.deepEqual(combined.group.nodes,[{kind:'parsable_text',text:'deck:A OR deck:B'},{kind:'tag',tag:name}]);
});

function picker(load) {
  const changes=[], ready=[];
  const Picker=loadComponentLogic('components/common/TagPicker.ets','TagPicker',{
    标签服务:class{标签树(){return load();}},TagSelection,applyTagSelection,newTagName,
    appInterface:new AppInterfaceTracker(), APP_INTERFACE_SURFACES, namedResourceText:(_ctx,key)=>key
  });
  const instance=new Picker(); instance.noteTags=[['Other']];
  instance.getUIContext=()=>({});
  instance.onChanged=(delta,tags)=>{changes.push({delta,tags});instance.noteTags=[tags];instance.resetSelection();};
  instance.onReady=value=>ready.push(value); instance.aboutToAppear();
  return {instance,changes,ready};
}

test('picker preserves single-note baseline across parent Prop updates and manual edits', async () => {
  const p=picker(async()=>root); await new Promise(resolve=>setImmediate(resolve));
  p.instance.toggle('Other'); assert.deepEqual(p.changes.at(-1).tags,[]);
  p.instance.toggle('Other'); assert.deepEqual(p.changes.at(-1).tags,['Other']);
  p.instance.noteTags=[['Science']];p.instance.resetSelection();
  p.instance.toggle('Science');assert.deepEqual(p.changes.at(-1).tags,[]);
  p.instance.noteTags=[['Other']];p.instance.resetSelection();
  p.instance.toggle('Other');assert.deepEqual(p.changes.at(-1).tags,[]);
  p.instance.isInteractive=false;p.instance.query='blocked';p.instance.add();assert.equal(p.changes.length,4);
});

test('failed and disposed picker loads never clear tags or emit a successful selection', async () => {
  const bad=picker(async()=>{throw Error('offline');});await new Promise(resolve=>setImmediate(resolve));
  assert.equal(bad.instance.failed,true);assert.deepEqual(bad.changes,[]);assert.deepEqual(bad.ready,[false,false]);
  const pending=deferred();const gone=picker(()=>pending.promise);gone.instance.aboutToDisappear();
  pending.resolve(root);await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(gone.changes,[]);assert.deepEqual(gone.ready,[false]);assert.equal(gone.instance.tree,null);
});

function pageHarness(mode='cards') {
  const source=readFileSync(new URL('../../entry/src/main/ets/pages/浏览页.ets',import.meta.url),'utf8').replaceAll('\r\n','\n');
  const methods=['打开批量标签','提交批量标签','captureBrowserSelection','isBrowserSelectionCurrent',
    'runBrowserOperation','解析选中为笔记ID','退出多选','应用标签搜索'].map(name=>{
    const start=source.search(new RegExp('^  private (?:async )?'+name+'\\(', 'm'));assert.ok(start>=0,name);
    return source.slice(start,source.indexOf('\n  }',start)+4);
  });
  const deps={syncActivity:{waitForCollection:async()=>{}},resolveBrowserNoteIds,updateSelectedNoteTags,tagSearchNode,
    autoSyncScheduler:new AutoSyncScheduler(),AppStorage:{setOrCreate(){}},$r:key=>key};
  const Page=new Function(...Object.keys(deps),stripTypeScriptTypes('class Page {'+methods.join('\n')+'}',{mode:'transform'})+'; return Page;')(...Object.values(deps));
  const page=new Page(), writes=[], reads=[];
  const notes=new Map([[11,{id:11,fields:['latest'],tags:['only-a','shared']}],[12,{id:12,fields:['keep'],tags:['shared']}]]);
  Object.assign(page,{operations:new BrowserOperationController(),浏览模式值:mode,选中ID列表:mode==='cards'?[101,102,103]:[11,12],
    selectionVersion:0,searchVersion:0,sidebarVersion:0,多选模式值:true,批量忙碌:false,batchDialog:'none',
    显示侧边栏:true,搜索文本:'deck:A OR deck:B',执行搜索:async()=>{},取本地化文案:key=>key,
    卡片服务实例:{获取卡片:async id=>({noteId:id===103?12:11})},
    笔记服务实例:{获取笔记:async id=>{reads.push(id);return notes.get(id);},更新笔记:async(batch,skip)=>writes.push({batch,skip})}});
  return {page,writes,reads,notes};
}

test('real browser batch entry deduplicates sibling notes, keeps failed drafts and accepts retry',async()=>{
  const h=pageHarness();await h.page.打开批量标签();assert.deepEqual(h.reads,[11,12]);assert.equal(h.page.batchDialog,'tags');
  assert.deepEqual(h.page.batchNoteTags,[['only-a','shared'],['shared']]);
  const selection=new TagSelection(root,h.page.batchNoteTags);selection.toggle('only-a');selection.toggle('only-a');
  const write=h.page.笔记服务实例.更新笔记;h.page.笔记服务实例.更新笔记=async()=>{throw Error('write failed');};
  await h.page.提交批量标签(selection.changes());assert.equal(h.page.batchDialog,'tags');
  assert.equal(h.page.选中ID列表.length,3);assert.match(h.page.批量错误,/tags_save_error/);
  h.page.笔记服务实例.更新笔记=write;await h.page.提交批量标签(selection.changes());
  assert.equal(h.writes.length,1);assert.equal(h.writes[0].skip,false);
  assert.deepEqual(h.writes[0].batch[0].tags,['shared']);assert.deepEqual(h.writes[0].batch[0].fields,['latest']);
  assert.equal(h.page.batchDialog,'none');assert.deepEqual(h.page.选中ID列表,[]);
});

test('real browser rejects stale batch reads and stale selection submissions',async()=>{
  const h=pageHarness('notes'),pending=deferred();h.page.笔记服务实例.获取笔记=()=>pending.promise;
  const loading=h.page.打开批量标签();await new Promise(resolve=>setImmediate(resolve));
  h.page.selectionVersion++;pending.resolve({id:11,tags:['old']});await loading;
  assert.equal(h.page.batchDialog,'none');assert.equal(h.page.批量忙碌,false);
  const current=pageHarness('notes');await current.page.打开批量标签();current.page.selectionVersion++;
  await current.page.提交批量标签([{name:'wrong',selected:true}]);assert.deepEqual(current.writes,[]);
});

test('latest tag search wins asynchronous Core construction and preserves raw name plus OR grouping',async()=>{
  const h=pageHarness(),first=deferred(),second=deferred(),nodes=[];
  h.page.搜索服务实例={构建搜索串:node=>{nodes.push(node);return nodes.length===1?first.promise:second.promise;}};
  const a=h.page.应用标签搜索('Old',true),b=h.page.应用标签搜索('New::leaf*',true);
  second.resolve('(deck:A OR deck:B) tag:New::leaf\\*');await b;
  first.resolve('stale');await a;
  assert.equal(h.page.搜索文本,'(deck:A OR deck:B) tag:New::leaf\\*');
  assert.equal(nodes[1].group.nodes[1].tag,'New::leaf*');assert.equal(h.page.显示侧边栏,false);
});

test('17k-tag trees filter and select through the same model with unique paths', () => {
  const large=node('',[node('Root',Array.from({length:17000},(_,i)=>node('Tag'+i)))],false);
  const selection=new TagSelection(large,[['Root::Tag16999']]);
  const rows=selection.visible('tag16999');assert.deepEqual(names(rows),['Root','Root::Tag16999']);
  assert.equal(rows[1].selection,1);
});

test('all manual note editors share tag input and parsing; sidebar uses full paths and no count-only completion', () => {
  const read=path=>readFileSync(new URL('../../entry/src/main/ets/'+path,import.meta.url),'utf8');
  for(const path of ['pages/添加笔记页.ets','components/browser/浏览编辑区.ets','components/添加笔记面板.ets']) {
    const source=read(path);assert.match(source,/NoteTagsField\(/);assert.match(source,/return parseNoteTags\(this\./);
  }
  const sidebar=read('components/browser/浏览侧边栏.ets');assert.match(sidebar,/TagTreeList\(/);
  assert.match(sidebar,/Column\(\{ space: 应用尺寸\.间距_8 \}\)[\s\S]*tags_filter_hint[\s\S]*TagTreeList\([\s\S]*\}\.width\('100%'\)\.padding\(应用尺寸\.卡片内边距\)/);
  assert.match(sidebar,/if \(this\.扁平化标签树\(\)\.length === 0\)[\s\S]*tags_no_matches[\s\S]*else/);
  assert.doesNotMatch(sidebar.replace(/^\s*\/\/.*$/gm,''),/onCompleteTag|onSelectTag\(行\.name\)/);
  const list=read('components/common/TagTreeList.ets');assert.match(list,/LazyForEach/);
  assert.match(list,/this\.onSelect\(row\.fullName\)/);
});
