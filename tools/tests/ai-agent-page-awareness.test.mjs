// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { APP_INTERFACE_SURFACES, STATS_INTERFACE_SECTIONS, AppInterfaceTracker, visibleInterfaceItems,
  statsInterfaceSections, addNoteInterfaceControls, noteEditInterfaceControls } from '../../entry/src/main/ets/model/AppInterface.ts';
import { noteFieldDisplayKey, noteTypeDisplayKey } from '../../entry/src/main/ets/model/NoteTypePresentation.ts';
import { buildAgentAppStructure } from '../../entry/src/main/ets/model/agent/AgentAppStructure.ts';
import { loadComponentLogic, loadPlatformModule } from './platform-module-harness.mjs';

const read = path => readFileSync(new URL('../../entry/src/main/ets/' + path, import.meta.url),'utf8');
const strings = locale => new Map(JSON.parse(readFileSync(new URL(`../../entry/src/main/resources/${locale}/element/string.json`,import.meta.url),'utf8')).string.map(x=>[x.name,x.value]));
const zh = strings('base'), en = strings('en_US');
const localize = key => {assert.ok(zh.has(key),key);return zh.get(key);};
const context = {simple:false,agent:true,cloudDeck:false,themeHasTextures:false};
const result = (tracker,id,locale=localize) => buildAgentAppStructure(context,id,'',locale,[],[],tracker.snapshot());
function dependencies(tracker) {
  const namedResourceText = (_,key) => localize(key);
  const text = {APP_INTERFACE_SURFACES,namedResourceText};
  const note = {noteFieldDisplayKey,noteTypeDisplayKey,namedResourceText};
  return {appInterface:tracker,namedResourceText,visibleInterfaceItems,statsInterfaceSections,addNoteInterfaceControls,noteEditInterfaceControls,
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
