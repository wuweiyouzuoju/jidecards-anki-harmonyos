// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadPlatformModule, loadPlatformSource } from './platform-module-harness.mjs';
import { localPreferenceApi } from './local-preference-harness.mjs';
import { componentMethods } from './sync-panel-harness.mjs';
import * as operations from '../../entry/src/main/ets/model/agent/AgentOperations.ts';
import { AgentOperationHosts } from '../../entry/src/main/ets/model/agent/AgentOperationHost.ts';
import { AgentRetrieval } from '../../entry/src/main/ets/model/agent/AgentRetrieval.ts';
import { AgentTaskPlan } from '../../entry/src/main/ets/model/agent/AgentTaskPlan.ts';
import { NoteDuplicateSession, initialDuplicateScanState } from '../../entry/src/main/ets/model/NoteDuplicateSession.ts';
import { DataTransferSession } from '../../entry/src/main/ets/model/home/DataTransferSession.ts';
import { DEFAULT_IMPORT_ANKI_PACKAGE_OPTIONS } from '../../entry/src/main/ets/proto/messages/ImportExportMessages.ts';
import { normalizeSyncServer } from '../../entry/src/main/ets/model/SyncSettings.ts';
import { decodeWritablePreference, agentPreferenceDefinitions } from '../../entry/src/main/ets/model/agent/AgentPreferenceSettings.ts';
import fs from 'node:fs';
const graphPreferencesSnapshot=loadPlatformModule('backend/GraphPreferencesCommands.ts','graphPreferencesSnapshot',{});

function nativeFixture() {
  const s={writes:[],version:1,cache:new Map(),disk:new Map(),names:['backup.colpkg'],items:[],appearance:{alias:'',tone:'none',background:''},hidden:[],loggedIn:true,server:'https://example.org/',accent:false,exportSaved:null,publishError:false};
  const hosts=new AgentOperationHosts();const storage={get:()=>({filesDir:'/private'}),setOrCreate:()=>{}};
  const store={getSync:(key,fallback)=>s.cache.has(key)?s.cache.get(key):fallback,
    get:async(key,fallback)=>store.getSync(key,fallback),putSync:(key,value)=>{s.cache.set(key,value);},
    put:async(key,value)=>store.putSync(key,value),delete:async key=>s.cache.delete(key),has:async key=>s.cache.has(key),
    flush:async()=>{if(s.diskError)throw Error('disk full');s.disk=new Map(s.cache);}};
  const preferences={getPreferences:async()=>store,getPreferencesSync:()=>store};
  const reminder=loadPlatformModule('model/学习提醒存储.ets','({加载学习提醒设置,保存学习提醒设置,生成提醒项ID})',{
    ...localPreferenceApi(storage),AppStorage:storage,preferences});
  const record=(name,...args)=>{s.writes.push([name,...structuredClone(args)]);s.version++;};
  class Media {
    async createSnapshot(){record('media_check');return {token:8,unusedCount:2,missingCount:1,haveTrash:true};}
    async releaseSnapshot(token){s.writes.push(['release',token]);}
    async reportPage(){return {token:8,lines:['one'],nextOffset:0};}
    async unusedPage(){return {token:8,filenames:['unused.png'],nextOffset:0};}
    async missingNotesPage(){return {token:8,noteIds:[11],nextOffset:0};}
    async trashSnapshot(token){record('trash_unused',token);}
    async tagMissingNotes(token){record('tag_missing',token);return 1;}
    async 清空回收站(){record('empty_trash');}async 恢复回收站(){record('restore_trash');}
  }
  const operationSnapshot=loadPlatformModule('backend/agent/CoreAgentOperations.ts','operationSnapshot',{operationDefinition:operations.operationDefinition});
  const dependencies={...operations,operationSnapshot,agentOperationHosts:hosts,AppStorage:storage,normalizeSyncServer,
    fs:{accessSync:()=>true,listFileSync:()=>['a.png'],statSync:()=>({isDirectory:()=>false,size:1,mtime:s.version})},
    CoreAgentOperations:class{},媒体服务:Media,集合服务:class {async 获取撤销状态(){return {lastStep:s.version};}},
    readDeckAppearance:async()=>structuredClone(s.appearance),readHiddenDeckIds:async()=>s.hidden.slice(),
    隐藏牌组:async id=>{record('hidden',id);s.hidden.push(id);},取消隐藏牌组:async id=>{record('unhidden',id);s.hidden=s.hidden.filter(x=>x!==id);},
    保存牌组别名:async(id,value)=>{record('alias',id,value);s.appearance.alias=value;},保存牌组色调:async(id,value)=>{record('tone',id,value);s.appearance.tone=value;},
    清除牌组背景图:async id=>{record('background_clear',id);s.appearance.background='';},解析牌组色调:value=>value,
    ...reminder,刷新学习提醒:async()=>{s.writes.push(['publish']);if(s.publishError)throw Error('permission denied');},
    LocalBackups:class {async list(){return s.names.slice();}async create(force){record('backup',force);s.names.push('new.colpkg');return true;}async restore(name){record('restore',name);}},
    导出集合:async(...args)=>{record('export',...args);return '/owned/export.colpkg';},完成导出:async()=>s.exportSaved,
    loadCustomSyncServer:()=>s.server,loadVisibleSyncAuth:()=>s.loggedIn?{hkey:'never-return-this',username:'private'}:null,
    加载媒体待同步:()=>false,loadAutoSyncEnabled:()=>false,
    clearSyncCredentialsVerified:async()=>{record('logout');s.loggedIn=false;},saveCustomSyncServer:async value=>{record('server',value);s.server=normalizeSyncServer(value);s.loggedIn=false;},
    loadBrowserIgnoreAccents:async()=>s.accent,saveBrowserIgnoreAccents:async value=>{record('accent',value);s.accent=value;},
    autoSyncScheduler:{beginOperation:()=>{},endOperation:()=>{},request:()=>{}},syncActivity:{isCollectionBusy:()=>false,waitForCollection:async()=>{}}
  };
  const App=loadPlatformModule('backend/agent/AppAgentOperations.ets','AppAgentOperations',dependencies);
  const backend=new App();const coordinator=new operations.AgentOperationCoordinator(backend);
  const execute=async(name,args={})=>{const draft=await coordinator.propose(name,JSON.stringify(args));return JSON.parse(await coordinator.execute(draft));};
  return {s,backend,coordinator,execute,hosts,reminder,store,preferences,storage};
}

