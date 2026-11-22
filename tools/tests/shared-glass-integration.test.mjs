import { readFileSync } from 'node:fs';
import { loadPlatformSource } from './platform-module-harness.mjs';
// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import {loadSharedMenu, sharedSource} from './shared-menu-harness.mjs';
import assert from 'node:assert/strict';
import { surfaceMotionApi } from './motion-harness.mjs';
import { loadComponentLogic } from './platform-module-harness.mjs';
import { glassCaptureScale, sameGlassCaptureGeometry } from '../vendor/jide-foundation/src/core/GlassCapture.ts';
import { glassContour, glassMesh, glassDistance, glassSample } from '../vendor/jide-foundation/src/core/GlassOptics.ts';
import { actionMenuBubbleOutline, ActionMenuPointerSide } from '../../entry/src/main/ets/components/common/ActionMenuLayout.ts';
function panel({api=23, source='body'}={}) {
  const timers=new Map(); let next=0, entries=0, prepared=0;
  const Panel=loadSharedMenu('PopupPanel.ets','SharedGlassPanel',{
  takePopupTrigger:()=>undefined,
    TransitionEffect:{
      IDENTITY: 'identity',
      opacity: (opacity) => ({combine: (scale) => ({animation: (options) => ({opacity, scale, options})})}),
      scale: (scale) => scale,
      asymmetric: (enter, exit) => ({enter, exit})
    },
    hilog:{info(){},warn(){}}, Curve:{EaseOut:'ease-out'},
    supportsGlassBackdrop:()=>api>=23, currentGlassSource:()=>source, retainGlassPanel:()=>{}, releaseGlassPanel:()=>{},
    currentMotionProfile:()=>({menuScale:.94,dialogScale:.98}),
    materialPopupAnimation:()=>({duration:150}), SurfaceTransition:surfaceMotionApi().SurfaceTransition,
    setTimeout:fn=>{timers.set(++next,fn);return next;},clearTimeout:id=>timers.delete(id)
  });
  const p=new Panel();p.getUniqueId=()=>1;Object.assign(p.theme,{material:'glass',foreground:true,supported:api>=23});p.source=source;
  p.getUIContext=()=>({animateTo:(_options,update)=>{entries++;update();}});
  p.onPrepared=()=>prepared++;
  return {p,timers,entries:()=>entries,prepared:()=>prepared};
}
test('texture readiness opens foreground and glass once; timeout is cancelled',()=>{
  const h=panel();h.p.aboutToAppear();assert.equal(h.p.panelOpacity,.01);
  h.p.finish();h.p.finish();assert.equal(h.entries(),1);assert.equal(h.prepared(),1);
  assert.equal(h.timers.size,0);assert.equal(h.p.panelOpacity,1);
});
test('slow glass stays loading without switching material and accepts eventual readiness',()=>{
 const h=panel();h.p.aboutToAppear();assert.equal(h.timers.size,0);assert.equal(h.entries(),0);assert.equal(h.p.panelOpacity,.01);
 h.p.finish();h.p.finish();assert.equal(h.entries(),1);assert.equal(h.prepared(),1);
});
test('anchored menus expose their actions before the texture draw callback while fused menus retain their entrance', () => {
 const plain = panel();
 plain.p.role = 'menu';
 plain.p.aboutToAppear();
 assert.equal(plain.prepared(), 0);
 assert.equal(plain.p.showContentImmediately(), true);
 assert.equal(plain.p.glassTransition().enter.opacity, 0);
 plain.p.theme.reducedMotion = true;
 assert.equal(plain.p.glassTransition().enter, 'identity');
 const fused = panel();
 fused.p.role = 'menu';
 fused.p.trigger = { x: 0, y: 0, width: 44, height: 44, radius: 22 };
 fused.p.theme.reducedMotion = false;
 fused.p.aboutToAppear();
 assert.equal(fused.p.showContentImmediately(), false);
 assert.equal(fused.p.glassTransition().enter, 'identity');
 fused.p.contourPath = 'M 0 0 Z';
 assert.equal(fused.p.glassTransition().enter.opacity, 0);
 plain.p.finish();
 assert.equal(plain.prepared(), 1);
 assert.equal(plain.p.showContentImmediately(), true);
});
test('departure cancels pending preparation and rejects late readiness',()=>{
  const h=panel();h.p.aboutToAppear();h.p.aboutToDisappear();h.p.finish();
  assert.equal(h.timers.size,0);assert.equal(h.entries(),0);assert.equal(h.prepared(),0);
});
test('API21/22, missing source and layout-only groups retain their immediate existing material',()=>{
  for(const settings of [{api:22},{source:''}]) {
    const h=panel(settings);h.p.aboutToAppear();assert.equal(h.p.panelOpacity,1);assert.equal(h.timers.size,0);
  }
  const h=panel();h.p.surfaceVisible=false;h.p.aboutToAppear();assert.equal(h.timers.size,0);
});
test('all four arrow contours drive the same optical field as their exact shared clip path',()=>{
  for(const side of Object.values(ActionMenuPointerSide).filter(x=>typeof x==='number')) {
    const path=actionMenuBubbleOutline(160,240,60,1,.8,16,6,20,side);
    const contour=glassContour(path);assert.ok(contour.length>90);
    const vertical=side===ActionMenuPointerSide.Top||side===ActionMenuPointerSide.Bottom;
    const width=160+(vertical?0:6),height=240+(vertical?6:0);
    for(const p of contour) {
      assert.ok(Math.abs(glassDistance(p.x,p.y,width,height,16,contour))<1e-7);
      assert.deepEqual(glassSample(p.x,p.y,width,height,16,36,10,contour),p);
    }
    const mesh=glassMesh(width,height,16,1,contour);
    assert.ok(mesh.texture.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)));
    for (let i=0; i<mesh.indices.length; i+=3) {
      const [a,b,c]=mesh.indices.slice(i,i+3).map(index=>mesh.texture[index]);
      assert.ok((b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x)>0, 'arrow mesh sampling must not fold');
    }
  }
});

