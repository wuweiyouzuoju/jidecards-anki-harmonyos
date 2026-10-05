// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { DeckOptionsSession, DeckOptionsFsrsState } from '../../entry/src/main/ets/model/home/DeckOptionsSession.ts';
import { emptyDeckConfigSettings, encodeDeckConfig } from '../../entry/src/main/ets/proto/messages/DeckConfigMessages.ts';
import { copyDeckConfig } from '../../entry/src/main/ets/model/DeckConfigSave.ts';
import { AutoSyncScheduler } from '../../entry/src/main/ets/model/AutoSyncScheduler.ts';
import { SyncActivity } from '../../entry/src/main/ets/model/SyncSettings.ts';
import { fsrsParams, fsrsOptimizeInput, fsrsWorkloadInput, fsrsPresetIdSearch } from '../../entry/src/main/ets/model/FsrsOptions.ts';
import { 牌组配置表单 } from '../../entry/src/main/ets/model/牌组配置表单.ets';
import { 牌组选项编辑 } from '../../entry/src/main/ets/model/牌组选项编辑.ets';
import { prepareDeckOptionsDraft } from '../../entry/src/main/ets/model/DeckOptionsDraft.ets';
import { loadComponentLogic } from './platform-module-harness.mjs';
import { loadUiFeedback } from './ui-feedback-harness.mjs';
import { appInterfaceDependencies } from './app-interface-harness.mjs';

const flush = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve, reject; const promise = new Promise((a,b) => { resolve=a; reject=b; }); return {promise,resolve,reject}; };
const params = Array.from({length:21},(_,i)=>i/10+0.1);
function harness() {
  const current = {id:1,name:'Shared',mtimeSecs:3,usn:-1,config:{...emptyDeckConfigSettings(),
    newPerDay:10,reviewsPerDay:100,desiredRetention:0.9,historicalRetention:0.9,maximumReviewInterval:36500,
    initialEase:2.5,easyMultiplier:1.3,hardMultiplier:1.2,intervalMultiplier:1,minimumLapseInterval:1,
    graduatingIntervalGood:1,graduatingIntervalEasy:4,leechThreshold:8,capAnswerTimeToSecs:60,
    learnSteps:[1,10],relearnSteps:[10],preserved:[Uint8Array.from([0xc0,0x0c,42])],other:Uint8Array.from([1,2])}};
  const other = copyDeckConfig(current); other.id=2; other.name='Other'; other.config.paramSearch='tag:other';
  const view={allConfigs:[{config:other,useCount:2},{config:current,useCount:3}],currentDeck:{name:'Target',configId:1,parentConfigIds:[],limits:null},
    defaults:null,schemaModified:false,cardStateCustomizer:'keep',newCardsIgnoreReviewLimit:true,fsrs:true,applyAllParentLimits:true,fsrsHealthCheck:true};
  const options={limits:null,newCardsIgnoreReviewLimit:true,fsrs:true,applyAllParentLimits:true,fsrsReschedule:false,fsrsHealthCheck:true};
  const states=[],writes=[],computes=[],simulations=[],scopes=[];
  const scheduler=new AutoSyncScheduler(),activity=new SyncActivity();
  let committed=0;
  const backend={load:async()=>view,save:async request=>writes.push(request),committed:()=>committed++,
    presetSearch:async id=>{scopes.push(id);return 'did:'+id+' -is:suspended';},
    optimize:async input=>{computes.push(input);return {params,fsrsItems:500,healthCheckPassed:true};},
    workload:async input=>{simulations.push(input);return {points:[{retention:90,costSeconds:600,memorized:12,reviewCount:80}],reviewlessEndMemorized:4};}};
  const session=new DeckOptionsSession(7,backend,s=>states.push(s),scheduler,activity);
  return {current,other,view,options,states,writes,computes,simulations,scopes,backend,session,scheduler,activity,committed:()=>committed};
}