test('native reminders create from an absent key, preserve stable IDs and report publication failure separately',async()=>{
  const f=nativeFixture();const create={operation:'create',hour:8,minute:30,title:'Study',content:'Today',enabled:true};
  const draft=await f.coordinator.propose('propose_reminder',JSON.stringify(create));assert.equal(f.s.disk.size,0);
  assert.equal(JSON.parse(await f.coordinator.execute(draft)).status,'completed');
  let items=(await f.reminder.加载学习提醒设置()).提醒项列表;const id=items[0].唯一ID;assert.equal(items.length,1);assert.ok(f.s.disk.has('study_reminder_items'));
  await f.execute('propose_reminder',{...create,operation:'update',reminderId:id,title:'Updated'});
  f.s.publishError=true;assert.equal((await f.execute('propose_reminder',{operation:'enable',reminderId:id,enabled:false})).status,'partial');
  items=(await f.reminder.加载学习提醒设置()).提醒项列表;assert.equal(items[0].唯一ID,id);assert.equal(items[0].开启,false);
  f.s.publishError=false;await f.execute('propose_reminder',{operation:'delete',reminderId:id});assert.deepEqual((await f.reminder.加载学习提醒设置()).提醒项列表,[]);
});
test('reminder migration compares normalized old values and rejects a manual change before saving',async()=>{
  const f=nativeFixture();f.s.cache.set('study_reminder_items','[{"唯一ID":9,"小时":8,"分钟":0,"标题":"old","内容":"old"}]');
  const old=(await f.reminder.加载学习提醒设置()).提醒项列表;await f.reminder.保存学习提醒设置(old,JSON.stringify(old));
  await assert.rejects(f.reminder.保存学习提醒设置([], '[]'),/changed_since_proposal/);assert.equal((await f.reminder.加载学习提醒设置()).提醒项列表[0].开启,true);
});
test('native deck, backup, browser and account proposals call original owners and reject stale snapshots',async()=>{
  const f=nativeFixture();
  for(const [operation,value]of [['hidden','true'],['hidden','false'],['alias','My deck'],['tone','mint'],['background','clear']])assert.equal((await f.execute('propose_deck_appearance',{deckId:1,operation,value})).status,'completed');
  assert.equal(f.s.appearance.alias,'My deck');assert.equal(f.s.appearance.tone,'mint');assert.deepEqual(f.s.hidden,[]);
  await f.execute('propose_create_backup');await f.execute('propose_restore_backup',{name:'backup.colpkg'});
  await assert.rejects(f.backend.snapshot('propose_restore_backup',{name:'../../private'}),/backup_missing/);
  await f.execute('propose_set_ignore_accents',{enabled:true});assert.equal(f.s.accent,true);
  const status=await f.backend.read('get_sync_status',{});assert.ok(!status.includes('never-return-this'));assert.ok(!status.includes('username'));
  await f.execute('propose_sync_account',{operation:'logout'});assert.equal(f.s.loggedIn,false);
  await assert.rejects(f.backend.snapshot('propose_sync_account',{operation:'server'}),/value_required/);
  await f.execute('propose_sync_account',{operation:'server',value:'https://new.example/'});assert.equal(f.s.server,'https://new.example/');
  const stale=await f.coordinator.propose('propose_deck_appearance','{"deckId":1,"operation":"alias","value":"Other"}');f.s.appearance.alias='Manual';
  await assert.rejects(f.coordinator.execute(stale),/changed_since_proposal/);assert.equal(f.s.appearance.alias,'Manual');
});
test('collection export waits for the system save result and treats picker cancellation as cancellation',async()=>{
  const f=nativeFixture();assert.equal((await f.execute('propose_export_collection',{withMedia:true,legacy:false})).status,'cancelled');
  f.s.exportSaved='external.colpkg';assert.equal((await f.execute('propose_export_collection',{withMedia:false,legacy:true})).status,'completed');
  assert.deepEqual(f.s.writes.filter(w=>w[0]==='export').map(w=>w[2]),[{includeMedia:true,legacy:false},{includeMedia:false,legacy:true}]);
});
test('media cleanup requires a confirmed current report, pages actual missing IDs and invalidates consumed reports',async()=>{
  const f=nativeFixture();await assert.rejects(f.backend.read('get_media_report',{scope:'report',offset:0}),/check_first/);
  await assert.rejects(f.backend.snapshot('propose_media_maintenance',{operation:'trash_unused'}),/check_first/);
  await f.execute('propose_check_media');assert.deepEqual(JSON.parse(await f.backend.read('get_media_report',{scope:'missing_notes',offset:0})).noteIds,[11]);
  const snap=await f.backend.snapshot('propose_media_maintenance',{operation:'tag_missing'});assert.deepEqual(snap.noteIds,[11]);
  await f.execute('propose_media_maintenance',{operation:'tag_missing'});await assert.rejects(f.backend.read('get_media_report',{scope:'unused',offset:0}),/check_first/);
  for(const operation of ['trash_unused','empty_trash','restore_trash']){await f.execute('propose_check_media');await f.execute('propose_media_maintenance',{operation});}
  await f.execute('propose_check_media');f.s.version++;await assert.rejects(f.backend.read('get_media_report',{scope:'report',offset:0}),/check_first/);
});
test('study commands freeze the active card and phase; native workflows wait for owner completion',async()=>{
  const f=nativeFixture();let phase='question';const state=()=>JSON.stringify({available:true,blocked:false,phase,audio:true,card:{cardId:21,noteId:11,deckId:1}});
  f.hosts.register('study',{snapshot:state,execute:async(name,args)=>JSON.stringify({status:'completed',command:args.operation})});
  await assert.rejects(f.backend.snapshot('propose_study_command',{operation:'good'}),/unavailable/);
  const draft=await f.coordinator.propose('propose_study_command','{"operation":"flip"}');assert.deepEqual(draft.affectedCardIds,[21]);assert.deepEqual(draft.affectedDeckIds,[1]);
  phase='answer';await assert.rejects(f.coordinator.execute(draft),/changed_since_proposal|study_command_unavailable/);assert.equal((await f.execute('propose_study_command',{operation:'good'})).status,'completed');
  for(const [name,args]of [['propose_sync',{}],['propose_sync_account',{operation:'login'}],['propose_deck_appearance',{deckId:1,operation:'background',value:'pick'}]]){
    let launch;f.hosts.register('home',{snapshot:()=> 'home',execute:()=>f.hosts.wait('workflow',()=>{launch=true;})});
    let settled=false;const task=f.execute(name,args).then(value=>{settled=true;return value;});
    while(!launch)await new Promise(resolve=>setImmediate(resolve));assert.equal(settled,false);f.hosts.finish('workflow','{"status":"cancelled"}');assert.equal((await task).status,'cancelled');
  }
});

