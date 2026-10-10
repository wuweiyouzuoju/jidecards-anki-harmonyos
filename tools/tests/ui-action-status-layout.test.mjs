// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { hasActionStatus } from '../../entry/src/main/ets/model/InteractionFeedback.ts';
import { agentComposerLabelKeys, agentInterfaceControls } from '../../entry/src/main/ets/model/AppInterface.ts';
import { loadPlatformModule } from './platform-module-harness.mjs';

const root = new URL('../../entry/src/main/ets/', import.meta.url);
const read = file => readFileSync(new URL(file, root), 'utf8').replaceAll('\r\n', '\n');
const dimensions = loadPlatformModule('utils/应用尺寸.ets', '应用尺寸', {});
const page = read('pages/AI制卡页.ets');
const resources = locale => new Map(JSON.parse(readFileSync(new URL(
  `../../entry/src/main/resources/${locale}/element/string.json`, import.meta.url), 'utf8')).string
  .map(item => [item.name, item.value]));

function recorder() {
  const attrs = {};
  const node = new Proxy({}, { get: (_target, key) => value => { attrs[key] = value; return node; } });
  return { attrs, node };
}

test('shared text buttons remove the status child for idle, empty and unknown phases', () => {
  for (const file of ['PrimaryActionButton.ets', '按下态按钮.ets']) {
    const source = read('components/common/' + file);
    const branch = source.match(/if \([^\n]+\) \{ ActionStatus\([^\n]+\) \}/)?.[0];
    assert.ok(branch, file + ': execute the real status child branch');
    const render = new Function('ActionStatus', 'hasActionStatus', branch);
    for (const feedback of ['', 'idle', 'cancelled', 'attention', 'busy', 'success', 'failure']) {
      const children = [];
      render.call({ feedback, labelColor: () => 'theme' }, props => children.push(props), hasActionStatus);
      assert.deepEqual(children.map(child => child.phase),
        ['busy', 'success', 'failure'].includes(feedback) ? [feedback] : [], file + ': ' + feedback);
    }
  }
});

test('status glyphs keep their slot and visual size independent of the body font scale', () => {
  const source = read('components/common/ActionStatus.ets');
  const build = source.match(/build\(\) \{\s*Stack\(\) \{([\s\S]*?)\n    }(\.[\s\S]*?)\n  }/);
  assert.ok(build);
  const render = new Function('LoadingProgress', 'Text', 'TransitionEffect', 'motionAnimation',
    'currentMotionProfile', build[1]);
  const apply = new Function('node', 'HitTestMode', 'return node' + build[2]);
  for (const glyphSize of [12, 18]) {
    for (const phase of ['idle', 'busy', 'success', 'failure']) {
      const host = { glyphSize, phase, tint: 'theme' }, glyphs = [];
      const glyph = () => { const captured = recorder(); glyphs.push(captured.attrs); return captured.node; };
      render.call(host, glyph, glyph, { OPACITY: { animation: value => value } }, value => value, () => ({ statusMs: 120 }));
      const slot = recorder(); apply.call(host, slot.node, { None: 'none' });
      assert.equal(slot.attrs.width, glyphSize + 2); assert.equal(slot.attrs.height, glyphSize + 2);
      assert.equal(glyphs.length, phase === 'idle' ? 0 : 1);
      if (phase === 'busy') assert.equal(glyphs[0].width, glyphSize);
      if (phase === 'success' || phase === 'failure') assert.equal(glyphs[0].fontSize, `${glyphSize}vp`);
    }
  }
});

