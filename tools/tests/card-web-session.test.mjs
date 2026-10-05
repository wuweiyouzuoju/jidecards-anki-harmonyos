// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { CardWebSession } from '../../entry/src/main/ets/model/CardWebSession.ts';
import { CARD_REVIEWER_RUNTIME } from '../../entry/src/main/ets/model/CardReviewerRuntime.ts';
import { loadPlatformModule } from './platform-module-harness.mjs';

const html = side => `<html><head></head><body><div id="qa">${side}</div></body></html>`;

test('renderer starts unanchored answers at the top and preserves answer anchors and preview scrolling', async () => {
  for (const initial of [true, false]) {
    for (const scenario of [
      { side: 'question', scroll: true, anchored: true, expected: [['top', 0, 0]] },
      { side: 'answer', scroll: true, anchored: false, expected: [['top', 0, 0]] },
      { side: 'answer', scroll: true, anchored: true, expected: [['anchor', 'start']] },
      { side: 'answer', scroll: false, anchored: false, expected: [] }
    ]) {
      const scrolls = [];
      const qa = { innerHTML: '', querySelectorAll: () => [] };
      const document = {
        createElement: () => ({ getContext: () => null }),
        body: { className: 'card', scrollHeight: 3200 },
        querySelectorAll: () => [],
        getElementById: id => id === 'qa' ? qa : scenario.anchored
          ? { scrollIntoView: options => scrolls.push(['anchor', options.block]) } : null
      };
      let onLoad, acknowledge;
      const window = {
        requestAnimationFrame: callback => setImmediate(callback),
        addEventListener: (_event, callback) => { onLoad = callback; },
        scrollTo: (x, y) => scrolls.push(['top', x, y]),
        jideCardRuntime: { onRendered: (_id, _revision, error) => acknowledge(error) }
      };
      const DOMParser = class { parseFromString() { return document; } };
      vm.runInNewContext(CARD_REVIEWER_RUNTIME, { window, document, DOMParser });
      const start = new Promise(resolve => { acknowledge = resolve; });
      window.__jideCardReviewer.start(1, 1, initial ? scenario.side : 'question', scenario.scroll);
      onLoad();
      assert.equal(await start, '');
      if (!initial) {
        scrolls.length = 0;
        const update = new Promise(resolve => { acknowledge = resolve; });
        window.__jideCardReviewer.update(1, 2, html(scenario.side), scenario.side, scenario.scroll);
        assert.equal(await update, '');
      }
      assert.deepEqual(scrolls, scenario.expected, JSON.stringify({ initial, ...scenario }));
    }
  }
});

