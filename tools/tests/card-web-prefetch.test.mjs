// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { CardRenderPrefetch } from '../../entry/src/main/ets/model/CardRenderPrefetch.ts';
import { CardWebSession } from '../../entry/src/main/ets/model/CardWebSession.ts';
import { CardWebBuffer, CARD_SESSION_STORAGE_SNAPSHOT, carryCardSessionStorage } from '../../entry/src/main/ets/model/CardWebBuffer.ts';
import { loadPlatformModule } from './platform-module-harness.mjs';
import { encodeGetQueuedCardsRequest, decodeQueuedCards, decodeSchedulingStates } from '../../entry/src/main/ets/proto/messages/SchedulerMessages.ts';
import { CUSTOM_SCHEDULING_SERVICE, encodeCustomScheduling } from '../../entry/src/main/ets/proto/messages/CustomSchedulingMessages.ts';
import { decodeStringResponse } from '../../entry/src/main/ets/proto/messages/LinksMessages.ts';
import { schedulingScriptSource } from '../../entry/src/main/ets/model/CustomScheduling.ts';
import { encodeDeckId } from '../../entry/src/main/ets/proto/messages/DeckMessages.ts';
import { 服务号, 调度器方法, 牌组方法 } from '../../entry/src/main/ets/backend/服务索引.ts';

const turn = () => new Promise(resolve => setImmediate(resolve));
const html = value => `<html><head></head><body>${value}</body></html>`;
function deferred() {
  let resolve, reject;
  const promise = new Promise((a, b) => { resolve = a; reject = b; });
  return { promise, resolve, reject };
}

test('Core queue reads default to one card and study requests two without answering either card',async()=>{
  const calls=[];
  const Scheduler=loadPlatformModule('backend/调度器服务.ts','调度器服务',{
    encodeGetQueuedCardsRequest,decodeQueuedCards,encodeDeckId,服务号,调度器方法,牌组方法,
    后端会话:{获取实例:()=>({调用:async(...args)=>{calls.push(args);return new Uint8Array();}})}
  });
  const scheduler=new Scheduler();
  await scheduler.获取队首卡片(77);await scheduler.获取队首卡片(77,2);
  assert.deepEqual(calls.map(call=>call.slice(0,2)),[
    [服务号.后端牌组,牌组方法.设置当前牌组],[服务号.后端调度器,调度器方法.获取队首卡片],
    [服务号.后端牌组,牌组方法.设置当前牌组],[服务号.后端调度器,调度器方法.获取队首卡片]
  ]);
  assert.deepEqual(calls[1][2],encodeGetQueuedCardsRequest(1,false));
  assert.deepEqual(calls[3][2],encodeGetQueuedCardsRequest(2,false));
  const Dummy=class{};
  const CustomSchedulingService=loadPlatformModule('backend/CustomSchedulingService.ts','CustomSchedulingService',{
    CUSTOM_SCHEDULING_SERVICE,encodeCustomScheduling,decodeSchedulingStates,decodeStringResponse,schedulingScriptSource,
    后端会话:{获取实例:()=>({调用:async()=>assert.fail('queue reads must not execute custom scheduling')})}
  });
  const Adapter=loadPlatformModule('backend/StudySessionBackend.ts','AnkiStudySessionBackend',{
    CustomSchedulingService,AnkiCardMarking:Dummy,笔记服务:Dummy,卡片服务:Dummy,牌组配置服务:Dummy,笔记类型服务:Dummy,配置服务:Dummy
  });
  const requested=[];
  const adapter=new Adapter({获取队首卡片:async(...args)=>{requested.push(args);return {cards:[]};}},{},{},{execute:async()=>assert.fail('queue reads must not run scripts')});
  await adapter.queuedCards(77);
  assert.deepEqual(requested,[[77,2]]);
});

test('prefetch reuses a matching in-flight render once without displaying or playing it', async () => {
  const gate = deferred(), calls = [];
  const cache = new CardRenderPrefetch(id => { calls.push(id); return gate.promise; });
  const preparing = cache.prepare(22); await turn();
  const reading = cache.read(22);
  const rendered = { id: 22 }; gate.resolve(rendered);
  await preparing;
  assert.equal(await reading, rendered);
  assert.deepEqual(calls, [22]);
  await cache.read(22);
  assert.deepEqual(calls, [22, 22], 'consumed candidates are never reused for a later queue snapshot');
});

