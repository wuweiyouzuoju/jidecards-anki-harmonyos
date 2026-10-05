// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { APP_PAGE_ROUTES, APP_NAVIGATION_ACTIONS, appPageName, browserNavigationQuery, appNavigationRequested, validateAppNavigation, appNavigationStackBlockReason } from '../../entry/src/main/ets/model/navigation/AppNavigation.ts';
import { AgentAppNavigationSession, agentAppNavigationTools } from '../../entry/src/main/ets/model/agent/AgentAppNavigation.ts';
import { buildAgentAppStructure, agentInterfaceRevision } from '../../entry/src/main/ets/model/agent/AgentAppStructure.ts';
import { buildAgentRuntimeInstructions } from '../../entry/src/main/ets/model/agent/AgentSessionContext.ts';
import { agentFunctionTools } from '../../entry/src/main/ets/model/agent/AgentToolCatalog.ts';
import { toolRiskOf } from '../../entry/src/main/ets/model/agent/AgentPolicy.ts';
import { parseAgentToolJsonObject } from '../../entry/src/main/ets/model/agent/AgentToolSchemas.ts';
import { loadPlatformModule } from './platform-module-harness.mjs';

const context = { simple: true, agent: true, cloudDeck: false, themeHasTextures: false };
const read = path => readFileSync(new URL('../../entry/src/main/ets/' + path, import.meta.url), 'utf8');
function fixture() {
  const state = { visible: true, busy: false, blocked: false, deckName: '英语::四级', calls: [], reads: [], discovered: [4],
    noteIds: [8], cardIds: [9], missing: false, context: {...context}, names: ['AiCardPage'] };
  const session = new AgentAppNavigationSession({
    context: () => state.context, canNavigate: () => state.visible && !state.blocked,
    collectionBusy: () => state.busy,
    pathNames: () => state.names,
    assertReadableTarget: args => {
      for (const [key, ids] of [['deckId', state.discovered], ['noteId', state.noteIds], ['cardId', state.cardIds]]) {
        if (args[key] !== undefined && !ids.includes(args[key])) throw Error('readable_id_out_of_scope');
      }
    },
    readTarget: async args => {
      if (args.deckId !== undefined) { state.reads.push(args.deckId); if (!state.deckName) throw Error('navigation_deck_missing'); return state.deckName; }
      if (args.noteId !== undefined || args.cardId !== undefined) {
        state.reads.push(args.noteId ?? args.cardId); if (state.missing) throw Error('navigation_target_missing');
      }
      return '';
    },
    navigate: request => state.calls.push(request)
  });
  return { state, session, queue: args => session.queue(JSON.stringify(args)) };
}

