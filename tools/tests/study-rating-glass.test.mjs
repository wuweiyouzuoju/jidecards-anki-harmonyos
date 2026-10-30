import test from 'node:test';
import assert from 'node:assert/strict';
import { loadPlatformModule } from './platform-module-harness.mjs';
import { materialHarness } from './surface-material-harness.mjs';
import { motionApi } from './motion-harness.mjs';

function harness(material,dark) {
 const api=materialHarness(material,dark);
 const PressFeedback=loadPlatformModule('utils/PressFeedback.ets','PressFeedback',motionApi());
 const theme=loadPlatformModule('utils/ThemeVisuals.ets','({themePressGradient,themeGradient})',api);
 const GlassSurface=loadPlatformModule('utils/GlassSurface.ets','GlassSurface',{
  ...api,...theme,PressFeedback,$r:key=>key,translucentGlassFill:color=>color
 });
 const ColorMetrics={resourceColor(color){const rgb=parseInt(color.slice(-6),16);return {red:rgb>>>16,green:(rgb>>>8)&255,blue:rgb&255};}};
 const Rating=loadPlatformModule('utils/StudyRatingSurface.ets','StudyRatingSurface',{...api,GlassSurface,ColorMetrics});
 return {Rating,GlassSurface};
}
function paint(surface,pressed=false){
 const state={};const node=new Proxy({}, {get:(_,name)=>(...args)=>{state[name]=args[0];return node;}});
 surface[pressed?'applyPressedAttribute':'applyNormalAttribute'](node);return state;
}
test('four glass ratings preserve separate semantic fills, white edges and stable press color',()=>{
 for(const dark of [false,true]) {
  const {Rating}=harness('glass',dark);
  const fills=['#FFCDD2','#FFE0B2','#C8E6C9','#B3E5FC'];
  const backgrounds=new Set();
  for(const fill of fills) {
   const surface=new Rating('glass',[],fill),normal=paint(surface),pressed=paint(surface,true);
   backgrounds.add(normal.backgroundColor);
   assert.equal(normal.backgroundColor,pressed.backgroundColor);
   assert.ok(normal.backgroundColor.endsWith(dark?',0.8)':',0.62)'));
   assert.deepEqual(normal.border,{width:1,color:dark?'#40FFFFFF':'#E6FFFFFF'});
   assert.equal(normal.backdropBlur,0);
   assert.ok(normal.linearGradient.colors.every(([color])=>color==='transparent'));
  }
  assert.equal(backgrounds.size,4);
 }
});
test('flat ratings and show-answer retain the existing generic material behavior',()=>{
 for(const material of ['flat','glass']) for(const dark of [false,true]) {
  const {Rating,GlassSurface}=harness(material,dark);
  const expected=paint(new GlassSurface(material,[],'#C8E6C9'));
  assert.deepEqual(paint(new Rating(material,[],'#C8E6C9',false)),expected);
  if(material==='flat') assert.deepEqual(paint(new Rating(material,[],'#C8E6C9')),expected);
 }
});
