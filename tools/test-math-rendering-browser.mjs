// SPDX-License-Identifier: AGPL-3.0-or-later
// 用真实浏览器验证 HTML 构建器；所有资源由本地提供，任何意外联网都会失败。
// node --experimental-transform-types --import ./tools/tests/register-ts-hook.mjs tools/test-math-rendering-browser.mjs
import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { 构建卡片HTML } from '../entry/src/main/ets/model/学习卡片HTML构建器.ets';
import { MATH_ASSET_BASE } from '../entry/src/main/ets/model/MathRendering.ts';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
const output = new URL('../tmp/math-rendering/', import.meta.url);
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: 'msedge' });
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
const unexpected = [];
const errors = [];
const requested = new Set();
const question = String.raw`
<h2>数学 · 化学</h2>
<div id="fraction">\(\frac{-b\pm\sqrt{b^2-4ac}}{2a}\)</div>
<div id="mathml"><math xmlns="http://www.w3.org/1998/Math/MathML"><mfrac><mi>x</mi><mn>2</mn></mfrac></math></div>
<div id="matrix">\[\begin{pmatrix}1&2\\3&4\end{pmatrix}\]</div>
<div id="integral">\[\int_0^1 x^2\,dx=\frac13\]</div>
<div id="chem">\(\ce{^{14}_{6}C -> ^{14}_{7}N + e-}\)</div>
<div id="reaction">\[\ce{2H2 + O2 ->[点燃] 2H2O}\]</div>
<div id="charge">\(\ce{SO4^2- + Ba^2+ -> BaSO4 v}\)</div>
<div id="units">\(\pu{1.2e3 kJ mol-1}\)</div>
<div id="macro">\(\R^2\)</div>
<div id="cloze">\(x+\class{cloze}{[...]}=3\)</div>
<div id="dollar">$x^2$ and $$E=mc^2$$</div>
<pre id="code">\(literal\)</pre>
<div id="long">\[\underbrace{a+a+a+a+a+a+a+a+a+a+a+a+a+a+a+a+a+a+a+a+a+a+a+a+a+a+a+a+a+a}_{30}\]</div>
<div id="legacy"><img class="latex" src="latex-existing.svg" alt="legacy x"></div>
<div id="missing"><img class="latex" src="latex-missing.svg" alt="x^2"></div>
<script>
MathJax.config.tex.macros = {R: '{\\mathbb{R}}'};
if (typeof is_already_run == 'undefined') {
  is_already_run = true;
  MathJax.startup.getComponents();
}
</script>`;
const answer = question + String.raw`<hr id="answer"><div id="solution">\[\begin{aligned}x+2&=3\\x&=1\end{aligned}\]</div>`;
let html = '';
await context.route('**/*', async (route) => {
  const url = route.request().url();
  requested.add(url);
  if (url === 'https://jidecards-media.local/test') {
    return route.fulfill({ contentType: 'text/html', body: html });
  }
  for (const name of ['card-math.js', 'tex-svg-full.js', 'input/mml.js', 'input/mml/entities.js']) {
    if (url === MATH_ASSET_BASE + name) {
      return route.fulfill({ contentType: 'text/javascript', body: await readFile(new URL('../entry/src/main/resources/rawfile/mathjax/' + name, import.meta.url)) });
    }
  }
  if (url === 'https://jidecards-media.local/latex-existing.svg') {
    return route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="50" height="20"><text y="15">x = 1</text></svg>' });
  }
  if (url === 'https://jidecards-media.local/latex-missing.svg') return route.fulfill({ status: 404, body: '' });
  unexpected.push(url);
  await route.abort();
});
const page = await context.newPage();
page.on('pageerror', (e) => errors.push(e.message));
const results = [];
try {
  for (const [index, svg, side, dark] of [[0, false, 'question', false], [1, true, 'answer', true], [2, true, 'question', false]]) {
    const rendered = { questionNodes: [{ text: question, replacement: null }], answerNodes: [{ text: answer, replacement: null }], css: '.cloze{color:#2E6BE6}', latexSvg: svg, isEmpty: false };
    html = 构建卡片HTML(rendered, side, dark);
    await page.goto('https://jidecards-media.local/test');
    await page.waitForFunction(() => document.documentElement.dataset.mathReady === 'true');
    assert.equal(await page.locator('[data-mml-node="merror"]').count(), 0, 'no formula parsing errors');
    for (const id of ['fraction', 'mathml', 'matrix', 'integral', 'chem', 'reaction', 'charge', 'units', 'macro', 'cloze', 'dollar', 'long']) {
      assert.ok(await page.locator(`#${id} mjx-container svg`).count() > 0, id);
    }
    assert.equal(await page.locator('#code mjx-container').count(), 0);
    assert.equal(await page.locator('#missing .latex-missing').count(), 1);
    assert.ok(await page.locator('#legacy img').evaluate((el) => el.naturalWidth > 0));
    const layout = await page.evaluate(() => {
      const formula = document.querySelector('#long mjx-container');
      return { color: getComputedStyle(document.querySelector('#fraction mjx-container')).color, scroll: formula.scrollWidth > formula.clientWidth, bodyWidth: document.body.scrollWidth, viewport: innerWidth };
    });
    assert.ok(layout.scroll, 'long formula scrolls locally');
    assert.ok(layout.bodyWidth <= layout.viewport + 1, 'formula must not widen entire page');
    assert.equal(layout.color, dark ? 'rgb(230, 230, 230)' : 'rgb(26, 26, 26)');
    if (dark) await page.addStyleTag({ content: 'html { background: #17191c; }' });
    await page.screenshot({ path: fileURLToPath(new URL(`${index}-${side}.png`, output)), fullPage: true });
    results.push({ svg, side, dark, layout });
  }
  assert.deepEqual(errors, []);
  assert.deepEqual(unexpected, [], 'no CDN, external font or extension requests');
  await writeFile(new URL('results.json', output), JSON.stringify({ results, requested: [...requested], errors, unexpected }, null, 2));
  console.log(JSON.stringify({ passed: results.length, requests: requested.size, errors, unexpected }));
} finally {
  await browser.close();
}