test('native glass node rebuilds its mesh only for optical geometry, never repeated layout or translation', async()=>{
  const {readFileSync}=await import('node:fs');
  const {loadPlatformSource}=await import('./platform-module-harness.mjs');
  const source=readFileSync(new URL('../vendor/jide-foundation/src/harmony/shared/GlassBackdrop.ets',import.meta.url),'utf8');
  const code=source.slice(source.indexOf('class GlassRenderNode extends'),source.indexOf('class GlassController extends'));
  let builds=0;
  const Node=loadPlatformSource(code,'GlassRenderNode',{
    RenderNode:class {invalidate(){}},LengthMetricsUnit:{PX:0},
    glassContour,glassMesh:(...args)=>{builds++;return glassMesh(...args);}
  });
  const node=new Node(),path=actionMenuBubbleOutline(136,180,60,1,.8,16,6,20,ActionMenuPointerSide.Right);
  for(let n=0;n<20;n++)node.configure(142,180,100+n,200+n,0,1,path);
  assert.equal(builds,1);
  node.configure(142,181,100,200,0,1,path);assert.equal(builds,2);
  node.configure(142,181,100,200,0,1,'');assert.equal(builds,3);
});

test('wide inline editor freezes only its own source while nested panels are mounted and resumes after the last closes', async()=>{
  const {readFileSync}=await import('node:fs');
  const {loadPlatformSource}=await import('./platform-module-harness.mjs');
  const source=readFileSync(new URL('../../entry/src/main/ets/utils/GlassBackdrop.ets',import.meta.url),'utf8');
  const code=source.slice(source.indexOf('const frozenSources:'));
  const api=loadPlatformSource(code,'({setGlassSourceFreeze,retainGlassPanel,releaseGlassPanel,sourceCaptureAllowed})',{captureAllowed:()=>true});
  api.setGlassSourceFreeze('browser',true);api.retainGlassPanel('browser');api.retainGlassPanel('browser');
  assert.equal(api.sourceCaptureAllowed('browser'),false);assert.equal(api.sourceCaptureAllowed('home'),true);
  api.releaseGlassPanel('browser');assert.equal(api.sourceCaptureAllowed('browser'),false);
  api.releaseGlassPanel('browser');assert.equal(api.sourceCaptureAllowed('browser'),true);
  api.setGlassSourceFreeze('browser',false);api.retainGlassPanel('browser');assert.equal(api.sourceCaptureAllowed('browser'),true);
});


test('home source freezes while the embedded deck preview menu retains its panel', async()=>{
 const {readFileSync}=await import('node:fs');
 const {loadPlatformSource}=await import('./platform-module-harness.mjs');
 const read=path=>readFileSync(new URL('../../entry/src/main/ets/'+path,import.meta.url),'utf8');
 assert.match(read('pages/首页.ets'),/GlassSource\(\{ sourceId: GLASS_HOME_SOURCE, freezeDuringPanels: true, previewWarm: this\.glassSuggestionPending \}\)/);
 const code=read('utils/GlassBackdrop.ets');
 const api=loadPlatformSource(code.slice(code.indexOf('const frozenSources:')),
  '({setGlassSourceFreeze,retainGlassPanel,releaseGlassPanel,sourceCaptureAllowed})',{captureAllowed:()=>true});
 api.setGlassSourceFreeze('home',true);
 assert.equal(api.sourceCaptureAllowed('home'),true);
 api.retainGlassPanel('home');
 for(let frame=0;frame<100;frame++) assert.equal(api.sourceCaptureAllowed('home'),false);
 assert.equal(api.sourceCaptureAllowed('other-window'),true);
 api.releaseGlassPanel('home');assert.equal(api.sourceCaptureAllowed('home'),true);
});

for (const surface of ['home', 'deck-details']) test(`a frozen ${surface} with no cached glass frame captures once before keeping the backdrop frozen`, async () => {
  const {readFileSync} = await import('node:fs');
  const {loadPlatformSource} = await import('./platform-module-harness.mjs');
  const source = readFileSync(new URL('../../entry/src/main/ets/utils/GlassBackdrop.ets', import.meta.url), 'utf8');
  const home = surface === 'home' ? 'jide-glass-home-source' : 'jide-glass-deck-details-source';
  if (surface === 'deck-details') {
    const details = readFileSync(new URL('../../entry/src/main/ets/components/home/HomeDeckDetails.ets', import.meta.url), 'utf8');
    assert.match(details, /GlassSource\(\{ sourceId: GLASS_DECK_DETAILS_SOURCE, freezeDuringPanels: true, pageBackdrop: false \}\)/);
  }
  const policy = loadPlatformSource(source.slice(source.indexOf('const frozenSources:')),
    '({setGlassSourceFreeze, retainGlassPanel, sourceCaptureAllowed, setGlassSourceScrolling})',
    {captureAllowed: () => true, GLASS_HOME_SOURCE: 'jide-glass-home-source', GLASS_DECK_DETAILS_SOURCE: 'jide-glass-deck-details-source'});
  policy.setGlassSourceFreeze(home, true);
  policy.retainGlassPanel(home);
  policy.setGlassSourceFreeze('inline-editor', true);
  policy.retainGlassPanel('inline-editor');
  assert.equal(policy.sourceCaptureAllowed('inline-editor', true), false);
  policy.setGlassSourceScrolling(home, true);
  assert.equal(policy.sourceCaptureAllowed(home, true), false);
  policy.setGlassSourceScrolling(home, false);

  const shared = sharedSource('harmony/shared/GlassBackdrop.ets');
  const Session = loadPlatformSource(
    shared.slice(shared.indexOf('class BackdropSession'), shared.indexOf('const sessions:')),
    'BackdropSession', {
      sameGlassCaptureGeometry, glassCaptureScale, productGlassBlur: 1,
      deviceInfo: {apiAvailable: () => true},
      effectKit: {TileMode: {CLAMP: 0}, createEffect: () => ({
        blur: () => ({getEffectPixelMap: async () => ({release() {}})})
      })},
      hilog: {info() {}, warn() {}}
    });
  const node = {getMeasuredSize: () => ({width: 400, height: 800}), getPositionToWindow: () => ({x: 0, y: 0})};
  const session = new Session({getWindowId: () => 1, getFrameNodeById: () => node, vp2px: value => value}, home);
  const updates = [];
  let snapshots = 0, fail = true;
  session.listeners.add({freezeBackdrop: false, updateFrame: frame => updates.push(frame)});
  session.canCapture = initial => policy.sourceCaptureAllowed(home, initial);
  session.capturePixels = async () => {
    snapshots++;
    if (fail) throw new Error('snapshot unavailable');
    return {getImageInfoSync: () => ({size: {width: 400, height: 800}}), release() {}};
  };
  await session.capture();
  assert.equal(updates.length, 0);
  fail = false;
  await session.capture();
  assert.equal(updates.length, 1, 'the missing first frame must reach the waiting glass panel');
  await session.capture();
  assert.equal(snapshots, 2, 'a completed frame must restore the normal panel freeze');
  assert.equal(session.busy, false);
});

