import { popupAppearance } from '../../entry/src/main/ets/components/common/PopupAppearance.ts';
import { materialHarness } from './surface-material-harness.mjs';
// SPDX-License-Identifier: AGPL-3.0-or-later
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { stripTypeScriptTypes } from 'node:module';
import { loadComponentLogic, loadPlatformModule } from './platform-module-harness.mjs';

const root = fileURLToPath(new URL('../../entry/src/main/ets/', import.meta.url));
const read = path => readFileSync(join(root, path), 'utf8');

test('restored custom batch limits remain the selected option instead of highlighting 1000', () => {
  const path = 'components/settings/AIAgent设置分组.ets';
  const Settings = loadComponentLogic(path, 'AIAgent设置分组', {
    DEEPSEEK_PROVIDER: { defaultModel: 'deepseek-chat' }, OPENAI_PROVIDER: { defaultModel: 'gpt-4' }
  });
  // Execute the actual row properties, including its callback, rather than duplicating the index formula.
  const binding = read(path).match(/FormSelectRow\(\{ label: settingsItemText\(this\.getUIContext\(\), 'ai_batch_limit'[\s\S]*?\}\s*\}\)/)[0];
  const props = binding.slice(binding.indexOf('{'), binding.lastIndexOf(')'));
  const getProps = new Function('settingsItemText', stripTypeScriptTypes('const props = ' + props + ';', { mode: 'transform' }) + 'return props;');
  for (const saved of [1, 37, 100, 250, 500, 999, 1000]) {
    const settings = new Settings();
    settings.getUIContext = () => ({});
    settings.batchLimit = saved;
    settings.ready = true; settings.loading = false; settings.webState.busy = false;
    const row = getProps.call(settings, () => 'batch limit');
    assert.equal(row.value, String(saved));
    assert.equal(row.options[row.selectedIndex]?.value, row.value, 'restored ' + saved);
    assert.deepEqual(row.options.map(option => Number(option.value)), [...new Set([100, 250, 500, 1000, saved])].sort((a, b) => a - b));
    for (const invalid of [-1, row.options.length, 0.5, NaN, Infinity]) row.onSelect(invalid);
    assert.equal(settings.batchLimit, saved);
    const target = row.options.findIndex(option => option.value === '500');
    row.onSelect(target); assert.equal(settings.batchLimit, 500);
    settings.loading = true; row.onSelect(0); assert.equal(settings.batchLimit, 500, 'late disabled callback is ignored');
  }
});

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
    应用尺寸: { 间距_12: 12, 间距_8: 8, 间距_4: 4 }
  });
  const SelectStyle = loadPlatformModule('utils/SelectStyle.ets', 'SelectStyle', {
    ...materialHarness(),
    TextModifier, FontWeight: { Normal: 400, Medium: 500 }, TextOverflow: { Ellipsis: 'ellipsis' },
    应用尺寸: { 字号_正文: 14, radiusLg: 16, 圆角_指标卡: 99 }, $r: key => key, SurfaceBorder, FormRowLayout
  });
  assert.equal(SelectStyle.controlFont.size, 14);
  assert.equal(SelectStyle.controlRadius, 16);
  assert.equal(SelectStyle.controlHeight, FormRowLayout.controlHeight);
  for (const scale of [1, 2, 3.2]) {
    assert.equal(SelectStyle.controlHeightFor({ px2vp: px => px / 2, fp2px: fp => fp * 2 * scale }),
      Math.max(FormRowLayout.controlHeight, Math.ceil(14 * scale) + 16));
  }
  assert.equal(FormRowLayout.rowGap, 8);
  assert.equal(FormRowLayout.hintGap, 4);
  assert.equal(SelectStyle.fieldConstraint, FormRowLayout.trailingConstraint);
  assert.deepEqual(SelectStyle.fieldConstraint, { maxWidth: '56%' });
  assert.equal(SelectStyle.optionFont.size, SelectStyle.controlFont.size);
  assert.deepEqual(SelectStyle.selectedOptionFont, SelectStyle.controlFont);
  assert.deepEqual(SelectStyle.controlBorder, SurfaceBorder.options());
  assert.deepEqual(SelectStyle.labelText().calls,
    [['maxLines', 1], ['textOverflow', { overflow: 'ellipsis' }]]);
  const calls = [];
  const instance = new Proxy({}, { get: (_target, name) => (...args) => { calls.push([name, ...args]); return instance; } });
  const style = new SelectStyle('flat','surface');
  style.applyNormalAttribute(instance);
  style.applyNormalAttribute(instance);
  assert.equal(calls.some(([name]) => /font$|fontSize|fontWeight|controlSize/i.test(name)), false,
    'diffed modifiers must not own or reset fonts when Select options are rebuilt');
  assert.equal(calls.find(([name]) => name === 'selectedOptionFontColor')[1], SelectStyle.selectedOptionColor);
  assert.equal(calls.find(([name]) => name === 'selectedOptionBgColor')[1], SelectStyle.selectedOptionSurface);
});

