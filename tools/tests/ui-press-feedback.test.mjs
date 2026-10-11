// SPDX-License-Identifier: AGPL-3.0-or-later
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import test from 'node:test';
import { arkuiClickTargets, clickFeedbackExemption } from '../arkui-click-targets.mjs';
import { loadComponentLogic, loadPlatformModule } from './platform-module-harness.mjs';
import { motionApi } from './motion-harness.mjs';

test('press feedback is visible on any backing and preserves caller opacity and disabled states', () => {
  const Feedback = loadPlatformModule('utils/PressFeedback.ets', 'PressFeedback', motionApi());
  for (const rest of [0, 0.6, 1]) {
    const feedback = new Feedback(rest); let opacity;
    const node = { opacity(value) { opacity = value; return node; }, scale() { return node; } };
    for (let i = 0; i < 8; i++) {
      feedback.applyNormalAttribute(node); assert.equal(opacity, rest);
      feedback.applyPressedAttribute(node); assert.equal(opacity, rest * 0.72);
      feedback.applyNormalAttribute(node); assert.equal(opacity, rest);
      feedback.applyDisabledAttribute(node); assert.equal(opacity, Math.min(rest, 0.4));
    }
    new Feedback(rest, 1).applyDisabledAttribute(node); assert.equal(opacity, rest);
  }
});

test('click audit distinguishes nested child styles, strings, comments and event barriers', () => {
  const source = `// Button('fake').onClick(() => {})
    Button() { Text('fake .onClick()').attributeModifier(new Other()) }
      .opacity(this.busy ? 0.6 : 1).onClick(() => { this.save(); })
    Column() {}.onClick(() => { /* barrier */ })`;
  const targets = arkuiClickTargets(source);
  assert.equal(targets.length, 2); assert.equal(targets[0].kind, 'Button');
  assert.doesNotMatch(targets[0].modifiers, /Other/);
  assert.match(targets[0].modifiers, /opacity/);
  assert.equal(clickFeedbackExemption('components/Test.ets', targets[0]), '');
  assert.match(clickFeedbackExemption('components/Test.ets', targets[1]), /barrier/);
});

test('all app button and action-row click targets share one press owner', () => {
  const root = new URL('../../entry/src/main/ets/', import.meta.url), auditedPaths = new Set(), scannedPaths = new Set();
  for (const file of readdirSync(root, { recursive: true }).filter(f => f.endsWith('.ets'))) {
    const path = file.replaceAll('\\', '/');
    const source = readFileSync(new URL(path, root), 'utf8');
    scannedPaths.add(path);
    for (const target of arkuiClickTargets(source)) {
      if (clickFeedbackExemption(path, target)) continue;
      auditedPaths.add(path);
      const location = `${path}:${target.line} ${target.kind}`;
      assert.match(target.modifiers, /new (?:PressFeedback|GlassSurface|PrimaryGlassSurface)\(/, location);
      if (target.kind === 'Button') assert.match(target.modifiers, /\.stateEffect\(false\)/, location);
      let pressModifiers = target.modifiers;
      if (path === 'components/editor/NoteEditorWheel.ets') {
        // 触摸只清除长按补发 click 的抑制位；按下外观仍由公共 modifier 负责。
        // note-editor-wheel 的直接行为测试验证按下、长按、松手和再次点击。
        assert.match(source, /private toolTouch\(id: string, event: TouchEvent\): void/);
        pressModifiers = pressModifiers.replace(/\.onTouch\(\(event: TouchEvent\): void => \{ this\.toolTouch\((?:tool\.id|'format_option_' \+ option\.id), event\); \}\)/g, '');
      }
      if (path === 'components/common/IconActionButton.ets') {
        // menu-slide 直接执行单指、多指、取消及补发点击；按压仍由公共 modifier 绘制。
        pressModifiers = pressModifiers.replace(/\.onTouch\(\(event: TouchEvent\): void => \{ this\.slideTouch\(event\); \}\)/g, '');
      }
      assert.doesNotMatch(pressModifiers, /duration:\s*80|\.onTouch\(/, location);
    }
  }
  // 浏览页把点击交给公共按钮；扫描页面仍不可遗漏，公共 owner 的真实点击必须通过审计。
  assert.ok(scannedPaths.has('pages/浏览页.ets'), 'press scan must include the browser host');
  for (const path of ['pages/学习页.ets', 'pages/AI制卡页.ets',
    'pages/添加笔记页.ets', 'components/common/MenuItem.ets', 'components/common/按下态按钮.ets',
    'components/common/IconActionButton.ets', 'components/common/PrimaryActionButton.ets']) {
    assert.ok(auditedPaths.has(path), `press audit must include ${path}`);
  }
});

test('browser view triggers delegate clicks and disabled guards to the audited common button', () => {
  const source = readFileSync(new URL('../../entry/src/main/ets/pages/浏览页.ets', import.meta.url), 'utf8')
    .replaceAll('\r\n', '\n');
  assert.match(source, /import \{ 按下态按钮 \} from '..\/components\/common\/按下态按钮'/);
  const start = source.indexOf('  private viewChoice(group:');
  assert.ok(start >= 0);
  const builder = source.slice(start, source.indexOf('\n  }', start) + 4);
  assert.equal(arkuiClickTargets(builder).length, 0, 'the wrapper does not own a second native click target');
  assert.doesNotMatch(builder, /new (?:PressFeedback|GlassSurface)|\.onTouch\(|\.stateEffect\(/);
  let options, controlId;
  const Host = new Function('按下态按钮', '应用尺寸', stripTypeScriptTypes(`class Host { ${builder} }`,
    { mode: 'transform' }) + '; return Host;')(props => { options = props; return { id(value) { controlId = value; } }; },
    { 字号_正文: 20 });
  const Button = loadComponentLogic('components/common/按下态按钮.ets', '按下态按钮', {});
  const parent = new Host(), clicks = [];
  parent.viewChoiceLabel = group => `current-${group}`;
  parent.openViewMenu = group => { clicks.push(group); };
  parent.viewControlsAvailable = () => parent.available;
  parent.showViewMenu = true;
  for (const group of ['mode', 'filter', 'sort']) {
    parent.viewMenuGroup = group;
    for (const available of [false, true]) {
      parent.available = available;
      parent.viewChoice(group);
      assert.equal(controlId, `browser-view-${group}`);
      assert.equal(options.文案, `current-${group}`);
      assert.equal(options.是否启用, available);
      assert.equal(options.expanded, true);
      const before = clicks.length;
      // Only activation needs execution here; ArkUI/storage-backed visual fields belong to platform rendering.
      const button = Object.assign(Object.create(Button.prototype), options);
      button.activate();
      assert.equal(clicks.length, before + Number(available));
      if (available) assert.equal(clicks.at(-1), group);
      button.是否启用 = false;
      button.activate();
      assert.equal(clicks.length, before + Number(available), 'a late click still obeys the common disabled guard');
    }
  }
});
