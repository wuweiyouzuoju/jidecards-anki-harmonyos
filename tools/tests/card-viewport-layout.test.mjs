// SPDX-License-Identifier: AGPL-3.0-or-later
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import test from 'node:test';
import { cardViewportWidth } from '../../entry/src/main/ets/model/CardViewportLayout.ts';
import { 应用尺寸 } from '../../entry/src/main/ets/utils/应用尺寸.ets';

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
    assert.doesNotMatch(source, /cardContentWidth/, 'no post-render width correction');
    assert.doesNotMatch(source, /CardViewport\([^\n]+\)\s*\.onAreaChange/,
      'toolbar bounds may observe the parent; card width remains owned by CardViewport measurement');
    assert.match(source, /borderRadius\(应用尺寸\.圆角_卡片\)/);
    assert.match(source, /border\(SurfaceBorder\.options\(\)\)/);
    assert.doesNotMatch(source, /border\(\{ width: 1\.5, color: \$r\('app.color.border_input'\)/);
    assert.doesNotMatch(source, /shadow\(ShadowStyle\.OUTER_DEFAULT_XS\)/);
  }
});

test('both whiteboard engines keep header and review button edges aligned with the card after rotation', () => {
  const study = readFileSync(new URL('../../entry/src/main/ets/pages/学习页.ets', import.meta.url), 'utf8');
  const review = study.slice(study.indexOf('private 答案条()'), study.indexOf('private cardViewportContent()'));
  const footerPadding = review.match(/\.padding\((\{[^]*?\})\)/)[1];
  for (const file of ['学习手写白板层.ets', 'StudyLocalWhiteboard.ets']) {
    const source = readFileSync(new URL(`../../entry/src/main/ets/components/${file}`, import.meta.url), 'utf8');
    const update = source.match(/this\.toolbarContentWidth = cardViewportWidth\(Number\(area\.width\), Number\(area\.height\)\);/);
    assert.ok(update, `${file}: observe the complete window, not the remaining canvas height`);
    assert.equal((source.match(/\.constraintSize\(\{ maxWidth: this\.toolbarContentWidth \}\)/g) ?? []).length, 2,
      `${file}: constrain both header and footer; the drawing canvas keeps its full width`);
    const headerPadding = source.match(/\.padding\((\{ left: 应用尺寸\.页面内边距_水平,[^]*?\})\)/)[1];
    const resize = new Function('cardViewportWidth', 'area', update[0]);
    const evaluate = (expression, state) => new Function('应用尺寸', `return ${expression}`).call(state, 应用尺寸);
    const state = {};
    for (const [width, height, contentWidth] of [[1000, 1600, 840], [1600, 1000, 1472], [412, 892, 412], [2560, 1440, 1600]]) {
      resize.call(state, cardViewportWidth, { width: String(width), height: String(height) });
      assert.equal(state.toolbarContentWidth, contentWidth);
      for (const narrow of [false, true]) {
        for (const statusBar of [0, 24]) {
          Object.assign(state, { narrowDeckLayout: narrow, statusBarHeight: statusBar, 状态栏高度: statusBar,
            toolbarSafeTop: statusBar, 导航条高度: statusBar });
          const header = evaluate(headerPadding, state), footer = evaluate(footerPadding, state);
          const inset = (width - contentWidth) / 2;
          assert.equal(inset + header.left, inset + footer.left);
          assert.equal(inset + header.right, inset + footer.right);
          assert.equal(inset + header.left, inset + 12, 'exactly one horizontal page padding');
          assert.equal(contentWidth - footer.left - footer.right, contentWidth - 24, 'show-answer width');
          assert.equal((contentWidth - footer.left - footer.right - 3 * 应用尺寸.间距_8) / 4,
            (contentWidth - 48) / 4, 'four equally sized rating buttons share the same bounds');
          assert.equal(header.top, 应用尺寸.pageToolbarTop(statusBar, narrow, statusBar));
          assert.equal(footer.bottom, 应用尺寸.操作区底部间距(narrow, statusBar));
        }
      }
    }
  }
});

test('whiteboard popups fit narrow windows and official header actions can wrap', () => {
  const official = readFileSync(new URL('../../entry/src/main/ets/components/学习手写白板层.ets', import.meta.url), 'utf8');
  const local = readFileSync(new URL('../../entry/src/main/ets/components/StudyLocalWhiteboard.ets', import.meta.url), 'utf8');
  const officialWidth = official.match(/\.width\((Math\.max\(0, Math\.min\(260,[^\n]+)\)\n/)[1];
  const localWidth = local.match(/\.width\((Math\.min\(320,[^\n]+)\)/)[1];
  for (const width of [240, 280, 320, 412, 1000]) {
    const state = { toolbarContentWidth: cardViewportWidth(width, 1600) };
    for (const expression of [officialWidth, localWidth]) {
      const popupWidth = new Function('应用尺寸', `return ${expression}`).call(state, 应用尺寸);
      assert.ok(popupWidth > 0 && popupWidth <= width - 24, 'popup keeps both horizontal edge gaps');
    }
  }
  const headerStart = official.indexOf('private officialCanvas()');
  const header = official.slice(headerStart, official.indexOf('StudyContentViewport(', headerStart));
  assert.match(header, /Flex\(\{ wrap: FlexWrap\.Wrap, justifyContent: FlexAlign\.SpaceBetween/);
  assert.doesNotMatch(header, /Blank\(\)\.layoutWeight/);
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
  for (const source of [home, menu]) assert.match(source, /PAGE_COMPACT_LAYOUT_KEY/);
  assert.match(deckList, /DECK_LIST_NARROW_KEY/);
  assert.match(home, /页面分组间距\(this\.narrowDeckLayout\)/);
  assert.match(deckList, /页面分组间距\(this\.narrow\)/);
  assert.match(menu, /margin\(\{ top: this\.menuGeometry\(\)\.top/);
  assert.match(menu, /safeMenuGeometry\(keyboardViewportHeight\(this\.viewportHeight, this\.viewportTop, this\.keyboardTop\), this\.topOffset, Math\.max\(0, this\.safeTop - this\.viewportTop\), this\.keyboardTop > 0 \? 0 : this\.safeBottom,\s*应用尺寸\.页面底部间距\(this\.narrowDeckLayout\)/);
  assert.doesNotMatch(menu, /effectiveTopOffset/);
});
