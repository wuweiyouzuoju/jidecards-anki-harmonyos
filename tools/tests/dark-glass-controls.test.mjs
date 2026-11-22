import test from 'node:test';
import assert from 'node:assert/strict';
import { materialHarness, materialNode } from './surface-material-harness.mjs';
import { loadPlatformModule } from './platform-module-harness.mjs';
import { motionApi } from './motion-harness.mjs';
function paint(modifier){const state={};const node=materialNode(state);modifier.applyNormalAttribute(node);return state;}
test('dark standard controls share opacity and outline with shared optical backgrounds',()=>{
 const api=materialHarness('glass',true);
 const ColorMetrics={resourceColor(color){const value=typeof color==='string'&&color.startsWith('#')?color:'#18202B';const rgb=parseInt(value.slice(-6),16);return {red:rgb>>>16,green:(rgb>>>8)&255,blue:rgb&255,alpha:255};}};
 const glass=loadPlatformModule('utils/GlassMaterial.ets','({translucentGlassFill,usesGlassMaterial,darkMaterial})',{...api,ColorMetrics});
 const PressFeedback=loadPlatformModule('utils/PressFeedback.ets','PressFeedback',motionApi());
 const theme=loadPlatformModule('utils/ThemeVisuals.ets','({themePressGradient,themeGradient})',api);
 const deps={...api,...glass,...theme,PressFeedback,$r:()=> '#18202B'};
 const Surface=loadPlatformModule('utils/GlassSurface.ets','GlassSurface',deps);
 const Primary=loadPlatformModule('utils/PrimaryGlassSurface.ets','PrimaryGlassSurface',deps);
 const ordinary=paint(new Surface('glass',[],'#18202B'));
 const primary=paint(new Primary('glass',{pressedColors:[]}));
 const toolbar=paint(api.SeriesVisual.control('glass',true,'',18,true));
 assert.deepEqual(ordinary.border,toolbar.border);assert.deepEqual(primary.border,toolbar.border);
 assert.equal(ordinary.backgroundColor,toolbar.backgroundColor);
 assert.equal((new Surface('glass',[],'#18202B')).backgroundSurface().backgroundOptions().source,'root-background');
 assert.equal(primary.backgroundColor,paint(api.SeriesVisual.primaryAction('glass',true,'#2F5FD0',18)).backgroundColor);
 assert.equal(ordinary.backdropBlur,api.sharedGlassBlurRadius());assert.equal(primary.backdropBlur,api.sharedGlassBlurRadius());assert.equal(toolbar.backdropBlur,api.sharedGlassBlurRadius());
 const explicit={width:2,color:'#FF0000'};
 assert.deepEqual(paint(new Surface('glass',[],'#18202B',explicit)).border,explicit);
 const flat=paint(new Surface('flat',[],'#18202B'));assert.equal(flat.backdropBlur,0);assert.equal(flat.shadow.radius,0);
});

test('editor wheel uses its live backdrop without mounting an asynchronous snapshot background', () => {
 const api = materialHarness('glass', true);
 const Wheel = loadPlatformModule('utils/EditorWheelSurface.ets', 'EditorWheelSurface', {
  ...api, themedGlassFill: () => 'transparent'
 });
 const surface = new Wheel('glass', true, '#18202B');
 assert.equal(paint(surface).backdropBlur, api.sharedGlassBlurRadius());
 assert.equal(surface.backgroundSurface(100, 'contour').hasOpticalBackground(), false);
 assert.equal(paint(new Wheel('flat', false, '#FFFFFF')).backdropBlur, 0);
});
