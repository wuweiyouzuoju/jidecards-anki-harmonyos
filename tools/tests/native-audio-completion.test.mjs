// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { AudioQueueCompletion } from '../../entry/src/main/ets/model/AudioQueueCompletion.ts';
import { harmonyTtsVoiceName, ttsSpeakOptions } from '../../entry/src/main/ets/model/CardRenderingSupport.ts';
import { loadPlatformModule } from './platform-module-harness.mjs';

const turn = () => new Promise(resolve => setImmediate(resolve));
function loadPlayer(name, dependencies) {
  const source = readFileSync(new URL(`../../entry/src/main/ets/utils/${name}.ets`, import.meta.url), 'utf8')
    .replace(/^import .*\r?\n/gm, '').replace(/^export /gm, '');
  const globals = {
    AudioQueueCompletion,
    harmonyTtsVoiceName, ttsSpeakOptions,
    hilog: { info() {}, warn() {}, error() {} },
    AudioFocusCoordinator: { getInstance: () => ({ beginPlayback: async () => {}, endPlayback: async () => {} }) },
    ...dependencies
  };
  const Player = new Function(...Object.keys(globals), stripTypeScriptTypes(source, { mode: 'transform' }) + `; return ${name};`)(...Object.values(globals));
  return new Player();
}

test('native sound queue completes only after the final AVPlayer event and stop releases pending waits', async () => {
  const listeners = new Map(), played = [];
  const native = {
    state: 'idle', on: (event, callback) => listeners.set(event, callback),
    reset: async () => { native.state = 'idle'; },
    set fdSrc(value) { native.source = value; setImmediate(() => { native.state = 'initialized'; listeners.get('stateChange')('initialized'); }); },
    get fdSrc() { return native.source; },
    prepare: async () => { native.state = 'prepared'; listeners.get('stateChange')('prepared'); },
    play: async () => { native.state = 'playing'; played.push(native.fdSrc.fd); listeners.get('stateChange')('playing'); },
    release: async () => {}
  };
  let fd = 0;
  const player = loadPlayer('声音播放器', {
    media: { createAVPlayer: async () => native },
    audio: { InterruptMode: { SHARE_MODE: 1 }, InterruptHint: { INTERRUPT_HINT_RESUME: 1 } },
    fs: { statSync: () => ({ size: 100 }), openSync: () => ({ fd: ++fd }), closeSync() {}, OpenMode: { READ_ONLY: 0 } }
  });
  await player.播放队列(['one', 'two']);
  let completed = false;
  const done = player.waitForCompletion().then(() => { completed = true; });
  await turn(); assert.equal(completed, false); assert.equal(played.length, 1);
  native.state = 'completed'; listeners.get('stateChange')('completed');
  await turn(); await turn(); assert.equal(completed, false); assert.equal(played.length, 2);
  native.state = 'completed'; listeners.get('stateChange')('completed');
  await done; assert.equal(completed, true);
  await player.播放队列(['cancel']);
  const cancelled = player.waitForCompletion();
  await player.停止(); await cancelled;
  await player.释放();
});

