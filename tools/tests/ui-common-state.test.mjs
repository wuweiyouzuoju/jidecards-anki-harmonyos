// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadComponentLogic, loadPlatformModule } from './platform-module-harness.mjs';
import { PAGE_COMPACT_LAYOUT_KEY } from '../../entry/src/main/ets/model/AppLayoutState.ts';
import { APP_FOREGROUND_KEY } from '../../entry/src/main/ets/model/AppLifecycleState.ts';
import { DECK_LIST_NARROW_KEY } from '../../entry/src/main/ets/model/DeckListAppearance.ts';
import { THEME_MOTION_KEY } from '../../entry/src/main/ets/model/ThemeCatalog.ts';

const resource = key => key;
const dimensions = loadPlatformModule('utils/应用尺寸.ets', '应用尺寸', {});

test('generic state owners retain the existing preference and lifecycle keys', () => {
  assert.equal(PAGE_COMPACT_LAYOUT_KEY, DECK_LIST_NARROW_KEY);
  assert.equal(PAGE_COMPACT_LAYOUT_KEY, 'deckListNarrow');
  assert.equal(APP_FOREGROUND_KEY, 'appForeground');
  assert.equal(THEME_MOTION_KEY, 'themeMotion');
});

test('error state has no retry action until supplied and invokes the current host callback', () => {
  const ErrorState = loadComponentLogic('components/common/统一错误态.ets', '统一错误态', { $r: resource });
  const state = new ErrorState();
  assert.equal(state.onRetry, undefined);
  state.retry();
  let retries = 0;
  state.onRetry = () => retries++;
  state.retry();
  state.onRetry = () => { retries += 10; };
  state.retry();
  state.onRetry = undefined;
  state.retry();
  assert.equal(retries, 11);
  for (const [locale, expected] of [['base', ['加载中…', '重试']], ['en_US', ['Loading…', 'Retry']]]) {
    const strings = new Map(JSON.parse(readFileSync(new URL(
      `../../entry/src/main/resources/${locale}/element/string.json`, import.meta.url), 'utf8')).string
      .map(item => [item.name, item.value]));
    const Loading = loadComponentLogic('components/common/统一加载态.ets', '统一加载态', {
      应用尺寸: dimensions, $r: key => strings.get(key.split('.').at(-1))
    });
    const Error = loadComponentLogic('components/common/统一错误态.ets', '统一错误态', {
      $r: key => strings.get(key.split('.').at(-1))
    });
    assert.deepEqual([new Loading().文案, new Error().重试文案], expected);
    assert.equal(new Loading().尺寸, dimensions.加载指示器尺寸);
  }
});

test('form geometry and menu radius are independent of metric-card aliases', () => {
  const sizes = { ...dimensions, 圆角_指标卡: 99, 卡片高度: 300 };
  const layout = loadPlatformModule('utils/FormRowLayout.ets', 'FormRowLayout', { 应用尺寸: sizes });
  assert.equal(layout.gap, 12);
  assert.equal(layout.controlHeight, 40);
  assert.deepEqual(layout.trailingConstraint, { maxWidth: '56%' });
  assert.equal(sizes.noteMediaPreviewHeight, 204);
  const Surface = loadPlatformModule('components/common/MenuSurface.ets', 'MenuSurface', {
    应用尺寸: sizes, SurfaceBorder: { options: width => ({ width }) }, $r: resource, Color: { Transparent: 'transparent' }
  });
  const values = {}, attributes = {};
  for (const key of ['backgroundColor', 'borderRadius', 'border', 'shadow', 'clip']) {
    attributes[key] = value => { values[key] = value; return attributes; };
  }
  new Surface().applyNormalAttribute(attributes);
  assert.equal(values.borderRadius, 16);
});
