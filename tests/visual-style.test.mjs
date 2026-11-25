// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import vm from 'node:vm';
import { themePalette } from '../src/core/Theme.ts';
import { motionProfile } from '../src/core/Motion.ts';
// ArkTS的无后缀导入交由编译器解析；主机执行同一函数体并注入真实纯规则。
const visualSource = readFileSync(new URL('../src/core/VisualStyle.ts', import.meta.url), 'utf8')
  .replace(/^import[^;]+;\n/gm, '').replaceAll('export ', '');
const { visualPalette, visualAlpha, surfaceAppearance, seriesSurfaceAppearance, visualPressScale } = vm.runInNewContext(
  stripTypeScriptTypes(visualSource + '\n({visualPalette, visualAlpha, surfaceAppearance, seriesSurfaceAppearance, visualPressScale})', { mode: 'transform' }),
  { themePalette, motionProfile });

test('ARGB保留精确端点，非法颜色和透明度明确拒绝', () => {
  assert.equal(visualAlpha('#12ABef', 0), '#0012ABef');
  assert.equal(visualAlpha('#12ABef', 1), '#ff12ABef');
  assert.equal(visualAlpha('#FFFFFF', 0.5), '#80FFFFFF');
  for (const color of ['red', '#fff', '#80ffffff', '#gg1234']) assert.throws(() => visualAlpha(color, 1));
  for (const opacity of [-1, 1.01, NaN, Infinity]) assert.throws(() => visualAlpha('#FFFFFF', opacity));
});

test('玻璃与不透明降级支持产品完整配色，关闭材质后清除模糊和投影', () => {
  for (const dark of [false, true]) {
    const palette = visualPalette(dark);
    const glass = surfaceAppearance(palette, dark);
    assert.equal(glass.blur, true);
    assert.ok(glass.shadowRadius > 0);
    assert.notEqual(glass.fill, palette.surface);
    for (const result of [surfaceAppearance(palette, dark, 'flat'), surfaceAppearance(palette, dark, 'glass', true)]) {
      assert.equal(result.fill, palette.surface);
      assert.equal(result.border, palette.border);
      assert.equal(result.blur, false);
      assert.equal(result.shadowRadius, 0);
      assert.equal(result.shadowColor, '#00000000');
    }
    const custom = { ...palette, surface: '#123456' };
    assert.equal(surfaceAppearance(custom, dark, 'flat').fill, '#123456');
  }
  const one = visualPalette(false); one.surface = 'changed';
  assert.equal(visualPalette(false).surface, '#FFFFFF');
  assert.throws(() => surfaceAppearance(visualPalette(false), false, 'typo'));
});

test('减少动态效果保留点击语义，仅阻止按压缩放', () => {
  assert.equal(visualPressScale('lively', false), 0.975);
  assert.equal(visualPressScale('lively', true), 1);
  assert.equal(visualPressScale('restrained', false), 1);
  assert.throws(() => visualPressScale('unknown', true));
});

test('真实ArkUI表面适配器在同一视图上从玻璃切到扁平时清除残留效果', () => {
  const source = readFileSync(new URL('../src/harmony/shared/Surface.ets', import.meta.url), 'utf8').split('/** 背景层保留')[0]
    .replace(/^import[^;]+;\n/gm, '').replace(/^@Builder\s*$/gm,'').replace(/^export /gm,'');
  const Surface = vm.runInNewContext(stripTypeScriptTypes(source + '\nSharedSurface', { mode: 'transform' }), {
    visualPalette, surfaceAppearance, VisualTokens: { cardRadius: 22 },
    Color: {Transparent:'transparent'}, BlurStyle: { NONE: 0 }, ThemeColorMode: { DARK: 1, LIGHT: 0 }
  });
  const view = {};
  for (const method of ['backgroundBlurStyle', 'backdropBlur', 'linearGradient', 'backgroundColor', 'border', 'borderRadius', 'shadow']) {
    view[method] = function(...args) { this[method + 'Value'] = args; return this; };
  }
  new Surface(true).applyNormalAttribute(view);
  assert.equal(view.backdropBlurValue[0], 24);
  new Surface(false, 'flat', false, 26).applyNormalAttribute(view);
  assert.equal(view.backgroundBlurStyleValue[0], 0);
  assert.equal(view.shadowValue[0].radius, 0);
  assert.equal(view.backdropBlurValue[0], 0);
  assert.equal(view.borderRadiusValue[0], 26);
  assert.equal(view.backgroundColorValue[0], '#FFFFFF');
  new Surface(false,'glass',false,22,visualPalette(false),false).applyNormalAttribute(view);
  assert.equal(view.backgroundColorValue[0],'transparent');
  assert.equal(view.backdropBlurValue[0],0);
  assert.equal(view.borderValue[0].width,0);
});


