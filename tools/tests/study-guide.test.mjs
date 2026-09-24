import { resolveStudyKey } from '../../entry/src/main/ets/model/StudyInputPolicy.ts';
import { loadNoteEditor } from '../../entry/src/main/ets/model/NoteEditorLoader.ts';
// SPDX-License-Identifier: AGPL-3.0-or-later
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import vm from 'node:vm';
import test from 'node:test';

const read = path => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const pageSource = read('entry/src/main/ets/pages/学习页.ets');

function storeHarness() {
  let memory = new Map();
  let disk = new Map();
  let fail = false;
  const store = {
    getSync: (key, fallback) => memory.get(key) ?? fallback,
    putSync: (key, value) => memory.set(key, value),
    flush: async () => {
      if (fail) throw new Error('disk full');
      disk = new Map(memory);
    }
  };
  const source = read('entry/src/main/ets/utils/StudyGuideStore.ets')
    .replace(/^import .*;\r?\n/gm, '').replace(/^export /gm, '');
  const context = vm.createContext({ resolveStudyKey, loadNoteEditor, studyKeyName: key => String(key), KeyType: { Down: 0 },
    AppStorage: { get: () => ({}) },
    preferences: { getPreferencesSync: () => store }
  });
  vm.runInContext(stripTypeScriptTypes(source), context);
  return { context, restart: () => { memory = new Map(disk); }, fail: () => { fail = true; } };
}

function pageHarness(completed = false) {
  let now = 1000;
  const dialogs = [];
  let saves = 0;
  const context = vm.createContext({ resolveStudyKey, loadNoteEditor, studyKeyName: key => String(key), KeyType: { Down: 0 },
    Date: { now: () => now }, $r: key => key,
    DialogAlignment: { Center: 0 },
    hilog: { warn: () => {} },
    isStudyGuideCompleted: () => completed,
    playStudyHaptic: () => {},
    completeStudyGuide: async () => { saves++; completed = true; }
  });
  const methods = ['maybeShowStudyGuide', 'showStudyGuide', '处理按键', '处理TapZone点击', '评分', 'clearChoiceAutoAdvance', 'scheduleChoiceAutoAdvance', 'choiceAutoAdvanceSeconds'].map(name => {
    const start = pageSource.search(new RegExp(`  private (?:async )?${name}\\(`));
    assert.notEqual(start, -1);
    return pageSource.slice(start, pageSource.indexOf('\n  }', start) + 4);
  });
  vm.runInContext(stripTypeScriptTypes(`globalThis.Harness = class { ${methods.join('\n')} }`), context);
  const page = new context.Harness();
  Object.assign(page, { editor: { visible: false, busy: false },
    studyGuideChecked: false, studyGuideVisible: false, stopStudyTimers() {}, startStudyTimers() {}, controllerReady: true, pendingHtml: '',
    choiceQuestion: null, choiceGrade: null, choiceAutoAdvanceTimer: -1, choiceFeedbackDeadline: 0, studyMenuOpen: false,
    页面已显示: false, 阶段: 'loading', 当前卡片: {}, 展示时刻毫秒: 500,
    getUIContext: () => ({ showAlertDialog: options => dialogs.push(options) })
  });
  return { page, dialogs, advance: ms => { now += ms; }, saves: () => saves };
}

test('guide completion survives restart and failed persistence restores the unread state', async () => {
  const fresh = storeHarness();
  assert.equal(fresh.context.isStudyGuideCompleted(), false);
  await fresh.context.completeStudyGuide();
  fresh.restart();
  assert.equal(fresh.context.isStudyGuideCompleted(), true);
  const failed = storeHarness();
  failed.fail();
  await assert.rejects(failed.context.completeStudyGuide(), /disk full/);
  assert.equal(failed.context.isStudyGuideCompleted(), false);
  failed.restart();
  assert.equal(failed.context.isStudyGuideCompleted(), false);
});

test('automatic guide waits for a visible card and handles either readiness order once', () => {
  for (const visibleFirst of [true, false]) {
    const { page, dialogs } = pageHarness();
    if (visibleFirst) page.页面已显示 = true;
    else page.阶段 = 'question';
    page.maybeShowStudyGuide();
    assert.equal(dialogs.length, 0);
    assert.equal(page.studyGuideChecked, false);
    page.页面已显示 = true;
    page.阶段 = 'question';
    page.maybeShowStudyGuide();
    page.maybeShowStudyGuide();
    assert.equal(dialogs.length, 1);
  }
  for (const phase of ['loading', 'done', 'error']) {
    const { page, dialogs } = pageHarness();
    page.页面已显示 = true;
    page.阶段 = phase;
    page.maybeShowStudyGuide();
    assert.equal(dialogs.length, 0);
    assert.equal(page.studyGuideChecked, false);
  }
  const returning = pageHarness(true);
  returning.page.页面已显示 = true;
  returning.page.阶段 = 'question';
  returning.page.maybeShowStudyGuide();
  assert.equal(returning.dialogs.length, 0);
  returning.page.showStudyGuide();
  assert.equal(returning.dialogs.length, 1, 'completed guide remains available from More');
});

