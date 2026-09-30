// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { componentMethods, settle } from './sync-panel-harness.mjs';
import { homeDataHarness } from './home-data-harness.mjs';
import { HomeRefreshQueue } from '../../entry/src/main/ets/model/HomeRefreshQueue.ts';
import { HomeSyncController } from '../../entry/src/main/ets/model/HomeSyncController.ts';
import { AutoSyncScheduler } from '../../entry/src/main/ets/model/AutoSyncScheduler.ts';
import { SyncActivity } from '../../entry/src/main/ets/model/SyncSettings.ts';

const read = path => readFileSync(new URL('../../entry/src/main/ets/' + path, import.meta.url), 'utf8');
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
function harness() {
  const { repository, state } = homeDataHarness();
  const scheduler = new AutoSyncScheduler(), activity = new SyncActivity();
  const Page = componentMethods(read('pages/首页.ets'), ['加载主页数据', '执行加载主页数据', 'queueHomeStatistics'], {
    $r: id => ({ id }), syncActivity: activity, autoSyncScheduler: scheduler,
    reconcileHomeExpansion: () => ({ expanded: new Set(), known: new Set() }), 可见牌组行: decks => decks,
    hilog: { warn() {} }
  });
  const page = Object.assign(new Page(), {
    homeData: repository, homeDataGeneration: 0, homeDisposed: false, autoSyncCollectionBusy: false,
    refreshQueue: new HomeRefreshQueue(), statisticsQueue: new HomeRefreshQueue(),
    加载状态: 'ready', 上次牌组已恢复: true, 当前断点: 'xs', historyRefreshToken: 0,
    主页快照数据: { decks: [], today: { completedCount: 2 }, memory: {} },
    取能力上下文: () => ({ filesDir: '/', resourceManager: { getStringSync: () => 'Default' } }),
    显示提示() {}, reconcileDeckSelection: async () => true, scheduleAutomaticBackup() {},
    牌组数据源: { replaceAll() {} }, 页面栈: { size: () => 0 }
  });
  const host = {
    isDisposed: () => page.homeDisposed, syncCollectionBusy: () => page.autoSyncCollectionBusy,
    setCollectionBusy: busy => { page.autoSyncCollectionBusy = busy; }, activity: () => ({ dialogOpen: false }),
    refreshAfterCollection: () => page.加载主页数据(), isForeground: () => true,
    pageDepth: () => page.页面栈.size(), loadState: () => page.加载状态, activityChanged() {}, notifyWait() {}
  };
  const controller = new HomeSyncController(scheduler, activity, () => host);
  page.syncController = controller;
  return { page, state, controller, scheduler, activity };
}

test('slow widget delivery does not hold the sync completion or next deck refresh', async () => {
  const h = harness(), wait = deferred(); h.state.saveWait = wait.promise;
  let navigated = 0;
  await h.controller.collectionFinished(false); await settle();
  assert.equal(h.state.calls.includes('save'), true);
  if (!h.controller.defer(() => { navigated++; }, true)) navigated++;
  assert.equal(navigated, 1);
  assert.equal(h.controller.isRefreshing(), false);
  await h.page.加载主页数据();
  assert.equal(h.page.加载状态, 'ready');
  wait.resolve(); await h.page.statisticsQueue.run(async () => {});
});

test('a queued study request wins before any optional graph RPC is started', async () => {
  const h = harness(); h.page.autoSyncCollectionBusy = true;
  let navigated = false;
  h.controller.defer(() => { navigated = true; h.page.页面栈.size = () => 1; }, true);
  await h.controller.collectionFinished(false); await settle();
  assert.equal(navigated, true);
  assert.equal(h.state.calls.some(call => Array.isArray(call) && call[0] === 'graphs'), false);
});

test('late statistics cannot overwrite a newer home generation or disposed page', async () => {
  for (const change of ['generation', 'disposed', 'study']) {
    const h = harness(), wait = deferred(); h.state.saveWait = wait.promise;
    await h.page.加载主页数据(); await settle();
    if (change === 'generation') h.page.homeDataGeneration++;
    if (change === 'disposed') h.page.homeDisposed = true;
    if (change === 'study') h.page.页面栈.size = () => 1;
    wait.resolve(); await h.page.statisticsQueue.run(async () => {});
    assert.equal(h.page.主页快照数据.today.completedCount, 2, change);
    assert.equal(h.page.statsSnapshot, undefined);
  }
});

test('queued statistics skip collection reads after navigation and preserve deck metadata when published', async () => {
  const h = harness(), wait = deferred();
  h.page.statisticsQueue.run(() => wait.promise);
  await h.page.加载主页数据();
  h.page.页面栈.size = () => 1;
  wait.resolve(); await h.page.statisticsQueue.run(async () => {});
  assert.equal(h.state.calls.some(call => Array.isArray(call) && call[0] === 'graphs'), false);
  h.page.页面栈.size = () => 0;
  await h.page.加载主页数据(); await h.page.statisticsQueue.run(async () => {});
  assert.equal(h.page.主页快照数据.today.completedCount, 9);
  assert.equal(h.page.主页快照数据.decks[0].name, 'Default');
});

test('settings opens during collection work while database-only sections remain guarded', () => {
  const activity = new SyncActivity(); activity.reserveCollection();
  const Home = componentMethods(read('pages/首页.ets'), ['openSettings', 'openAISettings'], {});
  const paths = [], home = Object.assign(new Home(), {
    syncController: { cancel() {} }, 暂停主页官方公告检查() {}, 页面栈: { pushPath: p => paths.push(p) },
    deferForSync: () => assert.fail('settings navigation must not wait for network')
  });
  home.openSettings(); home.openAISettings();
  assert.equal(paths.length, 2);
  const Panel = componentMethods(read('components/设置面板.ets'), ['openSection'], { syncActivity: activity, $r: x => x });
  let notices = 0;
  const panel = Object.assign(new Panel(), { activeSection: '', 内容滚动器: { scrollToIndex() {} },
    取本地化文本: x => x, getUIContext: () => ({ getPromptAction: () => ({ showToast: () => { notices++; } }) }) });
  for (const section of ['scheduler', 'data', 'advanced']) { panel.openSection(section); assert.equal(panel.activeSection, ''); }
  panel.openSection('sync'); assert.equal(panel.activeSection, 'sync');
  panel.openSection('appearance'); assert.equal(panel.activeSection, 'appearance');
  assert.equal(notices, 3);
  panel.简洁模式 = true; panel.openSection('scheduler'); assert.equal(panel.activeSection, 'scheduler');
  assert.equal(notices, 3, 'local review controls remain available in simple mode during sync');
  panel.简洁模式 = false;
  activity.cancelReservation(); panel.openSection('scheduler'); assert.equal(panel.activeSection, 'scheduler');
});