test('操作按钮比普通模块更通透，减少透明度时两者都回到不透明表面',()=>{
 for(const dark of [false,true]){
  const p=visualPalette(dark),body=surfaceAppearance(p,dark,'glass',false,'content'),button=surfaceAppearance(p,dark,'glass',false,'control');
  const alpha=s=>Number.parseInt(s.slice(1,3),16);
  assert.ok(alpha(button.fill)<alpha(body.fill));
  assert.equal(surfaceAppearance(p,dark,'glass',true,'content').fill,p.surface);
  assert.equal(surfaceAppearance(p,dark,'glass',true,'control').fill,p.surface);
 }
 assert.throws(()=>surfaceAppearance(visualPalette(false),false,'glass',false,'typo'));
});

test('当前系列档与闪卡中性表面一致，旧档显式保留兼容', () => {
  for (const dark of [false, true]) {
    for (const accent of ['#009988', '#DD2211', '#6633BB']) {
      const p = { ...visualPalette(dark), action: accent, surface: dark ? '#000000' : '#FFFFFF' };
      for (const role of ['content', 'control']) {
        const style = seriesSurfaceAppearance(p, dark, 'glass', false, role);
        assert.equal(style.fill, dark ? '#591C1C1E' : '#52FFFFFF');
        assert.equal(style.shadowRadius, dark ? 0 : 8);
        assert.equal(style.shadowY, dark ? 0 : 2);
        assert.equal(style.blur, role === 'control');
        assert.ok(style.highlight.every(value => value === '#00FFFFFF'));
        assert.equal(style.borderWidth, dark ? 0.8 : role === 'control' ? 0.9 : 0);
        assert.equal(surfaceAppearance(p, dark, 'glass', false, role, 'series').fill, style.fill);
        const nested = seriesSurfaceAppearance(p, dark, 'glass', false, role, -1, true);
        assert.equal(nested.fill, '#00000000');
        assert.equal(nested.borderWidth, 0);
        assert.equal(nested.shadowRadius, 0);
        assert.equal(nested.blur, false);
        const flat = seriesSurfaceAppearance(p, dark, 'flat', false, role);
        assert.equal(flat.fill, role === 'control' ? (dark ? '#FF000000' : '#FFFFFFFF') : (dark ? '#FF1C1C1E' : '#FFFFFFFF'));
        assert.equal(flat.blur, false);
        assert.equal(flat.shadowRadius, 0);
      }
    }
  }
  const p = visualPalette(false);
  assert.equal(seriesSurfaceAppearance(p, false, 'glass', false, 'content', 50).fill, '#80FFFFFF');
  assert.equal(seriesSurfaceAppearance(p, false, 'glass', false, 'control', 50).fill, '#29FFFFFF');
  assert.equal(seriesSurfaceAppearance(p, false, 'glass', false, 'content', 0).fill, '#00FFFFFF');
  for (const bad of [NaN, Infinity, -2, 101, 4.5]) assert.throws(() => seriesSurfaceAppearance(p, false, 'glass', false, 'content', bad));
  assert.throws(() => surfaceAppearance(p, false, 'glass', false, 'content', 'typo'));
  assert.equal(surfaceAppearance(p, false).fill, '#7aFFFFFF');
});
