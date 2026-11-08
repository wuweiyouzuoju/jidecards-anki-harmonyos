import test from 'node:test';
import assert from 'node:assert/strict';
import * as config from '../../entry/src/main/ets/model/AppearanceCustomization.ts';
import { themeDefinition, customTheme, THEME_CATALOG, selectableThemes } from '../../entry/src/main/ets/model/ThemeCatalog.ts';
import { 解析主题色板 } from '../../entry/src/main/ets/model/颜色主题.ets';
import { loadPlatformModule, loadComponentLogic } from './platform-module-harness.mjs';
import { 对比度 } from '../../entry/src/main/ets/model/色阶生成.ets';

test('custom accents validate complete RGB values and do not mutate preset definitions',()=>{
 assert.equal(config.normalizedAccent('#ab12ef'),'#AB12EF');
 for(const input of ['red','#fff','#12345678','#GG0000',''])assert.throws(()=>config.normalizedAccent(input));
 assert.equal(config.rgbAccent(-1,128.1,300),'#0080FF');
 const original=themeDefinition('custom').seed;
 assert.equal(customTheme('#ABCDEF').seed,'#ABCDEF');assert.equal(themeDefinition('custom').seed,original);
 assert.ok(THEME_CATALOG.some(x=>x.id==='custom'));
});
test('custom seeds generate distinct accessible light/dark actions without changing learning semantic colors',()=>{
 for(const dark of [false,true]){
  const reference=解析主题色板('aurora',dark);
  const values=[];
  for(const seed of ['#FF0000','#00FF00','#0000FF','#FFFFFF','#000000','#CCCCCC','#E14ACD']){
   const palette=解析主题色板('custom',dark,seed);values.push(palette.动作主色);
   assert.equal(palette.新卡计数色,reference.新卡计数色);assert.equal(palette.学习中计数色,reference.学习中计数色);
   assert.ok(对比度(palette.主色文字,dark?'#18202B':'#FFFFFF')>=4.5);
  }
  assert.ok(new Set(values).size>3);
 }
 assert.equal(config.maskOpacity(1),.85);assert.equal(config.maskOpacity(-1),0);assert.throws(()=>config.maskOpacity(NaN));
});
function harness(){
 const data=new Map(),published=new Map(),files=new Set(['/files/wallpaper-old.jpg']);
 data.set(config.WALLPAPER_KEY,'/files/wallpaper-old.jpg');
 let fail=false,closed=0,released=0;
 const store={}, encodings=[];
 const api=loadPlatformModule('utils/AppearanceCustomizationStore.ets',
  '({loadAppearanceCustomization,saveCustomAccent,saveWallpaper,saveWallpaperMask,saveWallpaperOpacity})',{
  ...config,AppStorage:{get:()=>({filesDir:'/files'}),setOrCreate:(key,value)=>published.set(key,value)},
  preferences:{getPreferencesSync:()=>store},
  readLocalPreference:async(_s,key,fallback)=>data.get(key)??fallback,
  saveLocalPreference:async(_s,key,value,_fallback,expected)=>{
   if(fail)throw Error('save_failed');if(expected!==null&&expected!==undefined)assert.equal(data.get(key)??_fallback,expected);
   data.set(key,value);published.set(key,value);
  },
  fileIo:{OpenMode:{READ_WRITE:1,CREATE:2,TRUNC:4},openSync(path){files.add(path);return {fd:1};},
   writeSync(){},closeSync(){closed++;},accessSync:path=>files.has(path),unlinkSync:path=>files.delete(path)},
  image:{createImagePacker:()=>({packToData:async(_pixels, options)=>{encodings.push(options);return new ArrayBuffer(4);},release(){released++;}})}
 });
 return {api,data,published,files,encodings,fail:()=>{fail=true;},counts:()=>({closed,released})};
}
test('wallpaper is durable before publication, replacing removes only the previous owned file, clear restores default',async()=>{
 const h=harness();await h.api.saveWallpaper({});
 const saved=h.data.get(config.WALLPAPER_KEY);assert.match(saved,/^\/files\/wallpaper-\d+\.jpg$/);
 assert.ok(h.files.has(saved));assert.ok(!h.files.has('/files/wallpaper-old.jpg'));assert.deepEqual(h.counts(),{closed:1,released:1});
 await h.api.saveWallpaper(null);assert.equal(h.data.get(config.WALLPAPER_KEY),'');assert.ok(!h.files.has(saved));
});
test('wallpaper format selection encodes PNG or JPEG and cleans up either extension',async()=>{
 const h=harness();
 await h.api.saveWallpaper({},true);
 const png=h.data.get(config.WALLPAPER_KEY);
 assert.match(png,/^\/files\/wallpaper-\d+\.png$/);
 await h.api.saveWallpaper({},false);
 assert.ok(!h.files.has(png));
 assert.deepEqual(h.encodings.map(({format,quality})=>[format,quality]),[['image/png',100],['image/jpeg',90]]);
});
test('failed preference write retains old wallpaper and does not publish an unverified path',async()=>{
 const h=harness();h.fail();await assert.rejects(h.api.saveWallpaper({}));
 assert.equal(h.data.get(config.WALLPAPER_KEY),'/files/wallpaper-old.jpg');assert.ok(h.files.has('/files/wallpaper-old.jpg'));
 assert.equal(h.published.has(config.WALLPAPER_KEY),false);assert.deepEqual(h.counts(),{closed:1,released:1});
});
test('appearance reload retains custom accent and independent masks, invalid saves fail before publication',async()=>{
 const h=harness();await h.api.saveCustomAccent('#12ab34');await h.api.saveWallpaperMask(false,.3);await h.api.saveWallpaperMask(true,.65);await h.api.saveWallpaperOpacity(42);
 await h.api.loadAppearanceCustomization();assert.equal(h.published.get(config.CUSTOM_ACCENT_KEY),'#12AB34');
 assert.equal(h.published.get(config.WALLPAPER_LIGHT_KEY),.3);assert.equal(h.published.get(config.WALLPAPER_DARK_KEY),.65);
 assert.equal(h.published.get(config.WALLPAPER_OPACITY_KEY),42);
 await assert.rejects(h.api.saveCustomAccent('#xyz'));assert.equal(h.published.get(config.CUSTOM_ACCENT_KEY),'#12AB34');
});

