// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { StudyOptions, StudyAutoAdvanceSettings } from '../../entry/src/main/ets/model/StudyTiming.ts';

import { StudyAutoAdvanceDraft, StudyAdvanceField as Field } from '../../entry/src/main/ets/model/StudyAutoAdvanceDraft.ts';
import { loadUiFeedback } from './ui-feedback-harness.mjs';

const source = readFileSync(new URL('../../entry/src/main/ets/pages/学习页.ets', import.meta.url), 'utf8');
function methods(source, names) {
  return names.map(name => {
    const match = new RegExp('  (?:private )?(?:async )?' + name + '\\(').exec(source);
    assert.ok(match, name);
    return source.slice(match.index, source.indexOf('\n  }', match.index) + 4);
  }).join('\n');
}
const pageMethods = methods(source, ['configureAutoAdvance', 'choiceAutoAdvanceSeconds', 'studyTimerState', '更多菜单']);
const Page = new Function('StudyAutoAdvanceDraft', 'CustomDialogController', 'StudyAutoAdvanceDialog', 'DialogAlignment', '$r',
  stripTypeScriptTypes('class Page {' + pageMethods + '}', { mode: 'transform' }) + '\nreturn Page;')(
    StudyAutoAdvanceDraft, class {
      constructor(options) { this.options = options; }
      open() {}
      close() { this.options.builder.onClose(); }
    }, options => options, { Center: 0 }, key => key);

function harness(choice = false) {
  const page = new Page();
  const events = [];
  Object.assign(page, {
    当前卡片: {}, 阶段: 'answer', 评分中: false, requestVersion: 1, autoAdvanceSettingsOpen: false,
    choiceQuestion: choice ? { feedbackSeconds: 5 } : null, choiceGrade: choice ? {} : null,
    choiceFeedbackSecondsOverride: -1, choiceFeedbackDeadline: Date.now() + 5000,
    studyOptions: new StudyOptions(), autoAdvanceSettings: new StudyAutoAdvanceSettings(),
    autoAdvanceEnabled: false, studyMenuOpen: false, controllerReady: true, editor: {},
    取文案: x => x, isCurrentRequest: version => version === page.requestVersion,
    audioSession: { isPlaying: () => false },
    studyTimer: { restartAdvance: () => events.push('restart') },
    stopStudyTimers: () => events.push('stop'), startStudyTimers: () => events.push('start'),
    clearChoiceAutoAdvance: () => events.push('clear-choice'), scheduleChoiceAutoAdvance: () => events.push('schedule-choice')
  });
  const open = () => { page.configureAutoAdvance(); return page.autoAdvanceDialog.options.builder; };
  const confirm = dialog => { dialog.onConfirm(dialog.draft); dialog.onClose(); };
  return { page, events, open, confirm };
}
function select(draft, field, value) {
  draft.open(field); draft.selected = value; draft.confirmField();
}

test('session overrides keep zero as off, preserve per-card defaults and never mutate deck options', () => {
  const base = Object.assign(new StudyOptions(), { secondsToShowQuestion: 1.5, secondsToShowAnswer: 12, answerAction: 3 });
  const settings = new StudyAutoAdvanceSettings();
  settings.questionSeconds = 0;
  settings.questionAction = 1;
  const resolved = settings.resolve(base);
  assert.equal(resolved.secondsToShowQuestion, 0);
  assert.equal(resolved.secondsToShowAnswer, 12);
  assert.equal(resolved.answerAction, 3);
  assert.equal(resolved.questionAction, 1);
  assert.equal(base.secondsToShowQuestion, 1.5);
  base.secondsToShowAnswer = 20;
  assert.equal(settings.resolve(base).secondsToShowAnswer, 20);
  assert.deepEqual(new StudyAutoAdvanceSettings().resolve(base), { ...base }, 'new session restores deck defaults');
});

test('edit stays first and unified settings stay last and available with both timers off', () => {
  for (const choice of [false, true]) {
    for (const agent of [false, true]) {
      const { page } = harness(choice);
      page.Agent入口已启用 = agent;
      const menu = page.更多菜单();
      assert.equal(menu[0].value, 'app.string.study_edit_note');
      assert.equal(menu.at(-1).value, 'app.string.study_auto_advance_title');
      assert.equal(menu.at(-1).enabled, true);
      page.评分中 = true;
      assert.equal(page.更多菜单().at(-1).enabled, false);
    }
  }
});

