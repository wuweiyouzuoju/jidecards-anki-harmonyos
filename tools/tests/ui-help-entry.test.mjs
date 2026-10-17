// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { loadPlatformModule, nativeDialogHostClass, nativeDialogMembers } from './platform-module-harness.mjs';
import { surfaceMotionApi } from './motion-harness.mjs';

const root = new URL('../../entry/src/main/ets/', import.meta.url);
const read = file => readFileSync(new URL(file, root), 'utf8').replaceAll('\r\n', '\n');
function methodSource(file, name, source = read(file)) {
  const start = source.search(new RegExp(`^  (?:private )?${name}\\(`, 'm'));
  assert.notEqual(start, -1, `${file}: ${name}`);
  const open = source.indexOf('{', start);
  let end = open + 1, depth = 1;
  for (; depth; end++) {
    if (source[end] === '{') depth++;
    if (source[end] === '}') depth--;
  }
  return source.slice(start, end);
}
function method(file, name, state, bindings = {}) {
  const code = stripTypeScriptTypes(`class Host { ${methodSource(file, name)} }`, { mode: 'transform' });
  const Host = new Function(...Object.keys(bindings), `${code}; return Host;`)(...Object.values(bindings));
  return Object.assign(new Host(), state);
}

// 执行真实窗口拥有者和组件字段工厂，只替换系统窗口与帮助/编辑内容的渲染边界。
function nativeHelpOwner(file, names, state = {}, events = []) {
  const source = read(file), component = file.split('/').at(-1).replace('.ets', '');
  const start = source.indexOf(`export struct ${component} {`);
  assert.notEqual(start, -1, `${file}: ${component}`);
  const ownerSource = source.slice(start);
  const bindings = {
    NativeDialogHost: nativeDialogHostClass(surfaceMotionApi()),
    CustomDialogController: class {
      constructor(options) { this.options = options; }
      open() { events.push('open:' + this.options.builder.kind); }
      close() { events.push('close:' + this.options.builder.kind); }
    },
    字段帮助对话框: props => ({ ...props, kind: 'help' }),
    DeckOptionEditor: props => ({ ...props, kind: 'editor' }),
    $r: key => key
  };
  const members = nativeDialogMembers(ownerSource);
  const code = stripTypeScriptTypes(`class Host { ${members}\n${names.map(name => methodSource(file, name, ownerSource)).join('\n')} }`,
    { mode: 'transform' });
  const Host = new Function(...Object.keys(bindings), `${code}; return Host;`)(...Object.values(bindings));
  return Object.assign(new Host(), state);
}