test('appearance interface reports real conditional controls and never exposes a private image path',async()=>{
 let view;
 const pixels={},saved=[],released=[];
 const Control=loadComponentLogic('components/settings/AppearanceCustomizationDialog.ets','AppearanceCustomizationDialog',{
  ...config, AppStorage:{get:()=> 'aurora',setOrCreate(){},delete(){}}, SeriesVisual:{isDark:()=>false}, 应用颜色主题(){}, IBestImageCropperController:class { async getResult(){return pixels;} },
  saveWallpaper:async(...args)=>saved.push(args),saveWallpaperMask:async()=>{},saveWallpaperOpacity:async()=>{},releaseDeckBackground:map=>{if(map)released.push(map);}, appInterface:{observe:v=>view=v,leave(){}},
  display:{getDefaultDisplaySync:()=>({width:1280,height:2832})}
 });
 const control=new Control();control.pane='wallpaper';control.aboutToAppear();
 assert.ok(view.items.some(x=>x.id==='wallpaper_choose'));assert.ok(!view.items.some(x=>x.id==='wallpaper_remove'));
 control.wallpaper='/private/image.jpg';control.publishInterface();
 assert.ok(view.items.some(x=>x.id==='wallpaper_remove'));assert.ok(!JSON.stringify(view).includes('/private'));
 control.uri='provider://new';control.publishInterface();
 assert.deepEqual(view.items.map(x=>x.id),['wallpaper_crop_apply','wallpaper_crop_cancel']);
 await control.confirmCrop();control.publishInterface();
 assert.equal(control.uri,'');assert.equal(control.wallpaperDraft,pixels);assert.deepEqual(saved,[]);
 assert.equal(view.sectionId,'wallpaper');
 assert.ok(view.items.some(x=>x.id==='wallpaper_apply'));
 assert.equal(view.items.find(x=>x.id==='wallpaper_save_compact').selected,true);
 control.losslessWallpaper=true;control.publishInterface();
 assert.equal(view.items.find(x=>x.id==='wallpaper_save_lossless').selected,true);
 assert.equal(view.items.find(x=>x.id==='wallpaper_save_compact').selected,false);
 control.busy=true;control.publishInterface();assert.ok(view.items.every(x=>!x.enabled));
 control.busy=false;
 await control.applyWallpaper();assert.deepEqual(saved,[[pixels,true]]);
 control.aboutToDisappear();assert.deepEqual(released,[pixels]);
});