function harness() {
  const loads = [], updates = [], shown = [], errors = [], backgrounds = [];
  const session = new CardWebSession({
    load: text => {
      const [, id, revision] = text.match(/\.start\((\d+),(\d+),/);
      loads.push({ id: +id, revision: +revision, text });
    },
    evaluate: async script => vm.runInNewContext(script, { window: { __jideCardReviewer: {
      update: (id, revision, text, side, scroll) => updates.push({ id, revision, text, side, scroll })
    } } }),
    shown: background => { shown.push(true); backgrounds.push(background); }, failed: message => errors.push(message)
  });
  const done = (item, error = '', background = '') => session.rendered(item.id, item.revision, error, background);
  return { session, loads, updates, shown, errors, backgrounds, done };
}

test('only the current completed surface publishes a validated opaque background', () => {
  const h = harness();
  h.session.show(html('dark'), 1, 'question');
  h.done(h.loads[0], '', '#101820');
  h.session.show(html('answer'), 1, 'answer');
  h.done(h.loads[0], '', '#ffffff');
  assert.deepEqual(h.backgrounds, ['#101820'], 'old side does not replace the active background');
  h.done(h.updates[0], '', '#203040');
  h.session.show(html('next'), 2, 'question');
  h.done(h.loads[1], '', 'url(untrusted)');
  assert.deepEqual(h.backgrounds, ['#101820', '#203040', '']);
  h.session.reset();
  h.done(h.loads[1], '', '#ffffff');
  assert.equal(h.backgrounds.length, 3, 'invalidated document cannot publish a background');
});

test('render acknowledgement waits for two animation frames after asynchronous hooks', async () => {
  const frames = [], acknowledgements = [];
  let load;
  const document = { createElement: () => ({ getContext: () => null }),
    getElementById: () => ({}), body: {}, querySelectorAll: () => [] };
  const window = { addEventListener: (_event, callback) => { load = callback; }, scrollTo() {},
    requestAnimationFrame: callback => frames.push(callback),
    jideCardRuntime: { onRendered: (...args) => acknowledgements.push(args) } };
  vm.runInNewContext(CARD_REVIEWER_RUNTIME, { window, document });
  window.__jideCardReviewer.start(7, 12, 'question', false); load();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(frames.length, 1); assert.deepEqual(acknowledgements, []);
  frames.shift()(); assert.deepEqual(acknowledgements, []);
  frames.shift()(); assert.deepEqual(acknowledgements, [[7, 12, '', '']]);
});

test('same card flips through JavaScript, a new card or reset gets a new document', () => {
  const h = harness();
  h.session.show(html('q'), 1, 'question'); h.done(h.loads[0]);
  h.session.show(html('a'), 1, 'answer', true);
  assert.equal(h.loads.length, 1);
  assert.equal(h.updates[0].text, html('a'));
  assert.equal(h.updates[0].scroll, true);
  h.done(h.updates[0]);
  assert.equal(h.shown.length, 2);
  h.session.show(html('next'), 2, 'question');
  assert.equal(h.loads.length, 2);
  h.session.reset();
  h.done(h.loads[1], 'late failure');
  assert.deepEqual(h.errors, []);
  h.session.show(html('edited'), 2, 'question');
  assert.equal(h.loads.length, 3);
});

test('early flips wait for initial scripts and rapid updates serialize the latest side', () => {
  const h = harness();
  h.session.show(html('q'), 1, 'question');
  h.session.show(html('a'), 1, 'answer');
  assert.equal(h.updates.length, 0);
  h.done(h.loads[0]);
  assert.equal(h.shown.length, 0);
  h.session.show(html('q2'), 1, 'question');
  h.session.show(html('a2'), 1, 'answer');
  assert.equal(h.updates.length, 1);
  h.done(h.updates[0]);
  assert.equal(h.updates[1].text, html('a2'));
  h.done(h.updates[1]); h.done(h.updates[1]);
  assert.equal(h.shown.length, 1, 'duplicate completion is ignored');
});

test('old completions cannot flush a new document; current script errors stay visible', () => {
  const h = harness();
  h.session.show(html('q'), 1, 'question');
  h.session.show(html('a'), 1, 'answer');
  h.session.show(html('new'), 2, 'question');
  h.done(h.loads[0]);
  assert.equal(h.updates.length, 0);
  h.done(h.loads[1], 'script failed');
  assert.deepEqual(h.errors, ['script failed']);
  assert.equal(h.shown.length, 0);
  h.session.show(html('retry'), 2, 'question');
  assert.equal(h.loads.length, 3, 'retry recreates the broken document');
});

test('ArkWeb adapter installs its bridge before loading and shares the media origin', async () => {
  const loads = [], scripts = [];
  let proxy, shown = 0;
  const backgrounds = [];
  const View = loadPlatformModule('utils/CardWebView.ets', 'CardWebView', {
    CardWebSession, 媒体基地址: 'https://jidecards-media.local/'
  });
  const view = new View({
    registerJavaScriptProxy: (p, name, methods) => {
      proxy = p; assert.equal(name, 'jideCardRuntime'); assert.deepEqual(methods, ['onRendered']);
    },
    loadData: (...args) => loads.push(args), runJavaScript: async script => { scripts.push(script); return ''; }
  }, background => { shown++; backgrounds.push(background); }, assert.fail);
  view.attach(); view.show(html('q'), 1, 'question');
  assert.equal(loads[0][3], 'https://jidecards-media.local/');
  const [, id, revision] = loads[0][0].match(/\.start\((\d+),(\d+),/);
  proxy.onRendered(+id, +revision, '', '#101820');
  assert.equal(shown, 1);
  assert.deepEqual(backgrounds, ['#101820']);
  view.show(html('a'), 1, 'answer');
  assert.equal(loads.length, 1); assert.equal(scripts.length, 1);
});

test('sync and async evaluation failures are reported and a failed initial load can be retried', async () => {
  for (const sync of [false, true]) {
    const errors = [];
    const session = new CardWebSession({ load() {}, shown() {}, failed: error => errors.push(error),
      evaluate() { if (sync) throw new Error('evaluation'); return Promise.reject(new Error('evaluation')); } });
    session.show(html('q'), 1, 'question'); session.rendered(1, 1, '');
    session.show(html('a'), 1, 'answer');
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(errors, ['Error: evaluation']);
  }
  let fail = true, loads = 0;
  const session = new CardWebSession({ load() { loads++; if (fail) throw new Error('load'); },
    shown() {}, failed: assert.fail, evaluate: async () => '' });
  assert.throws(() => session.show(html('q'), 1, 'question'), /load/);
  fail = false; session.show(html('retry'), 1, 'question');
  assert.equal(loads, 2);
});

test('study and preview use the shared renderer instead of reloading on flips', () => {
  for (const path of ['pages/学习页.ets', 'components/browser/卡片预览页.ets']) {
    const text = readFileSync(new URL('../../entry/src/main/ets/' + path, import.meta.url), 'utf8');
    assert.match(text, /new CardWebView\(/);
    assert.match(text, /this\.cardWeb\.show\(/);
    assert.match(text, /this\.cardWeb\.reset\(/);
    assert.doesNotMatch(text, /this\.网页控制器\.loadData\(/);
  }
});
