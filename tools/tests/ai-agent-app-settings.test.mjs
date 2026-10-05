// SPDX-License-Identifier: AGPL-3.0-or-later
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { agentSettingDefinitions, agentSettingsFunctionTools, decodeSettingsArguments, requestedThemeMode, decodeSettingChange } from '../../entry/src/main/ets/model/agent/AgentSettingsTools.ts';
import { ThemeModeSession, isAppThemeMode } from '../../entry/src/main/ets/model/settings/ThemeModeSession.ts';
import { agentFunctionTools } from '../../entry/src/main/ets/model/agent/AgentToolCatalog.ts';
import { toolRiskOf } from '../../entry/src/main/ets/model/agent/AgentPolicy.ts';
import { parseAgentToolJsonObject, AgentToolSchemaError } from '../../entry/src/main/ets/model/agent/AgentToolSchemas.ts';
import { decodeAgentClarificationRequest } from '../../entry/src/main/ets/model/agent/AgentClarification.ts';
import { THEME_CATALOG, isThemeAvailable, UNLOCKED_CONTENTS_KEY } from '../../entry/src/main/ets/model/ThemeCatalog.ts';
import { ThemeColorSession, isThemeId } from '../../entry/src/main/ets/model/settings/ThemeColorSession.ts';
import { agentPreferenceDefinitions, agentWritablePreferenceIds, decodeWritablePreference, decodeAgentPreference } from '../../entry/src/main/ets/model/agent/AgentPreferenceSettings.ts';
import { localPreferenceApi } from './local-preference-harness.mjs';
import { CARD_TEXT_SIZE_KEY, DEFAULT_CARD_TEXT_SIZE, normalizeCardTextSize } from '../../entry/src/main/ets/model/CardTextSize.ts';
import * as deckAppearance from '../../entry/src/main/ets/model/DeckListAppearance.ts';
const { DECK_LIST_NARROW_KEY, DECK_LIST_STYLE_KEY } = deckAppearance;
import { buildAgentDeckSettings } from '../../entry/src/main/ets/model/agent/AgentDeckSettings.ts';
import { emptyDeckConfigSettings } from '../../entry/src/main/ets/proto/messages/DeckConfigMessages.ts';
import { AgentApprovalRequired, createAgentAction, AgentActionLedger } from '../../entry/src/main/ets/model/agent/AgentAction.ts';
import { loadPlatformModule } from './platform-module-harness.mjs';
import { buildAgentAppStructure } from '../../entry/src/main/ets/model/agent/AgentAppStructure.ts';
import { AppInterfaceTracker } from '../../entry/src/main/ets/model/AppInterface.ts';
import { themeDefinition } from '../../entry/src/main/ets/model/ThemeCatalog.ts';
import { AgentAppNavigationSession } from '../../entry/src/main/ets/model/agent/AgentAppNavigation.ts';

