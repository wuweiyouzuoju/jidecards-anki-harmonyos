// SPDX-License-Identifier: AGPL-3.0-or-later
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, readdirSync } from 'node:fs';
import { APP_INTERFACE_SURFACES, AppInterfaceTracker, visibleInterfaceItems } from '../../entry/src/main/ets/model/AppInterface.ts';
import { appInterfaceSurfaceIds, browserInterfaceMenu, studyInterfaceMenu } from '../../entry/src/main/ets/model/AppInterface.ts';
import { agentInterfaceControls, agentInterfaceTitle, agentImportLabelKey, reminderEditorControls, reminderEditorTitle } from '../../entry/src/main/ets/model/AppInterface.ts';
import { stripTypeScriptTypes } from 'node:module';
import { SETTINGS_GROUPS, settingsItem, visibleSettingsGroups } from '../../entry/src/main/ets/model/SettingsStructure.ts';
import { buildAgentAppStructure, agentInterfaceRevision } from '../../entry/src/main/ets/model/agent/AgentAppStructure.ts';
import { isDoubleColumnDeckListStyle } from '../../entry/src/main/ets/model/DeckListAppearance.ts';
import { OFFICIAL_ANNOUNCEMENTS_ENABLED } from '../../entry/src/main/ets/model/官方公告配置.ts';
import { agentSettingDefinitions, decodeSettingsArguments } from '../../entry/src/main/ets/model/agent/AgentSettingsTools.ts';
import { agentFunctionTools } from '../../entry/src/main/ets/model/agent/AgentToolCatalog.ts';
import { loadComponentLogic, loadPlatformModule } from './platform-module-harness.mjs';
import { appInterfaceDependencies, studyInterfaceMethods } from './app-interface-harness.mjs';
import { loadUiFeedback } from './ui-feedback-harness.mjs';

const read = path => readFileSync(new URL('../../entry/src/main/ets/' + path, import.meta.url),'utf8');
const strings = locale => new Map(JSON.parse(readFileSync(new URL(`../../entry/src/main/resources/${locale}/element/string.json`, import.meta.url),'utf8')).string.map(x=>[x.name,x.value]));
const zh = strings('base'), en = strings('en_US');
const context = {simple:true,agent:true,cloudDeck:false,themeHasTextures:false};
const localize = key => { assert.ok(zh.has(key), 'missing UI resource: '+key); return zh.get(key); };
const tools = agentFunctionTools(100,'assistant');
const structure = (state=context, surface='app', section='') => buildAgentAppStructure(state,surface,section,localize,agentSettingDefinitions(),tools,[]);

test('JIDE reads current Core rendering ownership and the same supported TTS parameters as the player',()=>{
  const support=structure().cardRendering;
  assert.equal(support.mediaPaths,'anki-core');
  assert.equal(support.answerComparison,'anki-core');
  assert.equal(support.clozeTyping,'anki-core');
  assert.equal(support.tts.backend,'HarmonyOS CoreSpeechKit');
  assert.equal(support.tts.voicePrefix,'HarmonyOS_');
  assert.deepEqual([support.tts.minimumSpeed,support.tts.maximumSpeed],[0.5,2]);
  assert.deepEqual(support.tts.otherArguments,['volume','pitch']);
  assert.equal(support.tts.voiceAvailability,'device-installed voices only');
  assert.equal(support.avOrder,'core-tag-order; adjacent same-kind items may be batched');
  const editor=structure().noteEditing;
  assert.deepEqual(editor.fieldOptions,['rtl','font','size','description','plainText','collapsed']);
  assert.equal(editor.plainTextMeaning,'default_html_source_preserving_formatting');
  assert.deepEqual([editor.minimumFontSize,editor.maximumFontSize],[5,300]);
});

test('JIDE uses the editor button instruction resource for selection formatting in both languages',()=>{
  for(const labels of [zh,en]){
    for(const id of ['add_note','edit_note_form']){
      const declaration=APP_INTERFACE_SURFACES.find(surface=>surface.id===id);
      assert.equal(declaration.instructionsKey,'note_editor_format_action');
      const app=buildAgentAppStructure(context,id,'',key=>labels.get(key),agentSettingDefinitions(),tools,[]);
      assert.equal(app.surfaces.find(surface=>surface.id===id).instructions,labels.get('note_editor_format_action'));
    }
  }
});