test('navigation accepts real semantic actions and rejects arbitrary paths, IDs and incompatible fields', () => {
  const schema = JSON.parse(agentAppNavigationTools()[0].parametersJson);
  assert.deepEqual(schema.properties.action.enum, APP_NAVIGATION_ACTIONS.map(a => a.id));
  const values={deckId:4,noteId:8,cardId:9,sectionId:'appearance',query:'tag:important',notesMode:true};
  for(const action of APP_NAVIGATION_ACTIONS) {
    const args=Object.fromEntries(action.required.map(key=>[key,values[key]]));args.action=action.id;
    assert.equal(validateAppNavigation(args,context).id,action.id);
    assert.match(schema.properties.action.description,new RegExp(action.id+': required='+action.required.join(',')));
    for(const key of action.required) {
      const missing={...args};delete missing[key];assert.throws(()=>validateAppNavigation(missing,context),/invalid_navigation/);
      assert.throws(()=>validateAppNavigation({...args,[key]:undefined},context),/invalid_navigation/);
    }
    for(const key of Object.keys(values).filter(key=>!action.required.includes(key)&&!action.optional.includes(key))) {
      assert.throws(()=>validateAppNavigation({...args,[key]:values[key]},context),/invalid_navigation/);
    }
  }
  for (const args of [null, [], {}, {action:'rpc'}, {action:'start_study'}, {action:'start_study',deckId:0},
    {action:'open_stats',deckId:4}, {action:'open_browser',notesMode:'true'}, {action:'open_browser',query:'x'.repeat(1001)},
    {action:'open_settings',sectionId:'advanced'}, {action:'open_settings',sectionId:4},
    {action:'open_edit_note',noteId:-1}, {action:'open_edit_note',noteId:null}, {action:'open_card_preview',cardId:'9'},
    {action:'open_card_preview',cardId:1.5}, {action:'open_stats',name:'SettingsPage'}, {action:'open_stats',params:{apiKey:'secret'}}]) {
    assert.throws(() => validateAppNavigation(args, context));
  }
  assert.equal(validateAppNavigation({action:'open_settings',sectionId:'advanced'}, {...context,simple:false}).surface,'settings');
  assert.throws(() => validateAppNavigation({action:'open_settings',sectionId:'ai'}, {...context,agent:false}), /unavailable/);
  for (const text of ['开始四级牌组学习','进入设置的外观分组','打开浏览并搜索 tag:important','帮我复习四级','Take me to settings',
    '返回首页','预览这张卡片','打开这条笔记的编辑页','Preview this card','Back to home']) assert.equal(appNavigationRequested(text), true, text);
  for (const text of ['', '介绍开始学习的步骤','如何打开设置','不要打开统计','Do not open settings','介绍卡片预览','别返回首页']) assert.equal(appNavigationRequested(text), false, text);
});

test('navigation queues once, rechecks the deck and opens only after a successful reply', async () => {
  const f=fixture(); const generation=f.session.beginTurn('开始学习四级牌组');
  const queued=JSON.parse(await f.queue({action:'start_study',deckId:4}));
  assert.equal(queued.status,'queued');assert.equal(queued.completed,false);assert.equal(queued.deckName,'英语::四级');
  assert.deepEqual(f.state.calls,[]);
  await assert.rejects(f.queue({action:'open_stats'}),/already_queued/);
  f.state.deckName='英语::四级新版';
  await f.session.finish(true,generation);await f.session.finish(true,generation);
  assert.equal(f.state.calls.length,1);assert.equal(f.state.calls[0].deckName,'英语::四级新版');
  assert.deepEqual(f.state.reads,[4,4]);
});

test('readiness is fresh, does not discover targets or consume permission, and reflects per-action stack guards', async () => {
  const f=fixture();const action=id=>f.session.readiness().find(x=>x.action===id);
  assert.equal(action('open_stats').executionState,'ready');assert.deepEqual(f.state.reads,[]);
  await assert.rejects(f.queue({action:'open_stats'}),/user_request_required/);
  f.state.busy=true;assert.equal(action('open_stats').blockedReason,'navigation_collection_busy');
  f.state.busy=false;f.state.names=['StudyPage','AiCardPage'];
  assert.equal(action('start_study').blockedReason,'navigation_study_active');assert.equal(action('open_stats').executionState,'ready');
  for(const form of ['EditNotePage','AddNotePage']) {
    f.state.names=[form,'AiCardPage'];
    for(const item of APP_NAVIGATION_ACTIONS.filter(x=>x.resetsStack)) assert.equal(action(item.id).blockedReason,'navigation_unsaved_page');
    assert.equal(action('open_browser').executionState,'ready');
  }
  f.state.names=['BrowserPage'];assert.equal(action('open_stats').blockedReason,'navigation_unavailable');
  f.state.names=['AiCardPage'];f.state.blocked=true;assert.equal(action('open_stats').executionState,'blocked');
  f.state.blocked=false;f.session.beginTurn('打开统计');await f.queue({action:'open_stats'});
  assert.equal(action('open_stats').blockedReason,'navigation_already_queued');await f.session.finish(true);
  assert.equal(f.state.calls.length,1);
  const partial=new AgentAppNavigationSession({context:()=>context,canNavigate:()=>true,collectionBusy:()=>false,
    assertReadableTarget(){},readTarget:async()=>'',navigate(){}});
  assert.ok(partial.readiness().every(x=>x.executionState==='unknown'));
});

