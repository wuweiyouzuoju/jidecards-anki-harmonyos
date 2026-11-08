import {sharedSource} from './shared-menu-harness.mjs';
import { THEME_CATALOG } from '../../entry/src/main/ets/model/ThemeCatalog.ts';
import { tintGlassFill } from '../../entry/src/main/ets/model/GlassTheme.ts';
import {popupAppearance,dialogPanelFill} from '../../entry/src/main/ets/components/common/PopupAppearance.ts';
import {selectionMenuWidth,selectionMenuMaxHeight} from '../../entry/src/main/ets/components/common/SelectionMenuLayout.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { materialHarness } from './surface-material-harness.mjs';
import { loadComponentLogic, loadPlatformModule } from './platform-module-harness.mjs';
import { localPreferenceApi } from './local-preference-harness.mjs';
import * as model from '../../entry/src/main/ets/model/SurfaceMaterial.ts';
import { agentPreferenceDefinitions, decodeWritablePreference } from '../../entry/src/main/ets/model/agent/AgentPreferenceSettings.ts';

test('flat clears all glass styles after glass, keeping dark/light flat surfaces opaque',()=>{
 for(const dark of [false,true]) {
  const api=materialHarness('glass',dark), state={};
  const node=new Proxy({}, {get:(_,name)=>(...args)=>{state[name]=args[0];return node;}});
  api.SeriesVisual.surfaceFor('glass',dark,'#3344FF').applyNormalAttribute(node);
  assert.equal(state.backdropBlur,0);
  api.SeriesVisual.surfaceFor('flat',dark,'#3344FF').applyNormalAttribute(node);
  assert.equal(state.backdropBlur,0);assert.equal(state.shadow.radius,0);
  assert.ok(state.linearGradient.colors.every(x=>x[0]==='#00FFFFFF'));
  assert.equal(state.backgroundColor,dark?'#1C1C1E':'#FFFFFF');
 }
});
test('module opacity changes only the active material fill and leaves controls and borders intact',()=>{
 const api=materialHarness('glass'),state={};
 const node=new Proxy({}, {get:(_,name)=>(...args)=>{state[name]=args[0];return node;}});
 api.SeriesVisual.surfaceFor('glass',false,'#3344FF').applyNormalAttribute(node);
 const border=state.border;
 const opacity={flat:80,glass:25};
 api.SeriesVisual.surfaceFor('glass',false,'#3344FF','',undefined,opacity).applyNormalAttribute(node);
 assert.equal(state.backgroundColor,'#40FFFFFF');assert.deepEqual(state.border,border);
 api.SeriesVisual.surfaceFor('flat',false,'#3344FF','',undefined,opacity).applyNormalAttribute(node);
 assert.equal(state.backgroundColor,'#CCFFFFFF');
 api.SeriesVisual.control('glass',false,'#3344FF',16,true).applyNormalAttribute(node);
 assert.equal(state.backgroundColor,'#52FFFFFF');
 const controlBorder=state.border;
 api.SeriesVisual.control('glass',false,'#3344FF',16,true,undefined,50).applyNormalAttribute(node);
 assert.equal(state.backgroundColor,`rgba(255,255,255,${41/255})`);
 assert.deepEqual(state.border,controlBorder);
 assert.equal(api.SeriesVisual.buttonFill('#3344FF',50),'rgba(51,68,255,0.5)');
});
test('dialog fill preserves the default, scales the panel and menu fills without introducing blur',()=>{
 const api=materialHarness('flat'),state={};
 const node=new Proxy({}, {get:(_,name)=>(...args)=>{state[name]=args[0];return node;}});
 const Popup=loadPlatformModule('components/common/PopupSurface.ets','PopupSurface',{
  ...api,popupAppearance,dialogPanelFill,themedGlassFill:()=> '#00000000'
 });
 new Popup('flat',false,16,'dialog',true,'',false,model.DEFAULT_DIALOG_OPACITY.flat).applyNormalAttribute(node);
 assert.equal(state.backgroundColor,popupAppearance('flat',false).fill);
 const border=state.border;
 new Popup('flat',false,16,'dialog',true,'',false,40).applyNormalAttribute(node);
 assert.equal(state.backgroundColor,'#66FFFFFF');assert.deepEqual(state.border,border);
 assert.equal(state.backdropBlur,0);
 new Popup('flat',false,16,'menu',true,'',false,40).applyNormalAttribute(node);
 assert.equal(state.backgroundColor,'#66FFFFFF');
 assert.equal(state.backdropBlur,0);
 assert.equal(dialogPanelFill(true,model.DEFAULT_DIALOG_OPACITY.glass),'#0018202B');
});
test('dragging previews the active material without saving until release, and restores cancelled or failed edits',async()=>{
 const modes={Begin:0,Moving:1,End:2,Click:3};
 const writes=[];
 let dialog, rejectSave=false;
 const publish=(key,value)=>{
  const field={module_opacity:'moduleOpacity',button_opacity:'buttonOpacity',dialog_opacity:'dialogOpacity'}[key];
  dialog[field]=value;
  dialog.syncOpacity();
 };
 const save=(target)=>async(material,value)=>{
  writes.push({target,material,value});
  if(rejectSave) throw Error('disk');
 };
 const Dialog=loadComponentLogic('components/settings/SurfaceMaterialDialog.ets','SurfaceMaterialDialog',{
  ...model,SeriesVisual:{isDark:()=>false},AppStorage:{setOrCreate:publish},SliderChangeMode:modes,
  appInterface:{observe(){},leave(){}},saveModuleOpacity:save('module'),saveButtonOpacity:save('button'),
  saveDialogOpacity:save('dialog')
 });
 dialog=new Dialog();dialog.style='glass';dialog.aboutToAppear();
 dialog.changeOpacity(18,modes.Begin,'dialog');
 dialog.changeOpacity(72,modes.Moving,'dialog');
 assert.deepEqual(dialog.dialogOpacity,{flat:94,glass:72});
 assert.deepEqual(writes,[]);
 dialog.changeOpacity(72,modes.End,'dialog');await Promise.resolve();
 assert.deepEqual(writes,[{target:'dialog',material:'glass',value:72}]);
 assert.deepEqual(dialog.dialogOpacity,{flat:94,glass:72});
 dialog.changeOpacity(55,modes.Moving,'button');
 assert.deepEqual(dialog.buttonOpacity,{flat:100,glass:55});
 dialog.aboutToDisappear();assert.deepEqual(dialog.buttonOpacity,{flat:100,glass:100});
 assert.equal(writes.length,1);
 dialog.aboutToAppear();rejectSave=true;
 dialog.changeOpacity(65,modes.Click,'module');await Promise.resolve();
 assert.deepEqual(dialog.moduleOpacity,model.DEFAULT_MODULE_OPACITY);
 assert.equal(dialog.saveFailed,true);
});
test('existing flat preference is preserved, accepted saves broadcast only after persistence',async()=>{
 const api=materialHarness(),values=new Map([[model.SURFACE_MATERIAL_KEY,'flat']]),store={getAllSync:()=>Object.fromEntries(values),hasSync:k=>values.has(k),flushSync:()=>{},getSync:(k,d)=>values.get(k)??d,putSync:(k,v)=>values.set(k,v),flush:async()=>{}};
 const persist=localPreferenceApi(api.AppStorage);
 const settings=loadPlatformModule('utils/SurfaceMaterialStore.ets','({initializeSurfaceMaterial,saveSurfaceMaterial,saveModuleOpacity,saveButtonOpacity,saveDialogOpacity})',{
  ...model,...api,...persist,preferences:{getPreferencesSync:()=>store},hilog:{warn(){}},
 });
 api.storage.set('abilityContext',{});settings.initializeSurfaceMaterial();assert.equal(api.storage.get(model.SURFACE_MATERIAL_KEY),'flat');
 await settings.saveModuleOpacity('flat',80);
 await settings.saveModuleOpacity('glass',25);
 await settings.saveButtonOpacity('glass',45);
 await settings.saveButtonOpacity('flat',70);
 await settings.saveDialogOpacity('glass',30);
 await settings.saveDialogOpacity('flat',82);
 settings.initializeSurfaceMaterial();
 assert.deepEqual(api.storage.get(model.MODULE_OPACITY_KEY),{flat:80,glass:25});
 assert.deepEqual(api.storage.get(model.BUTTON_OPACITY_KEY),{flat:70,glass:45});
 assert.deepEqual(api.storage.get(model.DIALOG_OPACITY_KEY),{flat:82,glass:30});
 await settings.saveSurfaceMaterial('glass','flat');assert.equal(values.get(model.SURFACE_MATERIAL_KEY),'glass');assert.equal(api.storage.get(model.SURFACE_MATERIAL_KEY),'glass');
 await assert.rejects(settings.saveSurfaceMaterial('flat','flat'),/setting_changed/);
 store.flush=async()=>{throw Error('disk');};await assert.rejects(settings.saveSurfaceMaterial('flat','glass'),/disk/);
 assert.equal(api.storage.get(model.SURFACE_MATERIAL_KEY),'glass');
 assert.equal(agentPreferenceDefinitions().find(x=>x.id==='surface_material').defaultValue,'flat');
 assert.equal(decodeWritablePreference('surface_material','glass'),'glass');assert.throws(()=>decodeWritablePreference('surface_material','oil'));
});
test('fresh and existing installs default to flat, receive a recommendation, and remember the reply',async()=>{
 for(const initial of [[],[['simple_mode',true]],[[model.SURFACE_MATERIAL_KEY,'flat']],[[model.SURFACE_MATERIAL_KEY,'glass']]]) {
  const api=materialHarness(),values=new Map(initial),store={getAllSync:()=>Object.fromEntries(values),hasSync:k=>values.has(k),getSync:(k,d)=>values.get(k)??d,putSync:(k,v)=>values.set(k,v),flushSync(){},flush:async()=>{}};
  const settings=loadPlatformModule('utils/SurfaceMaterialStore.ets','({initializeSurfaceMaterial,completeGlassSuggestion})',{
   ...model,...api,...localPreferenceApi(api.AppStorage),preferences:{getPreferencesSync:()=>store},hilog:{warn(){}},
  });
  api.storage.set('abilityContext',{});settings.initializeSurfaceMaterial();
  const expected=initial[0]?.[1]==='glass'?'glass':'flat';
  assert.equal(api.storage.get(model.SURFACE_MATERIAL_KEY),expected);
  assert.equal(values.get(model.SURFACE_MATERIAL_KEY),expected);
  assert.equal(api.storage.get(model.GLASS_SUGGESTION_PENDING_KEY),expected==='flat');
  if(expected==='flat') {
   await settings.completeGlassSuggestion(false);settings.initializeSurfaceMaterial();
   assert.equal(api.storage.get(model.GLASS_SUGGESTION_PENDING_KEY),false);
   assert.equal(api.storage.get(model.SURFACE_MATERIAL_KEY),'flat');
   await settings.completeGlassSuggestion(true);settings.initializeSurfaceMaterial();
   assert.equal(api.storage.get(model.SURFACE_MATERIAL_KEY),'glass');
  } else {
   settings.initializeSurfaceMaterial();assert.equal(api.storage.get(model.GLASS_SUGGESTION_PENDING_KEY),false);
   values.set(model.SURFACE_MATERIAL_KEY,'flat');settings.initializeSurfaceMaterial();
   assert.equal(api.storage.get(model.GLASS_SUGGESTION_PENDING_KEY),false,'later choosing flat must not trigger an upgrade recommendation');
  }
 }
});
test('failed glass recommendation save preserves flat and remains eligible to retry',async()=>{
 const api=materialHarness(),values=new Map([[model.SURFACE_MATERIAL_KEY,'flat']]),store={getAllSync:()=>Object.fromEntries(values),hasSync:k=>values.has(k),getSync:(k,d)=>values.get(k)??d,putSync:(k,v)=>values.set(k,v),flush:async()=>{throw Error('disk');}};
 const settings=loadPlatformModule('utils/SurfaceMaterialStore.ets','({initializeSurfaceMaterial,completeGlassSuggestion})',{
  ...model,...api,...localPreferenceApi(api.AppStorage),preferences:{getPreferencesSync:()=>store},hilog:{warn(){}},
 });
 api.storage.set('abilityContext',{});settings.initializeSurfaceMaterial();
 await assert.rejects(settings.completeGlassSuggestion(true),/disk/);
 assert.equal(api.storage.get(model.SURFACE_MATERIAL_KEY),'flat');
 assert.equal(values.get(model.GLASS_SUGGESTION_HANDLED_KEY),undefined);
 assert.equal(api.storage.get(model.GLASS_SUGGESTION_PENDING_KEY),true);
});
test('select popup guards stale, busy and invalid callbacks and preserves selected values',()=>{
 const Select=loadComponentLogic('components/common/SurfaceSelect.ets','SurfaceSelect',{selectionMenuWidth:()=>180,selectionMenuMaxHeight:()=>320}),view=new Select(),calls=[];
 view.measureMenu=()=>{};
 Object.assign(view,{options:[{value:'Flat'},{value:'Glass'}],selectedIndex:0,isInteractive:true,onSelect:i=>calls.push(i)});
 view.select('1');assert.deepEqual(calls,[]);view.open();assert.equal(view.items()[0].selected,true);
 view.select('9');view.select('nan');assert.deepEqual(calls,[]);view.select('1');view.select('0');assert.deepEqual(calls,[1]);
 view.open();view.isInteractive=false;view.availabilityChanged();view.select('0');assert.deepEqual(calls,[1]);
 view.isInteractive=true;view.open();view.aboutToDisappear();assert.equal(view.menuOpen,false);
});
test('root background disables built-in gradients for flat material and keeps one shared source across navigation',()=>{
 const source=readFileSync(new URL('../../entry/src/main/ets/components/common/ThemeBackground.ets',import.meta.url),'utf8');
 assert.match(source,/@StorageProp\('surface_material'\)/);
 assert.match(source,/SharedPageBackground\(\{ reduceTransparency: this.isFlat\(\)/);
 assert.match(source,/ForEach\(this.textures\(\)/);
 const home=readFileSync(new URL('../../entry/src/main/ets/pages/首页.ets',import.meta.url),'utf8');
 assert.equal((home.match(/ThemeBackground\(/g)??[]).length,1);
 assert.ok(home.indexOf('ThemeBackground({')<home.indexOf('Navigation(this.页面栈)'));
});


test('selection menu shrinks around labels and preserves short-window scrolling',()=>{
 assert.equal(selectionMenuWidth(45,70),160);assert.equal(selectionMenuWidth(160,190),192);
 assert.equal(selectionMenuWidth(500,90),280);assert.equal(selectionMenuWidth(50,250),250);
 assert.equal(selectionMenuMaxHeight(1000,30,20),918);assert.equal(selectionMenuMaxHeight(300,30,20),218);
 assert.equal(selectionMenuMaxHeight(80,30,20),44);
 const source=readFileSync(new URL('../../entry/src/main/ets/components/common/SurfaceSelect.ets',import.meta.url),'utf8');
 assert.doesNotMatch(source,/ic_.*(?:check|confirm)|ActionMenuList\(\{|surface_selected/);
 const rows=readFileSync(new URL('../../entry/src/main/ets/components/common/SelectionOptions.ets',import.meta.url),'utf8');
 assert.match(source,/SelectionOptions\(/);assert.match(rows,/textAlign\(TextAlign.Center\)/);assert.match(rows,/accessibilitySelected\(item.selected === true\)/);
});

test('shared option rows reject removed, disabled and busy selections and resolve resource values',()=>{
 const Rows=loadComponentLogic('components/common/SelectionOptions.ets','SelectionOptions',{}),rows=new Rows(),events=[];
 rows.items=[{id:'a',label:'A'},{id:'b',label:'B',available:false}];rows.onSelect=id=>events.push(id);
 rows.select('missing');rows.select('b');rows.select('a');assert.deepEqual(events,['a']);
 rows.isInteractive=false;rows.select('a');assert.deepEqual(events,['a']);
 rows.isInteractive=true;rows.items=[];rows.select('a');assert.deepEqual(events,['a']);
 const Select=loadComponentLogic('components/common/SurfaceSelect.ets','SurfaceSelect',{localizedResourceText:()=> 'Localized'}),view=new Select();
 view.value={id:123};view.getUIContext=()=>({});assert.equal(view.valueText(),'Localized');view.value='Raw';assert.equal(view.valueText(),'Raw');
});

test('popup fill stays separate from backdrop blur in both materials',()=>{
 for(const dark of [false,true]) {
  const expected=popupAppearance('flat',dark),clear=popupAppearance('glass',dark);
  assert.equal(expected.frostedBackdrop,false);assert.equal(clear.frostedBackdrop,false);
  assert.ok(parseInt(clear.fill.slice(1,3),16)<255);
  assert.ok(parseInt(expected.fill.slice(1,3),16)>=230);assert.equal(clear.fill,'#00000000');
  assert.ok(parseInt(expected.fill.slice(1,3),16)<255);
  const Popup=loadPlatformModule('components/common/PopupSurface.ets','PopupSurface',{
   AppStorage:{get:()=>undefined},themedGlassFill:(fill)=>fill,popupAppearance,SurfaceBorder:{options:()=>({width:1,color:'border'}),materialOptions:(material,dark)=>material==='glass'?{width:dark?.8:1,color:dark?'#22FFFFFF':'#506B7C96'}:{width:1,color:'border'}},Color:{Transparent:'transparent'},BlurStyle:{NONE:'none',COMPONENT_THIN:'frost'}
  }),state={},node=new Proxy({}, {get:(_,name)=>(...args)=>{state[name]=args[0];return node;}});
  new Popup('flat',dark,12).applyNormalAttribute(node);assert.equal(state.backdropBlur,0);assert.equal(state.backgroundBlurStyle,'none');
  new Popup('glass',dark,12).applyNormalAttribute(node);assert.equal(state.backdropBlur,0);assert.equal(state.backgroundBlurStyle,'none');assert.equal(state.backgroundColor,clear.fill);
  assert.equal(state.borderRadius,12);assert.equal(state.shadow.radius,0);
  assert.ok(state.linearGradient.colors.some(x=>x[0]==='#00FFFFFF'||x[0]==='transparent'));
  assert.ok(state.linearGradient.colors.every(x=>x[0]==='transparent'||parseInt(x[0].slice(1,3),16)<=(dark?48:112)));
 }
 for(const file of ['DialogFrame','SurfaceSelect','MenuSurface']) {
  const source=readFileSync(new URL(`../../entry/src/main/ets/components/common/${file}.ets`,import.meta.url),'utf8');
  assert.match(source,file === 'MenuSurface' ? /new PopupSurface\(/ : /GlassPanel\(/);assert.doesNotMatch(source,/SeriesVisual.surfaceFor/);
 }
 const backdrop=readFileSync(new URL('../../entry/src/main/ets/components/common/DialogBackdrop.ets',import.meta.url),'utf8');
 assert.match(backdrop,/backgroundEffect\(\(this\.materialOverride \|\| this\.material\) === 'glass' && this\.blurRadius > 0 \?/);
 const bubble=readFileSync(new URL('../../entry/src/main/ets/components/common/GlassBubblePanel.ets',import.meta.url),'utf8');
 assert.match(bubble,/SharedGlassBubblePanel\(/);
 assert.match(sharedSource('harmony/shared/MenuBubble.ets'),/SharedGlassPanel\(/);
 assert.match(sharedSource('harmony/shared/MenuBubble.ets'),/actionMenuBubbleOutline\(/);
});

test('settings glass modules have a single clear surface owner rather than opaque white or frosting',()=>{
 for(const dark of [false,true]) {
  const api=materialHarness('glass',dark),state={},node=new Proxy({}, {get:(_,name)=>(...args)=>{state[name]=args[0];return node;}});
  api.SeriesVisual.settingsSurface('glass',dark,'#2F5FD0','',16).applyNormalAttribute(node);
  assert.equal(state.backdropBlur,0);assert.equal(state.backgroundBlurStyle,'none');assert.equal(state.borderRadius,16);
  assert.equal(state.backgroundColor,dark?'#591C1C1E':'#52FFFFFF');
  api.SeriesVisual.settingsSurface('flat',dark,'#2F5FD0','',16).applyNormalAttribute(node);
  assert.equal(state.backgroundColor,dark?'#1C1C1E':'#FFFFFF');
 }
});

test('settings directory and data module use the same material as secondary groups, without an opaque override',()=>{
 for(const file of ['components/设置面板.ets','components/settings/数据分组.ets','components/settings/设置分组卡片.ets']) {
  const source=readFileSync(new URL('../../entry/src/main/ets/'+file,import.meta.url),'utf8');
  assert.match(source,/SeriesVisual.settingsSurface\(/);
  assert.match(source,/@StorageProp\('surface_material'\)/);
  assert.doesNotMatch(source,/backgroundColor\(设置面板色板_取\(this.是否深色\).背景\)/);
 }
 const root=readFileSync(new URL('../../entry/src/main/ets/components/设置面板.ets',import.meta.url),'utf8');
 const directory=root.slice(root.indexOf('private settingsDirectory()'),root.indexOf('private 取本地化文本'));
 assert.doesNotMatch(directory,/backgroundColor\(/);
});

test('glass small menus use a transparent surface and home more centers while create reserves label width',()=>{
 for(const dark of [false,true]) {
  const style=popupAppearance('glass',dark,'menu');
  assert.equal(parseInt(style.fill.slice(1,3),16),0);assert.equal(style.frostedBackdrop,false);
  assert.equal(style.fill,'#00000000');
 }
 const page=readFileSync(new URL('../../entry/src/main/ets/pages/首页.ets',import.meta.url),'utf8');
 const menus=page.slice(page.indexOf('private homeMenus()'));
 assert.match(menus,/menuWidth: this.homeMenuWidth\('home_more'\)/);assert.match(menus,/menuWidth: this.homeMenuWidth\('home_create'\)/);
 assert.doesNotMatch(menus,/centered: true|menuWidth: (?:200|240)/);
});

test('legacy popup shells share the same material instead of independent white panels',()=>{
 const files=['components/AnkiWeb引导对话框.ets','components/browser/卡片信息.ets','components/home/自定义学习对话框.ets','components/settings/媒体管理面板.ets','components/云端牌组弹窗.ets','components/同步面板.ets','components/官方公告弹窗.ets','components/欢迎弹窗.ets','components/添加笔记面板.ets','pages/首页.ets'];
 for(const file of files) {
  const source=readFileSync(new URL('../../entry/src/main/ets/'+file,import.meta.url),'utf8');
  const start=source.indexOf('GlassPanel({');
  assert.ok(start>=0,file);const shell=source.slice(start,start+220);
  assert.match(source,/GlassPanel\(/,file);
  assert.doesNotMatch(shell,/backgroundColor\(/,file);
 }
});


test('deck details use independent content surfaces without a full-height tinted shell',()=>{
 for(const file of ['牌组详情面板','DeckStudyHistoryCard']) {
  const source=readFileSync(new URL('../../entry/src/main/ets/components/'+file+'.ets',import.meta.url),'utf8');
  assert.match(source,/SeriesVisual.clearSurface\(/);
  assert.doesNotMatch(source,/backgroundColor\(\$r\('app.color.surface_card'\)\)/);
 }
 for(const dark of [false,true]) {
  const api=materialHarness('glass',dark),state={};
  const node=new Proxy({}, {get:(_,name)=>(...args)=>{state[name]=args[0];return node;}});
  api.SeriesVisual.clearSurface('glass',dark,'#2F5FD0','',16).applyNormalAttribute(node);
  assert.equal(state.backgroundColor,dark?'#591C1C1E':'#52FFFFFF');
  assert.equal(state.backdropBlur,0);assert.equal(state.backgroundBlurStyle,'none');
  const fills=[];
  for(const method of ['clearSurface','settingsSurface','surfaceFor']) {
   api.SeriesVisual[method]('glass',dark,'#2F5FD0','',16).applyNormalAttribute(node);
   fills.push({fill:state.backgroundColor,gradient:state.linearGradient,blur:state.backdropBlur});
  }
  assert.deepEqual(fills,[fills[0],fills[0],fills[0]]);
  api.SeriesVisual.insetSurface('glass',dark,'#2F5FD0','',16).applyNormalAttribute(node);
  assert.equal(state.backgroundColor,'transparent');assert.equal(state.shadow.radius,0);
  assert.ok(state.linearGradient.colors.every(([color])=>color==='transparent'));
  api.SeriesVisual.clearSurface('flat',dark,'#2F5FD0','',16).applyNormalAttribute(node);
  assert.equal(state.backgroundColor,dark?'#1C1C1E':'#FFFFFF');
 }
});


test('wheel and search glass omit decorative fills and restore original flat paint',()=>{
 for(const dark of [false,true]) {
  const deps={themedGlassFill:()=> '#00000000',BlurStyle:{NONE:'none'},$r:key=>key,应用尺寸:{圆角_面板:18},SurfaceBorder:{options:()=>({width:1,color:'original-border'}),materialOptions:(material,dark)=>material==='glass'?{width:dark?.8:1,color:dark?'#22FFFFFF':'#506B7C96'}:{width:1,color:'original-border'}}};
  const Search=loadPlatformModule('utils/SearchFieldSurface.ets','SearchFieldSurface',deps);
  const Wheel=loadPlatformModule('utils/EditorWheelSurface.ets','EditorWheelSurface',deps);
  const state={},node=new Proxy({}, {get:(_,name)=>(...args)=>{state[name]=args[0];return node;}});
  new Search('glass',dark,12).applyNormalAttribute(node);
  assert.equal(state.backgroundColor,'#00000000');assert.equal(state.borderRadius,12);
  assert.equal(state.border.color,dark?'#22FFFFFF':'#506B7C96');
  const searchAlpha=parseInt(state.backgroundColor.slice(1,3),16);
  new Wheel('glass',dark,'wheel-original').applyNormalAttribute(node);
  assert.equal(state.backgroundColor,'#00000000');
  assert.equal(parseInt(state.backgroundColor.slice(1,3),16),searchAlpha);
  new Wheel('flat',dark,'wheel-original').applyNormalAttribute(node);
  assert.equal(state.backgroundColor,'wheel-original');assert.equal(state.backdropBlur,0);
  assert.ok(state.linearGradient.colors.every(([color])=>color==='#00FFFFFF'));
  new Search('flat',dark,12).applyNormalAttribute(node);
  assert.equal(state.backgroundColor,'app.color.surface_card');assert.equal(state.border.color,'original-border');
 }
 const api=materialHarness('glass',true),state={},node=new Proxy({}, {get:(_,name)=>(...args)=>{state[name]=args[0];return node;}});
 for(const method of ['surfaceFor','settingsSurface','insetSurface']) {
  api.SeriesVisual[method]('glass',true,'#336699','',18).applyNormalAttribute(node);
  assert.equal(state.border.width,method === 'insetSurface' ? 0 : .8);assert.equal(state.borderRadius,18);
  assert.ok(state.linearGradient.colors.every(([color])=>color==='#00FFFFFF'||color==='transparent'));
 }
});


test('inactive menu layout never retains a popup reflection in empty space',()=>{
 const {storage,AppStorage}=materialHarness('glass',true);
 const Menu=loadPlatformModule('components/common/MenuSurface.ets','MenuSurface',{
  AppStorage,Color:{Transparent:'transparent'},BlurStyle:{NONE:'none'},应用尺寸:{radiusLg:18},
  PopupSurface:class { applyNormalAttribute(node) { node.linearGradient({colors:[['shine',0],['shine',1]]}); } }
 });
 const state={},node=new Proxy({}, {get:(_,name)=>(...args)=>{state[name]=args[0];return node;}});
 state.linearGradient={colors:[['shine',0]]};
 new Menu(false,18).applyNormalAttribute(node);
 assert.equal(state.backgroundColor,'transparent');assert.equal(state.border.width,0);
 assert.equal(state.shadow.radius,0);assert.equal(state.backdropBlur,0);assert.equal(state.clip,false);
 assert.ok(state.linearGradient.colors.every(([color])=>color==='transparent'));
});

test('dark glass content and controls share one subtle outline',()=>{
 const api=materialHarness('glass',true),values=[];
 for (const modifier of [api.SeriesVisual.surfaceFor('glass',true,'#336699'),api.SeriesVisual.control('glass',true,'#336699',22,true)]) {
  const state={},node=new Proxy({}, {get:(_,name)=>(...args)=>{state[name]=args[0];return node;}});
  modifier.applyNormalAttribute(node);values.push(state.border);
 }
 assert.deepEqual(values[0],values[1]);assert.equal(values[1].width,.8);assert.equal(values[1].color,'#22FFFFFF');
});


test('dark content modules share the common outline with controls in flat and glass',()=>{
 for(const material of ['flat','glass']) {
  const api=materialHarness(material,true);
  const snapshot=modifier=>{
   const state={}; const node=new Proxy({}, {get:(_,name)=>(...args)=>{state[name]=args[0];return node;}});
   modifier.applyNormalAttribute(node);return state;
  };
  const content=snapshot(api.SeriesVisual.surfaceFor(material,true,'#3344FF'));
  const control=snapshot(api.SeriesVisual.control(material,true,'#3344FF',24,true));
  assert.deepEqual(content.border,control.border);
  assert.deepEqual(control.border,material === 'glass' ? {width:.8,color:'#22FFFFFF'} : {width:1,color:'#77869A'});
 }
});


test('glass modules and entry controls share neutral translucent backing without double-filling nested modules',()=>{
 for(const dark of [false,true]) {
  const api=materialHarness('glass',dark);
  const fill=modifier=>{
   const state={};const node=new Proxy({}, {get:(_,name)=>(...args)=>{state[name]=args[0];return node;}});
   modifier.applyNormalAttribute(node);return state.backgroundColor;
  };
  const alpha=color=>color==='transparent'?0:parseInt(color.slice(1,3),16)/255;
  const content=fill(api.SeriesVisual.surfaceFor('glass',dark,'#336699'));
  const control=fill(api.SeriesVisual.control('glass',dark,'#336699',24,true));
  assert.equal(content,dark?'#591C1C1E':'#52FFFFFF');
  assert.ok(alpha(content)>=.32 && alpha(content)<=.36);
  assert.equal(control,content);
  assert.equal(fill(api.SeriesVisual.insetSurface('glass',dark,'#336699','',24)),'transparent');
 }
});


test('all theme seeds retain the same neutral module and entry backing in light and dark modes',()=>{
 for(const dark of [false,true]) {
  const base=dark?'#AD18202B':'#A6FFFFFF';
  const fills=THEME_CATALOG.map(theme=>tintGlassFill(base,theme.seed,dark));
  assert.equal(new Set(fills).size,THEME_CATALOG.length);
  assert.ok(fills.every(fill=>fill.slice(0,3)===base.slice(0,3)));
  for(const theme of THEME_CATALOG) {
   const api=materialHarness('flat',dark),state={};
   const node=new Proxy({}, {get:(_,name)=>(...args)=>{state[name]=args[0];return node;}});
   api.SeriesVisual.surfaceFor('flat',dark,theme.seed).applyNormalAttribute(node);
   assert.equal(state.backgroundColor,dark?'#1C1C1E':'#FFFFFF');
   const neutral=dark?'#591C1C1E':'#52FFFFFF';
   api.SeriesVisual.surfaceFor('glass',dark,theme.seed).applyNormalAttribute(node);
   assert.equal(state.backgroundColor,neutral,`module ${theme.id} dark=${dark}`);
   new api.SeriesDeckSurface('glass',dark,theme.seed,'',18).applyNormalAttribute(node);
   assert.equal(state.backgroundColor,neutral,`deck ${theme.id} dark=${dark}`);
   api.SeriesVisual.control('glass',dark,theme.seed,18,true).applyNormalAttribute(node);
   assert.equal(state.backgroundColor,neutral,`entry ${theme.id} dark=${dark}`);
  }
  assert.equal(tintGlassFill(base,'',dark),base);
  assert.equal(tintGlassFill(base,'invalid',dark),base);
 }
});


test('light content has translucent white backing and borderless while glass controls retain the soft white edge',()=>{
 const api=materialHarness('glass',false),state={};
 const node=new Proxy({}, {get:(_,name)=>(...args)=>{state[name]=args[0];return node;}});
 api.SeriesVisual.surfaceFor('glass',false,'#336699').applyNormalAttribute(node);
 assert.equal(state.border.width,0);
 assert.ok(state.linearGradient.colors.every(([color])=>color==='#00FFFFFF'));
 assert.equal(state.backgroundColor,'#52FFFFFF');
 api.SeriesVisual.control('glass',false,'#336699',24,true).applyNormalAttribute(node);
 assert.deepEqual(state.border,{width:.9,color:'#9EFFFFFF'});
 assert.equal(state.backdropBlur,24);
 api.SeriesVisual.surfaceFor('flat',false,'#336699').applyNormalAttribute(node);
 assert.equal(state.shadow.radius,0);
 assert.ok(state.linearGradient.colors.every(([color])=>color==='#00FFFFFF'));
});


test('search retains its outline while content is borderless in light/dark and flat/glass',()=>{
 for(const dark of [false,true]) for(const material of ['flat','glass']) {
  const api=materialHarness(material,dark);
  const Search=loadPlatformModule('utils/SearchFieldSurface.ets','SearchFieldSurface',{
   ...api,themedGlassFill:fill=>fill,$r:()=> 'surface',应用尺寸:{圆角_面板:16}
  });
  const read=modifier=>{const state={};const node=new Proxy({}, {get:(_,name)=>(...args)=>{state[name]=args[0];return node;}});modifier.applyNormalAttribute(node);return state;};
  const search=read(new Search(material,dark,16));
  const expected=api.SurfaceBorder.materialOptions(material,dark);
  assert.deepEqual(search.border,expected);
  assert.deepEqual(read(api.SeriesVisual.surfaceFor(material,dark,'#336699')).border, dark ? expected : {width:0,color:'transparent'});
 }
});

test('content and toolbar surfaces share one shadow and nested or flat transitions clear it',()=>{
 for(const dark of [false,true]) {
  const api=materialHarness('glass',dark),state={};
  const node=new Proxy({}, {get:(_,name)=>(...args)=>{state[name]=args[0];return node;}});
  api.SeriesVisual.surfaceFor('glass',dark,'#3344FF').applyNormalAttribute(node);
  const content=state.shadow;
  api.SeriesVisual.control('glass',dark,'#3344FF',16,true).applyNormalAttribute(node);
  assert.deepEqual(state.shadow,content);
  api.SeriesVisual.insetSurface('glass',dark,'#3344FF','').applyNormalAttribute(node);
  assert.equal(state.shadow.radius,0);assert.equal(state.shadow.offsetY,0);
  api.SeriesVisual.surfaceFor('flat',dark,'#3344FF').applyNormalAttribute(node);
  assert.equal(state.shadow.radius,0);assert.equal(state.shadow.offsetY,0);
 }
});

test('appearance reveal reuses the original two animations once and settles reduced motion immediately',()=>{
 for(const reduced of [false,true]) {
  const animations=[];
  const Reveal=loadComponentLogic('components/common/AppearanceReveal.ets','AppearanceReveal',{
   prefersReducedMotion:()=>reduced,themeDefinition:()=>({lightActionColors:['a','b','c']}),Curve:{FastOutSlowIn:'ease',EaseOut:'out'}
  });
  const view=new Reveal();view.foreground=true;view.motion=true;
  view.getUIContext=()=>({animateTo:(options,apply)=>{animations.push(options.duration);apply();}});
  view.revealGift();view.revealGift();assert.equal(view.revealed,true);assert.equal(view.burst,true);
  assert.deepEqual(animations,reduced?[]:[560,1400]);
 }
});

test('glass recommendation tracks the actual action and suppresses repeat or switched clicks while saving',()=>{
 const Dialog=loadComponentLogic('components/home/GlassSuggestionDialog.ets','GlassSuggestionDialog',{});
 for(const choice of [true,false]) {
  const view=new Dialog(),actions=[];view.busy=false;
  view.onConfirm=()=>{actions.push('glass');view.busy=true;};
  view.onKeep=()=>{actions.push('keep');view.busy=true;};
  view.choose(choice);view.choose(!choice);view.choose(choice);
  assert.deepEqual(actions,[choice?'glass':'keep']);assert.equal(view.requestedGlass,choice);
  view.busy=false;view.choose(!choice);
  assert.deepEqual(actions,[choice?'glass':'keep',choice?'keep':'glass']);
 }
});

test('opaque reading surfaces use fully opaque light and dark fills in every material',()=>{
 for(const dark of [false,true]) for(const material of ['flat','glass']) {
  assert.equal(popupAppearance(material,dark,'dialog',true).fill,dark?'#18202B':'#FFFFFF');
 }
});

test('preview omits fill while glass entry controls retain neutral backing instead of supplied blue fill',()=>{
 for(const dark of [false,true]) {
  assert.deepEqual(popupAppearance('glass',dark,'preview'),popupAppearance('glass',dark,'dialog'));
  const api=materialHarness('flat',dark),state={},node=new Proxy({}, {get:(_,name)=>(...args)=>{state[name]=args[0];return node;}});
  api.SeriesVisual.control('glass',dark,'#2F5FD0',18,true,'#B3B8D9FF').applyNormalAttribute(node);
  assert.equal(state.backgroundColor,dark?'#591C1C1E':'#52FFFFFF');assert.equal(state.borderRadius,18);
  assert.ok(state.border.width>0);
 }
});

test('theme and material transitions clear old module outlines on the same actual node',()=>{
 const api=materialHarness('glass',true),state={};
 const node=new Proxy({}, {get:(_,name)=>(value)=>{state[name]=value;return node;}});
 for(const [material,dark,nested] of [['glass',true,false],['flat',true,false],['glass',false,false],['glass',true,false],['glass',true,true],['flat',false,false]]) {
  const modifier=nested?api.SeriesVisual.insetSurface(material,dark,'#447799'):api.SeriesVisual.clearSurface(material,dark,'#447799','',18);
  modifier.applyNormalAttribute(node);
  assert.deepEqual(state.border,api.SurfaceBorder.contentOptions(material,dark,nested));
  if(!dark||nested)assert.equal(state.border.width,0);
 }
});

test('page shells expose the root background in glass or with a wallpaper', () => {
 const api = loadPlatformModule('utils/GlassMaterial.ets', '({pageMaterialFill})', {
  Color: {Transparent: 'transparent'}, tintGlassFill
 });
 for (const fill of ['#FFFFFF', '#1C1C1E', '#F5F7FA']) {
  assert.equal(api.pageMaterialFill(fill, 'glass', ''), 'transparent');
  assert.equal(api.pageMaterialFill(fill, 'flat', ''), fill);
  assert.equal(api.pageMaterialFill(fill, 'flat', '/files/wallpaper.png'), 'transparent');
 }
});
