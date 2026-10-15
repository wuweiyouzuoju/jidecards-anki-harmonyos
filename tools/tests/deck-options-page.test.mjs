// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadComponentLogic } from './platform-module-harness.mjs';
import { DeckOptionsSession, DeckOptionsFsrsState } from '../../entry/src/main/ets/model/home/DeckOptionsSession.ts';
import { emptyDeckConfigSettings } from '../../entry/src/main/ets/proto/messages/DeckConfigMessages.ts';
import { 牌组配置表单 } from '../../entry/src/main/ets/model/牌组配置表单.ets';
import { 牌组选项编辑 } from '../../entry/src/main/ets/model/牌组选项编辑.ets';
import { prepareDeckOptionsDraft, deckOptionsDraftFingerprint } from '../../entry/src/main/ets/model/DeckOptionsDraft.ets';
import { deckConfigUseCount } from '../../entry/src/main/ets/model/DeckConfigSave.ts';
import { deckOptionDefaultValues } from '../../entry/src/main/ets/model/DeckOptionsDefaults.ts';
import { AppInterfaceTracker, visibleInterfaceItems } from '../../entry/src/main/ets/model/AppInterface.ts';
import { buildAgentAppStructure } from '../../entry/src/main/ets/model/agent/AgentAppStructure.ts';

const flush = () => new Promise(setImmediate);
const strings = locale => new Map(JSON.parse(readFileSync(new URL(`../../entry/src/main/resources/${locale}/element/string.json`, import.meta.url))).string.map(x => [x.name,x.value]));

async function feature() {
  const tracker = new AppInterfaceTracker();
  const config = {id:1,name:'Default',mtimeSecs:0,usn:0,config:Object.assign(emptyDeckConfigSettings(), {
    newPerDay:20,reviewsPerDay:200,maximumReviewInterval:36500,minimumLapseInterval:1,learnSteps:[1,10],
    graduatingIntervalGood:1,graduatingIntervalEasy:4,initialEase:2.5,easyMultiplier:1.3,hardMultiplier:1.2,
    intervalMultiplier:1,desiredRetention:.9,historicalRetention:.9,capAnswerTimeToSecs:60,leechThreshold:8
  })};
  const view = {currentDeck:{id:7,name:'Target',configId:1,parentConfigIds:[],
    limits:{new:null,review:null,newToday:null,reviewToday:null,newTodayActive:false,reviewTodayActive:false,desiredRetention:null}},
    allConfigs:[{config,useCount:2}],
    defaults:config,cardStateCustomizer:'',newCardsIgnoreReviewLimit:false,fsrs:false,applyAllParentLimits:false,fsrsHealthCheck:true};
  const result = {closes:0,writes:[],fail:false};
  class Session extends DeckOptionsSession {
    constructor(id,backend,publish) { super(id,backend,publish,{beginOperation(){},endOperation(){}},{waitForCollection:async()=>{}}); }
  }
  class Backend {
    async load() { return view; }
    async save(input) { result.writes.push(input); if(result.fail) throw Error('save failed'); }
    committed() {}
  }
  const Host = loadComponentLogic('components/home/DeckOptionsFeature.ets','DeckOptionsFeature', {
    DeckOptionsSession:Session,DeckOptionsFsrsState,牌组配置表单,牌组选项编辑,prepareDeckOptionsDraft,
    deckOptionsDraftFingerprint,deckConfigUseCount,deckOptionDefaultValues,AnkiDeckOptions:Backend,
    appInterface:tracker,visibleInterfaceItems,namedResourceText:(_,key)=>key
  });
  const host = new Host();
  Object.assign(host,{deckId:7,deckName:'Target',getUIContext:()=>({}),onClose(){result.closes++;}});
  host.aboutToAppear();await flush();assert.equal(host.state.phase,'ready',host.state.error);
  return {host,tracker,result,view};
}

test('unchanged and reverted deck edits leave directly; pending changes retain the draft until discard',async()=>{
  const {host,result}=await feature();
  host.requestClose();assert.equal(result.closes,1);assert.equal(host.showDiscard,false);
  host.form.每日新卡数文本='30';host.requestClose();assert.equal(host.showDiscard,true);assert.equal(result.closes,1);
  host.handleBackRequest();assert.equal(host.showDiscard,false);assert.equal(host.form.每日新卡数文本,'30');
  host.form.每日新卡数文本='20';host.requestClose();assert.equal(result.closes,2);
  host.form.每日新卡数文本='invalid';host.requestClose();assert.equal(host.showDiscard,true);
  host.discard();assert.equal(result.closes,3);assert.deepEqual(result.writes,[]);
  host.aboutToDisappear();host.discard();host.requestClose();assert.equal(result.closes,3);
});