function fixture() {
  const state = { color: 'aurora', activeColor: 'aurora', fsrs: false, colorWrites: [], fsrsWrites: [], locked: true, mode: 'system', active: 'system', writes: [], changes: [], reads: [], failSave: false };
  state.simple = true; state.agent = true; state.foreground = true; state.resourceReads = [];
  const views = new AppInterfaceTracker();
  state.localCache = new Map(); state.localDisk = new Map(); state.localActive = new Map();
  state.localWrites = []; state.failLocalSave = false; state.failLocalApply = false;
  const localStorage = {
    get: () => ({}), setOrCreate: (key,value) => {
      if (state.failLocalApply) throw Error('UI unavailable');
      state.localActive.set(key,value);
    }
  };
  const localApi = localPreferenceApi(localStorage);
  const localStore = {
    getSync: (key,fallback) => state.localCache.has(key) ? state.localCache.get(key) : fallback,
    get: async (key,fallback) => localStore.getSync(key,fallback),
    putSync: (key,value) => { state.localWrites.push([key,value]); state.localCache.set(key,value); },
    flush: async () => { if (state.failLocalSave) throw Error('disk full'); state.localDisk = new Map(state.localCache); }
  };
  const localDependencies = { ...localApi, AppStorage: localStorage,
    preferences: {getPreferencesSync: () => localStore},
    CARD_TEXT_SIZE_KEY, DEFAULT_CARD_TEXT_SIZE, normalizeCardTextSize, ...deckAppearance };
  const saveCardTextSize = loadPlatformModule('utils/CardTextSizeStore.ets','saveCardTextSize',localDependencies);
  const { saveDeckListStyle, legacyDeckListStyle } = loadPlatformModule('utils/DeckListAppearanceStore.ets','({saveDeckListStyle, legacyDeckListStyle})',localDependencies);
  const saveStudyHaptics = loadPlatformModule('utils/StudyHaptics.ets','saveStudyHaptics',localDependencies);
  const readAgentPreference = loadPlatformModule('backend/agent/AgentPreferenceReader.ets','readAgentPreference', {
    ...localApi, agentPreferenceDefinitions, agentWritablePreferenceIds, decodeAgentPreference, legacyDeckListStyle,
    AppStorage: localStorage, preferences: {getPreferences: async () => localStore}
  });
  const themes = new ThemeModeSession({
    readSavedMode: async () => state.mode,
    saveMode: async mode => { if (state.failSave) throw Error('disk'); state.writes.push(mode); state.mode = mode; },
    applyMode: async mode => { state.active = mode; }, systemDark: () => true
  });
  const colors = new ThemeColorSession({
    readSavedColor: async () => state.color,
    saveColor: async color => { state.colorWrites.push(color); state.color = color; },
    applyColor: color => { state.activeColor = color; },
    isAvailable: color => color !== 'iridescent' || !state.locked
  });
  const readFsrsEnabled = async () => state.fsrs;
  const Registry = loadPlatformModule('backend/agent/AgentToolRegistry.ets', 'AgentToolRegistry', {
    toolRiskOf, parseAgentToolJsonObject, decodeAgentClarificationRequest, AgentApprovalRequired
  });
  const Tools = loadPlatformModule('backend/agent/AgentAppSettingsTools.ets', 'AgentAppSettingsTools', {
    buildAgentAppStructure, appInterface: views, themeDefinition,
    AI_AGENT_CHANNELS_APP_STORAGE_KEY: 'aiAgentChannelsEnabled', CLOUD_DECK_CHANNEL_ENABLED: false, APP_FOREGROUND_KEY: 'appForeground',
    agentSettingDefinitions, decodeSettingsArguments, requestedThemeMode, isAppThemeMode, AgentToolSchemaError,
    appThemeSession: themes, appThemeColorSession: colors, THEME_CATALOG, isThemeAvailable, UNLOCKED_CONTENTS_KEY, isThemeId,
    createAgentAction, readFsrsEnabled, agentPreferenceDefinitions, buildAgentDeckSettings,
    当前语言模式: () => 'en', readSavedStudyQuickAnswerMode: async () => 2,
    readAgentPreference,
    统计服务: class { async 获取图表偏好() { return {calendarFirstDayOfWeek:1,cardCountsSeparateInactive:true,browserLinksSupported:false,futureDueShowBacklog:true}; } },
    AppStorage: { get: key => {
      if (key === 'abilityContext') return { resourceManager: { getStringByNameSync: key => {state.resourceReads.push(key);return state.resourceLabels?.get(key) ?? key;} } };
      if (key === 'simpleMode') return state.simple;
      if (key === 'aiAgentChannelsEnabled') return state.agent;
      if (key === 'appForeground') return state.foreground;
      return key === 'colorTheme' ? state.activeColor : key === UNLOCKED_CONTENTS_KEY ? (state.locked ? [] : ['theme-iridescent']) : state.active;
    } },
    牌组配置服务: class { async 获取牌组配置编辑视图(id) {
      state.reads.push(id);
      return { currentDeck: { name:'English',configId:8,parentConfigIds:[5],limits:{new:0,newToday:4,newTodayActive:true} },
        allConfigs:[{useCount:3,config:{id:8,name:'Shared',config:{...emptyDeckConfigSettings(),newPerDay:20,reviewsPerDay:200,learnSteps:[1,10],desiredRetention:0.9,waitForAudio:true}}}],
        fsrs:true,applyAllParentLimits:true,newCardsIgnoreReviewLimit:false };
    } }
  });
  const scope = { assertReadableDeckIds(ids) { if (ids.some(id => id !== 12)) throw Error('scope'); } };
  const registry = new Registry();
  const tools = new Tools(scope, change => state.changes.push(change), themes);
  tools.register(registry);
  const call = (name,args) => registry.execute({id:'call',name,argumentsJson:JSON.stringify(args)});
  const Executor = loadPlatformModule('backend/agent/AgentActionExecutor.ets', 'AgentActionExecutor', {
    牌组服务: class {}, 笔记类型服务: class {}, AgentActionLedger, decodeSettingChange, appThemeColorSession: colors,
    LocalPreferenceWriteError: localApi.LocalPreferenceWriteError, saveCardTextSize, saveDeckListStyle, saveStudyHaptics,
    设置FSRS开启状态: async (enabled, expected) => {
      if (state.fsrs !== expected) throw Error('setting_changed_since_proposal');
      if (state.fsrs !== enabled) state.fsrsWrites.push(enabled);
      state.fsrs = enabled; return enabled;
    }
  });
  const executor = new Executor({...scope, currentCreateTarget: () => [0,0]}, {});
  return {state,themes,colors,tools,registry,call,executor,saveCardTextSize,saveDeckListStyle,saveStudyHaptics,views};
}

