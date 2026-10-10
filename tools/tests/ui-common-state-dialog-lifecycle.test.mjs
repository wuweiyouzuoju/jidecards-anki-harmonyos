// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { loadComponentLogic, nativeDialogMembers, nativeDialogHostClass } from './platform-module-harness.mjs';
import { componentMethods, settle } from './sync-panel-harness.mjs';
import { surfaceMotionApi } from './motion-harness.mjs';
import { CollectionHistorySession, CollectionHistoryState } from '../../entry/src/main/ets/model/CollectionHistorySession.ts';
import { parseBrowserSavedSearches, removeBrowserSavedSearch, serializeBrowserSavedSearches, upsertBrowserSavedSearch } from '../../entry/src/main/ets/model/BrowserSidebar.ts';
import { BrowserOperationController } from '../../entry/src/main/ets/model/BrowserOperationController.ts';
const read=path=>readFileSync(new URL('../../entry/src/main/ets/'+path,import.meta.url),'utf8');
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};

function emptyCards(){
  const dialogs=[],deletes=[],events=[];let reads=0;
  const rows=[{笔记ID:1,卡片IDs:[11,12]},{笔记ID:2,卡片IDs:[21]}];
  const backend={获取空卡报告:async()=>({笔记列表:++reads===1?rows:[]})};
  const Panel=loadComponentLogic('components/settings/空卡列表面板.ets','空卡列表面板',{
    THEME_TEXT_COLORS_KEY:'theme',颜色键:{主色按钮背景:'color'},
    卡片渲染服务:class{constructor(){return backend;}},卡片服务:class{async 删除卡片(ids){deletes.push(ids);}},
    AppStorage:{setOrCreate:()=>events.push('committed')},$r:key=>key,resourceText:(_,key)=>key,DialogAlignment:{Center:0}
  });
  const item=new Panel();item.getUIContext=()=>({showAlertDialog:options=>dialogs.push(options)});
  item.onClose=()=>events.push('close');return {item,backend,dialogs,deletes,events,get reads(){return reads;}};
}

test('empty-card confirmation freezes IDs, commits once and actually refreshes the remaining report',async()=>{
  const h=emptyCards();await h.item.执行检查();h.item.选中状态=[true,false];
  h.item.确认删除();h.item.确认删除();assert.equal(h.dialogs.length,1);
  h.item.选中状态=[false,true];h.dialogs[0].secondaryButton.action();await settle();
  h.dialogs[0].secondaryButton.action();await settle();
  assert.deepEqual(h.deletes,[[11,12]]);assert.equal(h.reads,2);
  assert.deepEqual(h.item.笔记列表,[]);assert.equal(h.item.处理中,false);assert.deepEqual(h.events,['committed']);
});

test('empty-card reads can close and late confirmations cannot start deletion after disposal or cancellation',async()=>{
  const h=emptyCards(),pending=deferred();h.backend.获取空卡报告=()=>pending.promise;
  const work=h.item.执行检查();h.item.handleBackRequest();assert.deepEqual(h.events,['close']);
  h.item.aboutToDisappear();pending.resolve({笔记列表:[{笔记ID:3,卡片IDs:[31]}]});await work;
  assert.deepEqual(h.item.笔记列表,[]);
  for(const cancel of [true,false]){
    const next=emptyCards();await next.item.执行检查();next.item.选中状态=[true,false];next.item.确认删除();
    if(cancel)next.dialogs[0].cancel();else next.item.aboutToDisappear();
    next.dialogs[0].secondaryButton.action();await settle();assert.deepEqual(next.deletes,[]);
  }
});

