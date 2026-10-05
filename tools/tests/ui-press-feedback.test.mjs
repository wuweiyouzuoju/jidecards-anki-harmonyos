// SPDX-License-Identifier: AGPL-3.0-or-later
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';
import { arkuiClickTargets, clickFeedbackExemption } from '../arkui-click-targets.mjs';
import { loadPlatformModule } from './platform-module-harness.mjs';

test('press feedback is visible on any backing and preserves caller opacity and disabled states', () => {
  const Feedback = loadPlatformModule('utils/PressFeedback.ets', 'PressFeedback', {});
  for (const rest of [0, 0.6, 1]) {
    const feedback = new Feedback(rest); let opacity;
    const node = { opacity(value) { opacity = value; return node; } };
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
  const root = new URL('../../entry/src/main/ets/', import.meta.url), auditedPaths = new Set();
  for (const file of readdirSync(root, { recursive: true }).filter(f => f.endsWith('.ets'))) {
    const path = file.replaceAll('\\', '/');
    const source = readFileSync(new URL(path, root), 'utf8');
    for (const target of arkuiClickTargets(source)) {
      if (clickFeedbackExemption(path, target)) continue;
      auditedPaths.add(path);
      const location = `${path}:${target.line} ${target.kind}`;
      assert.match(target.modifiers, /new (?:PressFeedback|GlassSurface|PrimaryGlassSurface)\(/, location);
      if (target.kind === 'Button') assert.match(target.modifiers, /\.stateEffect\(false\)/, location);
      assert.doesNotMatch(target.modifiers, /duration:\s*80|\.onTouch\(/, location);
    }
  }
  // 共用菜单减少散写点击节点；以真实入口覆盖检查扫描范围，而不固定按钮数量。
  for (const path of ['pages/浏览页.ets', 'pages/学习页.ets', 'pages/AI制卡页.ets',
    'pages/添加笔记页.ets', 'components/common/MenuItem.ets', 'components/common/DialogHeader.ets',
    'components/common/PrimaryActionButton.ets']) {
    assert.ok(auditedPaths.has(path), `press audit must include ${path}`);
  }
});