test('the registered app interface tool reads fresh UI mode, observations and actual turn tool capabilities without writes', async () => {
  const f=fixture();f.tools.setInterfaceTools(agentFunctionTools(100,'assistant'));
  f.views.observe({surface:'home_more',sectionId:'',selectedId:'',optionIds:['settings'],optionLabels:['Settings'],busy:false});
  let view=JSON.parse((await f.call('get_app_structure',{surface:'settings',sectionId:'scheduler'})).outputJson);
  assert.equal(view.sections[0].cardCount,2); assert.deepEqual(view.observations,[]);
  f.views.showPage('agent');
  const current=JSON.parse((await f.call('get_app_structure',{surface:'home_more'})).outputJson);
  assert.equal(current.observations[0].surface,'home_more');assert.equal(current.foregroundSurface,'agent');
  f.state.foreground=false;
  assert.equal(JSON.parse((await f.call('get_app_structure',{surface:'home_more'})).outputJson).foregroundSurface,'');
  f.state.foreground=true;
  f.state.simple=false;f.views.leave('home_more');
  view=JSON.parse((await f.call('get_app_structure',{surface:'settings',sectionId:'scheduler'})).outputJson);
  assert.equal(view.sections[0].cardCount,4);assert.deepEqual(view.observations,[]);
  assert.equal(view.sections[0].cards.find(x=>x.id==='algorithm').items.find(x=>x.id==='fsrs_enabled').writeTool,'propose_set_fsrs');
  f.tools.setInterfaceTools([]);
  view=JSON.parse((await f.call('get_app_structure',{surface:'settings',sectionId:'scheduler'})).outputJson);
  assert.equal(view.sections[0].cards.find(x=>x.id==='algorithm').items.find(x=>x.id==='fsrs_enabled').writeTool,'');
  assert.deepEqual(f.state.writes,[]);assert.deepEqual(f.state.localWrites,[]);assert.deepEqual(f.state.fsrsWrites,[]);
  await assert.rejects(f.call('get_app_structure',{surface:'unknown'}),/invalid_tool_arguments/);
});

test('registered app structure supplies the deck operation teaching guide from current language resources without writes', async () => {
  const f=fixture();f.tools.setInterfaceTools(agentFunctionTools(100,'assistant'));
  for(const locale of ['base','en_US']) {
    f.state.resourceLabels=new Map(JSON.parse(readFileSync(new URL(`../../entry/src/main/resources/${locale}/element/string.json`,import.meta.url))).string.map(item=>[item.name,item.value]));
    const catalog=JSON.parse((await f.call('get_app_structure',{})).outputJson);
    const sort=catalog.surfaces.find(item=>item.id==='deck_reorder');
    assert.equal(catalog.surfaces.some(item=>item.id==='deck_level_menu'),false);
    assert.equal(sort.instructions,f.state.resourceLabels.get('deck_reorder_instructions'));
    for(const key of ['deck_menu_reorder','deck_reorder_exit','deck_reorder_done'])
      assert.ok(sort.instructions.includes(f.state.resourceLabels.get(key)),`${locale}: teach the currently displayed label ${key}`);
    assert.match(sort.instructions,locale==='base'?/同一个父牌组.*顶级牌组/:/same parent.*top-level decks/);
    assert.match(sort.instructions,locale==='base'?/牌组详情的“更多”.*调整牌组层级/:/More in its deck details.*Change deck hierarchy/);
    const detail=JSON.parse((await f.call('get_app_structure',{surface:'deck_reorder'})).outputJson);
    assert.equal(detail.surfaces[0].instructions,sort.instructions);
    assert.notEqual(detail.surfaces[0].items.find(item=>item.id==='decks').opens,'deck_level_menu');
    assert.deepEqual(detail.observations,[],'instructions do not fabricate an open menu or enabled controls');
  }
  assert.deepEqual(f.state.writes,[]);assert.deepEqual(f.state.localWrites,[]);assert.deepEqual(f.state.reads,[]);
});

