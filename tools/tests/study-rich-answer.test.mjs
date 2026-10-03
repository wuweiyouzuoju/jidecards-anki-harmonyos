// SPDX-License-Identifier: AGPL-3.0-or-later
import assert from 'node:assert/strict';
import test from 'node:test';
import { renderStudyAnswer } from '../../entry/src/main/ets/model/StudyAnswerRenderer.ts';
import { parseNoteRichText, serializeNoteRichText } from '../../entry/src/main/ets/model/NoteRichText.ts';
import { 构建卡片HTML } from '../../entry/src/main/ets/model/学习卡片HTML构建器.ts';
import { 比对答案 } from '../../entry/src/main/ets/model/拼写比对器.ts';

const field = '<mark><b>浮、熔、游、响、红</b></mark>。<br>浮：密度比水小';
const request = {noteId: 1, fieldName: 'Back', cloze: false, ordinal: 0, input: '', combining: true};
const backend = { note: async () => ({notetypeId: 2, fields: ['Question', field]}),
  notetype: async () => ({fieldNames: ['Front', 'Back']}) };

test('normal field replacement preserves editor HTML in light and dark card documents', async () => {
  const saved = serializeNoteRichText(parseNoteRichText(field));
  assert.equal(saved, '<b><mark>浮、熔、游、响、红</mark></b>。<br>浮：密度比水小');
  for (const dark of [false, true]) {
    const html = 构建卡片HTML({questionNodes: [{text: 'Question', replacement: null}],
      answerNodes: [{text: `Question<hr id="answer">${saved}`, replacement: null}], css: '', latexSvg: false}, 'answer', dark);
    const rendered = await renderStudyAnswer(html, null, backend);
    assert.ok(rendered.includes(saved)); assert.ok(!rendered.includes('id=typeans'));
  }
});

test('standard typing compares plain text even without input, as in locked Anki Core', async () => {
  const noInput = await renderStudyAnswer('Q<hr>[[type:Back]]', request, backend);
  assert.equal(noInput, `Q<hr>${比对答案(field, '', true)}`);
  assert.doesNotMatch(noInput, /<mark>|<b>|jide-typed-answer/);
  const result = await renderStudyAnswer('Q<hr>[[type:Back]]', {...request, input: 'wrong'}, backend);
  assert.match(result, /typeBad/); assert.match(result, /typeMissed/);
  assert.doesNotMatch(result, /<mark>|<b>|jide-typed-answer/);
  const existing = await renderStudyAnswer(`${field}[[type:Back]]`, {...request, input: 'wrong'}, backend);
  assert.equal(existing.split(field).length, 2, 'explicit answer field is not repeated');
  assert.match(existing, /typeBad/);
});

test('cloze and read failure retain the existing rendering semantics', async () => {
  const clozeBackend = {...backend, note: async () => ({notetypeId: 2, fields: ['Q', '{{c1::<b>answer</b>}}']})};
  const cloze = await renderStudyAnswer('[[type:cloze:Back]]', {...request, cloze: true}, clozeBackend);
  assert.match(cloze, /id=typeans/); assert.doesNotMatch(cloze, /jide-typed-answer/);
  const html = '<b>original</b>[[type:Back]]';
  assert.equal(await renderStudyAnswer(html, request, {note: async () => {throw Error('offline');}}), '<b>original</b>');
});