test('filtered-deck accepted input is frozen before the template read and finishes without departed UI callbacks',async()=>{
  const pending=deferred(),writes=[],events=[];
  const Form=loadComponentLogic('components/home/创建过滤牌组面板.ets','创建过滤牌组面板',{
    颜色键:{主色按钮背景:'color'},过滤牌组排序:{添加顺序:0},
    牌组服务:class{获取或创建过滤牌组(){return pending.promise;}async 添加或更新过滤牌组(value){writes.push(value);}},
    AppStorage:{setOrCreate:()=>events.push('committed')},$r:key=>key,resourceText:(_,key)=>key,
    showToastSafely:()=>events.push('toast')
  });
  const form=new Form();form.getUIContext=()=>({});form.onSuccess=()=>events.push('success');form.onClose=()=>events.push('close');
  form.搜索串='original';form.数量上限='12';form.排序值=4;form.调整调度=true;
  const work=form.执行创建();form.搜索串='late';form.排序值=0;form.调整调度=false;form.aboutToDisappear();
  pending.resolve({config:{}});await work;
  assert.deepEqual(writes[0].config,{reschedule:true,searchTerms:[{search:'original',limit:12,order:4}]});
  assert.deepEqual(events,['committed']);await form.执行创建();assert.equal(writes.length,1);
});

test('reposition closes while defaults load but protects an accepted write and disposed callbacks',()=>{
  const Dialog=loadComponentLogic('components/browser/BrowserRepositionDialog.ets','BrowserRepositionDialog',{});
  const item=new Dialog();let closed=0;item.onClose=()=>closed++;
  item.handleBackRequest();assert.equal(closed,1);item.busy=true;item.handleBackRequest();assert.equal(closed,1);
  item.disposed=true;item.busy=false;item.handleBackRequest();assert.equal(closed,1);
});

test('server dialog save and close callbacks belong to their original native window',()=>{
  const source=read('components/settings/同步分组.ets'),events=[];
  const dependencies={NativeDialogHost:nativeDialogHostClass(surfaceMotionApi()),
    CustomDialogController:class{constructor(options){this.options=options;}open(){}close(){}},自定义服务器弹窗:props=>props};
  const Host=new Function(...Object.keys(dependencies),stripTypeScriptTypes(
    `class Host { ${nativeDialogMembers(source)} }`,{mode:'transform'})+';return Host;')(...Object.values(dependencies));
  const owner=new Host();owner.saveServer=()=>events.push('save');owner.closeServerDialog=()=>owner.serverDialogController.close();
  const host=owner.serverDialogController;host.open(owner.createServerDialog);const old=host.current().options.builder;
  old.onClose();host.open(owner.createServerDialog);const next=host.current();old.onSave();old.onClose();
  assert.deepEqual(events,[]);assert.equal(host.current(),next);next.options.builder.onSave();assert.deepEqual(events,['save']);
  host.dispose();next.options.builder.onSave();assert.deepEqual(events,['save']);
});

function draftConfirmation(risk='write'){
  const dialogs=[],events=[],draft={id:'original',risk,status:'pending',summary:''};
  const Page=componentMethods(read('pages/AI制卡页.ets'),[
    'isCurrentDraft','准备执行草稿','打开高风险最终确认','执行普通草稿','执行高风险草稿'
  ],{$r:key=>key});
  const page=new Page();Object.assign(page,{pageDisposed:false,draftConfirmationPending:false,消息列表:[{变更草稿列表:[draft]}],
    getUIContext:()=>({showAlertDialog:options=>dialogs.push(options)}),取本地化文案:key=>key,影响范围:()=>'',
    记录草稿错误:()=>events.push('error'),记录执行结果:()=>events.push('result'),
    agentExecutor:{prepare:async value=>{value.status='prepared';return {draft:value,firstToken:'first'};},
      authorizeHighRisk:()=>{events.push('authorize');return 'second';},
      executeOrdinary:async()=>events.push('write'),executeHighRisk:async()=>events.push('write')}
  });return {page,draft,dialogs,events};
}

test('AI confirmations reject departed pages, replaced drafts and repeated or canceled acceptance',async()=>{
  for(const mode of ['depart','replace','edit','cancel','repeat']){
    const h=draftConfirmation();await h.page.准备执行草稿(0,0);
    if(mode==='depart')h.page.pageDisposed=true;
    if(mode==='replace')h.page.消息列表=[{变更草稿列表:[{id:'new'}]}];
    if(mode==='edit')h.page.消息列表=[{变更草稿列表:[{...h.draft,operations:[{after:'new'}]}]}];
    if(mode==='cancel')h.dialogs[0].primaryButton.action();
    h.dialogs[0].secondaryButton.action();await settle();h.dialogs[0].secondaryButton.action();await settle();
    assert.equal(h.events.filter(event=>event==='write').length,mode==='repeat'?1:0,mode);
  }
  const h=draftConfirmation('high_risk');await h.page.准备执行草稿(0,0);h.dialogs[0].secondaryButton.action();
  assert.equal(h.dialogs.length,2);h.page.pageDisposed=true;h.dialogs[1].secondaryButton.action();await settle();
  assert.deepEqual(h.events,['authorize']);
});

