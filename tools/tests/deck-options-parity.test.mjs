// SPDX-License-Identifier: AGPL-3.0-or-later
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import * as catalog from '../../entry/src/main/ets/model/DeckOptionsCatalog.ts';
import { DeckOptionsPresets } from '../../entry/src/main/ets/model/DeckOptionsPresets.ts';
import { DeckOptionsSession, DeckOptionsFsrsState } from '../../entry/src/main/ets/model/home/DeckOptionsSession.ts';
import { emptyDeckConfigSettings, encodeDeckConfig } from '../../entry/src/main/ets/proto/messages/DeckConfigMessages.ts';
import { copyDeckConfig } from '../../entry/src/main/ets/model/DeckConfigSave.ts';
import { 牌组配置表单 } from '../../entry/src/main/ets/model/牌组配置表单.ets';
import { 牌组选项编辑 } from '../../entry/src/main/ets/model/牌组选项编辑.ets';
import { validateDeckOptionText } from '../../entry/src/main/ets/model/DeckOptionValidation.ets';
import { applyDeckOptionEdit } from '../../entry/src/main/ets/model/DeckOptionsEdit.ets';
import { fsrsParams } from '../../entry/src/main/ets/model/FsrsOptions.ts';
import { AppInterfaceTracker, visibleInterfaceItems, APP_INTERFACE_SURFACES } from '../../entry/src/main/ets/model/AppInterface.ts';
import { loadComponentLogic } from './platform-module-harness.mjs';

test('Core upgrade requires re-auditing the deck-option contract before parity checks can pass',()=>{
  const lock=readFileSync(new URL('../../UPSTREAM.lock',import.meta.url),'utf8');
  const value=key=>lock.split(/\r?\n/).find(line=>line.startsWith(key+'='))?.slice(key.length+1);
  assert.equal(value('ANKI_TAG'),catalog.DECK_OPTIONS_UPSTREAM.tag,'Re-audit official deck options when upgrading Core.');
  assert.equal(value('ANKI_RELEASE_COMMIT'),catalog.DECK_OPTIONS_UPSTREAM.commit,'Deck-option parity must match the locked source revision.');
});