test('evaluation freezes the edited parameters, scope and date, keeps real history counts on failure and never saves',async()=>{
  const h=harness();await h.session.load();const evaluations=[],counts=[],gate=deferred();
  h.backend.historyCount=async(date,search)=>{counts.push({date,search});return {included:3,total:6};};
  h.backend.evaluate=async input=>{evaluations.push(input);await gate.promise;return {logLoss:0.4,rmseBins:0.05};};
  const draft=copyDeckConfig(h.current);draft.config.fsrsParams6=params.slice();draft.config.paramSearch='tag:training';
  draft.config.ignoreRevlogsBeforeDate='2026-01-02';const work=h.session.evaluate(draft);
  draft.config.paramSearch='changed';draft.config.fsrsParams6[0]=999;await flush();
  try {
    assert.deepEqual(counts,[{date:'2026-01-02',search:'tag:training'}]);
    assert.deepEqual(evaluations,[{params:params.map(Math.fround),search:'tag:training',ignoreRevlogsBeforeMs:Date.UTC(2026,0,2)}]);
    assert.equal(h.states.at(-1).fsrs.busy,true);await h.session.evaluate(draft);assert.equal(evaluations.length,1);
  } finally { gate.resolve();await work; }
  assert.deepEqual(h.states.at(-1).fsrs.evaluation,{logLoss:0.4,rmseBins:0.05});
  assert.deepEqual(h.states.at(-1).fsrs.historyCount,{included:3,total:6});assert.equal(h.writes.length,0);
  h.backend.evaluate=async()=>{throw Error('no usable history');};await h.session.evaluate(h.current);
  assert.equal(h.states.at(-1).fsrs.evaluation,null);assert.equal(h.states.at(-1).fsrs.error,'no usable history');
  assert.deepEqual(h.states.at(-1).fsrs.historyCount,{included:3,total:6});assert.equal(h.states.at(-1).fsrs.evaluationSearch,'did:1 -is:suspended');
});

test('departed evaluation cannot start after a pending history read',async()=>{
 const h=harness();await h.session.load();const gate=deferred();let evaluations=0;
 h.backend.historyCount=()=>gate.promise;h.backend.evaluate=async()=>{evaluations++;return {logLoss:0,rmseBins:0};};
 const work=h.session.evaluate(h.current);await flush();h.session.dispose();const count=h.states.length;
 gate.resolve({included:0,total:6});await work;assert.equal(evaluations,0);assert.equal(h.states.length,count);
});

test('current preset optimization consumes the edited draft, stages without writes, then saves the shared preset as in Anki',async()=>{
  const h=harness(); await h.session.load();
  const form=牌组配置表单.从配置创建(h.current.config),options=牌组选项编辑.从视图创建(null,true,true,true,true);
  form.每日新卡数文本='15'; form.重学步骤文本='1 10'; form.设置文本字段('ignoreRevlogsBeforeDate','2026-01-02');
  const draft=prepareDeckOptionsDraft(h.current,form,options);
  const result=await h.session.optimize(draft.config,draft.options,false);
  assert.deepEqual(result,params); assert.equal(h.writes.length,0);
  assert.equal(h.computes[0].numOfRelearningSteps,2); assert.equal(h.computes[0].ignoreRevlogsBeforeMs,Date.UTC(2026,0,2));
  assert.equal(h.computes[0].healthCheck,true); assert.equal(h.computes[0].search,'did:1 -is:suspended');
  form.设置浮点数组字段('fsrsParams6',result.join(' '));
  const saved=prepareDeckOptionsDraft(h.current,form,options);
  await h.session.save(saved.config,saved.shared,saved.options);
  assert.equal(h.writes[0].configs[0].id,1); assert.equal(h.writes[0].configs[0].config.newPerDay,15);
  assert.deepEqual(h.writes[0].configs[0].config.preserved,h.current.config.preserved);
  assert.deepEqual(h.current.config.fsrsParams6,[]); assert.equal(h.committed(),1);
});