test('deck detail and options requests require discovered targets and preserve forms even when the stack changes after queuing', async () => {
  for(const action of ['open_deck_details','open_deck_options']) {
    const f=fixture();f.session.beginTurn('打开四级牌组选项和详情');
    await assert.rejects(f.queue({action,deckId:99}),/out_of_scope/);
    await f.queue({action,deckId:4});f.state.names=['AddNotePage','AiCardPage'];
    await assert.rejects(f.session.finish(true),/unsaved_page/);assert.deepEqual(f.state.calls,[]);
    const ready=fixture();ready.session.beginTurn('打开四级牌组');await ready.queue({action,deckId:4});
    await ready.session.finish(true);assert.equal(ready.state.calls[0].action,action);assert.deepEqual(ready.state.reads,[4,4]);
  }
});

test('asynchronous reads recheck changed modes and stacks before queuing or navigating', async () => {
  for(const phase of ['queue','finish']) for(const change of ['section','stack']) {
    let release,waiting=false;let current={...context,simple:false};let names=['AiCardPage'];const calls=[];
    const session=new AgentAppNavigationSession({context:()=>current,canNavigate:()=>true,collectionBusy:()=>false,pathNames:()=>names,
      assertReadableTarget(){},readTarget:async()=>waiting?new Promise(r=>release=r):'',navigate:x=>calls.push(x)});
    session.beginTurn('打开高级设置，返回首页');
    const args=change==='section'?{action:'open_settings',sectionId:'advanced'}:{action:'open_home'};
    if(phase==='finish')await session.queue(JSON.stringify(args));
    waiting=true;const pending=phase==='queue'?session.queue(JSON.stringify(args)):session.finish(true);
    if(change==='section')current.simple=true;else names=['EditNotePage','AiCardPage'];
    release('');await assert.rejects(pending,change==='section'?/section_unavailable/:/unsaved_page/);assert.deepEqual(calls,[]);
  }
});

test('note editing and card preview use discovered IDs and recheck their existence without escalating write scope', async () => {
  for(const args of [{action:'open_edit_note',noteId:8},{action:'open_card_preview',cardId:9}]) {
    const f=fixture();const generation=f.session.beginTurn('打开笔记编辑并预览卡片');
    const output=JSON.parse(await f.queue(args));assert.equal(output.completed,false);assert.deepEqual(f.state.calls,[]);
    assert.equal(output.noteId??output.cardId,args.noteId??args.cardId);
    await f.session.finish(true,generation);assert.deepEqual(f.state.reads,[args.noteId??args.cardId,args.noteId??args.cardId]);
    assert.equal(f.state.calls.length,1);
    const deleted=fixture();deleted.session.beginTurn('预览卡片，打开编辑');await deleted.queue(args);
    deleted.state.missing=true;await assert.rejects(deleted.session.finish(true),/target_missing/);assert.deepEqual(deleted.state.calls,[]);
    const unknown=fixture();unknown.session.beginTurn('打开编辑，预览卡片');
    await assert.rejects(unknown.queue({...args,[args.noteId===undefined?'cardId':'noteId']:100}),/out_of_scope/);
  }
});

test('the real target adapter reads exact objects but never serializes their fields or invokes a writer', async () => {
  const calls=[];let current=8;
  const readTarget=loadPlatformModule('backend/agent/AgentAppNavigationTools.ets','readNavigationTarget',{
    牌组服务:class {async 获取牌组树(){return {deckId:0,name:'',children:[{deckId:4,name:'Deck',children:[]}]};}},
    笔记服务:class {async 获取笔记(id){calls.push(['note',id]);return {id:current,fields:['secret'],tags:['private']};}保存(){throw Error('write_forbidden');}},
    卡片服务:class {async 获取卡片(id){calls.push(['card',id]);return {id:current,noteId:8};}更新卡片(){throw Error('write_forbidden');}}
  });
  assert.equal(await readTarget({action:'open_edit_note',noteId:8}),'');
  current=9;assert.equal(await readTarget({action:'open_card_preview',cardId:9}),'');
  assert.equal(await readTarget({action:'start_study',deckId:4}),'Deck');
  assert.equal(await readTarget({action:'open_home'}),'');
  assert.deepEqual(calls,[['note',8],['card',9]]);
  current=0;await assert.rejects(readTarget({action:'open_card_preview',cardId:9}),/target_missing/);
  await assert.rejects(readTarget({action:'open_edit_note',noteId:8}),/target_missing/);
});

