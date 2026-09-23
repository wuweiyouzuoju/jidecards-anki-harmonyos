// SPDX-License-Identifier: AGPL-3.0-or-later

export const JIDE_CHOICE_FORMAT: string = 'jidecards.choice';
export const JIDE_CHOICE_NOTETYPE_NAME: string = 'JideCards Choice v1';
export const JIDE_CHOICE_NOTETYPE_FIELDS: string[] = ['Prompt', 'OptionsHTML', 'JidePayload', 'AnswerHTML', 'Explanation'];
export const JIDE_CHOICE_MAX_BYTES: number = 2 * 1024 * 1024;
export const JIDE_CHOICE_FRONT: string = '{{Prompt}}<div class="jide-choice-options">{{OptionsHTML}}</div>';
export const JIDE_CHOICE_BACK: string = '{{FrontSide}}\n<hr id="answer">\n{{AnswerHTML}}\n{{#Explanation}}<hr>\n{{Explanation}}{{/Explanation}}';
export const JIDE_CHOICE_CSS: string = '.card { font-family: sans-serif; font-size: 20px; text-align: left; } .jide-choice-options { margin-top: 1em; line-height: 1.6; }';

export interface JideChoiceOption {
  id: string;
  text: string;
}

export interface JideChoiceQuestion {
  id: string;
  type: 'single_choice' | 'multiple_choice';
  prompt: string;
  options: JideChoiceOption[];
  answer: string[];
  explanation: string;
  feedbackSeconds: number;
}

export interface JideChoiceDeck {
  format: string;
  version: 1;
  id: string;
  title: string;
  feedbackSeconds: number;
  questions: JideChoiceQuestion[];
}

export interface JideChoicePayload extends JideChoiceQuestion {
  format: string;
  version: number;
}

export interface JideChoiceGrade {
  correct: boolean;
  selectedIds: string[];
  correctIds: string[];
}

