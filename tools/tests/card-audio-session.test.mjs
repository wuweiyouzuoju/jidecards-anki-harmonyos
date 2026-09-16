// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { CardAudioSession } from '../../entry/src/main/ets/model/CardAudioSession.ts';
import { encodeExtractAvTagsRequest, decodeExtractAvTagsResponse } from '../../entry/src/main/ets/proto/messages/CardRenderingMessages.ts';
import { 协议写入器 } from '../../entry/src/main/ets/proto/core/ProtoWriter.ts';
import { 服务号, 卡片渲染方法 } from '../../entry/src/main/ets/backend/服务索引.ts';

const deferred = () => {
  let resolve, reject;
  const promise = new Promise((a, b) => { resolve = a; reject = b; });
  return { promise, resolve, reject };
};
const tags = name => ({ soundFiles: [name], ttsItems: [{ text: name, language: 'en_US' }] });
function harness(extract = async html => tags(html)) {
  const events = [];
  const player = label => ({
    播放队列: async items => events.push([label, items]),
    停止: async () => events.push([label, 'stop']),
    释放: async () => events.push([label, 'release'])
  });
  const sound = player('sound'), tts = player('tts');
  const session = new CardAudioSession(sound, tts, extract);
  return { session, sound, tts, events, played: () => events.filter(e => Array.isArray(e[1])) };
}

test('one extraction supplies both players and preserves encoded or literal percent filenames', async () => {
  let calls = 0;
  const { session, played } = harness(async (html, question) => {
    calls++; assert.equal(html, 'front'); assert.equal(question, true);
    return { soundFiles: ['%E4%B8%AD.mp3', '100%.mp3'], ttsItems: tags('speech').ttsItems };
  });
  assert.equal(await session.play('front', true, '/media'), true);
  assert.equal(calls, 1);
  assert.deepEqual(played().map(e => e[1]), [['/media/中.mp3', '/media/100%.mp3'], tags('speech').ttsItems]);
});

test('new card plays without waiting for old extraction; old success and failure are inert', async () => {
  for (const fails of [false, true]) {
    const slow = deferred(), { session, played } = harness(html => html === 'old' ? slow.promise : Promise.resolve(tags(html)));
    const old = session.play('old', false, '/media');
    await session.play('new', true, '/media');
    if (fails) slow.reject(new Error('stale failure')); else slow.resolve(tags('old'));
    assert.equal(await old, null);
    assert.deepEqual(played().map(e => e[1]), [['/media/new'], tags('new').ttsItems]);
  }
});

test('stopping during player initialization cancels TTS and performs a final cleanup', async () => {
  const slow = deferred(), { session, sound, events } = harness();
  sound.播放队列 = async () => { events.push(['initializing']); await slow.promise; events.push(['started']); };
  const play = session.play('old', true, '/media');
  await new Promise(r => setImmediate(r));
  const stopped = session.stop(); slow.resolve();
  assert.equal(await play, null); await stopped;
  assert.equal(events.some(e => e[0] === 'tts' && Array.isArray(e[1])), false);
  assert.ok(events.findLastIndex(e => e[1] === 'stop') > events.findIndex(e => e[0] === 'started'));
});

test('release waits for initialization and permanently rejects new playback', async () => {
  const slow = deferred(), { session, sound, events } = harness();
  sound.播放队列 = async () => { await slow.promise; events.push(['started']); };
  const play = session.play('old', true, '/media');
  await new Promise(r => setImmediate(r));
  const released = session.release(); slow.resolve(); await play; await released;
  assert.ok(events.findIndex(e => e[1] === 'release') > events.findIndex(e => e[0] === 'started'));
  assert.equal(await session.play('new', true, '/media'), null);
});

test('metadata refresh restores replay availability without autoplay', async () => {
  const { session, played } = harness();
  assert.equal(await session.play('front', true, '/media', false), true);
  assert.equal(played().length, 0);
});

test('current errors are reported and a retry remains usable', async () => {
  let fail = true;
  const { session, played } = harness(async html => { if (fail) throw new Error('unavailable'); return tags(html); });
  await assert.rejects(session.play('front', true, '/media'), /unavailable/);
  fail = false;
  assert.equal(await session.play('front', true, '/media'), true);
  assert.equal(played().length, 2);
});

test('rendering service decodes both audio kinds from exactly one backend RPC', async () => {
  const source = readFileSync(new URL('../../entry/src/main/ets/backend/卡片渲染服务.ts', import.meta.url), 'utf8');
  const start = source.indexOf('  async extractAudioTags(');
  assert.ok(start >= 0);
  const body = source.slice(start, source.indexOf('\n  }', start) + 4);
  const Service = new Function('encodeExtractAvTagsRequest', 'decodeExtractAvTagsResponse', '服务号', '卡片渲染方法',
    stripTypeScriptTypes(`class Service { ${body} }`) + '; return Service;')(
    encodeExtractAvTagsRequest, decodeExtractAvTagsResponse, 服务号, 卡片渲染方法);
  // Reuse the actual wire decoder; this asserts the one-call boundary rather than a source spelling.
  const service = new Service(), calls = [];
  const bytes = new 协议写入器().转为字节();
  service.会话 = { 调用: async (...args) => { calls.push(args); return bytes; } };
  const result = await service.extractAudioTags('front [sound:a.mp3]', true);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], [服务号.后端卡片渲染, 卡片渲染方法.提取音视频标签,
    encodeExtractAvTagsRequest('front [sound:a.mp3]', true)]);
  assert.deepEqual(result, decodeExtractAvTagsResponse(bytes));
});
