import { loadPlatformModule } from './platform-module-harness.mjs';
import { compileWithUiFeedback } from './ui-feedback-harness.mjs';
// SPDX-License-Identifier: AGPL-3.0-or-later
import assert from 'node:assert/strict';
import { motionApi } from './motion-harness.mjs';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { themeTextWrappers, cachedThemeText } from './theme-text-harness.mjs';
import { themeDefinition, GLASS_HIGHLIGHT_COLORS, GLASS_DARK_COLORS } from '../../entry/src/main/ets/model/ThemeCatalog.ts';
import { 对比度 } from '../../entry/src/main/ets/model/色阶生成.ets';

const read = path => readFileSync(new URL('../../entry/src/main/ets/' + path, import.meta.url), 'utf8');
const source = read('components/common/ThemeText.ets');
const js = stripTypeScriptTypes(source.replace(/^import .*$/gm, '').replace(/^@Builder$/gm, '').replace(/^export /gm, ''), { mode: 'transform' });
const spans = [];
const api = compileWithUiFeedback('Span', 'ForEach', js + '\nreturn { themeTextKey, themeLabelCharacters, themeAccentRampColor, themeLabelGlyphs, ThemeTextSpans, ThemeHighlightedTextSpans, themeHighlightedParts };')(
  text => { const item = { text }; spans.push(item); return { fontColor: color => { item.color = color; } }; },
  (items, build) => items.forEach(build)
);
const context = { getHostContext: () => ({ resourceManager: { getStringSync: (id, ...args) => {
  assert.equal(id, 99);
  assert.deepEqual(args, ['课程', 12]);
  return '课程：12张';
} } }) };

function refreshHarness(path, locals = {}, index = 0) {
  const translations = Object.fromEntries(['zh-Hans', 'en'].map(locale => [locale,
    new Map(JSON.parse(readFileSync(new URL(`../../entry/src/main/resources/${locale === 'en' ? 'en_US' : 'base'}/element/string.json`, import.meta.url), 'utf8'))
      .string.map(item => [item.name, item.value]))]));
  const host = { uiLanguage: 'zh-Hans', 系统语言: 'zh-Hans', themeAccentColors: themeDefinition('iridescent').lightActionColors };
  host.getUIContext = () => ({ getHostContext: () => ({ resourceManager: { getStringSync: id => {
    assert.ok(translations[host.uiLanguage].has(id), id);
    return translations[host.uiLanguage].get(id);
  } } }) });
  const $r = name => ({ id: name.slice('app.string.'.length), params: [name] });
  const wrappers = themeTextWrappers(read(path));
  assert.ok(wrappers[index], path);
  return { host, view: cachedThemeText(wrappers[index], api, spans, $r, locals), translations };
}

test('custom study and parent-deck selection release the old accent without repainting siblings', () => {
  const presets = [2, 3, 4].map(字段号 => ({ 字段号, 标题资源: `preset ${字段号}` }));
  const views = presets.map(预设 => refreshHarness('components/home/自定义学习对话框.ets', { 预设 }).view);
  const host = refreshHarness('components/home/自定义学习对话框.ets', { 预设: presets[0] }).host;
  host.选中预设 = 2;
  const draft = host.draft = { value: '12' };
  for (const selected of [2, 3, 4, 2]) {
    host.选中预设 = selected;
    views.forEach((view, index) => {
      const result = view.render(host);
      assert.equal(result.some(span => span.color !== undefined), presets[index].字段号 === selected);
      assert.equal(result.map(span => span.text).join(''), presets[index].标题资源);
    });
  }
  assert.equal(host.draft, draft, 'only text children are rebuilt');
  const { host: parent, view } = refreshHarness('components/创建牌组面板.ets', { id: '42', label: 'Parent deck' });
  for (const id of ['42', '99', '42']) {
    parent.parentId = id;
    assert.equal(view.render(parent).some(span => span.color !== undefined), id === '42');
  }
});

test('restore-trash text follows busy/empty transitions and light/dark/theme palettes', () => {
  const { host, view } = refreshHarness('components/settings/媒体管理面板.ets');
  host.回收站有内容 = true; host.处理中 = false;
  const light = view.render(host);
  assert.equal(light[0].color, host.themeAccentColors[0]);
  const builds = view.builds();
  host.themeAccentColors = [...host.themeAccentColors]; view.render(host);
  assert.equal(view.builds(), builds, 'equivalent palettes retain the same text node');
  host.themeAccentColors = themeDefinition('iridescent').darkActionColors;
  assert.equal(view.render(host)[0].color, host.themeAccentColors[0]);
  for (const [hasTrash, busy] of [[true, true], [false, false], [true, false]]) {
    host.回收站有内容 = hasTrash; host.处理中 = busy;
    assert.equal(view.render(host).some(span => span.color !== undefined), hasTrash && !busy);
  }
  host.themeAccentColors = [];
  assert.ok(view.render(host).every(span => span.color === undefined), 'ordinary themes inherit the owner color');
});