test('registered app structure reports current navigation readiness without caching runtime state or granting permission', async () => {
  const f=fixture();f.tools.setInterfaceTools(agentFunctionTools(100,'assistant'));f.views.showPage('agent');
  const host={busy:false,names:['AiCardPage']};
  const session=new AgentAppNavigationSession({context:()=>({simple:true,agent:true,cloudDeck:false,themeHasTextures:false}),
    canNavigate:()=>true,collectionBusy:()=>host.busy,pathNames:()=>host.names,
    assertReadableTarget(){throw Error('must_not_discover');},readTarget:async()=>{throw Error('must_not_read');},
    navigate(){throw Error('must_not_navigate');}});
  f.tools.setNavigationReadiness(()=>session.readiness());
  const read=async()=>JSON.parse((await f.call('get_app_structure',{})).outputJson);
  const first=await read();assert.ok(first.actions.every(x=>x.available&&x.executionState==='ready'));
  host.busy=true;let next=await read();assert.equal(next.revision,first.revision,'runtime occupancy is not a capability change');
  assert.ok(next.actions.every(x=>x.executionState==='blocked'&&x.blockedReason==='navigation_collection_busy'));
  host.busy=false;host.names=['EditNotePage','AiCardPage'];next=await read();
  assert.equal(next.actions.find(x=>x.id==='open_deck_options').blockedReason,'navigation_unsaved_page');
  assert.equal(next.actions.find(x=>x.id==='open_stats').executionState,'ready');
  f.state.foreground=false;assert.ok((await read()).actions.every(x=>x.executionState==='blocked'));
  f.tools.setInterfaceTools([]);next=await read();assert.notEqual(next.revision,first.revision);
  assert.ok(next.actions.every(x=>!x.available&&x.executionState==='unavailable'&&x.tool===''));
  assert.deepEqual(f.state.reads,[]);assert.deepEqual(f.state.writes,[]);assert.deepEqual(f.state.localWrites,[]);
});

test('both modes advertise executable setting tools with strict examples and explicit write classification', async () => {
  for (const mode of ['create','edit']) {
    const catalog = agentFunctionTools(25, mode);
    for (const tool of agentSettingsFunctionTools()) {
      assert.ok(catalog.some(value => value.name === tool.name));
      assert.doesNotThrow(() => decodeSettingsArguments(tool.name, tool.exampleArgumentsJson));
    }
  }
  const f = fixture();
  assert.equal(toolRiskOf('set_theme_mode'), 'setting_write');
  assert.throws(() => f.registry.registerRead('set_theme_mode', {}), /tool_registration_rejected/);
  assert.throws(() => f.registry.registerSetting('propose_delete_notes', {}), /tool_registration_rejected/);
  assert.equal(f.registry.isDraftTool('set_theme_mode'), false);
  assert.equal(JSON.parse((await f.call('list_settings', {})).outputJson).settings.length, agentSettingDefinitions().length);
  const state = JSON.parse((await f.call('get_settings', {ids:['theme_mode']})).outputJson);
  assert.equal(state.themeMode,'system'); assert.equal(state.effectiveDark,true);
  assert.deepEqual(f.state.writes, []);
});

test('registered structure recommendations use the actual source page and current tools without acquiring write scope', async () => {
  const f = fixture(); f.tools.setInterfaceTools(agentFunctionTools(100, 'assistant'));
  f.views.showPage('browser');
  f.views.observe({surface:'browser', sectionId:'list', selectedId:'cards', optionIds:[], optionLabels:[], optionsTotal:0, busy:false});
  f.views.hidePage('browser'); f.views.showPage('agent');
  let value = JSON.parse((await f.call('get_app_structure', {})).outputJson);
  assert.equal(value.contextSurface, 'browser');
  assert.deepEqual(value.recommendations.map(x=>x.id), ['browser_empty']);
  assert.deepEqual(value.recommendations[0].evidence, [{id:'results_total', value:'0'}]);
  assert.equal(value.recommendations[0].requiresUserRequest, true);
  f.state.foreground = false;
  value = JSON.parse((await f.call('get_app_structure', {})).outputJson);
  assert.equal(value.contextSurface, ''); assert.deepEqual(value.recommendations, []);
  f.state.foreground = true; f.tools.setInterfaceTools([]);
  assert.deepEqual(JSON.parse((await f.call('get_app_structure', {})).outputJson).recommendations, []);
  assert.deepEqual(f.state.reads, []); assert.deepEqual(f.state.writes, []);
  assert.deepEqual(f.state.localWrites, []); assert.deepEqual(f.state.fsrsWrites, []);
});