test('directory and settings selectors delegate the value trigger to the same unboxed control', () => {
  const source = read('components/common/DirectorySelect.ets');
  assert.match(source, /FormSelectRow\(\{[\s\S]*useCustomControl: true/);
  assert.match(source, /SelectionValueButton\(\{ value: this.value, label: this.label/);
  assert.match(read('components/common/SurfaceSelect.ets'), /SelectionValueButton\(\{ value: this.valueText\(\), label: this.label/);
  const Trigger=loadComponentLogic('components/common/SelectionValueButton.ets','SelectionValueButton',{SelectStyle:{}});
  const button=new Trigger();let opens=0;button.onAction=()=>opens++;
  button.activate();assert.equal(opens,1);button.isInteractive=false;button.activate();assert.equal(opens,1);
  const trigger=read('components/common/SelectionValueButton.ets');
  assert.match(trigger,/backgroundColor\(Color.Transparent\).border\(\{ width: 0 \}\).borderRadius\(0\)/);
  assert.match(trigger,/textOverflow\(\{ overflow: TextOverflow.Ellipsis \}\)/);
  assert.doesNotMatch(trigger,/shadow\(|backgroundBlurStyle|SeriesVisual/);
  const SelectStyle = {selectedOptionFont:{weight:500},optionFont:{weight:400}};
  const Tree = read('components/common/DirectoryTree.ets');
  assert.match(Tree, /backgroundColor\(Color.Transparent\)/);
  assert.match(Tree, /row.selection === 1 \? this.accent/);
  const font = Tree.slice(Tree.indexOf('Text(row.name)')).match(/\.fontWeight\(([^)]+)\)/)[1];
  for (const selection of [0, 1, 2]) {
    assert.equal(new Function('row', 'SelectStyle', 'return ' + font).call({ selectionMode: 'single' },
      { selection }, SelectStyle), selection === 1 ? 500 : 400);
  }
});

// 所有枚举委托共同入口，防止新页面重新散写平台选择框。
test('all enum controls use the shared selector while hierarchy selectors retain directories', () => {
  let shared = 0;
  for (const path of files(root)) {
    const source = readFileSync(path, 'utf8');
    assert.doesNotMatch(source, /\bSelect\s*\(/, `native selector bypasses shared layout: ${path}`);
    shared += (source.match(/SurfaceSelect\(/g) ?? []).length;
  }
  assert.ok(shared >= 16);
  assert.match(read('components/common/SurfaceSelect.ets'), /SelectionOptions\(/);
  assert.match(read('components/common/SurfaceSelect.ets'), /radius:12/);
  assert.match(read('components/common/SelectionDialog.ets'), /SelectionOptions\(/);
  assert.match(read('components/common/DirectorySelect.ets'), /SelectionValueButton\(/);
  const appearance = read('components/settings/外观分组.ets');
  assert.equal((appearance.match(/FormSelectRow\(/g) ?? []).length, 2);
  assert.match(appearance, /showValuePreview: true,\s*valuePreview: \(\): void => \{ this\.themeSwatch\(\); \}/);
});

test('browser subtitle choices share aligned theme selection and dismissal', () => {
  const menu = read('components/browser/BrowserMoreMenu.ets');
  const item = read('components/common/MenuItem.ets');
  const page = read('pages/浏览页.ets');
  assert.doesNotMatch(menu, /[✓✔]/);
  assert.match(item, /@Prop labelAlignment: TextAlign = TextAlign\.Start/);
  assert.match(item, /\.textAlign\(this\.labelAlignment\)/);
  assert.match(item, /this\.usesAccent\(\) \? this\.accent/);
  assert.match(item, /themeLabelGlyphs\(this\.label, this\.accentColors/);
  for (const index of [1, 4, 2]) {
    assert.match(read('model/AppInterface.ts'), new RegExp(`subtitleIndex === ${index}`));
    assert.match(menu, new RegExp(`this\\.onSubtitle\\(${index}\\)`));
  }
  assert.match(menu, /selected: item.selected/);
  assert.match(menu, /this\.onClose\(\)/);
  assert.match(page, /if \(this\.showMoreMenu\) \{ this\.moreBackRequest\+\+; return true; \}/);
  assert.match(page, /onSubtitle:[^\n]*this\.subtitleIndex = index; this\.showMoreMenu = false/);
});

test('menu rows retain optional centering while card menus align left with arrow clearance', () => {
  const dimensions = loadPlatformModule('utils/应用尺寸.ets', '应用尺寸', {});
  const MenuItem = loadComponentLogic('components/common/MenuItem.ets', 'AnchoredMenuItem', {
    应用尺寸: dimensions, TextAlign: { Center: 'center', Start: 'start' }, $r: key => key
  });
  const item = new MenuItem();
  item.icon = 'flag';
  assert.equal(item.hasCenteredIcon(), false, 'ordinary menus align left like enum choices');
  item.labelAlignment = 'start';
  assert.equal(item.hasCenteredIcon(), false, 'card and form rows start the icon and label together');
  assert.deepEqual(item.iconRowPadding(), { left: dimensions.menuHorizontalPadding, right: dimensions.menuHorizontalPadding });
  item.labelAlignment = 'center';
  assert.equal(item.hasCenteredIcon(), true);
  assert.deepEqual(item.labelPadding(), { left: 0, right: 0, top: 8, bottom: 8 });
  for (const disclosure of [false, true]) {
    item.disclosure = disclosure;
    const padding = item.iconRowPadding();
    assert.equal(padding.left, dimensions.menuHorizontalPadding);
    assert.equal(padding.right, dimensions.menuHorizontalPadding, 'centered icon-label groups keep symmetric insets regardless of disclosure');
    const labelWidth = dimensions.cardActionGroupWidth - padding.left - padding.right - 24 - dimensions.间距_8;
    assert.ok(labelWidth >= 4 * dimensions.字号_正文, 'flag branches fit the complete four-character title beside the icon and disclosure');
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
  assert.ok(rows.every(row => row[1].includes('labelAlignment: TextAlign.Center')), 'root, marking and color rows center their icon-label groups');
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
  const PopupSurface=loadPlatformModule('components/common/PopupSurface.ets','PopupSurface',{popupAppearance,SurfaceBorder,AppStorage:{get:()=>undefined},Color:{Transparent:'transparent'},BlurStyle:{NONE:'none'}});
  const MenuSurface = loadPlatformModule('components/common/MenuSurface.ets', 'MenuSurface', {
    ...materialHarness(), PopupSurface,
    应用尺寸: { 圆角_指标卡: 16, 卡片边框: 1 }, $r: key => key, Color: { Transparent: 'transparent' }, SurfaceBorder
  });
  const attributes = {};
  const instance = new Proxy({}, { get: (_target, name) => value => { attributes[name] = value; return instance; } });
  new MenuSurface().applyNormalAttribute(instance);
  assert.equal(attributes.backgroundColor, popupAppearance('flat',false).fill);
  assert.deepEqual(attributes.border, SurfaceBorder.options());
  assert.equal(attributes.shadow.radius, 0, 'flat menus use the shared border without elevation');
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
  assert.match(read('components/home/HomeDeckDetails.ets'), /AnchoredMenu\(\{[\s\S]*this\.previewScopes\(\)/);
  assert.match(read('components/common/AnchoredMenu.ets'), /surfaceVisible: this\.surfaceVisible/);
  assert.match(read('components/common/AnchoredMenu.ets'), /surfaceVisible: boolean = true/);
  for (const path of ['components/home/HomeDeckDetails.ets', 'components/牌组详情面板.ets']) {
    assert.doesNotMatch(read(path), /bindPopup\(/, 'preview menus share the verified menu surface');
  }
});

test('browser composes three shared triggers under the plain title and uses one selection dialog', () => {
  const page = read('pages/浏览页.ets');
  const controls = page.slice(page.indexOf('private browserControls()'), page.indexOf('private browserContent()'));
  assert.equal((controls.match(/this\.viewChoice\(/g) || []).length, 3);
  assert.doesNotMatch(controls, /browserWidth [<>]=? 600/);
  assert.match(controls, /'mode'/);
  assert.match(controls, /'filter'/);
  assert.match(controls, /'sort'/);
  assert.doesNotMatch(controls, /browser-view-selector|layoutWeight\([37]\)/);
  assert.match(controls, /ChangingText\([\s\S]*?resultCountLabel\(\),\s*textSize: 应用尺寸\.字号_正文_小, alignment: TextAlign\.Start, fillWidth: true \}\)\.width\('100%'\)/);
  const title = page.slice(page.indexOf('private 顶部条()'), page.indexOf('private quickFilterOptions('));
  assert.doesNotMatch(title, /viewChoice/);
  assert.match(title, /app.string.browser_title/);
  const trigger = page.slice(page.indexOf('private viewChoice(group:'), page.indexOf('private browserControls()'));
  assert.match(trigger, /按下态按钮\(\{[\s\S]*disclosure: true/);
  assert.doesNotMatch(trigger, /\bButton\(|DisclosureChevron\(/);
  assert.doesNotMatch(page, /\bSelect\(/);
  const search = read('components/browser/搜索框.ets');
  assert.match(search, /TextInput\(/);
  assert.doesNotMatch(search, /Select\(|onModeChange/);
  const menu = read('components/browser/BrowserViewMenu.ets');
  for (const group of ['mode', 'filter', 'sort']) assert.ok(menu.includes("this.group === '" + group + "'"));
  assert.doesNotMatch(menu, /expandedGroup|toggleGroup|disclosure:/);
  assert.doesNotMatch(menu, /AnchoredMenu\(/);
  assert.match(menu, /DialogFrame\([\s\S]*this\.selectionHeader\(\)/);
  assert.match(menu, /DialogHeader\(\{ title: this.group === 'mode'/);
  assert.doesNotMatch(menu, /showActionLabel: true/);
  assert.match(menu, /按下态按钮\(\{ 文案: \$r\('app.string.browser_sort_ascending'\)/);
  assert.doesNotMatch(page, /recordViewAnchor|placeViewMenu|selected: this.browserFilterActive\(\)/);
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
  const angle=card.match(/disclosureAngle: ([\s\S]*?),\n\s*onSelect:/)?.[1];assert.ok(angle);
  for(const right of [false,true]) for(const expandedIds of [[],['flag']])
    assert.equal(new Function('row','return '+angle).call({expandedIds,groupsOnRight:()=>right},{depth:1,node:{id:'flag'}}),expandedIds.includes('flag')?(right?180:0):90,
      'lateral flags animate from folded-down toward their actual overlay');
  assert.equal((sidebar.match(/margin\(\{ bottom: 应用尺寸\.页面分组间距\(this\.narrowDeckLayout\) \}\)/g) || []).length, 3);
  assert.doesNotMatch(sidebar, /折叠图标|分区标题\(/);
});


test('study more uses the measured toolbar edge without applying a second wide-screen inset',()=>{
 const Menu=loadComponentLogic('components/common/CardActionMenu.ets','CardActionMenu',{应用尺寸:{compactMenuWidth:168}});
 const menu=new Menu();menu.totalWidth=()=>320;menu.viewportWidth=1000;menu.viewportLeft=40;menu.safeLeft=0;
 assert.equal(menu.toolbarLeft(),undefined);
 menu.toolbarRight=970;assert.equal(menu.toolbarLeft()+320+menu.viewportLeft,970);
 menu.safeRight=60;assert.equal(menu.toolbarLeft()+320+menu.viewportLeft,970);
 menu.toolbarRight=1200;assert.equal(menu.toolbarLeft()+320,1000);
 menu.toolbarRight=20;assert.equal(menu.toolbarLeft(),0);
 const study=read('pages/学习页.ets');
 assert.match(study,/studyMoreRight = Number\(area.globalPosition.x\) \+ Number\(area.width\)/);
 assert.match(study,/toolbarRight: this.studyMoreRight/);
});


test('selector arrow follows actual popup placement and closes perpendicular to that direction', () => {
  const {selectionPopupAngle, selectionClosedAngle} = loadPlatformModule('components/common/SelectionMenuLayout.ts',
    '({selectionPopupAngle, selectionClosedAngle})', {});
  const trigger={left:200,top:300,width:80,height:44};
  for (const [popup,angle] of [
    [{left:120,top:350,width:160,height:140},90],
    [{left:120,top:150,width:160,height:140},-90],
    [{left:290,top:260,width:160,height:140},0],
    [{left:30,top:260,width:160,height:140},180]]) {
    assert.equal(selectionPopupAngle(trigger,popup),angle);
    assert.equal(selectionClosedAngle(angle),Math.abs(angle)===90?0:90);
  }
});


test('ordinary selector measures its value width before laying out the two-line trigger',()=>{
 const Select=loadComponentLogic('components/common/SurfaceSelect.ets','SurfaceSelect',{
  SelectStyle:{controlFont:{size:15,weight:500},controlPadding:{left:12,right:0},controlSpace:8},
  WINDOW_HEIGHT_KEY:'h',WINDOW_SAFE_TOP_KEY:'t',WINDOW_SAFE_BOTTOM_KEY:'b'
 });
 const select=new Select();let measured='';
 select.getUIContext=()=>({px2vp:px=>px/2,getMeasureUtils:()=>({measureText:({textContent})=>{measured=textContent;return textContent.length*20;}})});
 for(const value of ['蓝','4000 Essential English Words v2::Book 1']) {
  select.value=value;assert.equal(select.valueWidth(),value.length*10+44);assert.equal(measured,value);
 }
});