test('actual import session does not equate opening APKG/CSV/collection flows with completion',async()=>{
  for(const format of ['apkg','csv','collection']){
    let published;const backend={pickImportFile:async()=>null,importPackagePresets:async()=>({...DEFAULT_IMPORT_ANKI_PACKAGE_OPTIONS})};
    const session=new DataTransferSession(backend,value=>{published=value;},async()=>{},()=>{});
    const task=session.runForAgent(format);if(format==='collection'){await Promise.resolve();assert.equal(published.mode,'importPersonalData');session.close();}
    assert.equal(JSON.parse(await task).status,'cancelled');
  }
  let published,release;const gate=new Promise(resolve=>{release=resolve;});let commits=0;
  const backend={pickImportFile:async()=>({name:'deck.apkg',uri:'owned'}),importPackagePresets:async()=>({...DEFAULT_IMPORT_ANKI_PACKAGE_OPTIONS}),importDeck:()=>gate,committed:()=>{commits++;}};
  const session=new DataTransferSession(backend,value=>{published=value;},async()=>{},()=>{});
  let settled=false;const task=session.runForAgent('apkg').then(value=>{settled=true;return value;});
  while(published?.phase!=='idle')await new Promise(resolve=>setImmediate(resolve));assert.equal(settled,false);
  const work=session.execute({kind:'importDeck'});session.dispose();release(null);await work;
  assert.equal(JSON.parse(await task).status,'completed');assert.equal(commits,1);
});