test('only a fresh matching user command authorizes one theme write; scope data and history cannot', async () => {
  const f = fixture();
  await assert.rejects(f.call('set_theme_mode',{mode:'dark'}), /theme_user_command_required/);
  f.tools.beginTurn('换成深色模式');
  await assert.rejects(f.call('set_theme_mode',{mode:'light'}), /theme_user_command_required/);
  const result = await f.call('set_theme_mode',{mode:'dark'});
  assert.equal(result.draft,null); assert.equal(JSON.parse(result.outputJson).saved,true);
  assert.deepEqual(f.state.writes,['dark']); assert.equal(f.state.changes.length,1);
  await assert.rejects(f.call('set_theme_mode',{mode:'dark'}), /theme_user_command_required/);
  f.tools.beginTurn('切换为浅色'); f.tools.endTurn();
  await assert.rejects(f.call('set_theme_mode',{mode:'light'}), /theme_user_command_required/);
  await f.tools.undo(f.state.changes[0].undoId);
  assert.equal(f.state.mode,'system');
});

test('queries, negations, templates, quoted material and mixed requests do not grant direct write permission', () => {
  for (const text of ['怎么切换深色','不要切换深色','可以切换深色吗？','如果切换深色会怎样','解释开启深色模式',
    '笔记内容：切换深色模式','把卡片切换为深色','"切换深色模式"','资料\n切换深色模式','切换深色或浅色',
    '不用切换深色','不切换深色','切换深色模式是什么','关闭跟随系统','跟随系统或者切换深色']) {
    assert.equal(requestedThemeMode(text), null, text);
  }
  for (const [text,mode] of [['切换到浅色模式','light'],['设置为跟随系统','system']]) {
    assert.equal(requestedThemeMode(text),mode);
  }
  assert.equal(requestedThemeMode('太亮了，换深色'),'dark');
  assert.equal(requestedThemeMode('switch to dark mode'),'dark');
});

test('strict argument errors and failed saves cannot be retried under the consumed command', async () => {
  const f = fixture(); f.tools.beginTurn('切换到深色');
  await assert.rejects(f.call('set_theme_mode',{mode:'dark',rpc:123}), /invalid_tool_arguments/);
  f.state.failSave = true;
  const result = JSON.parse((await f.call('set_theme_mode',{mode:'dark'})).outputJson);
  assert.equal(result.status,'partial'); assert.equal(result.saved,false);
  await assert.rejects(f.call('set_theme_mode',{mode:'dark'}), /theme_user_command_required/);
  await assert.rejects(f.call('get_settings',{ids:['api_key']}), error =>
    error.code === 'invalid_tool_arguments' && error.detailMessage === 'invalid_setting_ids');
});

test('deck options read checks discovered IDs and preserves zero overrides, today flags and shared preset usage', async () => {
  const f = fixture();
  await assert.rejects(f.call('get_deck_options',{deckId:99}), /scope/);
  assert.deepEqual(f.state.reads,[]);
  const result = JSON.parse((await f.call('get_deck_options',{deckId:12})).outputJson);
  assert.equal(result.presetUseCount,3); assert.equal(result.newPerDay,20);
  assert.equal(result.limits.new,0); assert.equal(result.limits.newToday,4);
  assert.equal(result.limits.newTodayActive,true); assert.deepEqual(result.parentPresetIds,[5]);
  assert.deepEqual(f.state.writes,[]);
});

test('page binds authorization to fresh raw user intent and exposes undo without restoring historical permits', () => {
  const source = readFileSync(new URL('../../entry/src/main/ets/pages/AI制卡页.ets',import.meta.url),'utf8');
  assert.match(source,/beginTurn\(existingUserMessageId === 0 && resumeOutput.length === 0 \? intentText : ''\)/);
  assert.match(source,/appSettingsTools\?\.endTurn\(\)/);
  assert.match(source,/this\.appSettingsTools\.register\(registry\)/);
  assert.match(source,/this\.appSettingsTools\.undo\(id\)/);
});