test('AI baseline reads cannot show a new confirmation after the page leaves',async()=>{
  const h=draftConfirmation(),pending=deferred();h.page.agentExecutor.prepare=()=>pending.promise;
  const work=h.page.准备执行草稿(0,0);h.page.pageDisposed=true;pending.resolve({draft:h.draft});await work;
  assert.equal(h.dialogs.length,0);
});

test('AI preparation and both confirmation levels hold one slot; cloned drafts cancel and failed windows can retry',async()=>{
  const h=draftConfirmation('high_risk'),gate=deferred();let prepares=0;
  const prepare=h.page.agentExecutor.prepare;h.page.agentExecutor.prepare=async draft=>{prepares++;await gate.promise;return prepare(draft);};
  const first=h.page.准备执行草稿(0,0);await h.page.准备执行草稿(0,0);assert.equal(prepares,1);
  gate.resolve();await first;assert.equal(h.dialogs.length,1);
  h.dialogs[0].secondaryButton.action();h.dialogs[0].secondaryButton.action();
  assert.equal(h.dialogs.length,2);assert.equal(h.page.draftConfirmationPending,true);
  h.page.消息列表=[{变更草稿列表:[{...h.draft}]}];h.dialogs[1].primaryButton.action();
  assert.equal(h.page.draftConfirmationPending,false);assert.equal(h.page.消息列表[0].变更草稿列表[0].status,'pending');
  await h.page.准备执行草稿(0,0);assert.equal(h.dialogs.length,3);
  const failure=draftConfirmation();failure.page.getUIContext=()=>({showAlertDialog(){throw Error('window');}});
  await failure.page.准备执行草稿(0,0);assert.equal(failure.page.draftConfirmationPending,false);assert.equal(failure.draft.status,'pending');
  failure.page.getUIContext=()=>({showAlertDialog:options=>failure.dialogs.push(options)});
  await failure.page.准备执行草稿(0,0);assert.equal(failure.dialogs.length,1);
});

test('history read dismissal releases parent busy state and suppresses late read publication',async()=>{
  const gate=deferred(),events=[];
  const Dialog=loadComponentLogic('components/CollectionHistoryDialog.ets','CollectionHistoryDialog',{
    CollectionHistorySession,CollectionHistoryState,AnkiCollectionHistoryBackend:class{status(){return gate.promise;}},
    appInterface:{observe(){},leave(){}},$r:key=>key
  });
  const item=new Dialog();item.onBusy=busy=>events.push(busy);item.onClose=()=>events.push('close');
  item.aboutToAppear();await settle();item.handleBack();assert.deepEqual(events,[true,'close']);
  item.aboutToDisappear();assert.equal(events.at(-1),false);gate.resolve({undo:'late',redo:'',lastStep:1});await settle();
  assert.deepEqual(events,[true,'close',false]);assert.equal(item.state.status,null);
});

test('notetype mapping read loading can close while accepted changes remain protected',()=>{
  const Dialog=componentMethods(read('components/browser/BrowserNotetypeFeature.ets'),['handleBackRequest','submit','aboutToDisappear'],{});
  const item=new Dialog(),events=[];Object.assign(item,{disposed:false,busy:false,state:{busy:true},session:null,onClose:()=>events.push('close')});
  item.handleBackRequest();item.busy=true;item.handleBackRequest();item.busy=false;item.aboutToDisappear();item.handleBackRequest();
  assert.deepEqual(events,['close']);
});