test('secondary back discards selection and returns to settings; confirm stays in the same dialog', () => {
  const h = harness();
  const dialog = h.open();
  assert.equal(h.page.studyTimerState().active, false);
  dialog.draft.open(Field.QuestionTime);
  dialog.draft.selected = 10;
  assert.equal(dialog.draft.back(), false);
  assert.equal(dialog.draft.field, Field.Main);
  assert.equal(dialog.draft.value(Field.QuestionTime), 0);
  assert.equal(h.page.autoAdvanceSettingsOpen, true);
  select(dialog.draft, Field.QuestionTime, 5);
  assert.equal(dialog.draft.field, Field.Main);
  assert.equal(h.page.autoAdvanceSettings.questionSeconds, -1, 'secondary confirm only changes draft');
  dialog.draft.enabled = true;
  h.confirm(dialog);
  assert.equal(h.page.studyTimerState().options.secondsToShowQuestion, 5);
  assert.equal(h.page.autoAdvanceEnabled, true);
  assert.equal(h.page.studyOptions.secondsToShowQuestion, 0);
});

test('main back cancels all edits; zero durations disable advance without replacing deck defaults', () => {
  const h = harness();
  let dialog = h.open();
  select(dialog.draft, Field.AnswerAction, 2);
  assert.equal(dialog.draft.back(), true);
  dialog.onClose();
  assert.equal(h.page.autoAdvanceSettings.answerAction, -1);
  h.page.autoAdvanceSettings.questionSeconds = 5;
  h.page.autoAdvanceEnabled = true;
  dialog = h.open();
  select(dialog.draft, Field.QuestionTime, 0);
  assert.equal(dialog.draft.canEnable(), false);
  assert.equal(dialog.draft.enabled, false);
  h.confirm(dialog);
  assert.equal(h.page.autoAdvanceEnabled, false);
});

test('action confirm preserves other session overrides and fractional inherited durations', () => {
  const h = harness();
  h.page.autoAdvanceSettings.questionSeconds = 12.5;
  const dialog = h.open();
  dialog.draft.open(Field.QuestionTime);
  assert.equal(dialog.draft.selected, 12.5);
  assert.ok(dialog.draft.choices().includes(12.5));
  dialog.draft.back();
  select(dialog.draft, Field.AnswerAction, 2);
  h.confirm(dialog);
  assert.equal(h.page.autoAdvanceSettings.questionSeconds, 12.5);
  assert.equal(h.page.autoAdvanceSettings.answerAction, 2);
  assert.equal(h.page.autoAdvanceSettings.answerSeconds, -1);
});

test('leaving during either level ignores callbacks and never resumes timers', () => {
  for (const field of [Field.Main, Field.QuestionTime]) {
    const h = harness();
    const dialog = h.open();
    dialog.draft.open(field);
    h.page.requestVersion++;
    select(dialog.draft, Field.QuestionTime, 10);
    h.confirm(dialog);
    assert.equal(h.page.autoAdvanceSettings.questionSeconds, -1);
    assert.equal(h.events.includes('start'), false);
    assert.equal(h.events.includes('schedule-choice'), false);
  }
});

test('choice feedback changes only on main confirm; off and custom durations are preserved', t => {
  let now = 1000;
  t.mock.method(Date, 'now', () => now);
  const h = harness(true);
  let dialog = h.open();
  select(dialog.draft, Field.FeedbackTime, 0);
  h.confirm(dialog);
  assert.equal(h.page.choiceAutoAdvanceSeconds(), 0);
  assert.equal(h.page.choiceFeedbackDeadline, 0);
  dialog = h.open();
  select(dialog.draft, Field.FeedbackTime, 10);
  now += 7000;
  h.confirm(dialog);
  assert.equal(h.page.choiceFeedbackDeadline, now + 10000);
  assert.equal(h.page.choiceQuestion.feedbackSeconds, 5);
  assert.equal(h.page.autoAdvanceEnabled, false);
});

test('closing settings excludes menu time once and cancellation keeps feedback defaults', t => {
  let now = 1000;
  t.mock.method(Date, 'now', () => now);
  const h = harness(true);
  const dialog = h.open();
  now += 10000;
  dialog.onClose(); dialog.onClose();
  assert.equal(h.page.choiceFeedbackDeadline, 16000);
  assert.equal(h.page.choiceFeedbackSecondsOverride, -1);
  assert.equal(h.events.filter(x => x === 'start').length, 1);
});

