// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { surfaceMotionApi } from './motion-harness.mjs';
import { loadComponentLogic, loadPlatformModule, loadPlatformSource } from './platform-module-harness.mjs';
import { ActionMenuPointerSide } from '../../entry/src/main/ets/components/common/ActionMenuLayout.ts';

test('glass menus, dialogs and drawers use distinct presentation geometry and honor both styles', () => {
 for (const style of ['restrained', 'lively']) {
  const api=surfaceMotionApi(style), surface=api.SurfaceTransition;
  assert.ok(surface.glassScale(true,false)<surface.glassScale(false,false));
  assert.equal(surface.glassScale(false,true),1);
  assert.equal(surface.glassOffset(false),0);
  assert.ok(surface.glassOffset(true)<0);
  for (const [menu,drawer] of [[true,false],[false,false],[false,true]]) {
   const enter=surface.glassEnterAnimation(menu,drawer);
   assert.equal(enter.duration,200);
   assert.equal(Boolean(enter.curve.spring),style==='lively');
   const exit=surface.glassExit(menu,drawer,'25%','100%');
   assert.equal(exit.value,0);
   assert.equal(exit.options.duration,drawer?180:190);
   assert.deepEqual(exit.combined.value,{x:drawer?-16:0});
  }
 }
});

test('bubble scale origin follows each actual arrow and remains clamped after edge avoidance',()=>{
 const Bubble=loadComponentLogic('components/common/GlassBubblePanel.ets','GlassBubblePanel',{
  ActionMenuPointerSide, 应用尺寸:{compactMenuWidth:160}
 });
 const panel=new Bubble();panel.panelWidth=160;panel.panelHeight=240;panel.pointerCenter=60;
 const expected=[['100%','25%'],['37.5%','0%'],['37.5%','100%'],['0%','25%']];
 for(const [side,origin] of expected.entries()) {
  panel.pointerSide=side;assert.deepEqual([panel.motionCenterX(),panel.motionCenterY()],origin);
 }
 panel.pointerSide=ActionMenuPointerSide.Top;
 panel.pointerCenter=-50;assert.equal(panel.motionCenterX(),'0%');
 panel.pointerCenter=500;assert.equal(panel.motionCenterX(),'100%');
});

test('selects project trigger center onto the actual popup after native placement flips',()=>{
 const Select=loadComponentLogic('components/common/SurfaceSelect.ets','SurfaceSelect',{
  selectionPopupAngle:()=>90,SelectStyle:{}
 });
 const select=new Select();select.menuOpen=true;
 select.triggerRect={left:160,top:200,width:80,height:44};
 const area=(x,y)=>({globalPosition:{x,y},width:160,height:120});
 select.popupArea(area(100,250));assert.deepEqual([select.motionCenterX,select.motionCenterY],['62.5%','0%']);
 select.popupArea(area(100,60));assert.deepEqual([select.motionCenterX,select.motionCenterY],['62.5%','100%']);
 select.popupArea(area(260,180));assert.equal(select.motionCenterX,'0%');
 select.popupArea(area(-20,180));assert.equal(select.motionCenterX,'100%');
});

test('a shared fusion owns the entrance without a second GlassPanel scale animation',()=>{
 const Panel=loadComponentLogic('components/common/GlassPanel.ets','GlassPanel',{
  takePopupTrigger:()=>undefined,
  hilog:{info(){}},supportsGlassBackdrop:()=>true,currentGlassSource:()=> 'home',retainGlassPanel(){},releaseGlassPanel(){},
  SurfaceTransition:surfaceMotionApi().SurfaceTransition
 });
 const panel=new Panel();let animations=0,prepared=0;
 panel.getUniqueId=()=>1;panel.getUIContext=()=>({animateTo(){animations++;}});
 panel.material='glass';panel.foreground=true;panel.externalEntrance=true;panel.onPrepared=()=>prepared++;
 panel.aboutToAppear();assert.equal(panel.panelScale,1);panel.finish();panel.finish();
 assert.equal(animations,0);assert.equal(prepared,1);assert.equal(panel.panelOpacity,1);
});
test('only menus with a real button anchor fuse; ordinary menus retain normal entrance',()=>{
 const Menu=loadComponentLogic('components/common/AnchoredMenu.ets','AnchoredMenu',{
  takePopupTrigger:()=>undefined,
  MenuSlideScope:class{},Scroller:class{},menuSlideSession:{attach(){},detach(){}},supportsGlassBackdrop:()=>true,
  应用尺寸:{compactMenuWidth:168,radiusLg:16}
 });
 for(const setting of ['glass','flat','background','no_anchor']) {
  const menu=new Menu();menu.material=setting==='flat'?'flat':'glass';menu.foreground=setting!=='background';
  if(setting!=='no_anchor')menu.fusionAnchor={x:20,y:40,width:44,height:44,radius:22};
  menu.aboutToAppear();assert.equal(menu.fusionPending,setting==='glass');
  if(setting==='glass') {
   menu.fusionTarget={x:20,y:90,width:168,height:220,radius:16};menu.panelPrepared();assert.equal(menu.fusionPlaying,true);
   const region=menu.fusionRegion();assert.ok(region.left<20&&region.top<40&&region.height>270);
   menu.foreground=false;menu.foregroundChanged();assert.equal(menu.fusionPending,false);assert.equal(menu.fusionPlaying,false);
  }
 }
});

