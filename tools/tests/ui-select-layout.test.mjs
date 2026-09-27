// SPDX-License-Identifier: AGPL-3.0-or-later
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = fileURLToPath(new URL('../../entry/src/main/ets/', import.meta.url));
const read = path => readFileSync(join(root, path), 'utf8');
function files(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? files(path) : path.endsWith('.ets') ? [path] : [];
  });
}

test('shared Select width is content-sized instead of reserving half the row', () => {
  const style = read('utils/SelectStyle.ets');
  assert.match(style, /fieldWidth:\s*string\s*=\s*'auto'/);
  assert.doesNotMatch(style, /fieldWidth:\s*string\s*=\s*'50%'/);
});

// Native Select can restore system geometry after a selection. Every caller must
// declare geometry directly and reserve width independently of the current label.
// Device bounds before/after selection are the rendering acceptance check.
test('all native selects reserve layout space and directly reapply geometry', () => {
  let count = 0;
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
      assert.match(control, /\.(width|layoutWeight)\(/, `content-dependent width: ${path}`);
      count++;
    }
  }
  // Deck tone selection is a text disclosure menu rather than a native Select.
  assert.ok(count >= 26, 'the application-wide Select audit must not silently miss callers');
});

test('browser subtitle choices share aligned theme selection and dismissal', () => {
  const menu = read('components/browser/BrowserMoreMenu.ets');
  const item = read('components/common/MenuItem.ets');
  const page = read('pages/浏览页.ets');
  assert.doesNotMatch(menu, /[✓✔]/);
  assert.match(item, /\.textAlign\(TextAlign\.Center\)/);
  assert.match(item, /this\.selected \? this\.accent/);
  assert.match(item, /themeLabelGlyphs\(this\.label, this\.accentColors/);
  for (const index of [1, 4, 2]) {
    assert.match(menu, new RegExp(`selected: this\\.subtitleIndex === ${index},[\\s\\S]*?this\\.onSubtitle\\(${index}\\)`));
  }
  assert.match(menu, /this\.onClose\(\)/);
  assert.match(page, /if \(this\.showMoreMenu\) \{ this\.showMoreMenu = false; return true; \}/);
  assert.match(page, /onSubtitle:[^\n]*this\.subtitleIndex = index; this\.showMoreMenu = false/);
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
  assert.equal((sidebar.match(/AnchoredMenuItem\(\{/g) || []).length, 3);
  for (const key of ['decks', 'tags', 'saved_searches']) {
    assert.match(sidebar, new RegExp(`browser_sidebar_${key}'[\\s\\S]*?expanded: !this\\.[^,]+,[\\s\\S]*?onToggle折叠\\('${key}'\\)`));
  }
  assert.match(header, /\.rotate\(\{ angle: this\.expanded \? 90 : 0 \}\)/);
  assert.equal((sidebar.match(/margin\(\{ bottom: 应用尺寸\.页面分组间距\(this\.narrowDeckLayout\) \}\)/g) || []).length, 3);
  assert.doesNotMatch(sidebar, /折叠图标|分区标题\(/);
});