test('closed deck option content cannot submit values or open help for a newer editor', () => {
  const changes=[], events=[];
  const owner=nativeHelpOwner('components/home/DeckOptionField.ets',['open','openHelp'],
    {busy:false,displayValue:'old',onChange:value=>changes.push(value),validate:()=>''},events);
  owner.open(); const old=owner.dialog.current().options.builder;
  old.onClose(); owner.open(); const next=owner.dialog.current();
  old.onConfirm('stale'); old.onHelp(); old.onClose();
  assert.deepEqual(changes,[]); assert.equal(owner.helpDialog.current(),null); assert.equal(owner.dialog.current(),next);
  next.options.builder.onConfirm('current'); assert.deepEqual(changes,['current']);
  owner.dialog.dispose(); next.options.builder.onConfirm('departed'); assert.deepEqual(changes,['current']);
});

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
  assert.match(label, /Text\(\)\s*\{\s*ForEach\(\[themeTextKey\([\s\S]*?ThemeHighlightedTextSpans\(this.title, this.highlightLabel, this.highlightColors, this.getUIContext\(\)\)/);
  assert.match(label, /@Prop highlightLabel: ResourceStr = ''/);
  assert.match(label, /@Prop highlightColors: string\[\] = \[\]/);
  assert.doesNotMatch(label, /Blank\(|layoutWeight\(|margin\(|padding\(|Row\(\{/);
  assert.match(label, /alignItems\(VerticalAlign.Center\)/);
  // Weighted/full-width callers need the actual Row to fill the Common wrapper
  // for both leading and centered labels, including labels with no help button.
  assert.match(label, /\.width\('100%'\)/);
  assert.doesNotMatch(label, /\.width\(this\.centered \? '100%' : undefined\)/);
  assert.match(label, /justifyContent\(this\.centered \? FlexAlign\.Center : FlexAlign\.Start\)/);
  assert.match(label, /Stack\(\)\s*\{[\s\S]*?Text\([\s\S]*?HelpButton\([\s\S]*?\.position\(HelpLayout.titleHelpPosition\(this.titleWidth, this.titleHeight, this.actionIcon !== undefined\)\)/,
    'help must leave the normal flow so adding it cannot shift the title or increase row height');
  assert.match(label, /\.onAreaChange\([\s\S]*?this.updateTitleArea\(area\)/);
  assert.match(label, /maxWidth: HelpLayout.titleMaxWidth\(this.centered, this.showHelp, this.actionIcon !== undefined\)/);
});

test('a title action precedes help with separate touch targets and reserves the trailing hit region', () => {
  const layout = loadPlatformModule('utils/HelpLayout.ets', 'HelpLayout', {});
  for (const [width, height] of [[60, 20], [120, 40], [240, 56]]) {
    const action = layout.titleActionPosition(width, height);
    const help = layout.titleHelpPosition(width, height, true);
    const hit = layout.hitRegion();
    assert.equal(action.x + layout.touchSize, help.x + hit.x, 'adjacent hit regions must not overlap');
    assert.equal(action.y + layout.touchSize / 2, height / 2);
    assert.equal(help.y + layout.iconSize / 2, height / 2);
    const rightReserve = help.x + hit.x + hit.width - width;
    assert.equal(layout.titleMaxWidth(false, true, true), `calc(100% - ${rightReserve}vp)`);
    assert.equal(layout.titleMaxWidth(true, true, true), `calc(100% - ${rightReserve * 2}vp)`);
  }
  assert.equal(layout.titleMaxWidth(false, false, true), 'calc(100% - 35vp)');
});

test('template icon and keyboard opening obey the same current note-type guard', () => {
  for (const enabled of [false, true]) for (const typeId of [0, 7]) {
    const page = method('pages/添加笔记页.ets', 'openTemplates', {
      interfaceEnabled: id => { assert.equal(id, 'templates'); return enabled; },
      已选笔记类型ID: typeId, templatesOpen: false
    });
    page.openTemplates();
    assert.equal(page.templatesOpen, enabled && typeId > 0);
  }
});

test('help icon geometry, accessibility, press effect and click isolation have one owner', () => {
  const button = read('components/common/HelpButton.ets');
  const layout = loadPlatformModule('utils/HelpLayout.ets', 'HelpLayout', {});
  assert.equal(layout.iconSize, 18); assert.equal(layout.touchSize, 44); assert.equal(layout.titleGap, 4);
  assert.deepEqual(layout.hitRegion(), { x: -13, y: -13, width: 44, height: 44 });
  assert.match(button, /Image\([\s\S]*?\.width\(HelpLayout.iconSize\)\.height\(HelpLayout.iconSize\)/);
  assert.match(button, /\.width\(HelpLayout.iconSize\)\.height\(HelpLayout.iconSize\)\.padding\(0\)/);
  assert.match(button, /responseRegion\(HelpLayout.hitRegion\(\)\).mouseResponseRegion\(HelpLayout.hitRegion\(\)\)/);
  assert.doesNotMatch(button, /\.width\(44\)|\.height\(44\)/, 'touch target must not become a layout box');
  assert.equal(layout.titleMaxWidth(true, true), 'calc(100% - 44vp)');
  assert.equal(layout.titleMaxWidth(false, true), 'calc(100% - 22vp)');
  assert.equal(layout.titleMaxWidth(true, false), '100%');
  assert.equal(layout.titleMaxWidth(false, false), '100%');
  for(const [width,height] of [[72,22],[144,48],[260,52]]) {
    assert.deepEqual(layout.titleHelpPosition(width,height),{x:width+4,y:(height-18)/2});
  }
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

test('help follows the actual measured title after text width, wrapping or font size changes',()=>{
  const layout=loadPlatformModule('utils/HelpLayout.ets','HelpLayout',{});
  const label=method('components/common/HelpLabel.ets','updateTitleArea',{titleWidth:0,titleHeight:0});
  for(const [width,height] of [[72,22],[144,48],[90,24]]) {
    label.updateTitleArea({width:String(width),height:String(height)});
    assert.equal(label.titleWidth,width);assert.equal(label.titleHeight,height);
    assert.deepEqual(layout.titleHelpPosition(label.titleWidth,label.titleHeight),{x:width+4,y:(height-18)/2});
  }
});

test('note help reads the current resource and Back preserves all draft fields', () => {
  const draft = ['front', 'back'];
  let exitRequests = 0;
  const page = method('pages/添加笔记页.ets', '打开帮助', {
    fieldValues: draft, draftPreview: null, requestExit: () => { exitRequests++; }
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
  const events = [], draft = { fields: ['front', 'back'] };
  const owner = nativeHelpOwner('components/数据迁移面板.ets', ['打开旧版帮助', 'aboutToDisappear'],
    { busy: true, csvDraft: draft }, events);
  owner.打开旧版帮助(); assert.deepEqual(events, []); assert.equal(owner.legacyHelp.current(), null);
  owner.busy = false; owner.打开旧版帮助();
  const first = owner.legacyHelp.current();
  assert.equal(first.options.builder.标题, 'app.string.transfer_legacy');
  assert.equal(first.options.builder.正文, 'app.string.transfer_legacy_help');
  assert.deepEqual(events, ['open:help']);
  owner.打开旧版帮助();
  const second = owner.legacyHelp.current();
  first.options.builder.onDismiss();
  assert.equal(owner.legacyHelp.current(), second, 'old content must not release a replacement');
  owner.aboutToDisappear(); owner.aboutToDisappear(); owner.打开旧版帮助();
  second.options.builder.onDismiss();
  assert.equal(owner.legacyHelp.current(), null);
  assert.equal(owner.csvDraft, draft);
  assert.deepEqual(events, ['open:help', 'close:help', 'open:help', 'close:help']);
});

test('deck option teardown closes the top help before its editor', () => {
  const events = [], changes = [];
  const owner = nativeHelpOwner('components/home/DeckOptionField.ets',
    ['open', 'openHelp', 'aboutToAppear', 'aboutToDisappear', 'syncValue'],
    { title: 'Daily limit', help: 'Help A', value: '30', busy: false, onChange: value => changes.push(value) }, events);
  owner.aboutToAppear(); owner.open();
  const editor = owner.dialog.current();
  assert.equal(editor.options.builder.initialValue, '30');
  editor.options.builder.onHelp();
  const help = owner.helpDialog.current();
  assert.equal(help.options.builder.正文, 'Help A');
  owner.aboutToDisappear();
  assert.deepEqual(events, ['open:editor', 'open:help', 'close:help', 'close:editor']);
  assert.equal(owner.value, '30');
  owner.aboutToDisappear(); owner.open(); owner.openHelp();
  assert.equal(events.length, 4, 'disposed owners neither close twice nor reopen');
  assert.deepEqual(changes, []);
  owner.value = '40'; owner.help = 'Help B'; owner.aboutToAppear(); owner.open();
  const reopened = owner.dialog.current();
  assert.equal(reopened.options.builder.initialValue, '40');
  editor.options.builder.onClose(); help.options.builder.onDismiss();
  assert.equal(owner.dialog.current(), reopened, 'callbacks from disposed content cannot close a new editor');
  reopened.options.builder.onHelp();
  assert.equal(owner.helpDialog.current().options.builder.正文, 'Help B');
  owner.aboutToDisappear();
  assert.deepEqual(changes, []);
});

test('plain and rich help share fixed Done, scrollable content and a single backdrop', () => {
  const panel = read('components/字段帮助面板.ets');
  assert.match(panel, /DialogFrame\(/);
  assert.match(panel, /showClose: false[\s\S]*?app.string.done[\s\S]*?this.onClose\(\)/);
  assert.match(panel, /onDismiss:.*this.onClose\(\)/);
  assert.match(panel, /Text\(this.正文\)[\s\S]*?this.内容\(\)/);
  assert.match(panel, /字段帮助面板\([\s\S]*?this.onDismiss\(\)/);
  for (const [file, hostName, factoryName] of [
    ['components/数据迁移面板.ets', 'legacyHelp', 'createLegacyHelp'],
    ['components/home/DeckOptionField.ets', 'helpDialog', 'createHelpDialog']
  ]) {
    const owner = nativeHelpOwner(file, [], { title: 'Title', help: 'Help' });
    const host = owner[hostName], expected = host.presentation();
    host.open(owner[factoryName]);
    const options = host.current().options;
    assert.equal(options.builder.kind, 'help', file);
    for (const key of ['width', 'height', 'maskColor', 'autoCancel', 'customStyle', 'alignment',
      'openAnimation', 'closeAnimation']) assert.deepEqual(options[key], expected[key], `${file}: ${key}`);
    host.dispose();
  }
  assert.doesNotMatch(read('components/数据迁移面板.ets'), /showAlertDialog/);
  const editor = read('components/home/DeckOptionField.ets').split('export struct DeckOptionField')[0];
  assert.doesNotMatch(editor, /if \(this.showHelp\)|Text\(this.help\)/);
  assert.match(editor, /onHelp:.*this.onHelp\(\)/);
});

test('help completion closes each native window instead of only dropping its reference', () => {
  for (const [file, hostName, factoryName] of [
    ['components/数据迁移面板.ets', 'legacyHelp', 'createLegacyHelp'],
    ['components/home/DeckOptionField.ets', 'helpDialog', 'createHelpDialog']
  ]) {
    const events = [], owner = nativeHelpOwner(file, [], {}, events), host = owner[hostName];
    host.open(owner[factoryName]); host.current().options.builder.onDismiss();
    assert.deepEqual(events, ['open:help', 'close:help'], file);
    assert.equal(host.current(), null);
  }
});