test('switching a prepared panel to content-only keeps its original capture lease balanced',()=>{
 let retained=0,released=0;
 const Panel=loadComponentLogic('components/common/GlassPanel.ets','GlassPanel',{
  takePopupTrigger:()=>undefined,
  hilog:{info(){}},supportsGlassBackdrop:()=>true,currentGlassSource:()=> 'home',retainGlassPanel(){retained++;},releaseGlassPanel(){released++;},
  SurfaceTransition:surfaceMotionApi().SurfaceTransition
 });
 const panel=new Panel();panel.getUniqueId=()=>1;panel.getUIContext=()=>({});panel.material='glass';panel.aboutToAppear();
 panel.surfaceVisible=false;panel.aboutToDisappear();assert.equal(retained,1);assert.equal(released,1);
});

test('menu trigger feedback retains brightness and geometry while ordinary buttons still dim',()=>{
 // Execute the actual product adapter with its actual shared base.
 const Product=loadPlatformModule('utils/PressFeedback.ets','PressFeedback',surfaceMotionApi('lively'));
 const state={};const attr={opacity(value){state.opacity=value;return this;},scale(value){state.scale=value;return this;}};
 for(const stable of [true,false]) {
  const modifier=new Product(1,.4,stable);modifier.applyPressedAttribute(attr);
  assert.equal(state.opacity,stable?1:.72);assert.equal(state.scale.x,stable?1:.975);
  modifier.applyNormalAttribute(attr);assert.equal(state.opacity,1);assert.equal(state.scale.x,1);
 }
});

test('button closure runs the inverse shared shape; outside/back are idempotent and final completion owns removal',()=>{
 const Menu=loadComponentLogic('components/common/AnchoredMenu.ets','AnchoredMenu',{
  takePopupTrigger:()=>undefined,
  MenuSlideScope:class{},Scroller:class{},menuSlideSession:{attach(){},detach(){}},supportsGlassBackdrop:()=>true,
  Curve:{EaseOut:'ease-out'},应用尺寸:{compactMenuWidth:168,radiusLg:16}
 });
 const menu=new Menu();let closes=0;
 menu.onClose=()=>closes++;menu.getUIContext=()=>({animateTo(_options,update){update();}});
 menu.fusionPlaying=true;menu.fusionPending=false;
 menu.buttonOrigin={x:20,y:30,width:44,height:44,radius:16};
 menu.backgroundClicked({windowX:40,windowY:40});assert.equal(menu.fusionExpanded,false);assert.equal(closes,0);
 menu.requestClose();assert.equal(menu.fusionExpanded,false,'back again does not reopen');
 menu.backgroundClicked({windowX:40,windowY:40});assert.equal(menu.fusionExpanded,true,'same trigger reverses a running return');
 menu.requestClose();menu.finishFusion('finished');assert.equal(closes,1);
 const flat=new Menu();flat.onClose=()=>closes++;flat.requestClose();assert.equal(closes,2);
});


