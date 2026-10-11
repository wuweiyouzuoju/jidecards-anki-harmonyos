// SPDX-License-Identifier: AGPL-3.0-or-later
// Production session/runtime: verify CSS cascade, template scripts and both card sides together.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createCardBrowserHarness, launchCardBrowser } from './card-browser-harness.mjs';
import { 构建卡片HTML } from '../entry/src/main/ets/model/学习卡片HTML构建器.ts';
import { 对比度 } from '../entry/src/main/ets/model/色阶生成.ets';
import { applyAgentCardStyle } from '../entry/src/main/ets/model/agent/AgentCardStyle.ts';
import { renderStudyAnswer } from '../entry/src/main/ets/model/StudyAnswerRenderer.ts';
import { parseNoteRichText, serializeNoteRichText } from '../entry/src/main/ets/model/NoteRichText.ts';
import { answerCases } from './tests/core-rendering-harness.mjs';

const browser = await launchCardBrowser();
const harness = await createCardBrowserHarness(browser);
const {page} = harness;
let key = 0;
const cases = [
  { name: 'Agent appearance patch',
    css: applyAgentCardStyle('.card { color: black; background: white; } .nightMode { background: #222; }',
      { backgroundColor: '#FFF4CC', textColor: '#222222', darkBackgroundColor: '#18202B', darkTextColor: '#E6E6E6',
        fontSize: 24, lineHeight: 1.6, textAlign: 'left' }),
    light: '#222222', dark: '#E6E6E6', background: '#FFF4CC', darkBackground: '#18202B' },
  { name: 'default', css: '', light: '#1A1A1A', dark: '#E6E6E6',
    background: '#FFFFFF', darkBackground: '#18202B' },
  { name: 'standard Anki card', css: '.card { color: black; background-color: white; }',
    light: '#000000', dark: '#E6E6E6', background: '#FFFFFF', darkBackground: '#18202B' },
  { name: 'body template', css: 'body { color: #333333; background: #FAFAFA; }',
    light: '#333333', dark: '#E6E6E6', background: '#FAFAFA', darkBackground: '#18202B' },
  { name: 'template night mode',
    css: '.card { color: black; background: white; } body.nightMode { color: #FFFFFF; background: #222222; }',
    light: '#000000', dark: '#FFFFFF', background: '#FFFFFF', darkBackground: '#222222' },
  { name: 'night card selector',
    css: '.card { color: #333333; background: #FFFFFF; } .card.nightMode { color: #FAFAFA; background: #303030; }',
    light: '#333333', dark: '#FAFAFA', background: '#FFFFFF', darkBackground: '#303030' },
  { name: 'AnkiDroid night_mode alias',
    css: '.card{color:black;background:white}body.night_mode{color:white;background:#222222}',
    light: '#000000', dark: '#FFFFFF', background: '#FFFFFF', darkBackground: '#222222' },
  { name: 'document night-mode context',
    css: '.card{color:black;background:white}html.night-mode .card{color:white;background:#222222}',
    light: '#000000', dark: '#FFFFFF', background: '#FFFFFF', darkBackground: '#222222' },
  { name: 'invalid APKG foreground', css: '.card{color:#C393939;background:#E8E3DF}',
    light: '#1A1A1A', dark: '#E6E6E6', background: '#E8E3DF', darkBackground: '#18202B' },
  { name: 'light background only', css: '.card{background:white}',
    light: '#1A1A1A', dark: '#E6E6E6', background: '#FFFFFF', darkBackground: '#18202B' },
  { name: 'dark background only', css: '.card{background:#101820}',
    light: '#E6E6E6', dark: '#E6E6E6', background: '#101820', darkBackground: '#18202B' },
  { name: 'asynchronous template background', css: '</style><script>' +
    'onShownHook.push(async function(){await Promise.resolve();document.body.style.background="#E8E3DF";});</script><style>',
    light: '#1A1A1A', dark: '#1A1A1A', background: '#E8E3DF' },
  { name: 'transparent body', css: 'html{background:white}body.card{background:transparent}',
    light: '#1A1A1A', dark: '#1A1A1A', background: null, surface: '#FFFFFF' },
  { name: 'translucent body', css: 'html{background:black}body.card{background:rgba(32,48,64,.5)}',
    light: '#E6E6E6', dark: '#E6E6E6', background: null, surface: '#101820', translucent: true },
  { name: 'explicit foreground matching the default', css: 'body.card{color:#E6E6E6;background:#E8E3DF}',
    light: '#E6E6E6', dark: '#E6E6E6', background: '#E8E3DF', preserveLowContrast: true }
];
const failures = [];
let passed = 0;
try {
  for (const width of [390, 1280]) for (const item of cases) {
    for (const dark of [false, true]) {
      await page.setViewportSize({width, height: 800});
      const cardKey = ++key;
      for (const side of ['question', 'answer']) {
        const text = '<div id="text"></div><span id="emphasis" style="color:#D05030">重点</span>' +
          '<script>onShownHook.push(async function(){await Promise.resolve();' +
          `document.getElementById("text").textContent="${side}";});</script>`;
        const node = { text, replacement: null };
        const card = { questionNodes: [node], answerNodes: [node], css: item.css,
          latexSvg: false, isEmpty: false };
        await harness.show(构建卡片HTML(card, side, dark), cardKey, side);
        const actual = await page.evaluate(() => {
          const toHex = value => '#' + value.match(/\d+/g).slice(0, 3)
            .map(channel => Number(channel).toString(16).padStart(2, '0')).join('').toUpperCase();
          return {
            text: toHex(getComputedStyle(document.querySelector('#text')).color),
            content: document.querySelector('#text').textContent,
            emphasis: toHex(getComputedStyle(document.querySelector('#emphasis')).color),
            background: getComputedStyle(document.body).backgroundColor,
            bodyHeight: document.body.getBoundingClientRect().height,
            viewportHeight: window.innerHeight
          };
        });
        const name = `${item.name} / ${dark ? 'dark' : 'light'} / ${side}`;
        try {
          assert.equal(actual.text, dark ? item.dark : item.light, name);
          assert.equal(actual.content, side, 'await asynchronous answer hook');
          assert.equal(actual.emphasis, '#D05030', 'preserve explicit field colors');
          assert.ok(actual.bodyHeight >= actual.viewportHeight, `${name}: body background fills the card`);
          const expectedBackground = (dark && item.darkBackground) || item.background;
          let background = harness.backgrounds.at(-1).toUpperCase();
          if (expectedBackground) {
            background = '#' + actual.background.match(/\d+/g).slice(0, 3)
              .map(channel => Number(channel).toString(16).padStart(2, '0')).join('').toUpperCase();
            assert.equal(background, expectedBackground, name);
            assert.notEqual(actual.background, 'rgba(0, 0, 0, 0)', name);
          } else {
            assert.equal(actual.background, item.translucent ? 'rgba(32, 48, 64, 0.5)' : 'rgba(0, 0, 0, 0)', name);
            assert.equal(background, item.surface, 'runtime reports the composed surface');
          }
          if (!item.preserveLowContrast) assert.ok(对比度(actual.text, background) >= 4.5, `${name}: text contrast`);
          passed++;
        } catch (error) {
          failures.push(`${name}: ${error.message}`);
        }
      }
    }
  }
  // Compare against the upstream reviewer subset, including the CSS cascade, rather than
  // assuming that keeping every light-mode template color in night mode is compatible.
  const oracleCss = readFileSync(new URL('./tests/fixtures/ankidroid-reviewer-colors.css', import.meta.url), 'utf8');
  const stockCss = '.card{color:black;background-color:white}';
  const image = 'data:image/svg+xml,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="40"><text x="5" y="30" fill="black">x+1</text></svg>');
  const content = '<p id="normal">Text</p><span id="cloze" class="cloze">Answer</span>' +
    '<a id="link" href="#normal">Link</a><input id="input">' +
    '<code id="typeans"><span id="good" class="typeGood">Good</span>' +
    '<span id="bad" class="typeBad">Bad</span><span id="missed" class="typeMissed">Missed</span></code>' +
    `<img id="latex" class="latex" src="${image}"><img id="drawing" class="drawing" src="${image}">` +
    `<img id="photo" src="${image}">`;
  const snapshot = () => page.evaluate(() => {
    const ids = ['normal', 'cloze', 'link', 'input', 'good', 'bad', 'missed', 'latex', 'drawing', 'photo'];
    return { scheme: getComputedStyle(document.documentElement).colorScheme,
      color: getComputedStyle(document.body).color, background: getComputedStyle(document.body).backgroundColor,
      elements: Object.fromEntries(ids.map(id => {
        const style = getComputedStyle(document.getElementById(id));
        return [id, {color: style.color, background: style.backgroundColor, filter: style.filter}];
      })) };
  });
  const parityCases = [
    {name: 'stock basic', css: stockCss},
    {name: 'stock cloze', css: stockCss + '.cloze{font-weight:bold;color:blue}.nightMode .cloze{color:lightblue}'},
    {name: 'night class alone has upstream specificity', css: stockCss + '.nightMode{color:red;background:pink}'},
    {name: 'explicit night pair', css: stockCss + 'body.nightMode{color:#FFEEDD;background:#223344}'},
    {name: 'root palette override', css: ':root.night-mode{--canvas:#223344;--fg:#FFEEDD}'},
    {name: 'template elements override defaults', css: 'a{color:#784000}.typeGood{color:#123456;background:#FFFFAA}'},
    {name: 'template media overrides', css: '.nightMode .latex,.nightMode img.drawing{filter:none}'}
  ];
  for (const width of [390, 1280]) for (const dark of [false, true]) for (const item of parityCases) {
    await page.setViewportSize({width, height: 800});
    const node = {text: content, replacement: null};
    const card = {questionNodes: [node], answerNodes: [node], css: item.css, latexSvg: false};
    const productionKey = ++key;
    const actual = [];
    for (const side of ['question', 'answer']) {
      await harness.show(构建卡片HTML(card, side, dark), productionKey, side);
      actual.push(await snapshot());
    }
    const fg = dark ? '#E6E6E6' : '#1A1A1A', canvas = dark ? '#18202B' : '#FFFFFF';
    const reference = `<!doctype html><html class="${dark ? 'night-mode' : ''}"><head>` +
      `<style>:root{--canvas:${canvas};--fg:${fg}}body{color:var(--fg);background:var(--canvas)}</style>` +
      `<style>${oracleCss}</style></head><body class="card${dark ? ' nightMode night_mode' : ''}">` +
      `<div id="qa"><style>${item.css}</style>${content}</div></body></html>`;
    await harness.show(reference, ++key, 'question');
    const expected = await snapshot();
    for (const result of actual) {
      assert.deepEqual(result, expected, `AnkiDroid reviewer parity: ${item.name}, width=${width}, dark=${dark}`);
      passed++;
    }
    if (item.name === 'stock cloze') {
      const hex = rgb => '#' + rgb.match(/\d+/g).slice(0, 3)
        .map(value => Number(value).toString(16).padStart(2, '0')).join('');
      assert.ok(对比度(hex(expected.elements.cloze.color), hex(expected.background)) >= 4.5,
        'stock cloze text stays readable in both modes');
    }
  }
  // These application defaults also belong before user styles, just like AnkiDroid's stylesheet.
  const overrides = 'body{font-size:30px;line-height:2}';
  const node = {text: '<div>Text</div>', replacement: null};
  await harness.show(构建卡片HTML({questionNodes:[node],answerNodes:[node],css:overrides}, 'question'), ++key, 'question');
  assert.deepEqual(await page.evaluate(() => [getComputedStyle(document.body).fontSize,
    getComputedStyle(document.body).lineHeight]), ['30px', '60px']); passed++;
  const field = serializeNoteRichText(parseNoteRichText('<mark><b>Highlight</b></mark><br><u>Next line</u>'));
  // This browser check owns HTML/CSS, not the comparison algorithm: the RPC boundary returns verified Core markup.
  const typingCases = answerCases.filter(row => row.expected === '<mark><b>浮、熔、游、响、红</b></mark>。<br>浮：密度比水小');
  for (const kind of ['basic', 'typed', 'typed-rich'])
    for (const width of [390, 1280]) for (const dark of [false, true]) for (const input of ['', 'wrong']) {
    await page.setViewportSize({width, height: 800});
    const node = {text: 'Question<hr id="answer">' + (kind === 'typed' ? '' : field) +
      (kind === 'basic' ? '' : '[[type:Back]]'), replacement: null};
    const html = 构建卡片HTML({questionNodes: [], answerNodes: [node], css: '', latexSvg: false}, 'answer', dark);
    const rendered = await renderStudyAnswer(html,
      kind === 'basic' ? null : {noteId: 1, fieldName: 'Back', cloze: false, ordinal: 0, input, combining: true},
      {note: async () => ({notetypeId: 2, fields: ['Q', field]}), notetype: async () => ({fieldNames: ['Front', 'Back']}),
        compareAnswer: async (expected, provided, combining) => {
          assert.equal(expected, field); assert.equal(provided, input); assert.equal(combining, true);
          const fixture = typingCases.find(row => row.provided === provided && row.combining === combining);
          assert.ok(fixture, 'typing result must come from the locked Core fixtures');
          return fixture.html;
        }});
    await harness.show(rendered, ++key, 'answer');
    const actual = await page.evaluate(() => {
      const mark = document.querySelector('mark'), bold = document.querySelector('b'), underline = document.querySelector('u');
      if (!mark) return {rich: false, comparisons: document.querySelectorAll('#typeans').length};
      return {rich: true, background: getComputedStyle(mark).backgroundColor, color: getComputedStyle(mark).color,
        weight: getComputedStyle(bold).fontWeight, decoration: getComputedStyle(underline).textDecorationLine,
        firstY: mark.getBoundingClientRect().top, nextY: underline.getBoundingClientRect().top,
        overflow: document.body.scrollWidth > window.innerWidth,
        comparisons: document.querySelectorAll('#typeans').length};
    });
    assert.equal(actual.rich, kind !== 'typed', 'stock typing must not inject formatted field content');
    if (actual.rich) {
      assert.equal(actual.background, 'rgb(255, 255, 0)'); assert.equal(actual.color, 'rgb(0, 0, 0)');
      assert.equal(actual.weight, '700'); assert.equal(actual.decoration, 'underline');
      assert.ok(actual.nextY > actual.firstY, 'br creates a visible new line'); assert.equal(actual.overflow, false);
    }
    assert.equal(actual.comparisons, kind === 'basic' ? 0 : 1);
    passed++;
  }
  // Active theme changes must preserve the actual DOM and template state, including typed answers.
  const switching = await createCardBrowserHarness(browser);
  try {
    for (const width of [390, 1280]) for (const custom of [false, true]) {
      await switching.page.setViewportSize({width, height: 800});
      const text = '<input id="theme-input"><span class="cloze">Answer</span><audio id="theme-audio"></audio>' +
        '<div style="height:1800px">Tall card</div><script>' +
        'window.themeRuns=(window.themeRuns||0)+1;window.themeHooks=window.themeHooks||0;' +
        'onUpdateHook.push(function(){themeHooks++});onShownHook.push(function(){themeHooks++});</script>';
      const card = {css: stockCss + '.cloze{color:blue}.nightMode .cloze{color:lightblue}' +
        (custom ? 'body.nightMode{background:#223344;color:#FFEEDD}' : ''),
        questionNodes:[{text,replacement:null}],answerNodes:[{text,replacement:null}]};
      const cachedQuestion = 构建卡片HTML(card, 'question', false);
      const cachedAnswer = 构建卡片HTML(card, 'answer', false);
      switching.session.setTheme(false);
      await switching.show(cachedQuestion, ++key, 'question');
      await switching.page.evaluate(() => {
        window.savedInput = document.getElementById('theme-input');
        savedInput.value = 'partly answered'; savedInput.focus(); savedInput.setSelectionRange(2, 6);
        document.body.classList.add('template-state'); document.documentElement.classList.add('template-root');
        window.pauseCalls = 0; document.getElementById('theme-audio').pause = () => pauseCalls++;
        window.savedHooks = themeHooks; window.scrollTo(0, 300);
      });
      const before = await switching.page.evaluate(() => ({runs:themeRuns, hooks:themeHooks, y:scrollY}));
      for (const dark of [true, false, true]) {
        await switching.setTheme(dark);
        const actual = await switching.page.evaluate(() => ({same: savedInput === document.getElementById('theme-input'),
          value:savedInput.value, focused:document.activeElement === savedInput,
          selection:[savedInput.selectionStart,savedInput.selectionEnd], runs:themeRuns, hooks:themeHooks, y:scrollY,
          pauses:pauseCalls, scheme:getComputedStyle(document.documentElement).colorScheme,
          customClasses:document.body.classList.contains('template-state') && document.documentElement.classList.contains('template-root'),
          cloze:getComputedStyle(document.querySelector('.cloze')).color}));
        assert.deepEqual(actual, {same:true,value:'partly answered',focused:true,selection:[2,6],...before,
          pauses:0,scheme:dark?'dark':'light',customClasses:true,cloze:dark?'rgb(173, 216, 230)':'rgb(0, 0, 255)'});
        assert.equal(switching.backgrounds.at(-1), dark ? (custom ? '#223344' : '#18202b') : '#ffffff');
        assert.equal(switching.appearanceUpdates.at(-1), true, 'theme acknowledgement does not replay card audio');
        passed++;
      }
      await switching.show(cachedAnswer, key, 'answer');
      assert.equal(switching.backgrounds.at(-1), custom ? '#223344' : '#18202b', 'cached opposite side uses current theme');
      assert.equal(await switching.page.evaluate(() => themeRuns), 2, 'only flipping reruns the template');
      assert.equal(switching.appearanceUpdates.at(-1), false);
      assert.equal(switching.navigations, (width === 390 ? 0 : 2) + (custom ? 2 : 1), 'theme changes keep the current document');
      passed++;
    }
  } finally { await switching.close(); }
  console.log(JSON.stringify({ passed, failures }, null, 2));
  assert.deepEqual(failures, []);
} finally {
  await browser.close();
}