test('all presets are deduplicated, independent of use count, and saved once with current last and unknown fields intact',async()=>{
  const h=harness(); h.view.allConfigs.push(h.view.allConfigs[0]); await h.session.load();
  const draft=copyDeckConfig(h.current); draft.config.reviewsPerDay=123;
  const before=encodeDeckConfig(h.other);
  const result=await h.session.optimize(draft,h.options,true); draft.config.fsrsParams6=result;
  assert.equal(h.computes.length,2); assert.equal(h.computes[0].search,'tag:other');
  assert.deepEqual(h.scopes,[1]); assert.equal(h.states.at(-1).fsrs.batchDraft,true);
  const pending=deferred(); h.backend.save=async request=>{h.writes.push(request);await pending.promise;};
  const save=h.session.save(draft,false,h.options); await flush();
  draft.config.reviewsPerDay=999; params[0]=Math.fround(params[0]);
  assert.deepEqual(h.writes[0].configs.map(c=>c.id),[2,1,0]);
  assert.equal(h.writes[0].configs[1].config.reviewsPerDay,100,'shared preset receives parameters only');
  assert.equal(h.writes[0].configs.at(-1).config.reviewsPerDay,123);
  assert.equal(h.writes[0].cardStateCustomizer,'keep'); assert.equal(h.writes[0].fsrsReschedule,false);
  assert.deepEqual(encodeDeckConfig(h.other),before);
  h.session.dispose(); pending.resolve(); assert.equal(await save,true); assert.equal(h.committed(),1);
});

test('batch partial failures keep successful drafts, report Core errors, and retry only failed presets',async()=>{
  const h=harness(); await h.session.load();
  h.backend.optimize=async input=>{h.computes.push(input); if(input.search==='tag:other') throw Error('bad search'); return {params,fsrsItems:11,healthCheckPassed:false};};
  const result=await h.session.optimize(h.current,h.options,true);
  assert.equal(h.states.at(-1).fsrs.results.find(r=>r.id===2).error,'bad search');
  assert.equal(h.states.at(-1).fsrs.results.find(r=>r.id===1).healthCheckPassed,false);
  assert.equal(h.states.at(-1).fsrs.results.find(r=>r.id===1).fsrsItems,11);
  h.backend.optimize=async input=>{h.computes.push(input);return {params,fsrsItems:800,healthCheckPassed:null};};
  await h.session.optimize(h.current,h.options,true,true);
  assert.equal(h.computes.length,3); assert.equal(h.computes[2].search,'tag:other');
  assert.equal(h.states.at(-1).fsrs.results.every(r=>r.error===''),true);
  const draft=copyDeckConfig(h.current); draft.config.fsrsParams6=result;
  await h.session.save(draft,false,h.options); assert.deepEqual(h.writes[0].configs.map(c=>c.id),[2,1]);
});

test('no history and malformed Core parameter results leave parameters unchanged with visible outcomes',async()=>{
  const h=harness(); await h.session.load();
  h.backend.optimize=async()=>({params:[],fsrsItems:0,healthCheckPassed:null});
  assert.equal(await h.session.optimize(h.current,h.options,true),null);
  assert.equal(h.states.at(-1).fsrs.batchDraft,false); assert.equal(h.states.at(-1).fsrs.results[0].fsrsItems,0);
  h.backend.optimize=async()=>({params:[NaN],fsrsItems:1,healthCheckPassed:null});
  assert.equal(await h.session.optimize(h.current,h.options,false),null);
  assert.match(h.states.at(-1).fsrs.results[0].error,/Invalid Core/);
  assert.deepEqual(h.current.config.fsrsParams6,[]);
});

test('Core empty/default parameters with usable history clear all generations in the staged draft',async()=>{
  const h=harness();h.current.config.fsrsParams4=Array(17).fill(1);
  h.current.config.fsrsParams5=Array(19).fill(2);h.current.config.fsrsParams6=Array(21).fill(3);
  await h.session.load();h.backend.optimize=async()=>({params:[],fsrsItems:12,healthCheckPassed:null});
  const result=await h.session.optimize(h.current,h.options,true);
  assert.deepEqual(result,[]);assert.equal(h.states.at(-1).fsrs.results.every(r=>r.error===''),true);
  const draft=copyDeckConfig(h.current);draft.config.fsrsParams4=[];draft.config.fsrsParams5=[];draft.config.fsrsParams6=[];
  await h.session.save(draft,false,h.options);
  for(const c of h.writes[0].configs){assert.deepEqual(fsrsParams(c.config),[]);}
  assert.equal(h.current.config.fsrsParams6.length,21,'loaded config remains untouched');
});