function fixture() {
  const config = { id: 1, name: 'Default', mtimeSecs: 5, usn: 3, config: { ...emptyDeckConfigSettings(),
    learnSteps: [1,10], relearnSteps: [10], newPerDay: 20, reviewsPerDay: 200, desiredRetention: .9, historicalRetention: .9,
    initialEase: 2.5, easyMultiplier: 1.3, hardMultiplier: 1.2, intervalMultiplier: 1,
    maximumReviewInterval: 36500, minimumLapseInterval: 1, graduatingIntervalGood: 1, graduatingIntervalEasy: 4,
    leechThreshold: 8, capAnswerTimeToSecs: 60, preserved: [Uint8Array.of(0xc0,0x0c,42)], other: Uint8Array.of(1,2) } };
  const second = copyDeckConfig(config); second.id = 2; second.name = 'Languages';
  const view = { allConfigs: [{config,useCount:3},{config:second,useCount:2}], defaults:copyDeckConfig(config),
    currentDeck:{name:'Target',configId:1,parentConfigIds:[],limits:{review:null,new:null,reviewToday:0,newToday:0,
      reviewTodayActive:false,newTodayActive:false,desiredRetention:null}}, schemaModified:false, cardStateCustomizer:'preserve script',
    fsrs:false, fsrsHealthCheck:true, newCardsIgnoreReviewLimit:false, applyAllParentLimits:false };
  const options = { limits:view.currentDeck.limits,fsrs:false,fsrsHealthCheck:true,newCardsIgnoreReviewLimit:false,applyAllParentLimits:false,fsrsReschedule:false };
  return {config,view,options};
}
test('all 11 groups follow the locked Anki layout; SM-2 and FSRS expose their own options', () => {
  assert.deepEqual(catalog.DECK_OPTION_GROUPS.map(x=>x.id),['daily_limits','new','lapses','display_order','fsrs','burying','audio','timer','auto_advance','easy_days','advanced']);
  const fields=(group,fsrs)=>catalog.visibleDeckOptionFields(catalog.DECK_OPTION_GROUPS.find(x=>x.id===group),fsrs).map(x=>x.key);
  for (const enabled of [false,true]) assert.deepEqual(fields('easy_days',enabled),['easyDaysPercentages']);
  assert.ok(fields('new',false).includes('graduatingIntervalGood'));assert.ok(!fields('new',true).includes('graduatingIntervalGood'));
  assert.ok(!fields('lapses',true).includes('minimumLapseInterval'));
  assert.deepEqual(fields('audio',true),['disableAutoplay','skipQuestionWhenReplayingAnswer']);
  assert.deepEqual(fields('timer',true),['capAnswerTimeToSecs','showTimer','stopTimerOnAnswer']);
  assert.ok(fields('auto_advance',true).includes('waitForAudio'));
  assert.ok(!fields('advanced',false).includes('historicalRetention'));assert.ok(!fields('advanced',true).includes('initialEase'));
  assert.deepEqual(fields('fsrs',false),['fsrsEnabled']);
});
test('review sorting and gather/sort compatibility use official enum values and conditions', () => {
  assert.deepEqual(catalog.deckOptionChoices('reviewOrder',false).map(x=>x.value),[0,1,2,3,4,5,6,12,8,9,10]);
  assert.deepEqual(catalog.deckOptionChoices('reviewOrder',true).map(x=>x.value),[0,1,2,3,4,6,5,7,11,12,8,9,10]);
  assert.deepEqual(catalog.deckOptionChoices('newCardGatherPriority',true).map(x=>x.value),[0,5,1,2,3,4]);
  assert.deepEqual(catalog.deckOptionChoices('newCardSortOrder',true,3).map(x=>x.value),[0,1,4]);
  assert.deepEqual(catalog.deckOptionChoices('newCardSortOrder',true,4).map(x=>x.value),[0,1]);
  assert.equal(catalog.compatibleNewSortOrder(4,4),0);assert.equal(catalog.compatibleNewSortOrder(0,4),4);
});
test('weekday editing retains six other values and maps Monday through Sunday to Core values', () => {
  assert.deepEqual(catalog.easyDayValues([]),[1,1,1,1,1,1,1]);
  const values=[1,.3,1,1,1,1,0];const before=values.slice();
  assert.deepEqual(catalog.updateEasyDay(values,5,.5),[1,.3,1,1,1,.5,0]);assert.deepEqual(values,before);
  assert.throws(()=>catalog.updateEasyDay(values,7,0));assert.throws(()=>catalog.updateEasyDay(values,0,.2));
});
test('learning-step units and percentage editing round-trip through the actual form', () => {
  assert.deepEqual(catalog.parseDeckOptionSteps('30s 1m 2h 1d'),[.5,1,120,1440]);
  assert.equal(catalog.deckOptionStepsText([.5,1,120,1440]),'30s 1m 2h 1d');
  assert.deepEqual(catalog.parseDeckOptionSteps('1 10'),[1,10]);assert.equal(catalog.parseDeckOptionSteps('1x'),null);
  const {config}=fixture();const form=牌组配置表单.从配置创建(config.config);form.学习步骤文本='30s 2h';
  form.目标保留率文本=catalog.percentageValue('95');const target=copyDeckConfig(config);
  assert.equal(form.应用到配置(target.config),true);assert.deepEqual(target.config.learnSteps,[.5,120]);assert.equal(target.config.desiredRetention,.95);
  assert.equal(catalog.percentageText('.9'),'90');assert.equal(catalog.percentageValue(''),'');
  for(const [key,good,bad] of [['capAnswerTimeToSecs','7200','7201'],['historicalRetention','1','0.49'],['secondsToShowQuestion','9999','10000'],['graduatingIntervalGood','9999','10000']]) {
    assert.equal(validateDeckOptionText(form,key,good),'');assert.equal(validateDeckOptionText(form,key,bad),'deck_range_validation_error');
  }
  assert.equal(validateDeckOptionText(form,'newLimit','10000'),'deck_limit_validation_error');
  assert.equal(validateDeckOptionText(form,'easyDaysPercentages','1 1 1 1 1 1 1.1'),'deck_easy_days_validation_error');
});
test('official float bounds survive actual protobuf round trips and still reject values outside Core precision',()=>{
  for(const retention of [.7,.99]){
    const f=fixture();f.config.config.desiredRetention=retention;f.config.config.initialEase=1.31;
    const roundTrip=copyDeckConfig(f.config);const form=牌组配置表单.从配置创建(roundTrip.config);
    assert.equal(catalog.percentageText(String(roundTrip.config.desiredRetention)),String(retention*100));
    assert.deepEqual(form.校验(),[]);
    const limits={...f.view.currentDeck.limits,desiredRetention:roundTrip.config.desiredRetention};
    const options=牌组选项编辑.从视图创建(limits,false,true,false,true);
    assert.deepEqual(options.校验(),[]);assert.equal(options.应用(),true);
    assert.equal(validateDeckOptionText(form,'desiredRetention',retention===.7?'.69999':'.99001'),'deck_retention_validation_error');
  }
  assert.equal(catalog.percentageText('.855'),'86');
});

