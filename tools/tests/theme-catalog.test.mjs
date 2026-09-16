// SPDX-License-Identifier: AGPL-3.0-or-later
import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { THEME_CATALOG, availableThemes, isThemeAvailable, themeDefinition, themeForContent, themePrimaryGlass } from '../../entry/src/main/ets/model/ThemeCatalog.ts';
import { isSupportedContent } from '../../entry/src/main/ets/model/Redemption.ts';
import { contents } from '../redemption-issuer.mjs';
import { 解析主题色板 } from '../../entry/src/main/ets/model/颜色主题.ets';
import { 对比度 } from '../../entry/src/main/ets/model/色阶生成.ets';

const read = path => readFileSync(new URL('../../' + path, import.meta.url), 'utf8');

test('primary glass text stays readable for every theme in both appearances', () => {
  for (const theme of THEME_CATALOG) for (const dark of [false, true]) {
    const palette = 解析主题色板(theme.id, dark);
    const glass = themePrimaryGlass(theme, dark);
    const labels = (dark ? theme.darkActionColors : theme.lightActionColors);
    for (const material of [...glass.colors, ...glass.pressedColors]) {
      const alpha = parseInt(material.slice(1, 3), 16) / 255;
      const backdrop = dark ? '#18202B' : '#FFFFFF';
      let background = '#';
      for (let offset = 1; offset < 7; offset += 2) {
        background += Math.round(parseInt(material.slice(offset + 2, offset + 4), 16) * alpha
          + parseInt(backdrop.slice(offset, offset + 2), 16) * (1 - alpha)).toString(16).padStart(2, '0');
      }
      for (const label of labels.length > 0 ? labels : [palette.动作主色]) {
        assert.ok(对比度(label, background) >= 4.5, `${theme.id} dark=${dark} ${label} on ${background}`);
      }
    }
  }
});

test('start study and both show-answer layouts use persistent theme glass', () => {
  for (const path of ['pages/学习页.ets', 'components/学习浮动工具栏.ets', 'components/开始学习按钮.ets']) {
    const source = read('entry/src/main/ets/' + path);
    assert.match(source, /@StorageProp\(PRIMARY_GLASS_KEY\)/, path);
    assert.match(source, /attributeModifier\(new PrimaryGlassSurface\(/, path);
  }
  const theme = themeDefinition('iridescent');
  assert.ok(new Set(themePrimaryGlass(theme, false).colors).size >= 3);
  assert.equal(new Set(THEME_CATALOG.map(theme => themePrimaryGlass(theme, false).colors.join(','))).size, THEME_CATALOG.length);
  for (const entry of THEME_CATALOG) for (const dark of [true, false]) {
    const glass = themePrimaryGlass(entry, dark);
    assert.ok(glass.colors.length >= 2);
    assert.notDeepEqual(glass.colors, glass.pressedColors);
    for (const color of glass.colors) assert.match(color, /^#D6[\da-f]{6}$/i);
    for (const color of glass.pressedColors) assert.match(color, /^#E6[\da-f]{6}$/i);
  }
});

test('registered themes have unique identities, localized names and valid renderer assets', () => {
  assert.equal(new Set(THEME_CATALOG.map(theme => theme.id)).size, THEME_CATALOG.length);
  const paid = THEME_CATALOG.filter(theme => theme.requiredContent);
  assert.equal(new Set(paid.map(theme => theme.requiredContent)).size, paid.length);
  for (const locale of ['base', 'en_US']) {
    const labels = new Map(JSON.parse(read(`entry/src/main/resources/${locale}/element/string.json`)).string.map(item => [item.name, item.value]));
    for (const theme of THEME_CATALOG) assert.ok(labels.get('theme_color_' + theme.id), theme.id);
  }
  for (const theme of THEME_CATALOG) {
    assert.match(theme.seed, /^#[0-9A-Fa-f]{6}$/);
    assert.ok(theme.backgroundTextures.length === 0 || theme.backgroundTextures.length === 3);
    assert.ok(Number.isFinite(theme.backgroundCycleMs) && theme.backgroundCycleMs > 0);
    for (const texture of theme.backgroundTextures) {
      assert.ok(existsSync(new URL('../../entry/src/main/resources/rawfile/' + texture, import.meta.url)), texture);
    }
  }
  assert.deepEqual(contents.map(content => content.id), paid.map(theme => theme.requiredContent));
});

test('theme selection and redemption use the same entitlement mapping', () => {
  assert.equal(availableThemes([]).length, 7);
  assert.equal(isThemeAvailable('iridescent', []), false);
  assert.equal(isThemeAvailable('iridescent', ['unrelated-content']), false);
  assert.equal(isThemeAvailable('iridescent', ['theme-iridescent']), true);
  assert.equal(themeForContent(''), undefined);
  assert.equal(themeForContent('unknown'), undefined);
  assert.equal(themeForContent('theme-iridescent').id, 'iridescent');
  assert.equal(themeDefinition('missing').id, 'aurora');
  // An additional registered theme needs no new selection or protocol branches.
  const extra = { ...themeDefinition('aurora'), id: 'test-extra', requiredContent: 'theme-test-extra' };
  THEME_CATALOG.push(extra);
  try {
    assert.equal(isSupportedContent(extra.requiredContent), true);
    assert.equal(isThemeAvailable(extra.id, []), false);
    assert.equal(availableThemes([extra.requiredContent]).includes(extra.id), true);
    assert.equal(availableThemes([extra.requiredContent]).includes('iridescent'), false);
    assert.equal(themeForContent(extra.requiredContent), extra);
  } finally { THEME_CATALOG.pop(); }
});

test('navigation owns one persistent background outside route content', () => {
  const home = read('entry/src/main/ets/pages/首页.ets');
  assert.match(home, /build\(\)\s*\{\s*Stack\(\)\s*\{\s*ThemeBackground\(\{ transitionActive: this\.backgroundTransitionActive \}\)\s*Navigation\(this\.页面栈\)/);
  assert.equal(home.match(/ThemeBackground\(/g).length, 1);
  assert.doesNotMatch(home, /onNavBarStateChange|homeVisible/);
  const pages = readdirSync(new URL('../../entry/src/main/ets/pages/', import.meta.url)).filter(name => name.endsWith('.ets') && name !== '首页.ets');
  for (const name of pages) {
    const source = read('entry/src/main/ets/pages/' + name);
    assert.doesNotMatch(source, /(?:Iridescent|Theme)Background\(/, name);
    if (source.includes('NavDestination()')) {
      assert.match(source, /\.hideTitleBar\(true\)\s*\.backgroundColor\(Color\.Transparent\)/, name);
    }
  }
  assert.doesNotMatch(read('entry/src/main/ets/components/设置面板.ets'), /(?:Iridescent|Theme)Background\(/);
});