test('standard appearance dialogs reject busy dismissal and cancel only the current crop before closing',()=>{
 let closes=0,guard;
 const Dialog=loadComponentLogic('components/settings/AppearanceCustomizationDialog.ets','AppearanceCustomizationDialog',{
  ...config, AppStorage:{get:()=> 'aurora',setOrCreate(){},delete(){}}, SeriesVisual:{isDark:()=>false}, 应用颜色主题(){}, IBestImageCropperController:class {}, appInterface:{observe(){},leave(){}},
  display:{getDefaultDisplaySync:()=>({width:1280,height:2832})}
 });
 const dialog=new Dialog();dialog.onClose=()=>closes++;dialog.registerDismiss=g=>guard=g;
 dialog.pane='color';dialog.aboutToAppear();assert.equal(dialog.draft,config.DEFAULT_CUSTOM_ACCENT);
 dialog.draft='#FF0000';dialog.busy=true;dialog.close();assert.equal(closes,0);assert.equal(guard(),false);
 dialog.busy=false;dialog.uri='provider://new';assert.equal(guard(),false);assert.equal(dialog.uri,'');
 assert.equal(dialog.savedAccent,config.DEFAULT_CUSTOM_ACCENT);dialog.close();assert.equal(closes,1);
});

test('custom is always the final selectable theme even when new catalog entries are appended',()=>{
 const extra={...themeDefinition('aurora'),id:'future-theme'};
 THEME_CATALOG.push(extra);
 try {
  const choices=selectableThemes().map(x=>x.id);
  assert.equal(choices.at(-1),'custom');assert.equal(choices.at(-2),'future-theme');
  assert.equal(choices.filter(id=>id==='custom').length,1);
 } finally {THEME_CATALOG.pop();}
});
function previewHarness(theme='iridescent',saveResult={saved:true,applied:true}){
 const values=new Map([['colorTheme',theme],[config.CUSTOM_ACCENT_KEY,'#336699']]);
 const renders=[],saves=[];let closes=0;
 const Dialog=loadComponentLogic('components/settings/AppearanceCustomizationDialog.ets','AppearanceCustomizationDialog',{
  ...config, AppStorage:{get:key=>values.get(key),setOrCreate:(key,value)=>values.set(key,value),delete:key=>values.delete(key)},
  SeriesVisual:{isDark:(mode,system)=>mode==='dark'||(mode!=='light'&&system)},
  应用颜色主题:(id,dark)=>renders.push({id,dark,preview:values.get(config.PREVIEW_ACCENT_KEY)||'',saved:values.get(config.CUSTOM_ACCENT_KEY)}),
  appThemeColorSession:{setColor:async(...args)=>{saves.push(args);if(saveResult.saved){values.set('colorTheme','custom');values.set(config.CUSTOM_ACCENT_KEY,args[2]);values.set(config.ACCENT_LIGHT_ADAPTATION_KEY,args[3].light);values.set(config.ACCENT_DARK_ADAPTATION_KEY,args[3].dark);}return saveResult;}},
  IBestImageCropperController:class {},appInterface:{observe(){},leave(){}},
  display:{getDefaultDisplaySync:()=>({width:1280,height:2832})}
 });
 const dialog=new Dialog();dialog.savedAccent='#336699';dialog.onClose=()=>closes++;dialog.aboutToAppear();
 return {dialog,values,renders,saves,closes:()=>closes};
}
test('RGB and HEX preview update global palette immediately without saving, cancel restores opening theme',()=>{
 for(const theme of ['iridescent','aurora','custom']){
  const h=previewHarness(theme);h.dialog.changeChannel(0,255);
  assert.equal(h.values.get(config.PREVIEW_ACCENT_KEY),'#FF6699');assert.equal(h.renders.at(-1).id,'custom');
  assert.equal(h.values.get(config.CUSTOM_ACCENT_KEY),'#336699');assert.deepEqual(h.saves,[]);
  h.dialog.draft='#00AA55';h.dialog.syncChannels();h.dialog.previewColor();assert.equal(h.renders.at(-1).preview,'#00AA55');
  h.dialog.close();assert.equal(h.renders.at(-1).id,theme);assert.equal(h.renders.at(-1).preview,'');
  assert.equal(h.closes(),1);assert.equal(h.values.get(config.CUSTOM_ACCENT_KEY),'#336699');
 }
});
test('native dismiss, destruction and invalid inputs preserve the last valid preview and never persist it',()=>{
 const h=previewHarness();h.dialog.changeChannel(1,255);const count=h.renders.length;
 h.dialog.draft='#x';h.dialog.previewColor();assert.equal(h.renders.length,count);
 h.dialog.aboutToDisappear();assert.equal(h.renders.at(-1).id,'iridescent');assert.equal(h.renders.at(-1).preview,'');
 assert.deepEqual(h.saves,[]);
});
test('confirm persists the preview exactly once and does not roll back when its dialog is destroyed',async()=>{
 const h=previewHarness();h.dialog.changeChannel(2,255);await h.dialog.applyColor();
 assert.deepEqual(h.saves,[['custom','iridescent','#3366FF',{light:100,dark:100}]]);assert.equal(h.closes(),1);
 h.dialog.aboutToDisappear();assert.equal(h.values.get(config.CUSTOM_ACCENT_KEY),'#3366FF');
 assert.equal(h.renders.at(-1).id,'custom');assert.equal(h.renders.at(-1).preview,'');
});
test('unconfirmed save failures keep the editor open and cancellation restores the original palette',async()=>{
 const h=previewHarness('aurora',{saved:false,applied:false,errorCode:'failed'});
 h.dialog.changeChannel(0,255);await h.dialog.applyColor();assert.equal(h.closes(),0);assert.equal(h.dialog.failed,true);
 h.dialog.close();assert.equal(h.renders.at(-1).id,'aurora');assert.equal(h.values.get(config.CUSTOM_ACCENT_KEY),'#336699');
});