test('accepted redemption persists without mutating the departed sheet or showing a celebration',async()=>{
  const gate=deferred();let writes=0;
  const Panel=loadComponentLogic('components/settings/RedemptionPanel.ets','RedemptionPanel',{
    颜色键:{动作主色:'primary'},parseRedemption:()=>null,redeemContent:()=>{writes++;return gate.promise;},$r:key=>key
  });
  const item=new Panel();Object.assign(item,{active:true,expanded:true,code:'accepted'});
  const work=item.redeem();item.aboutToDisappear();gate.resolve('success');await work;
  assert.equal(writes,1);assert.equal(item.unlocked,false);assert.equal(item.showCelebration,false);assert.equal(item.message,'');
  await item.redeem();assert.equal(writes,1);
});

test('saved-search deletion rejects departed, canceled and repeated confirmations',async()=>{
  const Page=componentMethods(read('pages/浏览页.ets'),['请求删除保存搜索','删除保存搜索'],{
    parseBrowserSavedSearches,removeBrowserSavedSearch,serializeBrowserSavedSearches,$r:key=>key
  });
  for(const mode of ['depart','cancel','live']){
    const page=new Page(),dialogs=[],writes=[];Object.assign(page,{operations:new BrowserOperationController(),保存搜索忙碌:false,
      getUIContext:()=>({showAlertDialog:options=>dialogs.push(options)}),取本地化文案:key=>key,
      sidebarBackend:{savedSearches:async()=>'{"saved":"is:due"}',saveSavedSearches:async json=>writes.push(json)}});
    page.请求删除保存搜索({name:'saved',search:'is:due'});
    if(mode==='depart')page.operations.dispose();if(mode==='cancel')dialogs[0].cancel();
    dialogs[0].secondaryButton.action();await settle();dialogs[0].secondaryButton.action();await settle();
    assert.equal(writes.length,mode==='live'?1:0,mode);
  }
});

test('unhide-all and logout confirmations reject departed owners or a replaced account',async()=>{
  const events=[];
  const Settings=componentMethods(read('pages/设置页.ets'),['确认全部取消隐藏'],{
    取消隐藏全部牌组:async()=>events.push('unhide'),AppStorage:{setOrCreate:()=>events.push('refresh')}
  });
  const settings=new Settings();settings.disposed=true;await settings.确认全部取消隐藏();assert.deepEqual(events,[]);
  settings.disposed=false;await settings.确认全部取消隐藏();assert.deepEqual(events,['unhide','refresh']);
  const Sync=componentMethods(read('components/settings/同步分组.ets'),['点击注销'],{$r:key=>key,DialogAlignment:{Center:0}});
  for(const mode of ['cancel','replace','live']){
    const group=new Sync(),dialogs=[],actions=[];Object.assign(group,{disposed:false,鉴权凭证:{hkey:'old'},
      syncSettingsBusy:()=>false,取本地化文本:key=>key,确认注销:()=>actions.push('logout'),
      getUIContext:()=>({showAlertDialog:options=>dialogs.push(options)})});
    group.点击注销();if(mode==='cancel')dialogs[0].cancel();if(mode==='replace')group.鉴权凭证={hkey:'new'};
    dialogs[0].secondaryButton.action();dialogs[0].secondaryButton.action();assert.equal(actions.length,mode==='live'?1:0,mode);
  }
});

test('media confirmations consume once and reject canceled, departed, busy or replaced reports',()=>{
  const Panel=componentMethods(read('components/settings/媒体管理面板.ets'),['confirmTagMissing','确认清空回收站','handleBackRequest'],{
    $r:key=>key,DialogAlignment:{Center:0}
  });
  for(const method of ['confirmTagMissing','确认清空回收站']){
    for(const mode of ['live','cancel','depart','busy','replace']){
      const panel=new Panel(),dialogs=[],actions=[];Object.assign(panel,{visible:true,检查中:false,处理中:false,已检查:true,
        missingNoteCount:2,回收站有内容:true,reportRevision:11,取本地化文本:key=>key,
        maintenance:{tagMissing:()=>actions.push('tag')},执行清空回收站:()=>actions.push('empty'),
        getUIContext:()=>({showAlertDialog:options=>dialogs.push(options)})});
      panel[method]();assert.equal(dialogs.length,1);
      if(mode==='cancel')dialogs[0].cancel();if(mode==='depart')panel.visible=false;
      if(mode==='busy')panel.处理中=true;if(mode==='replace')panel.reportRevision=12;
      dialogs[0].secondaryButton.action();panel.处理中=false;
      dialogs[0].secondaryButton.action();assert.equal(actions.length,mode==='live'?1:0,`${method}:${mode}`);
    }
  }
  const panel=new Panel();let closes=0;Object.assign(panel,{visible:true,检查中:false,处理中:false,onClose:()=>closes++});
  panel.handleBackRequest();panel.visible=false;panel.handleBackRequest();assert.equal(closes,1);
});