test('dynamic action labels and plain percentage refresh under the same locale', () => {
  for (const [path, property, resourceKeys] of [
    ['components/添加笔记面板.ets', '高级已展开', ['add_note_advanced', 'add_note_advanced_hide']],
    ['components/settings/空卡列表面板.ets', 'selectedAll', ['empty_cards_select_all', 'empty_cards_deselect_all']]
  ]) {
    const { host, view, translations } = refreshHarness(path);
    host.全选状态 = () => host.selectedAll;
    for (const flag of [false, true, false]) {
      host[property] = flag;
      assert.equal(view.render(host).map(span => span.text).join(''), translations['zh-Hans'].get(resourceKeys[Number(flag)]));
    }
    host.uiLanguage = 'en';
    assert.equal(view.render(host).map(span => span.text).join(''), translations.en.get(resourceKeys[0]));
  }
  const { host, view } = refreshHarness('components/home/主页摘要分页.ets');
  for (const value of [88.1, 92.4, 92.49, 88.1]) {
    host.图表快照 = { 记忆率: value };
    assert.deepEqual(view.render(host), [{ text: `${Math.round(value)}%` }]);
  }
  assert.equal(view.builds(), 3, 'an unchanged displayed percentage retains its text children');
});

test('status, assistant results and highlighted help titles refresh without remounting the owner', () => {
  const sync = refreshHarness('components/同步面板.ets', {}, 2);
  for (const text of ['done', 'uploaded', 'done']) {
    sync.host.state = { 状态文案: text };
    assert.equal(sync.view.render(sync.host).map(span => span.text).join(''), text);
  }
  const ctx = { message: { 批次结果: 'first batch' } };
  const assistant = refreshHarness('pages/AI制卡页.ets', { ctx }, 1);
  for (const text of ['first batch', 'second batch']) {
    ctx.message.批次结果 = text;
    assert.equal(assistant.view.render(assistant.host).map(span => span.text).join(''), text);
  }
  const { host, view } = refreshHarness('components/common/HelpLabel.ets');
  host.title = 'Use Iridescent'; host.highlightLabel = 'Iridescent'; host.highlightColors = host.themeAccentColors;
  assert.equal(view.render(host).filter(span => span.color !== undefined).map(span => span.text).join(''), 'Iridescent');
  host.title = 'About Iridescent'; host.highlightLabel = 'About';
  assert.equal(view.render(host).filter(span => span.color !== undefined).map(span => span.text).join(''), 'About');
  host.highlightColors = [];
  assert.deepEqual(view.render(host), [{ text: host.title }]);
});

test('theme text keys preserve formatting arguments and separate locale, text, palette and highlight', () => {
  const resource = { id: 99, params: ['app.string.test', '课程', 12] };
  assert.equal(api.themeTextKey(resource, [], context, 'zh'), api.themeTextKey('课程：12张', [], context, 'zh'));
  const baseline = api.themeTextKey('a,b', ['#112233'], context, 'en', 'b');
  for (const [label, colors, locale, highlight] of [
    ['a,b', [], 'en', 'b'], ['a,b', ['#112233'], 'zh', 'b'],
    ['a', ['#112233'], 'en', 'b'], ['a,b', ['#112233'], 'en', 'a']
  ]) assert.notEqual(api.themeTextKey(label, colors, context, locale, highlight), baseline);
});

