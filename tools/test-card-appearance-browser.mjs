// SPDX-License-Identifier: AGPL-3.0-or-later
import assert from 'node:assert/strict';
import { 构建卡片HTML } from '../entry/src/main/ets/model/学习卡片HTML构建器.ts';
import { createCardBrowserHarness, launchCardBrowser } from './card-browser-harness.mjs';

const browser = await launchCardBrowser();
let passed = 0;
const snapshot = page => page.evaluate(() => ({
  rootTheme: document.documentElement.dataset.bsTheme,
  rootNight: document.documentElement.classList.contains('night-mode'),
  aliases: ['nightMode', 'night_mode'].map(name => document.body.classList.contains(name)),
  text: getComputedStyle(document.getElementById('text')).color,
  rootBackground: getComputedStyle(document.documentElement).backgroundColor,
  bodyBackground: getComputedStyle(document.body).backgroundColor,
  scriptTheme: window.scriptTheme,
  scriptDefault: window.scriptDefault
}));
try {
  const fresh = await createCardBrowserHarness(browser);
  const flip = await createCardBrowserHarness(browser);
  const nodes = [{text: '<div id="text">Answer</div><script>' +
    'window.scriptTheme=document.documentElement.dataset.bsTheme;' +
    'window.scriptDefault=getComputedStyle(document.body).color;' +
    'window.sentinel=window.sentinel||{flips:0};sentinel.flips++;' +
    '</script>', replacement: null}];
  let key = 0;
  // Loading an answer directly and reaching it through an existing document must agree.
  for (const width of [390, 1280]) for (const initialDark of [false, true]) {
    await fresh.page.setViewportSize({width, height: 800});
    await flip.page.setViewportSize({width, height: 800});
    const card = {questionNodes: nodes, answerNodes: nodes, css: '', latexSvg: false};
    flip.session.reset();
    const cardKey = ++key;
    await flip.show(构建卡片HTML(card, 'question', initialDark), cardKey, 'question');
    await flip.page.evaluate(() => document.documentElement.classList.add('template-owned'));
    const startNavigations = flip.navigations;
    let flips = 1;
    for (const dark of [!initialDark, initialDark, !initialDark]) {
      const background = dark ? '#101820' : '#FFF4CC';
      const html = 构建卡片HTML(card, 'answer', dark, background);
      await fresh.show(html, ++key, 'answer');
      await flip.show(html, cardKey, 'answer');
      const actual = await snapshot(flip.page);
      assert.deepEqual(actual, await snapshot(fresh.page), `fresh/flip equivalence: width=${width}, dark=${dark}`);
      assert.equal(actual.rootTheme, dark ? 'dark' : 'light');
      assert.equal(actual.rootNight, dark);
      assert.deepEqual(actual.aliases, [dark, dark]);
      assert.equal(await flip.page.evaluate(() => document.documentElement.classList.contains('template-owned')), true);
      assert.equal(await flip.page.evaluate(() => sentinel.flips), ++flips, 'template globals survive');
      assert.equal(flip.navigations, startNavigations, 'appearance updates keep the current document');
      passed++;
    }
  }
  await fresh.close(); await flip.close();
  for (const hook of ['onUpdateHook', 'onShownHook']) for (const initial of [false, true]) {
    const failed = await createCardBrowserHarness(browser);
    const node = {text: `<script>${hook}.push(function(){return Promise.reject(new Error('answer failed'));});</script>`, replacement: null};
    const card = {questionNodes: [], answerNodes: [node], css: '', latexSvg: false};
    if (!initial) await failed.show(构建卡片HTML(card, 'question'), 1, 'question');
    await assert.rejects(failed.show(构建卡片HTML(card, 'answer'), 1, 'answer'));
    assert.deepEqual(failed.failures, ['Error: answer failed'], 'a rejected template hook is a render failure');
    passed++;
    await failed.close();
  }
  const broken = await createCardBrowserHarness(browser);
  const plain = {questionNodes: [], answerNodes: [], css: '', latexSvg: false};
  const html = 构建卡片HTML(plain, 'question');
  await broken.show(html, 1, 'question');
  await assert.rejects(broken.show(html.replace(/<style id="jide-card-appearance">[\s\S]*?<\/style>/, ''), 1, 'answer'));
  assert.deepEqual(broken.failures, ['Error: Missing card appearance stylesheet']);
  await broken.close(); passed++;
  console.log(JSON.stringify({passed, scenarios: 'fresh/flip equivalence, theme aliases, script-visible context, template state and render failures'}));
} finally { await browser.close(); }
