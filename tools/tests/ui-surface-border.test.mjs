// SPDX-License-Identifier: AGPL-3.0-or-later
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';
import { loadPlatformModule, loadComponentLogic } from './platform-module-harness.mjs';
import { CARD_FLAGS, browserRowFlag } from '../../entry/src/main/ets/model/CardMarking.ts';
import { BrowserRowColor } from '../../entry/src/main/ets/proto/messages/SearchMessages.ts';
import { 对比度 } from '../../entry/src/main/ets/model/色阶生成.ets';

const root = new URL('../../entry/src/main/ets/', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');
const SurfaceBorder = loadPlatformModule('utils/SurfaceBorder.ets', 'SurfaceBorder', {
  应用尺寸: { 卡片边框: 1 }, $r: key => key
});

test('menu, panel and button outlines share defaults while explicit state colors retain their geometry', () => {
  assert.deepEqual(SurfaceBorder.options(), { width: 1, color: 'app.color.surface_border' });
  assert.deepEqual(SurfaceBorder.options(0), { width: 0, color: 'app.color.surface_border' });
  assert.deepEqual(SurfaceBorder.options(2, '#ff0000'), { width: 2, color: '#ff0000' });
  assert.deepEqual(SurfaceBorder.options({ bottom: 0.5 }), {
    width: { bottom: 0.5 }, color: 'app.color.surface_border'
  }, 'separators preserve their single edge and thickness');
  const first = SurfaceBorder.options();
  first.color = '#000000';
  assert.equal(SurfaceBorder.options().color, 'app.color.surface_border', 'one control cannot change another outline');
  assert.deepEqual(Object.keys(SurfaceBorder.options()).sort(), ['color', 'width'], 'surface geometry and press state stay with the host');
});

test('the real menu surface applies the shared outline and preserves its custom radius', () => {
  const MenuSurface=loadPlatformModule('components/common/MenuSurface.ets','MenuSurface',{
    应用尺寸:{卡片边框:1,radiusLg:18},SurfaceBorder,$r:key=>key,Color:{Transparent:'transparent'}
  });
  for(const active of [true,false]) {
    const attrs={},calls=[];
    const instance=Object.fromEntries(['backgroundColor','border','borderRadius','shadow','clip'].map(name=>
      [name,value=>{calls.push(name);attrs[name]=value;return instance;}]));
    new MenuSurface(active).applyNormalAttribute(instance);
    assert.deepEqual(attrs.border,SurfaceBorder.options(active?1:0));
    assert.equal(attrs.borderRadius,18);
    assert.ok(calls.indexOf('border')<calls.indexOf('borderRadius'),'border defaults must not override the explicit radius');
    assert.equal(attrs.backgroundColor,active?'app.color.menu_surface':'transparent');
    assert.equal(attrs.clip,active);assert.equal(attrs.shadow.radius,active?12:0);
  }
});

test('dark outlines remain distinct on menu, card, page and sidebar backgrounds', () => {
  const palette = Object.fromEntries(JSON.parse(readFileSync(new URL(
    '../../entry/src/main/resources/dark/element/color.json', import.meta.url), 'utf8')).color.map(item => [item.name, item.value]));
  for (const surface of ['menu_surface', 'surface_card', 'surface_page', 'surface_sidebar']) {
    assert.ok(对比度(palette.surface_border, palette[surface]) >= 3, surface);
  }
});

test('browser result cards keep a complete outline with and without a flag stripe', () => {
  const Table = loadComponentLogic('components/browser/卡片表格.ets', '卡片表格', {
    CARD_FLAGS, browserRowFlag, SurfaceBorder, 应用尺寸: { 卡片边框: 1 }
  });
  const table = new Table();
  for (const color of [BrowserRowColor.COLOR_DEFAULT, BrowserRowColor.COLOR_MARKED,
    BrowserRowColor.COLOR_SUSPENDED, BrowserRowColor.COLOR_BURIED]) {
    assert.deepEqual(table.rowBorder({ color }), SurfaceBorder.options(), 'no flag must not remove the outline');
  }
  const flagColors = [BrowserRowColor.COLOR_FLAG_RED, BrowserRowColor.COLOR_FLAG_ORANGE,
    BrowserRowColor.COLOR_FLAG_GREEN, BrowserRowColor.COLOR_FLAG_BLUE, BrowserRowColor.COLOR_FLAG_PINK,
    BrowserRowColor.COLOR_FLAG_TURQUOISE, BrowserRowColor.COLOR_FLAG_PURPLE];
  for (const color of flagColors) {
    const flag = CARD_FLAGS[browserRowFlag(color)];
    const border = table.rowBorder({ color });
    assert.deepEqual(border.width, { top: 1, right: 1, bottom: 1, left: 4 });
    assert.deepEqual(border.color, { top: SurfaceBorder.color(), right: SurfaceBorder.color(),
      bottom: SurfaceBorder.color(), left: flag.color });
  }
  assert.match(read('components/browser/卡片表格.ets'), /\.border\(this\.rowBorder\(行\)\)/);
});

test('ordinary outlines, form controls and separators use the common border instead of old faint resources', () => {
  for (const file of readdirSync(root, { recursive: true }).filter(file => file.endsWith('.ets'))) {
    assert.doesNotMatch(read(file.replaceAll('\\', '/')),
      /\$r\('app\.color\.(?:border_subtle|border_input|divider)'\)/,
      file + ': neutral outlines and separators must use SurfaceBorder');
  }
  for (const file of ['components/牌组详情面板.ets', 'components/DeckStudyHistoryCard.ets',
    'components/home/HomeDeckDetails.ets', 'components/common/DialogFrame.ets',
    'components/common/MenuSurface.ets', 'utils/PrimaryGlassSurface.ets', 'utils/FormInputStyle.ets',
    'utils/FormTextAreaStyle.ets', 'utils/ImageSurfaceStyle.ets', 'components/settings/设置分组卡片.ets']) {
    assert.match(read(file), /\.border\(SurfaceBorder\.options\(/, file);
  }
  assert.match(read('utils/GlassSurface.ets'),/outline: BorderOptions = SurfaceBorder\.options\(\)/);
  assert.match(read('utils/GlassSurface.ets'),/\.border\(this\.outline\)/);
  const deck = read('components/牌组列表项.ets');
  for(const name of ['主菜单','色条菜单']) {
    const start=deck.indexOf(`  private ${name}() {`);assert.ok(start>=0,name);
    const menu=deck.slice(start,deck.indexOf('\n  }',start)+4);
    assert.match(menu,/\.attributeModifier\(new MenuSurface\(\)\)/,name+': the owning surface draws the outline');
  }
  assert.match(read('components/home/DeckReparentFeature.ets'),/DialogFrame\(\{/,'hierarchy changes use the shared dialog surface');
  assert.equal((deck.match(/popupColor: \$r\('app\.color\.menu_surface'\)/g) ?? []).length, 2, 'native arrow backgrounds match');
});
