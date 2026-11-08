// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import {loadSharedMenu} from './shared-menu-harness.mjs';

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
   assert.equal(enter.duration,menu?160:200);
   assert.equal(Boolean(enter.curve.spring),style==='lively');
   const exit=surface.glassExit(menu,drawer,'25%','100%');
   assert.equal(exit.value,0);
   assert.equal(exit.options.duration,drawer?180:190);
   assert.deepEqual(exit.combined.value,{x:drawer?-16:0});
  }
 }
});

test('bubble scale origin follows each actual arrow and remains clamped after edge avoidance',()=>{
 const Bubble=loadSharedMenu('MenuBubble.ets','SharedGlassBubblePanel',{
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

test('glass menus and dialogs fade in together when reduced motion suppresses the trigger morph',()=>{
 const Panel=loadSharedMenu('PopupPanel.ets','SharedGlassPanel',{
  takePopupTrigger:()=>({x:20,y:40,width:180,height:44,radius:16}),prefersReducedMotion:()=>true,
  hilog:{info(){}},Curve:{EaseOut:'ease-out'},supportsGlassBackdrop:()=>true,currentGlassSource:()=> 'page',
  retainGlassPanel(){},releaseGlassPanel(){},SurfaceTransition:surfaceMotionApi().SurfaceTransition
 });
 for(const role of ['menu','dialog','preview']) {
  const p=new Panel();Object.assign(p.theme,{material:'glass',foreground:true,supported:true,reducedMotion:true});p.source='page';p.trigger={x:20,y:40,width:180,height:44,radius:16};p.role=role;p.getUniqueId=()=>1;
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

test('popup trigger snapshots expire and can only be consumed once',()=>{
 const source=readFileSync(new URL('../../entry/src/main/ets/utils/PopupTrigger.ets',import.meta.url),'utf8')+'\nexport const triggerApi = { rememberPopupTrigger, takePopupTrigger };';
 let now=100;
 const {glassPopupTriggerRect}=loadPlatformSource(readFileSync(new URL('../vendor/jide-foundation/src/core/GlassFusion.ts',import.meta.url),'utf8'),'({glassPopupTriggerRect})',{});
 const api=loadPlatformSource(source,'triggerApi',{Date:{now:()=>now},Math,Number,glassPopupTriggerRect});
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


test('toolbar popup handoff uses its actual outline radius for click and hold, matching home anchors',()=>{
 const calls=[];
 const Button=loadComponentLogic('components/common/IconActionButton.ets','IconActionButton',{
  Color:{Transparent:'transparent'},应用尺寸:{按钮高度:44,圆角_卡片:22},MenuHoldController:class{},rememberPopupTrigger:(area,radius)=>calls.push({area,radius})
 });
 const b=new Button();b.toolbarStyle=true;b.triggerArea={width:44,height:44};
 b.rememberTrigger();assert.equal(calls[0].radius,22);
 b.toolbarStyle=false;b.controlSize=36;b.rememberTrigger();assert.equal(calls[1].radius,18);
});

test('anchored menu delegates back directly to the owner of the top layer', () => {
 const Menu=loadSharedMenu('AnchoredMenu.ets','SharedAnchoredMenu',{
  MenuSlideScope:class{},Scroller:class{},应用尺寸:{compactMenuWidth:168,radiusLg:16}
 });
 const menu=new Menu();
 const layers=['root','child'];
 menu.onClose=()=>layers.pop();
 menu.closeRequested();assert.deepEqual(layers,['root']);
 menu.closeRequested();assert.deepEqual(layers,[]);
});
