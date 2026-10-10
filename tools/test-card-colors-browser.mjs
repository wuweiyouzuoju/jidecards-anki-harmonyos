// SPDX-License-Identifier: AGPL-3.0-or-later
// Production session/runtime: verify CSS cascade, template scripts and both card sides together.
import assert from 'node:assert/strict';
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
    light: '#000000', dark: '#000000', background: '#FFFFFF' },
  { name: 'body template', css: 'body { color: #333333; background: #FAFAFA; }',
    light: '#333333', dark: '#333333', background: '#FAFAFA' },
  { name: 'template night mode',
    css: '.card { color: black; background: white; } .nightMode { color: #FFFFFF; background: #222222; }',
    light: '#000000', dark: '#FFFFFF', background: '#FFFFFF', darkBackground: '#222222' },
  { name: 'night card selector',
    css: '.card { color: #333333; background: #FFFFFF; } .card.nightMode { color: #FAFAFA; background: #303030; }',
    light: '#333333', dark: '#FAFAFA', background: '#FFFFFF', darkBackground: '#303030' },
  { name: 'AnkiDroid night_mode alias',
    css: '.card{color:black;background:white}.night_mode{color:white;background:#222222}',
    light: '#000000', dark: '#FFFFFF', background: '#FFFFFF', darkBackground: '#222222' },
  { name: 'document night-mode context',
    css: '.card{color:black;background:white}html.night-mode .card{color:white;background:#222222}',
    light: '#000000', dark: '#FFFFFF', background: '#FFFFFF', darkBackground: '#222222' },
  { name: 'invalid APKG foreground', css: '.card{color:#C393939;background:#E8E3DF}',
    light: '#1A1A1A', dark: '#1A1A1A', background: '#E8E3DF' },
  { name: 'light background only', css: '.card{background:white}',
    light: '#1A1A1A', dark: '#1A1A1A', background: '#FFFFFF' },
  { name: 'dark background only', css: '.card{background:#101820}',
    light: '#E6E6E6', dark: '#E6E6E6', background: '#101820' },
  { name: 'asynchronous template background', css: '</style><script>' +
    'onShownHook.push(async function(){await Promise.resolve();document.body.style.background="#E8E3DF";});</script><style>',
    light: '#1A1A1A', dark: '#1A1A1A', background: '#E8E3DF' },
  { name: 'transparent body', css: 'html{background:white}.card{background:transparent}',
    light: '#1A1A1A', dark: '#1A1A1A', background: null, surface: '#FFFFFF' },
  { name: 'translucent body', css: 'html{background:black}.card{background:rgba(32,48,64,.5)}',
    light: '#E6E6E6', dark: '#E6E6E6', background: null, surface: '#101820', translucent: true },
  { name: 'explicit foreground matching the default', css: '.card{color:#E6E6E6;background:#E8E3DF}',
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
  console.log(JSON.stringify({ passed, failures }, null, 2));
  assert.deepEqual(failures, []);
} finally {
  await browser.close();
}
