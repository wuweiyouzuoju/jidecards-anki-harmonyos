import test from 'node:test';
import assert from 'node:assert/strict';
import { hapticPattern, playHaptic } from '../src/core/Haptics.ts';

function backend(options = {}) {
  const calls = [];
  return { calls,
    async isSupported(id) { calls.push(['support', id]); if (options.probeFails) throw Error('probe'); return !options.unsupported; },
    async playPreset(id) { calls.push(['preset', id]); if (options.presetFails) throw Error('preset'); },
    async playTimed(ms) { calls.push(['timed', ms]); if (options.timedFails) throw Error('device unavailable'); },
    async wait(ms) { calls.push(['wait', ms]); }
  };
}

test('关闭触感不访问设备，未知事件不会偷偷当作完成事件', async () => {
  const device = backend();
  await playHaptic('correct', device, false);
  assert.deepEqual(device.calls, []);
  await assert.rejects(playHaptic('unknown', device, true), /Invalid haptic/);
  const pattern = hapticPattern('correct'); pattern[0].fallbackMs = 99;
  assert.equal(hapticPattern('correct')[0].fallbackMs, 25);
});

test('完成的两个脉冲按顺序播放，仅在中间等待', async () => {
  const device = backend();
  await playHaptic('complete', device, true);
  assert.deepEqual(device.calls, [
    ['support', 'haptic.effect.sharp'], ['preset', 'haptic.effect.sharp'], ['wait', 180],
    ['support', 'haptic.effect.soft'], ['preset', 'haptic.effect.soft']
  ]);
});

test('探测失败、不支持和预设失败都走定时回退', async () => {
  for (const options of [{ probeFails: true }, { unsupported: true }, { presetFails: true }]) {
    const device = backend(options);
    await playHaptic('error', device, true);
    assert.deepEqual(device.calls.at(-1), ['timed', 50]);
  }
});

test('最终播放失败向调用方报告，后续完成脉冲不会继续', async () => {
  const device = backend({ unsupported: true, timedFails: true });
  await assert.rejects(playHaptic('complete', device, true), /device unavailable/);
  assert.deepEqual(device.calls, [['support', 'haptic.effect.sharp'], ['timed', 60]]);
});