test('unknown decks, cancellation, failed replies, hidden pages, pending drafts, busy collections and changed sections prevent navigation', async () => {
  const f=fixture();f.session.beginTurn('开始学习');
  await assert.rejects(f.queue({action:'start_study',deckId:99}),/out_of_scope/);
  f.session.beginTurn('介绍学习功能');
  await assert.rejects(f.queue({action:'start_study',deckId:4}),/user_request_required/);
  for (const reason of ['failure','cancel','hidden','draft','busy','missing','section']) {
    const p=fixture();p.session.beginTurn('打开设置，开始学习');
    if (reason==='section') { p.state.context.simple=false;await p.queue({action:'open_settings',sectionId:'advanced'});p.state.context.simple=true; }
    else await p.queue({action:'start_study',deckId:4});
    if(reason==='cancel')p.session.cancel();
    if(reason==='hidden')p.state.visible=false;
    if(reason==='draft')p.state.blocked=true;
    if(reason==='busy')p.state.busy=true;
    if(reason==='missing')p.state.deckName='';
    if(['hidden','draft','busy','missing','section'].includes(reason)) await assert.rejects(p.session.finish(true));
    else await p.session.finish(reason!=='failure');
    assert.deepEqual(p.state.calls,[],reason);
  }
});

test('late deck reads and the previous turn finalizer cannot navigate or consume a new turn request', async () => {
  let resolve; const calls=[];
  const session=new AgentAppNavigationSession({context:()=>context,canNavigate:()=>true,collectionBusy:()=>false,
    assertReadableTarget(){},readTarget:()=>new Promise(r=>resolve=r),navigate:r=>calls.push(r)});
  session.beginTurn('开始学习');const queued=session.queue('{"action":"start_study","deckId":4}');
  session.cancel();resolve('Deck');await assert.rejects(queued,/cancelled/);assert.deepEqual(calls,[]);
  const f=fixture();const first=f.session.beginTurn('打开统计');await f.queue({action:'open_stats'});
  const second=f.session.beginTurn('打开提醒');await f.queue({action:'open_reminders'});
  await f.session.finish(true,first);assert.deepEqual(f.state.calls,[]);
  await f.session.finish(true,second);assert.equal(f.state.calls[0].surface,'reminders');
});

test('registry treats navigation as its own permission class and never creates a card draft or action approval', async () => {
  const Registry=loadPlatformModule('backend/agent/AgentToolRegistry.ets','AgentToolRegistry',
    {toolRiskOf,parseAgentToolJsonObject});
  const Adapter=loadPlatformModule('backend/agent/AgentAppNavigationTools.ets','AgentAppNavigationTools',{});
  const f=fixture();f.session.beginTurn('打开统计');const registry=new Registry();new Adapter(f.session).register(registry);
  assert.throws(()=>registry.registerRead('navigate_app',{}),/registration_rejected/);
  assert.throws(()=>registry.registerNavigation('remove_deck',{}),/registration_rejected/);
  assert.throws(()=>registry.registerDraft('navigate_app',{}),/registration_rejected/);
  const result=await registry.execute({id:'nav-1',name:'navigate_app',argumentsJson:'{"action":"open_stats"}'});
  assert.equal(result.draft,null);assert.equal(result.clarification,null);assert.equal(result.action,undefined);
  assert.equal(JSON.parse(result.outputJson).status,'queued');assert.deepEqual(f.state.calls,[]);
  await f.session.finish(true);assert.equal(f.state.calls[0].surface,'stats');
});

