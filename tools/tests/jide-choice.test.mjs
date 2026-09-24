// SPDX-License-Identifier: AGPL-3.0-or-later

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { parseJideChoiceDeck, gradeJideChoice, jideChoiceQuestionFromNote, jideChoiceNoteFields,
  JIDE_CHOICE_NOTETYPE_FIELDS, JIDE_CHOICE_FRONT, JIDE_CHOICE_BACK, hideJideChoiceStaticOptions } from '../../entry/src/main/ets/model/JideChoice.ts';
import { RATING_GOOD, RATING_HARD } from '../../entry/src/main/ets/proto/messages/SchedulerMessages.ts';
import test from 'node:test';

const sample = JSON.parse(readFileSync(new URL('../../docs/examples/choice-demo.json', import.meta.url), 'utf8'));
const clone = value => JSON.parse(JSON.stringify(value));

test('public sample parses with package feedback default and both question types', () => {
  const deck = parseJideChoiceDeck(JSON.stringify(sample));
  assert.equal(deck.feedbackSeconds, 5);
  assert.equal(deck.questions.length, 3);
  assert.equal(deck.questions[0].feedbackSeconds, 5);
  assert.deepEqual(deck.questions[1].answer, ['red', 'green', 'blue']);
});

test('choice grading requires exactly the same option ID set', () => {
  assert.equal(gradeJideChoice(['b'], ['b']).correct, true);
  assert.equal(gradeJideChoice(['b', 'a'], ['a', 'b']).correct, true);
  assert.equal(gradeJideChoice(['a'], ['a', 'b']).correct, false);
  assert.equal(gradeJideChoice(['a', 'b', 'c'], ['a', 'b']).correct, false);
});

test('parser rejects invalid option counts, answers, duplicate IDs, and feedback delays', () => {
  const tooFew = clone(sample); tooFew.questions[0].options = [{ id: 'a', text: 'A' }];
  assert.throws(() => parseJideChoiceDeck(JSON.stringify(tooFew)), /options_count_invalid/);
  const tooMany = clone(sample); tooMany.questions[0].options = Array.from({ length: 11 }, (_, i) => ({ id: `o${i}`, text: `${i}` }));
  tooMany.questions[0].answer = ['o0'];
  assert.throws(() => parseJideChoiceDeck(JSON.stringify(tooMany)), /options_count_invalid/);
  const badAnswer = clone(sample); badAnswer.questions[0].answer = ['missing'];
  assert.throws(() => parseJideChoiceDeck(JSON.stringify(badAnswer)), /answer_option_invalid/);
  const duplicate = clone(sample); duplicate.questions[1].id = duplicate.questions[0].id;
  assert.throws(() => parseJideChoiceDeck(JSON.stringify(duplicate)), /id_duplicate/);
  for (const feedbackSeconds of [-1, 61, 1.5, '5']) {
    const invalid = { ...sample, feedbackSeconds };
    assert.throws(() => parseJideChoiceDeck(JSON.stringify(invalid)), /feedback_seconds_invalid/);
  }
});

test('package supports ten options and zero seconds to disable automatic advance', () => {
  const deck = clone(sample);
  deck.feedbackSeconds = 0;
  deck.questions = [deck.questions[0]];
  deck.questions[0].options = Array.from({ length: 10 }, (_, i) => ({ id: `o${i + 1}`, text: `Option ${i + 1}` }));
  deck.questions[0].answer = ['o1'];
  const parsed = parseJideChoiceDeck(JSON.stringify(deck));
  assert.equal(parsed.questions[0].options.length, 10);
  assert.equal(parsed.questions[0].feedbackSeconds, 0);
});

test('imported note payload stays consistent with escaped Anki fields', () => {
  const question = parseJideChoiceDeck(JSON.stringify(sample)).questions[0];
  const fields = jideChoiceNoteFields(question);
  assert.deepEqual(jideChoiceQuestionFromNote(fields), question);
  assert.throws(() => jideChoiceQuestionFromNote([...fields.slice(0, 1), 'changed', ...fields.slice(2)]), /corrupt/);
});

test('Anki note type displays options in its normal front and explanation on back', () => {
  assert.equal(JIDE_CHOICE_NOTETYPE_FIELDS.length, 5);
  assert.match(JIDE_CHOICE_FRONT, /\{\{OptionsHTML\}\}/);
  assert.match(JIDE_CHOICE_BACK, /\{\{AnswerHTML\}\}/);
  assert.match(JIDE_CHOICE_BACK, /\{\{Explanation\}\}/);
  assert.doesNotMatch(JIDE_CHOICE_FRONT + JIDE_CHOICE_BACK, /JidePayload|script/i);
  assert.match(hideJideChoiceStaticOptions('<p>Q</p><div class="jide-choice-options">A. one</div>'), /display:none/);
});