test('preset edits, limits and shared-scope changes all receive the same exit protection',async()=>{
  for(const edit of [host=>host.editPreset('clone','Private copy'),host=>host.editPreset('rename','Renamed'),
    host=>{host.options.新卡限额文本='0';},host=>{host.options.applyToSharedDecks=true;}]) {
    const {host,result}=await feature();edit(host);host.requestClose();
    assert.equal(host.showDiscard,true,edit.toString()+' '+host.validationError);assert.deepEqual(result.writes,[]);
    host.handleBackRequest();assert.equal(host.showDiscard,false);host.aboutToDisappear();
  }
});

test('save failure keeps the draft and exit protection, retry commits through the existing session once',async()=>{
  const {host,result}=await feature();host.form.每日新卡数文本='30';result.fail=true;
  host.save(host.form,host.options);assert.equal(host.state.phase,'saving');host.requestClose();
  assert.equal(host.showDiscard,false);assert.equal(result.closes,0);
  await flush();assert.equal(host.state.phase,'ready');assert.equal(host.form.每日新卡数文本,'30');
  host.requestClose();assert.equal(host.showDiscard,true);host.handleBackRequest();result.fail=false;
  host.save(host.form,host.options);await flush();assert.equal(host.state.phase,'saved');assert.equal(result.closes,1);
  assert.equal(result.writes.length,2);assert.deepEqual(result.writes[0],result.writes[1]);
  assert.equal(result.writes[1].configs.at(-1).config.newPerDay,30);host.aboutToDisappear();
});

test('JIDE reads the actual page route, preset expansion and discard controls in both languages',async()=>{
  const {host,tracker}=await feature();host.form.每日新卡数文本='30';host.requestClose();host.publishInterface();
  const Panel=loadComponentLogic('components/牌组选项面板.ets','牌组选项面板',{
    DeckOptionsFsrsState,visibleInterfaceItems,appInterface:tracker,$r:key=>key,namedResourceText:(_,key)=>key
  });
  const panel=new Panel();Object.assign(panel,{form:host.form,options:host.options,getUIContext:()=>({}),简洁模式:false});
  panel.aboutToAppear();let controls=panel.interfaceControls();
  assert.ok(controls.some(x=>x.id==='manage_presets'));assert.ok(!controls.some(x=>x.id==='rename_preset'));
  panel.togglePresetManagement();panel.publishInterface();controls=panel.interfaceControls();
  assert.equal(controls.find(x=>x.id==='manage_presets').selected,true);assert.ok(controls.some(x=>x.id==='rename_preset'));
  assert.equal(tracker.snapshot().find(x=>x.surface==='deck_options_form').values.find(x=>x.id==='presentation').value,'page');
  for(const locale of ['base','en_US']) {
    const names=strings(locale);const structure=buildAgentAppStructure({simple:false,agent:true,cloudDeck:false,themeHasTextures:false},
      'deck_options_discard','',key=>names.get(key),[],[],tracker.snapshot());
  assert.ok(structure.destinations.some(page=>page.surface==='deck_options'));
    assert.deepEqual(structure.surfaces.find(x=>x.id==='deck_options_discard').items.map(x=>x.id),['cancel','discard']);
    assert.ok(names.get('deck_preset_manage'));assert.ok(names.get('deck_options_discard_message'));
  }
  panel.aboutToDisappear();host.aboutToDisappear();assert.equal(tracker.snapshot().length,0);
});

test('deck destination publishes actual foreground visibility and forwards system Back to the draft owner',()=>{
  const source=readFileSync(new URL('../../entry/src/main/ets/pages/DeckOptionsPage.ets',import.meta.url),'utf8');
  const tracker=new AppInterfaceTracker();
  const run=event=>new Function('appInterface',source.match(new RegExp('\\.'+event+'\\(\\(\\): (?:void|boolean) => \\{([^}]+)\\}'))[1]);
  run('onShown')(tracker);assert.equal(tracker.currentPage(),'deck_options');
  const owner={backRequest:0};assert.equal(run('onBackPressed').call(owner,tracker),true);assert.equal(owner.backRequest,1);
  run('onHidden')(tracker);assert.equal(tracker.currentPage(),'');
});