test('app cognition is rebuilt from shared routes and actual current tools on every request', () => {
  const tools=agentFunctionTools(100,'assistant');const limits={maxProviderCalls:8,maxToolCalls:40};
  const old=agentInterfaceRevision(tools);
  const structure=buildAgentAppStructure(context,'app','',key=>key,[],tools,[]);
  assert.equal(structure.revision,old);assert.equal(structure.destinations.length,APP_PAGE_ROUTES.length);
  assert.equal(structure.actions.length,APP_NAVIGATION_ACTIONS.length);assert.ok(structure.actions.every(a=>a.available&&a.tool==='navigate_app'));
  for(const action of APP_NAVIGATION_ACTIONS) {
    const declared=structure.actions.find(a=>a.id===action.id);
    assert.deepEqual(declared.requiredArguments,action.required);assert.deepEqual(declared.optionalArguments,action.optional);
    assert.equal(declared.requiresDeck,action.required.includes('deckId'));
  }
  const disabled=buildAgentAppStructure(context,'app','',key=>key,[],[],[]);
  assert.ok(disabled.actions.every(a=>!a.available&&a.tool===''));assert.notEqual(disabled.revision,old);
  APP_PAGE_ROUTES.push({surface:'future_page',name:'FuturePage',titleKey:'future_title'});
  try {
    const fresh=buildAgentAppStructure(context,'app','',key=>key,[],tools,[]);
    assert.notEqual(fresh.revision,old);assert.equal(fresh.destinations.at(-1).detailed,false);
    assert.match(buildAgentRuntimeInstructions(tools,0,0,limits),/future_page/);
  } finally { APP_PAGE_ROUTES.pop(); }
  const browser=APP_NAVIGATION_ACTIONS.find(a=>a.id==='open_browser');browser.optional.push('noteId');
  try {
    const fresh=buildAgentAppStructure(context,'app','',key=>key,[],tools,[]);
    assert.notEqual(fresh.revision,old);assert.ok(fresh.actions.find(a=>a.id==='open_browser').optionalArguments.includes('noteId'));
    assert.match(JSON.parse(agentAppNavigationTools()[0].parametersJson).properties.action.description,/open_browser: required=; optional=deckId,query,notesMode,noteId/);
    assert.equal(validateAppNavigation({action:'open_browser',noteId:8},context).id,'open_browser');
  } finally { browser.optional.pop(); }
});

test('the real browser initial search opens preview only for its current successful card result', async () => {
  const source=read('pages/浏览页.ets');const start=source.indexOf('  async aboutToAppear(');
  const method=source.slice(start,source.indexOf('\n  }',start)+4);
  const events=[];const Page=new Function('CustomTransition','加载主题模式',stripTypeScriptTypes('class Page {'+method+'}',{mode:'transform'})+';return Page;')
    ({getInstance:()=>({注册NavParam(){}})},async()=>'system');
  for(const mode of ['success','missing','error','notes','superseded','disposed','ordinary']) {
    const page=new Page();let alive=true;
    Object.assign(page,{pageInitialSearch:'cid:9',pageInitialNotesMode:mode==='notes',pageSelectForAgentEdit:false,
      pageInitialPreviewCardId:mode==='ordinary'?0:9,searchVersion:0,浏览模式值:'cards',阶段:'loading',结果ID列表:[],
      operations:{isAlive:()=>alive},publishInterface(){},loadFlagLabels(){},加载牌组树:async()=>{},打开预览:id=>events.push([mode,id]),
      执行搜索:async()=>{page.searchVersion++;await Promise.resolve();page.结果ID列表=mode==='missing'?[]:[9];
        page.阶段=mode==='error'?'error':'list';if(mode==='superseded')page.searchVersion++;if(mode==='disposed')alive=false;}
    });
    await page.aboutToAppear();assert.equal(page.搜索文本,'cid:9');
  }
  assert.deepEqual(events,[['success',9]]);
});

