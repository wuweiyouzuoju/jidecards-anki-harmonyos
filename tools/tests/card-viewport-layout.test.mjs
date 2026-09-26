// SPDX-License-Identifier: AGPL-3.0-or-later
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { cardViewportWidth } from '../../entry/src/main/ets/model/CardViewportLayout.ts';

test('card viewport fits phones, widens landscape windows and follows rotation', () => {
  assert.equal(cardViewportWidth(412, 892), 412);
  assert.equal(cardViewportWidth(780, 360), 780);
  assert.equal(cardViewportWidth(892, 412), 840);
  assert.equal(cardViewportWidth(1600, 1000), 1472);
  assert.equal(cardViewportWidth(1000, 1600), 840);
  assert.equal(cardViewportWidth(2560, 1440), 1600);
  for (const width of [320, 600, 839, 840, 1000, 1600, 2560]) {
    for (const height of [320, 600, 1000, 1600]) {
      assert.ok(cardViewportWidth(width, height) <= width);
    }
  }
  for (const invalid of [0, -1, NaN, Infinity]) assert.equal(cardViewportWidth(invalid, 900), 840);
});

test('study and preview share responsive widths and the same card surface', () => {
  for (const file of ['pages/学习页.ets', 'components/browser/卡片预览页.ets']) {
    const source = readFileSync(new URL(`../../entry/src/main/ets/${file}`, import.meta.url), 'utf8');
    assert.match(source, /constraintSize\(\{ maxWidth: this\.cardContentWidth \}\)/);
    assert.match(source, /onAreaChange[\s\S]*cardViewportWidth\(Number\(area.width\), Number\(area.height\)\)/);
    assert.match(source, /borderRadius\(应用尺寸\.圆角_卡片\)/);
    assert.match(source, /border\(\{ width: 1.5, color: \$r\('app.color.border_input'\) \}\)/);
    assert.match(source, /shadow\(ShadowStyle\.OUTER_DEFAULT_XS\)/);
  }
});

test('full-screen preview owns an opaque theme background and blocks the host page', () => {
  const source = readFileSync(new URL('../../entry/src/main/ets/components/browser/卡片预览页.ets', import.meta.url), 'utf8');
  const build = source.slice(source.indexOf('\n  build()'));
  assert.match(build, /Stack\(\)\s*\{\s*\/\/[^\n]*\n\s*ThemeBackground\(\)/);
  assert.match(build, /\}\s*\.width\('100%'\)\s*\.height\('100%'\)\s*\.backgroundColor\(\$r\('app.color.surface_page'\)\)\s*\.hitTestBehavior\(HitTestMode.Block\)/);
  assert.doesNotMatch(build, /rgba\(|\.onClick\(/, 'no translucent dismiss layer behind the full-screen page');
  assert.equal((build.match(/\.transition\(/g) ?? []).length, 1, 'background and controls transition as one page');
});