test('operation registration uses declared risks, requires discovered targets and budgets duplicate field reads',async()=>{
  const Scope=loadPlatformModule('backend/agent/AgentScope.ets','AgentScope',{AgentRetrieval,AgentTaskPlan});const scope=new Scope();
  scope.restoreReadableIds([21],[11],[1],[5]);let fieldReads=0;let ids=[11,12];
  const coordinator={read:async name=>JSON.stringify(name==='get_backups'?{names:['backup.colpkg']}:name==='get_reminders'?{提醒项列表:[{唯一ID:4}]}:{presets:[{id:2}]}),
    propose:async()=>({id:'test-draft',affectedCardIds:[]})};
  const Tools=loadPlatformModule('backend/agent/AgentOperationTools.ets','AgentOperationTools',{
    ...operations,agentOperationCoordinator:coordinator,NoteDuplicateSession,initialDuplicateScanState,
    笔记类型服务:class{async 获取编辑笔记类型(){return {fieldNames:['Front']};}},
    AnkiNoteDuplicates:class{async search(){return ids.slice();}async fields(batch){fieldReads++;return batch.map(noteId=>({noteId,value:'same'}));}}
  });
  const tools=new Tools(scope),registered=[];const registry={registerRead:(name,handler)=>registered.push([name,'read',handler]),registerDraft:(name,handler)=>registered.push([name,'write',handler]),registerHighRiskDraft:(name,handler)=>registered.push([name,'high_risk',handler])};
  tools.register(registry);assert.deepEqual(registered.map(([name,risk])=>[name,risk]),operations.agentOperationDefinitions().map(t=>[t.name,t.risk]));
  await assert.rejects(tools.propose('propose_restore_backup','{"name":"backup.colpkg"}'),/not_discovered/);await tools.read('get_backups','{}');await tools.propose('propose_restore_backup','{"name":"backup.colpkg"}');
  await assert.rejects(tools.propose('propose_reset_cards','{"cardIds":[999],"restorePosition":false,"resetCounts":false}'));
  const duplicates=JSON.parse(await tools.read('get_duplicate_notes','{"notetypeId":5,"field":"Front","query":""}'));assert.deepEqual(duplicates.groups[0].noteIds,[11,12]);assert.equal(fieldReads,1);
  ids=Array.from({length:500},(_,i)=>i+100);await assert.rejects(tools.read('get_duplicate_notes','{"notetypeId":5,"field":"Front","query":"other"}'));assert.equal(fieldReads,1);
});