test('wrong, failed, expired and invalidated candidates fall back to normal rendering', async () => {
  for (const scenario of ['wrong', 'failed', 'expired', 'clock', 'clear']) {
    let now = 100, count = 0;
    const calls = [];
    const cache = new CardRenderPrefetch(async id => {
      calls.push(id);
      if (++count === 1 && scenario === 'failed') throw Error('speculative failure');
      return { id, count };
    }, () => now);
    await cache.prepare(22);
    if (scenario === 'expired') now += 30001;
    if (scenario === 'clock') now -= 1;
    if (scenario === 'clear') cache.clear();
    const actual = scenario === 'wrong' ? 33 : 22;
    assert.equal((await cache.read(actual)).count, 2, scenario);
    assert.deepEqual(calls, [22, actual]);
  }
  const gate = deferred(), calls = [];
  const cache = new CardRenderPrefetch(id => { calls.push(id); return calls.length === 1 ? gate.promise : Promise.resolve({ id }); });
  const pending = cache.prepare(22); await turn(); cache.clear();
  gate.resolve({ id: 22, stale: true }); await pending;
  assert.deepEqual(await cache.read(22), { id: 22 }, 'late completion cannot refill an invalidated cache');
});

function bufferHarness(load = null) {
  const loads = [], updates = [], themes = [], shown = [], errors = [];
  const buffer = new CardWebBuffer({
    load: async (slot, text, current) => {
      if (load) await load(slot, current);
      if (!current()) return;
      const [, id, revision] = text.match(/\.start\((\d+),(\d+),/);
      loads.push({ slot, id: +id, revision: +revision, text });
    },
    evaluate: async (slot, script) => vm.runInNewContext(script, { window: { __jideCardReviewer: {
      update: (id, revision, text, side) => updates.push({ slot, id, revision, text, side }),
      setTheme: (id, revision, dark) => themes.push({slot, id, revision, dark})
    } } }),
    shown: (slot, background) => shown.push({ slot, background }), failed: message => errors.push(message)
  });
  const done = (entry, error = '') => buffer.session(entry.slot).rendered(entry.id, entry.revision, error, '#102030');
  return { buffer, loads, updates, themes, shown, errors, done };
}

test('theme updates target the requested card and do not reactivate the frozen spare document', () => {
  const h = bufferHarness();
  h.buffer.setTheme(false);
  h.buffer.show(html('q1'), 1, 'question'); h.done(h.loads[0]);
  h.buffer.show(html('q2'), 2, 'question');
  h.buffer.setTheme(true); h.done(h.loads[1]);
  assert.equal(h.buffer.activeSlot(), 0, 'new card waits for its current theme');
  assert.deepEqual(h.themes.map(item => [item.slot, item.dark]), [[1, true]]);
  h.done(h.themes[0]); assert.equal(h.buffer.activeSlot(), 1);
  h.buffer.setTheme(false);
  assert.deepEqual(h.themes.map(item => item.slot), [1, 1], 'inactive document receives no frame request');
  h.done(h.themes[1]);
});

test('next cards swap only after render completion, while flips preserve the current document', () => {
  const h = bufferHarness();
  h.buffer.show(html('q1'), 1, 'question'); h.done(h.loads[0]);
  h.buffer.show(html('a1'), 1, 'answer');
  assert.equal(h.updates[0].slot, 0); assert.equal(h.loads.length, 1);
  h.done(h.updates[0]);
  h.buffer.reset();
  h.buffer.show(html('q2'), 2, 'question');
  assert.equal(h.loads[1].slot, 1);
  assert.equal(h.buffer.activeSlot(), 0, 'old answer stays visible while the new document loads');
  h.done(h.loads[1]); assert.equal(h.buffer.activeSlot(), 1);
  h.buffer.show(html('q3'), 3, 'question');
  assert.equal(h.loads[2].slot, 0); assert.equal(h.buffer.activeSlot(), 1);
  h.done(h.loads[2]); assert.equal(h.buffer.activeSlot(), 0);
});

test('rapid skips, resets and render failures never expose a stale or incomplete surface', () => {
  const h = bufferHarness();
  h.buffer.show(html('q1'), 1, 'question'); h.done(h.loads[0]);
  h.buffer.show(html('q2'), 2, 'question');
  h.buffer.show(html('q3'), 3, 'question');
  h.done(h.loads[1]); assert.equal(h.shown.length, 1);
  h.done(h.loads[2], 'template failed');
  assert.equal(h.buffer.activeSlot(), 0); assert.deepEqual(h.errors, ['template failed']);
  h.buffer.show(html('retry'), 3, 'question'); h.done(h.loads[3]);
  assert.equal(h.buffer.activeSlot(), 1);
  h.buffer.reset(); h.done(h.loads[3]);
  assert.equal(h.shown.length, 2); assert.equal(h.buffer.activeSlot(), 1);
});

test('asynchronous staging is cancelled on a new request and load failures can be retried', async () => {
  const gate = deferred(); let fail = false;
  const h = bufferHarness(async () => { await gate.promise; if (fail) throw Error('load failed'); });
  h.buffer.show(html('old'), 1, 'question');
  h.buffer.show(html('current'), 2, 'question'); gate.resolve(); await turn();
  assert.equal(h.loads.length, 1); assert.match(h.loads[0].text, /current/);
  h.done(h.loads[0]);
  fail = true; h.buffer.show(html('failed'), 3, 'question'); await turn();
  assert.equal(h.buffer.activeSlot(), 0); assert.deepEqual(h.errors, ['Error: load failed']);
  fail = false; h.buffer.show(html('retry'), 3, 'question'); await turn();
  h.done(h.loads[1]); assert.equal(h.buffer.activeSlot(), 1);
});

test('session storage transfers before template scripts, including deletions and script-like values', () => {
  const pairs = [['key', '</script><script>evil()</script>'], ['unicode', '卡片']];
  const sourceMap = new Map(pairs);
  const storage = map => ({ get length() { return map.size; }, key: i => [...map.keys()][i],
    getItem: key => map.get(key), setItem: (key, value) => map.set(key, value), clear: () => map.clear() });
  const snapshot = vm.runInNewContext(CARD_SESSION_STORAGE_SNAPSHOT, { sessionStorage: storage(sourceMap) });
  for (const serialized of [JSON.stringify(snapshot), JSON.stringify(JSON.stringify(snapshot)), '[]']) {
    const targetMap = new Map([['deleted', 'stale']]);
    const carried = carryCardSessionStorage(html('card'), serialized);
    const [, script] = carried.match(/<head><script>([\s\S]*?)<\/script>/);
    assert.doesNotMatch(script, /<\/script>/);
    vm.runInNewContext(script, { sessionStorage: storage(targetMap) });
    assert.deepEqual([...targetMap], serialized === '[]' ? [] : pairs);
  }
});

test('buffered ArkWeb adapter mutes the staging view, carries storage and activates the ready view', async () => {
  const events = [], loads = [], proxies = [];
  const controllers = [0, 1].map(slot => ({
    loadData: text => loads.push({ slot, text }),
    runJavaScript: async script => { events.push([slot, 'script']); return JSON.stringify([['cached', 'value']]); },
    registerJavaScriptProxy: proxy => { proxies[slot] = proxy; },
    onActive: () => events.push([slot, 'active']), onInactive: () => events.push([slot, 'inactive']),
    setAudioMuted: muted => events.push([slot, 'mute', muted])
  }));
  const View = loadPlatformModule('utils/CardWebView.ets', 'CardWebView', {
    CardWebSession, CardWebBuffer, CARD_SESSION_STORAGE_SNAPSHOT, carryCardSessionStorage,
    媒体基地址: 'https://jidecards-media.local/'
  });
  const switches = [];
  const view = new View(controllers[0], () => {}, assert.fail, controllers[1], slot => switches.push(slot));
  view.attach(0); view.attach(1);
  const done = entry => {
    const [, id, revision] = entry.text.match(/\.start\((\d+),(\d+),/);
    proxies[entry.slot].onRendered(+id, +revision, '', '#102030');
  };
  view.show(html('one'), 1, 'question');
  assert.ok(events.some(event => event[0] === 0 && event[1] === 'mute' && event[2] === true));
  done(loads[0]);
  view.show(html('two'), 2, 'question'); await turn();
  assert.deepEqual(switches, [0]); assert.equal(loads[1].slot, 1);
  assert.match(loads[1].text, /cached/);
  assert.ok(events.some(event => event[0] === 1 && event[1] === 'mute' && event[2] === true));
  done(loads[1]); assert.deepEqual(switches, [0, 1]);
  assert.ok(events.some(event => event[0] === 0 && event[1] === 'inactive'));
  assert.deepEqual(events.at(-1), [1, 'mute', false]);
  view.setAudioEnabled(false);
  view.show(html('background'), 3, 'question'); await turn(); done(loads[2]);
  assert.deepEqual(events.at(-1), [0, 'mute', true], 'late rendering while hidden cannot unmute HTML media');
  view.setAudioEnabled(true);
  assert.ok(events.slice(-2).some(event => event[0] === 0 && event[1] === 'mute' && event[2] === false));
});
