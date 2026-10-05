// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { APP_INTERFACE_SURFACES, STATS_INTERFACE_SECTIONS, AppInterfaceTracker, visibleInterfaceItems,
  statsInterfaceSections, addNoteInterfaceControls, noteEditInterfaceControls, noteAudioInterfaceObservation } from '../../entry/src/main/ets/model/AppInterface.ts';
import { noteFieldDisplayKey, noteTypeDisplayKey } from '../../entry/src/main/ets/model/NoteTypePresentation.ts';
import { buildAgentAppStructure } from '../../entry/src/main/ets/model/agent/AgentAppStructure.ts';
import { loadComponentLogic, loadPlatformModule } from './platform-module-harness.mjs';
import { DeckOptionsSession, DeckOptionsFsrsState } from '../../entry/src/main/ets/model/home/DeckOptionsSession.ts';
import { 牌组配置表单 } from '../../entry/src/main/ets/model/牌组配置表单.ets';
import { 牌组选项编辑 } from '../../entry/src/main/ets/model/牌组选项编辑.ets';
import { emptyDeckConfigSettings } from '../../entry/src/main/ets/proto/messages/DeckConfigMessages.ts';
import { deckConfigUseCount } from '../../entry/src/main/ets/model/DeckConfigSave.ts';

const read = path => readFileSync(new URL('../../entry/src/main/ets/' + path, import.meta.url),'utf8');
const strings = locale => new Map(JSON.parse(readFileSync(new URL(`../../entry/src/main/resources/${locale}/element/string.json`,import.meta.url),'utf8')).string.map(x=>[x.name,x.value]));
const zh = strings('base'), en = strings('en_US');
const localize = key => {assert.ok(zh.has(key),key);return zh.get(key);};
const context = {simple:false,agent:true,cloudDeck:false,themeHasTextures:false};
const deckConfig = () => ({...emptyDeckConfigSettings(),newPerDay:20,reviewsPerDay:200,maximumReviewInterval:36500,
  minimumLapseInterval:1,graduatingIntervalGood:1,graduatingIntervalEasy:4,leechThreshold:8,
  initialEase:2.5,easyMultiplier:1.3,hardMultiplier:1.2,intervalMultiplier:1,desiredRetention:0.9,historicalRetention:0.9,capAnswerTimeToSecs:60,learnSteps:[1,10]});
const result = (tracker,id,locale=localize) => buildAgentAppStructure(context,id,'',locale,[],[],tracker.snapshot());
function dependencies(tracker) {
  const namedResourceText = (_,key) => localize(key);
  const text = {APP_INTERFACE_SURFACES,namedResourceText};
  const note = {noteFieldDisplayKey,noteTypeDisplayKey,namedResourceText};
  return {appInterface:tracker,namedResourceText,visibleInterfaceItems,statsInterfaceSections,addNoteInterfaceControls,noteEditInterfaceControls,noteAudioInterfaceObservation,
    noteFieldDisplayKey,noteTypeDisplayKey,
    interfaceItemText:loadPlatformModule('utils/AppInterfaceText.ets','interfaceItemText',text),
    interfaceControlText:loadPlatformModule('utils/AppInterfaceText.ets','interfaceControlText',text),
    noteFieldText:loadPlatformModule('utils/NoteTypeText.ets','noteFieldText',note),
    noteTypeText:loadPlatformModule('utils/NoteTypeText.ets','noteTypeText',note),
    resourceText:(_,value)=>localize(value.params[0].slice(11))};
}
function methods(path,names,deps) {
  const source=read(path).replaceAll('\r\n','\n');
  const bodies=names.map(name=>{
    const start=source.search(new RegExp('^  private (?:async )?'+name+'\\(', 'm'));assert.ok(start>=0,name);
    const lineEnd=source.indexOf('\n',start);
    const end=source.slice(start,lineEnd).trimEnd().endsWith('}') ? lineEnd : source.indexOf('\n  }',start)+4;
    return source.slice(start,end);
  });
  return new Function(...Object.keys(deps),stripTypeScriptTypes('class Page {'+bodies.join('\n')+'}',{mode:'transform'})+';return Page;')(...Object.values(deps));
}