test('missing ID scope is a retryable error and late scope resolution never starts Core computation',async()=>{
  const h=harness();await h.session.load();delete h.backend.presetSearch;
  await h.session.optimize(h.current,h.options,false);
  assert.match(h.states.at(-1).fsrs.results[0].error,/scope/);assert.equal(h.computes.length,0);
  await h.session.simulate(h.current,h.options,30);assert.match(h.states.at(-1).fsrs.error,/scope/);
  const scope=deferred();h.backend.presetSearch=()=>scope.promise;
  const work=h.session.optimize(h.current,h.options,false,true);await flush();h.session.dispose();
  scope.resolve('did:1');await work;assert.equal(h.computes.length,0);assert.equal(h.scheduler.canSync(),true);
});

test('batch drafts survive failed save and retry with the same shared parameter and isolated edit scopes',async()=>{
  const h=harness();await h.session.load();const draft=copyDeckConfig(h.current);draft.config.newPerDay=24;
  draft.config.fsrsParams6=await h.session.optimize(draft,h.options,true);
  h.backend.save=async r=>{h.writes.push(r);throw Error('disk full');};
  assert.equal(await h.session.save(draft,false,h.options),false);
  assert.equal(h.states.at(-1).fsrs.batchDraft,true);assert.equal(h.scheduler.canSync(),true);
  h.backend.save=async r=>h.writes.push(r);assert.equal(await h.session.save(draft,false,h.options),true);
  assert.deepEqual(h.writes[1],h.writes[0]);assert.deepEqual(h.writes[1].configs.map(c=>c.id),[2,1,0]);
});

test('collection waits cancel unstarted calculations on exit; active calculations hold occupancy until actual settlement',async()=>{
  const h=harness(); await h.session.load(); const sync={}; h.activity.acquire(sync);
  const work=h.session.optimize(h.current,h.options,true); await flush();
  assert.equal(h.scheduler.canSync(),false); assert.equal(h.computes.length,0);
  h.session.dispose(); h.activity.release(sync,0); await work;
  assert.equal(h.scheduler.canSync(),true); assert.equal(h.computes.length,0);
  const next=harness(); await next.session.load(); const pending=deferred(); next.backend.optimize=()=>pending.promise;
  const active=next.session.optimize(next.current,next.options,true); await flush(); next.session.dispose();
  const count=next.states.length; assert.equal(next.scheduler.canSync(),false);
  pending.reject(Error('late failure')); assert.equal(await active,null);
  assert.equal(next.states.length,count); assert.equal(next.scheduler.canSync(),true);
});

test('reopened panel waits for disposed Core computation, and duplicate save/calculation clicks are rejected',async()=>{
  const h=harness(); await h.session.load(); const pending=deferred(); h.backend.optimize=()=>pending.promise;
  const active=h.session.optimize(h.current,h.options,false); await flush();
  assert.equal(await h.session.save(h.current,false,h.options),false);
  assert.equal(await h.session.optimize(h.current,h.options,false),null);
  await h.session.simulate(h.current,h.options,2); assert.equal(h.simulations.length,0);
  h.session.dispose(); const next=harness(); let loaded=false; next.backend.load=async()=>{loaded=true;return next.view;};
  const load=next.session.load(); await flush(); assert.equal(loaded,false);
  pending.resolve({params,fsrsItems:500,healthCheckPassed:true}); await active; await load; assert.equal(loaded,true);
});

test('simulation freezes config and global inputs, supports retry, and suppresses late result after disposal',async()=>{
  const h=harness(); await h.session.load(); const pending=deferred(); h.backend.workload=async input=>{h.simulations.push(input);return pending.promise;};
  const draft=copyDeckConfig(h.current); draft.config.fsrsParams6=params.slice();
  const work=h.session.simulate(draft,h.options,30); draft.config.fsrsParams6[0]=999; h.options.newCardsIgnoreReviewLimit=false;
  await flush(); assert.equal(h.simulations[0].params[0],params[0]); assert.equal(h.simulations[0].newCardsIgnoreReviewLimit,true);
  pending.reject(Error('Core failed')); await work; assert.equal(h.states.at(-1).fsrs.error,'Core failed');
  h.backend.workload=async()=>({points:[],reviewlessEndMemorized:0});
  await h.session.simulate(h.current,h.options,90); assert.equal(h.states.at(-1).fsrs.error,''); assert.equal(h.states.at(-1).fsrs.workloadDays,90);
  const late=deferred(); h.backend.workload=()=>late.promise; const last=h.session.simulate(h.current,h.options,30);
  await flush(); h.session.dispose(); const count=h.states.length; late.resolve({points:[],reviewlessEndMemorized:0}); await last;
  assert.equal(h.states.length,count); assert.equal(h.scheduler.canSync(),true); assert.equal(h.writes.length,0);
});