test('icon buttons keep their real action icon for absent or unsupported feedback', () => {
  const source = read('components/common/IconActionButton.ets');
  const branch = source.match(/if \([^\n]+\) \{\s*ActionIcon\([\s\S]*?else \{ ActionStatus\([^\n]+\) \}/)?.[0];
  assert.ok(branch);
  const render = new Function('ActionIcon', 'ActionStatus', 'hasActionStatus', branch);
  for (const feedback of ['', 'idle', 'attention', 'unknown', 'busy', 'success', 'failure']) {
    const drawn = [];
    const host = { feedback, source: 'sync', controlGlyphSize: 24,
      resolvedIconFill: () => 'clear', resolvedGlyphColor: () => 'theme' };
    render.call(host, () => drawn.push('icon'), () => drawn.push('status'), hasActionStatus);
    assert.deepEqual(drawn, [hasActionStatus(feedback) ? 'status' : 'icon']);
  }
});

test('cancelled sync results do not retain an empty leading status slot or claim success', () => {
  const source = read('components/同步面板.ets');
  const method = source.match(/private completionFeedback\(\): string \{([\s\S]*?)\n  }/)?.[1];
  const branch = source.match(/if \(hasActionStatus\(this\.completionFeedback\(\)\)\) \{([\s\S]*?)\n      }/)?.[0];
  assert.ok(method && branch);
  const feedback = new Function(method), render = new Function('ActionStatus', 'hasActionStatus', branch);
  for (const [status, error, cancelled, expected] of [
    ['', '', false, 'idle'], ['Cancelled', '', true, 'idle'], ['Done', '', false, 'success'],
    ['', 'Offline', false, 'failure'], ['Cancelled', 'Offline', true, 'failure']
  ]) {
    const host = { state: { 状态文案: status, 错误文案: error, 是否请求中止: cancelled }, 取色板: () => ({ 主色: 'theme' }) };
    host.completionFeedback = () => feedback.call(host);
    assert.equal(host.completionFeedback(), expected);
    const children = []; render.call(host, props => children.push(props.phase), hasActionStatus);
    assert.deepEqual(children, expected === 'idle' ? [] : [expected]);
  }
});

test('composer width reserves every real import, parse, send and cancel label in both languages', () => {
  const keys = agentComposerLabelKeys();
  const builder = page.match(/private composerLabelWidth\(\) \{([\s\S]*?)\n  }/)?.[1];
  assert.ok(builder);
  assert.equal((page.match(/this\.composerLabelWidth\(\)/g) ?? []).length, 2, 'both buttons use the same measurement');
  const render = new Function('ForEach', 'Text', 'agentComposerLabelKeys', 'localizedNamedResourceText', '应用尺寸',
    stripTypeScriptTypes(builder, { mode: 'transform' }));
  for (const [locale, folder] of [['zh-Hans', 'base'], ['en', 'en_US']]) {
    const strings = resources(folder), measured = [], itemKeys = [];
    render.call({ uiLanguage: locale, getUIContext: () => ({}) },
      (items, draw, keyFor) => items.forEach(key => { itemKeys.push(keyFor(key)); draw(key); }),
      label => { measured.push(label); return recorder().node; }, agentComposerLabelKeys,
      (_context, _language, key) => strings.get(key), dimensions);
    assert.deepEqual(measured, keys.map(key => strings.get(key)));
    assert.ok(measured.every(label => typeof label === 'string' && label.length > 0));
    assert.ok(itemKeys.every(key => key.startsWith(locale + '-')), 'language switches rebuild the measurement');
    for (const processing of [false, true]) for (const parsing of [false, true]) {
      const controls = agentInterfaceControls({ history: false, memory: false, processing, parsing,
        batchRunning: false, pendingClarification: false, canSubmit: true });
      for (const control of controls.filter(item => item.id === 'import' || item.id === 'submit')) {
        assert.ok(keys.includes(control.titleKey), 'reserve actual state label: ' + control.titleKey);
      }
    }
  }
});

test('composer hides every busy spinner and retains only completed request feedback', () => {
  const composer = page.slice(page.indexOf('private 输入区()'), page.indexOf('\n  build()'));
  const branch = composer.match(/if \(!this\.处理中[\s\S]*?\n              }/)?.[0];
  assert.ok(branch);
  const render = new Function('ActionStatus', 'hasActionStatus', '应用尺寸', '$r', branch);
  for (const processing of [false, true]) for (const requestFeedback of ['', 'idle', 'busy', 'success', 'failure', 'unknown']) {
    const status = recorder(); let props;
    render.call({ 处理中: processing, requestFeedback }, value => { props = value; return status.node; },
      hasActionStatus, dimensions, key => key);
    if (processing || !['success', 'failure'].includes(requestFeedback)) {
      assert.equal(props, undefined, 'processing must never render a spinner, including stale completion feedback');
      continue;
    }
    assert.equal(props.phase, requestFeedback);
    const slotSize = props.glyphSize + 2;
    const left = dimensions.卡片内边距 + status.attrs.position.x;
    assert.ok(left >= 0); assert.ok(left + slotSize < dimensions.卡片内边距);
    assert.equal(status.attrs.position.y, '50%'); assert.equal(status.attrs.markAnchor.y, slotSize / 2);
  }
});

test('paired composer buttons have equal final widths including both padding and borders', () => {
  const composer = page.slice(page.indexOf('private 输入区()'), page.indexOf('\n  build()'));
  const styles = [...composer.matchAll(/\n          Button\(\) \{[\s\S]*?\n          }([\s\S]*?)(?=\n          Button\(\)|\n        }\n      })/g)];
  assert.equal(styles.length, 2);
  const SurfaceBorder = loadPlatformModule('utils/SurfaceBorder.ets', 'SurfaceBorder', {
    应用尺寸: dimensions, $r: key => key
  });
  const frames = styles.map(match => {
    const capture = recorder();
    new Function('control', '应用尺寸', 'SurfaceBorder', 'PressFeedback', 'Color', '$r',
      stripTypeScriptTypes('function render() { return control' + match[1] + '; }', { mode: 'transform' }) +
        '; return render.call(this);')
      .call({ interfaceEnabled: () => true, 处理中: false }, capture.node, dimensions, SurfaceBorder,
        class {}, { Transparent: 'transparent' }, key => key);
    return capture.attrs;
  });
  for (const measuredLabelWidth of [30, 60, 96]) {
    const finalWidths = frames.map(frame => measuredLabelWidth + frame.padding.left + frame.padding.right +
      2 * (frame.border?.width ?? 0));
    assert.equal(finalWidths[0], finalWidths[1], 'the outline also contributes to the intrinsic width');
  }
  assert.equal(frames[0].height, frames[1].height);
  assert.equal(frames[1].border.color, 'transparent', 'primary fill keeps its original appearance');
});
