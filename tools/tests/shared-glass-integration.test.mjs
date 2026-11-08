// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import {loadSharedMenu, sharedSource} from './shared-menu-harness.mjs';
import assert from 'node:assert/strict';
import { surfaceMotionApi } from './motion-harness.mjs';
import { loadComponentLogic } from './platform-module-harness.mjs';
import { glassContour, glassMesh, glassDistance, glassSample } from '../vendor/jide-foundation/src/core/GlassOptics.ts';
import { actionMenuBubbleOutline, ActionMenuPointerSide } from '../../entry/src/main/ets/components/common/ActionMenuLayout.ts';
function panel({api=23, source='body'}={}) {
  const timers=new Map(); let next=0, entries=0, prepared=0;
  const Panel=loadSharedMenu('PopupPanel.ets','SharedGlassPanel',{
  takePopupTrigger:()=>undefined,
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
    assert.match(details, /GlassSource\(\{ sourceId: GLASS_DECK_DETAILS_SOURCE, freezeDuringPanels: true \}\)/);
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
    if(/@CustomDialog\s*\n/.test(source)) assert.match(source,/DialogFrame\(/,path);
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

test('flat-mode preview prewarms visible home content and stops warming when hidden or dismissed',()=>{
 const calls=[];
 const Source=loadComponentLogic('components/common/GlassSource.ets','GlassSource',{
  glassSourceVisibility:(...args)=>calls.push(args),setGlassSourceFreeze(){}
 });
 const source=new Source();source.getUIContext=()=> 'ui';source.sourceId='home';
 source.material='flat';source.foreground=true;source.visible=true;source.sourceEnabled=true;
 source.previewWarm=true;source.sync();assert.deepEqual(calls.at(-1),['ui','home',true,true]);
 source.previewWarm=false;source.sync();assert.deepEqual(calls.at(-1),['ui','home',false,false]);
 source.previewWarm=true;source.aboutToDisappear();assert.deepEqual(calls.at(-1),['ui','home',false,true]);
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
   应用尺寸:{compactMenuWidth:168}, currentGlassSource:()=> 'page'
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
 class Brush { setAntiAlias(){} setColor(){} setShaderEffect(){} }
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
 node.draw({canvas});assert.deepEqual(calls.slice(0,2),['mesh','mesh']);
 assert.deepEqual(calls[2],{image:pixels,src:{left:36,top:46,right:56,bottom:66},dst:{left:22,top:32,right:62,bottom:72}});
 calls.length=0;node.configureFusion(100,200,50,60,mesh,false,1);node.draw({canvas});
 assert.deepEqual(calls,['mesh','mesh'],'settled popup has no persistent button cutout or overlay');
 const edges=[{x:0,y:0},{x:10,y:0},{x:30,y:40},{x:30,y:50}];
 mesh.edge=edges;let pen;
 canvas.attachPen=value=>{pen=value;};canvas.detachPen=()=>{};
 canvas.drawPath=path=>calls.push({outline:path.segments,width:pen.width,color:pen.color});
 calls.length=0;node.configureFusion(100,200,50,60,mesh,true,2,undefined,1.6,'#22FFFFFF');node.draw({canvas});
 assert.deepEqual(calls[2],{outline:[['move',0,0],['line',10,0],['move',30,40],['line',30,50]],width:1.6,color:0x22FFFFFF});
 calls.length=0;node.configureFusion(100,200,50,60,mesh,false,2,undefined,0,'#22FFFFFF');node.draw({canvas});
 assert.deepEqual(calls,['mesh','mesh'],'switching out of dark mode clears the outline and retains full glass');
 mesh.clipRect={x:0,y:0,width:100,height:200,radius:16};
 canvas.drawRoundRect=rect=>calls.push({roundRect:rect.rect});
 calls.length=0;node.configureFusion(100,200,50,60,mesh,true,2,undefined,1.6,'#22FFFFFF');node.draw({canvas});
 assert.deepEqual(calls[2],{roundRect:{left:.8,top:.8,right:99.2,bottom:199.2}},'settled border is one whole inset rounded rectangle');


});
