// SPDX-License-Identifier: AGPL-3.0-or-later
// 实际浏览器覆盖 Anki 样式字段中的脚本及完整 jQuery；所有资源仅由本地提供。
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { 构建卡片HTML } from '../entry/src/main/ets/model/学习卡片HTML构建器.ts';
import { MATH_ASSET_BASE } from '../entry/src/main/ets/model/MathRendering.ts';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE
  ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
const browser = await chromium.launch({ headless: true, channel: 'msedge' });
const errors = [];
const unexpected = [];
let passed = 0;
try {
  for (const reopen of [false, true]) for (const dark of [false, true]) for (const side of ['question', 'answer']) {
    const context = await browser.newContext();
    await context.route('**/*', route => {
      const url = route.request().url();
      let file = '';
      if (url === 'https://jidecards-render.local/jquery/3.7.1/jquery.min.js') file = 'jquery/jquery-3.7.1.min.js';
      for (const name of ['card-math.js', 'tex-svg-full.js', 'input/mml.js', 'input/mml/entities.js']) {
        if (url === MATH_ASSET_BASE + name) file = 'mathjax/' + name;
      }
      if (file) return route.fulfill({ contentType: 'text/javascript',
        body: readFileSync(new URL('../entry/src/main/resources/rawfile/' + file, import.meta.url)) });
      unexpected.push(url);
      return route.abort();
    });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    const css = '.card{color:#123456;background:white}</style><script>' +
      'window.templateVersion=$.fn.jquery;window.templateCalls=0;' +
      'window.decorateTemplate=function(){window.templateCalls++;$("#content").text("模板已执行");};' +
      '</script>' + (reopen ? '<style>.card{line-height:1.6}' : '');
    const nodes = [{ text: '<div id="content"></div><button id="show">显示答案</button>' +
      `<script>decorateTemplate();$('#show').on('click',function(){$('#content').text('${side} 答案');});</script>`,
      replacement: null }];
    const html = 构建卡片HTML({ questionNodes: nodes, answerNodes: nodes, css, latexSvg: false, isEmpty: false }, side, dark);
    await page.setContent(html);
    assert.equal(await page.locator('body').innerText(), '模板已执行\n显示答案');
    const actual = await page.evaluate(() => ({ version: window.templateVersion, calls: window.templateCalls,
      ajax: typeof $.getScript, color: getComputedStyle(document.body).color,
      background: getComputedStyle(document.body).backgroundColor, padding: getComputedStyle(document.body).padding }));
    assert.deepEqual(actual, { version: '3.7.1', calls: 1, ajax: 'function', color: 'rgb(18, 52, 86)',
      background: 'rgb(255, 255, 255)', padding: '20px 16px' });
    await page.locator('#show').click();
    assert.equal(await page.locator('#content').innerText(), `${side} 答案`);
    passed++;
    const alignmentCases = [
      { name: 'unstyled', css: '', expected: ['start', 'start', 'start', 'left'] },
      { name: 'standard Anki card', css: '.card { text-align: center; }', expected: ['center', 'center', 'start', 'left'] },
      { name: 'card left', css: '.card { text-align: left; }', expected: ['left', 'left', 'start', 'left'] },
      { name: 'body left', css: 'body { text-align: left; }', expected: ['left', 'left', 'start', 'left'] },
      { name: 'body right', css: 'body { text-align: right; }', expected: ['right', 'right', 'start', 'left'] },
      { name: 'container override', css: '.card { text-align: center; } #qa { text-align: left; }',
        expected: ['center', 'left', 'start', 'left'] },
      { name: 'field override', css: '.card { text-align: center; } #alignment-text { text-align: right; }',
        expected: ['center', 'right', 'start', 'left'] },
      { name: 'template list/code overrides', css: 'li { text-align: center; } pre { text-align: right; }',
        expected: ['start', 'start', 'center', 'right'] },
      { name: 'RTL template', css: '.card { direction: rtl; }', direction: 'rtl',
        expected: ['start', 'start', 'start', 'left'] },
      { name: 'inline field override', css: '.card { text-align: center; }', inline: 'text-align: left',
        expected: ['center', 'left', 'start', 'left'] }
    ];
    for (const scenario of alignmentCases) {
      const nodes = [{ text: `<p id="alignment-text" style="${scenario.inline ?? ''}">Card text</p>
        <ul><li id="alignment-list">List item</li></ul><pre id="alignment-code">x = 1</pre>`, replacement: null }];
      const card = { questionNodes: nodes, answerNodes: nodes, css: scenario.css, latexSvg: false, isEmpty: false };
      await page.setContent(构建卡片HTML(card, side, dark));
      const actual = await page.evaluate(() => ({
        alignment: [document.body, ...['alignment-text', 'alignment-list', 'alignment-code']
          .map(id => document.getElementById(id))].map(element => getComputedStyle(element).textAlign),
        direction: getComputedStyle(document.getElementById('alignment-list')).direction,
        maxWidth: getComputedStyle(document.getElementById('qa')).maxWidth
      }));
      assert.deepEqual(actual.alignment, scenario.expected, `${scenario.name}, ${side}, dark=${dark}`);
      assert.equal(actual.direction, scenario.direction ?? 'ltr');
      assert.equal(actual.maxWidth, 'none', 'card content is not constrained by an application reading width');
      passed++;
    }
    await context.close();
  }
  assert.deepEqual(errors, []);
  assert.deepEqual(unexpected, []);
  console.log(JSON.stringify({ passed, errors, unexpected }));
} finally {
  await browser.close();
}