function homeNavigation() {
  const source=read('pages/首页.ets');
  const methods=['navigateAgentApp','选择牌组','按ID查牌组','选中牌组'].map(name=>{
    const start=source.indexOf('  private '+name+'(');return source.slice(start,source.indexOf('\n  }',start)+4);
  }).join('\n');
  const state={calls:[],names:['AiCardPage'],busy:false,expanded:[],remembered:[],cancelled:0,stopped:0};
  const deps={appPageName,browserNavigationQuery,appNavigationStackBlockReason,syncActivity:{isCollectionBusy:()=>state.busy},
    空牌组汇总:{id:''},保存上次牌组ID:async id=>{state.remembered.push(id);}};
  const Page=new Function(...Object.keys(deps),stripTypeScriptTypes('class Page {'+methods+'}',{mode:'transform'})+';return Page;')(...Object.values(deps));
  const page=new Page();Object.assign(page,{homeDisposed:false,syncForeground:true,statsSnapshot:{graphs:null,days:365},
    deckOptionsBusy:false,显示牌组选项:false,当前断点:'xs',主页快照数据:{decks:[{id:'4',name:'英语::四级'}]},
    syncController:{cancel(){state.cancelled++;}},展开牌组路径:deck=>state.expanded.push(deck.id),
    显示牌组详情:true,页面栈:{getAllPathName:()=>state.names,pushPath:path=>state.calls.push(path),clear:()=>state.calls.push({home:true})},
    stopAutoSyncTimer(){state.stopped++;},暂停主页官方公告检查(){},返回主页后刷新(){state.refreshed=true;}});
  return {page,state};
}

test('real root navigation opens every declared destination with real deck/search/section parameters and rejects a duplicate study session', () => {
  const f=homeNavigation();
  for (const action of APP_NAVIGATION_ACTIONS) {
    f.page.navigateAgentApp({action:action.id,surface:action.surface,deckId:4,noteId:8,cardId:9,deckName:'英语::四级',query:'tag:important',notesMode:true,sectionId:'appearance'});
    const path=f.state.calls.at(-1);
    if(action.id==='open_home') { assert.deepEqual(path,{home:true});assert.equal(f.page.显示牌组详情,false);assert.equal(f.state.refreshed,true);continue; }
    if(action.id==='open_deck_details'||action.id==='open_deck_options') {
      assert.deepEqual(path,{home:true});assert.equal(f.page.选中的牌组ID,'4');assert.equal(f.page.显示牌组详情,true);
      assert.equal(f.state.expanded.at(-1),'4');assert.equal(f.state.remembered.at(-1),'4');
      assert.equal(f.page.显示牌组选项,action.id==='open_deck_options');
      if(action.id==='open_deck_options'){assert.equal(f.page.牌组选项牌组ID,4);assert.equal(f.page.牌组选项牌组名,'英语::四级');}
      continue;
    }
    assert.equal(path.name,appPageName(action.surface));assert.equal(typeof path.onPop,'function');
    if(action.required.includes('deckId')){assert.equal(path.param.deckId,'4');assert.equal(path.param.deckName,'英语::四级');}
    if(action.id==='open_browser'){assert.equal(path.param.initialSearch,'did:4 (tag:important)');assert.equal(path.param.initialNotesMode,true);}
    if(action.id==='open_settings')assert.equal(path.param.sectionId,'appearance');
    if(action.id==='open_stats')assert.equal(path.param,f.page.statsSnapshot);
    if(action.id==='open_edit_note')assert.deepEqual(path.param,{targetId:8,isNote:true});
    if(action.id==='open_card_preview')assert.deepEqual(path.param,{initialSearch:'cid:9',initialPreviewCardId:9});
  }
  const before=f.state.calls.length;f.state.names=['StudyPage','AiCardPage'];
  assert.throws(()=>f.page.navigateAgentApp({action:'start_study',deckId:4}),/study_active/);
  for(const form of ['EditNotePage','AddNotePage']) {
    f.state.names=[form,'AiCardPage'];
    for(const action of APP_NAVIGATION_ACTIONS.filter(x=>x.resetsStack))assert.throws(()=>f.page.navigateAgentApp({action:action.id,deckId:4}),/unsaved_page/);
  }
  f.state.busy=true;assert.throws(()=>f.page.navigateAgentApp({action:'open_stats'}),/unavailable/);
  f.state.busy=false;f.state.names=['BrowserPage'];assert.throws(()=>f.page.navigateAgentApp({action:'open_stats'}),/unavailable/);
  assert.equal(f.state.calls.length,before);
});

