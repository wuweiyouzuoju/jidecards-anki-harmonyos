// SPDX-License-Identifier: AGPL-3.0-or-later
// Real navigation + production host session/runtime; page.setContent would not prove window lifetime.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createCardBrowserHarness, launchCardBrowser } from './card-browser-harness.mjs';
import { CardWebSession } from '../entry/src/main/ets/model/CardWebSession.ts';
import { 构建卡片HTML, appendCardScript } from '../entry/src/main/ets/model/学习卡片HTML构建器.ts';
import { buildPreviewInteractionScript } from '../entry/src/main/ets/model/PreviewInteraction.ts';
import { MATH_ASSET_BASE } from '../entry/src/main/ets/model/MathRendering.ts';

const browser = await launchCardBrowser();
let passed = 0;
try {
  for (const preview of [false, true]) for (const dark of [false, true]) {
    const context = await browser.newContext();
    const page = await context.newPage();
    const errors = [], failures = [], actions = [], pending = [], backgrounds = [];
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
      shown: background => { shown++; backgrounds.push(background); }, failed: message => failures.push(message)
    });
    await page.exposeFunction('nativeRendered', (id, revision, error, background) => session.rendered(id, revision, error, background));
    await page.exposeFunction('nativeAction', (action, version) => actions.push({ action, version }));
    await page.addInitScript(() => {
      window.jideCardRuntime = { onRendered: (...args) => window.nativeRendered(...args) };
      window.jidePreview = { onAction: (...args) => window.nativeAction(...args) };
    });
    const card = {
      questionNodes: [{ text: `<button id="one" onclick="answers[0]=true;sessionStorage.setItem('answers',JSON.stringify(answers))">1</button>
        <button id="two" onclick="answers[1]=false;sessionStorage.setItem('answers',JSON.stringify(answers))">2</button>
        <button id="three" onclick="answers[2]=true;sessionStorage.setItem('answers',JSON.stringify(answers))">3</button>
        <p id="alignment-text">Text</p><ul><li id="alignment-list">List</li></ul><pre id="alignment-code">code</pre>
        <script>window.answers=window.answers||[];window.questionRuns=(window.questionRuns||0)+1;</script>`, replacement: null }],
      answerNodes: [{ text: `<hr id="answer"><div id="score"></div><div class="anki-collapsible">details</div>\\(x^2\\)
        <div id="image-occlusion-container"><img src="occlusion.svg"><canvas id="image-occlusion-canvas"></canvas></div>
        <div class="cloze" data-shape="rect" data-left="0" data-top="0" data-width="1" data-height="1"></div>
        <style>body { text-align: right; } li { text-align: center; } pre { text-align: right; }</style>
        <p id="alignment-text">Text</p><ul><li id="alignment-list">List</li></ul><pre id="alignment-code">code</pre>
        <script src="dependency.js"></script><script>
        window.answerRuns=(window.answerRuns||0)+1;
        document.getElementById('score').textContent=answers.filter(Boolean).length+'/'+answers.length;
        window.savedAnswers=JSON.parse(sessionStorage.getItem('answers'));
        window.dependencyRead=cardDependency;
        onUpdateHook.push(function(){window.updateRan=true});
        onShownHook.push(function(){window.shownRan=!!document.querySelector('mjx-container')});
        </script>`, replacement: null }],
      css: 'body.card{color:black;background:white}body{text-align:left}</style><script>window.styleRuns=(window.styleRuns||0)+1;</script>',
      latexSvg: false, isEmpty: false
    };
    const html = (side, version) => {
      const value = 构建卡片HTML(card, side, dark);
      return preview ? appendCardScript(value, buildPreviewInteractionScript(version)) : value;
    };
    async function waitShown(count) {
      await assert.doesNotReject(async () => {
        const deadline = Date.now() + 20000;
        while (shown < count && failures.length === 0 && Date.now() < deadline) await new Promise(r => setTimeout(r, 20));
        assert.deepEqual(failures, []);
        assert.equal(shown, count);
      });
    }
    async function assertAlignment(side) {
      const actual = await page.evaluate(() => ['alignment-text', 'alignment-list', 'alignment-code']
        .map(id => getComputedStyle(document.getElementById(id)).textAlign));
      assert.deepEqual(actual, side === 'question' ? ['left', 'start', 'left'] : ['right', 'center', 'right'],
        `alignment after ${side}, preview=${preview}, dark=${dark}`);
    }
    session.show(html('question', 1), 1, 'question'); await waitShown(1);
    await assertAlignment('question');
    await page.locator('#one').click(); await page.locator('#two').click(); await page.locator('#three').click();
    session.show(html('answer', 2), 1, 'answer', !preview); await waitShown(2);
    await assertAlignment('answer');
    assert.equal(await page.locator('#score').textContent(), '2/3');
    assert.deepEqual(await page.evaluate(() => savedAnswers), [true, false, true]);
    assert.deepEqual(backgrounds, ['#ffffff', '#ffffff'], 'explicit template colors override either app theme');
    assert.deepEqual(await page.evaluate(() => [questionRuns, answerRuns, styleRuns, dependencyRead, updateRan, shownRan]),
      [1, 1, 2, 7, true, true]);
    assert.equal(await page.locator('.anki-collapsible-toggle').count(), 1);
    await page.waitForFunction(() => document.getElementById('image-occlusion-canvas').width === 20);
    assert.deepEqual(await page.evaluate(() => Array.from(document.getElementById('image-occlusion-canvas')
      .getContext('2d').getImageData(5, 5, 1, 1).data)), [255, 142, 142, 255]);
    assert.equal(navigations, 1);
    session.show(html('question', 3), 1, 'question'); await waitShown(3);
    await assertAlignment('question');
    session.show(html('answer', 4), 1, 'answer'); await waitShown(4);
    await assertAlignment('answer');
    if (preview) {
      await page.locator('#score').click();
      await page.waitForFunction(() => true);
      assert.deepEqual(actions, [{ action: 'flip', version: 4 }], 'one current-version listener after repeated flips');
    }
    session.reset(); session.show(html('question', 5), 2, 'question'); await waitShown(5);
    await assertAlignment('question');
    assert.deepEqual(await page.evaluate(() => [answers.length, questionRuns, styleRuns]), [0, 1, 1]);
    assert.equal(navigations, 2, 'a new card gets a fresh JS global environment');
    // Partially answered cards retain the existing answer and leave the other subquestions unanswered.
    await page.locator('#one').click();
    session.show(html('answer', 6), 2, 'answer'); await waitShown(6);
    await assertAlignment('answer');
    assert.equal(await page.locator('#score').textContent(), '1/1');
    // A dark deck in either app theme must publish its actual CSS surface across full document loads.
    for (const [index, css, expected] of [
      [0, 'body.card {background:#101820;color:white}', '#101820'],
      [1, 'html {background:#101820} body.card {background:transparent;color:white}', '#101820'],
      [2, 'html {background:#000000} body.card {background:rgba(32,48,64,.5);color:white}', '#101820']
    ]) {
      card.css = css;
      session.reset(); session.show(html('question', 7 + index * 2), 3 + index, 'question');
      await waitShown(7 + index * 2);
      assert.equal(backgrounds.at(-1), expected);
      await page.locator('#one').click();
      session.show(html('answer', 8 + index * 2), 3 + index, 'answer');
      await waitShown(8 + index * 2);
      assert.equal(backgrounds.at(-1), expected);
      assert.equal(await page.locator('#score').textContent(), '1/1', 'card globals remain isolated');
    }
    // Plain cards need no math engine; a formula on the answer still prepares it before the first flip.
    card.css = '.card {background:white;color:black}';
    card.questionNodes = [{text: 'Word', replacement: null}];
    card.answerNodes = [{text: 'Meaning', replacement: null}];
    session.reset(); session.show(html('question', 20), 20, 'question'); await waitShown(13);
    assert.equal(await page.evaluate(() => typeof window.MathJax.typesetPromise), 'undefined');
    session.show(html('answer', 21), 20, 'answer'); await waitShown(14);
    assert.equal(await page.locator('#qa').innerText(), 'Meaning');
    card.answerNodes = [{text: '\\(x^2\\)', replacement: null}];
    session.reset(); session.show(html('question', 22), 21, 'question'); await waitShown(15);
    session.show(html('answer', 23), 21, 'answer'); await waitShown(16);
    assert.equal(await page.locator('mjx-container').count(), 1);
    // Hold the frame callbacks: a deadline must not switch an unpainted spare document.
    await page.addInitScript(() => {
      window.heldCardFrames = [];
      window.requestAnimationFrame = callback => { window.heldCardFrames.push(callback); return 0; };
    });
    card.questionNodes = [{text: 'Word', replacement: null}];
    card.answerNodes = [{text: 'Meaning', replacement: null}];
    session.reset(); session.show(html('question', 24), 22, 'question');
    await page.waitForFunction(() => window.heldCardFrames && window.heldCardFrames.length === 1);
    await new Promise(resolve => setTimeout(resolve, 180));
    assert.equal(shown, 16, 'the earlier 100ms fallback would have confirmed this document');
    await page.evaluate(() => window.heldCardFrames.shift()());
    assert.equal(shown, 16);
    await page.evaluate(() => window.heldCardFrames.shift()()); await waitShown(17);
    assert.equal(await page.locator('#qa').innerText(), 'Word');
    assert.deepEqual(errors, []);
    await Promise.all(pending);
    passed++;
    await context.close();
  }
  // Extra closing tags in an imported template can put its tail outside #qa after HTML parsing.
  // Keep a small reproducer of that structure; the user's APKG stays outside the repository.
  const raw = '{{c1::Alpha::hint}} and {{c1::Beta}}';
  const wrapQa = `if(!document.getElementById('repaired-frame')){var frame=document.createElement('div');frame.id='repaired-frame';
    var qa=document.getElementById('qa');qa.parentNode.insertBefore(frame,qa);frame.appendChild(qa);}`;
  const repairedCard = {
    questionNodes: [{text: `<div id="div0">${raw}</div><button id="remember" onclick="window.savedChoice='Alpha'">Remember</button>
      <script>var clozeRegex=/\\{\\{c\\d+::([\\s\\S]*?)\\}\\}/g;
      document.getElementById('div0').innerHTML=document.getElementById('div0').innerHTML.replace(clozeRegex,'[____]');
      window.repairedQuestionRuns=(window.repairedQuestionRuns||0)+1;
      ${wrapQa}
      </script>`, replacement: null}],
    answerNodes: [{text: `<script>${wrapQa}</script><div class="section"><div id="div1">${raw}</div></div></div>
      <p id="tail">Tail \\(x^2\\)</p><button id="toggle-tail" onclick="this.textContent=window.savedChoice||'empty'">Toggle</button>
      <style>#tail{font-weight:700}</style><script src="repaired-dependency.js"></script><script>
      var clozeRegex=/\\{\\{c\\d+::([\\s\\S]*?)\\}\\}/g;
      document.getElementById('div1').innerHTML=document.getElementById('div1').innerHTML.replace(clozeRegex,
        function(match,content){return '<span class="cloze">'+content.split('::')[0]+'</span>'});
      window.repairedAnswerRuns=(window.repairedAnswerRuns||0)+1;
      onShownHook.push(function(){document.getElementById('tail').dataset.ready=String(repairedDependency)});
      </script>`, replacement: null}],
    css: '.card{color:black;background:white}.cloze{color:blue}.nightMode .cloze{color:lightblue}',
    latexSvg: false, isEmpty: false
  };
  for (const width of [390, 1280]) for (const preview of [false, true]) for (const dark of [false, true])
    for (const initialSide of ['question', 'answer']) {
    const h = await createCardBrowserHarness(browser);
    try {
      await h.page.setViewportSize({width, height:800});
      await h.page.route('**/repaired-dependency.js', async route => {
        await new Promise(resolve => setTimeout(resolve, 30));
        return route.fulfill({contentType:'text/javascript',body:'window.repairedDependency=7;'});
      });
      const actions = [];
      await h.page.exposeFunction('repairedAction', (action, version) => actions.push({action, version}));
      await h.page.addInitScript(() => {window.jidePreview={onAction:(...args)=>window.repairedAction(...args)}});
      let version = 0;
      const show = side => {
        let html = 构建卡片HTML(repairedCard, side, dark);
        if (preview) html = appendCardScript(html, buildPreviewInteractionScript(++version));
        return h.show(html, 1, side);
      };
      await show(initialSide);
      if (initialSide === 'question') await h.page.locator('#remember').click();
      if (initialSide === 'question') await show('answer');
      await h.page.evaluate(() => {window.repairedMathCache=document.getElementById('MJX-SVG-global-cache')});
      for (let flip = 0; flip < 3; flip++) {
        assert.equal(await h.page.locator('#repaired-frame #qa').count(),1,'repair preserves author wrappers on either side');
        assert.equal(await h.page.locator('#div1').innerText(), 'Alpha and Beta', 'back-side cloze script must execute');
        assert.equal(await h.page.locator('#tail').getAttribute('data-ready'), '7', 'tail dependencies and hooks finish');
        assert.equal(await h.page.locator('#qa #tail mjx-container').count(), 1, 'math outside the repaired boundary is typeset');
        assert.deepEqual(await h.page.evaluate(() => [document.querySelectorAll('#qa').length,
          document.getElementById('qa').contains(document.getElementById('tail')),
          document.getElementById('MJX-SVG-global-cache')===window.repairedMathCache,
          document.querySelectorAll('#qa #MJX-SVG-global-cache').length,
          getComputedStyle(document.getElementById('tail')).fontWeight]), [1,true,true,0,'700']);
        assert.equal(h.backgrounds.at(-1), dark ? '#18202b' : '#ffffff', 'stock white CSS respects night mode on every flip');
        assert.equal(await h.page.evaluate(() => repairedAnswerRuns), flip+1, 'no duplicate execution during normalization');
        if (preview) {
          const before = actions.length;
          await h.page.locator('#tail').click();
          assert.deepEqual(actions.slice(before), [{action:'flip',version}], 'one current preview listener, including orphan scripts');
        }
        await h.page.locator('#toggle-tail').click();
        assert.equal(await h.page.locator('#toggle-tail').innerText(),
          initialSide==='answer'&&flip===0 ? 'empty' : 'Alpha', 'template globals survive same-card normalization');
        await show('question');
        assert.equal(await h.page.locator('#repaired-frame #qa').count(),1,'valid template wrappers stay intact');
        assert.equal(await h.page.locator('#tail').count(), 0, 'old orphan content is removed on the next side');
        await h.page.locator('#remember').click();
        await show('answer');
      }
      assert.equal(h.navigations, 1, 'malformed templates still share one document per card');
      await h.show(构建卡片HTML(repairedCard, 'answer', dark), 2, 'answer');
      assert.deepEqual(await h.page.evaluate(() => [repairedAnswerRuns,typeof window.savedChoice]), [1,'undefined']);
      passed++;
    } finally {await h.close();}
  }
  console.log(JSON.stringify({ passed, scenarios: 'study/preview × light/dark; narrow/wide repaired template bodies, first answer/repeated flips/next card, scripts/styles/math/gestures, stock night colors, full/partial answers and storage' }));
} finally { await browser.close(); }