test('recognition follows named fields and version metadata, including reordered/extended note types', () => {
  const question = parseJideChoiceDeck(JSON.stringify(sample)).questions[0];
  const fields = jideChoiceNoteFields(question);
  assert.deepEqual(jideChoiceQuestionFromNote([...fields].reverse(), [...JIDE_CHOICE_NOTETYPE_FIELDS].reverse()), question);
  assert.deepEqual(jideChoiceQuestionFromNote([...fields, 'tag'], [...JIDE_CHOICE_NOTETYPE_FIELDS, 'Extra']), question);
  assert.equal(jideChoiceQuestionFromNote(['Q', 'A'], ['Front', 'Back']), null);
  for (const overrides of [{ version: 2 }, { format: 'unrelated' }]) {
    const future = fields.slice();
    future[2] = JSON.stringify({ ...JSON.parse(fields[2]), ...overrides });
    assert.equal(jideChoiceQuestionFromNote(future), null);
  }
  assert.throws(() => jideChoiceQuestionFromNote(fields.slice(0, 4), JIDE_CHOICE_NOTETYPE_FIELDS.slice(0, 4)), /corrupt/);
  const corrupt = fields.slice(); corrupt[2] = '{';
  assert.throws(() => jideChoiceQuestionFromNote(corrupt), /corrupt/);
});

test('payload preserves literal HTML/Unicode without allowing markup to enter the JSON field', () => {
  const question = { ...parseJideChoiceDeck(JSON.stringify(sample)).questions[0], prompt: '<script>中文 & emoji 😀</script>' };
  const fields = jideChoiceNoteFields(question);
  assert.doesNotMatch(fields[0], /<script>/);
  assert.doesNotMatch(fields[2], /[<>&]/);
  assert.deepEqual(jideChoiceQuestionFromNote(fields), question);
});

const pageSource = readFileSync(new URL('../../entry/src/main/ets/pages/学习页.ets', import.meta.url), 'utf8');
const pageMethods = ['提交选择题', 'choiceAutoAdvanceSeconds', '继续选择题反馈', '评分'].map(name => {
  const start = pageSource.search(new RegExp(`  private (?:async )?${name}\\(`));
  assert.ok(start >= 0);
  return pageSource.slice(start, pageSource.indexOf('\n  }', start) + 4);
});
const ChoicePage = new Function('gradeJideChoice', 'playStudyHaptic', 'RATING_GOOD', 'RATING_HARD',
  stripTypeScriptTypes(`class Page { ${pageMethods.join('\n')} }`, { mode: 'transform' }) + '\nreturn Page;')(
  gradeJideChoice, () => {}, RATING_GOOD, RATING_HARD);

function choicePage() {
  const page = new ChoicePage();
  const writes = [];
  Object.assign(page, { editor: { visible: false, busy: false },
    choiceQuestion: parseJideChoiceDeck(JSON.stringify(sample)).questions[0], choiceGrade: null,
    choiceSelectedIds: [], choiceFeedbackSecondsOverride: -1, 当前卡片: { cardId: 1 },
    requestVersion: 1, 阶段: 'question', 评分中: false, 页面已显示: true, foreground: true,
    studyGuideVisible: false, studyMenuOpen: false, noteEditorVisible: false, noteEditorBusy: false,
    手写模式: false, 展示时刻毫秒: 0, 背面HTML: 'answer', nextCount: 0,
    isCurrentRequest: version => version === page.requestVersion,
    studySession: { answer: async (...args) => { writes.push(args); } },
    applyStudyHtml: () => {}, scheduleChoiceAutoAdvance: () => {}, clearChoiceAutoAdvance: () => {},
    加载下一张卡: () => { page.nextCount++; page.阶段 = 'loading'; }
  });
  return { page, writes };
}

test('choice submits Good or Hard exactly once; ordinary grading and continuing never submit again', async () => {
  for (const correct of [true, false]) {
    const { page, writes } = choicePage();
    page.choiceSelectedIds = correct ? page.choiceQuestion.answer :
      [page.choiceQuestion.options.find(option => !page.choiceQuestion.answer.includes(option.id)).id];
    await page.提交选择题();
    await page.提交选择题();
    await page.评分(4);
    assert.equal(writes.length, 1);
    assert.equal(writes[0][1], correct ? RATING_GOOD : RATING_HARD);
    assert.equal(page.阶段, 'answer');
    page.继续选择题反馈();
    page.继续选择题反馈();
    assert.equal(page.nextCount, 1);
    assert.equal(writes.length, 1);
  }
});

test('changing delay applies across questions, including disabling automatic advance', () => {
  const { page } = choicePage();
  assert.equal(page.choiceAutoAdvanceSeconds(), 5);
  page.choiceFeedbackSecondsOverride = 15;
  page.choiceQuestion = { ...page.choiceQuestion, feedbackSeconds: 3 };
  assert.equal(page.choiceAutoAdvanceSeconds(), 15);
  page.choiceFeedbackSecondsOverride = 0;
  assert.equal(page.choiceAutoAdvanceSeconds(), 0);
});

test('accepted choice write can finish after leaving without overwriting the newer UI', async () => {
  const { page, writes } = choicePage();
  let finish;
  page.choiceSelectedIds = page.choiceQuestion.answer;
  page.studySession.answer = async (...args) => {
    writes.push(args);
    await new Promise(resolve => { finish = resolve; });
  };
  const pending = page.提交选择题();
  page.requestVersion++;
  page.阶段 = 'loading';
  finish();
  await pending;
  assert.equal(writes.length, 1);
  assert.equal(page.阶段, 'loading');
});
