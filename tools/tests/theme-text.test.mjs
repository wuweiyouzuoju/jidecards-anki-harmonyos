import { compileWithUiFeedback } from './ui-feedback-harness.mjs';
// SPDX-License-Identifier: AGPL-3.0-or-later
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { themeDefinition, GLASS_HIGHLIGHT_COLORS, GLASS_DARK_COLORS } from '../../entry/src/main/ets/model/ThemeCatalog.ts';
import { 对比度 } from '../../entry/src/main/ets/model/色阶生成.ets';

const read = path => readFileSync(new URL('../../entry/src/main/ets/' + path, import.meta.url), 'utf8');
const source = read('components/common/ThemeText.ets');
const js = stripTypeScriptTypes(source.replace(/^import .*$/gm, '').replace(/^@Builder$/gm, '').replace(/^export /gm, ''), { mode: 'transform' });
const spans = [];
const api = compileWithUiFeedback('Span', 'ForEach', js + '\nreturn { themeLabelCharacters, themeAccentRampColor, themeLabelGlyphs, ThemeTextSpans };')(
  text => { const item = { text }; spans.push(item); return { fontColor: color => { item.color = color; } }; },
  (items, build) => items.forEach(build)
);
const context = { getHostContext: () => ({ resourceManager: { getStringSync: (id, ...args) => {
  assert.equal(id, 99);
  assert.deepEqual(args, ['课程', 12]);
  return '课程：12张';
} } }) };

test('theme labels retain localized substitutions, emoji and single-text reading order', () => {
  assert.deepEqual(api.themeLabelCharacters('新建🎨牌组', context), ['新', '建', '🎨', '牌', '组']);
  const resource = { id: 99, params: ['app.string.test', '课程', 12] };
  assert.equal(api.themeLabelCharacters(resource, context).join(''), '课程：12张');
  spans.length = 0;
  api.ThemeTextSpans(resource, [], context);
  assert.deepEqual(spans, [{ text: resource }], 'plain themes retain native resource handling and inherited font colors');
});

test('shared label renderer ramps between two catalog colors with readable light and dark results', () => {
  const theme = themeDefinition('iridescent');
  for (const [colors, background] of [[theme.lightActionColors, '#FFFFFF'], [theme.darkActionColors, '#18202B']]) {
    spans.length = 0;
    api.ThemeTextSpans('新建牌组', colors, context);
    const painted = spans.map(span => span.color);
    assert.deepEqual(spans.map(span => span.text).join(''), '新建牌组');
    assert.equal(painted[0], colors[0], 'ramp starts at the first catalog color');
    assert.equal(painted[painted.length - 1], colors[1], 'ramp ends at the adjacent catalog color');
    assert.equal(new Set(painted).size, painted.length, 'each glyph advances the ramp instead of repeating a palette cycle');
    for (const color of painted) {
      assert.ok(!colors.slice(2).includes(color), `${color} must not jump to a non-adjacent hue`);
      assert.ok(对比度(color, background) >= 4.5, color);
    }
    spans.length = 0;
    api.ThemeTextSpans('评论', colors, context);
    assert.deepEqual(spans.map(span => span.color), [colors[0], colors[0]], 'labels under three glyphs stay single-color');
    assert.equal(api.themeAccentRampColor(0, 4, colors), colors[0]);
    assert.equal(api.themeAccentRampColor(3, 4, colors), colors[1]);
  }
  assert.match(read('utils/颜色主题管理器.ets'), /THEME_TEXT_COLORS_KEY, 是否深色 \? visual.darkActionColors : visual.lightActionColors/);
  assert.match(read('components/common/DialogHeader.ets'), /!this.destructive && this.themeAccentColors.length > 0/);
  assert.match(read('components/stats/范围切换条.ets'), /Select\(this\.options\(\)\)/);
});

