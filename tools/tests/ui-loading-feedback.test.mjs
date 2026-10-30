// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { loadComponentLogic } from './platform-module-harness.mjs';

test('fixed answer footer keeps one 52vp action slot for loading, completion and errors', () => {
  const read = path => readFileSync(new URL('../../entry/src/main/ets/' + path, import.meta.url), 'utf8');
  const page = read('pages/学习页.ets');
  const footer = page.slice(page.indexOf('  private 答案条()'), page.indexOf('  private cardViewportContent()'));
  assert.match(footer, /if \(this\.choiceQuestion === null\) \{\s*StudyAnswerActionBar\(/);
  assert.match(footer, /stage: this\.阶段/);
  const group = read('components/StudyAnswerActionBar.ets');
  assert.match(group, /\.height\(应用尺寸\.行动按钮高度\)/);
  assert.match(group, /private showAnswerEnabled\(\): boolean \{ return this\.stage === 'question' && !this\.busy; \}/);
  assert.match(group, /\.enabled\(enabled\)/);
  assert.match(group, /\$r\('app\.string\.study_show_answer'\)/);
  for (const label of ['rating_again', 'rating_hard', 'rating_good', 'rating_easy']) {
    assert.match(group, new RegExp(`app\\.string\\.${label}`), label);
  }
  assert.doesNotMatch(group, /session|setTimeout|animateTo/, 'loading and answer states do not wait for an animation');
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

test('study and browser loading layers retain existing card content while blocking stale input', () => {
  const read = path => readFileSync(new URL('../../entry/src/main/ets/' + path, import.meta.url), 'utf8');
  for (const [path, start, end] of [
    ['pages/学习页.ets', "      if (this.recoveryMessage === '' && (this.阶段 === 'loading' || (this.cardRenderPending &&", "      if (this.阶段 === 'error')"],
    ['components/browser/卡片预览页.ets', '// Loading 覆盖层', '// 错误覆盖层']
  ]) {
    const source = read(path);
    const overlay = source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start)));
    const expression = overlay.match(/\.backgroundColor\((.*)\)/)[1];
    const background = new Function('Color', '$r', `return (${expression});`);
    for (const color of ['', '#101820', '#ffffff']) {
      assert.equal(background.call({ hasRenderedCard: false, cardSurfaceBackground: color },
        { Transparent: 'transparent' }, key => key), color || 'app.color.surface_card');
      assert.equal(background.call({ hasRenderedCard: true, cardSurfaceBackground: color },
        { Transparent: 'transparent' }, key => key), 'transparent', path);
    }
    assert.match(overlay, /DelayedLoadingIndicator\(/);
    assert.match(overlay, /hitTestBehavior\(HitTestMode\.Block\)/);
  }
  const study = read('pages/学习页.ets');
  const card = study.slice(study.indexOf('  private 卡片区()'), study.indexOf('  private 答案条()'));
  const expression = card.match(/\.visibility\((.*)\)/)[1];
  const visibility = new Function('Visibility', `return (${expression});`);
  for (const phase of ['loading', 'question', 'answer', 'done', 'error']) {
    assert.equal(visibility.call({ 阶段: phase }, { Visible: true, Hidden: false }),
      ['loading', 'question', 'answer'].includes(phase));
  }
});

test('home refresh preserves ready/empty presentation while initial load stays loading and failures remain visible', async () => {
  const source = readFileSync(new URL('../../entry/src/main/ets/pages/首页.ets', import.meta.url), 'utf8');
  const start = source.indexOf('  private async 执行加载主页数据(');
  const method = source.slice(start, source.indexOf('\n  }', start) + 4);
  const Page = new Function('$r', stripTypeScriptTypes('class Page {' + method + '}', { mode: 'transform' }) + '; return Page;')(key => ({ id: key }));
  for (const initial of ['ready', 'empty', 'loading', 'error']) {
    let reject;
    const pending = new Promise((_, no) => { reject = no; });
    const page = Object.assign(new Page(), { 加载状态: initial, homeDisposed: false, homeDataGeneration: 0,
      取能力上下文: () => ({ filesDir: '/files', resourceManager: { getStringSync: () => 'Default' } }),
      homeData: { load: () => pending }, 显示提示: () => {} });
    const refresh = page.执行加载主页数据();
    assert.equal(page.加载状态, ['ready', 'empty'].includes(initial) ? initial : 'loading');
    reject(new Error('offline')); await refresh;
    assert.equal(page.加载状态, 'error');
  }
});
