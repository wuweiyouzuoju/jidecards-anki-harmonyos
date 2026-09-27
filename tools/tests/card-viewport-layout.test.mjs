// SPDX-License-Identifier: AGPL-3.0-or-later
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
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
    assert.match(source, /CardViewport\(\{ content: \(\) => \{ this\.cardViewportContent\(\); \} \}\)/,
      'builder retains the page owner for card state and actions');
    assert.doesNotMatch(source, /cardContentWidth|onAreaChange/, 'no post-render width correction');
    assert.match(source, /borderRadius\(应用尺寸\.圆角_卡片\)/);
    assert.match(source, /border\(\{ width: 应用尺寸\.卡片边框, color: \$r\('app.color.border_subtle'\) \}\)/);
    assert.doesNotMatch(source, /border\(\{ width: 1\.5, color: \$r\('app.color.border_input'\)/);
    assert.doesNotMatch(source, /shadow\(ShadowStyle\.OUTER_DEFAULT_XS\)/);
  }
});

test('viewport measures the final child width on the first layout and immediately after rotation', () => {
  const source = readFileSync(new URL('../../entry/src/main/ets/components/common/CardViewport.ets', import.meta.url), 'utf8');
  const methods = ['onMeasureSize', 'onPlaceChildren'].map(name => {
    const start = source.indexOf(`  ${name}(`);
    assert.ok(start >= 0);
    return source.slice(start, source.indexOf('\n  }', start) + 4);
  });
  const Viewport = new Function('cardViewportWidth', stripTypeScriptTypes(
    `class Viewport { ${methods.join('\n')} }`, { mode: 'transform' }) + '\nreturn Viewport;')(cardViewportWidth);
  const viewport = new Viewport();
  for (const [width, height, expectedWidth] of [[1600, 1000, 1472], [1000, 1600, 840], [412, 892, 412], [892, 412, 840]]) {
    const measures = [];
    const positions = [];
    const child = {
      measureResult: { width: 0, height: 0 },
      measure(constraint) {
        measures.push(constraint);
        this.measureResult = { width: constraint.maxWidth, height: constraint.maxHeight };
        return this.measureResult;
      },
      layout(position) { positions.push(position); },
    };
    const constraint = { minWidth: width, maxWidth: width, minHeight: height, maxHeight: height };
    const size = viewport.onMeasureSize({ width: 0, height: 0 }, [child], constraint);
    assert.deepEqual(size, { width, height });
    assert.deepEqual(measures, [{ minWidth: expectedWidth, maxWidth: expectedWidth, minHeight: height, maxHeight: height }]);
    viewport.onPlaceChildren(size, [child], constraint);
    assert.deepEqual(positions, [{ x: (width - expectedWidth) / 2, y: 0 }]);
  }
});

test('full-screen preview owns an opaque background and consumes background taps without blocking children', () => {
  const source = readFileSync(new URL('../../entry/src/main/ets/components/browser/卡片预览页.ets', import.meta.url), 'utf8');
  const build = source.slice(source.indexOf('\n  build()'));
  assert.match(build, /Stack\(\)\s*\{\s*\/\/[^\n]*\n\s*ThemeBackground\(\)/);
  const rootAttributes = build.slice(build.lastIndexOf(".backgroundColor($r('app.color.surface_page'))"));
  assert.match(rootAttributes, /hitTestBehavior\(HitTestMode.Default\)/,
    'Default admits descendants; Block disables every button and the Web');
  assert.match(rootAttributes, /\.onClick\(\(\): void => \{\}\)/,
    'background taps are consumed without dismissing preview');
  assert.doesNotMatch(build, /rgba\(/, 'no translucent dismiss layer behind the full-screen page');
  assert.equal((build.match(/\.transition\(/g) ?? []).length, 1, 'background and controls transition as one page');
});

test('narrow deck appearance drives page, deck-list and menu spacing from one density source', () => {
  const sizes = readFileSync(new URL('../../entry/src/main/ets/utils/应用尺寸.ets', import.meta.url), 'utf8');
  assert.match(sizes, /static 页面分组间距\(窄版: boolean\)/);
  assert.match(sizes, /return 窄版 \? 应用尺寸\.narrowPageSectionGap : 应用尺寸\.pageSectionGap/);
  assert.match(sizes, /static 页面内容顶部间距\(窄版: boolean\)/);
  assert.match(sizes, /static 页面底部间距\(窄版: boolean\)/);
  const home = readFileSync(new URL('../../entry/src/main/ets/pages/首页.ets', import.meta.url), 'utf8');
  const deckList = readFileSync(new URL('../../entry/src/main/ets/components/home/主页牌组列表.ets', import.meta.url), 'utf8');
  const menu = readFileSync(new URL('../../entry/src/main/ets/components/common/AnchoredMenu.ets', import.meta.url), 'utf8');
  for (const source of [home, deckList, menu]) assert.match(source, /DECK_LIST_NARROW_KEY/);
  assert.match(home, /页面分组间距\(this\.narrowDeckLayout\)/);
  assert.match(deckList, /页面分组间距\(this\.narrow\)/);
  assert.match(menu, /margin\(\{ top: this\.topOffset/);
  assert.doesNotMatch(menu, /effectiveTopOffset/);
});
