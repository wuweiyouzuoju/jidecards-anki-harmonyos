// SPDX-License-Identifier: AGPL-3.0-or-later
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { loadComponentLogic, loadPlatformModule } from './platform-module-harness.mjs';
import { AgentHistoryRepository, AGENT_HISTORY_DEFAULT_LIMIT, AGENT_HISTORY_LIMITS } from '../../entry/src/main/ets/model/agent/AgentHistoryRepository.ts';
import { UTF8编码 } from '../../entry/src/main/ets/proto/core/utf8.ts';
import { AppInterfaceTracker, agentInterfaceControls, visibleInterfaceItems } from '../../entry/src/main/ets/model/AppInterface.ts';

const deferred = () => { let resolve; const promise = new Promise(done => resolve = done); return {resolve, promise}; };
const settle = async () => { for (let i=0;i<6;i++) await new Promise(setImmediate); };
function settingsHarness() {
  const events = []; const info = { count: 600, limit: 1000, storedBytes: 4096, revision:'r1' };
  const repository = { async info(){ return {...info}; }, async list(){ return []; },
    async setLimit(limit,revision){ events.push(['limit',limit,revision]); info.limit=limit; }, async clear(revision){ events.push(['clear',revision]);info.count=0; },
    async remove(id,revision){ events.push(['remove',id,revision]); } };
  const Settings = loadComponentLogic('components/settings/AgentHistorySettingsSection.ets','AgentHistorySettingsSection',{
    AGENT_HISTORY_DEFAULT_LIMIT, AGENT_HISTORY_LIMITS, agentHistoryRepository:()=>repository, $r:value=>value
  });
  const component = new Settings(); let confirmation = {index:0};
  component.getUIContext=()=>({getPromptAction:()=>({showDialog:async()=>confirmation})});
  component.text=resource=>resource; component.onStateChange=(state,busy)=>events.push(['state',state?.limit,busy]);
  return {component,events,repository,confirm(value){confirmation=value;}};
}

test('manual history limit reductions and clear require confirmation and cancel preserves data', async () => {
  const h=settingsHarness(); h.component.aboutToAppear(); await settle();
  assert.equal(h.component.limit,1000); assert.equal(h.component.canEdit(),true);
  await h.component.change('limit',500); assert.ok(!h.events.some(e=>e[0]==='limit'));
  h.confirm({index:1}); await h.component.change('limit',500); assert.ok(h.events.some(e=>e[0]==='limit'&&e[1]===500&&e[2]==='r1'));
  h.confirm({index:0}); await h.component.change('clear'); assert.ok(!h.events.some(e=>e[0]==='clear'));
  h.confirm({index:1}); await h.component.change('clear'); assert.ok(h.events.some(e=>e[0]==='clear'&&e[1]==='r1'));
});

test('busy and disposed history settings reject late confirmations; accepted writes finish after disposal', async () => {
  const h=settingsHarness(); h.component.aboutToAppear();await settle();
  const confirmation=deferred(); h.component.getUIContext=()=>({getPromptAction:()=>({showDialog:()=>confirmation.promise})});
  const clearing=h.component.change('clear');await settle();
  assert.equal(h.component.busy,true); await h.component.change('clear');
  h.component.aboutToDisappear();confirmation.resolve({index:1});await clearing;
  assert.ok(!h.events.some(e=>e[0]==='clear'));
  const accepted=settingsHarness();accepted.component.aboutToAppear();await settle();accepted.confirm({index:1});
  const write=deferred();accepted.repository.clear=async()=>{accepted.events.push(['accepted']);await write.promise;accepted.events.push(['finished']);};
  const saving=accepted.component.change('clear');await settle();accepted.component.aboutToDisappear();write.resolve();await saving;
  assert.ok(accepted.events.some(e=>e[0]==='finished'));assert.ok(!accepted.events.some(e=>e[0]==='remove'));
});

test('history query generations discard late results and leaving releases observations', async () => {
  const tracker=new AppInterfaceTracker(); const first=deferred(), second=deferred();let requests=0;
  const History=loadComponentLogic('components/agent/AgentHistoryList.ets','AgentHistoryList',{
    appInterface:tracker,agentHistoryRepository:()=>({search:()=>++requests===1?first.promise:second.promise}),
    interfaceItemText:()=> '删除',interfaceItemTitleKey:()=> 'ai_agent_history_delete'
  });
  const list=new History();list.getUIContext=()=>({});list.conversations=[{id:'old',title:'Old'},{id:'new',title:'New'}];list.aboutToAppear();list.query='old';
  const old=list.search();list.query='new';const current=list.search();
  second.resolve({items:[{id:'new',title:'New'},{id:'other-mode',title:'Other'}],nextOffset:-1});await current;
  first.resolve({items:[{id:'old',title:'Old'}],nextOffset:-1});await old;
  assert.deepEqual(list.matches.map(item=>item.id),['new']);assert.equal(tracker.snapshot()[0].optionIds[0],'new');
  list.aboutToDisappear();assert.equal(tracker.snapshot().length,0);
});