test('confirmation saves completion and excludes reading time without allowing review inputs', async () => {
  const { page, dialogs, advance, saves } = pageHarness();
  page.页面已显示 = true;
  page.阶段 = 'answer';
  page.showStudyGuide();
  page.showStudyGuide();
  assert.equal(dialogs.length, 1);
  assert.equal(page.处理按键({}), false, 'let dialog handle keys without invoking review shortcuts');
  page.处理TapZone点击(0, 0);
  await page.评分(0);
  advance(60000);
  dialogs[0].confirm.action();
  assert.equal(page.studyGuideVisible, false);
  assert.equal(page.展示时刻毫秒, 60500);
  assert.equal(saves(), 1);
});

test('back dismissal keeps guide unread and never adjusts the time of a replaced card', () => {
  for (const replacedCard of [false, true]) {
    const { page, dialogs, advance, saves } = pageHarness();
    page.页面已显示 = true;
    page.阶段 = 'question';
    page.showStudyGuide();
    advance(5000);
    if (replacedCard) page.当前卡片 = {};
    let dismissed = false;
    dialogs[0].onWillDismiss({ dismiss: () => { dismissed = true; } });
    assert.equal(dismissed, true);
    assert.equal(page.studyGuideVisible, false);
    assert.equal(page.展示时刻毫秒, replacedCard ? 500 : 5500);
    assert.equal(saves(), 0);
  }
});

test('manual guide cannot open during loading or while a rating is being submitted', () => {
  const { page, dialogs } = pageHarness();
  page.页面已显示 = true;
  page.showStudyGuide();
  page.阶段 = 'answer';
  page.评分中 = true;
  page.showStudyGuide();
  assert.equal(dialogs.length, 0);
  assert.equal(page.studyGuideVisible, false);
});

test('both review layouts preserve rating identity while displaying backend intervals separately', () => {
  const toolbar = read('entry/src/main/ets/components/学习浮动工具栏.ets');
  const button = read('entry/src/main/ets/components/StudyActionButton.ets');
  for (const rating of ['again', 'hard', 'good', 'easy']) {
    assert.match(pageSource, new RegExp(`label: \\$r\\('app.string.rating_${rating}'\\),\\s+subtitle: this.按钮文案位\\(RATING_${rating.toUpperCase()}\\)`));
    assert.match(toolbar, new RegExp(`竖版评分按钮\\(RATING_${rating.toUpperCase()}, \\$r\\('app.string.rating_${rating}'\\)`));
  }
  assert.match(button, /Text\(this.label\)[\s\S]*Text\(this.subtitle\)/);
  assert.match(toolbar, /Text\(标签\)[\s\S]*Text\(this.取评分按钮文案\(评分\)\)/);
  assert.doesNotMatch(pageSource + toolbar, /兜底文案/);
  assert.match(read('entry/src/main/ets/backend/StudySessionBackend.ts'), /描述下一档状态/);
  assert.match(pageSource, /this\.按钮文案 = snapshot\.labels/);
});

test('first-use guide and settings use the same rating, interval, bury and suspend explanations', () => {
  for (const locale of ['base', 'en_US']) {
    const strings = new Map(JSON.parse(read(`entry/src/main/resources/${locale}/element/string.json`)).string.map(item => [item.name, item.value]));
    const guide = strings.get('study_guide_message');
    for (const key of ['glossary_bury_help', 'glossary_suspend_help']) {
      assert.ok(guide.includes(strings.get(key).split('\n\n')[0]));
    }
    const ratingsHelp = strings.get('glossary_ratings_help').split('\n\n');
    assert.ok(guide.includes(ratingsHelp[1]), 'identical rating definitions');
    assert.ok(guide.includes(ratingsHelp[2]), 'identical interval explanation');
    for (const key of ['rating_again', 'rating_hard', 'rating_good', 'rating_easy', 'study_bury', 'study_suspend']) {
      assert.ok(guide.includes(strings.get(key)), key);
    }
    if (locale === 'base') {
      for (const [key, value] of strings) {
        if (key !== 'deck_lapseMultiplier_help') assert.ok(!value.includes('重来'), `${key}: old rating label`);
      }
    }
  }
});