test('root deck navigation rejects unavailable targets and open forms before any side effect, while wide layouts select the existing detail pane', () => {
  for(const action of ['open_deck_details','open_deck_options']) for(const reason of ['missing','busy','open']) {
    const f=homeNavigation();
    if(reason==='missing')f.page.主页快照数据.decks=[];
    if(reason==='busy')f.page.deckOptionsBusy=true;
    if(reason==='open')f.page.显示牌组选项=true;
    assert.throws(()=>f.page.navigateAgentApp({action,deckId:4}),/unavailable/);
    assert.equal(f.state.stopped,0);assert.equal(f.state.cancelled,0);assert.deepEqual(f.state.calls,[]);assert.deepEqual(f.state.remembered,[]);
  }
  const wide=homeNavigation();wide.page.当前断点='md';wide.page.显示牌组详情=false;
  wide.page.navigateAgentApp({action:'open_deck_details',deckId:4,deckName:'英语::四级'});
  assert.equal(wide.page.选中的牌组ID,'4');assert.equal(wide.page.显示牌组详情,false);assert.deepEqual(wide.state.calls,[{home:true}]);
});

test('the actual hidden-page callback cancels navigation and clears foreground ownership', () => {
  const source=read('pages/AI制卡页.ets');const body=source.match(/\.onHidden\(\(\): void => \{([^\n]+)\}\)/)[1];
  let cancelled=0;const events=[];const page={isAgentPageVisible:true,navigationSession:{cancel:()=>cancelled++}};
  new Function('appInterface',body).call(page,{hidePage:id=>events.push(id)});
  assert.equal(cancelled,1);assert.equal(page.isAgentPageVisible,false);assert.deepEqual(events,['agent']);
});

test('the actual JIDE host protects newly typed input and grants only discovered navigation targets', () => {
  const source=read('pages/AI制卡页.ets');
  const start=source.indexOf('        canNavigate:');const end=source.indexOf('        collectionBusy:',start);
  const create=new Function('AppStorage','APP_FOREGROUND_KEY',stripTypeScriptTypes('const host=({'+source.slice(start,end)+'});',{mode:'transform'})+'return host;');
  const page={pageDisposed:false,isAgentPageVisible:true,cardBatch:{isRunning:()=>false},hasPendingAction:()=>false,
    hasPendingClarification:()=>false,文件解析中:false,themeUndoBusy:false,targetSelectionBusy:false,targetSelectionMessage:-1,
    显示历史区:false,输入草稿:'',消息列表:[]};
  const host=create.call(page,{get:()=>true},'foreground');assert.equal(host.canNavigate(),true);
  page.输入草稿='下一条还没发送的消息';assert.equal(host.canNavigate(),false);page.输入草稿='';
  page.消息列表=[{变更草稿列表:[{status:'pending'}]}];assert.equal(host.canNavigate(),false);
  const scopeStart=source.indexOf('        assertReadableTarget:');const scopeEnd=source.indexOf('        readTarget:',scopeStart);
  const scopes=[];const scopedPage={agentScope:{assertReadableDeckIds:ids=>scopes.push(['deck',ids]),
    assertReadableNoteIds:ids=>scopes.push(['note',ids]),assertReadableCardIds:ids=>scopes.push(['card',ids])}};
  const target=new Function(stripTypeScriptTypes('const host=({'+source.slice(scopeStart,scopeEnd)+'});',{mode:'transform'})+'return host;').call(scopedPage);
  for(const args of [{deckId:4},{noteId:8},{cardId:9},{}])target.assertReadableTarget(args);
  assert.deepEqual(scopes,[['deck',[4]],['note',[8]],['card',[9]]]);
});