test('new setting dispatcher routes every supported setting and rejects stale values before writes',async()=>{
  const values=new Map(agentPreferenceDefinitions().map(d=>[d.id,String(d.defaultValue)]));values.set('language','zh-Hans');values.set('study_quick_answer','0');
  values.set('graph_preferences','{"calendarFirstDayOfWeek":0,"cardCountsSeparateInactive":true,"futureDueShowBacklog":false}');
  const writes=[];const save=(id)=>(value)=>{writes.push(id);values.set(id,String(value));};
  const dependencies={graphPreferencesSnapshot,decodeWritablePreference,readAgentPreference:async id=>({value:values.get(id)}),AppStorage:{get:()=>({}),setOrCreate:()=>{}},
    当前语言模式:()=>values.get('language'),设置语言模式:save('language'),readSavedStudyQuickAnswerMode:async()=>Number(values.get('study_quick_answer')),saveStudyQuickAnswerMode:save('study_quick_answer'),
    保存简洁模式:save('simple_mode'),保存显示今日进度卡:save('home_today_summary'),保存学习布局模式:save('study_layout'),保存小时分布窗口:save('stats_hours_range'),保存统计天数:save('stats_days_range'),
    saveAutoSyncEnabled:save('auto_sync'),saveMediaSyncEnabled:save('sync_media'),saveAutomaticBackup:async(_context,value)=>save('automatic_backups')(value),saveThemeMotion:save('theme_motion'),
    saveCardTextSize:save('card_text_size'),saveDeckListStyle:save('deck_list_style'),saveMotionStyle:save('motion_style'),saveStudyHaptics:save('study_haptics'),
    统计服务:class{async 获取图表偏好(){return JSON.parse(values.get('graph_preferences'));}},saveGraphPreferences:async value=>values.set('graph_preferences',JSON.stringify(value))};
  const saveSetting=loadPlatformModule('backend/agent/AgentSettingCommands.ets','saveAgentSettingValue',dependencies);
  for(const [id,after]of Object.entries({simple_mode:'false',home_today_summary:'false',study_layout:'bottom',theme_motion:'false',automatic_backups:'false',auto_sync:'true',sync_media:'false',stats_hours_range:'3',stats_days_range:'0',language:'en',study_quick_answer:'2',graph_preferences:values.get('graph_preferences')})){
    await saveSetting(id,after,values.get(id));assert.equal(values.get(id),after,id);
  }
  const count=writes.length;await assert.rejects(saveSetting('simple_mode','true','true'),/changed_since_proposal/);assert.equal(writes.length,count);
});

test('verified sync credential writes wait for flush and never report failed persistence as completed',async()=>{
  const f=nativeFixture();const api=loadPlatformModule('model/同步凭证存储.ets','({saveSyncCredentialsVerified,clearSyncCredentialsVerified})',{
    preferences:f.preferences,AppStorage:f.storage,normalizeSyncServer,OFFICIAL_ANKIWEB_SYNC_UI_ENABLED:false,hilog:{warn(){},error(){},info(){}}});
  const auth={hkey:'secret',username:'local',endpoint:'https://example.org/'};await api.saveSyncCredentialsVerified(auth);assert.equal(f.s.disk.get('sync_hkey'),'secret');
  await api.clearSyncCredentialsVerified();assert.equal(f.s.disk.has('sync_hkey'),false);
  f.s.diskError=true;await assert.rejects(api.saveSyncCredentialsVerified(auth),/disk full/);
});

test('hidden deck owner serializes concurrent read-modify-write without dropping either accepted change',async()=>{
  const f=nativeFixture();const owner=loadPlatformModule('model/隐藏牌组存储.ets','({隐藏牌组,取消隐藏牌组,readHiddenDeckIds})',{
    ...localPreferenceApi(f.storage),AppStorage:f.storage,preferences:f.preferences});
  await Promise.all([owner.隐藏牌组('1'),owner.隐藏牌组('2')]);assert.deepEqual(await owner.readHiddenDeckIds(),['1','2']);
  await Promise.all([owner.取消隐藏牌组('1'),owner.隐藏牌组('3')]);assert.deepEqual(await owner.readHiddenDeckIds(),['2','3']);
  await assert.rejects(owner.隐藏牌组('4','[]'),/changed_since_proposal/);assert.deepEqual(await owner.readHiddenDeckIds(),['2','3']);
});

test('graph preference owner compares semantic fields independent of JSON key order and rejects stale writes',async()=>{
  let value={calendarFirstDayOfWeek:1,cardCountsSeparateInactive:true,browserLinksSupported:true,futureDueShowBacklog:false};let writes=0;
  const save=loadPlatformModule('backend/GraphPreferencesCommands.ts','saveGraphPreferences',{
    统计服务:class{async 获取图表偏好(){return structuredClone(value);}async 设置图表偏好(after){writes++;value=after;}}
  });
  const before=JSON.stringify(value);await save({futureDueShowBacklog:true,browserLinksSupported:false,cardCountsSeparateInactive:true,calendarFirstDayOfWeek:1},before);
  assert.equal(value.futureDueShowBacklog,true);assert.equal(value.browserLinksSupported,true);
  await assert.rejects(save(value,before),/changed/);assert.equal(writes,1);
});