test('all app custom dialog and popup hosts retain shared glass ownership', async()=>{
  const {readdirSync,readFileSync}=await import('node:fs');
  const {join}=await import('node:path');
  const root=new URL('../../entry/src/main/ets/',import.meta.url);
  function files(path){return readdirSync(path,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?files(join(path,entry.name)):entry.name.endsWith('.ets')?[join(path,entry.name)]:[]);}
  for(const path of files(root.pathname)) {
    const source=readFileSync(path,'utf8');
    if(/@CustomDialog\s*\n/.test(source)) {
      if(path.endsWith('AppearanceCustomizationHubDialog.ets')) assert.match(source,/AppearanceCustomizationDialog\(/);
      else assert.match(source,/DialogFrame\(/,path);
    }
    if(/\.bindPopup\(/.test(source)) assert.match(source,/GlassPanel\(|GlassBubblePanel\(/,path);
    assert.doesNotMatch(source,/\.transition\(SurfaceTransition\.dialog\(\)\)/,
      `standalone dialog animation bypasses GlassPanel preparation: ${path}`);
  }
});

test('opaque reading dialog opens immediately without waiting for a glass texture',()=>{
  const h=panel();h.p.opaque=true;h.p.aboutToAppear();
  assert.equal(h.p.usesGlass(),false);assert.equal(h.p.panelOpacity,1);
  assert.equal(h.timers.size,0);assert.equal(h.prepared(),1);
  h.p.aboutToDisappear();h.p.finish();assert.equal(h.entries(),0);
});


test('glass sampling remains enabled in explicit and system dark modes',()=>{
 for(const [mode,systemDark] of [['light',false],['dark',false],['system',true]]) {
  const h=panel();h.p.theme.dark=mode==='dark'||mode==='system'&&systemDark;h.p.aboutToAppear();
  assert.equal(h.p.usesGlass(),true);assert.equal(h.p.panelOpacity,.01);assert.equal(h.timers.size,0);
  h.p.finish();assert.equal(h.p.panelOpacity,1);assert.equal(h.prepared(),1);
 }
});

test('native glass preview in flat mode permits capture only while its own preview owner is retained',async()=>{
 const {readFileSync}=await import('node:fs');
 const {loadPlatformSource}=await import('./platform-module-harness.mjs');
 const source=readFileSync(new URL('../../entry/src/main/ets/utils/GlassBackdrop.ets',import.meta.url),'utf8');
 const api=loadPlatformSource(source.slice(source.indexOf('const frozenSources:')),
  '({setGlassSourceFreeze,retainGlassPanel,releaseGlassPanel,sourceCaptureAllowed})',{captureAllowed:preview=>preview});
 api.setGlassSourceFreeze('home',true);
 assert.equal(api.sourceCaptureAllowed('home'),false);
 api.retainGlassPanel('home',true);
 assert.equal(api.sourceCaptureAllowed('home'),true);
 assert.equal(api.sourceCaptureAllowed('other'),false);
 api.releaseGlassPanel('home',true);
 assert.equal(api.sourceCaptureAllowed('home'),false);
});
test('explicit glass preview prepares glass without changing the saved flat material',()=>{
 const h=panel();h.p.theme.material='flat';h.p.materialOverride='glass';h.p.source='home';h.p.aboutToAppear();
 assert.equal(h.p.usesGlass(),true);h.p.finish();assert.equal(h.p.theme.material,'flat');h.p.aboutToDisappear();
});

test('visible sources remain addressable in flat mode for a later live glass switch',()=>{
 const calls=[];
 const Source=loadComponentLogic('components/common/GlassSource.ets','GlassSource',{
  glassSourceVisibility:(...args)=>calls.push(args),setGlassSourceFreeze(){}
 });
 const source=new Source();source.getUIContext=()=> 'ui';source.sourceId='home';
 source.material='flat';source.foreground=true;source.visible=true;source.sourceEnabled=true;
 source.previewWarm=true;source.sync();assert.deepEqual(calls.at(-1),['ui','home',true,true,true]);
 source.previewWarm=false;source.sync();assert.deepEqual(calls.at(-1),['ui','home',true,false,true]);
 source.previewWarm=true;source.aboutToDisappear();assert.deepEqual(calls.at(-1),['ui','home',false,true,true]);
});

test('recommendation waits for real texture without a failure deadline',()=>{
 const h=panel();h.p.aboutToAppear();assert.equal(h.entries(),0);assert.equal(h.timers.size,0);
 h.p.finish();h.p.finish();assert.equal(h.entries(),1);assert.equal(h.prepared(),1);
});


test('branch menus retain primary width and right edge through expansion on narrow and wide viewports', () => {
  const Menu = loadComponentLogic('components/common/CardActionMenu.ets', 'CardActionMenu', { Scroller: class {},
    actionMenuRows: (items) => items.map(node => ({ key: '/' + node.id, node, enabled: node.enabled !== false })),
    MenuSlideScope: class {}, 应用尺寸: { compactMenuWidth: 220, cardActionGroupWidth: 180 }
  });
  for (const width of [320, 390, 840]) {
    const menu = new Menu();
    menu.contentWidth = width;
    menu.items = [{ id: 'settings', children: [{ id: 'columns' }] }];
    const originalRow = menu.rows()[0];
    menu.items = [{ id: 'settings', enabled: false, selected: true, children: [{ id: 'columns' }] }];
    assert.equal(menu.rowEnabled(originalRow), false);
    assert.equal(menu.rowItem(originalRow).selected, true);
    const initial = menu.primaryWidth();
    const footprint = menu.totalWidth();
    menu.expandedIds = ['settings'];
    assert.equal(menu.primaryWidth(), initial);
    assert.equal(menu.totalWidth(), footprint);
    assert.ok(menu.totalWidth() <= menu.availableWidth());
    menu.expandedIds = [];
    assert.equal(menu.primaryWidth(), initial);
    assert.equal(menu.totalWidth(), footprint);
  }
});


test('all composite menu layers share the page source without recursively sampling parent menus', async () => {
 const { readFileSync } = await import('node:fs');
 const Menu=loadComponentLogic('components/common/CardActionMenu.ets','CardActionMenu',{ takePopupTrigger:()=>undefined, Scroller: class {},
   应用尺寸:{compactMenuWidth:168}, currentPopupGlassSource:()=> 'page'
 });
 const menu=new Menu(); menu.getUIContext=()=>({});menu.aboutToAppear();
 assert.equal(menu.menuSource,'page');
 const code=readFileSync(new URL('../../entry/src/main/ets/components/common/CardActionMenu.ets',import.meta.url),'utf8');
 assert.doesNotMatch(code,/warmGlassSource|layerSource/);
 for (const component of ['MenuBubble','GlassBubblePanel','GlassPanel'])
  assert.ok(code.includes(component+'({ source: this.menuSource'));
 assert.match(code,/refractionSource: this.menuSource,/);
});

test('toolbar menu keeps its main panel aligned with a split-pane button as branches expand', () => {
 const Menu=loadComponentLogic('components/common/CardActionMenu.ets','CardActionMenu',{
  Scroller:class{},应用尺寸:{compactMenuWidth:168,cardActionGroupWidth:140,间距_8:8}
 });
 const menu=new Menu();
 Object.assign(menu,{viewportWidth:1200,contentWidth:840,viewportLeft:20,viewportTop:10,
  toolbarRight:320,toolbarBottom:80,safeLeft:20,safeRight:0,menuWidth:168,
  items:[{id:'group',children:[{id:'item'}]}]});
 for(const expandedIds of [[],['group']]) {
  menu.expandedIds=expandedIds;
  assert.equal(menu.toolbarLeft()+menu.totalWidth(),300);
  assert.equal(menu.menuTop(),78);
 }
});


test('scrolling suppresses warm and live capture only for its source and preserves panel freeze after scrolling stops', async () => {
 const {readFileSync}=await import('node:fs');
 const {loadPlatformSource}=await import('./platform-module-harness.mjs');
 const source=readFileSync(new URL('../../entry/src/main/ets/utils/GlassBackdrop.ets',import.meta.url),'utf8');
 const api=loadPlatformSource(source.slice(source.indexOf('const frozenSources:')),
   '({setGlassSourceScrolling,setGlassSourceFreeze,retainGlassPanel,releaseGlassPanel,sourceCaptureAllowed})', {captureAllowed:()=>true});
 assert.equal(api.sourceCaptureAllowed('home'),true);
 api.setGlassSourceScrolling('home',true);
 for(let frame=0;frame<60;frame++)assert.equal(api.sourceCaptureAllowed('home'),false);
 assert.equal(api.sourceCaptureAllowed('other'),true);
 api.setGlassSourceFreeze('home',true);api.retainGlassPanel('home');
 api.setGlassSourceScrolling('home',false);
 assert.equal(api.sourceCaptureAllowed('home'),false);
 api.releaseGlassPanel('home');assert.equal(api.sourceCaptureAllowed('home'),true);
 api.setGlassSourceScrolling('home',true);api.setGlassSourceScrolling('home',false);
 assert.equal(api.sourceCaptureAllowed('home'),true);
});


test('expanding child panels never replays an already prepared parent entrance', () => {
 const h=panel();h.p.aboutToAppear();h.p.finish();
 const source=h.p.sourceId;
 for(let branch=0;branch<6;branch++) {h.p.panelWidth=branch%2===0?168:316;h.p.finish();}
 assert.equal(h.p.sourceId,source);assert.equal(h.entries(),1);assert.equal(h.p.panelOpacity,1);assert.equal(h.prepared(),1);
});

test('fusion paints the unwarped original button after its complete glass mesh',async()=>{
 const {readFileSync}=await import('node:fs');
 const {loadPlatformSource}=await import('./platform-module-harness.mjs');
 const source=readFileSync(new URL('../vendor/jide-foundation/src/harmony/shared/GlassBackdrop.ets',import.meta.url),'utf8');
 const code=source.slice(source.indexOf('class GlassRenderNode extends'),source.indexOf('class GlassController extends'));
 const calls=[];
 class Brush { setAntiAlias(){} setAlpha(){} setColor(){} setShaderEffect(){} }
 class Pen { setAntiAlias(){} setStrokeWidth(width){this.width=width;} setColor(color){this.color=color;} }
 class Path { constructor(){this.segments=[];} moveTo(x,y){this.segments.push(['move',x,y]);} lineTo(x,y){this.segments.push(['line',x,y]);} }
 const Node=loadPlatformSource(code,'GlassRenderNode',{
  RenderNode:class{invalidate(){}},LengthMetricsUnit:{PX:0},deviceInfo:{apiAvailable:()=>true},
  hilog:{info(){},warn(){}},setTimeout:()=>0,
  drawing:{Brush,Pen,Path,ShaderEffect:{createImageShader:()=>({})},TileMode:{CLAMP:0},SamplingOptions:class{},
   FilterMode:{FILTER_MODE_LINEAR:0},VertexMode:{TRIANGLES_VERTEXMODE:0},BlendMode:{SRC:0,SRC_OVER:1},
   ClipOp:{INTERSECT:0,DIFFERENCE:1},RoundRect:class{constructor(rect){this.rect=rect;}}}
 });
 const node=new Node(),pixels={id:'sharp'},frosted={id:'blurred'};
 const mesh={positions:[{x:0,y:0},{x:100,y:0},{x:0,y:200}],texture:[{x:0,y:0},{x:100,y:0},{x:0,y:200}],indices:[0,1,2],edge:[{x:0,y:0}]};
 node.configureFusion(100,200,50,60,mesh,false,1,{x:20,y:30,width:44,height:44,radius:16});
 node.updateFrame({pixels,frosted,left:0,top:0,width:1000,height:1000,scaleX:.5,scaleY:.5});
 const canvas={attachBrush(){},detachBrush(){},drawVertices(){calls.push('mesh');},save(){},restore(){},
  clipRoundRect(rect,op){if(op===1)assert.deepEqual(rect.rect,{left:20,top:30,right:64,bottom:74});},drawImageRectWithSrc(image,src,dst){calls.push({image,src,dst});}};
 node.draw({canvas});assert.deepEqual(calls.slice(0,1),['mesh']);
 assert.deepEqual(calls[1],{image:pixels,src:{left:36,top:46,right:56,bottom:66},dst:{left:22,top:32,right:62,bottom:72}});
 calls.length=0;node.configureFusion(100,200,50,60,mesh,false,1);node.draw({canvas});
 assert.deepEqual(calls,['mesh'],'settled popup has no persistent button cutout or overlay');
 const edges=[{x:0,y:0},{x:10,y:0},{x:30,y:40},{x:30,y:50}];
 mesh.edge=edges;let pen;
 canvas.attachPen=value=>{pen=value;};canvas.detachPen=()=>{};
 canvas.drawPath=path=>calls.push({outline:path.segments,width:pen.width,color:pen.color});
 calls.length=0;node.configureFusion(100,200,50,60,mesh,true,2,undefined,1.6,'#22FFFFFF');node.draw({canvas});
 assert.deepEqual(calls[1],{outline:[['move',0,0],['line',10,0],['move',30,40],['line',30,50]],width:1.6,color:0x22FFFFFF});
 calls.length=0;node.configureFusion(100,200,50,60,mesh,false,2,undefined,0,'#22FFFFFF');node.draw({canvas});
 assert.deepEqual(calls,['mesh'],'switching out of dark mode clears the outline and retains full glass');
 mesh.clipRect={x:0,y:0,width:100,height:200,radius:16};
 canvas.drawRoundRect=rect=>calls.push({roundRect:rect.rect});
 calls.length=0;node.configureFusion(100,200,50,60,mesh,true,2,undefined,1.6,'#22FFFFFF');node.draw({canvas});
 assert.deepEqual(calls[1],{roundRect:{left:.8,top:.8,right:99.2,bottom:199.2}},'settled border is one whole inset rounded rectangle');


});

test('changing glass blur refilters frozen cached pixels without sampling the open panel and rejects stale work',async()=>{
 const source=sharedSource('harmony/shared/GlassBackdrop.ets');
 const effects=[],updates=[],released=[];let deferred;
 const output=()=>({release(){released.push('output');}});
 const api=loadPlatformSource(source.slice(source.indexOf('let productGlassBlur:'),source.indexOf('const sessions:')),
  '({BackdropSession,configureSharedGlassBlur})',{
   sameGlassCaptureGeometry, glassCaptureScale, deviceInfo:{apiAvailable:()=>true},refreshCachedGlassBlur:()=>{},hilog:{info(){},warn(){}},setTimeout:fn=>{fn();return 0;},
   effectKit:{TileMode:{CLAMP:0},createEffect:()=>({
    blur:radius=>{effects.push(radius);return {getEffectPixelMap:()=>deferred??Promise.resolve(output())};},
    getEffectPixelMap:()=>Promise.resolve(output())
   })}
  });
 const session=new api.BackdropSession({getWindowId:()=>1,vp2px:v=>v,getFrameNodeById:()=>({getMeasuredSize:()=>({width:100,height:100}),getPositionToWindow:()=>({x:0,y:0})})},'page');
 session.canCapture=()=>false;
 session.frame={pixels:{},frosted:{release(){released.push('previous');}},scaleX:1,left:0,top:0,width:100,height:100};session.frameBlur=1;
 session.listeners.add({freezeBackdrop:false,updateFrame:frame=>updates.push(frame.frosted)});
 api.configureSharedGlassBlur(0);await session.capture();
 assert.equal(session.frameBlur,0);assert.equal(updates.length,1);assert.deepEqual(effects,[]);
 assert.deepEqual(released,['previous']);
 deferred=new Promise(resolve=>{session.resolveBlur=resolve;});
 api.configureSharedGlassBlur(2);const pending=session.capture();
 api.configureSharedGlassBlur(.5);session.resolveBlur(output());await pending;
 assert.equal(session.frameBlur,0);assert.equal(updates.length,1);
 deferred=undefined;await session.capture();
 assert.equal(session.frameBlur,.5);assert.equal(updates.length,2);assert.deepEqual(effects,[11,2.75]);
 for(const value of [-1,NaN,3])assert.throws(()=>api.configureSharedGlassBlur(value));
});

test('popup source follows mounted native dialogs even without Builder provider inheritance',()=>{
 const source=readFileSync(new URL('../../entry/src/main/ets/utils/GlassBackdrop.ets',import.meta.url),'utf8');
 const api=loadPlatformSource(source.slice(source.indexOf('const mountedDialogSources:')),'({dialogGlassSourceMounted,currentPopupGlassSource,glassBackgroundSource})',{currentGlassSource:()=> 'page',GLASS_BACKGROUND_SOURCE:'root'});
 assert.equal(api.currentPopupGlassSource({}),'page');
 api.dialogGlassSourceMounted('dialog-a',true,'unmasked-page');assert.equal(api.currentPopupGlassSource({}),'dialog-a');
 assert.equal(api.glassBackgroundSource('dialog-a'),'unmasked-page');
 api.dialogGlassSourceMounted('dialog-b',true,'dialog-a');assert.equal(api.currentPopupGlassSource({}),'dialog-b');
 api.dialogGlassSourceMounted('dialog-a',false);assert.equal(api.currentPopupGlassSource({}),'dialog-b');
 assert.equal(api.glassBackgroundSource('dialog-b'),'dialog-a');
 api.dialogGlassSourceMounted('dialog-b',false);assert.equal(api.currentPopupGlassSource({}),'page');
});

test('glass readiness refreshes its panel fill before unrelated color changes',()=>{
 assert.match(sharedSource('harmony/shared/PopupPanel.ets'),/@State private prepared: boolean = false/);
});

test('material layout updates cached drawing geometry directly and keeps it across tint changes', () => {
  const source = sharedSource('harmony/shared/GlassBackdrop.ets');
  const start = source.indexOf('export struct SharedGlassBackdrop');
  const code = source.slice(start, source.indexOf('  build() {', start)) + '}';
  const configs = [];
  const Backdrop = loadPlatformSource(code
    .replace('export struct', 'class')
    .replace(/@(Prop|Watch)(?:\([^)]*\))?\s*/g, ''), 'SharedGlassBackdrop', {
    GlassController: class { glass = { configure: (...args) => configs.push(args) }; }
  });
  const view = new Backdrop();
  view.role = 'material';
  view.getUIContext = () => ({ vp2px: value => value * 2 });
  view.measureBackground({ width: 300, height: 120, globalPosition: { x: 12, y: 40 } });
  assert.deepEqual(configs.at(-1).slice(0, 4), [600, 240, 24, 80]);
  view.tint = '#52FFFFFF';
  view.updateGeometry();
  assert.deepEqual(configs.at(-1).slice(0, 4), [600, 240, 24, 80]);
  assert.equal(view.controller.glass.tint, '#52FFFFFF');
});

test('editor wheel glass uses a valid semicircle contour on both screen edges', () => {
  const source = readFileSync(new URL('../../entry/src/main/ets/components/editor/NoteEditorWheel.ets', import.meta.url), 'utf8');
  const start = source.indexOf('  private glassContourPath()');
  const method = source.slice(start, source.indexOf('\n  }', start) + 4);
  const arcStart = source.indexOf('  private contourArc()');
  const arcMethod = source.slice(arcStart, source.indexOf('\n  }', arcStart) + 4);
  const Wheel = loadPlatformSource('class Wheel { ' + method + arcMethod + ' }', 'Wheel', {});
  for (const side of ['left', 'right']) {
    const wheel = Object.assign(new Wheel(), { side, radius: () => 158, getUIContext: () => ({ vp2px: value => value * 3 }) });
    const path = wheel.glassContourPath();
    const nativeArc = wheel.contourArc().match(/-?\d+(?:\.\d+)?/g).map(Number);
    assert.equal(nativeArc[2], 473.5, 'the native outline uses the same physical pixel radius');

    const contour = glassContour(path);
    assert.ok(contour.length > 20);
    assert.ok(contour.every(point => Number.isFinite(point.x) && Number.isFinite(point.y)));
    assert.ok(Math.abs(Math.min(...contour.map(point => point.x))) < 0.01);
    assert.ok(Math.abs(Math.max(...contour.map(point => point.x)) - 474) < 0.01);
    const mesh = glassMesh(474, 948, 0, 3, contour);
    assert.ok(mesh.indices.length > 0);
    assert.ok(mesh.texture.every(point => Number.isFinite(point.x) && Number.isFinite(point.y)));
  }
});


test('a dialog opened while the previous dialog is still visible samples the page, while its menus sample the dialog', () => {
  const source = readFileSync(new URL('../../entry/src/main/ets/utils/GlassBackdrop.ets', import.meta.url), 'utf8');
  const code = source.slice(source.indexOf('const visibleSources:'));
  const warmed = [];
  const api = loadPlatformSource(code,
    '({currentGlassSource,glassSourceVisibility,dialogGlassSourceMounted,currentPopupGlassSource})', {
      deviceInfo: {apiAvailable: () => true}, warmGlassSource: (_ui, id, active) => warmed.push([id, active]),
      captureAllowed: () => true, GLASS_BACKGROUND_SOURCE: 'root'
    });
  const ui = {getWindowId: () => 7};
  const form = 'jide-glass-dialog-source-5';
  const hint = 'jide-glass-dialog-source-6';
  api.glassSourceVisibility(ui, 'home', true);
  api.dialogGlassSourceMounted(form, true);
  api.glassSourceVisibility(ui, form, true);
  assert.equal(api.currentGlassSource(ui), 'home');
  assert.equal(api.currentPopupGlassSource(ui), form);
  api.dialogGlassSourceMounted(hint, true);
  api.glassSourceVisibility(ui, hint, true);
  api.dialogGlassSourceMounted(form, false);
  api.glassSourceVisibility(ui, form, false);
  assert.equal(api.currentGlassSource(ui), 'home');
  assert.equal(api.currentPopupGlassSource(ui), hint);
  assert.deepEqual(warmed, [['home', true], [form, true], [hint, true], [form, false]]);
});

test('editor navigation pauses captures even for an initial frame and resumes afterward', () => {
  const source = readFileSync(new URL('../../entry/src/main/ets/utils/GlassBackdrop.ets', import.meta.url), 'utf8');
  const api = loadPlatformSource(source.slice(source.indexOf('const frozenSources:')),
    '({sourceCaptureAllowed,setGlassNavigationActive})', {captureAllowed: () => true,
      GLASS_HOME_SOURCE: 'home', GLASS_DECK_DETAILS_SOURCE: 'details'});
  assert.equal(api.sourceCaptureAllowed('editor', true), true);
  api.setGlassNavigationActive(true);
  assert.equal(api.sourceCaptureAllowed('editor', true), false);
  assert.equal(api.sourceCaptureAllowed('home'), false);
  api.setGlassNavigationActive(false);
  assert.equal(api.sourceCaptureAllowed('editor', true), true);
});

test('a pane stays warm without replacing the page backdrop across navigation and layout changes', () => {
  const source = readFileSync(new URL('../../entry/src/main/ets/utils/GlassBackdrop.ets', import.meta.url), 'utf8');
  const warmed = [];
  const api = loadPlatformSource(source.slice(source.indexOf('const visibleSources:')),
    '({currentGlassSource,glassSourceVisibility,currentPopupGlassSource})', {
      deviceInfo: {apiAvailable: () => true}, warmGlassSource: (_ui, id, active) => warmed.push([id, active]),
      captureAllowed: () => true, GLASS_BACKGROUND_SOURCE: 'root'
    });
  const ui = {getWindowId: () => 7};
  api.glassSourceVisibility(ui, 'home', true);
  api.glassSourceVisibility(ui, 'details', true, false, false);
  assert.equal(api.currentGlassSource(ui), 'home');
  assert.equal(api.currentPopupGlassSource(ui), 'home');
  api.glassSourceVisibility(ui, 'settings', true);
  api.glassSourceVisibility(ui, 'details', false, false, false);
  api.glassSourceVisibility(ui, 'details', true, false, false);
  assert.equal(api.currentGlassSource(ui), 'settings');
  api.glassSourceVisibility(ui, 'settings', false);
  assert.equal(api.currentGlassSource(ui), 'home');
  api.glassSourceVisibility(ui, 'home', false);
  assert.equal(api.currentGlassSource(ui), '');
  assert.deepEqual(warmed.filter(([id]) => id === 'details'),
    [['details', true], ['details', false], ['details', true]]);
});

test('rotation invalidates frozen sampling geometry and discards snapshots completed in the old orientation', async () => {
  const shared = sharedSource('harmony/shared/GlassBackdrop.ets');
  const Session = loadPlatformSource(shared.slice(shared.indexOf('class BackdropSession'), shared.indexOf('const sessions:')),
    'BackdropSession', {
      sameGlassCaptureGeometry, glassCaptureScale, productGlassBlur: 0, deviceInfo: { apiAvailable: () => false },
      hilog: { info() {}, warn() {} }, setTimeout: fn => { fn(); return 0; },
      setInterval: () => 1, clearInterval() {},
    });
  let geometry = { width: 2800, height: 1840, left: 0, top: 88 };
  const source = { getMeasuredSize: () => ({ width: geometry.width, height: geometry.height }),
    getPositionToWindow: () => ({ x: geometry.left, y: geometry.top }) };
  const session = new Session({ getFrameNodeById: () => source, vp2px: value => value }, 'home');
  const updates = [], released = [];
  let frozen = false, captures = 0;
  const pixels = id => ({ getImageInfoSync: () => ({ size: { width: geometry.width, height: geometry.height } }),
    release() { released.push(id); } });
  session.listeners.add({ cached: true, freezeBackdrop: false, updateFrame: value => updates.push(value) });
  session.canCapture = initial => initial || !frozen;
  session.capturePixels = async () => pixels(++captures);
  await session.capture();
  frozen = true;
  await session.capture();
  assert.equal(captures, 1, 'unchanged frozen geometry must avoid another snapshot');
  session.discardResizedFrame({ width: 0, height: 0, left: 0, top: 0 });
  assert.equal(session.frame.width, 2800, 'a temporarily unmeasured node must preserve the retained frame');
  geometry = { width: 1840, height: 2800, left: 0, top: 88 };
  await session.capture();
  assert.equal(captures, 2);
  assert.equal(updates.at(-2), undefined);
  assert.equal(session.frame.width, 1840);
  assert.equal(session.frame.height, 2800);
  assert.ok(released.includes(1));

  frozen = false;
  session.invalidateSource();
  let resolve;
  session.capturePixels = () => new Promise(done => { resolve = done; });
  const pending = session.capture();
  geometry = { width: 2800, height: 1840, left: 0, top: 0 };
  resolve(pixels('stale'));
  await pending;
  assert.ok(released.includes('stale'));
  assert.equal(session.frame.width, 1840, 'the in-flight landscape pixels cannot overwrite the portrait frame');
  frozen = true;
  session.capturePixels = async () => pixels(++captures);
  await session.capture();
  assert.equal(session.frame.width, 2800);
  assert.equal(session.frame.top, 0);
  assert.equal(captures, 3);
});


test('registered popup sources freeze after their first valid frame while missing frames can recover', () => {
 const source=readFileSync(new URL('../../entry/src/main/ets/utils/GlassBackdrop.ets',import.meta.url),'utf8');
 const api=loadPlatformSource(source.slice(source.indexOf('const frozenSources:')),
  '({retainGlassPanel,releaseGlassPanel,sourceCaptureAllowed})',{captureAllowed:()=>true,GLASS_HOME_SOURCE:'home',GLASS_DECK_DETAILS_SOURCE:'details'});
 api.retainGlassPanel('jide-glass-source-9');
 assert.equal(api.sourceCaptureAllowed('jide-glass-source-9',true),true);
 for(let i=0;i<60;i++) assert.equal(api.sourceCaptureAllowed('jide-glass-source-9',false),false);
 api.releaseGlassPanel('jide-glass-source-9');
 assert.equal(api.sourceCaptureAllowed('jide-glass-source-9'),true);
});

test('standard glass dialogs keep the trigger morph across window sizes', () => {
 const h = panel();
 h.p.trigger = {x:900,y:200,width:44,height:44,radius:22};
 h.p.region = {left:320,top:100,width:480,height:548};
 h.p.aboutToAppear();
 assert.equal(h.p.ownsFusion(), true, 'landscape tablet dialog');
 h.p.region = {left:640,top:200,width:160,height:316};
 assert.equal(h.p.ownsFusion(), true, 'compact dialog');
 h.p.drawerMotion = true;
 assert.equal(h.p.ownsFusion(), false, 'a drawer retains its side entrance');
 const automatic = panel();
 automatic.p.aboutToAppear();
 assert.equal(automatic.p.ownsFusion(), false, 'a dialog without a click has no source geometry');
 automatic.p.finish();
 assert.equal(automatic.entries(), 1, 'automatic dialogs still play the standard entrance');
});

test('nested transparent dialog capture includes the opaque root, at the requested sharpness', async () => {
  const requests = [], released = [];
  const colors = {root:[0,0,1,1], page:[1,0,0,.5], dialog:[0,1,0,.5]};
  const pixel = (color, name) => ({color, getImageInfoSync:()=>({size:{width:100,height:100}}), release:()=>released.push(name)});
  class Canvas {
    color = [0,0,0,0];
    reset() { this.color = [0,0,0,0]; }
    drawImage(image) {
      const src=image.color, dst=this.color, alpha=src[3]+dst[3]*(1-src[3]);
      this.color=[0,1,2].map(i=>(src[i]*src[3]+dst[i]*dst[3]*(1-src[3]))/alpha).concat(alpha);
    }
    getPixelMap() { return pixel(this.color,'composite'); }
  }
  const shared=sharedSource('harmony/shared/GlassBackdrop.ets');
  const api=loadPlatformSource(shared.slice(0,shared.indexOf('class GlassRenderNode')),'({session})',{
    sameGlassCaptureGeometry, deviceInfo:{apiAvailable:()=>true},OffscreenCanvasRenderingContext2D:Canvas,RenderingContextSettings:class {},LengthMetricsUnit:{PX:0}
  });
  const node={getMeasuredSize:()=>({width:300,height:300}),getPositionToWindow:()=>({x:0,y:0})};
  const ui={getWindowId:()=>1,vp2px:v=>v,getFrameNodeById:()=>node,getComponentSnapshot:()=>({get:async(id,options)=>{
    requests.push({id,...options});return pixel(colors[id],id);
  }})};
  api.session(ui,'root');api.session(ui,'page','root');
  const result=await api.session(ui,'dialog','page').capturePixels(node,{left:20,top:30,width:100,height:100},1);
  assert.deepEqual(result.color,[.25,.5,.25,1], 'transparent page and dialog must not leave the mask visible through the sampled texture');
  assert.deepEqual(requests.map(r=>r.id).sort(),['dialog','page','root']);
  for(const request of requests) {
    assert.equal(request.scale,1,'nested background cannot fall back to the warmup resolution');
    assert.equal(request.region,undefined,'snapshot full nodes; crop on the shared physical pixel grid');
  }
  assert.deepEqual(released.filter(name=>name!=='composite').sort(),['dialog','page','root']);
  assert.equal(released.filter(name=>name==='composite').length,4,'each intermediate cropped/composited frame is released');
  const page=api.session(ui,'page');
  page.sourceDirty=false;page.canCapture=()=>false;
  const held=pixel([.5,0,.5,1],'held-page');
  page.frame={pixels:held,left:0,top:0,width:300,height:300,scaleX:1,scaleY:1};
  requests.length=0;released.length=0;
  const reused=await api.session(ui,'dialog').capturePixels(node,{left:20,top:30,width:100,height:100},1);
  assert.deepEqual(reused.color,[.25,.5,.25,1]);
  assert.deepEqual(requests.map(r=>r.id),['dialog'],'nested menu reuses the frozen composite without taking another page or root snapshot');
  assert.ok(!released.includes('held-page'),'a copied crop cannot release the owning session frame');
});

test('panel activity freezes ambient motion once across nested menus and cleans up its observer',()=>{
  const code=readFileSync(new URL('../../entry/src/main/ets/utils/GlassBackdrop.ets',import.meta.url),'utf8');
  const api=loadPlatformSource(code.slice(code.indexOf('const frozenSources:')),
    '({observeGlassPanelActivity,retainGlassPanel,releaseGlassPanel})',{});
  const events=[];const stop=api.observeGlassPanelActivity((active,source)=>events.push([active,source]));
  api.retainGlassPanel('page');api.retainGlassPanel('dialog');api.retainGlassPanel('dialog');
  api.releaseGlassPanel('dialog');api.releaseGlassPanel('page');
  assert.deepEqual(events,[[false,''],[true,'page']]);
  api.releaseGlassPanel('dialog');assert.deepEqual(events.at(-1),[false,'dialog']);
  stop();api.retainGlassPanel('page');assert.equal(events.length,3);
});


test('menu adapters inherit the active dialog source and preserve explicit full-page overrides', () => {
  let activeSource = 'dialog';
  const globals = {
    currentPopupGlassSource: () => activeSource, takePopupTrigger: () => undefined,
    retainGlassPanel() {}, releaseGlassPanel() {}, Scroller: class {}, MenuSlideScope: class {},
    应用尺寸: { compactMenuWidth: 168, radiusLg: 18 }, ActionMenuPointerSide
  };
  for (const [file, type, override, resolved] of [
    ['AnchoredMenu', 'AnchoredMenu', 'refractionSource', 'sourceId'],
    ['GlassBubblePanel', 'GlassBubblePanel', 'source', 'sourceId'],
    ['CardActionMenu', 'CardActionMenu', null, 'menuSource']
  ]) {
    const Menu = loadComponentLogic(`components/common/${file}.ets`, type, globals);
    const menu = new Menu(); menu.getUIContext = () => ({});
    activeSource = 'dialog'; menu.aboutToAppear();
    assert.equal(menu[resolved], 'dialog', file);
    menu.aboutToDisappear?.();
    activeSource = 'page'; menu.aboutToAppear();
    assert.equal(menu[resolved], 'page', file + ' after dialog closes');
    menu.aboutToDisappear?.();
    if (override) {
      activeSource = 'dialog'; menu[override] = 'explicit-home'; menu.aboutToAppear();
      assert.equal(menu[resolved], 'explicit-home', file + ' explicit source');
      menu.aboutToDisappear?.();
    }
  }
});
