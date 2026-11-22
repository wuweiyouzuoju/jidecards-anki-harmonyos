// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { hasActionStatus } from '../../entry/src/main/ets/model/InteractionFeedback.ts';
import { agentInterfaceControls } from '../../entry/src/main/ets/model/AppInterface.ts';
import { loadPlatformModule } from './platform-module-harness.mjs';

const root = new URL('../../entry/src/main/ets/', import.meta.url);
const read = file => readFileSync(new URL(file, root), 'utf8').replaceAll('\r\n', '\n');
const dimensions = loadPlatformModule('utils/应用尺寸.ets', '应用尺寸', {});
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
  const render = new Function('appearanceTextColor', 'LoadingProgress', 'Text', 'TransitionEffect', 'motionAnimation',
    'currentMotionProfile', build[1]);
  const apply = new Function('node', 'HitTestMode', 'return node' + build[2]);
  for (const glyphSize of [12, 18]) {
    for (const phase of ['idle', 'busy', 'success', 'failure']) {
      const host = { glyphSize, phase, tint: 'theme' }, glyphs = [];
      const glyph = () => { const captured = recorder(); glyphs.push(captured.attrs); return captured.node; };
      render.call(host, loadPlatformModule('utils/AppearanceElements.ets','appearanceTextColor',{}), glyph, glyph, { OPACITY: { animation: value => value } }, value => value, () => ({ statusMs: 120 }));
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
      resolvedIconFill: () => 'clear', resolvedGlyphColor: () => 'theme', densityScale: () => 1 };
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

test('composer controls use the existing icons and localize their current action', () => {
  for (const processing of [false, true]) for (const recording of [false, true]) {
    const context = { history: false, processing, parsing: false, batchRunning: false,
      pendingClarification: false, canSubmit: true, voiceAvailable: true,
      voiceState: recording ? 'recording' : '' };
    const controls = agentInterfaceControls(context);
    const byId = id => controls.find(item => item.id === id);
    assert.equal(byId('import').iconKey, 'ic_home_new');
    assert.equal(byId('voice').iconKey, recording ? 'ic_audio_recording' : 'ic_audio_record_on');
    assert.equal(byId('submit').iconKey, processing ? 'ic_common_close' : 'ic_common_arrow_up');
    for (const folder of ['base','en_US']) {
      const strings = resources(folder);
      for (const id of ['import','voice','submit']) assert.ok(strings.get(byId(id).titleKey));
    }
  }
});
