// SPDX-License-Identifier: AGPL-3.0-or-later
// PLAYWRIGHT_MODULE 可指向本机 Playwright；验证模板与默认配色在真实 CSS 层叠后的可读性。
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { 构建卡片HTML } from '../entry/src/main/ets/model/学习卡片HTML构建器.ts';
import { 对比度 } from '../entry/src/main/ets/model/色阶生成.ets';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE
  ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
const browser = await chromium.launch({ headless: true, channel: 'msedge' });
const page = await browser.newPage();
await page.route('**/*', route => route.abort());
const cases = [
  { name: 'default', css: '', light: '#1A1A1A', dark: '#E6E6E6' },
  { name: 'standard Anki card', css: '.card { color: black; background-color: white; }',
    light: '#000000', dark: '#000000', background: '#FFFFFF' },
  { name: 'body template', css: 'body { color: #333333; background: #FAFAFA; }',
    light: '#333333', dark: '#333333', background: '#FAFAFA' },
  { name: 'template night mode',
    css: '.card { color: black; background: white; } .nightMode { color: #FFFFFF; background: #222222; }',
    light: '#000000', dark: '#FFFFFF', background: '#FFFFFF', darkBackground: '#222222' },
  { name: 'night card selector',
    css: '.card { color: #333333; background: #FFFFFF; } .card.nightMode { color: #FAFAFA; background: #303030; }',
    light: '#333333', dark: '#FAFAFA', background: '#FFFFFF', darkBackground: '#303030' }
];
const failures = [];
let passed = 0;
try {
  for (const item of cases) {
    for (const dark of [false, true]) {
      for (const side of ['question', 'answer']) {
        const text = '<div id="text">卡片正文 Card text</div><span id="emphasis" style="color:#D05030">重点</span>';
        const node = { text, replacement: null };
        const card = { questionNodes: [node], answerNodes: [node], css: item.css,
          latexSvg: false, isEmpty: false };
        // 只隔离不参与 CSS 层叠的媒体/公式脚本；样式与正文使用真实构建器输出。
        const html = 构建卡片HTML(card, side, dark).replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
        await page.setContent(html);
        const actual = await page.evaluate(() => {
          const toHex = value => '#' + value.match(/\d+/g).slice(0, 3)
            .map(channel => Number(channel).toString(16).padStart(2, '0')).join('').toUpperCase();
          return {
            text: toHex(getComputedStyle(document.querySelector('#text')).color),
            emphasis: toHex(getComputedStyle(document.querySelector('#emphasis')).color),
            background: getComputedStyle(document.body).backgroundColor
          };
        });
        const name = `${item.name} / ${dark ? 'dark' : 'light'} / ${side}`;
        try {
          assert.equal(actual.text, dark ? item.dark : item.light, name);
          assert.equal(actual.emphasis, '#D05030', 'preserve explicit field colors');
          const expectedBackground = (dark && item.darkBackground) || item.background;
          let background = dark ? '#18202B' : '#FFFFFF';
          if (expectedBackground) {
            background = '#' + actual.background.match(/\d+/g).slice(0, 3)
              .map(channel => Number(channel).toString(16).padStart(2, '0')).join('').toUpperCase();
            assert.equal(background, expectedBackground, name);
            assert.notEqual(actual.background, 'rgba(0, 0, 0, 0)', name);
          } else {
            assert.equal(actual.background, 'rgba(0, 0, 0, 0)', name);
          }
          assert.ok(对比度(actual.text, background) >= 4.5, `${name}: text contrast`);
          passed++;
        } catch (error) {
          failures.push(`${name}: ${error.message}`);
        }
      }
    }
  }
  console.log(JSON.stringify({ passed, failures }, null, 2));
  assert.deepEqual(failures, []);
} finally {
  await browser.close();
}