function strictSoundHarness({ synchronous = false, decoderError = false } = {}) {
  const listeners = new Map(), calls = [], failures = [];
  let sourceGeneration = 0;
  const fail = message => {
    const error = Object.assign(Error(message), { code: 5400102 });
    failures.push(message); listeners.get('error')?.(error); return error;
  };
  const emit = state => { native.state = state; listeners.get('stateChange')(state); };
  const native = {
    state: 'idle', on: (event, callback) => listeners.set(event, callback),
    reset: async () => { sourceGeneration++; native.state = 'idle'; },
    set audioInterruptMode(_mode) {
      calls.push(['mode', native.state]);
      if (!['prepared','playing','paused','completed'].includes(native.state)) fail('interrupt mode before prepared');
    },
    set fdSrc(value) {
      native.source = value; const generation = ++sourceGeneration;
      const ready = () => { if (generation === sourceGeneration) { emit('initialized'); listeners.get('stateChange')('initialized'); } };
      if (synchronous) ready(); else setImmediate(ready);
    },
    prepare: async () => {
      calls.push(['prepare', native.state]);
      if (native.state !== 'initialized') throw fail('prepare before initialized');
      if (decoderError) { fail('decoder failure'); emit('error'); return; }
      emit('prepared'); listeners.get('stateChange')('prepared');
    },
    play: async () => {
      calls.push(['play', native.state]);
      if (native.state !== 'prepared') throw fail('play before prepared');
      emit('playing');
    },
    release: async () => {}
  };
  const dependencies = { media: { createAVPlayer: async () => native },
    audio: { InterruptMode: { SHARE_MODE: 1 }, InterruptHint: { INTERRUPT_HINT_RESUME: 1 } },
    fs: { statSync: () => ({ size: 25109 }), openSync: () => ({ fd: 10 }), closeSync() {}, OpenMode: { READ_ONLY: 0 } } };
  const player = loadPlayer('声音播放器', dependencies);
  const Preview = loadPlatformModule('utils/NoteAudioPreview.ets','NoteAudioPreview',{
    fs: { stat: async () => ({ size: 25109 }) }, 声音播放器: class { constructor() { return player; } }
  });
  return { player, preview: new Preview(), native, listeners, calls, failures, emit };
}

test('editor preview waits for valid AVPlayer states, sets focus after prepare, and never reports successful playback as failed', async () => {
  for (const synchronous of [false, true]) {
    const h = strictSoundHarness({ synchronous }), states = [];
    const result = h.preview.play('/files/collection.media/4000B1_afraid.mp3', state => states.push(state));
    await turn(); await turn();
    assert.deepEqual(h.calls, [['prepare','initialized'], ['mode','prepared'], ['play','prepared']]);
    assert.deepEqual(h.failures, []);
    h.emit('completed'); await result;
    assert.deepEqual(states, [true,false]);
    await h.preview.dispose();
  }
});

test('true decoder errors remain failures and stop before initialization never prepares or plays a cancelled source', async () => {
  const failed = strictSoundHarness({ decoderError: true });
  await assert.rejects(failed.preview.play('bad.mp3', () => {}), /Audio playback failed/);
  assert.deepEqual(failed.failures, ['decoder failure']); await failed.preview.dispose();
  const cancelled = strictSoundHarness();
  await cancelled.player.播放队列(['one.mp3']); await cancelled.player.停止(); await turn();
  assert.deepEqual(cancelled.calls, []); await cancelled.player.释放();
});

test('native TTS completion ignores stale request ids and advances each item exactly once', async () => {
  let listener;
  const requests = [];
  const engine = { stop: async () => {}, shutdown: async () => {},
    setListener: value => { listener = value; }, speak: (text, params) => requests.push(params.requestId) };
  const player = loadPlayer('TTS播放器', {
    textToSpeech: { listVoices: async () => { throw new Error('use requested language'); }, createEngine: async () => engine },
    util: {}, 加载语音人物: async () => 8, 获取语音版本号: () => 0
  });
  const item = { text: 'hello', language: 'en_US', voices: [], otherArgs: [], speed: 1 };
  await player.播放队列([item, item]);
  let completed = false;
  const done = player.waitForCompletion().then(() => { completed = true; });
  listener.onComplete('stale', {});
  await turn(); assert.equal(requests.length, 1); assert.equal(completed, false);
  const first = requests[0];
  listener.onComplete(first, {}); listener.onComplete(first, {});
  await turn(); assert.equal(requests.length, 2); assert.equal(completed, false);
  listener.onComplete(requests[1], {});
  await done; assert.equal(completed, true);
  await player.播放队列([item]);
  const old = requests.at(-1), cancelled = player.waitForCompletion();
  await player.停止(); await cancelled;
  await player.播放队列([item]);
  listener.onComplete(old, {});
  assert.equal(player.activeRequestId, requests.at(-1));
  listener.onError(requests.at(-1), 1, 'unavailable');
  await player.waitForCompletion();
  await player.释放();
});