test('independent adaptation ranges from exact seed to the existing automatic palette',()=>{
 for(const dark of [false,true])for(const seed of ['#FFCC00','#336699','#FFFFFF','#000000']){
  const automatic=解析主题色板('custom',dark,seed);
  assert.deepEqual(解析主题色板('custom',dark,seed,100),automatic);
  const original=解析主题色板('custom',dark,seed,0);
  for(const field of ['动作主色','主色文字','主色图标','主色按钮背景'])assert.equal(original[field],seed);
  assert.equal(original.新卡计数色,automatic.新卡计数色);
  assert.equal(original.复习中计数色,automatic.复习中计数色);
  const mid=解析主题色板('custom',dark,seed,50);
  assert.equal(mid.动作主色,config.adaptedAccent(seed,automatic.动作主色,50));
 }
 for(const strength of [NaN,Infinity,-1,101])assert.throws(()=>config.adaptationStrength(strength));
});
test('mode adaptation previews independently, restores on cancel and saves together with the color',async()=>{
 const h=previewHarness('custom');h.dialog.changeAdaptation(false,0);h.dialog.changeAdaptation(true,35);
 assert.equal(h.values.get(config.PREVIEW_LIGHT_ADAPTATION_KEY),0);
 assert.equal(h.values.get(config.PREVIEW_DARK_ADAPTATION_KEY),35);
 assert.equal(h.values.has(config.ACCENT_LIGHT_ADAPTATION_KEY),false);
 h.dialog.close();assert.equal(h.values.has(config.PREVIEW_LIGHT_ADAPTATION_KEY),false);
 assert.equal(h.values.has(config.PREVIEW_DARK_ADAPTATION_KEY),false);
 const saved=previewHarness();saved.dialog.changeAdaptation(false,10);saved.dialog.changeAdaptation(true,80);
 await saved.dialog.applyColor();assert.deepEqual(saved.saves[0][3],{light:10,dark:80});
 assert.equal(saved.values.get(config.ACCENT_LIGHT_ADAPTATION_KEY),10);
 assert.equal(saved.values.get(config.ACCENT_DARK_ADAPTATION_KEY),80);
 assert.equal(saved.values.has(config.PREVIEW_DARK_ADAPTATION_KEY),false);
});
test('appearance restart restores independent adaptation and old installations default to automatic',async()=>{
 const h=harness();await h.api.loadAppearanceCustomization();
 assert.equal(h.published.get(config.ACCENT_LIGHT_ADAPTATION_KEY),100);
 assert.equal(h.published.get(config.ACCENT_DARK_ADAPTATION_KEY),100);
 h.data.set(config.ACCENT_LIGHT_ADAPTATION_KEY,0);h.data.set(config.ACCENT_DARK_ADAPTATION_KEY,65);
 await h.api.loadAppearanceCustomization();assert.equal(h.published.get(config.ACCENT_LIGHT_ADAPTATION_KEY),0);
 assert.equal(h.published.get(config.ACCENT_DARK_ADAPTATION_KEY),65);
});