test('the real JIDE turn finalizer saves history before navigation and discards failed, paused, hidden or superseded requests', async () => {
  const source=read('pages/AI制卡页.ets');const start=source.indexOf('  private async runAgentTurn(');
  const body=source.slice(start,source.indexOf('\n  }',start)+4);
  const deps={
    explicitYearClozeRequested:()=>false,explicitWebSearchForbidden:()=>true,
    explicitWebSearchRequested:()=>false,explicitSourceEvidenceRequested:()=>false,inferRequestedCardCount:()=>0,
    页面Agent观察者:class {constructor(callback){this.onEvent=callback;}},
    appendAgentTimelineText:(timeline,kind,text)=>timeline.push({kind,text}),$r:key=>key
  };
  const Page=new Function(...Object.keys(deps),stripTypeScriptTypes('class Page {'+body+'}',{mode:'transform'})+';return Page;')(...Object.values(deps));
  for (const mode of ['completed','failed','paused','awaiting_clarification','hidden','superseded','unsaved_form']) {
    const page=new Page(),events=[],opened=[];let seq=0;
    const nav=new AgentAppNavigationSession({context:()=>context,canNavigate:()=>true,collectionBusy:()=>false,
      assertReadableTarget(){},readTarget:async()=>'',navigate:request=>{
        if(mode==='unsaved_form')throw Error('navigation_unsaved_page');events.push('navigate');opened.push(request);}});
    Object.assign(page,{pageDisposed:false,cardBatch:{isRunning:()=>false},处理中:false,themeUndoBusy:false,
      agentRunner:{},navigationSession:nav,agentScope:{configureCreateConstraints(){}},documentAccess:null,
      pageMode:'assistant',消息列表:[],conversationId:'conversation',agentTurnVersion:0,AI配置:{},agentSettings:{batchLimit:100},
      重建本轮AgentScope(){},storeClarificationAnswerMessageId(){},currentModelSupportsImages:()=>false,
      空消息:(role,text)=>({id:++seq,角色:role,正文:text,providerText:'',timeline:[],变更草稿列表:[]}),
      追加消息:message=>page.消息列表.push(message),更新消息:(index,update)=>update(page.消息列表[index]),
      currentMessageIndex:(_conversation,id)=>page.消息列表.findIndex(message=>message.id===id),
      providerFunctionToolsForTurn:()=>[],构建Agent指令:()=>'',构建Provider输入:()=>[],处理Agent事件(){},
      syncSessionTarget:async()=>{},接收Agent草稿(){},取Agent错误文案:error=>error.message,
      取本地化文案:key=>key,取本地化格式:(key,args)=>key+':'+args.join(','),
      保存当前会话历史:async()=>{
        events.push('saved');assert.deepEqual(opened,[]);
        if(mode==='hidden')nav.cancel();
        if(mode==='superseded'){nav.beginTurn('打开提醒');await nav.queue('{"action":"open_reminders"}');}
      },
      sessionController:{run:async()=>{
        await nav.queue('{"action":"open_stats"}');events.push('queued');assert.deepEqual(opened,[]);
        if(mode==='failed')throw Error('provider_failed');
        return {status:['hidden','superseded','unsaved_form'].includes(mode)?'completed':mode,drafts:[]};
      }}
    });
    await page.runAgentTurn('打开统计','打开统计');
    assert.equal(page.处理中,false);assert.equal(page.消息列表.at(-1).streaming,false);
    if(mode==='completed'){assert.deepEqual(events,['queued','saved','navigate']);assert.equal(opened[0].surface,'stats');}
    else assert.deepEqual(opened,[],mode);
    if(mode==='superseded'){await nav.finish(true);assert.equal(opened[0].surface,'reminders');}
    if(mode==='unsaved_form') {
      assert.match(page.消息列表.at(-1).正文,/ai_agent_navigation_unsaved/);assert.deepEqual(events,['queued','saved','saved']);
    }
  }
});