test('theme text identity changes with its color and create-deck draws spans in its owning component', () => {
  assert.doesNotMatch(source, /colors\[index % colors\.length\]/, 'per-character palette cycling must not come back');
  assert.match(source, /\$\{index\}-\$\{glyph\.letter\}-\$\{glyph\.color\}/);
  const button = read('components/common/按下态按钮.ets');
  assert.match(button, /ForEach\(themeLabelGlyphs\(this\.文案, this\.themeAccentColors, this\.getUIContext\(\)\)/);
  assert.doesNotMatch(button, /ThemeTextSpans\(/, 'button colors must not be snapshotted by a value-parameter builder');
  assert.match(read('components/common/DialogHeader.ets'), /ForEach\(themeLabelGlyphs\(this\.actionLabel, this\.themeAccentColors/);
  assert.doesNotMatch(button, /index % this\.themeAccentColors\.length/);
  assert.match(read('components/home/主页顶部工具栏.ets'), /create_deck'[\s\S]*?themeText: true/);
});

test('data text stays single-color so times, counts and numbers never enter the ramp', () => {
  assert.match(read('pages/学习提醒页.ets'), /ThemeTextSpans\(this\.格式化时间\(项\.小时, 项\.分钟\), \[\], this\.getUIContext\(\)\)/);
  assert.match(read('components/home/主页摘要分页.ets'), /ThemeTextSpans\(`\$\{Math\.round\(this\.图表快照!\.记忆率\)\}%`, \[\], this\.getUIContext\(\)\)/);
  assert.match(read('components/设置面板.ets'), /ThemeTextSpans\(this\.QQ群号, \[\], this\.getUIContext\(\)\)/);
  assert.match(read('components/云端牌组弹窗.ets'), /ThemeTextSpans\(\$r\('app\.string\.cloud_deck_qq_group_entry', '726837065'\), \[\], this\.getUIContext\(\)\)/);
  const welcome = read('components/欢迎弹窗.ets');
  assert.doesNotMatch(welcome, /themeAccentColors/);
  assert.match(welcome, /Span\(欢迎弹窗\.QQ群号\)\s*\.fontColor\(this\.动作主色\)/);
  assert.match(welcome, /Span\('ankiweb\.net\/shared\/decks'\)\s*\.fontColor\(this\.动作主色\)/);
});

test('glass deck selection exposes the existing background without opacity on its text or live blur', () => {
  const deck = read('components/牌组列表项.ets');
  assert.match(deck, /this.visual.selectedColors.length > 0 \? Color.Transparent : this.选中背景色/);
  assert.match(deck, /this.visual.selectedColors.length > 0 \? '#80FFFFFF' : this.主色边框色/);
  assert.doesNotMatch(deck, /backdropBlur|backgroundBlurStyle|\.opacity\(/);
  for (const color of themeDefinition('iridescent').selectedColors) {
    assert.equal(color.length, 9);
    assert.ok(parseInt(color.slice(1, 3), 16) >= 128 && parseInt(color.slice(1, 3), 16) < 230, 'glass is substantial but still translucent');
  }
  for (const key of ['新卡计数色', '学习中计数色', '复习中计数色']) assert.ok(deck.includes(`.fontColor(this.${key})`));
});

test('glass press surfaces share the deck material without a live backdrop filter', () => {
  const glassJs = stripTypeScriptTypes(read('utils/GlassSurface.ets').replace(/^import .*$/gm, '').replace(/^export /gm, ''), { mode: 'transform' });
  const GlassSurface = compileWithUiFeedback('themeGradient', '应用尺寸', 'Color', '$r', glassJs + '\nreturn GlassSurface;')(
    colors => colors.map((color, index) => [color, index / Math.max(1, colors.length - 1)]),
    { 卡片边框: 1 }, { Transparent: 'transparent' }, name => name
  );
  const state = {};
  const target = {};
  for (const name of ['backgroundColor', 'linearGradient', 'backdropBlur', 'border']) {
    target[name] = value => { state[name] = value; return target; };
  }
  for (const colors of [GLASS_HIGHLIGHT_COLORS, GLASS_DARK_COLORS]) {
    new GlassSurface(true, colors).applyNormalAttribute(target);
    assert.equal(state.backgroundColor, 'transparent');
    assert.deepEqual(state.linearGradient.colors.map(stop => stop[0]), colors);
    assert.equal(state.backdropBlur, undefined);
    assert.equal(state.border.color, '#80FFFFFF');
    new GlassSurface(false, colors).applyNormalAttribute(target);
    assert.equal(state.backgroundColor, 'app.color.surface_card');
    assert.equal(state.backdropBlur, undefined);
    assert.equal(state.linearGradient.colors.length, 0);
  }
  assert.deepEqual(themeDefinition('iridescent').selectedColors, GLASS_HIGHLIGHT_COLORS);
  for (const path of ['components/common/按下态按钮.ets', 'components/牌组详情面板.ets', 'components/StudyActionButton.ets', 'components/学习浮动工具栏.ets']) {
    assert.match(read(path), /attributeModifier\(new GlassSurface\(/, path);
  }
});