test('the real color manager and editor swatches use the same saved and preview mode strengths',async()=>{
 const catalog=await import('../../entry/src/main/ets/model/ThemeCatalog.ts');
 const palette=await import('../../entry/src/main/ets/model/颜色主题.ets');
 const values=new Map([[config.CUSTOM_ACCENT_KEY,'#336699'],[config.ACCENT_LIGHT_ADAPTATION_KEY,0],
  [config.ACCENT_DARK_ADAPTATION_KEY,70]]);
 const apply=loadPlatformModule('utils/颜色主题管理器.ets','应用颜色主题',{
  ...catalog,...config,...palette,
  AppStorage:{get:key=>values.get(key),setOrCreate:(key,value)=>values.set(key,value)}
 });
 apply('custom',false);assert.equal(values.get(palette.颜色键.动作主色),'#336699');
 apply('custom',true);assert.equal(values.get(palette.颜色键.动作主色),palette.解析主题色板('custom',true,'#336699',70).动作主色);
 values.set(config.PREVIEW_ACCENT_KEY,'#FFCC00');values.set(config.PREVIEW_LIGHT_ADAPTATION_KEY,25);
 values.set(config.PREVIEW_DARK_ADAPTATION_KEY,0);
 apply('aurora',false);assert.equal(values.get(palette.颜色键.动作主色),palette.解析主题色板('custom',false,'#FFCC00',25).动作主色);
 apply('aurora',true);assert.equal(values.get(palette.颜色键.动作主色),'#FFCC00');
 values.delete(config.PREVIEW_ACCENT_KEY);values.delete(config.PREVIEW_LIGHT_ADAPTATION_KEY);values.delete(config.PREVIEW_DARK_ADAPTATION_KEY);
 apply('custom',false);assert.equal(values.get(palette.颜色键.动作主色),'#336699');
});
test('JIDE observes the two real adaptation controls and their current drafts without gaining a write tool',()=>{
 let view;
 const Dialog=loadComponentLogic('components/settings/AppearanceCustomizationDialog.ets','AppearanceCustomizationDialog',{
  ...config, AppStorage:{get:()=> 'aurora',setOrCreate(){},delete(){}},
  SeriesVisual:{isDark:()=>false}, 应用颜色主题(){}, 解析主题色板, IBestImageCropperController:class {},
  appInterface:{observe:v=>view=v,leave(){}},display:{getDefaultDisplaySync:()=>({width:390,height:844})}
 });
 const dialog=new Dialog();dialog.savedLightAdaptation=35;dialog.savedDarkAdaptation=80;dialog.aboutToAppear();
 assert.ok(view.items.some(item=>item.id==='accent_light_adaptation'&&item.enabled));
 assert.ok(view.items.some(item=>item.id==='accent_dark_adaptation'&&item.enabled));
 const fields=()=>Object.fromEntries(view.values.map(item=>[item.id,item.value]));
 assert.equal(fields().accent_light_adaptation,'35');dialog.changeAdaptation(false,0);
 assert.equal(fields().preview_light_adaptation,'0');assert.equal(fields().accent_light_adaptation,'35');
 assert.equal(dialog.effectiveAccent(false),dialog.draft);dialog.busy=true;dialog.publishInterface();
 assert.ok(view.items.every(item=>!item.enabled));
});