test('preset selection, creation, cloning, naming and deletion are staged without mutating the loaded view', () => {
  const {config,view}=fixture();const before=encodeDeckConfig(config);const presets=new DeckOptionsPresets(view);
  const draft=copyDeckConfig(config);draft.config.newPerDay=12;
  presets.select('2',draft);assert.equal(presets.entries[0].config.config.newPerDay,12);
  presets.rename('Default',presets.current().config);assert.equal(presets.current().config.name,'Default 2');
  presets.add('Default',presets.current().config,true);assert.equal(presets.current().config.id,0);assert.equal(presets.current().config.name,'Default 3');
  const newKey=presets.selectedKey;presets.add('Fresh',presets.current().config,false);assert.equal(presets.current().config.config.newPerDay,20);
  presets.remove(presets.current().config);assert.equal(presets.selectedKey,newKey);assert.deepEqual(presets.removedIds,[]);
  presets.select('1',presets.current().config);assert.throws(()=>presets.remove(presets.current().config));
  assert.deepEqual(encodeDeckConfig(config),before);assert.equal(view.allConfigs.length,2);
});
test('session saves modified presets with the selected preset last, retains changes after failure and preserves opaque fields', async () => {
  const {config,view,options}=fixture();const states=[],writes=[];let fail=true;
  const session=new DeckOptionsSession(7,{load:async()=>view,save:async request=>{writes.push(request);if(fail)throw Error('disk full');},committed(){}},s=>states.push(s));
  await session.load();const draft=copyDeckConfig(config);draft.config.newPerDay=11;
  assert.equal(session.editPreset('select','2',draft),true);
  const selected=copyDeckConfig(states.at(-1).config);selected.config.reviewsPerDay=300;
  assert.equal(await session.save(selected,true,{...options,mode:1}),false);
  assert.deepEqual(writes[0].configs.map(x=>x.id),[1,2]);assert.equal(writes[0].configs[0].config.newPerDay,11);
  assert.equal(writes[0].configs[1].config.reviewsPerDay,300);assert.equal(writes[0].mode,1);
  assert.deepEqual(writes[0].configs[0].config.preserved,config.config.preserved);
  fail=false;assert.equal(await session.save(selected,true,{...options,mode:1}),true);assert.deepEqual(writes[0],writes[1]);
});
test('deleting a preset and creating several presets uses Core deletion and creation semantics atomically',async()=>{
  const {config,view,options}=fixture();const states=[],writes=[];
  const session=new DeckOptionsSession(7,{load:async()=>view,save:async request=>writes.push(request),committed(){}},s=>states.push(s));
  await session.load();session.editPreset('select','2',config);session.editPreset('remove','',states.at(-1).config);
  session.editPreset('clone','Copy',states.at(-1).config);session.editPreset('create','Fresh',states.at(-1).config);
  await session.save(states.at(-1).config,true,{...options,mode:2});
  assert.deepEqual(writes[0].removedConfigIds,[2]);assert.deepEqual(writes[0].configs.map(x=>x.id),[0,0]);
  assert.deepEqual(writes[0].configs.map(x=>x.name),['Copy','Fresh']);assert.equal(writes[0].mode,2);
  assert.equal(writes[0].cardStateCustomizer,view.cardStateCustomizer);
});
function component() {
  const tracker=new AppInterfaceTracker();const {config,view}=fixture();
  const Fields=loadComponentLogic('components/高级牌组选项面板.ets','高级牌组选项面板',{
    ...catalog,牌组配置表单,牌组选项编辑,validateDeckOptionText,applyDeckOptionEdit,fsrsParams,DeckOptionsFsrsState,
    appInterface:tracker,namedResourceText:(_,key)=>key,$r:key=>key });
  const ui=new Fields();Object.assign(ui,{getUIContext:()=>({}),form:牌组配置表单.从配置创建(config.config),
    options:牌组选项编辑.从视图创建(view.currentDeck.limits,false,false,false,true),defaults:view.defaults.config});
  ui.aboutToAppear();return {ui,tracker,config};
}
test('actual full-mode callbacks honor per-deck and today scopes, including zero and reset to inheritance',()=>{
  const {ui}=component();const daily=catalog.DECK_OPTION_GROUPS[0];const newField=daily.fields[0];
  ui.newScope=1;ui.change(newField,'0');assert.equal(ui.options.新卡限额文本,'0');assert.equal(ui.form.每日新卡数文本,'20');
  ui.newScope=2;ui.change(newField,'0');assert.equal(ui.options.今日新卡启用,true);assert.equal(ui.rawValue('newPerDay'),'0');
  ui.change(newField,'');assert.equal(ui.options.今日新卡启用,false);assert.equal(ui.rawValue('newPerDay'),'');
  ui.newScope=0;ui.change(newField,'30');assert.equal(ui.form.每日新卡数文本,'30');
  const retention=catalog.DECK_OPTION_GROUPS.find(x=>x.id==='fsrs').fields.find(x=>x.key==='desiredRetention');
  ui.retentionScope=1;ui.change(retention,'85');assert.equal(ui.options.目标保留率覆盖文本,'0.85');
  assert.equal(ui.value(retention),'85');assert.equal(ui.defaultValue(retention),'');ui.change(retention,'');assert.equal(ui.options.目标保留率覆盖文本,'');
});
test('actual callbacks handle scheduler visibility, legacy FSRS parameters and weekly state without losing other edits',()=>{
  const {ui,tracker}=component();const field=key=>catalog.DECK_OPTION_GROUPS.flatMap(x=>x.fields).find(x=>x.key===key);
  ui.change(field('newCardGatherPriority'),'4');ui.change(field('newCardSortOrder'),'4');ui.change(field('newCardGatherPriority'),'3');assert.equal(ui.form.取配置().newCardSortOrder,4);
  ui.change(field('newCardGatherPriority'),'4');assert.equal(ui.form.取配置().newCardSortOrder,0);
  ui.change(field('fsrsEnabled'),'true');assert.ok(!ui.fields(catalog.DECK_OPTION_GROUPS.find(x=>x.id==='new')).some(x=>x.key==='graduatingIntervalGood'));
  ui.form.设置浮点数组字段('fsrsParams4',Array(17).fill(1).join(' '));assert.equal(ui.value(field('fsrsParameters')).split(' ').length,17);
  ui.change(field('fsrsParameters'),Array(21).fill(2).join(' '));assert.equal(ui.form.取配置().fsrsParams4.length,0);assert.equal(ui.form.取配置().fsrsParams6.length,21);
  ui.changeDay(6,'0');assert.deepEqual(ui.form.取配置().easyDaysPercentages,[1,1,1,1,1,1,0]);
  const views=tracker.snapshot();assert.equal(views.length,11);assert.ok(views.find(x=>x.surface==='deck_options_group_advanced').items.some(x=>x.id==='historicalRetention'));
  assert.ok(!views.find(x=>x.surface==='deck_options_group_advanced').items.some(x=>x.id==='initialEase'));
  assert.equal(views.find(x=>x.surface==='deck_options_group_advanced').items.find(x=>x.id==='customScheduling').enabled,false);
  ui.aboutToDisappear();assert.equal(tracker.snapshot().length,0);
});
test('simple mode still hides complex settings; UI and JIDE declare the same full-mode fields and resources',()=>{
  const context={simple:true,agent:false,cloudDeck:false,themeHasTextures:false};
  assert.deepEqual(visibleInterfaceItems('deck_options_form',context).map(x=>x.id),['cancel','save','help','newPerDay','reviewsPerDay','learnSteps','reviewOrder']);
  assert.ok(visibleInterfaceItems('deck_options_form',{...context,simple:false}).some(x=>x.id==='easy_days'));
  for(const group of catalog.DECK_OPTION_GROUPS){
    const surface=APP_INTERFACE_SURFACES.find(x=>x.id==='deck_options_group_'+group.id);
    assert.deepEqual(surface.items.map(x=>x.id),group.fields.map(x=>x.key));
  }
  for(const locale of ['base','en_US']){
    const labels=new Map(JSON.parse(readFileSync(new URL('../../entry/src/main/resources/'+locale+'/element/string.json',import.meta.url),'utf8')).string.map(x=>[x.name,x.value]));
    for(const group of catalog.DECK_OPTION_GROUPS)for(const key of [group.titleKey,...group.fields.flatMap(x=>[x.titleKey,x.helpKey])])assert.ok(labels.has(key),locale+' '+key);
    for(const field of catalog.DECK_OPTION_GROUPS.flatMap(x=>x.fields))for(const choice of catalog.deckOptionChoices(field.key,true))assert.ok(labels.has(choice.titleKey),choice.titleKey);
  }
});
