import test from 'node:test';
import assert from 'node:assert/strict';
import { loadPlatformModule } from './platform-module-harness.mjs';
import { materialHarness, materialNode } from './surface-material-harness.mjs';
import { motionApi } from './motion-harness.mjs';

function harness(material,dark) {
 const api=materialHarness(material,dark);
 const PressFeedback=loadPlatformModule('utils/PressFeedback.ets','PressFeedback',motionApi());
 const theme=loadPlatformModule('utils/ThemeVisuals.ets','({themePressGradient,themeGradient})',api);
 const GlassSurface=loadPlatformModule('utils/GlassSurface.ets','GlassSurface',{
  ...api,...theme,PressFeedback,$r:key=>key,translucentGlassFill:color=>color
 });
 const ColorMetrics={resourceColor(color){const rgb=parseInt(color.slice(-6),16);return {red:rgb>>>16,green:(rgb>>>8)&255,blue:rgb&255};}};
 const Rating=loadPlatformModule('utils/StudyRatingSurface.ets','StudyRatingSurface',{...api,GlassSurface,ColorMetrics,应用尺寸:{圆角_面板:18}});
 return {Rating,GlassSurface,api};
}
function paint(surface,pressed=false){
 const state={};const node=materialNode(state);
 surface[pressed?'applyPressedAttribute':'applyNormalAttribute'](node);return state;
}
test('four glass ratings preserve separate semantic fills, white edges and stable press color',()=>{
 for(const dark of [false,true]) {
  const {Rating,api}=harness('glass',dark);
  const control=paint(api.SeriesVisual.control('glass',dark,'#2F5FD0',18,true));
  const fills=['#FFCDD2','#FFE0B2','#C8E6C9','#B3E5FC'];
  const backgrounds=new Set();
  for(const fill of fills) {
   const surface=new Rating('glass',[],fill),normal=paint(surface),pressed=paint(surface,true);
   backgrounds.add(normal.backgroundColor);
   assert.equal(normal.backgroundColor,pressed.backgroundColor);
   assert.ok(normal.backgroundColor.endsWith(dark?',0.8)':',0.62)'));
   assert.deepEqual(normal.border,{width:1,color:dark?'#40FFFFFF':'#E6FFFFFF'});
   assert.equal(normal.backdropBlur,control.backdropBlur,'ratings share the control glass optics');
   assert.equal(pressed.backdropBlur,control.backdropBlur);
   assert.deepEqual(normal.shadow,control.shadow,'ratings retain the shared button shadow');
   assert.deepEqual(pressed.shadow,control.shadow);
   assert.ok(normal.linearGradient.colors.every(([color])=>color==='transparent'));
   assert.deepEqual(pressed.linearGradient,{angle:0,colors:[[dark?'#0CFFFFFF':'#08000000',0],[dark?'#0CFFFFFF':'#08000000',1]]});
  }
  assert.equal(backgrounds.size,4);
 }
});
test('show-answer and start use toolbar material while flat ratings retain semantic behavior',()=>{
 for(const material of ['flat','glass']) for(const dark of [false,true]) {
  const {Rating,api}=harness(material,dark);
  const actual=paint(new Rating(material,[],'#C8E6C9',false));
  delete actual.opacity;delete actual.scale;
  assert.deepEqual(actual,paint(api.SeriesVisual.primaryAction(material,dark,'#2F5FD0',18)));
  if(material==='flat') {
   const fills=dark?['#5C252B','#5B381D','#23472D','#16415B']:['#FFCDD2','#FFE0B2','#C8E6C9','#B3E5FC'];
   for(const fill of fills) for(const opacity of [100,65]) {
    const rating=new Rating(material,[],fill,true,'#2F5FD0',dark,opacity);
    const expected=api.SeriesVisual.buttonFill(fill,opacity);
    assert.equal(paint(rating).backgroundColor,expected);
    assert.equal(paint(rating,true).backgroundColor,expected);
   }
  }
 }
});

test('primary study surfaces repaint from explicit theme inputs without a press or global storage read',()=>{
 for(const material of ['flat','glass']) for(const dark of [false,true]) {
  const {Rating,api}=harness(material,dark);
  api.storage.set('theme_color_action_primary','#FF0000');
  const backgrounds=[];
  for(const accent of ['#336699','#AA4477']) {
   const actual=paint(new Rating(material,[],'#FFFFFF',false,accent,dark));
   delete actual.opacity;delete actual.scale;
   assert.deepEqual(actual,paint(api.SeriesVisual.primaryAction(material,dark,accent,18)));
   backgrounds.push(actual.backgroundColor);
  }
  if(material==='glass')assert.deepEqual(backgrounds,Array(2).fill(dark?'#591C1C1E':'#52FFFFFF'));
 }
});

// .background() 层位于 backgroundColor 之上；扁平材质下它若沿用通用表面色，四个评分按钮会整体变白。
test('flat rating background layer carries the semantic fill instead of the generic white control surface',()=>{
 for(const dark of [false,true]) {
  const {Rating,api}=harness('flat',dark);
  const generic=paint(api.SeriesVisual.control('flat',dark,'#2F5FD0',18,true)).backgroundColor;
  const fills=dark?['#5C252B','#5B381D','#23472D','#16415B']:['#FFCDD2','#FFE0B2','#C8E6C9','#B3E5FC'];
  for(const fill of fills) for(const opacity of [100,65]) {
   const layer=paint(new Rating('flat',[],fill,true,'#2F5FD0',dark,opacity).backgroundSurface());
   assert.equal(layer.backgroundColor,api.SeriesVisual.buttonFill(fill,opacity));
   assert.notEqual(layer.backgroundColor,generic);
  }
 }
});
