// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadPlatformModule } from './platform-module-harness.mjs';

function harness(failure = '') {
  const events = [];
  let failing = failure;
  let listener;
  const manager = {
    on(_event, callback) { events.push('listen'); if (failing === 'listen') throw Error('unavailable'); listener = callback; },
    activateAudioSession() { events.push('activate'); if (failing === 'activate') throw Error('unavailable'); return Promise.resolve(); },
    async deactivateAudioSession() { events.push('deactivate'); }
  };
  const Coordinator = loadPlatformModule('utils/AudioFocusCoordinator.ets', 'AudioFocusCoordinator', {
    canIUse: () => failure !== 'unsupported',
    audio: { getAudioManager() {
      events.push('manager'); if (failing === 'manager') throw Error('unavailable');
      return { getSessionManager: () => manager };
    }, AudioConcurrencyMode: { CONCURRENCY_MIX_WITH_OTHERS: 1 } },
    hilog: { info() {}, warn() {}, error() { events.push('error'); } }
  });
  return { focus: Coordinator.getInstance(), events, recover() { failing = ''; }, interrupt() { listener({ reason: 1 }); } };
}

test('opening a card never initializes native audio focus; playback shares and releases one session', async () => {
  const h = harness(); assert.deepEqual(h.events, []);
  const sound = {}, tts = {};
  await Promise.all([h.focus.beginPlayback(sound), h.focus.beginPlayback(tts)]);
  assert.deepEqual(h.events, ['manager', 'listen', 'activate']);
  await h.focus.endPlayback(sound); assert.equal(h.events.includes('deactivate'), false);
  await h.focus.endPlayback(tts); assert.equal(h.events.at(-1), 'deactivate');
  await h.focus.beginPlayback(sound); h.interrupt(); await h.focus.beginPlayback(sound);
  assert.equal(h.events.filter(e => e === 'activate').length, 3);
  assert.equal(h.events.filter(e => e === 'listen').length, 1);
  await h.focus.endPlayback(sound);
});

for (const failure of ['manager', 'listen', 'activate']) {
  test(`audio focus ${failure} failure stays recoverable and can retry on the next playback`, async () => {
    const h = harness(failure); const owner = {};
    assert.deepEqual(h.events, []);
    await h.focus.beginPlayback(owner); await h.focus.endPlayback(owner);
    assert.ok(h.events.includes('error')); assert.equal(h.events.includes('deactivate'), false);
    h.recover(); await h.focus.beginPlayback(owner); await h.focus.endPlayback(owner);
    assert.equal(h.events.at(-1), 'deactivate');
  });
}

test('devices without audio capability do not initialize an audio session', async () => {
  const h = harness('unsupported'); const owner = {};
  await h.focus.beginPlayback(owner); await h.focus.endPlayback(owner);
  assert.deepEqual(h.events, []);
});
