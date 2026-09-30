// SPDX-License-Identifier: AGPL-3.0-or-later
// Real navigation + production host session/runtime; page.setContent would not prove window lifetime.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { CardWebSession } from '../entry/src/main/ets/model/CardWebSession.ts';
import { 构建卡片HTML } from '../entry/src/main/ets/model/学习卡片HTML构建器.ts';
import { buildPreviewInteractionScript } from '../entry/src/main/ets/model/PreviewInteraction.ts';
import { MATH_ASSET_BASE } from '../entry/src/main/ets/model/MathRendering.ts';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE
  ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
const browser = await chromium.launch({ headless: true, channel: 'msedge' });
let passed = 0;
try {
  for (const preview of [false, true]) for (const dark of [false, true]) {
    const context = await browser.newContext();
    const page = await context.newPage();
    const errors = [], failures = [], actions = [], pending = [];
    let document = '', shown = 0, navigations = 0;
    await context.route('**/*', async route => {
      const url = route.request().url();
      if (route.request().isNavigationRequest()) return route.fulfill({ contentType: 'text/html', body: document });
      let file = '';
      if (url === 'https://jidecards-render.local/jquery/3.7.1/jquery.min.js') file = 'jquery/jquery-3.7.1.min.js';
      for (const name of ['card-math.js', 'tex-svg-full.js', 'input/mml.js', 'input/mml/entities.js']) {
        if (url === MATH_ASSET_BASE + name) file = 'mathjax/' + name;
      }
      if (file) return route.fulfill({ contentType: 'text/javascript',
        body: readFileSync(new URL('../entry/src/main/resources/rawfile/' + file, import.meta.url)) });
      if (url.endsWith('/dependency.js')) {
        await new Promise(resolve => setTimeout(resolve, 50));
        return route.fulfill({ contentType: 'text/javascript', body: 'window.cardDependency = 7;' });
      }
      if (url.endsWith('/occlusion.svg')) return route.fulfill({ contentType: 'image/svg+xml',
        body: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><rect width="20" height="20" fill="white"/></svg>' });
      return route.fulfill({ status: 404, body: '' });
    });
    page.on('pageerror', error => errors.push(error.message));
    const session = new CardWebSession({
      load: html => {
        document = html;
        pending.push(page.goto('https://jidecards-media.local/').catch(error => failures.push(error.message)));
        navigations++;
      },
      evaluate: script => page.evaluate(script),
      shown: () => shown++, failed: message => failures.push(message)
    });
    await page.exposeFunction('nativeRendered', (id, revision, error) => session.rendered(id, revision, error));
    await page.exposeFunction('nativeAction', (action, version) => actions.push({ action, version }));
    await page.addInitScript(() => {
      window.jideCardRuntime = { onRendered: (...args) => window.nativeRendered(...args) };
      window.jidePreview = { onAction: (...args) => window.nativeAction(...args) };
    });
    const card = {
      questionNodes: [{ text: `<button id="one" onclick="answers[0]=true;sessionStorage.setItem('answers',JSON.stringify(answers))">1</button>
        <button id="two" onclick="answers[1]=false;sessionStorage.setItem('answers',JSON.stringify(answers))">2</button>
        <button id="three" onclick="answers[2]=true;sessionStorage.setItem('answers',JSON.stringify(answers))">3</button>
        <script>window.answers=window.answers||[];window.questionRuns=(window.questionRuns||0)+1;</script>`, replacement: null }],
      answerNodes: [{ text: `<hr id="answer"><div id="score"></div><div class="anki-collapsible">details</div>\\(x^2\\)
        <div id="image-occlusion-container"><img src="occlusion.svg"><canvas id="image-occlusion-canvas"></canvas></div>
        <div class="cloze" data-shape="rect" data-left="0" data-top="0" data-width="1" data-height="1"></div>
        <script src="dependency.js"></script><script>
        window.answerRuns=(window.answerRuns||0)+1;
        document.getElementById('score').textContent=answers.filter(Boolean).length+'/'+answers.length;
        window.savedAnswers=JSON.parse(sessionStorage.getItem('answers'));
        window.dependencyRead=cardDependency;
        onUpdateHook.push(function(){window.updateRan=true});
        onShownHook.push(function(){window.shownRan=!!document.querySelector('mjx-container')});
        </script>`, replacement: null }],
      css: '.card{color:black;background:white}</style><script>window.styleRuns=(window.styleRuns||0)+1;</script>',
      latexSvg: false, isEmpty: false
    };
    const html = (side, version) => {
      const value = 构建卡片HTML(card, side, dark);
      return preview ? value.replace('</div></body>', `<script>${buildPreviewInteractionScript(version)}</script></div></body>`) : value;
    };
    async function waitShown(count) {
      await assert.doesNotReject(async () => {
        const deadline = Date.now() + 20000;
        while (shown < count && failures.length === 0 && Date.now() < deadline) await new Promise(r => setTimeout(r, 20));
        assert.deepEqual(failures, []);
        assert.equal(shown, count);
      });
    }
    session.show(html('question', 1), 1, 'question'); await waitShown(1);
    await page.locator('#one').click(); await page.locator('#two').click(); await page.locator('#three').click();
    session.show(html('answer', 2), 1, 'answer', !preview); await waitShown(2);
    assert.equal(await page.locator('#score').textContent(), '2/3');
    assert.deepEqual(await page.evaluate(() => savedAnswers), [true, false, true]);
    assert.deepEqual(await page.evaluate(() => [questionRuns, answerRuns, styleRuns, dependencyRead, updateRan, shownRan]),
      [1, 1, 2, 7, true, true]);
    assert.equal(await page.locator('.anki-collapsible-toggle').count(), 1);
    await page.waitForFunction(() => document.getElementById('image-occlusion-canvas').width === 20);
    assert.deepEqual(await page.evaluate(() => Array.from(document.getElementById('image-occlusion-canvas')
      .getContext('2d').getImageData(5, 5, 1, 1).data)), [255, 142, 142, 255]);
    assert.equal(navigations, 1);
    session.show(html('question', 3), 1, 'question'); await waitShown(3);
    session.show(html('answer', 4), 1, 'answer'); await waitShown(4);
    if (preview) {
      await page.locator('#score').click();
      await page.waitForFunction(() => true);
      assert.deepEqual(actions, [{ action: 'flip', version: 4 }], 'one current-version listener after repeated flips');
    }
    session.reset(); session.show(html('question', 5), 2, 'question'); await waitShown(5);
    assert.deepEqual(await page.evaluate(() => [answers.length, questionRuns, styleRuns]), [0, 1, 1]);
    assert.equal(navigations, 2, 'a new card gets a fresh JS global environment');
    // Partially answered cards retain the existing answer and leave the other subquestions unanswered.
    await page.locator('#one').click();
    session.show(html('answer', 6), 2, 'answer'); await waitShown(6);
    assert.equal(await page.locator('#score').textContent(), '1/1');
    assert.deepEqual(errors, []);
    await Promise.all(pending);
    passed++;
    await context.close();
  }
  console.log(JSON.stringify({ passed, scenarios: 'study/preview × light/dark; full/partial answers, repeated flips, next card, scripts, storage, math, collapsible fields, gestures' }));
} finally { await browser.close(); }
