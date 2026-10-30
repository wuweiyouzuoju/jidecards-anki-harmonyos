import test from 'node:test';
import assert from 'node:assert/strict';
import {glassFillHarness} from './glass-material-harness.mjs';
test('玻璃只改变背景alpha，保留原始颜色和透明通道',()=>{
 const fill=glassFillHarness();assert.equal(fill('#FF112233'),'rgba(17,34,51,0.14)');
 assert.equal(fill('#00112233'),'rgba(17,34,51,0)');
 assert.equal(fill('#80112233'),`rgba(17,34,51,${128/255*.14})`);
});

import {readFileSync} from 'node:fs';
test('闪卡没有橄榄油入口、会话或形变覆盖层',()=>{
 for(const name of ['pages/首页.ets','pages/学习页.ets','components/StudyAnswerActionBar.ets',
  'components/browser/BrowserSelectionAccessory.ets','components/editor/NoteEditorWheel.ets',
  'components/settings/外观分组.ets','model/SettingsStructure.ts','model/agent/AgentPreferenceSettings.ts']){
  const source=readFileSync(new URL('../../entry/src/main/ets/'+name,import.meta.url),'utf8');
  assert.doesNotMatch(source,/OliveOil|olive_oil|createOliveOilSession/,name);
 }
});


test('nested surfaces retain flat resources and use a light transmitted fill in glass mode', async()=>{
 const {loadPlatformModule}=await import('./platform-module-harness.mjs');
 const palette={material:'flat',theme:'light'};
 const {insetMaterialFill}=loadPlatformModule('utils/GlassMaterial.ets','({insetMaterialFill})',{
  AppStorage:{get:key=>key==='surface_material'?palette.material:key==='themeMode'?palette.theme:undefined},
  tintGlassFill:fill=>fill,
  ColorMetrics:{resourceColor:color=>{const hex=color.slice(1),rgb=Number.parseInt(hex.slice(-6),16);
    return {red:rgb>>>16&255,green:rgb>>>8&255,blue:rgb&255,alpha:hex.length===8?parseInt(hex.slice(0,2),16):255};}}
 });
 const resource={id:7};assert.equal(insetMaterialFill(resource),resource);
 palette.material='glass';assert.equal(insetMaterialFill('#FF112233'),'rgba(17,34,51,0.14)');
 palette.theme='dark';assert.equal(insetMaterialFill('#80112233'),`rgba(17,34,51,${128/255*.14})`);
 assert.equal(insetMaterialFill(resource,'flat'),resource);
});