test('preset ID scope includes shared decks and original filtered decks without matching children or names',()=>{
  const json=JSON.stringify({1:{id:1,conf:2,dyn:0,name:'A "quoted" preset'},2:{id:2,conf:2,dyn:0},
    3:{id:3,conf:8,dyn:0},4:{id:4,dyn:1}});
  assert.equal(fsrsPresetIdSearch(2,json),'did:1,2 -is:suspended');
  assert.equal(fsrsPresetIdSearch(9,json),'did:0 -is:suspended');
  assert.throws(()=>fsrsPresetIdSearch(2,'{"1":{"id":"bad","conf":2,"dyn":0}}'),/Invalid Core/);
});

test('input mapping respects Core parameter priority, explicit zeros, suspension and preset-only simulation limits',()=>{
  const h=harness(),s=h.current.config; s.fsrsParams4=Array(17).fill(1);s.fsrsParams5=Array(19).fill(2);s.fsrsParams6=Array(21).fill(3);
  assert.deepEqual(fsrsParams(s),s.fsrsParams6); s.fsrsParams6=[]; assert.deepEqual(fsrsParams(s),s.fsrsParams5);
  s.newPerDay=0;s.reviewsPerDay=0;s.leechThreshold=8;s.leechAction=0;
  h.options.limits={new:999,review:999,newToday:999,reviewToday:999,reviewTodayActive:true,newTodayActive:true,desiredRetention:0.8};
  const input=fsrsWorkloadInput(h.current,h.options,365,'did:1 -is:suspended');
  assert.equal(input.newLimit,0);assert.equal(input.reviewLimit,0);assert.equal(input.suspendAfterLapseCount,8);assert.equal(input.deckSize,0);
  s.leechAction=1;assert.equal(fsrsWorkloadInput(h.current,h.options,1,'did:1').suspendAfterLapseCount,null);
  assert.throws(()=>fsrsWorkloadInput(h.current,h.options,0,'did:1'),/duration/);
  assert.throws(()=>fsrsWorkloadInput(h.current,h.options,1,''),/scope/);
  s.ignoreRevlogsBeforeDate='bad';assert.throws(()=>fsrsOptimizeInput(h.current,true,'did:1'),/date/);
});

test('FSRS UI renders actual bilingual resources, compares Core points, and selects retention only in the draft',()=>{
  for(const locale of ['base','en_US']){
    const strings=new Map(JSON.parse(readFileSync(new URL(`../../entry/src/main/resources/${locale}/element/string.json`,import.meta.url))).string.map(x=>[x.name,x.value]));
    const $r=(name,...args)=>({id:name.split('.').at(-1),params:[name,...args]});
    const context={getHostContext:()=>({resourceManager:{getStringSync:(id,...args)=>strings.get(id)
      .replace(/%(\d+)\$[ds]/g,(_,n)=>String(args[Number(n)-1])).replaceAll('%%','%')}})};
    const Tools=loadComponentLogic('components/home/FsrsTools.ets','FsrsTools',{DeckOptionsFsrsState,$r,resourceText:loadUiFeedback().resourceText});
    const ui=new Tools();ui.getUIContext=()=>context;
    const text=ui.resultText({name:'P',fsrsItems:0,healthCheckPassed:null,error:''}); assert.ok(!text.includes('%1'));
    assert.match(text,locale==='base'?/无有效学习记录/:/No usable history/);
    assert.match(ui.resultText({name:'P',fsrsItems:301,healthCheckPassed:false,error:''}),locale==='base'?/健康检查未通过/:/Health check failed/);
    assert.match(ui.resultText({name:'P',fsrsItems:0,healthCheckPassed:null,error:'disk'}),/disk/);
    ui.state.workloadDays=10;ui.state.workload={points:[70,80,90,95,99].map(retention=>({retention,costSeconds:1200,memorized:12,reviewCount:40})),reviewlessEndMemorized:0};
    assert.deepEqual(ui.comparisonPoints().map(x=>x.retention),[80,90,95,99]);ui.selectedRetention='70';
    assert.deepEqual(ui.comparisonPoints().map(x=>x.retention),[70,80,90,95,99]);
    assert.match(ui.pointText(ui.comparisonPoints()[0]),/2.0/);assert.equal(ui.choices().length,30);
    assert.equal(ui.validateDays('30'),'');assert.notEqual(ui.validateDays('0'),'');
  }
});