test('JIDE graph writes expose three persisted fields and reject the read-only capability before saving',()=>{
  const writable={calendarFirstDayOfWeek:1,cardCountsSeparateInactive:true,futureDueShowBacklog:false};
  assert.equal(decodeWritablePreference('graph_preferences',JSON.stringify(writable)),JSON.stringify(writable));
  for(const browserLinksSupported of [false,true]) {
    assert.throws(()=>decodeWritablePreference('graph_preferences',JSON.stringify({...writable,browserLinksSupported})),/invalid_setting_value/);
  }
  assert.deepEqual(JSON.parse(graphPreferencesSnapshot({...writable,browserLinksSupported:true})),writable);
});

test('production study host delegates the exact rating and rejects background, stale, choice and recovery states',async()=>{
  const source=fs.readFileSync('entry/src/main/ets/pages/学习页.ets','utf8');
  const Page=componentMethods(source,['agentStudySnapshot','executeAgentStudy'],{});const page=new Page(),ratings=[];
  Object.assign(page,{mounted:true,sessionReady:true,foreground:true,页面已显示:true,agentStudyIdentity:'study',requestVersion:1,
    当前卡片:{cardId:21,noteId:11,deckId:1},阶段:'question',有音频:true,choiceQuestion:null,评分中:false,flipPending:false,
    cardRenderPending:false,editingPageOpen:false,studyGuideVisible:false,tapZonesGuideVisible:false,timeboxNotice:null,
    recoveryMessage:'',controllerReady:true,pendingHtml:'',customSchedulingWarning:false,stopStudyTimers(){},
    显示答案:async()=>{page.阶段='answer';},评分:async rating=>{ratings.push(rating);page.阶段='question';},playStudyAudio:async()=>{}});
  const before=page.agentStudySnapshot();assert.equal(JSON.parse(await page.executeAgentStudy('flip',before)).status,'completed');
  await assert.rejects(page.executeAgentStudy('good',before),/unavailable/);
  for(const [rating,index]of [['again',0],['hard',1],['good',2],['easy',3]]){page.阶段='answer';await page.executeAgentStudy(rating,page.agentStudySnapshot());assert.equal(ratings.at(-1),index);}
  for(const key of ['foreground','页面已显示']){page[key]=false;await assert.rejects(page.executeAgentStudy('replay',page.agentStudySnapshot()),/unavailable/);page[key]=true;}
  page.choiceQuestion={};await assert.rejects(page.executeAgentStudy('replay',page.agentStudySnapshot()),/unavailable/);page.choiceQuestion=null;
  page.待重渲染当前卡=true;await assert.rejects(page.executeAgentStudy('good',page.agentStudySnapshot()),/unavailable/);page.待重渲染当前卡=false;
  page.playStudyAudio=async(_autoplay,_manual,_target,outcome)=>{outcome.error='player failure';};
  await assert.rejects(page.executeAgentStudy('replay',page.agentStudySnapshot()),/player failure/);
  page.阶段='answer';page.评分=async()=>{page.recoveryMessage='refresh failed after submit';};assert.equal(JSON.parse(await page.executeAgentStudy('good',page.agentStudySnapshot())).status,'partial');
});

test('confirmed replay propagates the actual audio failure; manual playback keeps its original local feedback',async()=>{
  const source=fs.readFileSync('entry/src/main/ets/pages/学习页.ets','utf8');
  const Page=componentMethods(source,['playStudyAudio','isCurrentRequest'],{原始侧HTML:()=> 'audio',showToastSafely(){},$r:value=>value});const page=new Page();
  Object.assign(page,{已渲染:{},cardRenderPending:false,mounted:true,页面已显示:true,foreground:true,requestVersion:1,controllerReady:true,
    editingPageOpen:false,阶段:'question',studyOptions:{autoplay:true},reviewPreferences:{interruptAudioWhenAnswering:true},有音频:true,
    audioSession:{play:async()=>{throw Error('player failure');}},getUIContext:()=>({}),取文案:key=>key});
  const outcome={completed:false,error:''};
  await page.playStudyAudio(true,true,'',outcome);
  assert.equal(outcome.completed,false);assert.equal(outcome.error,'player failure');
  await assert.doesNotReject(page.playStudyAudio(true,true));
});
