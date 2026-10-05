// SPDX-License-Identifier: AGPL-3.0-or-later
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { loadComponentLogic, loadPlatformModule } from './platform-module-harness.mjs';

const root = fileURLToPath(new URL('../../entry/src/main/ets/', import.meta.url));
const read = path => readFileSync(join(root, path), 'utf8');
function files(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? files(path) : path.endsWith('.ets') ? [path] : [];
  });
}

test('shared Select keeps short labels compact and bounds long names with ellipsis', () => {
  const style = read('utils/SelectStyle.ets');
  assert.match(style, /fieldWidth:\s*string\s*=\s*'auto'/);
  assert.doesNotMatch(style, /fieldWidth:\s*string\s*=\s*'50%'/);
  assert.match(style, /labelText\(\): TextModifier[\s\S]*?\.maxLines\(1\)[\s\S]*?\.textOverflow\(\{ overflow: TextOverflow\.Ellipsis \}\)/);
  assert.doesNotMatch(style.slice(style.indexOf('applyNormalAttribute(')), /\.textModifier\(/,
    'Select textModifier must be applied directly; ArkUI does not support it inside attributeModifier');
});

test('button, menu and selected item share a font size with one owner for each font', () => {
  class TextModifier {
    calls = [];
    maxLines(value) { this.calls.push(['maxLines', value]); return this; }
    textOverflow(value) { this.calls.push(['textOverflow', value]); return this; }
  }
  const SurfaceBorder = loadPlatformModule('utils/SurfaceBorder.ets', 'SurfaceBorder', {
    应用尺寸: { 卡片边框: 1 }, $r: key => key
  });
  const FormRowLayout = loadPlatformModule('utils/FormRowLayout.ets', 'FormRowLayout', {
    应用尺寸: { 间距_12: 12 }
  });
  const SelectStyle = loadPlatformModule('utils/SelectStyle.ets', 'SelectStyle', {
    TextModifier, FontWeight: { Normal: 400, Medium: 500 }, TextOverflow: { Ellipsis: 'ellipsis' },
    应用尺寸: { 字号_正文: 14, radiusLg: 16, 圆角_指标卡: 99 }, $r: key => key, SurfaceBorder, FormRowLayout
  });
  assert.equal(SelectStyle.controlFont.size, 14);
  assert.equal(SelectStyle.controlRadius, 16);
  assert.equal(SelectStyle.controlHeight, FormRowLayout.controlHeight);
  assert.equal(SelectStyle.fieldConstraint, FormRowLayout.trailingConstraint);
  assert.deepEqual(SelectStyle.fieldConstraint, { maxWidth: '56%' });
  assert.equal(SelectStyle.optionFont.size, SelectStyle.controlFont.size);
  assert.deepEqual(SelectStyle.selectedOptionFont, SelectStyle.controlFont);
  assert.deepEqual(SelectStyle.controlBorder, SurfaceBorder.options());
  assert.deepEqual(SelectStyle.labelText().calls,
    [['maxLines', 1], ['textOverflow', { overflow: 'ellipsis' }]]);
  const calls = [];
  const instance = new Proxy({}, { get: (_target, name) => (...args) => { calls.push([name, ...args]); return instance; } });
  const style = new SelectStyle('surface');
  style.applyNormalAttribute(instance);
  style.applyNormalAttribute(instance);
  assert.equal(calls.some(([name]) => /font$|fontSize|fontWeight|controlSize/i.test(name)), false,
    'diffed modifiers must not own or reset fonts when Select options are rebuilt');
});

// Native Select can restore system geometry after a selection. Every caller must
// declare geometry directly and reserve width independently of the current label.
// Device bounds before/after selection are the rendering acceptance check.
test('all native selects reserve layout space and directly reapply geometry', () => {
  const auditedPaths = new Set();
  for (const path of files(root)) {
    const source = readFileSync(path, 'utf8');
    for (const match of source.matchAll(/\bSelect\(/g)) {
      const end = source.indexOf('.onSelect(', match.index);
      assert.ok(end > match.index, `missing selection handler: ${path}`);
      const control = source.slice(match.index, end);
      assert.doesNotMatch(control.slice(7), /\bSelect\(/, `ambiguous Select boundary: ${path}`);
      for (const property of ['height', 'padding', 'space', 'font', 'borderRadius']) {
        assert.match(control, new RegExp(`\\.${property}\\(SelectStyle\\.control`), `${path}: ${property}`);
      }
      assert.match(control, /\.optionFont\(SelectStyle\.optionFont\)/, `missing menu font: ${path}`);
      assert.match(control, /\.selectedOptionFont\(SelectStyle\.selectedOptionFont\)/, `missing selected menu font: ${path}`);
      for (const property of ['font', 'optionFont', 'selectedOptionFont']) {
        assert.equal((control.match(new RegExp(`\\.${property}\\(`, 'g')) || []).length, 1,
          `duplicate font owner for ${property}: ${path}`);
      }
      assert.match(control, /\.(width|layoutWeight)\(/, `content-dependent width: ${path}`);
      assert.match(control, /\.textModifier\(SelectStyle\.labelText\(\)\)/, `missing shared ellipsis: ${path}`);
      assert.match(control, /\.border\(SelectStyle\.controlBorder\)/, `missing shared outline: ${path}`);
      if (control.includes('.width(SelectStyle.fieldWidth)')) {
        assert.match(control, /\.constraintSize\(SelectStyle\.fieldConstraint\)/, `unbounded field width: ${path}`);
      }
      auditedPaths.add(path.replaceAll('\\', '/'));
    }
  }
  // 共享表单减少原生节点；核对真实责任入口，不再要求散写节点数量。
  for (const owner of ['components/common/FormSelectRow.ets', 'components/settings/外观分组.ets']) {
    assert.ok([...auditedPaths].some(path => path.endsWith(owner)), `Select audit must include ${owner}`);
  }
});

test('browser subtitle choices share aligned theme selection and dismissal', () => {
  const menu = read('components/browser/BrowserMoreMenu.ets');
  const item = read('components/common/MenuItem.ets');
  const page = read('pages/浏览页.ets');
  assert.doesNotMatch(menu, /[✓✔]/);
  assert.match(item, /@Prop labelAlignment: TextAlign = TextAlign\.Center/);
  assert.match(item, /\.textAlign\(this\.labelAlignment\)/);
  assert.match(item, /this\.usesAccent\(\) \? this\.accent/);
  assert.match(item, /themeLabelGlyphs\(this\.label, this\.accentColors/);
  for (const index of [1, 4, 2]) {
    assert.match(read('model/AppInterface.ts'), new RegExp(`subtitleIndex === ${index}`));
    assert.match(menu, new RegExp(`this\\.onSubtitle\\(${index}\\)`));
  }
  assert.match(menu, /selected: item.selected/);
  assert.match(menu, /this\.onClose\(\)/);
  assert.match(page, /if \(this\.showMoreMenu\) \{ this\.showMoreMenu = false; return true; \}/);
  assert.match(page, /onSubtitle:[^\n]*this\.subtitleIndex = index; this\.showMoreMenu = false/);
});

test('menu rows retain optional centering while card menus align left with arrow clearance', () => {
  const dimensions = loadPlatformModule('utils/应用尺寸.ets', '应用尺寸', {});
  const MenuItem = loadComponentLogic('components/common/MenuItem.ets', 'AnchoredMenuItem', {
    应用尺寸: dimensions, TextAlign: { Center: 'center', Start: 'start' }, $r: key => key
  });
  const item = new MenuItem();
  item.icon = 'flag';
  assert.equal(item.hasCenteredIcon(), true, 'ordinary menus center the icon and label together');
  item.labelAlignment = 'start';
  assert.equal(item.hasCenteredIcon(), false, 'card and form rows start the icon and label together');
  assert.deepEqual(item.iconRowPadding(), { left: dimensions.menuHorizontalPadding, right: dimensions.menuHorizontalPadding });
  item.labelAlignment = 'center';
  assert.equal(item.hasCenteredIcon(), true);
  assert.deepEqual(item.labelPadding(), { left: 0, right: 0, top: 8, bottom: 8 });
  for (const disclosure of [false, true]) {
    item.disclosure = disclosure;
    const padding = item.iconRowPadding();
    const inset = padding.left;
    assert.equal(inset, disclosure ? dimensions.menuHorizontalPadding + 24 + dimensions.间距_8 : dimensions.menuHorizontalPadding);
    assert.equal(padding.right, inset, 'symmetric arrow clearance keeps the whole group centered');
    for (const width of [112, 176]) {
      for (const safeArea of [0, 24]) {
        const contentCenter = safeArea + inset + (width - 2 * inset) / 2;
        assert.equal(contentCenter, safeArea + width / 2);
      }
    }
  }
  item.icon = undefined;
  assert.equal(item.hasCenteredIcon(), false);
  const source = read('components/common/MenuItem.ets');
  assert.match(source, /Row\(\{ space: 应用尺寸\.间距_8 \}\)[\s\S]*?ActionIcon\([\s\S]*?this\.labelText\(\)/);
  assert.match(source, /\.justifyContent\(this\.labelAlignment === TextAlign.Center \? FlexAlign.Center : FlexAlign.Start\)/);
  assert.equal((source.match(/ActionIcon\(\{/g) || []).length, 1, 'all icon labels use one real Row, never a separate overlay');
  assert.doesNotMatch(source, /centerIconLabel|menuHorizontalPadding \+ 30/);
  const menu = read('components/common/CardActionMenu.ets');
  const rows = [...menu.matchAll(/AnchoredMenuItem\(\{([\s\S]*?)onSelect:/g)];
  assert.equal(rows.length, 1, 'one renderer serves every menu level');
  assert.ok(rows.every(row => row[1].includes('labelAlignment: TextAlign.Start')), 'root, marking and color rows align left');
  item.labelAlignment = 'start'; item.icon = 'flag'; item.disclosure = true;
  const padding = item.iconRowPadding();
  assert.equal(padding.left, dimensions.menuHorizontalPadding);
  assert.equal(padding.right, dimensions.menuHorizontalPadding + 24 + dimensions.间距_8,
    'reserve chevron geometry plus a real gap even when text wraps');
});

test('clear flag remains selected without accent text, rainbow glyphs or accent icon fill', () => {
  const AnchoredMenuItem = loadComponentLogic('components/common/MenuItem.ets', 'AnchoredMenuItem', {
    TextAlign: { Center: 'center' }, $r: key => key,
    颜色键: { 动作主色: 'accent' }, THEME_TEXT_COLORS_KEY: 'accentColors'
  });
  const item = new AnchoredMenuItem();
  item.selected = true;
  item.accentColors = ['#ff0000', '#0000ff'];
  assert.equal(item.usesAccent(), true, 'ordinary selected entries still use the active theme');
  item.selectionUsesAccent = false;
  assert.equal(item.usesAccent(), false);
  assert.equal(item.resolvedIconTint(), 'app.color.menu_icon_fill');
  assert.equal(item.selected, true);
  item.selectionUsesAccent = true;
  item.accent = '#2F5FD0';
  assert.equal(item.resolvedIconTint(), '#402F5FD0');
  item.iconTint = '#123456';
  assert.equal(item.resolvedIconTint(), '#123456');
  item.selected = false;
  assert.equal(item.usesAccent(), false);
  const source = read('components/common/MenuItem.ets');
  assert.match(source, /if \(this\.usesAccent\(\) && this\.accentColors\.length > 0\)/);
  assert.match(source, /\.fontColor\(this\.usesAccent\(\) \? this\.accent :[\s\S]*?app\.color\.text_primary/);
  assert.match(source, /ActionIcon\(\{ source: this\.icon, tint: this\.resolvedIconTint\(\) \}\)/);
  assert.match(read('components/common/ActionIcon.ets'), /\.fillColor\(this\.tint\)/);
});

test('shared menu surfaces distinguish dark overlays from cards and retain readable neutral labels', () => {
  const SurfaceBorder = loadPlatformModule('utils/SurfaceBorder.ets', 'SurfaceBorder', {
    应用尺寸: { 卡片边框: 1 }, $r: key => key
  });
  const MenuSurface = loadPlatformModule('components/common/MenuSurface.ets', 'MenuSurface', {
    应用尺寸: { 圆角_指标卡: 16, 卡片边框: 1 }, $r: key => key, Color: { Transparent: 'transparent' }, SurfaceBorder
  });
  const attributes = {};
  const instance = new Proxy({}, { get: (_target, name) => value => { attributes[name] = value; return instance; } });
  new MenuSurface().applyNormalAttribute(instance);
  assert.equal(attributes.backgroundColor, 'app.color.menu_surface');
  assert.deepEqual(attributes.border, { width: 1, color: 'app.color.surface_border' });
  assert.equal(attributes.shadow.color, 'app.color.menu_shadow');
  new MenuSurface(false).applyNormalAttribute(instance);
  assert.equal(attributes.backgroundColor, 'transparent');
  assert.equal(attributes.border.width, 0);
  assert.equal(attributes.clip, false);
  const luminance = hex => {
    const rgb = [1, 3, 5].map(offset => parseInt(hex.slice(offset, offset + 2), 16) / 255)
      .map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
    return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
  };
  const contrast = (left, right) => (Math.max(luminance(left), luminance(right)) + 0.05) /
    (Math.min(luminance(left), luminance(right)) + 0.05);
  for (const theme of ['base', 'dark']) {
    const palette = Object.fromEntries(JSON.parse(readFileSync(new URL(
      `../../entry/src/main/resources/${theme}/element/color.json`, import.meta.url), 'utf8')).color
      .map(entry => [entry.name, entry.value]));
    assert.ok(contrast(palette.text_primary, palette.menu_surface) >= 4.5, `${theme}: main text`);
    assert.ok(contrast(palette.text_secondary, palette.menu_surface) >= 4.5, `${theme}: disclosure arrows`);
    if (theme === 'dark') {
      assert.notEqual(palette.menu_surface, palette.surface_card);
      assert.ok(contrast(palette.surface_border, palette.menu_surface) >= 3, 'dark menu outline must be visible');
    }
  }
  assert.doesNotMatch(read('components/home/DeckPreviewScopeMenu.ets'), /new MenuSurface\(|\.border\(|\.shadow\(/,
    'the native popup owns the preview outline including its arrow');
  for (const path of ['components/home/HomeDeckDetails.ets', 'components/牌组详情面板.ets']) {
    assert.match(read(path), /popupColor: \$r\('app\.color\.menu_surface'\)/);
  }
});

test('browser uses one segmented frame and opens only the chosen option group', () => {
  const page = read('pages/浏览页.ets');
  const controls = page.slice(page.indexOf('private browserControls()'), page.indexOf('private browserContent()'));
  assert.equal((controls.match(/this\.viewChoice\(/g) || []).length, 3);
  assert.match(controls, /'mode'/);
  assert.match(controls, /'filter'/);
  assert.match(controls, /'sort'/);
  assert.match(controls, /id\('browser-view-selector'\)/);
  assert.match(controls, /layoutWeight\(7\)/);
  assert.match(controls, /resultCountLabel\(\)[\s\S]*layoutWeight\(3\)[\s\S]*TextAlign\.End/);
  assert.doesNotMatch(page, /\bSelect\(/);
  const search = read('components/browser/搜索框.ets');
  assert.match(search, /TextInput\(/);
  assert.doesNotMatch(search, /Select\(|onModeChange/);
  const menu = read('components/browser/BrowserViewMenu.ets');
  for (const group of ['mode', 'filter', 'sort']) assert.ok(menu.includes("this.group === '" + group + "'"));
  assert.doesNotMatch(menu, /expandedGroup|toggleGroup|disclosure:/);
  assert.match(menu, /menuWidth: this\.menuWidth/);
  assert.match(page, /menuWidth: this\.viewMenuWidth/);
  for (const [locale, label] of [['base', '默认'], ['en_US', 'Default']]) {
    const resources = JSON.parse(readFileSync(join(root, '../resources', locale, 'element/string.json'), 'utf8')).string;
    assert.equal(resources.find(item => item.name === 'browser_sort_default').value, label);
  }
});

test('sidebar sections share menu disclosure styling and keep expanded contents on the same surface', () => {
  const sidebar = read('components/browser/浏览侧边栏.ets');
  const header = read('components/common/MenuItem.ets');
  assert.equal((sidebar.match(/AnchoredMenuItem\(\{ label: \$r\('app.string.browser_sidebar_/g) || []).length, 3);
  assert.match(sidebar, /settings_clear_unused_tags'[^]*?this\.onClearUnusedTags\(\)/);
  for (const key of ['decks', 'tags', 'saved_searches']) {
    assert.match(sidebar, new RegExp(`browser_sidebar_${key}'[\\s\\S]*?expanded: !this\\.[^,]+,[\\s\\S]*?onToggle折叠\\('${key}'\\)`));
  }
  const rotation=header.match(/\.rotate\((\{[^\n]+\})\)/)?.[1];assert.ok(rotation);
  for(const [expanded,disclosureAngle,expected] of [[false,undefined,0],[true,undefined,90],[false,180,180],[true,0,0]]) {
    const options=new Function('return '+rotation).call({expanded,disclosureAngle});
    assert.equal(options.angle,expected);assert.equal(options.centerX,'50%');assert.equal(options.centerY,'50%');
  }
  assert.doesNotMatch(header,/\.translate\(/,'expansion must rotate around the fixed center without moving the chevron');
  const card=read('components/common/CardActionMenu.ets');
  const angle=card.match(/disclosureAngle: ([^,\n]+),/)?.[1];assert.ok(angle);
  for(const expandedIds of [[],['flag']])
    assert.equal(new Function('row','return '+angle).call({expandedIds},{depth:1,node:{id:'flag'}}),undefined,
      'flag expansion inherits the public row rotation instead of forcing a fixed angle');
  assert.equal((sidebar.match(/margin\(\{ bottom: 应用尺寸\.页面分组间距\(this\.narrowDeckLayout\) \}\)/g) || []).length, 3);
  assert.doesNotMatch(sidebar, /折叠图标|分区标题\(/);
});
