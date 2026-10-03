// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadComponentLogic } from './platform-module-harness.mjs';
import { agentSuggestionKey, AGENT_SUGGESTION_COUNT, AGENT_SUGGESTION_HOLD_MS,
  AGENT_SUGGESTION_FADE_MS } from '../../entry/src/main/ets/model/agent/AgentSuggestions.ts';

const read = path => readFileSync(new URL('../../' + path, import.meta.url), 'utf8');
const resources = locale => new Map(JSON.parse(read(`entry/src/main/resources/${locale}/element/string.json`))
  .string.map(item => [item.name, item.value]));
const zh = resources('base');
const TouchType = { Down: 0, Up: 1, Move: 2, Cancel: 3 };

function harness(copy = async () => {}) {
  const timers = new Map(), copied = [], toasts = [];
  let now = 0, next = 0;
  const Component = loadComponentLogic('components/agent/AgentEmptySuggestions.ets', 'AgentEmptySuggestions', {
    agentSuggestionKey, AGENT_SUGGESTION_COUNT, AGENT_SUGGESTION_HOLD_MS, AGENT_SUGGESTION_FADE_MS,
    TouchType, namedResourceText: (_context, key) => zh.get(key),
    resourceText: (_context, key, text) => zh.get(key.replace('app.string.', '')).replace('%s', text),
    $r: key => key, showToastSafely: (_context, options) => toasts.push(options.message),
    pasteboard: { MIMETYPE_TEXT_PLAIN: 'text/plain', createData: (_type, text) => text,
      getSystemPasteboard: () => ({ setData: async text => { copied.push(text); await copy(); } }) },
    setTimeout: (callback, delay) => { const id = ++next; timers.set(id, { callback, at: now + delay }); return id; },
    clearTimeout: id => timers.delete(id)
  });
  const component = new Component();
  component.getUIContext = () => ({});
  component.isPageVisible = true;
  component.aboutToAppear();
  component.suggestionIndex = 0;
  const advance = duration => {
    const target = now + duration;
    while (true) {
      const due = [...timers.entries()].filter(([, task]) => task.at <= target).sort((a, b) => a[1].at - b[1].at)[0];
      if (!due) break;
      const [id, task] = due;
      timers.delete(id); now = task.at; task.callback();
    }
    now = target;
  };
  return { component, timers, copied, toasts, advance };
}

test('all 60 localized suggestions are unique, interleaved, and exclude online capabilities', () => {
  const keys = Array.from({ length: AGENT_SUGGESTION_COUNT }, (_, index) => agentSuggestionKey(index));
  assert.equal(keys.length, 60);
  assert.equal(new Set(keys).size, 60);
  assert.equal(agentSuggestionKey(60), keys[0]);
  assert.equal(agentSuggestionKey(-1), keys[59]);
  for (let index = 0; index < 60; index++) {
    assert.equal(Math.floor((Number(keys[index].slice(-2)) - 1) / 6), index % 10);
  }
  for (const locale of ['base', 'en_US']) {
    const strings = resources(locale), values = keys.map(key => strings.get(key));
    assert.ok(values.every(value => typeof value === 'string' && value.length > 0));
    assert.equal(new Set(values).size, 60);
    for (const value of values) assert.doesNotMatch(value, /联网|网页|在线配图|Wikimedia|https?:|internet|webpage|online search/i);
  }
  assert.equal(zh.get('ai_agent_suggestion_copied'), '已复制');
  assert.equal(zh.get('ai_agent_suggestion_quote'), '“%s”');
  assert.equal(resources('en_US').get('ai_agent_suggestion_quote'), '"%s"');
});

test('single suggestion holds for ten seconds, fades, and completes a cycle without repeats', () => {
  const h = harness(), c = h.component, seen = new Set([c.suggestionText()]);
  h.advance(9999); assert.equal(c.suggestionIndex, 0); assert.equal(c.textOpacity, 1);
  h.advance(1); assert.equal(c.suggestionIndex, 0); assert.equal(c.textOpacity, 0);
  h.advance(299); assert.equal(c.suggestionIndex, 0);
  h.advance(1); assert.equal(c.suggestionIndex, 1); assert.equal(c.textOpacity, 1);
  seen.add(c.suggestionText());
  for (let index = 2; index < 60; index++) { h.advance(10300); seen.add(c.suggestionText()); }
  assert.equal(seen.size, 60);
  h.advance(10300); assert.equal(c.suggestionIndex, 0); assert.equal(h.timers.size, 1);
});

