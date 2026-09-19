// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { AudioQueueCompletion } from '../../entry/src/main/ets/model/AudioQueueCompletion.ts';

const turn = () => new Promise(resolve => setImmediate(resolve));
function loadPlayer(name, dependencies) {
  const source = readFileSync(new URL(`../../entry/src/main/ets/utils/${name}.ets`, import.meta.url), 'utf8')
    .replace(/^import .*\r?\n/gm, '').replace(/^export /gm, '');
  const globals = {
    AudioQueueCompletion,
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
    prepare: async () => { native.state = 'prepared'; },
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
  await turn(); assert.equal(completed, false); assert.equal(played.length, 2);
  native.state = 'completed'; listeners.get('stateChange')('completed');
  await done; assert.equal(completed, true);
  await player.播放队列(['cancel']);
  const cancelled = player.waitForCompletion();
  await player.停止(); await cancelled;
  await player.释放();
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
  const item = { text: 'hello', language: 'en_US' };
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
