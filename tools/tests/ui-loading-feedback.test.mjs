// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { loadComponentLogic } from './platform-module-harness.mjs';

test('fixed answer footer keeps its button during loading, completion and errors without allowing activation', () => {
  const read = path => readFileSync(new URL('../../entry/src/main/ets/' + path, import.meta.url), 'utf8');
  const page = read('pages/学习页.ets');
  const footer = page.slice(page.indexOf('  private 答案条()'), page.indexOf('  private cardViewportContent()'));
  const condition = footer.match(/if \(([\s\S]*?)\) \{\s*开始学习按钮/)[1];
  const shouldShow = new Function(`return (${condition});`);
  const availability = footer.match(/isAvailable: ([^,\n]+)/)[1];
  const isAvailable = new Function(`return (${availability});`);
  for (const phase of ['loading', 'done', 'error', 'question', 'answer']) {
    for (const choiceQuestion of [null, { choices: [] }]) {
      const state = { 阶段: phase, choiceQuestion };
      const visible = shouldShow.call(state);
      assert.equal(visible, ['loading', 'done', 'error'].includes(phase) || (phase === 'question' && choiceQuestion === null));
      if (visible) assert.equal(isAvailable.call(state), phase === 'question');
    }
  }
  const button = read('components/开始学习按钮.ets');
  assert.match(button, /\.height\(应用尺寸\.行动按钮高度\)/);
  assert.match(button, /\.enabled\(this\.isAvailable\)/);
  assert.match(button, /\.grayscale\(this\.isAvailable \? 0 : 1\)/);
  assert.match(button, /Span\(this\.文案\)\.fontColor\(\$r\('app.color.text_secondary'\)\)/);
  const activate = new Function(button.match(/\.onClick\(\(\) => \{([\s\S]*?)\n    \}\)/)[1]);
  let calls = 0;
  const instance = { isAvailable: false, 开始学习回调: () => { calls++; } };
  activate.call(instance); assert.equal(calls, 0);
  instance.isAvailable = true;
  activate.call(instance); assert.equal(calls, 1);
});

test('short loading unmount cancels feedback; slow loading shows it', () => {
  let callback, delay, cancelled;
  const Indicator = loadComponentLogic('components/common/DelayedLoadingIndicator.ets', 'DelayedLoadingIndicator', {
    $r: key => key, setTimeout: (fn, ms) => { callback = fn; delay = ms; return 7; },
    clearTimeout: id => { cancelled = id; }
  });
  const short = new Indicator(); short.aboutToAppear();
  assert.equal(short.shown, false); assert.equal(delay, 250);
  short.aboutToDisappear(); assert.equal(cancelled, 7); assert.equal(short.shown, false);
  const slow = new Indicator(); slow.aboutToAppear(); callback();
  assert.equal(slow.shown, true); assert.equal(slow.timer, -1);
});

test('home refresh preserves ready/empty presentation while initial load stays loading and failures remain visible', async () => {
  const source = readFileSync(new URL('../../entry/src/main/ets/pages/首页.ets', import.meta.url), 'utf8');
  const start = source.indexOf('  private async 执行加载主页数据(');
  const method = source.slice(start, source.indexOf('\n  }', start) + 4);
  const Page = new Function('$r', stripTypeScriptTypes('class Page {' + method + '}', { mode: 'transform' }) + '; return Page;')(key => ({ id: key }));
  for (const initial of ['ready', 'empty', 'loading', 'error']) {
    let reject;
    const pending = new Promise((_, no) => { reject = no; });
    const page = Object.assign(new Page(), { 加载状态: initial, homeDisposed: false,
      取能力上下文: () => ({ filesDir: '/files', resourceManager: { getStringSync: () => 'Default' } }),
      homeData: { load: () => pending }, 显示提示: () => {} });
    const refresh = page.执行加载主页数据();
    assert.equal(page.加载状态, ['ready', 'empty'].includes(initial) ? initial : 'loading');
    reject(new Error('offline')); await refresh;
    assert.equal(page.加载状态, 'error');
  }
});