test('broad settings catalog has executable reads, exact schemas, no secret keys and no synthetic write support', async () => {
  const f = fixture();
  const definitions = agentSettingDefinitions();
  assert.equal(definitions.length, 20);
  assert.equal(new Set(definitions.map(x => x.id)).size, definitions.length);
  const ids = definitions.map(x => x.id);
  const schema = JSON.parse(agentSettingsFunctionTools().find(x => x.name === 'get_settings').parametersJson);
  assert.deepEqual(schema.properties.ids.items.enum, ids);
  assert.equal(schema.properties.ids.maxItems, ids.length);
  const output = JSON.parse((await f.call('get_settings', {ids})).outputJson);
  assert.equal(output.scope, 'device_and_collection');
  assert.equal(output.language, 'en'); assert.equal(output.studyQuickAnswer, 2);
  assert.equal(output.fsrsEnabled, false); assert.equal(output.colorTheme, 'aurora');
  assert.equal(output.activeColorTheme, 'aurora');
  assert.equal(output.preferences.length, agentPreferenceDefinitions().length);
  assert.equal(output.preferences.find(x => x.id === 'sync_media').value, true);
  assert.equal(output.graphPreferences.futureDueShowBacklog, true);
  assert.deepEqual(f.state.writes, []); assert.deepEqual(f.state.colorWrites, []);
  assert.deepEqual(f.state.fsrsWrites, []);
  for (const id of ['api_key', 'sync_hkey', 'tokens', 'fingerprint', 'abilityContext']) {
    assert.throws(() => decodeSettingsArguments('get_settings', JSON.stringify({ids:[id]})), /invalid_setting_ids/);
  }
  assert.throws(() => decodeSettingsArguments('get_settings', '{"ids":["language","language"]}'), /invalid_setting_ids/);
  assert.equal(definitions.find(x => x.id === 'sync_media').writable, false);
  for (const id of agentWritablePreferenceIds()) {
    assert.equal(definitions.find(x => x.id === id).writable,true);
    assert.equal(definitions.find(x => x.id === id).writeTool,'propose_set_setting');
  }
  const fsrsOnly = JSON.parse((await f.call('get_settings', {ids:['fsrs_enabled']})).outputJson);
  assert.equal(fsrsOnly.scope, 'collection'); assert.equal(fsrsOnly.themeMode, undefined);
});

test('full deck options expose scheduler, timer, audio and FSRS fields while bounding and marking large values', async () => {
  const f = fixture();
  const options = JSON.parse((await f.call('get_deck_options',{deckId:12})).outputJson);
  assert.equal(options.settings.desiredRetention,0.9); assert.equal(options.settings.waitForAudio,true);
  assert.equal(options.settings.showTimer,false);
  const config = emptyDeckConfigSettings();
  config.fsrsParams6 = Array.from({length:65}, (_,i) => i);
  config.paramSearch = 'x'.repeat(2001);
  config.other = new Uint8Array([1,2]); config.preserved = [new Uint8Array([3])];
  const view = buildAgentDeckSettings(config);
  assert.equal(view.settings.fsrsParams6.length,64); assert.equal(view.settings.paramSearch.length,2000);
  assert.deepEqual(view.truncatedFields,['fsrsParams6','paramSearch']);
  assert.ok(!('other' in view.settings)); assert.ok(!('preserved' in view.settings));
  view.settings.fsrsParams6[0] = 999; assert.equal(config.fsrsParams6[0],0);
});

test('theme catalog enforces entitlements and setting proposals perform no writes before exact one-time confirmation', async () => {
  const f = fixture();
  const colors = JSON.parse((await f.call('list_theme_colors',{})).outputJson).colors;
  assert.equal(colors.length, THEME_CATALOG.length);
  assert.equal(colors.find(x => x.id === 'iridescent').available,false);
  await assert.rejects(f.call('propose_set_theme_color',{themeId:'iridescent'}), /theme_color_locked/);
  const proposed = await f.call('propose_set_theme_color',{themeId:'forest'});
  assert.equal(proposed.action.kind,'setting_change'); assert.equal(proposed.draft,null);
  assert.deepEqual(JSON.parse(proposed.action.payloadJson), {settingId:'color_theme',before:'aurora',after:'forest'});
  assert.deepEqual(f.state.colorWrites,[]);
  await assert.rejects(f.executor.executeConfirmed(proposed.action), /confirmation_mismatch/);
  f.executor.registerPending(proposed.action);
  const payload = proposed.action.payloadJson;
  proposed.action.payloadJson = payload.replace('forest','sunset');
  await assert.rejects(f.executor.executeConfirmed(proposed.action), /confirmation_mismatch/);
  assert.deepEqual(f.state.colorWrites,[]);
  proposed.action.payloadJson = payload;
  const completed = JSON.parse(await f.executor.executeConfirmed(proposed.action));
  assert.equal(completed.saved,true); assert.equal(completed.applied,true);
  assert.deepEqual(f.state.colorWrites,['forest']); assert.equal(f.state.activeColor,'forest');
  await assert.rejects(f.executor.executeConfirmed(proposed.action), /confirmation_mismatch/);
});

