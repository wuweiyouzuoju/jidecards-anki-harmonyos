import { APPEARANCE_CUSTOMIZATION_ITEMS } from '../../entry/src/main/ets/model/AppearanceCustomization.ts';
import { validAccent } from '../../entry/src/main/ets/model/AppearanceCustomization.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import * as elements from '../../entry/src/main/ets/model/AppearanceElements.ts';
import { accentToPicker, pickerToAccent, pickerHue } from '../../entry/src/main/ets/model/ColorPicker.ts';
import { loadPlatformModule, loadComponentLogic } from './platform-module-harness.mjs';
import { materialHarness } from './surface-material-harness.mjs';
import { localPreferenceApi } from './local-preference-harness.mjs';
import { SETTINGS_GROUPS } from '../../entry/src/main/ets/model/SettingsStructure.ts';

function host() {
 const values=new Map(),published=new Map(),storage=new Map(),blur=[];
 const AppStorage={get:k=>storage.get(k),setOrCreate:(k,v)=>{storage.set(k,v);published.set(k,v);},delete:k=>storage.delete(k)};
 const helpers=loadPlatformModule('utils/AppearanceElements.ets','({publishElementStyle,appearanceElementColor,appearanceTextColor,appearanceElementRadius,elementBorder})',{
  AppStorage,configureSharedGlassBlur:v=>blur.push(v),$r:key=>({id:key})
 });
 const prefs={getAllSync:()=>Object.fromEntries(values),getSync:(k,d)=>values.get(k)??d,putSync:(k,v)=>values.set(k,v),flush:async()=>{}};
 const api=loadPlatformModule('utils/AppearanceElementStore.ets','({loadAppearanceElements,saveAppearanceElements})',{
  AppStorage,...localPreferenceApi(AppStorage),preferences:{getPreferencesSync:()=>prefs}
 });
 storage.set('abilityContext',{});
 return {values,published,storage,blur,AppStorage,helpers,api,prefs};
}
test('color ring round-trips RGB including gray, white, black, and hue wraparound',()=>{
 for(let r=0;r<=255;r+=17)for(let g=0;g<=255;g+=17)for(let b=0;b<=255;b+=17){
  const rgb='#'+[r,g,b].map(v=>v.toString(16).padStart(2,'0')).join('').toUpperCase();
  const color=accentToPicker(rgb,240);
  assert.equal(pickerToAccent(color.hue,color.saturation,color.brightness),rgb);
 }
 assert.equal(accentToPicker('#000000',270).hue,270);
 assert.equal(pickerToAccent(360,100,100),'#FF0000');
 assert.equal(pickerToAccent(-120,100,100),'#0000FF');
 assert.equal(pickerHue(0,1),90);assert.equal(pickerHue(-1,0),180);
});
test('element profiles validate colors and geometry while preserving the other mode',()=>{
 const style={...elements.defaultElementStyle(),text:'#123456',outline:'#ABCDEF',radius:24,width:2.5,blur:0};
 const raw=elements.replaceElementStyle('',false,style);
 assert.deepEqual(elements.elementStyleFor(raw,false),style);
 assert.deepEqual(elements.elementStyleFor(raw,true),elements.defaultElementStyle());
 for(const change of [{radius:-.5},{radius:33},{width:-.5},{width:1.2},{blur:NaN},{blur:101},{text:'red'}])
  assert.throws(()=>elements.replaceElementStyle(raw,false,{...style,...change}));
});
test('saved profiles restore before applying, reject stale writes, and do not publish failed saves',async()=>{
 const h=host(),light={...elements.defaultElementStyle(),text:'#123456'};
 await h.api.loadAppearanceElements();assert.equal(h.storage.get(elements.APPEARANCE_ELEMENTS_KEY),'');
 await h.api.saveAppearanceElements(false,light,'');
 const saved=h.values.get(elements.APPEARANCE_ELEMENTS_KEY);
 await assert.rejects(h.api.saveAppearanceElements(true,elements.defaultElementStyle(),''),/setting_changed/);
 h.storage.delete(elements.APPEARANCE_ELEMENTS_KEY);await h.api.loadAppearanceElements();
 assert.equal(h.storage.get(elements.APPEARANCE_ELEMENTS_KEY),saved);
 h.prefs.flush=async()=>{throw Error('disk');};
 await assert.rejects(h.api.saveAppearanceElements(false,{...light,text:'#445566'},saved),/disk/);
 assert.equal(h.storage.get(elements.APPEARANCE_ELEMENTS_KEY),saved);
});
test('actual rendering resolves normal text hierarchy, lines, corners and blur from saved/preview mode',()=>{
 const h=host();
 h.storage.set(elements.APPEARANCE_ELEMENTS_KEY,elements.replaceElementStyle('',false,
  {...elements.defaultElementStyle(),text:'#123456',outline:'#ABCDEF',radius:28,width:3,blur:0}));
 h.helpers.publishElementStyle(false);
 const active=h.storage.get(elements.APPEARANCE_ELEMENTS_ACTIVE_KEY);
 assert.equal(h.helpers.appearanceElementColor(active,'text_primary','default'),'#123456');
 assert.equal(h.helpers.appearanceElementColor(active,'text_secondary','default'),'#B8123456');
 assert.equal(h.helpers.appearanceElementColor(active,'divider','default'),'#ABCDEF');
 assert.equal(h.helpers.appearanceTextColor(active,{id:'app.color.text_primary'}),'#123456');
 assert.deepEqual(h.helpers.appearanceTextColor(active,{id:'app.color.error_text'}),{id:'app.color.error_text'});
 assert.equal(h.helpers.appearanceElementRadius(active,16),28);
 assert.deepEqual(h.helpers.elementBorder({width:1,color:'default'}),{width:3,color:'#ABCDEF'});
 assert.equal(h.blur.at(-1),0);
 h.helpers.publishElementStyle(true);assert.equal(h.blur.at(-1),1.6);
 assert.equal(h.helpers.appearanceElementColor(h.storage.get(elements.APPEARANCE_ELEMENTS_ACTIVE_KEY),'text_primary','default'),'default');
});
test('each target editor previews only its own fields, cancels all exits and saves exactly once',async()=>{
 for(const target of ['appearance_text','appearance_outline','appearance_background','appearance_border']){
  const h=host();let observed,closed=0,saves=0;
  const Dialog=loadComponentLogic('components/settings/AppearanceElementDialog.ets','AppearanceElementDialog',{
   ...elements,SurfaceBorder:{color:()=>({id:'app.color.surface_border'}),glassOutlineWidth:()=>0.8},APPEARANCE_CUSTOMIZATION_ITEMS,validAccent,AppStorage:h.AppStorage,SeriesVisual:{isDark:()=>false},
   应用颜色主题:()=>h.helpers.publishElementStyle(false),
   saveAppearanceElements:async(...args)=>{saves++;await h.api.saveAppearanceElements(...args);},
   appInterface:{observe:v=>observed=v,leave(){}},
  });
  const dialog=new Dialog();dialog.target=target;dialog.onClose=()=>closed++;dialog.aboutToAppear();
  assert.equal(observed.sectionId,target);
  assert.equal(observed.values.find(v=>v.id==='appearance_editing_mode').value,'light');
  if(target==='appearance_border')dialog.changeShape(true,26);else dialog.changeColor('#234567');
  assert.equal(saves,0);assert.ok(h.storage.get(elements.APPEARANCE_ELEMENTS_PREVIEW_KEY));
  dialog.close();assert.equal(closed,1);assert.equal(h.storage.has(elements.APPEARANCE_ELEMENTS_PREVIEW_KEY),false);
  assert.equal(h.storage.get(elements.APPEARANCE_ELEMENTS_KEY),undefined);
  dialog.aboutToAppear();
  if(target==='appearance_border')dialog.changeShape(false,2);else dialog.changeColor('#234567');
  await dialog.apply();assert.equal(saves,1);assert.equal(closed,2);
  const confirmed=h.storage.get(elements.APPEARANCE_ELEMENTS_KEY);
  dialog.aboutToDisappear();assert.equal(h.storage.get(elements.APPEARANCE_ELEMENTS_KEY),confirmed);
 }
});
test('failed element save stays open with its draft and blocks exits while saving',async()=>{
 const h=host();let guard,finish,closed=0;
 const Dialog=loadComponentLogic('components/settings/AppearanceElementDialog.ets','AppearanceElementDialog',{
  APPEARANCE_CUSTOMIZATION_ITEMS,validAccent,AppStorage:h.AppStorage,SeriesVisual:{isDark:()=>false},应用颜色主题:()=>h.helpers.publishElementStyle(false),
  saveAppearanceElements:()=>new Promise((_,reject)=>{finish=reject;}),appInterface:{observe(){},leave(){}}
 });
 const d=new Dialog();d.registerDismiss=g=>guard=g;d.onClose=()=>closed++;d.aboutToAppear();d.changeColor('#234567');
 const pending=d.apply();assert.equal(guard(),false);d.close();assert.equal(closed,0);
 finish(Error('disk'));await pending;assert.equal(d.failed,true);assert.equal(d.busy,false);assert.equal(closed,0);
 assert.ok(h.storage.has(elements.APPEARANCE_ELEMENTS_PREVIEW_KEY));assert.equal(guard(),true);
 assert.equal(h.storage.has(elements.APPEARANCE_ELEMENTS_PREVIEW_KEY),false);
});
test('new controls are discoverable in the same settings catalogue used by JIDE',()=>{
 const group=SETTINGS_GROUPS.find(g=>g.id==='appearance');
 for(const item of elements.APPEARANCE_ELEMENT_ITEMS){
  const entry=group.items.find(i=>i.id===item.id);assert.equal(entry.titleKey,item.titleKey);assert.equal(entry.opens,'appearance_customization');
 }
 assert.ok(group.items.some(i=>i.id==='glass_blur'));
});
test('native components do not bypass ordinary text, line, background and design-token corner overrides',()=>{
 const root=new URL('../../entry/src/main/ets/',import.meta.url),violations=[];
 for(const file of readdirSync(root,{recursive:true}).filter(f=>f.endsWith('.ets'))){
  const text=readFileSync(new URL(file,root),'utf8');if(!/\bstruct\s/.test(text))continue;
  for(const [index,line] of text.split('\n').entries()){
   if(/\.(?:fontColor|backgroundColor)\(\$r\('app.color.(?:text_primary|text_secondary|text_tertiary|surface_border|border_subtle|border_input|divider|surface_page)'\)/.test(line)||
     /\.borderRadius\(应用尺寸\.圆角_/.test(line))violations.push(`${file}:${index+1}`);
  }
 }
 assert.deepEqual(violations,[]);
});

test('all numerical sliders share the actual theme track and thumb while preserving their callbacks',()=>{
 const Style=loadPlatformModule('utils/SliderStyle.ets','SliderStyle',{});
 const attributes={};const node=new Proxy({}, {get:(_,name)=>(value)=>{attributes[name]=value;return node;}});
 for(const accent of ['#FF00FF','#123456','#FF0000']){
  new Style(accent).applyNormalAttribute(node);
  assert.equal(attributes.selectedColor,accent);assert.equal(attributes.blockColor,accent);
 }
 const root=new URL('../../entry/src/main/ets/',import.meta.url);let count=0;
 for(const file of readdirSync(root,{recursive:true}).filter(f=>f.endsWith('.ets'))){
  const source=readFileSync(new URL(file,root),'utf8');
  const constructors=[...source.matchAll(/(?<![\w.])Slider\(/g)];
  for(const match of constructors){
   const tail=source.slice(match.index);
   assert.match(tail,/^[\s\S]*?\)\.attributeModifier\(new SliderStyle\(this\.(?:accent|actionColor)\)\)/,file);
   count++;
  }
 }
 assert.equal(count,9);
});
test('color ring redraws the center hue during dragging without redundant sliders or ambiguous alpha hex',()=>{
 const gradients=[],fills=[],outputs=[];
 class Canvas {
  clearRect(){} beginPath(){} arc(){} stroke(){}
  fillRect(){fills.push(this.fillStyle);}
  createLinearGradient(){const stops=[];gradients.push(stops);return {addColorStop:(...args)=>stops.push(args)};}
 }
 const Picker=loadComponentLogic('components/settings/AppearanceColorPicker.ets','AppearanceColorPicker',{
  validAccent,CanvasRenderingContext2D:Canvas,RenderingContextSettings:class{},
  accentToPicker,pickerToAccent,pickerHue
 });
 const picker=new Picker();picker.onChange=v=>outputs.push(v);picker.color='#FF0000';picker.aboutToAppear();picker.ready=true;
 picker.begin(193,104);picker.move(104,193);
 assert.equal(picker.hue,90);assert.equal(fills.at(-3),'#80FF00');
 assert.equal(outputs.at(-1),'#80FF00');
 assert.deepEqual(gradients.at(-2),[[0,'#FFFFFF'],[1,'rgba(255,255,255,0)']]);
 assert.deepEqual(gradients.at(-1),[[0,'rgba(0,0,0,0)'],[1,'#000000']]);
 picker.begin(152,56);assert.equal(outputs.at(-1),'#80FF00');
 picker.move(56,152);assert.equal(outputs.at(-1),'#000000');
 picker.isInteractive=false;const before=outputs.length;picker.begin(193,104);assert.equal(outputs.length,before);
 const source=readFileSync(new URL('../../entry/src/main/ets/components/settings/AppearanceColorPicker.ets',import.meta.url),'utf8');
 assert.doesNotMatch(source,/\bSlider\(/);assert.match(source,/PanGesture\(/);
});

test('module line color is independent from control lines on the real shared surfaces',()=>{
 const h=materialHarness('glass');
 const style={...elements.defaultElementStyle(),moduleOutline:'#FF0000',outline:'#0000FF',moduleRadius:7,moduleWidth:3,radius:0,width:2};
 h.storage.set(elements.APPEARANCE_ELEMENTS_ACTIVE_KEY,JSON.stringify(style));
 const state={};const node=new Proxy({}, {get:(_,name)=>(...args)=>{state[name]=args[0];return node;}});
 for(const material of ['glass','flat'])for(const dark of [false,true]){
  h.SeriesVisual.surfaceFor(material,dark,'#123456').applyNormalAttribute(node);
  assert.equal(state.border.color,'#FF0000');assert.equal(state.border.width,3);assert.equal(state.borderRadius,7);
  h.SeriesVisual.control(material,dark,'#123456',18,true).applyNormalAttribute(node);
  assert.equal(state.border.color,'#0000FF');assert.equal(state.border.width,dark ? 2 : 0);assert.equal(state.borderRadius,0);
 }
});
test('all native style-owner calls explicitly depend on the reactive appearance snapshot',()=>{
 const root=new URL('../../entry/src/main/ets/',import.meta.url),bad=[];
 const names=/\b(?:SeriesVisual\.(?:surfaceFor|settingsSurface|clearSurface|insetSurface|surface|flatSurface|control|primaryAction)|new (?:SeriesDeckSurface|FormInputStyle|FormTextAreaStyle|SearchFieldSurface|ImageSurfaceStyle))\(/g;
 for(const file of readdirSync(root,{recursive:true}).filter(f=>f.endsWith('.ets'))){
  const source=readFileSync(new URL(file,root),'utf8');if(!/\bstruct\s/.test(source))continue;
  for(const match of source.matchAll(names)){
   let pos=match.index+match[0].length,depth=1,quote;
   const start=pos;
   while(depth){const c=source[pos++];if(quote){if(c===quote&&source[pos-2]!=='\\')quote=undefined;}
    else if("'\"`".includes(c))quote=c;else if(c==='(')depth++;else if(c===')')depth--;}
   if(!source.slice(start,pos-1).includes('this.appearanceElements'))bad.push(`${file}:${match[0]}`);
  }
 }
 assert.deepEqual(bad,[]);
});
test('unified editor restores persisted section and guards busy switches without losing the current page',async()=>{
 const storage=new Map([[elements.APPEARANCE_EDITOR_SECTION_KEY,'appearance_module_outline']]);
 let resolveSave,guard;
 const Hub=loadComponentLogic('components/settings/AppearanceCustomizationHubDialog.ets','AppearanceCustomizationHubDialog',{
  ...elements,AppStorage:{get:k=>storage.get(k)},
  saveAppearanceSection:section=>new Promise(resolve=>{resolveSave=()=>{storage.set(elements.APPEARANCE_EDITOR_SECTION_KEY,section);resolve();};})
 });
 const h=new Hub();h.registerDismiss=g=>guard=g;h.aboutToAppear();assert.equal(h.section,'appearance_module_outline');
 const pending=h.select('material');assert.equal(h.switching,true);assert.equal(guard(),false);
 await Promise.resolve();resolveSave();await pending;assert.equal(h.section,'material');assert.equal(h.switching,false);
 h.aboutToDisappear();const again=new Hub();again.aboutToAppear();assert.equal(again.section,'material');
 again.dismissGuard=()=>false;await again.select('color');assert.equal(again.section,'material');
});


test('custom border thickness cannot turn one-sided separators or disabled borders into rectangles',()=>{
 const h=materialHarness('glass');
 h.storage.set(elements.APPEARANCE_ELEMENTS_ACTIVE_KEY,JSON.stringify({...elements.defaultElementStyle(),width:4,outline:'#123456'}));
 for(const edges of [{bottom:.5},{top:.5},{bottom:0}]) {
  const result=h.SurfaceBorder.options(edges);
  assert.deepEqual(result.width,edges);assert.equal(result.color,'#123456');
 }
 assert.equal(h.SurfaceBorder.options(0).width,0);
 assert.equal(h.SurfaceBorder.options(1).width,4);
});

test('system popup clipping follows the same effective radius as its shared glass panel',()=>{
 for(const file of ['components/common/SurfaceSelect.ets','components/StudyLocalWhiteboard.ets','components/学习手写白板层.ets']){
  const source=readFileSync(new URL('../../entry/src/main/ets/'+file,import.meta.url),'utf8');
  for(const part of source.split('.bindPopup(').slice(1)) {
   assert.match(part.slice(0,part.indexOf('onStateChange')), /radius:\s*appearanceElementRadius\(this.appearanceElements, (?:12|应用尺寸\.圆角_指标卡)\)/,file);
  }
 }
 const source=readFileSync(new URL('../vendor/jide-foundation/src/harmony/shared/GlassBackdrop.ets',import.meta.url),'utf8');
 const body=source.slice(source.indexOf('export struct SharedGlassBackdrop'),source.indexOf('export interface SharedGlassRegion'));
 assert.doesNotMatch(body,/linearGradient|#C0232730|#99E9ECF2/);
});

test('popup paint layers cannot feed measured geometry back into intrinsic layout during color dragging',()=>{
 const source=readFileSync(new URL('../vendor/jide-foundation/src/harmony/shared/PopupPanel.ets',import.meta.url),'utf8');
 const start=source.indexOf("      if (this.usesGlass() && this.theme.foreground && this.surfaceVisible");
 const end=source.indexOf('      Column() { this.content() }',start);
 assert.match(source.slice(start,end),/\.width\(0\)\.height\(0\)\.position\(\{ x: 0, y: 0 \}\)/);
 const frame=readFileSync(new URL('../../entry/src/main/ets/components/common/DialogFrame.ets',import.meta.url),'utf8');
 assert.doesNotMatch(frame,/\.animation\(motionAnimation\(currentMotionProfile\(\)\.textMs\)\)/);
});

test('glass menus cannot inherit dialog fill or a second fusion tint layer',()=>{
 const panel=readFileSync(new URL('../vendor/jide-foundation/src/harmony/shared/PopupPanel.ets',import.meta.url),'utf8');
 assert.doesNotMatch(panel,/if \(\(this.role === 'dialog' \|\| this.role === 'menu'\) && this.surfaceVisible/);
 assert.match(panel,/tint: this.role === 'dialog' \? dialogPanelFill\(this.theme.dark, this.theme.panelOpacity\) : ''/);
 assert.equal((panel.match(/tint: this.role === 'dialog'/g) ?? []).length,2, 'fusion and normal backdrop both exclude menu fill');
 const backdrop=readFileSync(new URL('../vendor/jide-foundation/src/harmony/shared/GlassBackdrop.ets',import.meta.url),'utf8');
 assert.doesNotMatch(backdrop,/attachBrush\(this.fusionTint/);
});

test('nested menus use the same shared glass renderer with a registered parent dialog source',()=>{
 const select=readFileSync(new URL('../../entry/src/main/ets/components/common/SurfaceSelect.ets',import.meta.url),'utf8');
 assert.match(select,/GlassPanel\(\{ shadowVisible: false, source: this.parentDialogGlassSource, radius: 12, role: 'menu'/);assert.doesNotMatch(select,/liveBackdrop/);
 const frame=readFileSync(new URL('../../entry/src/main/ets/components/common/DialogFrame.ets',import.meta.url),'utf8');
 assert.match(frame,/id\(this.dialogGlassSource\)/);assert.match(frame,/glassSourceVisibility\(this.getUIContext\(\), this.dialogGlassSource, this.sourceVisible && this.prepared\)/);
});

test('automatic element edits persist before switching and survive reopening without a confirmation click',async()=>{
 const h=host();let flush;
 const Dialog=loadComponentLogic('components/settings/AppearanceElementDialog.ets','AppearanceElementDialog',{
  APPEARANCE_CUSTOMIZATION_ITEMS,validAccent,AppStorage:h.AppStorage,SeriesVisual:{isDark:()=>false},
  应用颜色主题:()=>h.helpers.publishElementStyle(false),saveAppearanceElements:h.api.saveAppearanceElements,
  appInterface:{observe(){},leave(){}}
 });
 const d=new Dialog();d.autoSave=true;d.target='appearance_module_outline';d.registerFlush=f=>flush=f;d.aboutToAppear();
 d.changeColor('#AABBCC');assert.equal(d.dirty,true);
 assert.equal(await flush(),true);assert.equal(d.dirty,false);
 assert.equal(elements.elementStyleFor(h.storage.get(elements.APPEARANCE_ELEMENTS_KEY),false).moduleOutline,'#AABBCC');
 d.changeColor('#112233');assert.equal(await flush(),true);
 assert.equal(elements.elementStyleFor(h.storage.get(elements.APPEARANCE_ELEMENTS_KEY),false).moduleOutline,'#112233');
 d.aboutToDisappear();
 const reopened=new Dialog();reopened.target='appearance_module_outline';reopened.aboutToAppear();assert.equal(reopened.color,'#112233');
 reopened.aboutToDisappear();
});
test('automatic save failures block section changes and keep unsaved values available for retry',async()=>{
 const h=host();let allow=false;
 const Dialog=loadComponentLogic('components/settings/AppearanceElementDialog.ets','AppearanceElementDialog',{
  APPEARANCE_CUSTOMIZATION_ITEMS,validAccent,AppStorage:h.AppStorage,SeriesVisual:{isDark:()=>false},
  应用颜色主题:()=>h.helpers.publishElementStyle(false),saveAppearanceElements:async(...args)=>{if(!allow)throw Error('disk');await h.api.saveAppearanceElements(...args);},
  appInterface:{observe(){},leave(){}}
 });
 const d=new Dialog();d.autoSave=true;d.aboutToAppear();d.changeColor('#123456');
 assert.equal(await d.flushChanges(),false);assert.equal(d.failed,true);assert.equal(d.dirty,true);
 allow=true;assert.equal(await d.flushChanges(),true);assert.equal(d.dirty,false);d.aboutToDisappear();
});

test('custom outlines align to complete physical pixels without changing saved widths or hidden borders',()=>{
 for(const density of [1,1.5,2,2.75,3,3.5])for(const width of [0,.5,1,1.5,2,4]){
  const result=elements.alignedOutlineWidth(width,density);
  assert.ok(Math.abs(result*density-Math.round(result*density))<1e-9);
  assert.equal(result===0,width===0);
 }
 assert.equal(elements.alignedOutlineWidth(.5,3),2/3);
});

test('repair restores original border defaults once and preserves other appearance choices',async()=>{
 const h=host();
 const custom={...elements.defaultElementStyle(),width:4,outline:'#000000',moduleOutline:'#123456',text:'#ABCDEF',background:'#AABBCC',radius:20,blur:18};
 h.values.set(elements.APPEARANCE_ELEMENTS_KEY,elements.replaceElementStyle('',false,custom));
 await h.api.loadAppearanceElements();
 const restored=elements.elementStyleFor(h.storage.get(elements.APPEARANCE_ELEMENTS_KEY),false);
 assert.equal(restored.width,-1);assert.equal(restored.outline,'');assert.equal(restored.moduleOutline,'');
 for(const key of ['text','background','radius','blur'])assert.equal(restored[key],custom[key]);
 const raw=h.storage.get(elements.APPEARANCE_ELEMENTS_KEY);
 await h.api.saveAppearanceElements(false,{...restored,outline:'#FF0000'},raw);
 await h.api.loadAppearanceElements();
 assert.equal(elements.elementStyleFor(h.storage.get(elements.APPEARANCE_ELEMENTS_KEY),false).outline,'#FF0000');
});
test('changing global thickness does not introduce borders on originally borderless light modules',()=>{
 const h=materialHarness('glass');h.storage.set(elements.APPEARANCE_ELEMENTS_ACTIVE_KEY,JSON.stringify({...elements.defaultElementStyle(),width:4}));
 assert.equal(h.SurfaceBorder.contentOptions('glass',false).width,0);
 assert.equal(h.SurfaceBorder.contentOptions('flat',false).width,0);
 assert.equal(h.SurfaceBorder.options(1).width,4);
});

test('border categories save and reset their own color and geometry together',async()=>{
 assert.equal(elements.validAppearanceSection('appearance_border'),false);
 for(const target of ['appearance_module_outline','appearance_outline']){
  const h=host();const Dialog=loadComponentLogic('components/settings/AppearanceElementDialog.ets','AppearanceElementDialog',{
   ...elements,SurfaceBorder:{color:()=>({id:'app.color.surface_border'}),glassOutlineWidth:()=>0.8},APPEARANCE_CUSTOMIZATION_ITEMS,validAccent,AppStorage:h.AppStorage,SeriesVisual:{isDark:()=>false},
   应用颜色主题:()=>h.helpers.publishElementStyle(false),saveAppearanceElements:(...args)=>h.api.saveAppearanceElements(...args),appInterface:{observe(){},leave(){}}
  });
  const d=new Dialog();d.target=target;d.aboutToAppear();d.changeColor('#123456');d.changeShape(true,9);d.changeShape(false,3);await d.apply(false);
  const saved=elements.elementStyleFor(h.storage.get(elements.APPEARANCE_ELEMENTS_KEY),false),module=target==='appearance_module_outline';
  assert.equal(saved[module?'moduleOutline':'outline'],'#123456');assert.equal(saved[module?'moduleRadius':'radius'],9);assert.equal(saved[module?'moduleWidth':'width'],3);
  assert.equal(saved[module?'outline':'moduleOutline'],'');assert.equal(saved[module?'radius':'moduleRadius'],-1);assert.equal(saved[module?'width':'moduleWidth'],-1);
  d.reset();await d.apply(false);assert.deepEqual(elements.elementStyleFor(h.storage.get(elements.APPEARANCE_ELEMENTS_KEY),false),elements.defaultElementStyle());d.aboutToDisappear();
 }
});

test('fresh profiles default glass blur to 80 while saved values remain intact',()=>{
 assert.equal(elements.elementStyleFor('',false).blur,80);assert.equal(elements.elementStyleFor('',true).blur,80);
 const raw=elements.replaceElementStyle('',false,{...elements.defaultElementStyle(),blur:46});assert.equal(elements.elementStyleFor(raw,false).blur,46);
});

test('style owners parse each unchanged snapshot once and immediately invalidate previews without sharing mutation',()=>{
 const storage=new Map();let parses=0;
 const api=loadPlatformModule('utils/AppearanceElements.ets','({activeElementStyle,appearanceElementColor})',{
  AppStorage:{get:key=>storage.get(key)},parseElementStyle:raw=>{parses++;return elements.parseElementStyle(raw);}
 });
 const initialParses=parses;
 const raw=JSON.stringify({...elements.defaultElementStyle(),outline:'#123456',text:'#234567'});
 storage.set(elements.APPEARANCE_ELEMENTS_ACTIVE_KEY,raw);
 for(let i=0;i<100;i++){assert.equal(api.activeElementStyle().outline,'#123456');assert.equal(api.appearanceElementColor(raw,'text_primary','fallback'),'#234567');}
 assert.equal(parses,initialParses+1,'one actual profile parse for all 200 style reads');
 api.activeElementStyle().outline='#FFFFFF';assert.equal(api.activeElementStyle().outline,'#123456');
 const next=JSON.stringify({...elements.defaultElementStyle(),outline:'#ABCDEF'});
 storage.set(elements.APPEARANCE_ELEMENTS_ACTIVE_KEY,next);assert.equal(api.activeElementStyle().outline,'#ABCDEF');assert.equal(parses,initialParses+2);
 storage.set(elements.APPEARANCE_ELEMENTS_ACTIVE_KEY,'bad');assert.throws(()=>api.activeElementStyle());
 storage.set(elements.APPEARANCE_ELEMENTS_ACTIVE_KEY,next);assert.equal(api.activeElementStyle().outline,'#ABCDEF');
});