function record(value: Object, label: string): Record<string, Object> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label}_must_be_object`);
  }
  return value as Record<string, Object>;
}

function text(value: Object, label: string, maxLength: number): string {
  if (typeof value !== 'string' || value.trim().length === 0 || value.length > maxLength ||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)) {
    throw new Error(`${label}_invalid`);
  }
  return value;
}

function checkKeys(value: Record<string, Object>, allowed: string[], label: string): void {
  for (const key of Object.keys(value)) {
    if (allowed.indexOf(key) < 0) throw new Error(`${label}_unknown_field_${key}`);
  }
}

function readQuestion(value: Object, index: number, feedbackSeconds: number): JideChoiceQuestion {
  const item: Record<string, Object> = record(value, `question_${index}`);
  checkKeys(item, ['id', 'type', 'prompt', 'options', 'answer', 'explanation', 'feedbackSeconds', 'format', 'version'],
    `question_${index}`);
  const type: Object = item['type'];
  if (type !== 'single_choice' && type !== 'multiple_choice') {
    throw new Error(`question_${index}_type_unsupported`);
  }
  const rawOptions: Object = item['options'];
  if (!Array.isArray(rawOptions) || rawOptions.length < 2 || rawOptions.length > 10) {
    throw new Error(`question_${index}_options_count_invalid`);
  }
  const options: JideChoiceOption[] = [];
  const optionIds: Set<string> = new Set<string>();
  for (let optionIndex: number = 0; optionIndex < rawOptions.length; optionIndex++) {
    const option: Record<string, Object> = record(rawOptions[optionIndex], `question_${index}_option_${optionIndex}`);
    checkKeys(option, ['id', 'text'], `question_${index}_option_${optionIndex}`);
    const id: string = text(option['id'], `question_${index}_option_${optionIndex}_id`, 80);
    if (optionIds.has(id)) { throw new Error(`question_${index}_option_id_duplicate`); }
    optionIds.add(id);
    options.push({ id: id, text: text(option['text'], `question_${index}_option_${optionIndex}_text`, 10000) });
  }
  const rawAnswers: Object = item['answer'];
  if (!Array.isArray(rawAnswers) || rawAnswers.length === 0) {
    throw new Error(`question_${index}_answer_invalid`);
  }
  const answers: string[] = [];
  for (const answer of rawAnswers) {
    if (typeof answer !== 'string' || !optionIds.has(answer) || answers.indexOf(answer) >= 0) {
      throw new Error(`question_${index}_answer_option_invalid`);
    }
    answers.push(answer);
  }
  if ((type === 'single_choice' && answers.length !== 1) || (type === 'multiple_choice' && answers.length < 2)) {
    throw new Error(`question_${index}_answer_count_invalid`);
  }
  const explanation: Object = item['explanation'] ?? '';
  if (typeof explanation !== 'string' || explanation.length > 20000 ||
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(explanation)) {
    throw new Error(`question_${index}_explanation_invalid`);
  }
  return {
    id: text(item['id'], `question_${index}_id`, 120),
    type: type as 'single_choice' | 'multiple_choice',
    prompt: text(item['prompt'], `question_${index}_prompt`, 20000),
    options: options,
    answer: answers,
    explanation: explanation,
    feedbackSeconds: feedbackSeconds
  };
}

/** 校验制题源文件；应用只导入标准 APKG，不直接导入 JSON。 */
export function parseJideChoiceDeck(json: string): JideChoiceDeck {
  if (json.length > JIDE_CHOICE_MAX_BYTES) { throw new Error('package_too_large'); }
  let parsed: Object;
  try { parsed = JSON.parse(json) as Object; } catch (error) { throw new Error('package_json_invalid'); }
  const root: Record<string, Object> = record(parsed, 'package');
  checkKeys(root, ['format', 'version', 'id', 'title', 'feedbackSeconds', 'questions'], 'package');
  if (root['format'] !== JIDE_CHOICE_FORMAT || root['version'] !== 1) { throw new Error('package_version_unsupported'); }
  const rawQuestions: Object = root['questions'];
  if (!Array.isArray(rawQuestions) || rawQuestions.length === 0 || rawQuestions.length > 5000) {
    throw new Error('package_question_count_invalid');
  }
  const rawFeedbackSeconds: Object = root['feedbackSeconds'] ?? 5;
  if (typeof rawFeedbackSeconds !== 'number' || !Number.isInteger(rawFeedbackSeconds) ||
    rawFeedbackSeconds < 0 || rawFeedbackSeconds > 60) {
    throw new Error('package_feedback_seconds_invalid');
  }
  const feedbackSeconds: number = rawFeedbackSeconds;
  const questions: JideChoiceQuestion[] = [];
  const ids: Set<string> = new Set<string>();
  for (let index: number = 0; index < rawQuestions.length; index++) {
    const source: Record<string, Object> = record(rawQuestions[index], `question_${index + 1}`);
    checkKeys(source, ['id', 'type', 'prompt', 'options', 'answer', 'explanation'], `question_${index + 1}`);
    const question: JideChoiceQuestion = readQuestion(rawQuestions[index], index + 1, feedbackSeconds);
    if (ids.has(question.id)) { throw new Error(`question_${index + 1}_id_duplicate`); }
    ids.add(question.id);
    questions.push(question);
  }
  return {
    format: JIDE_CHOICE_FORMAT, version: 1, feedbackSeconds: feedbackSeconds,
    id: text(root['id'], 'package_id', 200),
    title: text(root['title'], 'package_title', 200),
    questions: questions
  };
}

export function jideChoiceQuestionFromNote(fields: string[],
  fieldNames: string[] = JIDE_CHOICE_NOTETYPE_FIELDS): JideChoiceQuestion | null {
  const payloadIndex: number = fieldNames.indexOf('JidePayload');
  if (payloadIndex < 0 || payloadIndex >= fields.length || fields[payloadIndex].trim() === '') return null;
  let payload: Object;
  try {
    payload = JSON.parse(fields[payloadIndex]) as Object;
  } catch (error) {
    throw new Error('jide_choice_note_corrupt');
  }
  const payloadRecord: Record<string, Object> = record(payload, 'note');
  if (payloadRecord['format'] !== JIDE_CHOICE_FORMAT || payloadRecord['version'] !== 1) return null;
  const feedbackSeconds: Object = payloadRecord['feedbackSeconds'] ?? 5;
  if (typeof feedbackSeconds !== 'number' || !Number.isInteger(feedbackSeconds) || feedbackSeconds < 0 || feedbackSeconds > 60) {
    throw new Error('jide_choice_note_corrupt');
  }
  const question: JideChoiceQuestion = readQuestion(payload, 1, feedbackSeconds);
  const expected: string[] = jideChoiceNoteFields(question);
  for (let index: number = 0; index < JIDE_CHOICE_NOTETYPE_FIELDS.length; index++) {
    const ordinal: number = fieldNames.indexOf(JIDE_CHOICE_NOTETYPE_FIELDS[index]);
    if (ordinal < 0 || fieldNames.lastIndexOf(JIDE_CHOICE_NOTETYPE_FIELDS[index]) !== ordinal ||
      ordinal >= fields.length || (index !== 2 && expected[index] !== fields[ordinal])) {
      throw new Error('jide_choice_note_corrupt');
    }
  }
  return question;
}

/** 版本标记随普通字段同步；HTML 与原生判题共用同一份源数据。 */
export function jideChoiceNoteFields(question: JideChoiceQuestion): string[] {
  const payload: JideChoicePayload = {
    format: JIDE_CHOICE_FORMAT, version: 1, id: question.id, type: question.type,
    prompt: question.prompt, options: question.options, answer: question.answer,
    explanation: question.explanation, feedbackSeconds: question.feedbackSeconds
  };
  const json: string = JSON.stringify(payload).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');
  return [escapeJideChoiceText(question.prompt), jideChoiceOptionsHtml(question.options), json,
    jideChoiceAnswerHtml(question), escapeJideChoiceText(question.explanation)];
}

export function gradeJideChoice(selectedIds: string[], correctIds: string[]): JideChoiceGrade {
  const selected: Set<string> = new Set<string>(selectedIds);
  const correct: Set<string> = new Set<string>(correctIds);
  let equal: boolean = selected.size === correct.size;
  if (equal) {
    for (const id of correct) { if (!selected.has(id)) { equal = false; break; } }
  }
  return { correct: equal, selectedIds: Array.from(selected), correctIds: Array.from(correct) };
}

export function escapeJideChoiceText(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/\n/g, '<br>');
}

export function jideChoiceOptionsHtml(options: JideChoiceOption[]): string {
  return options.map((option: JideChoiceOption, index: number): string =>
    `${String.fromCharCode(65 + index)}. ${escapeJideChoiceText(option.text)}`).join('<br>');
}

export function hideJideChoiceStaticOptions(html: string): string {
  return html.replace('<div class="jide-choice-options">', '<div style="display:none">');
}

export function jideChoiceAnswerHtml(question: JideChoiceQuestion): string {
  const answers: string[] = [];
  for (let index: number = 0; index < question.options.length; index++) {
    const option: JideChoiceOption = question.options[index];
    if (question.answer.indexOf(option.id) >= 0) {
      answers.push(`${String.fromCharCode(65 + index)}. ${escapeJideChoiceText(option.text)}`);
    }
  }
  return answers.join('<br>');
}
