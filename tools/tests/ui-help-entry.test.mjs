// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';

const root = new URL('../../entry/src/main/ets/', import.meta.url);
const read = file => readFileSync(new URL(file, root), 'utf8').replaceAll('\r\n', '\n');
function method(file, name, state, bindings = {}) {
  const source = read(file);
  const start = source.search(new RegExp(`^  (?:private )?${name}\\(`, 'm'));
  assert.notEqual(start, -1, `${file}: ${name}`);
  const open = source.indexOf('{', start);
  let end = open + 1, depth = 1;
  for (; depth; end++) {
    if (source[end] === '{') depth++;
    if (source[end] === '}') depth--;
  }
  const code = stripTypeScriptTypes(`class Host { ${source.slice(start, end)} }`, { mode: 'transform' });
  const Host = new Function(...Object.keys(bindings), `${code}; return Host;`)(...Object.values(bindings));
  return Object.assign(new Host(), state);
}

function hasScatteredIcon(source) {
  const code = source.replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\\u(?:\{([a-f\d]+)\}|([a-f\d]{4}))/gi, (_, a, b) => String.fromCodePoint(parseInt(a || b, 16)));
  return /app\.string\.field_help_button|sys\.symbol\.(?:info_circle|questionmark_circle)|\b(?:Button|Text)\s*\(\s*(['"])(?:ⓘ|ℹ️?|[?？])\1\s*\)/u.test(code);
}

test('help scan rejects old resource, literal, escaped and alternative symbol copies', () => {
  for (const source of ["Text('ⓘ')", "Text('ℹ️')", "Button('?')", String.raw`Text('\u24d8')`,
    "ThemeTextSpans($r('app.string.field_help_button'))", "SymbolGlyph($r('sys.symbol.info_circle'))"]) {
    assert.equal(hasScatteredIcon(source), true, source);
  }
  assert.equal(hasScatteredIcon('// ⓘ\nHelpLabel({ title: resource })'), false);
});

test('every ArkTS help entry shares the icon, and labelled help cannot float to the trailing edge', () => {
  let callers = 0;
  for (const path of readdirSync(root, { recursive: true }).filter(p => p.endsWith('.ets'))) {
    const file = path.replaceAll('\\', '/'), source = read(file);
    if (file !== 'components/common/HelpButton.ets') assert.equal(hasScatteredIcon(source), false, file);
    if (source.includes('HelpButton({')) {
      assert.ok(['components/common/HelpLabel.ets', 'components/browser/卡片表格.ets'].includes(file),
        `${file}: labels must use HelpLabel; the card-info action alone belongs at the row end`);
      assert.doesNotMatch(source, /HelpButton\(\{[\s\S]*?\}\)\s*\.(?:width|height|padding|margin|offset|scale)\(/);
    }
    if (source.includes('HelpLabel({')) callers++;
  }
  assert.ok(callers > 0);
  const label = read('components/common/HelpLabel.ets');
  assert.match(label, /Text\(this.title\)[\s\S]*?flexShrink\(1\)[\s\S]*?HelpButton\(/);
  assert.doesNotMatch(label, /Blank\(|layoutWeight\(|margin\(|padding\(|Row\(\{/);
  assert.match(label, /alignItems\(VerticalAlign.Center\)/);
  // ArkUI wraps a custom component in a Common node. Centering that wrapper
  // alone leaves a content-sized Row at its leading edge (the reported bug).
  assert.match(label, /\.width\(this\.centered \? '100%' : undefined\)/);
  assert.match(label, /justifyContent\(this\.centered \? FlexAlign\.Center : FlexAlign\.Start\)/);
});

test('help icon geometry, accessibility, press effect and click isolation have one owner', () => {
  const button = read('components/common/HelpButton.ets');
  const glyph = Number(button.match(/\.fontSize\('(\d+)vp'\)/)[1]);
  const [, width, height] = button.match(/\.width\((\d+)\)\.height\((\d+)\)/).map(Number);
  assert.equal(glyph, 18); assert.equal(width, 44); assert.equal(height, 44);
  assert.equal((width - glyph) / 2, 13);
  assert.match(button, /padding\(0\)/);
  assert.match(button, /flexShrink\(0\)/);
  assert.match(button, /monopolizeEvents\(true\)/);
  assert.match(button, /accessibilityText\(this.accessibilityLabel\(\)\)/);
  assert.match(button, /accessibilityDescription\(/);
  assert.match(button, /enabled\(this.isHelpEnabled\)/);
  assert.doesNotMatch(button, /HitTestMode.Block/);
});

test('settings section height belongs to the actual title row, not its invisible custom wrapper', () => {
  const group = read('components/settings/设置分组卡片.ets');
  const label = read('components/common/HelpLabel.ets');
  assert.match(group, /HelpLabel\(\{[^}]*minRowHeight: 44/);
  assert.doesNotMatch(group, /constraintSize\(\{ minHeight: 44 \}\)/);
  assert.match(label, /@Prop minRowHeight: number = 0/);
  assert.match(label, /\.constraintSize\(\{ minHeight: this.minRowHeight \}\)\s*\.alignItems\(VerticalAlign.Center\)/);
  // This guards the actual Row/wrapper ownership; device layout is verified separately.
  assert.doesNotMatch(label, /\.height\(44\)/, 'large titles may grow beyond the minimum');
});

test('disabled help never invokes the owner; enabled clicks invoke it exactly once', () => {
  let calls = 0;
  const button = method('components/common/HelpButton.ets', 'activate', {
    isHelpEnabled: false, onHelp() { calls++; }
  });
  button.activate(); assert.equal(calls, 0);
  button.isHelpEnabled = true; button.activate(); assert.equal(calls, 1);
  button.isHelpEnabled = false; button.activate(); assert.equal(calls, 1);
});

test('note help reads the current resource and Back preserves all draft fields', () => {
  const draft = ['front', 'back'];
  let exitRequests = 0;
  const page = method('pages/添加笔记页.ets', '打开帮助', {
    fieldValues: draft, requestExit: () => { exitRequests++; }
  });
  page.打开帮助('type A', 'help A');
  page.打开帮助('type B', 'help B');
  assert.equal(page.帮助标题, 'type B'); assert.equal(page.帮助正文, 'help B');
  assert.equal(page.显示帮助, true);
  const back = method('pages/添加笔记页.ets', 'onBackPress', page);
  assert.equal(back.onBackPress(), true); assert.equal(back.显示帮助, false);
  assert.equal(back.fieldValues, draft); assert.equal(exitRequests, 0);
  assert.equal(back.onBackPress(), true); assert.equal(exitRequests, 1);
  const source = read('pages/添加笔记页.ets');
  assert.match(source, /onHelp:.*this.打开帮助\(标签文案, 取帮助\(\)\)/);
  assert.match(source, /onHelp:.*this.打开帮助\(\$r\('app.string.add_note_notetype'\), this.笔记类型帮助\)/);
});

test('legacy help respects busy state and is released when its owner leaves', () => {
  let opens = 0, closes = 0;
  const state = { busy: true, legacyHelp: { open() { opens++; }, close() { closes++; } } };
  const owner = method('components/数据迁移面板.ets', '打开旧版帮助', state);
  owner.打开旧版帮助(); assert.equal(opens, 0);
  owner.busy = false; owner.打开旧版帮助(); assert.equal(opens, 1);
  method('components/数据迁移面板.ets', 'aboutToDisappear', state).aboutToDisappear();
  assert.equal(closes, 1);
});

test('deck option teardown closes the top help before its editor', () => {
  const closed = [];
  const owner = method('components/home/DeckOptionField.ets', 'aboutToDisappear', {
    helpDialog: { close() { closed.push('help'); } }, dialog: { close() { closed.push('editor'); } }, value: '30'
  });
  owner.aboutToDisappear();
  assert.deepEqual(closed, ['help', 'editor']);
  assert.equal(owner.value, '30');
  owner.aboutToDisappear(); assert.equal(closed.length, 2);
});

test('plain and rich help share fixed Done, scrollable content and a single backdrop', () => {
  const panel = read('components/字段帮助面板.ets');
  assert.match(panel, /DialogFrame\(/);
  assert.match(panel, /showClose: false[\s\S]*?app.string.done[\s\S]*?this.onClose\(\)/);
  assert.match(panel, /onDismiss:.*this.onClose\(\)/);
  assert.match(panel, /Text\(this.正文\)[\s\S]*?this.内容\(\)/);
  assert.match(panel, /字段帮助面板\([\s\S]*?this.controller\?\.close\(\)/);
  for (const file of ['components/数据迁移面板.ets', 'components/home/DeckOptionField.ets',
    'components/settings/RedemptionPanel.ets']) {
    const source = read(file);
    assert.match(source, /builder: 字段帮助对话框\(/, file);
    assert.match(source, /maskColor: Color.Transparent/, file);
  }
  assert.doesNotMatch(read('components/数据迁移面板.ets'), /showAlertDialog/);
  const editor = read('components/home/DeckOptionField.ets').split('export struct DeckOptionField')[0];
  assert.doesNotMatch(editor, /if \(this.showHelp\)|Text\(this.help\)/);
  assert.match(editor, /onHelp:.*this.onHelp\(\)/);
});
