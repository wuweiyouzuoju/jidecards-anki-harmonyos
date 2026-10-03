// SPDX-License-Identifier: AGPL-3.0-or-later
// PLAYWRIGHT_MODULE 可指向本机 Playwright；验证模板与默认配色在真实 CSS 层叠后的可读性。
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { 构建卡片HTML } from '../entry/src/main/ets/model/学习卡片HTML构建器.ts';
import { 对比度 } from '../entry/src/main/ets/model/色阶生成.ets';
import { applyAgentCardStyle } from '../entry/src/main/ets/model/agent/AgentCardStyle.ts';
import { renderStudyAnswer } from '../entry/src/main/ets/model/StudyAnswerRenderer.ts';
import { parseNoteRichText, serializeNoteRichText } from '../entry/src/main/ets/model/NoteRichText.ts';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE
  ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : 'playwright');
const browser = await chromium.launch({ headless: true, channel: 'msedge' });
const page = await browser.newPage();
await page.route('**/*', route => route.abort());
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
            background: getComputedStyle(document.body).backgroundColor,
            bodyHeight: document.body.getBoundingClientRect().height,
            viewportHeight: window.innerHeight
          };
        });
        const name = `${item.name} / ${dark ? 'dark' : 'light'} / ${side}`;
        try {
          assert.equal(actual.text, dark ? item.dark : item.light, name);
          assert.equal(actual.emphasis, '#D05030', 'preserve explicit field colors');
          assert.ok(actual.bodyHeight >= actual.viewportHeight, `${name}: body background fills the card`);
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
  const field = serializeNoteRichText(parseNoteRichText('<mark><b>Highlight</b></mark><br><u>Next line</u>'));
  for (const kind of ['basic', 'typed', 'typed-rich'])
    for (const width of [390, 1280]) for (const dark of [false, true]) for (const input of ['', 'wrong']) {
    await page.setViewportSize({width, height: 800});
    const node = {text: 'Question<hr id="answer">' + (kind === 'typed' ? '' : field) +
      (kind === 'basic' ? '' : '[[type:Back]]'), replacement: null};
    const html = 构建卡片HTML({questionNodes: [], answerNodes: [node], css: '', latexSvg: false}, 'answer', dark)
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
    const rendered = await renderStudyAnswer(html,
      kind === 'basic' ? null : {noteId: 1, fieldName: 'Back', cloze: false, ordinal: 0, input, combining: true},
      {note: async () => ({notetypeId: 2, fields: ['Q', field]}), notetype: async () => ({fieldNames: ['Front', 'Back']})});
    await page.setContent(rendered);
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