test('hover and touch each pause rotation, move events do not resume it, and cancellation resumes a full hold', () => {
  const h = harness(), c = h.component;
  c.hoverChanged(true); c.touchChanged(TouchType.Down);
  c.hoverChanged(false); h.advance(30000); assert.equal(c.suggestionIndex, 0); assert.equal(h.timers.size, 0);
  c.touchChanged(TouchType.Move); assert.equal(h.timers.size, 0);
  c.touchChanged(TouchType.Cancel); h.advance(9999); assert.equal(c.suggestionIndex, 0);
  h.advance(301); assert.equal(c.suggestionIndex, 1);
});

test('pausing during fade preserves the visible sentence and invalidates an already queued callback', () => {
  const h = harness(), c = h.component;
  h.advance(10000); const stale = [...h.timers.values()][0].callback;
  c.touchChanged(TouchType.Down); stale();
  assert.equal(c.textOpacity, 1); assert.equal(c.suggestionIndex, 0); assert.equal(h.timers.size, 0);
  c.touchChanged(TouchType.Up); h.advance(10300); assert.equal(c.suggestionIndex, 1);
});

test('long press copies the full current sentence once and pauses until the clipboard write completes', async () => {
  let finish;
  const pending = new Promise(resolve => { finish = resolve; });
  const h = harness(() => pending), c = h.component, text = c.suggestionText();
  assert.equal(c.displayedSuggestionText(), `“${text}”`);
  c.touchChanged(TouchType.Down);
  const copying = c.copySuggestion(); await c.copySuggestion();
  c.touchChanged(TouchType.Up); h.advance(30000);
  assert.deepEqual(h.copied, [text]); assert.equal(c.suggestionIndex, 0); assert.equal(h.timers.size, 0);
  finish(); await copying;
  assert.deepEqual(h.toasts, ['app.string.ai_agent_suggestion_copied']);
  h.advance(10300); assert.equal(c.suggestionIndex, 1);
});

test('clipboard failure reports failure and leaves the component able to rotate and retry', async () => {
  const h = harness(async () => { throw new Error('clipboard unavailable'); }), c = h.component;
  await c.copySuggestion();
  assert.deepEqual(h.toasts, ['app.string.redemption_copy_failed']);
  assert.equal(c.isCopying, false); assert.equal(h.timers.size, 1);
  h.advance(10300); assert.equal(c.suggestionIndex, 1);
});

test('hidden destinations and unmounted components cancel work, including late copy completion', async () => {
  let finish;
  const h = harness(() => new Promise(resolve => { finish = resolve; })), c = h.component;
  h.advance(10000); const stale = [...h.timers.values()][0].callback;
  c.isPageVisible = false; c.visibilityChanged(); stale(); h.advance(30000);
  assert.equal(c.suggestionIndex, 0); assert.equal(h.timers.size, 0);
  await c.copySuggestion(); assert.equal(h.copied.length, 0);
  c.isPageVisible = true; c.visibilityChanged();
  const copying = c.copySuggestion(); c.aboutToDisappear(); finish(); await copying;
  assert.equal(h.timers.size, 0); assert.deepEqual(h.toasts, []);
  c.restartRotation(); h.advance(30000); assert.equal(c.suggestionIndex, 0);
});

test('empty suggestions mount only in an empty assistant conversation and use native visibility and long press', () => {
  const page = read('entry/src/main/ets/pages/AI制卡页.ets');
  assert.match(page, /if \(this\.pageMode === 'assistant' && this\.消息列表\.length === 0\) \{\s*AgentEmptySuggestions\(/);
  assert.match(page, /if \(this\.显示历史区\) \{\s*this\.历史区\(\)\s*\} else/);
  assert.match(page, /onShown\(\(\): void => \{ appInterface.showPage\('agent'\); this\.isAgentPageVisible = true; this\.publishInterface\(\); \}\)/);
  assert.match(page, /onHidden\(\(\): void => \{ appInterface.hidePage\('agent'\); this\.isAgentPageVisible = false; \}\)/);
  const component = read('entry/src/main/ets/components/agent/AgentEmptySuggestions.ets');
  assert.equal((component.match(/\bText\(/g) ?? []).length, 1);
  assert.match(component, /LongPressGesture\(\{ repeat: false, duration: 500 \}\)/);
  assert.doesNotMatch(component, /Button\(|TextInput\(|TextArea\(|\.onClick\(|AgentRunner/);
});