// 只检查实际静态调用；注释、字符串示例和非字面量参数不冒充可验证的绑定。
function settingsLabelBindings(source) {
  const tokens=[...source.matchAll(/\/\*[\s\S]*?\*\/|\/\/[^\n]*|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|[\p{L}_$][\p{L}\p{N}_$]*|[^\s]/gu)]
    .map(x=>x[0]).filter(x=>!x.startsWith('//')&&!x.startsWith('/*'));
  const ids=[];
  for(let index=0;index<tokens.length;index++) {
    if(tokens[index]!=='settingsItemText'||tokens[index+1]!=='(')continue;
    let depth=1;
    for(let cursor=index+2;cursor<tokens.length;cursor++) {
      if(tokens[cursor]==='(')depth++;
      if(tokens[cursor]===')'&&--depth===0)break;
      if(tokens[cursor]!==','||depth!==1)continue;
      const value=tokens[cursor+1];
      if(/^(['"])[^'"\\]+\1$/.test(value??'')&&[',',')'].includes(tokens[cursor+2]))ids.push(value.slice(1,-1));
      break;
    }
  }
  return ids;
}

function assertRegisteredSettingsLabels(sources, ids) {
  for(const {path,source} of sources)for(const id of settingsLabelBindings(source))
    assert.ok(ids.has(id),`${path}: unregistered settingsItemText ID: ${id}`);
}

test('the real browser batch menu respects the current Agent capability gate', () => {
  const tracker = new AppInterfaceTracker();
  const Batch = loadComponentLogic('components/browser/批量操作栏.ets', '批量操作栏',
    { ...appInterfaceDependencies(), appInterface: tracker, visibleInterfaceItems, namedResourceText: (_, key) => localize(key) });
  const batch = new Batch();batch.getUIContext = () => ({});batch.选中数 = 1;
  batch.aboutToAppear();assert.ok(!tracker.snapshot()[0].optionIds.includes('agent'));
  batch.selectItem('agent');
  let called = 0;batch.onAI改卡 = () => called++;batch.Agent入口已启用 = true;batch.publishInterface();
  assert.ok(tracker.snapshot()[0].optionIds.includes('agent'));
  batch.selectItem('agent');assert.equal(called, 1);
  batch.busy = true;batch.selectItem('agent');assert.equal(called, 1);
});

test('settings card counts and item visibility use the UI mode and current theme, without inventing conditional states', () => {
  const simple=structure(context,'settings','scheduler');
  assert.equal(simple.visibleSettingsSectionCount,9); assert.equal(simple.sections[0].cardCount,2);
  assert.equal(simple.sections[0].cards.find(x=>x.id==='algorithm').visible,false);
  const full=structure({...context,simple:false},'settings','scheduler');
  assert.equal(full.visibleSettingsSectionCount,10); assert.equal(full.sections[0].cardCount,4);
  for(const state of [context,{...context,simple:false,agent:false}]) for(const section of structure(state).sections) {
    assert.equal(section.cardCount,visibleSettingsGroups(section.id,state.simple,state.agent).length);
  }
  assert.equal(structure(context,'settings','data').sections[0].cards[0].items.filter(x=>x.visibility!=='hidden').length,5);
  const appearance=structure(context,'settings','appearance').sections[0].cards[0].items;
  assert.equal(appearance.find(x=>x.id==='theme_motion').visibility,'hidden');
  assert.equal(structure({...context,themeHasTextures:true},'settings','appearance').sections[0].cards[0].items.find(x=>x.id==='theme_motion').visibility,'available_in_section');
  const sync=structure(context,'settings','sync').sections[0].cards[0].items;
  assert.equal(sync.find(x=>x.id==='sync_account').visibility,'conditional');
  assert.ok(sync.find(x=>x.id==='sync_password').sensitive);
});

test('setting knowledge and the current tool declarations remain separate from permission to act', () => {
  const view=structure(context,'settings','appearance');
  const items=view.sections[0].cards[0].items;
  assert.equal(items.find(x=>x.id==='deck_list_style').title,zh.get('deck_width'));
  assert.equal(items.find(x=>x.id==='deck_list_style').readTool,'get_settings');
  assert.equal(items.find(x=>x.id==='deck_list_style').writeTool,'propose_set_setting');
  assert.equal(items.some(x=>x.id==='deck_list_narrow'),false);
  assert.equal(items.find(x=>x.id==='theme_mode').writeTool,'set_theme_mode');
  assert.equal(items.find(x=>x.id==='theme_motion').writeTool,'');
  const limited=buildAgentAppStructure(context,'settings','appearance',localize,agentSettingDefinitions(),[],[]);
  assert.equal(limited.sections[0].cards[0].items.find(x=>x.id==='theme_mode').writeTool,'');
  assert.equal(limited.sections[0].cards[0].items.find(x=>x.id==='theme_mode').readTool,'');
  assert.deepEqual(view.tools.map(x=>x.name),tools.map(x=>x.name));
  assert.ok(view.tools.every(x=>Object.keys(x).length===2),'do not repeat schemas/rules in observations');
  assert.throws(()=>decodeSettingsArguments('get_app_structure','{"surface":"settings","sectionId":"unknown"}'));
  assert.throws(()=>decodeSettingsArguments('get_app_structure','{"sectionId":"appearance"}'));
  assert.throws(()=>decodeSettingsArguments('get_app_structure','{"surface":"unknown"}'));
  assert.throws(()=>decodeSettingsArguments('get_app_structure','{"surface":"app","token":"secret"}'));
  assert.equal(decodeSettingsArguments('get_app_structure','{}').surface,'app');
  assert.ok(view.coverage.includes('browser'));
  assert.ok(view.coverage.includes('deck_options'));
  assert.ok(!view.coverage.includes('deck_options_advanced'),'unregistered nested UI is not detailed coverage');
  for (const surface of appInterfaceSurfaceIds()) assert.equal(decodeSettingsArguments('get_app_structure',JSON.stringify({surface})).surface,surface);
});

test('real menu components enumerate the same options as JIDE and dispatch every callback exactly once', () => {
  for(const [file,name,surface,callbacks] of [
    ['components/home/主页更多面板.ets','主页更多面板','home_more',{history:'onHistory',settings:'设置回调',stats:'统计回调',reminders:'提醒回调',intro:'onIntro'}],
    ['components/主页操作面板.ets','主页操作面板','home_create',{create_deck:'创建牌组回调',filtered_deck:'onCreateFilteredDeck',import:'导入牌组回调',cloud_deck:'获取直链牌组回调'}]
  ]) {
    const tracker=new AppInterfaceTracker();
    const Menu=loadComponentLogic(file,name,{visibleInterfaceItems,appInterface:tracker,namedResourceText:(_,key)=>localize(key),
      DECK_LIST_NARROW_KEY:'deckListNarrow',AI_AGENT_CHANNELS_APP_STORAGE_KEY:'aiAgentChannelsEnabled',简洁模式AppStorage键:'simpleMode'});
    const menu=new Menu();menu.getUIContext=()=>({});const calls=[];
    for(const [id,callback] of Object.entries(callbacks)) menu[callback]=()=>calls.push(id);
    for(const state of [context,{...context,simple:false,agent:false,cloudDeck:true}]){
      menu.简洁模式=state.simple;menu.Agent入口已启用=state.agent;menu.显示获取直链牌组=state.cloudDeck;
      assert.deepEqual(menu.menuItems(),visibleInterfaceItems(surface,state));
      menu.aboutToAppear(); assert.deepEqual(tracker.snapshot()[0].optionIds,menu.menuItems().map(x=>x.id));
      for(const item of menu.menuItems())menu.selectItem(item.id);
      assert.deepEqual(calls.splice(0),menu.menuItems().map(x=>x.id));
      menu.aboutToDisappear();assert.equal(tracker.snapshot().length,0);
    }
  }
});

test('shared label edits and localized resources flow to UI labels and JIDE on the next read', () => {
  const ui={getHostContext:()=>({resourceManager:{getStringByNameSync:localize}})};
  const namedResourceText=loadPlatformModule('utils/UiFeedback.ets','namedResourceText',{hilog:{error(){}}});
  const interfaceItemText=loadPlatformModule('utils/AppInterfaceText.ets','interfaceItemText',{APP_INTERFACE_SURFACES,namedResourceText});
  const settingsItemText=loadPlatformModule('utils/SettingsStructureText.ets','settingsItemText',{settingsItem,SETTINGS_GROUPS,namedResourceText});
  const item=settingsItem('theme_mode'),key=item.titleKey;
  try {item.titleKey='settings_title';assert.equal(settingsItemText(ui,'theme_mode'),localize('settings_title'));
    assert.equal(structure(context,'settings','appearance').sections[0].cards[0].items[0].title,localize('settings_title'));
  } finally {item.titleKey=key;}
  assert.equal(interfaceItemText(ui,'home','more'),localize('study_more'));
  const english=buildAgentAppStructure(context,'home_more','',key=>en.get(key),agentSettingDefinitions(),[],[]);
  assert.equal(english.surfaces[0].items[0].title,en.get('top_settings'));
});

test('new settings, renames, visibility changes and removals flow from the shared declaration without a separate JIDE directory', () => {
  const group=SETTINGS_GROUPS.find(x=>x.id==='general_display');const before=agentInterfaceRevision(tools);
  const item={id:'future_setting',titleKey:'deck_width'};
  const settingsItemText=loadPlatformModule('utils/SettingsStructureText.ets','settingsItemText',
    {SETTINGS_GROUPS,settingsItem,namedResourceText:(_context,key)=>localize(key)});
  const get=(state=context)=>structure(state,'settings','general').sections[0].cards.find(x=>x.id===group.id).items.find(x=>x.id===item.id);
  group.items.push(item);
  try {
    assert.equal(settingsItemText({},item.id),localize(item.titleKey));assert.equal(get().title,localize(item.titleKey));
    assert.equal(get().visibility,'available_in_section');assert.equal(get().readTool,'');assert.equal(get().writeTool,'');
    assert.notEqual(agentInterfaceRevision(tools),before);
    const added=agentInterfaceRevision(tools);item.titleKey='settings_title';
    assert.equal(get().title,settingsItemText({},item.id));assert.notEqual(agentInterfaceRevision(tools),added);
    item.fullOnly=true;assert.equal(get().visibility,'hidden');assert.equal(get({...context,simple:false}).visibility,'available_in_section');
    group.items.pop();assert.equal(get(),undefined);assert.equal(settingsItemText({},item.id),'[future_setting]');
    assert.equal(agentInterfaceRevision(tools),before);
  } finally {if(group.items.includes(item))group.items.splice(group.items.indexOf(item),1);}
});

test('live observations copy mutable state, replace changed options and remove closed views', () => {
  const tracker=new AppInterfaceTracker(),ids=['x'];
  tracker.observe({surface:'create_deck',sectionId:'',selectedId:'x',optionIds:ids,optionLabels:['Parent'],busy:false,optionsTotal:101});
  ids.push('leaked');const snapshot=tracker.snapshot();snapshot[0].optionLabels.push('leaked');
  assert.deepEqual(tracker.snapshot()[0].optionIds,['x']);assert.deepEqual(tracker.snapshot()[0].optionLabels,['Parent']);
  assert.equal(tracker.snapshot()[0].optionsTotal,101);
  tracker.observe({surface:'create_deck',sectionId:'',selectedId:'',optionIds:[],optionLabels:[],busy:true});
  assert.equal(tracker.snapshot()[0].busy,true);assert.equal(tracker.snapshot()[0].selectedId,'');
  tracker.leave('create_deck');assert.deepEqual(tracker.snapshot(),[]);
  const controls=[{id:'mode-0',title:'Cards',enabled:false,selected:true}],values=[{id:'phase',value:'loading'}];
  tracker.observe({surface:'browser_view',sectionId:'mode',selectedId:'mode-0',optionIds:[],optionLabels:[],busy:true,items:controls,values});
  controls[0].title='mutated';values[0].value='mutated';tracker.snapshot()[0].items[0].enabled=true;
  assert.equal(tracker.snapshot()[0].items[0].title,'Cards');assert.equal(tracker.snapshot()[0].items[0].enabled,false);
  assert.equal(tracker.snapshot()[0].values[0].value,'loading');
  tracker.observe({surface:'reminder_editor',titleKey:'reminder_edit_title_edit',sectionId:'edit',selectedId:'',
    optionIds:[],optionLabels:[],busy:false,items:[],controlsComplete:false});
  let form=buildAgentAppStructure(context,'reminder_editor','',localize,[],[],tracker.snapshot());
  assert.equal(form.surfaces[0].items.find(x=>x.id==='delete').visibility,'conditional','partial observations do not prove a control hidden');
  tracker.observe({...tracker.snapshot().find(x=>x.surface==='reminder_editor'),controlsComplete:true});
  tracker.snapshot().find(x=>x.surface==='reminder_editor').controlsComplete=false;
  form=buildAgentAppStructure(context,'reminder_editor','',key=>en.get(key),[],[],tracker.snapshot());
  assert.equal(form.surfaces[0].items.find(x=>x.id==='delete').visibility,'hidden');
  assert.equal(form.surfaces[0].title,en.get('reminder_edit_title_edit'));
  tracker.showPage('study');tracker.showPage('agent');tracker.hidePage('study');
  assert.equal(tracker.currentPage(),'agent','a late hide callback cannot clear the newly shown page');
  tracker.hidePage('agent');assert.equal(tracker.currentPage(),'');
});

test('browser menus expose actual disabled, selected and dynamic options with no second sorting catalog', () => {
  const tracker=new AppInterfaceTracker();
  const More=loadComponentLogic('components/browser/BrowserMoreMenu.ets','BrowserMoreMenu',{
    appInterface:tracker,browserInterfaceMenu,namedResourceText:(_,key)=>localize(key)});
  const more=new More();more.getUIContext=()=>({});const calls=[];
  more.onFilter=()=>calls.push('filter');more.onFindReplace=()=>calls.push('find');more.onSaveSearch=()=>calls.push('save');
  more.onSubtitle=index=>calls.push(index);
  more.available=false;more.filterActive=false;more.aboutToAppear();
  for(const id of ['filter','find_replace','save_search']) more.selectItem(id);
  assert.deepEqual(calls,[]);
  more.selectItem('subtitle_due');assert.deepEqual(calls.splice(0),[2]);
  more.available=true;more.filterActive=true;more.subtitleIndex=4;more.publishInterface();
  const view=buildAgentAppStructure(context,'browser_more','',localize,[],[],tracker.snapshot(),'browser');
  assert.equal(view.foregroundSurface,'browser');
  assert.equal(view.surfaces[0].items.find(x=>x.id==='filter').title,localize('browser_filter_active'));
  assert.equal(view.surfaces[0].items.find(x=>x.id==='subtitle_answer').selected,true);
  const english=buildAgentAppStructure(context,'browser_more','',key=>en.get(key),[],[],tracker.snapshot(),'browser');
  assert.equal(english.surfaces[0].items.find(x=>x.id==='filter').title,en.get('browser_filter_active'));
  assert.equal(english.observations[0].optionLabels[0],en.get('browser_filter_active'),'cached observations do not contradict the current resource language');
  for(const id of ['filter','find_replace','save_search'])more.selectItem(id);
  assert.deepEqual(calls,['filter','find','save']);more.aboutToDisappear();assert.equal(tracker.snapshot().length,0);

  const View=loadComponentLogic('components/browser/BrowserViewMenu.ets','BrowserViewMenu',{
    appInterface:tracker,namedResourceText:(_,key)=>localize(key),resourceText:loadUiFeedback().resourceText});
  const menu=new View();menu.getUIContext=()=>({});menu.group='sort';menu.sortIndex=1;
  menu.sortOptions=[{value:'Default'},{value:'New plugin column ↑'}];menu.aboutToAppear();
  let result=buildAgentAppStructure(context,'browser_view','',localize,[],[],tracker.snapshot());
  assert.deepEqual(result.surfaces[0].items.map(x=>x.title),['Default','New plugin column ↑']);
  assert.equal(result.surfaces[0].items[1].selected,true);
  menu.group='filter';menu.filterOptions=[{value:'Only new'}];menu.filterIndex=0;menu.available=false;menu.publishInterface();
  result=buildAgentAppStructure(context,'browser_view','',localize,[],[],tracker.snapshot());
  assert.deepEqual(result.surfaces[0].items.map(x=>x.title),['Only new']);assert.equal(result.surfaces[0].items[0].enabled,false);
  menu.filterOptions=[{value:{id:7,params:['app.string.browser_mode_cards']}}];
  menu.getUIContext=()=>({getHostContext:()=>({resourceManager:{getStringSync:id=>{assert.equal(id,7);return localize('browser_mode_cards');}}})});
  menu.publishInterface();assert.equal(tracker.snapshot()[0].optionLabels[0],localize('browser_mode_cards'));
  menu.aboutToDisappear();menu.publishInterface();assert.equal(tracker.snapshot().length,0,'late prop updates cannot remount a disposed view');
});

function pageMethods(file,names,deps) {
  const source=read(file).replaceAll('\r\n','\n');
  const methods=names.map(name=>{const start=source.indexOf('  private '+name+'(');assert.ok(start>=0,name);
    return source.slice(start,source.indexOf('\n  }',start)+4);});
  return new Function(...Object.keys(deps),stripTypeScriptTypes('class Page {'+methods.join('\n')+'}',{mode:'transform'})+';return Page;')(...Object.values(deps));
}

test('study UI preserves actions and JIDE observes expanded left groups and flags without invented Back controls', () => {
  const tracker=new AppInterfaceTracker();
  const deps=appInterfaceDependencies();
  const Page=pageMethods('pages/学习页.ets',['interfaceMenuItems','更多菜单','flagMenuItems','toggleStudyMenuBranch','studyMenuEntry','studyMenuIcon','executeMenuAction','publishInterface','publishStudyMenu'],{
    ...deps, appInterface:tracker,namedResourceText:(_,key)=>localize(key),
    flagMenuChoices:loadPlatformModule('components/common/FlagMenuChoices.ets','flagMenuChoices',{
      ...deps, customFlagLabel:(labels,flag)=>labels[String(flag)]??'', namedResourceText:(_,key)=>localize(key)}),
    BURY_SUSPEND_MODE_BURY_USER:0,BURY_SUSPEND_MODE_SUSPEND:1});
  const page=new Page(),calls=[];
  Object.assign(page,{getUIContext:()=>({}),mounted:true,页面已显示:true,studyMenuOpen:true,studyExpandedIds:['marking','card_actions'],flagLabels:{'7':'Custom purple'},阶段:'question',评分中:false,
    当前卡片:{cardId:42},currentMarking:{flag:7,marked:false},有音频:false,可撤销:false,Agent入口已启用:true,简洁模式:true,choiceQuestion:null,
    牌组名:'Deck',新卡剩余:1,学习中剩余:2,复习剩余:3,
    openNoteEditor:()=>calls.push('edit'),playStudyAudio:()=>calls.push('audio'),showStudyGuide:()=>calls.push('guide'),
    撤销上次:()=>calls.push('undo'),埋藏或暂停当前卡:mode=>calls.push(mode===0?'bury':'suspend'),请求删除当前卡:()=>calls.push('delete'),
    changeMarking:()=>calls.push('mark'),loadFlagLabels:()=>calls.push('flag'),
    打开AI改卡:()=>calls.push('agent'),stopStudyTimers:()=>calls.push('handwrite'),configureAutoAdvance:()=>calls.push('auto_advance')});
  const ids=['edit','agent','undo','marking','audio','card_actions','handwrite','guide'];
  assert.deepEqual(page.interfaceMenuItems().map(x=>x.id),ids);
  assert.equal(page.更多菜单()[0].value,localize('study_edit_note'));
  page.有音频=true;page.可撤销=true;
  for(const item of page.更多菜单()) { for(const action of item.children??[item]) action.action(); }
  assert.deepEqual(calls,['edit','agent','undo','mark','flag','audio','bury','suspend','delete','auto_advance','handwrite','guide']);
  assert.equal(page.flagNamesOpen,true);
  for(const [expanded,surfaces] of [
    [[],['study_more']],
    [['marking','card_actions'],['study_more','study_marking','study_card_actions']],
    [['marking','card_actions','flag'],['study_more','study_marking','study_card_actions','study_flags']]]) {
    page.studyExpandedIds=expanded;page.publishInterface();
    const menus=tracker.snapshot().filter(x=>x.surface!=='study');
    assert.deepEqual(menus.map(x=>x.surface).sort(),surfaces.sort());
    for(const surface of surfaces) {
      const observed=buildAgentAppStructure(context,surface,'',localize,[],[],tracker.snapshot(),'study');
      assert.ok(observed.surfaces[0].items.every(x=>x.visibility==='observed'));
      assert.ok(!observed.surfaces[0].items.some(x=>x.id==='back'));
      if(surface==='study_flags') {
        assert.deepEqual(menus.find(x=>x.surface===surface).optionIds,['0','1','2','3','4','5','6','7']);
        const purple=observed.surfaces[0].items.find(x=>x.id==='7');
        assert.equal(purple.title,'Custom purple');assert.equal(purple.selected,true);
      }
    }
  }
  page.studyPrimaryObscured=true;page.publishInterface();
  assert.deepEqual(tracker.snapshot().filter(x=>x.surface!=='study').map(x=>x.surface).sort(),
    ['study_card_actions','study_flags','study_marking'],'color overlay removes covered More menu and retains left groups');
  page.studyPrimaryObscured=false;page.publishInterface();
  assert.deepEqual(tracker.snapshot().filter(x=>x.surface!=='study').map(x=>x.surface).sort(),
    ['study_card_actions','study_flags','study_marking','study_more'],'closing colors restores the primary menu');
  page.评分中=true;page.publishInterface();
  assert.ok(tracker.snapshot().filter(x=>x.surface!=='study').every(x=>x.items.every(item=>!item.enabled)),'all visible actions are disabled consistently while busy');
  let result=buildAgentAppStructure(context,'study_more','',localize,[],[],tracker.snapshot());
  assert.equal(result.surfaces[0].items.find(x=>x.id==='edit').enabled,false);
  page.阶段='done';page.publishInterface();result=buildAgentAppStructure(context,'study_more','',localize,[],[],tracker.snapshot());
  assert.equal(result.surfaces[0].items.find(x=>x.id==='agent').visibility,'hidden');
  assert.equal(result.surfaces[0].items.find(x=>x.id==='handwrite').visibility,'hidden');
  page.studyMenuOpen=false;page.publishInterface();
  assert.deepEqual(tracker.snapshot().map(x=>x.surface),['study']);
  const current=tracker.snapshot()[0];assert.equal(current.selectedId,'42');
  assert.equal(current.values.find(x=>x.id==='phase').value,'done');
  assert.equal(buildAgentAppStructure(context,'browser','',localize,[],[],tracker.snapshot()).observations.length,0);
});

test('deck detail observations follow the real snapshot, expansion and loading state', () => {
  const tracker=new AppInterfaceTracker();
  const Details=loadComponentLogic('components/牌组详情面板.ets','牌组详情面板',{
    appInterface:tracker,visibleInterfaceItems,interfaceItemText:(_,surface,id)=>localize(APP_INTERFACE_SURFACES.find(x=>x.id===surface).items.find(x=>x.id===id).titleKey),
    牌组显示名:deck=>deck.name,ExpansionReveal:class {cancel(){} request(){}},
    DECK_LIST_NARROW_KEY:'narrow',THEME_TEXT_COLORS_KEY:'text',GLASS_COLORS_KEY:'glass',GLASS_HIGHLIGHT_COLORS:[],
    AI_AGENT_CHANNELS_APP_STORAGE_KEY:'agent',颜色键:{新卡计数色:'new',学习中计数色:'learning',复习中计数色:'review',动作主色:'primary'}});
  const page=new Details(),calls=[];Object.assign(page,{getUIContext:()=>({}),选中牌组Id:'d',
    主页快照数据:{decks:[{id:'d',name:'Actual deck',description:'About',totalCards:9,newCount:1,learningCount:2,reviewCount:3}]},
    创建子牌组:()=>calls.push('create'),打开牌组选项:()=>calls.push('options'),导出牌组:()=>calls.push('export')});
  page.aboutToAppear();assert.equal(tracker.snapshot()[0].values.find(x=>x.id==='name').value,'Actual deck');
  page.显示更多=true;page.牌组选项加载中=true;page.publishInterface();
  const result=buildAgentAppStructure(context,'deck_details_more','',localize,[],[],tracker.snapshot());
  assert.equal(result.surfaces[0].items.find(x=>x.id==='options').enabled,false);
  page.selectMoreItem('options');assert.deepEqual(calls,[]);page.牌组选项加载中=false;
  for(const id of ['create_child','options','export'])page.selectMoreItem(id);assert.deepEqual(calls,['create','options','export']);
  page.选中牌组Id='missing';page.publishInterface();assert.equal(tracker.snapshot().length,0);
  page.aboutToDisappear();assert.equal(tracker.snapshot().length,0);
});

test('home selection refreshes knowledge without waking unrelated collection work', () => {
  const tracker=new AppInterfaceTracker();
  const Page=pageMethods('pages/首页.ets',['previewDeckChanged','homeActionControls','publishHomeInterface'],{appInterface:tracker,OFFICIAL_ANNOUNCEMENTS_ENABLED,isDoubleColumnDeckListStyle});
  const page=new Page();let invalidations=0;
  Object.assign(page,{homeDisposed:false,加载状态:'ready',当前断点:'xs',deckListStyle:'single_wide',显示今日进度卡:true,homeAgentEnabled:true,选中的牌组ID:'d2',牌组数据源:{snapshotDecks:()=>[{id:'d1',name:'Visible'}]},
    homeActivity:()=>({collectionBusy:false}),deckPreviewSession:{invalidate:()=>invalidations++},
    homeActivityChanged:()=>assert.fail('read-only interface publication must not wake startup/sync/import work')});
  page.previewDeckChanged();assert.equal(invalidations,1);
  assert.deepEqual(page.homeActionControls().slice(0,6).map(item=>item.id),['more','agent','search','browser','sync','create']);
  assert.deepEqual(visibleInterfaceItems('home',context).slice(0,6).map(item=>item.id),['more','agent','search','browser','sync','create']);
  assert.ok(!visibleInterfaceItems('home_more',context).some(item=>item.id==='sync'||item.id==='browser'));
  assert.equal(tracker.snapshot()[0].selectedId,'d2');assert.deepEqual(tracker.snapshot()[0].optionIds,['d1']);
  const structure=buildAgentAppStructure(context,'home','',localize,[],[],tracker.snapshot());
  assert.equal(structure.observations.find(v=>v.surface==='home').values.find(v=>v.id==='official_announcements_enabled').value,'false');
  for (const style of ['single_wide','single_narrow','double_wide','double_narrow']) {
    page.deckListStyle=style; page.publishHomeInterface();
    const values=new Map(tracker.snapshot()[0].values.map(value=>[value.id,value.value]));
    assert.equal(values.get('home_action_position'),'above_summary');
    assert.equal(values.get('home_header_layout'),'one_row');
    assert.equal(values.has('home_action_side'),false);
    assert.equal(values.has('home_grip_availability'),false);
    assert.equal(values.get('deck_list_style'),style);
    assert.equal(values.get('deck_list_grouping'),'top_level_subtree');
    assert.equal(values.get('deck_list_columns'),style.startsWith('double')?'2':'1');
    assert.equal(values.get('deck_study_counts_visible'),String(!style.startsWith('double')));
  }
  for(const breakpoint of ['sm','md']) {
    page.当前断点=breakpoint;page.publishHomeInterface();
    assert.equal(tracker.snapshot()[0].values.find(value=>value.id==='home_action_position').value,'above_summary');
  }
  page.homeDisposed=true;page.previewDeckChanged();assert.equal(tracker.snapshot()[0].selectedId,'d2');
});

const textDependencies = tracker => {
  const namedResourceText = (_, key) => localize(key);
  const helpers = { APP_INTERFACE_SURFACES, namedResourceText };
  return { appInterface: tracker, namedResourceText,
    interfaceItemText: loadPlatformModule('utils/AppInterfaceText.ets', 'interfaceItemText', helpers),
    interfaceItemTitleKey: loadPlatformModule('utils/AppInterfaceText.ets', 'interfaceItemTitleKey', helpers),
    interfaceControlText: loadPlatformModule('utils/AppInterfaceText.ets', 'interfaceControlText', helpers) };
};

test('JIDE input and header share the actual history, parsing, stop and readiness states', () => {
  for (const history of [false, true]) for (const processing of [false, true])
    for (const parsing of [false, true]) for (const pendingClarification of [false, true])
      for (const batchRunning of [false, true]) for (const canSubmit of [false, true]) {
        const controls = agentInterfaceControls({history,processing,parsing,pendingClarification,batchRunning,canSubmit});
        const byId = id => controls.find(item => item.id === id);
        assert.deepEqual(controls.map(x => x.id), history ? ['back','new'] : ['back','history','input','import','submit']);
        assert.equal(byId('back').enabled, true);
        assert.equal(byId(history ? 'new' : 'history').enabled, !processing && !parsing && !batchRunning);
        if (!history) {
          assert.equal(byId('input').enabled, !pendingClarification);
          assert.equal(byId('import').enabled, !processing && !parsing && !pendingClarification);
          assert.equal(byId('submit').enabled, processing || canSubmit);
          assert.equal(byId('submit').titleKey, processing ? 'ai_agent_cancel' : 'ai_card_send');
          assert.equal(byId('import').titleKey, agentImportLabelKey(parsing));
        }
      }
  const ui = read('pages/AI制卡页.ets');
  for (const id of ['input','import','submit','history','new']) assert.ok(ui.includes(`this.interfaceEnabled('${id}')`),id);
  for (const id of ['input','submit','history','new','back']) assert.ok(ui.includes(`this.interfaceLabel('${id}')`),id);
  for (const mode of ['assistant','create','edit']) assert.ok(zh.has(agentInterfaceTitle(mode,false)));
  assert.equal(agentInterfaceTitle('assistant',true),'ai_agent_history_title');
});

test('actual JIDE publisher exposes state without recursively including chat, imported body or credentials', () => {
  const tracker = new AppInterfaceTracker();
  const Page = pageMethods('pages/AI制卡页.ets',['interfaceControls','interfaceLabel','interfaceEnabled','publishInterface'],
    {...textDependencies(tracker),agentInterfaceControls,agentInterfaceTitle});
  const page = new Page();
  Object.assign(page,{interfaceMounted:true,pageDisposed:false,pageMode:'assistant',显示历史区:false,处理中:false,
    文件解析中:false,cardBatch:{isRunning:()=>false},hasPendingClarification:()=>false,canSubmit:()=>true,
    conversationId:'current',输入草稿:'PRIVATE_DRAFT',消息列表:[{正文:'PRIVATE_CHAT'}],targetSelectionMessage:-1,
    错误信息:'PRIVATE_ERROR',AI配置:{apiKey:'PRIVATE_KEY'},
    导入文件列表:[{id:'file1',name:'example.txt',text:'PRIVATE_FILE',path:'PRIVATE_PATH'}],getUIContext:()=>({})});
  page.publishInterface();
  let current = buildAgentAppStructure(context,'agent','',localize,[],[],tracker.snapshot());
  assert.deepEqual(current.observations[0].optionLabels,['example.txt']);
  assert.equal(current.observations[0].selectedId,'current');
  assert.equal(current.surfaces[0].items.find(x=>x.id==='new').visibility,'hidden');
  assert.equal(current.surfaces[0].items.find(x=>x.id==='submit').enabled,true);
  assert.ok(!JSON.stringify(current).includes('PRIVATE_'));
  page.处理中=true;page.canSubmit=()=>false;page.publishInterface();
  current=buildAgentAppStructure(context,'agent','',key=>en.get(key),[],[],tracker.snapshot());
  assert.equal(current.surfaces[0].items.find(x=>x.id==='submit').title,en.get('ai_agent_cancel'));
  assert.equal(current.surfaces[0].items.find(x=>x.id==='submit').enabled,true);
  page.显示历史区=true;page.处理中=false;page.publishInterface();
  current=buildAgentAppStructure(context,'agent','',localize,[],[],tracker.snapshot());
  assert.equal(current.surfaces[0].title,localize('ai_agent_history_title'));
  assert.equal(current.surfaces[0].items.find(x=>x.id==='submit').visibility,'hidden');
  assert.equal(current.observations[0].optionsTotal,0);
  tracker.leave('agent');page.interfaceMounted=false;page.publishInterface();assert.equal(tracker.snapshot().length,0);
  assert.match(read('pages/AI制卡页.ets'),/aboutToDisappear\(\): void \{\s*this.interfaceMounted = false;\s*appInterface.hidePage\('agent'\);\s*appInterface.leave\('agent'\)/);
  for (const state of ['输入草稿','消息列表','处理中','文件解析中','导入文件列表','显示历史区','AI配置'])
    assert.match(read('pages/AI制卡页.ets'),new RegExp("@Watch\\('publishInterface'\\) private " + state),state);
});

test('history observes actual bounded conversation titles, selection and cleanup without message contents', () => {
  const tracker=new AppInterfaceTracker();
  const History=loadComponentLogic('components/agent/AgentHistoryList.ets','AgentHistoryList',textDependencies(tracker));
  const list=new History();list.getUIContext=()=>({});list.conversationId='h1';
  list.conversations=Array.from({length:105},(_,i)=>({id:'h'+i,title:'Title '+i,messages:[{text:'PRIVATE_CHAT'}]}));
  list.aboutToAppear();let view=tracker.snapshot()[0];
  assert.equal(view.optionsTotal,105);assert.equal(view.optionIds.length,100);
  assert.equal(view.items.find(x=>x.id==='h1').selected,true);
  assert.ok(!JSON.stringify(view).includes('PRIVATE_CHAT'));
  list.conversations=[];list.publishInterface();
  assert.equal(buildAgentAppStructure(context,'agent_history','',localize,[],[],tracker.snapshot()).surfaces[0].items[0].visibility,'hidden');
  list.aboutToDisappear();list.publishInterface();assert.equal(tracker.snapshot().length,0);
});

test('real reminder page publishes current rows, toggle states, editor selection and loading without writes', () => {
  const tracker=new AppInterfaceTracker();
  const Page=loadComponentLogic('pages/学习提醒页.ets','学习提醒页',
    {...textDependencies(tracker),visibleInterfaceItems,CustomTransition:{getInstance:()=>({注销NavParam(){}})}});
  const page=new Page();page.getUIContext=()=>({});page.interfaceMounted=true;
  page.publishInterface();assert.equal(tracker.snapshot()[0].busy,true);assert.deepEqual(tracker.snapshot()[0].optionIds,[]);
  page.已加载=true;page.提醒项列表=[{唯一ID:7,小时:6,分钟:8,标题:'Review',内容:'PRIVATE_BODY',开启:true}];
  page.操作中=true;page.显示编辑面板=true;page.面板目标ID=7;page.publishInterface();
  const view=tracker.snapshot()[0];assert.deepEqual(view.optionLabels,['06:08 · Review']);
  assert.equal(view.items.find(x=>x.id==='toggle-7').selected,true);
  assert.equal(view.items.find(x=>x.id==='toggle-7').enabled,false);
  assert.equal(view.items.find(x=>x.id==='edit-7').enabled,true);
  assert.equal(view.items.find(x=>x.id==='edit-7').selected,true);
  assert.ok(!JSON.stringify(view).includes('PRIVATE_BODY'));
  tracker.showPage('reminders');page.aboutToDisappear();page.publishInterface();
  assert.equal(tracker.snapshot().length,0);assert.equal(tracker.currentPage(),'');
});

test('reminder form shares its mode labels, actual time options, draft metadata and busy controls', () => {
  const tracker=new AppInterfaceTracker();
  const Form=loadComponentLogic('components/提醒编辑面板.ets','提醒编辑面板',
    {...textDependencies(tracker),reminderEditorControls,reminderEditorTitle,
      resourceText:(_,value)=>{assert.fail('numeric time options should be actual string labels');}});
  const form=new Form();form.getUIContext=()=>({});form.初始小时=23;form.初始分钟=59;
  form.初始标题='PRIVATE_TITLE';form.初始内容='PRIVATE_BODY';form.aboutToAppear();
  let view=tracker.snapshot()[0];assert.equal(view.optionIds.length,84);
  assert.deepEqual(view.optionLabels,form.小时选项().concat(form.分钟选项()).map(x=>x.value));
  assert.deepEqual(view.items.filter(x=>x.id.startsWith('hour-')&&x.selected).map(x=>x.id),['hour-23']);
  assert.equal(buildAgentAppStructure(context,'reminder_editor','',localize,[],[],tracker.snapshot()).surfaces[0].items.find(x=>x.id==='delete').visibility,'hidden');
  form.是否新建=false;form.busy=true;form.publishInterface();
  const current=buildAgentAppStructure(context,'reminder_editor','',key=>en.get(key),[],[],tracker.snapshot());
  assert.equal(current.surfaces[0].title,en.get('reminder_edit_title_edit'));
  assert.equal(current.surfaces[0].items.find(x=>x.id==='confirm').title,en.get('deck_customize_save'));
  assert.equal(current.surfaces[0].items.find(x=>x.id==='delete').visibility,'observed');
  assert.equal(current.surfaces[0].items.find(x=>x.id==='delete').enabled,false);
  assert.equal(current.surfaces[0].items.find(x=>x.id==='insert_new').enabled,true,'current UI allows token labels while busy');
  assert.ok(!JSON.stringify(current).includes('PRIVATE_'));
  const source=read('components/提醒编辑面板.ets');
  for(const id of ['time','title','content','insert_new','insert_review','confirm','cancel','delete']) assert.ok(source.includes(`this.interfaceLabel('${id}')`),id);
  form.aboutToDisappear();form.publishInterface();assert.equal(tracker.snapshot().length,0);
});

test('all shared settings labels have UI bindings and resources; all card branches remain implemented', () => {
  const directory=new URL('../../entry/src/main/ets/components/settings/',import.meta.url);
  const sources=readdirSync(directory,{recursive:true}).filter(x=>x.endsWith('.ets')).map(name=>{
    const path='components/settings/'+name.replaceAll('\\','/');return {path,source:read(path)};
  });
  const ui=sources.map(x=>x.source).join('\n');
  const ids=new Set(SETTINGS_GROUPS.flatMap(x=>x.items.map(x=>x.id)));
  assert.equal(ids.size,SETTINGS_GROUPS.reduce((count,group)=>count+group.items.length,0),'setting UI IDs must be unique');
  const readableIds=new Set(agentSettingDefinitions().map(x=>x.id));
  for(const group of SETTINGS_GROUPS) for(const item of group.items) {
    assert.ok(zh.has(item.titleKey)&&en.has(item.titleKey),item.titleKey);
    assert.ok(ui.includes(`'${item.id}'`)||ui.includes(`"${item.id}"`), 'missing UI binding: '+item.id);
    if(item.settingId!==undefined)assert.ok(readableIds.has(item.settingId),'missing setting reader declaration: '+item.settingId);
  }
  assertRegisteredSettingsLabels(sources,ids);
  const panel=read('components/设置面板.ets');
  assert.deepEqual(new Set([...panel.matchAll(/group\.id === '([^']+)'/g)].map(x=>x[1])),new Set(SETTINGS_GROUPS.map(x=>x.id)));
  assert.match(panel,/ForEach\(this\.sectionGroups\(\)/);
});

test('settings binding audit rejects an unregistered new component with locale arguments and ignores examples/comments', () => {
  const known="settingsItemText(this.getUIContext(), 'language', this.uiLanguage)";
  assert.deepEqual(settingsLabelBindings(known),['language']);
  assert.deepEqual(settingsLabelBindings(`// ${known}\n/* ${known} */\nconst example=${JSON.stringify(known)};\nsettingsItemText(ctx, item.id);`),[]);
  const ids=new Set(SETTINGS_GROUPS.flatMap(x=>x.items.map(x=>x.id)));
  assert.doesNotThrow(()=>assertRegisteredSettingsLabels([{path:'NewSettings.ets',source:known}],ids));
  assert.throws(()=>assertRegisteredSettingsLabels([{path:'new/NestedSettings.ets',source:
    "SettingsToggleRow({ title: settingsItemText(this.getUIContext(), 'forgotten_setting', this.uiLanguage) })"}],ids),/unregistered.*forgotten_setting/);
});
