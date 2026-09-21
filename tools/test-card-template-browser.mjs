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
    await context.close();
  }
  assert.deepEqual(errors, []);
  assert.deepEqual(unexpected, []);
  console.log(JSON.stringify({ passed, errors, unexpected }));
} finally {
  await browser.close();
}
