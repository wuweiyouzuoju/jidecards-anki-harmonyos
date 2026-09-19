// SPDX-License-Identifier: AGPL-3.0-or-later
import { StudySessionController } from '../../entry/src/main/ets/model/StudySessionController.ts';
import { AutoSyncScheduler } from '../../entry/src/main/ets/model/AutoSyncScheduler.ts';
import { StudyOptions, StudyTiming, StudyAdvanceAction } from '../../entry/src/main/ets/model/StudyTiming.ts';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { SyncActivity } from '../../entry/src/main/ets/model/SyncSettings.ts';

export function attachStudySession(page) {
  page.studyScheduler = new AutoSyncScheduler();
  page.syncActivity = new SyncActivity();
  page.studyOptions = new StudyOptions();
  page.studyTiming = new StudyTiming();
  page.studyTimerId = -1;
  page.autoAdvanceEnabled = false;
  page.studyMenuOpen = false;
  const source = readFileSync(new URL('../../entry/src/main/ets/pages/学习页.ets', import.meta.url), 'utf8');
  const names = ['startStudyTimers', 'stopStudyTimers', 'tickStudyTimers', 'toggleAutoAdvance'];
  const methods = names.map(name => {
    const start = source.indexOf('  private ' + name + '(');
    return source.slice(start, source.indexOf('\n  }', start) + 4);
  });
  const TimingPage = new Function('StudyAdvanceAction', 'BURY_SUSPEND_MODE_BURY_USER', '$r',
    stripTypeScriptTypes('class TimingPage {' + methods.join('\n') + '}', { mode: 'transform' }) + '; return TimingPage;')(
    StudyAdvanceAction, 2, key => key);
  for (const name of names) page[name] = TimingPage.prototype[name];
  page.studySession = new StudySessionController({
    canUndo: async () => (await page.集合服务实例.获取撤销状态()).undo.length > 0,
    queuedCards: id => page.调度器服务实例.获取队首卡片(id),
    renderCard: id => page.卡片渲染服务实例.渲染既有卡片(id),
    studyOptions: async () => page.studyOptions,
    describeStates: states => page.调度器服务实例.描述下一档状态(states),
    answer: input => page.调度器服务实例.提交评分(input),
    undo: () => page.集合服务实例.撤销(),
    congrats: () => page.调度器服务实例.获取完成页信息()
  }, page.studyScheduler, page.syncActivity);
  page.studySession.activate();
}