test('feature applies actual Core generations to the existing form, preserves unrelated edits, and ignores late UI continuations',async()=>{
  const h=harness();
  const Feature=loadComponentLogic('components/home/DeckOptionsFeature.ets','DeckOptionsFeature',{
    ...appInterfaceDependencies(),DeckOptionsFsrsState,prepareDeckOptionsDraft,namedResourceText:(_context,key)=>key});
  const ui=new Feature();ui.active=true;ui.getUIContext=()=>({});
  ui.state={phase:'ready',config:h.current,fsrs:new DeckOptionsFsrsState()};
  ui.form=牌组配置表单.从配置创建(h.current.config);
  ui.options=牌组选项编辑.从视图创建(null,true,true,true,true);ui.form.每日新卡数文本='23';
  const form=ui.form;
  for(const length of [21,19,17,0]){
    ui.session={optimize:async()=>Array(length).fill(0.5)};await ui.optimize(false,false);
    assert.equal(ui.form,form);assert.equal(ui.form.每日新卡数文本,'23');
    const draft=prepareDeckOptionsDraft(h.current,ui.form,ui.options);
    assert.equal(draft.errorKey,'');assert.equal(fsrsParams(draft.config.config).length,length);
  }
  const pending=deferred();ui.session={optimize:()=>pending.promise,dispose:()=>{}};
  const work=ui.optimize(false,false);ui.aboutToDisappear();pending.resolve(Array(21).fill(0.5));await work;
  assert.equal(fsrsParams(prepareDeckOptionsDraft(h.current,ui.form,ui.options).config.config).length,0);
  ui.active=true;const failure=deferred();ui.session={workload:()=>{},simulate:()=>failure.promise,dispose:()=>{}};
  const simulation=ui.simulate(30);ui.aboutToDisappear();failure.reject(Error('late error'));await simulation;
  assert.equal(ui.validationError,'');assert.equal(h.writes.length,0);
});

test('system Back reaches computing deck options while saving and other collection operations remain protected',()=>{
  const method=(path,start)=>{const source=readFileSync(new URL('../../entry/src/main/ets/'+path,import.meta.url),'utf8');
    const offset=source.indexOf(start);assert.ok(offset>=0);return source.slice(offset,source.indexOf('\n  }',offset)+4);};
  const compile=body=>new Function(stripTypeScriptTypes('class Owner {'+body+'}',{mode:'transform'})+';return Owner;')();
  const Home=compile(method('pages/首页.ets','  onBackPress(): boolean'));
  const Panel=compile(method('components/牌组选项面板.ets','  private handleBackRequest(): void'));
  for(const computing of [true,false]){
    const home=new Home();Object.assign(home,{deckLevelMenuId:'',transfer:{phase:'idle',visible:false},deckOptionsBusy:true,
      显示牌组选项:true,deckOptionsBackRequest:0,syncController:{cancel:()=>{}}});
    const panel=new Panel();Object.assign(panel,{busy:true,computing,showHelp:false,showAdvanced:false,
      onCancel:()=>{home.显示牌组选项=false;home.deckOptionsBusy=false;}});
    assert.equal(home.onBackPress(),true);assert.equal(home.deckOptionsBackRequest,1);
    panel.handleBackRequest();assert.equal(home.显示牌组选项,!computing);
  }
  const home=new Home();Object.assign(home,{deckLevelMenuId:'',transfer:{phase:'saving'},显示牌组选项:true,deckOptionsBackRequest:0});
  assert.equal(home.onBackPress(),true);assert.equal(home.deckOptionsBackRequest,0);
});
