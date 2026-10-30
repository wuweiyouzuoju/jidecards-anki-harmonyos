import test from 'node:test';
import assert from 'node:assert/strict';
import { materialHarness } from './surface-material-harness.mjs';
import { loadPlatformModule } from './platform-module-harness.mjs';
import { motionApi } from './motion-harness.mjs';
function paint(modifier){const state={};const node=new Proxy({}, {get:(_,name)=>(...args)=>{state[name]=args[0];return node;}});modifier.applyNormalAttribute(node);return state;}
test('dark standard controls share opacity and outline without disabling their glass blur',()=>{
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
 assert.ok(ordinary.backgroundColor.endsWith(',0.24)'));
 assert.equal(ordinary.backgroundColor,primary.backgroundColor);
 assert.equal(ordinary.backdropBlur,24);assert.equal(primary.backdropBlur,24);assert.equal(toolbar.backdropBlur,24);
 const explicit={width:2,color:'#FF0000'};
 assert.deepEqual(paint(new Surface('glass',[],'#18202B',explicit)).border,explicit);
 const flat=paint(new Surface('flat',[],'#18202B'));assert.equal(flat.backdropBlur,0);assert.equal(flat.shadow.radius,0);
});