test('stale setting proposals fail; FSRS confirmation is collection-wide and same-state requests never reschedule', async () => {
  const f = fixture();
  const stale = (await f.call('propose_set_theme_color',{themeId:'forest'})).action;
  f.executor.registerPending(stale); await f.colors.setColor('sunset');
  await assert.rejects(f.executor.executeConfirmed(stale), /setting_changed_since_proposal/);
  assert.deepEqual(f.state.colorWrites,['sunset']);
  for (const enabled of [true,true,false]) {
    const action = (await f.call('propose_set_fsrs',{enabled})).action;
    const writes = f.state.fsrsWrites.length;
    f.executor.registerPending(action);
    assert.equal(f.state.fsrsWrites.length,writes);
    const result = JSON.parse(await f.executor.executeConfirmed(action));
    assert.equal(result.scope,'collection'); assert.equal(result.fsrsEnabled,enabled);
    assert.equal(result.rescheduled,enabled && writes === 0);
  }
  assert.deepEqual(f.state.fsrsWrites,[true,false]);
  const staleFsrs = (await f.call('propose_set_fsrs',{enabled:true})).action;
  f.executor.registerPending(staleFsrs); f.state.fsrs=true;
  await assert.rejects(f.executor.executeConfirmed(staleFsrs), /setting_changed_since_proposal/);
  for (const payload of [null, [], {settingId:'api_key',before:'a',after:'b'},
    {settingId:'fsrs_enabled',before:'false',after:'true',rpc:42},
    {settingId:'fsrs_enabled',before:'0',after:'1'}, {settingId:'color_theme',before:'aurora',after:'unknown'}]) {
    assert.throws(() => decodeSettingChange(JSON.stringify(payload)), /invalid_setting_change/);
  }
});

test('partial application and write failures preserve a consumed action and never claim completion', async () => {
  const f = fixture();
  const action = (await f.call('propose_set_theme_color',{themeId:'forest'})).action;
  const Executor = loadPlatformModule('backend/agent/AgentActionExecutor.ets', 'AgentActionExecutor', {
    牌组服务: class {}, 笔记类型服务: class {}, AgentActionLedger, decodeSettingChange,
    appThemeColorSession: {async setColor() { return {status:'partial',saved:true,applied:false,errorCode:'theme_color_apply_failed'}; }}
  });
  const executor = new Executor({currentCreateTarget:() => [0,0]},{});
  executor.registerPending(action);
  const result = JSON.parse(await executor.executeConfirmed(action));
  assert.equal(result.status,'partial'); assert.equal(action.status,'failed');
  await assert.rejects(executor.executeConfirmed(action), /confirmation_mismatch/);
});

test('local setting proposals execute real shared stores only after one exact confirmation in every mode', async () => {
  for (const mode of ['assistant','create','edit']) {
    const tool = agentFunctionTools(25,mode).find(x => x.name === 'propose_set_setting');
    assert.ok(tool); assert.equal(toolRiskOf(tool.name),'write');
    assert.deepEqual(JSON.parse(tool.parametersJson).properties.settingId.enum,agentWritablePreferenceIds());
  }
  const f = fixture();
  assert.throws(() => f.registry.registerRead('propose_set_setting',{}), /tool_registration_rejected/);
  for (const [settingId,value,key,stored] of [
    ['card_text_size','130',CARD_TEXT_SIZE_KEY,130],
    ['deck_list_style','double_narrow',DECK_LIST_STYLE_KEY,'double_narrow'],
    ['study_haptics','false','studyHapticsEnabled',false]
  ]) {
    const action = (await f.call('propose_set_setting',{settingId,value})).action;
    assert.equal(action.kind,'setting_change');
    assert.equal(f.state.localDisk.has(key),false);
    assert.equal(f.state.localActive.has(key),false);
    await assert.rejects(f.executor.executeConfirmed(action), /confirmation_mismatch/);
    f.executor.registerPending(action);
    const payload = action.payloadJson;
    action.payloadJson = payload.replace(value, settingId === 'card_text_size' ? '140' : value === 'true' ? 'false' : 'true');
    await assert.rejects(f.executor.executeConfirmed(action), /confirmation_mismatch/);
    action.payloadJson = payload;
    const result = JSON.parse(await f.executor.executeConfirmed(action));
    assert.equal(result.status,'completed'); assert.equal(result.scope,'device');
    assert.equal(result.saved,true); assert.equal(result.applied,true);
    assert.equal(f.state.localDisk.get(key),stored); assert.equal(f.state.localActive.get(key),stored);
    const read = JSON.parse((await f.call('get_settings',{ids:[settingId]})).outputJson);
    assert.equal(read.preferences[0].value,stored);
    await assert.rejects(f.executor.executeConfirmed(action), /confirmation_mismatch/);
    const writes = f.state.localWrites.length;
    const same = (await f.call('propose_set_setting',{settingId,value})).action;
    f.executor.registerPending(same); await f.executor.executeConfirmed(same);
    assert.equal(f.state.localWrites.length,writes,'same-state confirmation performs no persistence write');
  }
});