test('ordinary glass dialogs and selectors prepare with their normal surface transition',()=>{
 const Panel=loadComponentLogic('components/common/GlassPanel.ets','GlassPanel',{
  takePopupTrigger:()=>undefined,
  hilog:{info(){}},Curve:{EaseOut:'ease-out'},supportsGlassBackdrop:()=>true,currentGlassSource:()=> 'page',
  retainGlassPanel(){},releaseGlassPanel(){},SurfaceTransition:surfaceMotionApi().SurfaceTransition
 });
 for(const role of ['menu','dialog','preview']) {
  const p=new Panel();p.material='glass';p.foreground=true;p.role=role;p.getUniqueId=()=>1;
  let animations=0,prepared=0;
  p.onPrepared=()=>prepared++;
  p.getUIContext=()=>({animateTo(_options,update){animations++;update();}});
  p.aboutToAppear();assert.equal(p.prepared,false);assert.equal(p.panelOpacity,.01);
  p.finish();p.finish();assert.equal(p.panelScale,1);assert.equal(p.panelOpacity,1);
  assert.equal(animations,1);assert.equal(prepared,1);
  p.aboutToDisappear();p.finish();assert.equal(prepared,1);
 }
});

test('a content-only shell clears old highlights as well as fill and border before the shared material takes over',()=>{
 const Surface=loadPlatformModule('components/common/PopupSurface.ets','PopupSurface',{
  Color:{Transparent:'transparent'},BlurStyle:{NONE:0}
 });
 const state={},attr=new Proxy({}, {get:(_t,key)=>(value)=>{state[key]=value;return attr;}});
 new Surface('glass',false,16,'menu',false,'').applyNormalAttribute(attr);
 assert.equal(state.backgroundColor,'transparent');assert.deepEqual(state.border,{width:0});
 assert.deepEqual(state.linearGradient.colors,[['transparent',0],['transparent',1]]);
});

test('button-triggered panels use the measured origin and include both bounds in the optical region',()=>{
 const origin={x:720,y:40,width:44,height:44,radius:16};
 const Panel=loadComponentLogic('components/common/GlassPanel.ets','GlassPanel',{
  takePopupTrigger:()=>origin,hilog:{info(){}},supportsGlassBackdrop:()=>true,currentGlassSource:()=> 'page',
  retainGlassPanel(){},releaseGlassPanel(){},SurfaceTransition:surfaceMotionApi().SurfaceTransition
 });
 const p=new Panel();p.material='glass';p.getUniqueId=()=>1;p.getUIContext=()=>({});p.aboutToAppear();
 p.region={left:200,top:300,width:320,height:480};assert.equal(p.ownsFusion(),true);
 assert.deepEqual(p.fusionGeometry().source,origin);
 const r=p.fusionRegion();assert.ok(r.left<=200&&r.top<=40);
 assert.ok(r.left+r.width>=764&&r.top+r.height>=780);
});

test('popup trigger snapshots expire and can only be consumed once',()=>{
 const source=readFileSync(new URL('../../entry/src/main/ets/utils/PopupTrigger.ets',import.meta.url),'utf8')+'\nexport const triggerApi = { rememberPopupTrigger, takePopupTrigger };';
 let now=100;
 const api=loadPlatformSource(source,'triggerApi',{Date:{now:()=>now},Math,Number});
 api.rememberPopupTrigger({width:80,height:44,globalPosition:{x:300,y:40}});
 assert.deepEqual(api.takePopupTrigger(),{x:300,y:40,width:80,height:44,radius:16});
 assert.equal(api.takePopupTrigger(),undefined);
 api.rememberPopupTrigger({width:80,height:44,globalPosition:{x:300,y:40}});now+=801;
 assert.equal(api.takePopupTrigger(),undefined);
});

test('stable popup buttons keep the same fill, gradient, opacity and scale on press and release',()=>{
 const Press=loadPlatformModule('utils/PressFeedback.ets','PressFeedback',surfaceMotionApi('lively'));
 const Surface=loadPlatformModule('utils/GlassSurface.ets','GlassSurface',{
  PressFeedback:Press,Color:{Transparent:'transparent'},BlurStyle:{NONE:0},
  usesGlassMaterial:()=>true,darkMaterial:()=>false,translucentGlassFill:()=> '#52FFFFFF',
  themePressGradient:(_colors,pressed)=>[[pressed?'bright':'rest',0]],
  SeriesVisual:{shadow:()=>({radius:8})},SurfaceBorder:{options:()=>({width:0})}
 });
 const paint=method=>{
  const state={},node=new Proxy({}, {get:(_t,key)=>(value)=>{state[key]=value;return node;}});
  const surface=new Surface('glass',[],'white',undefined,true);surface[method](node);return state;
 };
 assert.deepEqual(paint('applyPressedAttribute'),paint('applyNormalAttribute'));
});


