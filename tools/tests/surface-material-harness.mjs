import { moduleOpacityPercent } from '../../entry/src/main/ets/model/SurfaceMaterial.ts';
import { tintGlassFill } from '../../entry/src/main/ets/model/GlassTheme.ts';
import { readFileSync } from 'node:fs';
import { loadPlatformSource, loadPlatformModule } from './platform-module-harness.mjs';
const foundation=name=>readFileSync(new URL('../vendor/jide-foundation/src/core/'+name+'.ts',import.meta.url),'utf8');
const theme=loadPlatformSource(foundation('Theme'),'({themePalette})',{});
const visual=loadPlatformSource(foundation('VisualStyle'),'({VisualTokens,visualPalette,surfaceAppearance})',theme);
export function materialHarness(material='flat',dark=false) {
 const storage=new Map([['surface_material',material],['themeMode',dark?'dark':'light']]);
 const AppStorage={get:key=>storage.get(key),setOrCreate:(key,value)=>storage.set(key,value)};
 const ColorMetrics={resourceColor(fill) {
  const hex=fill.length===9 ? fill.slice(1) : 'FF'+fill.slice(1);
  const [alpha,red,green,blue]=hex.match(/../g).map(channel=>parseInt(channel,16));
  return {alpha,red,green,blue};
 }};
 const sharedGlassShadow=loadPlatformSource(readFileSync(new URL('../vendor/jide-foundation/src/harmony/shared/MenuTypes.ets',import.meta.url),'utf8'),'sharedGlassShadow',{});
 const optical={GLASS_BACKGROUND_SOURCE:'root-background',sourceCaptureAllowed:()=>true,
  SharedMaterialBackgroundOptions:class{},sharedGlassBlurRadius:()=>5.5,sharedGlassShadow};
 const deps={...optical,ColorMetrics,moduleOpacityPercent,tintGlassFill,...visual,AppStorage,Color:{Transparent:'transparent'},BlurStyle:{NONE:'none'}};
 const SharedSurface=loadPlatformSource(readFileSync(new URL('../vendor/jide-foundation/src/harmony/shared/Surface.ets',import.meta.url),'utf8').split('/** 背景层保留')[0],'SharedSurface',deps);
 const SurfaceBorder=loadPlatformModule('utils/SurfaceBorder.ets','SurfaceBorder',{AppStorage,Color:{Transparent:'transparent'},应用尺寸:{卡片边框:1},$r:()=>dark?'#77869A':'#CFD7E3'});
 const surfaces=loadPlatformModule('utils/SeriesVisual.ets','({SeriesVisual,SeriesDeckSurface})',{...deps,SharedSurface,SurfaceBorder});
 const api=loadPlatformModule('utils/GlassMaterial.ets','({usesGlassMaterial,darkMaterial})',deps);
 return {...deps,...api,SharedSurface,...surfaces,SurfaceBorder,storage};
}

/** AttributeModifier 的 background 方法在目标系统未实现，测试复现这一平台边界。 */
export function materialNode(state) {
 const node=new Proxy({}, {get:(_,name)=>(...args)=>{
  if(name==='background') throw new Error('background is not implemented on AttributeModifier');
  state[name]=args[0];
  return node;
 }});
 return node;
}
