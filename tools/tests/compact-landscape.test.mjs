// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { compactLandscapeScale, isWideLandscapeWindow } from '../../entry/src/main/ets/model/AppLayoutState.ts';
import { homeHeaderGeometry, homeSummaryGeometry } from '../../entry/src/main/ets/model/HomeHeaderLayout.ts';
import { componentMethods } from './sync-panel-harness.mjs';
import { 应用尺寸 } from '../../entry/src/main/ets/utils/应用尺寸.ets';
const source = name => readFileSync(new URL('../../entry/src/main/ets/'+name, import.meta.url),'utf8');

test('compact density follows a short landscape window and restores for portrait and foldable inner screens',()=>{
 for(const [w,h,scale] of [[744,440,.82],[672,460,.82],[600,400,.82],[839,540,.82],
  [599,400,1],[840,440,1],[940,664,1],[744,600,1],[440,744,1],[0,0,1],[Infinity,400,1]]) {
  assert.equal(compactLandscapeScale(w,h),scale);
 }
});

test('shared toolbar buttons use the header budget once and restore normal geometry on rotation',()=>{
 const Icon=componentMethods(source('components/common/IconActionButton.ets'),
  ['densityScale','renderedControlSize','renderedControlWidth'],{compactLandscapeScale,应用尺寸});
 const icon=Object.assign(new Icon(),{controlSize:44,controlWidth:44,densityWindow:{width:744,height:440}});
 const scale=compactLandscapeScale(744,440);
 const header=homeHeaderGeometry(420,12*scale,true,44*scale,1,scale);
 assert.equal(icon.renderedControlSize(),header.controlHeight);
 assert.equal(header.summaryHeight,168*scale);
 const summary=homeSummaryGeometry(header.summaryHeight,false,10,1,true);
 assert.ok(summary.bodyHeight>=2*(22+16+1)+summary.countRowGap,'both count rows and their gap fit in landscape');
 assert.equal(summary.topPadding+summary.titleHeight+summary.sectionGap+summary.bodyHeight+summary.bottomPadding,header.summaryHeight);
 icon.controlSize=header.controlHeight;icon.controlWidth=header.controlWidth;
 assert.equal(icon.renderedControlSize(),header.controlHeight,'pre-scaled host geometry is not scaled twice');
 icon.controlSize=44;icon.controlWidth=44;icon.densityWindow={width:440,height:744};
 assert.equal(icon.renderedControlSize(),44);assert.equal(icon.renderedControlWidth(),44);
});

test('settings compact gaps and toolbar budget preserve camera and system insets',()=>{
 const Panel=componentMethods(source('components/设置面板.ets'),
  ['densityScale','wideSettings','settingsContentInset','settingsModuleGap','toolbarTop','toolbarHeight'],
  {compactLandscapeScale,isWideLandscapeWindow,应用尺寸});
 for(const [w,h] of [[744,440],[440,744],[940,664]]) for(const top of [0,24,48]) {
  const panel=Object.assign(new Panel(),{windowSize:{width:w,height:h},状态栏高度:0,toolbarSafeTop:top,narrowDeckLayout:false});
  const scale=compactLandscapeScale(w,h);
  assert.equal(panel.settingsContentInset(),16*scale);
  assert.equal(panel.settingsModuleGap(),(w>h?16:12)*scale);
  assert.ok(panel.toolbarTop()>=top);
  assert.ok(Math.abs(panel.toolbarHeight()-panel.toolbarTop()-44*scale)<1e-10);
 }
 const shellSource=source('components/common/PageActionShell.ets');
 assert.match(shellSource, /\.padding\(\{ left: this\.safeLeft, right: this\.safeRight \}\)/,
  'the shared page shell applies unscaled horizontal safety');
});
