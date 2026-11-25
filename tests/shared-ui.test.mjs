import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import vm from 'node:vm';
import { iconStrokeMatrix, iconArgbMatrix, iconOutlineColor } from '../src/core/IconColor.ts';
import { popupAppearance } from '../src/core/PopupAppearance.ts';

test('玻璃菜单保留完整背景纹理，扁平菜单沿用原底色', () => {
  for (const dark of [false, true]) {
    assert.equal(popupAppearance('glass', dark, 'menu').fill, '#00000000');
  }
  assert.equal(popupAppearance('flat', false, 'menu').fill, '#F0FFFFFF');
  const popup = readFileSync(new URL('../src/harmony/shared/PopupPanel.ets', import.meta.url), 'utf8');
  assert.equal((popup.match(/tint: this\.role === 'dialog' \? dialogPanelFill\(this\.theme\.dark, this\.theme\.panelOpacity\) : ''/g) ?? []).length, 2);
});

function feedbackClass() {
  const source = readFileSync(new URL('../src/harmony/shared/PressFeedback.ets', import.meta.url), 'utf8')
    .replace('export class', 'class');
  return vm.runInNewContext(stripTypeScriptTypes(source + '\nSharedPressFeedback', { mode: 'transform' }));
}

test('共享图标保留透明度，非法描边色不改变原图', () => {
  const identity = [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0];
  for (const color of ['', '#xyz', '#1234', '#00000000', '#1234567']) {
    assert.deepEqual(iconStrokeMatrix(color), identity);
  }
  const matrix = iconStrokeMatrix('#2f5fD0');
  assert.equal(matrix[4], 47 / 255);
  assert.equal(matrix[9], 95 / 255);
  assert.equal(matrix[14], 208 / 255);
  assert.deepEqual(matrix.slice(15), [0, 0, 0, 1, 0]);
  assert.deepEqual(iconArgbMatrix(0xff2f5fd0), matrix);
  for (const alpha of [0, 0.3, 1]) {
    assert.equal(matrix[15] * 0.2 + matrix[16] * 0.4 + matrix[17] * 0.6 + matrix[18] * alpha + matrix[19], alpha);
  }
});

test('真实共享按压类按动作读取档位，恢复和禁用不遗留缩放', () => {
  const Feedback = feedbackClass();
  let scale = 1, reads = 0;
  const feedback = new Feedback(0.4, 0.3, () => { reads++; return scale; });
  const view = { opacity(value) { this.alpha = value; return this; },
    scale(value) { this.size = value.x; return this; } };
  feedback.applyNormalAttribute(view);
  assert.equal(reads, 0);
  feedback.applyPressedAttribute(view);
  assert.equal(view.alpha, 0.4 * 0.72); assert.equal(view.size, 1);
  scale = 0.975;
  feedback.applyPressedAttribute(view);
  assert.equal(view.size, 0.975); assert.equal(reads, 2);
  feedback.applyDisabledAttribute(view);
  assert.equal(view.size, 1); assert.equal(view.alpha, 0.3);
  feedback.applyNormalAttribute(view);
  assert.equal(view.size, 1); assert.equal(view.alpha, 0.4);
  assert.equal(reads, 2);
});

test('菜单触发锚点可保持亮度和几何，普通按钮仍沿用既有默认值',()=>{
 const Feedback=feedbackClass();
 const view={opacity(v){this.alpha=v;return this;},scale(v){this.size=v.x;return this;}};
 const feedback=new Feedback(1,.4,()=>1,1);
 feedback.applyPressedAttribute(view);assert.equal(view.alpha,1);assert.equal(view.size,1);
 feedback.applyNormalAttribute(view);assert.equal(view.alpha,1);assert.equal(view.size,1);
 feedback.applyDisabledAttribute(view);assert.equal(view.alpha,.4);
});

test('空心图标将旗标/选中色转为不透明描边，保留显式描边优先级',()=>{
 for (const tint of ['#40ED3434','#ED3434']) assert.equal(iconOutlineColor(tint,''),'#ED3434');
 assert.equal(iconOutlineColor('#40ED3434','#ABCDEF'),'#ABCDEF');
 for (const tint of ['#00000000','transparent','invalid','']) assert.equal(iconOutlineColor(tint,''),'');
});

test('共享图标空心与填色切换不遗留旧填色，原生明暗资源描边保持原样',()=>{
 let source=readFileSync(new URL('../src/harmony/shared/ActionIcon.ets',import.meta.url),'utf8');
 source=source.slice(source.indexOf('@Component'),source.indexOf('  build() {'))+'}';
 source=source.replace(/@(Component|Prop)(?:\([^\n]*?\))?\s*/g,'').replace('export struct SharedActionIcon','class SharedActionIcon');
 const Icon=new Function('Color','iconOutlineColor','ColorMetrics',stripTypeScriptTypes(source,{mode:'transform'})+';return SharedActionIcon;')({Transparent:'transparent'},iconOutlineColor,{resourceColor:()=>({red:12,green:34,blue:56,alpha:1})});
 const icon=new Icon();icon.tint='gray';assert.equal(icon.resolvedFill(),'gray');
 icon.outlineOnly=true;assert.equal(icon.resolvedFill(),'transparent');assert.equal(icon.resolvedStrokeColor(),'');
 icon.tint='#40ED3434';assert.equal(icon.resolvedStrokeColor(),'#ED3434');
 icon.strokeColor='#FFFFFF';assert.equal(icon.resolvedStrokeColor(),'#FFFFFF');
 icon.strokeColor='';icon.semanticStrokeColor={id:1};assert.equal(icon.resolvedStrokeColor(),'#0c2238');
 icon.outlineOnly=false;assert.equal(icon.resolvedFill(),'#40ED3434');
});