test('remaining destructive system confirmations cannot accept twice or accept after cancellation',()=>{
  const sources=[['components/设置面板.ets','请求清除未用标签','执行清除未用标签'],
    ['pages/浏览页.ets','请求清除未用标签','清除侧栏未用标签'],
    ['pages/浏览页.ets','请求删除标签','执行删除标签'],
    ['pages/AI制卡页.ets','删除历史会话','执行删除历史会话']];
  for(const [path,method,execute] of sources){
    const Page=componentMethods(read(path),[method],{$r:key=>key,DialogAlignment:{Center:0}});
    for(const cancel of [false,true]){
      const page=new Page(),dialogs=[],actions=[];Object.assign(page,{disposed:false,pageDisposed:false,
        maintenance:{clearingTags:false},operations:new BrowserOperationController(),取本地化文本:key=>key,取本地化文案:key=>key,
        getUIContext:()=>({showAlertDialog:options=>dialogs.push(options)}),[execute]:()=>actions.push('accepted')});
      page[method](method==='删除历史会话'?{id:'one'}:'one');if(cancel)dialogs[0].primaryButton.action();
      dialogs[0].secondaryButton.action();dialogs[0].secondaryButton.action();
      assert.equal(actions.length,cancel?0:1,`${path}:${method}:${cancel}`);
    }
  }
});

test('accepted history deletion finishes storage without resetting a departed conversation',async()=>{
  const gate=deferred(),dialogs=[],actions=[];
  const Page=componentMethods(read('pages/AI制卡页.ets'),['删除历史会话','执行删除历史会话'],{$r:key=>key});
  const page=new Page();Object.assign(page,{pageDisposed:false,conversationId:'one',历史会话列表:[{id:'one'}],
    history:{remove:id=>{actions.push(id);return gate.promise;}},开始新会话:()=>actions.push('reset'),取本地化文案:key=>key,
    getUIContext:()=>({showAlertDialog:options=>dialogs.push(options)})});
  page.删除历史会话({id:'one'});dialogs[0].secondaryButton.action();page.pageDisposed=true;
  gate.resolve(true);await settle();assert.deepEqual(actions,['one']);assert.deepEqual(page.历史会话列表,[{id:'one'}]);
  await page.执行删除历史会话('one');assert.deepEqual(actions,['one']);
});

test('accepted saved-search writes finish after departure while late validation and failures leave UI alone',async()=>{
  const Page=componentMethods(read('pages/浏览页.ets'),['提交保存搜索'],{
    parseBrowserSavedSearches,serializeBrowserSavedSearches,upsertBrowserSavedSearch,$r:key=>key,
    showToastSafely:()=>assert.fail('departed page cannot toast')
  });
  for(const mode of ['saved','invalid','error']){
    const gate=deferred(),writes=[];const page=new Page();Object.assign(page,{operations:new BrowserOperationController(),
      显示保存搜索:true,保存搜索忙碌:false,保存搜索编辑项:null,保存搜索初始查询:'is:due',取本地化文案:key=>key,
      sidebarBackend:{savedSearches:()=>gate.promise,saveSavedSearches:async json=>{writes.push(json);if(mode==='error')throw Error('write');}}});
    const work=page.提交保存搜索(mode==='invalid'?'':'saved');page.operations.dispose();gate.resolve('{}');await work;
    assert.equal(writes.length,mode==='invalid'?0:1);assert.equal(page.显示保存搜索,true);
    assert.equal(page.保存搜索错误,'');assert.equal(page.保存搜索忙碌,true);
    await page.提交保存搜索('late');assert.equal(writes.length,mode==='invalid'?0:1);
  }
});