const dialogSource = readFileSync(new URL('../../entry/src/main/ets/components/StudyAutoAdvanceDialog.ets', import.meta.url), 'utf8');
const resources = locale => JSON.parse(readFileSync(new URL(`../../entry/src/main/resources/${locale}/element/string.json`, import.meta.url))).string;
test('actual dialog labels format real Chinese and English resources through the shared resource boundary', () => {
  for (const locale of ['base', 'en_US']) {
    const strings = new Map(resources(locale).map(x => ['app.string.' + x.name, x.value]));
    const context = { getHostContext: () => ({ resourceManager: { getStringSync(id, ...args) {
      let index = 0;
      return strings.get(id).replace(/%s/g, () => String(args[index++]));
    } } }) };
    const Dialog = new Function('StudyAdvanceField', 'resourceText', '$r', stripTypeScriptTypes(
      'class Dialog {' + methods(dialogSource, ['label']) + '}', { mode: 'transform' }) + '; return Dialog;')(
        Field, loadUiFeedback().resourceText, (id, ...args) => ({ id, params: [id, ...args] }));
    const dialog = new Dialog(); dialog.getUIContext = () => context;
    for (const seconds of [3, 5, 10, 15, 30, 12.5]) {
      const text = dialog.label(Field.QuestionTime, seconds);
      assert.ok(text.includes(String(seconds)), text);
      assert.doesNotMatch(text, /%s|undefined/);
    }
  }
});

test('dialog uses shared app chrome, bottom actions, selected controls and routed system back', () => {
  assert.match(dialogSource, /DialogHeader\(\{ title: '', closeLabel: \$r\('app.string.study_back'\)/);
  assert.ok(dialogSource.indexOf('DialogHeader({') > dialogSource.indexOf('Scroll()'));
  assert.match(dialogSource, /Radio[\s\S]*checked\(this.selected === value\)/);
  assert.match(source, /onWillDismiss:[^\n]*this.autoAdvanceDialogBack\(\)/);
  assert.doesNotMatch(source, /selectAutoAdvanceOption|showActionMenu/);
});


test('actual dialog handlers route system and button back through the same level transitions', () => {
  const Dialog = new Function('StudyAdvanceField', stripTypeScriptTypes('class Dialog {' +
    methods(dialogSource, ['aboutToAppear', 'open', 'back', 'confirm']) + '}', { mode: 'transform' }) + '; return Dialog;')(Field);
  const dialog = new Dialog();
  let closed = 0, applied = 0, systemBack;
  Object.assign(dialog, {
    draft: new StudyAutoAdvanceDraft(new StudyOptions(), false, 5), field: Field.Main,
    controller: { close: () => closed++ }, onConfirm: () => applied++, registerBack: fn => { systemBack = fn; }
  });
  dialog.aboutToAppear();
  dialog.open(Field.QuestionTime); dialog.selected = 15;
  systemBack();
  assert.equal(dialog.field, Field.Main);
  assert.equal(closed, 0);
  assert.equal(dialog.draft.value(Field.QuestionTime), 0);
  dialog.open(Field.QuestionTime); dialog.selected = 10;
  dialog.confirm();
  assert.equal(dialog.field, Field.Main);
  assert.equal(closed, 0); assert.equal(applied, 0);
  assert.equal(dialog.draft.value(Field.QuestionTime), 10);
  dialog.confirm();
  assert.equal(closed, 1); assert.equal(applied, 1);
});


test('missing durations show the existing AI-setup toast only on an attempted enable', () => {
  const toasts = [];
  const api = loadUiFeedback();
  const Dialog = new Function('resourceText', 'showToastSafely', '$r', stripTypeScriptTypes('class Dialog {' +
    methods(dialogSource, ['changeAdvance']) + '}', { mode: 'transform' }) + '; return Dialog;')(
      api.resourceText, api.showToastSafely, id => ({ id, params: [id] }));
  const dialog = new Dialog();
  Object.assign(dialog, {
    draft: new StudyAutoAdvanceDraft(new StudyOptions(), false, 0), isAdvanceEnabled: false, toggleVersion: 0,
    getUIContext: () => ({ getHostContext: () => ({ resourceManager: { getStringSync: () => '请先设置停留时间' } }),
      getPromptAction: () => ({ showToast: options => toasts.push(options) }) })
  });
  assert.equal(toasts.length, 0);
  dialog.changeAdvance(false);
  assert.equal(toasts.length, 0);
  dialog.changeAdvance(true);
  assert.equal(toasts.length, 1);
  assert.equal(toasts[0].textColor.id, 'app.color.text_primary');
  assert.equal(dialog.isAdvanceEnabled, false);
  assert.equal(dialog.draft.enabled, false);
  assert.equal(dialog.toggleVersion, 1);
  select(dialog.draft, Field.QuestionTime, 5);
  dialog.changeAdvance(true);
  assert.equal(dialog.isAdvanceEnabled, true);
  assert.equal(toasts.length, 1);
  assert.doesNotMatch(dialogSource, /Text\(\$r\('app.string.study_auto_advance_set_time'\)/);
  assert.match(dialogSource, /showDivider: false/);
});
