// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadComponentLogic } from './platform-module-harness.mjs';
import { glassContour, glassMesh, glassDistance, glassSample } from '../../../记得系列基础/src/core/GlassOptics.ts';
import { actionMenuBubbleOutline, ActionMenuPointerSide } from '../../entry/src/main/ets/components/common/ActionMenuLayout.ts';
function panel({api=23, source='body'}={}) {
  const timers=new Map(); let next=0, entries=0, prepared=0;
  const Panel=loadComponentLogic('components/common/GlassPanel.ets','GlassPanel',{
    hilog:{info(){},warn(){}},
    supportsGlassBackdrop:()=>api>=23, currentGlassSource:()=>source, retainGlassPanel:()=>{}, releaseGlassPanel:()=>{},
    currentMotionProfile:()=>({menuScale:.94,dialogScale:.98}),
    materialPopupAnimation:()=>({duration:150}), SurfaceTransition:{dialogEnterAnimation:()=>({duration:250})},
    setTimeout:fn=>{timers.set(++next,fn);return next;},clearTimeout:id=>timers.delete(id)
  });
  const p=new Panel();p.material='glass';p.foreground=true;
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
  const source=readFileSync(new URL('../../../记得系列基础/src/harmony/shared/GlassBackdrop.ets',import.meta.url),'utf8');
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
  const h=panel();h.p.mode=mode;h.p.systemDark=systemDark;h.p.aboutToAppear();
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
 const h=panel();h.p.material='flat';h.p.materialOverride='glass';h.p.source='home';h.p.aboutToAppear();
 assert.equal(h.p.usesGlass(),true);h.p.finish();assert.equal(h.p.material,'flat');h.p.aboutToDisappear();
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
