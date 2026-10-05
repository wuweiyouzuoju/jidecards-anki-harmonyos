import { NoteEditorSession, initialNoteEditorState } from '../../entry/src/main/ets/model/NoteEditorSession.ts';
import { StudyTimerController } from '../../entry/src/main/ets/model/StudyTimerController.ts';
import { ReviewPreferences } from '../../entry/src/main/ets/proto/messages/PreferencesMessages.ts';
// SPDX-License-Identifier: AGPL-3.0-or-later
import { StudySessionController } from '../../entry/src/main/ets/model/StudySessionController.ts';
import { AutoSyncScheduler } from '../../entry/src/main/ets/model/AutoSyncScheduler.ts';
import { StudyOptions, StudyTiming, StudyAdvanceAction, StudyAutoAdvanceSettings } from '../../entry/src/main/ets/model/StudyTiming.ts';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { SyncActivity } from '../../entry/src/main/ets/model/SyncSettings.ts';
import { buildStudyGestureScript, StudyQuickAnswerMode } from '../../entry/src/main/ets/model/StudyGestures.ts';
import {defaultStudyControls,validateStudyControls} from '../../entry/src/main/ets/model/StudyControls.ts';

export function attachStudySession(page) {
  page.whiteboardMounted = false;
  page.whiteboardResetTick = 0;
  // These tests isolate study orchestration. CardWebSession has separate runtime/browser coverage.
  page.cardRenderPending = false;
  // Onboarding has its own page/gesture tests; these hosts only exercise the study session.
  page.maybeShowTapZonesGuide ??= () => {};
  page.cardWeb = { reset() {}, attach() {}, show: html => {
    page.网页控制器.loadData(html);
    page.studyCardShown('');
  } };
  page.noteReader = {
    card: id => page.卡片服务实例.获取卡片(id), note: id => page.笔记服务实例.获取笔记(id),
    notetype: id => page.笔记类型服务实例.获取笔记类型(id)
  };
  page.studyScheduler = new AutoSyncScheduler();
  page.syncActivity = new SyncActivity();
  page.studyOptions = new StudyOptions();
  page.reviewPreferences = Object.assign(new ReviewPreferences(), {showRemaining: true, showIntervals: true});
  page.timeboxNotice = null;
  page.choiceFeedbackDeadline ??= 0;
  page.maybeShowTimebox = () => {};
  page.editor = initialNoteEditorState();
  page.editorSession = new NoteEditorSession(page.noteReader, state => { page.editor = state; });
  page.autoAdvanceEnabled = false;
  page.autoAdvanceSettings = new StudyAutoAdvanceSettings();
  page.studyMenuOpen = false;
  page.controlsJson ??= JSON.stringify(defaultStudyControls());
  const source = readFileSync(new URL('../../entry/src/main/ets/pages/学习页.ets', import.meta.url), 'utf8');
  const names = ['startStudyTimers', 'stopStudyTimers', 'studyTimerState', 'applyTimedAction', 'toggleAutoAdvance',
    'resetWhiteboard', 'studyCardShown', 'refreshStudyGestureScript', 'controls', 'isStudyGesturesEnabled'];
  const methods = names.map(name => {
    const start = source.indexOf('  private ' + name + '(');
    return source.slice(start, source.indexOf('\n  }', start) + 4);
  });
  const TimingPage = new Function('StudyAdvanceAction', 'BURY_SUSPEND_MODE_BURY_USER', '$r', 'buildStudyGestureScript', 'StudyQuickAnswerMode', 'validateStudyControls',
    stripTypeScriptTypes('class TimingPage {' + methods.join('\n') + '}', { mode: 'transform' }) + '; return TimingPage;')(
    StudyAdvanceAction, 2, key => key, buildStudyGestureScript, StudyQuickAnswerMode,validateStudyControls);
  for (const name of names) page[name] = TimingPage.prototype[name];
  page.timerHandles = new Map(); let nextTimer = 0;
  page.studyTimer = new StudyTimerController({ state: () => page.studyTimerState(),
    display: text => { page.studyTimerText = text; }, act: action => page.applyTimedAction(action) }, {
    now: () => Date.now(), repeat: fn => { const id = ++nextTimer; page.timerHandles.set(id, fn); return id; },
    cancel: id => page.timerHandles.delete(id)
  });
  page.studySession = new StudySessionController({
    updateNote: async note => { await page.笔记服务实例.更新笔记([note], false); },
    buryCard: (id, mode) => page.调度器服务实例.埋藏或暂停卡片(id, mode),
    removeCard: id => page.卡片服务实例.删除卡片([id]),
    unburyDeck: id => page.调度器服务实例.按牌组恢复埋藏(id, 0),
    canUndo: async () => (await page.集合服务实例.获取撤销状态()).undo.length > 0,
    queuedCards: id => page.调度器服务实例.获取队首卡片(id),
    renderCard: id => page.卡片渲染服务实例.渲染既有卡片(id),
    studyOptions: async () => page.studyOptions,
    reviewPreferences: async () => page.reviewPreferences,
    describeStates: states => page.调度器服务实例.描述下一档状态(states),
    answer: input => page.调度器服务实例.提交评分(input),
    undo: () => page.集合服务实例.撤销(),
    congrats: () => page.调度器服务实例.获取完成页信息()
  }, page.studyScheduler, page.syncActivity);
  page.studySession.activate();
}