test('statistics UI enumerates the same ordered sections; SM-2 hides only the two FSRS graphs',()=>{
  const all=statsInterfaceSections(true),sm2=statsInterfaceSections(false);
  assert.equal(all.length,13);assert.equal(sm2.length,11);
  assert.deepEqual(sm2.map(x=>x.id),all.filter(x=>!['stability','retrievability'].includes(x.id)).map(x=>x.id));
  assert.equal(sm2.find(x=>x.id==='ease').titleKey,'stats_section_ease_sm2');
  const source=read('pages/统计页.ets');assert.match(source,/ForEach\(this\.interfaceSections\(\)/);
  assert.deepEqual([...source.matchAll(/(?:if|else if) \(section\.id === '([^']+)'\)/g)].map(x=>x[1]),STATS_INTERFACE_SECTIONS.map(x=>x.id));
  assert.equal((source.match(/interfaceId: section\.id, interfaceTitleKey: section\.titleKey, isInteractive: this\.阶段 === 'content'/g)||[]).length,13);
  for(const section of all)assert.ok(APP_INTERFACE_SURFACES.some(x=>x.id===section.opens));
  assert.match(source,/间隔数据: this\.图表数据 !== null \? this\.图表数据\.intervals : null/);
  assert.match(source,/稳定度数据: this\.图表数据\?\.stability \?\? null/);
});

test('actual statistics publisher distinguishes initial loading, retained disabled charts and live scope',()=>{
  const tracker=new AppInterfaceTracker();
  const Page=methods('pages/统计页.ets',['interfaceSections','publishInterface'],dependencies(tracker));
  const page=new Page();Object.assign(page,{pageActive:true,阶段:'loading',图表数据:null,统计天数:365,
    牌组选项:[],选中牌组索引:0,显示分区帮助:false,错误详情:'',getUIContext:()=>({})});
  page.publishInterface();assert.equal(tracker.snapshot().length,1);
  assert.equal(result(tracker,'stats').surfaces[0].items.find(x=>x.id==='sections').visibility,'hidden');
  page.图表数据={fsrs:false};page.牌组选项=[{value:'All decks'},{value:'Selected deck'}];page.选中牌组索引=1;
  page.publishInterface();let view=result(tracker,'stats_sections');
  assert.equal(view.surfaces[0].items.filter(x=>x.visibility==='observed').length,11);
  assert.ok(view.surfaces[0].items.filter(x=>x.visibility==='observed').every(x=>!x.enabled));
  assert.equal(result(tracker,'stats').observations[0].selectedId,'deck-1');
  page.图表数据={fsrs:true};page.阶段='content';page.统计天数=0;page.publishInterface();
  assert.equal(result(tracker,'stats_sections').surfaces[0].items.filter(x=>x.visibility==='observed').length,13);
  assert.equal(result(tracker,'stats').surfaces[0].items.find(x=>x.id==='all').selected,true);
  page.图表数据=null;page.publishInterface();assert.equal(result(tracker,'stats_sections').observations.length,0);
  tracker.leave('stats');page.pageActive=false;page.publishInterface();assert.equal(tracker.snapshot().length,0);
});

test('chart component observes actual range labels, selection, empty data and ancestor disabled state',()=>{
  const tracker=new AppInterfaceTracker();
  const Chart=loadComponentLogic('components/stats/统计图表分区.ets','统计图表分区',
    {...dependencies(tracker),$r:key=>({params:[key]})});
  const chart=new Chart();Object.assign(chart,{interfaceId:'forecast',interfaceTitleKey:'stats_section_forecast',
    帮助标题:{},帮助正文:{},rangeIndex:1,有数据:false,isInteractive:false,getUIContext:()=>({}),
    rangeLabels:[{params:['app.string.stats_forecast_range_month']},{params:['app.string.stats_forecast_range_quarter']}]});
  chart.aboutToAppear();let view=result(tracker,'stats_forecast',key=>en.get(key));
  assert.equal(view.surfaces[0].title,en.get('stats_section_forecast'));
  assert.equal(view.surfaces[0].items.find(x=>x.id==='range-1').selected,true);
  assert.equal(view.surfaces[0].items.find(x=>x.id==='range-1').title,en.get('stats_forecast_range_quarter'));
  assert.ok(view.surfaces[0].items.every(x=>!x.enabled));
  assert.equal(view.observations[0].values[0].value,'false');
  chart.isInteractive=true;chart.rangeLabels=[];chart.publishInterface();
  assert.equal(tracker.snapshot()[0].items.length,1);assert.equal(tracker.snapshot()[0].items[0].enabled,true);
  chart.aboutToDisappear();chart.publishInterface();assert.equal(tracker.snapshot().length,0);
});

test('add-note observation follows actual field/type state, simple tags and image-occlusion form without draft bodies',()=>{
  const tracker=new AppInterfaceTracker();
  const Page=methods('pages/添加笔记页.ets',['interfaceControls','interfaceEnabled','publishInterface','displayTypeName','保存按钮可用','图片遮盖_标题字段索引','图片遮盖_额外字段索引'],dependencies(tracker));
  const page=new Page();Object.assign(page,{pageActive:true,isSimpleMode:true,高级已展开:true,是否图片遮盖模式:false,
    图片遮盖_源图Uri:'',图片遮盖_遮罩列表:[],图片遮盖_显示编辑器:false,处理中:false,pickingFieldImage:false,audioBusy:false,confirmingDiscard:false,
    笔记类型选项:[{id:1,name:'Basic'},{id:2,name:'CUSTOM_TYPE'}],字段名列表:['Front','Back','CUSTOM_FIELD'],已选笔记类型ID:1,
    originalStockKind:1,clozeFieldOrds:[0],optionalReverseIndex:-1,fieldImages:[],fieldAudios:[],错误信息:'',imageOcclusionFields:[],fieldSticky:[false,true,false],牌组ID:123,getUIContext:()=>({}),
    字段值列表:['PRIVATE_BODY'],标签:'PRIVATE_TAGS'});
  page.publishInterface();let view=result(tracker,'add_note');
  assert.deepEqual(view.observations[0].optionIds,['field-0','field-1','field-2']);
  assert.equal(view.surfaces[0].items.find(x=>x.id==='tags_entry').visibility,'hidden');
  assert.equal(view.surfaces[0].items.find(x=>x.id==='save').enabled,true);
  assert.equal(view.surfaces[0].items.find(x=>x.id==='save_return').enabled,true);
  assert.equal(view.observations[0].items.find(x=>x.id==='sticky-1').selected,true);
  assert.equal(result(tracker,'add_note_types').observations[0].selectedId,'1');
  assert.ok(!JSON.stringify(view).includes('PRIVATE_'));
  page.isSimpleMode=false;page.publishInterface();assert.equal(result(tracker,'add_note').surfaces[0].items.find(x=>x.id==='tags').visibility,'observed');
  page.是否图片遮盖模式=true;page.字段名列表=['Masks','Image','Header','Back Extra'];page.imageOcclusionFields=[0,1,2,3];page.publishInterface();
  assert.deepEqual(result(tracker,'add_note').observations[0].optionIds,['field-2','field-3']);
  assert.equal(result(tracker,'add_note').surfaces[0].items.find(x=>x.id==='save').enabled,false);
  page.图片遮盖_源图Uri='PRIVATE_URI';page.图片遮盖_遮罩列表=[{编号:1,形状:'rect'}];page.publishInterface();
  view=result(tracker,'add_note');assert.equal(view.surfaces[0].items.find(x=>x.id==='save').enabled,true);
  assert.equal(view.surfaces[0].items.find(x=>x.id==='image').title,localize('add_note_image_occlusion_change_image'));
  assert.ok(!JSON.stringify(view).includes('PRIVATE_URI'));
  page.confirmingDiscard=true;page.publishInterface();assert.ok(result(tracker,'add_note').surfaces[0].items.every(x=>!x.enabled));
  tracker.leave('add_note');tracker.leave('add_note_types');page.pageActive=false;page.publishInterface();assert.equal(tracker.snapshot().length,0);
});

test('real editor form observes bounded field labels, busy guards and cleanup without retaining note text or media URIs',()=>{
  const tracker=new AppInterfaceTracker();
  const Form=loadComponentLogic('components/browser/浏览编辑区.ets','浏览编辑区',
    {...dependencies(tracker),NoteAudioPreview:class{async dispose(){}},discardNoteRecordings:async()=>{}});
  const form=new Form();Object.assign(form,{getUIContext:()=>({}),fieldNames:['Front','CUSTOM_FIELD'],originalStockKind:1,
    initialFieldValues:['PRIVATE_BODY','PRIVATE_BODY'],initialTags:'PRIVATE_TAGS',optionalReverseFieldOrd:1,clozeFieldOrds:[0]});
  form.aboutToAppear();let view=result(tracker,'edit_note_form',key=>en.get(key));
  assert.equal(view.observations[0].optionsTotal,2);
  assert.equal(view.surfaces[0].items.find(x=>x.id==='save').enabled,true);
  assert.equal(view.surfaces[0].items.find(x=>x.id==='field-1').selected,true);
  assert.ok(!JSON.stringify(view).includes('PRIVATE_'));
  form.busy=true;form.images=[{uri:'PRIVATE_URI'}];form.publishInterface();
  view=result(tracker,'edit_note_form');assert.equal(view.surfaces[0].items.find(x=>x.id==='save').title,localize('browser_detail_saving'));
  assert.ok(view.surfaces[0].items.every(x=>!x.enabled));assert.ok(!JSON.stringify(view).includes('PRIVATE_URI'));
  form.busy=false;form.fieldNames=Array.from({length:105},(_,i)=>'Field '+i);form.publishInterface();
  assert.equal(tracker.snapshot()[0].optionIds.length,100);assert.equal(tracker.snapshot()[0].optionsTotal,105);
  form.aboutToDisappear();form.publishInterface();assert.equal(tracker.snapshot().length,0);
});

test('real audio field status reaches JIDE from both editor hosts with pause/resume and disabled actions, without media details',()=>{
  for (const path of ['pages/添加笔记页.ets', 'components/browser/浏览编辑区.ets']) {
    const tracker = new AppInterfaceTracker(), Page = methods(path, ['publishAudioStatus'], dependencies(tracker));
    const page = new Page(); Object.assign(page, { pageActive: true, interfaceMounted: true, disposed: false });
    const Field = loadComponentLogic('components/common/NoteAudioField.ets', 'NoteAudioField', {
      APP_FOREGROUND_KEY: 'foreground', NoteAudioPreview: class {}, NoteAudioRecorder: class {},
      noteAudioParts: value => [{ text: value, filename: 'PRIVATE_FILENAME' }]
    });
    const field = new Field(); field.value = '[sound:PRIVATE_FILENAME]'; field.audios = [{ id: 5, uri: 'PRIVATE_URI' }];
    field.onStatus = status => page.publishAudioStatus(status);
    field.aboutToAppear();
    const item = id => result(tracker, 'note_audio_manage').surfaces[0].items.find(x => x.id === id);
    assert.equal(item('record').title, zh.get('note_audio_record'));
    assert.equal(item('pending-5-remove').title, zh.get('note_audio_remove'));
    assert.equal(item('pause').visibility, 'hidden');
    field.recording = field.disabled = true; field.publishStatus();
    assert.equal(item('record').title, zh.get('note_audio_record_done')); assert.equal(item('record').enabled, true);
    assert.equal(item('pause').title, zh.get('note_audio_pause')); assert.equal(item('close').enabled, false);
    assert.equal(item('apply').enabled, false); assert.equal(item('add').visibility, 'hidden');
    field.paused = true; field.seconds = 12; field.publishStatus();
    assert.equal(item('pause').title, zh.get('note_audio_resume'));
    assert.equal(result(tracker, 'note_audio_manage', key => en.get(key)).surfaces[0].items.find(x => x.id === 'pause').title, en.get('note_audio_resume'));
    field.working = true; field.publishStatus(); assert.ok(tracker.snapshot()[0].items.every(x => !x.enabled));
    assert.ok(!JSON.stringify(result(tracker, 'note_audio_manage')).includes('PRIVATE_'));
    page.publishAudioStatus(null); assert.equal(tracker.snapshot().length, 0);
    page.pageActive = page.interfaceMounted = false; page.disposed = true;
    field.publishStatus(); assert.equal(tracker.snapshot().length, 0);
    assert.match(read(path), /onAudioStatus:.*this\.publishAudioStatus\(status\)/);
  }
});

test('editor page exposes loading/retry and loaded-form destination, without reading note contents',()=>{
  const tracker=new AppInterfaceTracker();const Page=methods('pages/EditNotePage.ets',['publishInterface'],dependencies(tracker));
  const page=new Page();Object.assign(page,{active:true,targetId:42,isNote:true,getUIContext:()=>({}),editor:{busy:true,note:null,error:''}});
  page.publishInterface();assert.equal(result(tracker,'edit_note').surfaces[0].items.find(x=>x.id==='retry').visibility,'hidden');
  page.editor={busy:false,note:null,error:'load'};page.publishInterface();assert.equal(result(tracker,'edit_note').surfaces[0].items.find(x=>x.id==='retry').enabled,true);
  page.editor={busy:false,note:{fields:['PRIVATE_BODY']},error:''};page.publishInterface();
  const view=result(tracker,'edit_note');assert.equal(view.surfaces[0].items.find(x=>x.id==='form').opens,'edit_note_form');
  assert.ok(!JSON.stringify(view).includes('PRIVATE_BODY'));
  tracker.leave('edit_note');page.active=false;page.publishInterface();assert.equal(tracker.snapshot().length,0);
});

test('real deck options feature publishes loading, error/retry and loaded form facts, then disposes late callbacks',async()=>{
  for(const mode of ['ready','error','disposed']) {
    const tracker=new AppInterfaceTracker();let resolve,reject,loads=0,writes=0;
    const backend={load:()=>{loads++;return new Promise((yes,no)=>{resolve=yes;reject=no;});},save:async()=>{writes++;},committed(){}};
    class Session extends DeckOptionsSession {
      constructor(id,adapter,publish){super(id,adapter,publish,{beginOperation(){},endOperation(){}},{waitForCollection:async()=>{}});}
    }
    const Feature=loadComponentLogic('components/home/DeckOptionsFeature.ets','DeckOptionsFeature',{
      ...dependencies(tracker),DeckOptionsSession:Session,DeckOptionsFsrsState,牌组配置表单,牌组选项编辑,deckConfigUseCount,
      AnkiDeckOptions:class{load(...args){return backend.load(...args);}save(){return backend.save();}committed(){}}
    });
    const feature=new Feature();Object.assign(feature,{deckId:12,deckName:'PRIVATE_DECK',getUIContext:()=>({})});
    feature.aboutToAppear();assert.equal(tracker.snapshot()[0].sectionId,'loading');
    assert.equal(result(tracker,'deck_options').surfaces[0].items.find(x=>x.id==='retry').visibility,'hidden');
    await new Promise(setImmediate);assert.equal(loads,1);
    if(mode==='disposed')feature.aboutToDisappear();
    const config=deckConfig();
    if(mode==='error')reject(Error('PRIVATE_ERROR'));
    else resolve({currentDeck:{configId:7,limits:null},allConfigs:[{config:{id:7,name:'PRIVATE_PRESET',mtimeSecs:0,usn:0,config},useCount:1}],
      fsrs:false,newCardsIgnoreReviewLimit:false,applyAllParentLimits:false,fsrsHealthCheck:false});
    await new Promise(setImmediate);
    if(mode==='disposed'){assert.deepEqual(tracker.snapshot(),[]);continue;}
    const view=result(tracker,'deck_options');const controls=view.surfaces[0].items;
    if(mode==='error')assert.equal(controls.find(x=>x.id==='retry').visibility,'observed');
    else {
      assert.equal(feature.state.phase,'ready',feature.state.error);
      assert.equal(controls.find(x=>x.id==='form').opens,'deck_options_form');
      assert.equal(controls.find(x=>x.id==='close').visibility,'hidden');
      assert.equal(view.observations[0].values.find(x=>x.id==='presetId').value,'7');
      feature.state.fsrs.busy=true;feature.publishInterface();assert.equal(tracker.snapshot()[0].busy,true);
    }
    assert.ok(!JSON.stringify(view).includes('PRIVATE_'));assert.equal(writes,0);
    feature.aboutToDisappear();feature.publishInterface();assert.deepEqual(tracker.snapshot(),[]);
  }
});

test('real deck options header observes validation, computation, nested overlays and manual save without exposing draft fields',()=>{
  const tracker=new AppInterfaceTracker();
  const Form=loadComponentLogic('components/牌组选项面板.ets','牌组选项面板',{
    ...dependencies(tracker),DeckOptionsFsrsState,$r:key=>({params:[key]})
  });
  const config=deckConfig();
  const form=new Form();Object.assign(form,{getUIContext:()=>({}),form:牌组配置表单.从配置创建(config),
    options:牌组选项编辑.从视图创建(null,false,false,false,false),deckName:'PRIVATE_DECK'});
  form.aboutToAppear();let view=result(tracker,'deck_options_form');
  const item=id=>result(tracker,'deck_options_form').surfaces[0].items.find(x=>x.id===id);
  assert.deepEqual(form.form.校验().concat(form.options.校验()),[]);
  assert.equal(item('save').enabled,true);assert.equal(item('cancel').enabled,true);assert.equal(item('help').enabled,true);
  assert.equal(view.observations[0].controlsComplete,false);
  assert.equal(view.observations[0].values.find(x=>x.id==='save_behavior').value,'manual');
  assert.equal(form.interfaceLabel('save'),item('save').title);
  form.form.每日新卡数文本='PRIVATE_INVALID_TEXT';form.publishInterface();assert.equal(item('save').enabled,false);
  form.form.每日新卡数文本='30';form.publishInterface();assert.equal(item('save').enabled,true);
  form.busy=true;form.publishInterface();assert.equal(item('save').title,localize('deck_options_saving'));
  assert.ok(['cancel','save','help'].every(id=>!item(id).enabled));
  form.computing=true;form.publishInterface();assert.equal(item('save').title,localize('deck_fsrs_computing'));assert.equal(item('cancel').enabled,true);
  form.busy=false;form.computing=false;form.showHelp=true;form.publishInterface();assert.ok(['cancel','save','help'].every(id=>!item(id).enabled));
  form.showHelp=false;form.简洁模式=false;form.errorMessage='PRIVATE_ERROR';form.publishInterface();
  view=result(tracker,'deck_options_form',key=>en.get(key));assert.equal(view.observations[0].sectionId,'full');
  assert.equal(view.observations[0].values.find(x=>x.id==='has_error').value,'true');assert.equal(view.surfaces[0].items.find(x=>x.id==='save').title,en.get('deck_options_save'));
  assert.ok(!JSON.stringify(view).includes('PRIVATE_'));
  form.aboutToDisappear();form.publishInterface();assert.deepEqual(tracker.snapshot(),[]);
});

test('FSRS panel publishes real evaluation and history counts, conditional actions and disposal to JIDE',()=>{
  const tracker=new AppInterfaceTracker();
  const Panel=loadComponentLogic('components/home/FsrsTools.ets','FsrsTools',{
    ...dependencies(tracker),DeckOptionsFsrsState
  });
  const panel=new Panel();panel.getUIContext=()=>({});
  panel.aboutToAppear();
  const surface=()=>result(tracker,'deck_options_fsrs').surfaces[0];
  assert.equal(surface().items.find(x=>x.id==='evaluate').enabled,true);
  assert.equal(surface().items.find(x=>x.id==='retry').visibility,'hidden');
  assert.equal(surface().items.find(x=>x.id==='use_retention').visibility,'hidden');
  panel.state.evaluation={logLoss:0.25,rmseBins:0.08};
  panel.state.historyCount={included:6,total:10};
  panel.state.evaluationSearch='preset:7 -is:suspended';
  panel.state.evaluationDate='2025-01-01';
  panel.state.operation='evaluate';panel.busy=true;panel.publishInterface();
  const view=result(tracker,'deck_options_fsrs',key=>en.get(key));
  assert.equal(view.surfaces[0].items.find(x=>x.id==='evaluate').title,en.get('deck_fsrs_evaluate_current'));
  assert.ok(view.surfaces[0].items.filter(x=>x.visibility==='observed').every(x=>!x.enabled));
  const values=Object.fromEntries(view.observations[0].values.map(x=>[x.id,x.value]));
  assert.deepEqual(values,{operation:'evaluate',search:'preset:7 -is:suspended',ignore_before_date:'2025-01-01',
    log_loss:'0.25',rmse_bins:'0.08',included_cards:'6',total_cards:'10',days:'365',compare_retention:'90'});
  assert.equal(view.observations[0].controlsComplete,true);
  panel.state.results=[{id:7,error:'failure'}];panel.state.workload={points:[]};panel.busy=false;panel.publishInterface();
  assert.equal(surface().items.find(x=>x.id==='retry').visibility,'observed');
  assert.equal(surface().items.find(x=>x.id==='use_retention').enabled,true);
  panel.aboutToDisappear();panel.publishInterface();assert.deepEqual(tracker.snapshot(),[]);
});

test('directory reads omit mounted control and dataset details; targeted reads keep actual observations intact',()=>{
  const tracker=new AppInterfaceTracker();
  tracker.observe({surface:'edit_note_form',sectionId:'',selectedId:'',optionIds:['field-0'],optionLabels:['CUSTOM_FIELD'],optionsTotal:105,
    busy:true,controlsComplete:true,items:[{id:'field-0',title:'CUSTOM_FIELD',enabled:false,selected:false}],values:[{id:'image_count',value:'8'}]});
  const directory=result(tracker,'app');
  assert.equal(directory.observationDetailsIncluded,false);
  assert.equal(directory.observations[0].optionsTotal,105);
  assert.equal(directory.observations[0].busy,true);
  assert.deepEqual(directory.observations[0].optionIds,[]);
  assert.equal(directory.observations[0].items,undefined);assert.equal(directory.observations[0].values,undefined);
  assert.ok(!JSON.stringify(directory).includes('CUSTOM_FIELD'));
  const full=result(tracker,'edit_note_form');assert.equal(full.observationDetailsIncluded,true);
  assert.deepEqual(full.observations[0].optionLabels,['CUSTOM_FIELD']);assert.equal(full.observations[0].controlsComplete,true);
  assert.equal(tracker.snapshot()[0].items[0].title,'CUSTOM_FIELD','summary construction must not mutate the publisher snapshot');
});