test('JIDE more menu uses shared names/icons and reuses home menu surface/list; stale taps cannot open panels', () => {
  const source=readFileSync(new URL('../../entry/src/main/ets/pages/AI制卡页.ets',import.meta.url),'utf8');
  const names=['closeMoreMenu','toggleMoreMenu','moreEntries','selectMore'];
  const methods=names.map(name=>source.match(new RegExp(`  private (?:async )?${name}\\([^]*?\\n  }`))[0]);
  const Page=new Function('appInterface','visibleInterfaceItems','interfaceItemText','$r',
    stripTypeScriptTypes(`class Page {${methods.join('\n')}}`,{mode:'transform'})+';return Page;')(
    {leave(){}},visibleInterfaceItems,(_ui,_surface,id)=>id,value=>value);
  const page=new Page();page.getUIContext=()=>({});page.interfaceEnabled=()=>true;page.uiLanguage='zh-Hans';
  assert.deepEqual(page.moreEntries().map(item=>[item.id,item.icon]),[['settings','app.media.ic_home_settings'],['history','app.media.ic_common_history']]);
  page.moreVisible=false;page.selectMore('settings');assert.equal(page.settingsVisible,undefined);
  page.moreVisible=true;page.selectMore('settings');assert.equal(page.settingsVisible,true);assert.equal(page.moreVisible,false);
  page.toggleMoreMenu();assert.equal(page.moreVisible,true);page.toggleMoreMenu();assert.equal(page.moreVisible,false);
  const top=agentInterfaceControls({history:false,processing:false,parsing:false,batchRunning:false,pendingClarification:false,canSubmit:true});
  assert.ok(top.some(item=>item.id==='more'));assert.ok(!top.some(item=>['settings','history'].includes(item.id)));
  assert.match(source,/AnchoredMenu\([\s\S]*cornerRadius: 应用尺寸\.圆角_卡片[\s\S]*ActionMenuList\(/);
  const memory=readFileSync(new URL('../../entry/src/main/ets/components/agent/AgentMemoryPanel.ets',import.meta.url),'utf8');
  assert.match(memory,/DirectorySelect\(\{ label: \$r\('app.string.agent_memory_scope'\), surfaceColor: \$r\('app.color.surface_card'\)/);
});

test('removing the active history from settings resets conversation while preserving the settings editor', () => {
  const source=readFileSync(new URL('../../entry/src/main/ets/pages/AI制卡页.ets',import.meta.url),'utf8');
  const method=source.match(/  private 开始新会话\([^]*?\n  }/)[0];
  const Page=new Function(stripTypeScriptTypes(`class Page {${method}}`,{mode:'transform'})+';return Page;')();
  const page=new Page();page.cardBatch={isRunning:()=>false};page.history={invalidateRestore(){},close(){}};
  page.closeMoreMenu=()=>{page.moreVisible=false;};page.cancelPendingClarifications=()=>{};
  page.pageMode='edit';page.settingsVisible=true;page.settingsBusy=true;page.conversationId='active';page.historyReadGeneration=0;
  page.开始新会话(true);assert.equal(page.settingsVisible,true);assert.equal(page.settingsBusy,true);
  assert.notEqual(page.conversationId,'active');assert.deepEqual(page.消息列表,[]);
  page.开始新会话();assert.equal(page.settingsVisible,false);
  assert.match(source,/onHistoryRemoved:[^\n]*开始新会话\(true\)/);
});

test('platform history atomic write handles UTF-8 short writes and sync failure preserves old content', async () => {
  const files=new Map();const handles=new Map();let nextFd=0;let syncFails=false;
  const fs={ OpenMode:{CREATE:1,WRITE_ONLY:2,TRUNC:4},accessSync:path=>files.has(path),mkdirSync:path=>files.set(path,''),
    async open(path){files.set(path,Buffer.alloc(0));const file={fd:++nextFd,path};handles.set(file.fd,file);return file;},
    async write(fd,chunk){const file=handles.get(fd);const bytes=Buffer.from(chunk).subarray(0,7);files.set(file.path,Buffer.concat([files.get(file.path),bytes]));return bytes.length;},
    async fsync(){if(syncFails)throw Error('sync failed');},async close(){},async rename(from,to){files.set(to,files.get(from));files.delete(from);},
    async readText(path){return files.get(path).toString('utf8');},async unlink(path){files.delete(path);} };
  const Files=loadPlatformModule('backend/agent/AgentHistoryFiles.ets','AgentHistoryFiles',{fs,UTF8编码,AgentHistoryRepository});
  const io=new Files({filesDir:'/private'});await io.write('body.json','中文多字节'.repeat(10));
  assert.equal(await io.read('body.json'),'中文多字节'.repeat(10));syncFails=true;
  await assert.rejects(io.write('body.json','replace'),/sync failed/);
  assert.equal(await io.read('body.json'),'中文多字节'.repeat(10));
  await assert.rejects(io.read('../body.json'),/history_path_invalid/);
});