test('menus without a button use the same lightweight glass at rest without inventing an origin',()=>{
 const Panel=loadComponentLogic('components/common/GlassPanel.ets','GlassPanel',{
  takePopupTrigger:()=>undefined,hilog:{info(){}},supportsGlassBackdrop:()=>true,currentGlassSource:()=> 'page',
  retainGlassPanel(){},releaseGlassPanel(){},SurfaceTransition:surfaceMotionApi().SurfaceTransition
 });
 const p=new Panel();p.material='glass';p.role='menu';p.getUniqueId=()=>1;p.getUIContext=()=>({});p.aboutToAppear();
 p.region={left:200,top:300,width:280,height:617};assert.equal(p.ownsFusion(),true);assert.equal(p.origin,undefined);
 assert.deepEqual(p.fusionGeometry().source,p.fusionGeometry().target);
 assert.deepEqual(p.fusionRegion(),p.region);
});


test('composite toolbar menus retain their measured button and give primary fusion to the shared owner',()=>{
 const origin={x:700,y:30,width:44,height:44,radius:16};
 const Card=loadComponentLogic('components/common/CardActionMenu.ets','CardActionMenu',{
  takePopupTrigger:()=>origin, supportsGlassBackdrop:()=>true, Scroller:class{},MenuSlideScope:class{},
  应用尺寸:{compactMenuWidth:168},warmGlassSource(){}
 });
 const card=new Card();card.getUniqueId=()=>1;card.material='glass';card.foreground=true;card.aboutToAppear();
 assert.equal(card.toolbarOrigin,origin);assert.equal(card.usesToolbarFusion(),true);
 card.anchor={left:10,top:50,width:40,height:44};assert.equal(card.usesToolbarFusion(),false);
 const Menu=loadComponentLogic('components/common/AnchoredMenu.ets','AnchoredMenu',{
  takePopupTrigger:()=>undefined,MenuSlideScope:class{},Scroller:class{},menuSlideSession:{attach(){}},
  supportsGlassBackdrop:()=>true,应用尺寸:{compactMenuWidth:168,radiusLg:16}
 });
 const menu=new Menu();menu.material='glass';menu.foreground=true;menu.surfaceVisible=false;
 menu.separateFusionSurface=true;menu.fusionAnchor=origin;menu.aboutToAppear();assert.equal(menu.fusionPending,true);
 assert.equal(menu.fusionPlaying,false);menu.panelPrepared();assert.equal(menu.fusionPending,true);menu.fusionPanelArea={x:500,y:90,width:168,height:400,radius:16};
 menu.fusionAreaChanged();assert.equal(menu.fusionPlaying,true);assert.deepEqual(menu.fusionGeometry(),{source:origin,target:menu.fusionPanelArea});
 menu.finishFusion('reduced_motion');assert.equal(menu.fusionPending,false);assert.equal(menu.fusionPlaying,true);
 let closed=0;menu.onClose=()=>closed++;menu.fusionExpanded=false;menu.finishFusion('finished');assert.equal(closed,1);
});

test('centered selectors discard button motion while retaining lightweight glass and normal geometry',()=>{
 const Panel=loadComponentLogic('components/common/GlassPanel.ets','GlassPanel',{
  takePopupTrigger:()=>({x:20,y:40,width:180,height:44,radius:16}),hilog:{info(){}},supportsGlassBackdrop:()=>true,
  currentGlassSource:()=> 'page',retainGlassPanel(){},releaseGlassPanel(){},SurfaceTransition:surfaceMotionApi().SurfaceTransition
 });
 const p=new Panel();p.material='glass';p.buttonFusion=false;p.getUniqueId=()=>1;p.getUIContext=()=>({});p.aboutToAppear();
 p.region={left:180,top:300,width:480,height:280};assert.equal(p.origin,undefined);assert.equal(p.ownsFusion(),true);
 assert.deepEqual(p.fusionRegion(),p.region);assert.deepEqual(p.fusionGeometry().source,p.fusionGeometry().target);
});