test('Iridescent names share the create-deck ramp while prose and group numbers keep their inherited color', () => {
  const theme = themeDefinition('iridescent');
  for (const colors of [theme.lightActionColors, theme.darkActionColors]) {
    const title = '获赠【幻彩】，QQ群 726837065，使用【幻彩】';
    spans.length = 0;
    api.ThemeHighlightedTextSpans(title, '【幻彩】', colors, context);
    assert.equal(spans.map(span => span.text).join(''), title);
    const painted = spans.filter(span => span.color !== undefined);
    assert.equal(painted.length, 8);
    assert.deepEqual(painted.slice(0, 4).map(x => x.color), api.themeLabelGlyphs('新建牌组', colors, context).map(x => x.color));
    assert.deepEqual(painted.slice(4).map(x => x.color), painted.slice(0, 4).map(x => x.color));
    assert.ok(spans.find(span => span.text.includes('726837065')).color === undefined);
    assert.deepEqual(api.themeHighlightedParts('plain text', '【幻彩】', context), [{text: 'plain text', highlighted: false}]);
  }
  const resource = {id: 99, params: ['app.string.test', '课程', 12]};
  for (const [highlight, colors] of [['', theme.lightActionColors], ['【幻彩】', []]]) {
    spans.length = 0;
    api.ThemeHighlightedTextSpans(resource, highlight, colors, context);
    assert.deepEqual(spans, [{text: resource}], 'default titles retain native resource handling');
  }
});

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
  assert.match(button, /ForEach\(themeLabelGlyphs\(this\.文案, this\.themeAccentColors, this\.getUIContext\(\), this\.uiLanguage\)/);
  assert.doesNotMatch(button, /ThemeTextSpans\(/, 'button colors must not be snapshotted by a value-parameter builder');
  assert.match(read('components/common/DialogHeader.ets'), /ForEach\(themeLabelGlyphs\(this\.actionLabel, this\.themeAccentColors/);
  assert.doesNotMatch(button, /index % this\.themeAccentColors\.length/);
  assert.match(read('components/home/主页顶部工具栏.ets'), /deck_reorder_done'[\s\S]*?themeText: true/);
  assert.match(read('components/home/HomeSummaryHeader.ets'), /IconActionButton\(\{ toolbarStyle: true, source: \$r\('app.media.ic_home_new'\), label: \$r\('app.string.create_deck'\)[\s\S]*?onAction: this.onCreate/);
});

test('data text stays single-color so times, counts and numbers never enter the ramp', () => {
  assert.match(read('pages/学习提醒页.ets'), /ThemeTextSpans\(this\.格式化时间\(项\.小时, 项\.分钟\), \[\], this\.getUIContext\(\)\)/);
  assert.match(read('components/home/主页摘要分页.ets'), /ThemeTextSpans\(`\$\{Math\.round\(this\.图表快照!\.记忆率\)\}%`, \[\], this\.getUIContext\(\)\)/);
  assert.match(read('components/settings/AboutSettings.ets'), /ThemeTextSpans\(this\.QQ群号, \[\], this\.getUIContext\(\)\)/);
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

test('glass presses preserve the backing and geometry, reset on release/disable, and isolate siblings', () => {
  const deps = { Color: { Transparent: 'transparent' }, $r: name => name, 应用尺寸: { 卡片边框: 1 } };
  const themePressGradient = loadPlatformModule('utils/ThemeVisuals.ets', 'themePressGradient', deps);
  const PressFeedback = loadPlatformModule('utils/PressFeedback.ets', 'PressFeedback', motionApi());
  const SurfaceBorder = loadPlatformModule('utils/SurfaceBorder.ets', 'SurfaceBorder', deps);
  const GlassSurface = loadPlatformModule('utils/GlassSurface.ets', 'GlassSurface', { ...deps, themePressGradient, PressFeedback, SurfaceBorder });
  const PrimaryGlassSurface = loadPlatformModule('utils/PrimaryGlassSurface.ets', 'PrimaryGlassSurface', { ...deps, themePressGradient, PressFeedback, SurfaceBorder });
  const target = () => {
    const state = {}, node = {};
    for (const key of ['backgroundColor', 'linearGradient', 'border', 'opacity', 'scale']) {
      node[key] = value => { state[key] = structuredClone(value); return node; };
    }
    return { state, node };
  };
  for (const colors of [GLASS_HIGHLIGHT_COLORS, GLASS_DARK_COLORS, ['#FFCC00'], [], themeDefinition('iridescent').selectedColors]) {
    for (const surface of [new GlassSurface(colors), new GlassSurface(colors, '#E9F7EE'), new PrimaryGlassSurface({ pressedColors: colors })]) {
      const a = target(), b = target();
      surface.applyNormalAttribute(a.node); surface.applyNormalAttribute(b.node);
      const normal = structuredClone(a.state);
      assert.deepEqual(normal.border, SurfaceBorder.options(), 'primary and ordinary glass share the visible outline');
      // Rapid down/up/cancel cycles never remove the backing, alter geometry or affect another button.
      for (let cycle = 0; cycle < 6; cycle++) {
        surface.applyPressedAttribute(a.node);
        assert.equal(a.state.backgroundColor, normal.backgroundColor);
        assert.equal(a.state.opacity, 0.72, 'feedback remains visible even on white-on-white glass');
        assert.deepEqual(a.state.border, normal.border);
        assert.deepEqual(a.state.linearGradient.colors.map(stop => stop[1]), normal.linearGradient.colors.map(stop => stop[1]));
        if (colors.length > 0) assert.deepEqual(a.state.linearGradient.colors.map(stop => stop[0]), colors);
        assert.deepEqual(b.state, normal);
        surface.applyNormalAttribute(a.node);
        assert.deepEqual(a.state, normal);
      }
      surface.applyPressedAttribute(a.node); surface.applyDisabledAttribute(a.node);
      assert.deepEqual(a.state, { ...normal, opacity: 0.4 }, 'disabling a held button clears the press tint');
      assert.ok(normal.linearGradient.colors.every(stop => stop[0] === 'transparent' || stop[0].startsWith('#00')));
    }
  }
  const outline=SurfaceBorder.options(2,'#00ACC1');
  const choice=new GlassSurface(GLASS_HIGHLIGHT_COLORS,'app.color.surface_card',outline);
  const selected=target();
  for(const method of ['applyNormalAttribute','applyPressedAttribute','applyDisabledAttribute']) {
    choice[method](selected.node);
    assert.deepEqual(selected.state.border,outline,'pressing or disabling keeps the selected outline');
    assert.equal(selected.state.backgroundColor,'app.color.surface_card');
  }
  for (const path of ['utils/GlassSurface.ets', 'utils/PrimaryGlassSurface.ets']) {
    assert.doesNotMatch(read(path), /backdropBlur|setTimeout|animateTo|\.animation\(/);
  }
});