test('manual changes invalidate local proposals and unsupported or malformed settings never write', async () => {
  const f = fixture();
  const cases = [
    ['card_text_size','140',() => f.saveCardTextSize(110)],
    ['deck_list_style','single_narrow',() => f.saveDeckListStyle('double_wide')],
    ['study_haptics','false',() => f.saveStudyHaptics(false)]
  ];
  for (const [settingId,value,manual] of cases) {
    const action = (await f.call('propose_set_setting',{settingId,value})).action;
    f.executor.registerPending(action); await manual();
    const writes = f.state.localWrites.length;
    await assert.rejects(f.executor.executeConfirmed(action),/setting_changed_since_proposal/);
    assert.equal(f.state.localWrites.length,writes);
  }
  const writes = f.state.localWrites.length;
  for (const [settingId,value] of [['language','en'],['api_key','secret'],['card_text_size','49'],
    ['card_text_size','201'],['card_text_size','100.5'],['card_text_size','1e2'],
    ['card_text_size','0100'],['study_haptics','1'],['deck_list_style','true']]) {
    assert.throws(() => decodeSettingsArguments('propose_set_setting',JSON.stringify({settingId,value})));
    assert.throws(() => decodeSettingChange(JSON.stringify({settingId,before:value,after:value})));
    await assert.rejects(f.call('propose_set_setting',{settingId,value}),/invalid_tool_arguments/);
  }
  assert.equal(f.state.localWrites.length,writes);
  for (const [settingId,value] of [['card_text_size','50'],['card_text_size','200'],['study_haptics','true']]) {
    assert.doesNotThrow(() => decodeWritablePreference(settingId,value));
  }
});

test('local save and application failures report distinct partial outcomes and consume confirmation', async () => {
  const f = fixture();
  f.state.failLocalSave = true;
  let action = (await f.call('propose_set_setting',{settingId:'card_text_size',value:'150'})).action;
  f.executor.registerPending(action);
  let result = JSON.parse(await f.executor.executeConfirmed(action));
  assert.equal(result.status,'partial'); assert.equal(result.saved,false); assert.equal(result.applied,false);
  assert.equal(f.state.localActive.has(CARD_TEXT_SIZE_KEY),false);
  assert.equal(f.state.localCache.get(CARD_TEXT_SIZE_KEY),100);
  await assert.rejects(f.executor.executeConfirmed(action),/confirmation_mismatch/);
  f.state.failLocalSave = false; f.state.failLocalApply = true;
  action = (await f.call('propose_set_setting',{settingId:'card_text_size',value:'150'})).action;
  f.executor.registerPending(action);
  result = JSON.parse(await f.executor.executeConfirmed(action));
  assert.equal(result.status,'partial'); assert.equal(result.saved,true); assert.equal(result.applied,false);
  assert.equal(f.state.localDisk.get(CARD_TEXT_SIZE_KEY),150);
  assert.equal(action.status,'failed');
});


test('JIDE reads migrated narrow preference and confirms all four styles through the shared store', async () => {
  const f = fixture();
  f.state.localCache.set(DECK_LIST_NARROW_KEY,true);
  const migrated = JSON.parse((await f.call('get_settings',{ids:['deck_list_style']})).outputJson);
  assert.equal(migrated.preferences[0].value,'single_narrow');
  for (const style of deckAppearance.DECK_LIST_STYLES) {
    const action = (await f.call('propose_set_setting',{settingId:'deck_list_style',value:style})).action;
    f.executor.registerPending(action);
    const result = JSON.parse(await f.executor.executeConfirmed(action));
    assert.equal(result.status,'completed');
    assert.equal(f.state.localDisk.get(DECK_LIST_STYLE_KEY),style);
    assert.equal(f.state.localActive.get(DECK_LIST_STYLE_KEY),style);
    assert.equal(f.state.localActive.get(DECK_LIST_NARROW_KEY),deckAppearance.isNarrowDeckListStyle(style));
  }
  f.state.localCache.set(DECK_LIST_NARROW_KEY,'corrupt obsolete density');
  const current = JSON.parse((await f.call('get_settings',{ids:['deck_list_style']})).outputJson);
  assert.equal(current.preferences[0].value,'double_narrow','new style is the single source of truth');
});
