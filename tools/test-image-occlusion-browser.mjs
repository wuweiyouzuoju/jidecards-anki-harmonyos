// SPDX-License-Identifier: AGPL-3.0-or-later
// Real Canvas pixel checks for the same HTML used by study and card preview.
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { 构建卡片HTML } from '../entry/src/main/ets/model/学习卡片HTML构建器.ts';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 900, height: 600 } });
  const img = 'data:image/svg+xml;base64,' + Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="200"><rect width="400" height="200" fill="white"/></svg>').toString('base64');
  const text = '<div id="image-occlusion-container"><img src="' + img + '"><canvas id="image-occlusion-canvas"></canvas></div>' +
    '<div class="cloze" data-shape="rect" data-left=".05" data-top=".1" data-width=".1" data-height=".2"></div>' +
    '<div class="cloze" data-shape="ellipse" data-left=".25" data-top=".1" data-rx=".08" data-ry=".1"></div>' +
    '<div class="cloze" data-shape="polygon" data-left=".55" data-top=".1" data-points="0,0 .15,0 0,.3"></div>' +
    '<div class="cloze-inactive" data-shape="rect" data-left=".8" data-top=".1" data-width=".1" data-height=".2" data-occludeinactive="1"></div>' +
    '<div class="cloze-highlight" data-shape="rect" data-left=".8" data-top=".5" data-width=".1" data-height=".2"></div>' +
    '<div class="cloze-inactive" data-shape="text" data-left=".05" data-top=".7" data-text="Label: 中文" data-font-size=".06"></div>';
  const css = '#image-occlusion-container{position:relative;width:800px}#image-occlusion-container img{width:100%}#image-occlusion-canvas{position:absolute;left:0;top:0;width:100%;height:100%}' +
    '#image-occlusion-canvas{--active-shape-color:#ff0000;--inactive-shape-color:#ffff00;--highlight-shape-color:transparent;--highlight-shape-border:2 #ff0000}';
  const nodes = [{ text, replacement: null }];
  await page.setContent(构建卡片HTML({ css, questionNodes: nodes, answerNodes: nodes, latexSvg: false, isEmpty: false }, 'question', false));
  await page.waitForFunction(() => document.querySelector('#image-occlusion-container img').naturalWidth === 400);
  await page.evaluate(() => window.anki.imageOcclusion.setup());
  const pixels = await page.evaluate(() => {
    const ctx = document.getElementById('image-occlusion-canvas').getContext('2d');
    return [[40,40],[132,40],[224,28],[272,76],[340,40],[340,120],[28,152]].map(([x,y]) => [...ctx.getImageData(x,y,1,1).data]);
  });
  assert.deepEqual(pixels.slice(0,3), [[255,0,0,255],[255,0,0,255],[255,0,0,255]]);
  assert.equal(pixels[3][3], 0, 'outside triangle remains uncovered');
  assert.deepEqual(pixels[4], [255,255,0,255], 'hide-all inactive mask is yellow');
  assert.equal(pixels[5][3], 0, 'answer highlight center reveals the image');
  assert.equal(pixels[6][3], 255, 'text annotation is visible independently');
  mkdirSync('.local', { recursive: true });
  await page.screenshot({ path: '.local/io-preview-browser.png' });
  const toggled = await page.evaluate(() => {
    window.anki.imageOcclusion.toggle();
    const ctx = document.getElementById('image-occlusion-canvas').getContext('2d');
    return [[40,40],[28,152]].map(([x,y]) => ctx.getImageData(x,y,1,1).data[3]);
  });
  assert.deepEqual(toggled, [0,255], 'toggling clears masks but retains text');
  console.log('Image occlusion browser checks passed; screenshot: .local/io-preview-browser.png');
} finally { await browser.close(); }
