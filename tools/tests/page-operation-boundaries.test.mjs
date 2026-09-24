import { NoteEditorSession, initialNoteEditorState } from '../../entry/src/main/ets/model/NoteEditorSession.ts';
import { initialTransferState } from '../../entry/src/main/ets/model/home/DataTransferSession.ts';
import { compileWithUiFeedback } from './ui-feedback-harness.mjs';
import { loadBrowserRows } from '../../entry/src/main/ets/model/BrowserSearchSession.ts';
import { loadNoteEditor } from '../../entry/src/main/ets/model/NoteEditorLoader.ts';
// SPDX-License-Identifier: AGPL-3.0-or-later
import { resolveBrowserCardIds, resolveBrowserNoteIds, snapshotNotetypeChange } from '../../entry/src/main/ets/model/BrowserSelection.ts';
import { HomeWorkCoordinator } from '../../entry/src/main/ets/model/HomeWorkCoordinator.ts';
import { HomeStartupSequence } from '../../entry/src/main/ets/model/HomeStartupSequence.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { HomeAnnouncementController } from '../../entry/src/main/ets/model/HomeAnnouncementController.ts';
import { canPresentHomePrompt, canStartHomeAutoSync } from '../../entry/src/main/ets/model/HomeActivityPolicy.ts';
import { BrowserOperationController } from '../../entry/src/main/ets/model/BrowserOperationController.ts';
import { AutoSyncScheduler } from '../../entry/src/main/ets/model/AutoSyncScheduler.ts';
import { CloudDeckImportController } from '../../entry/src/main/ets/model/CloudDeckImportController.ts';
import { ExternalDeckOpenQueue } from '../../entry/src/main/ets/model/ExternalDeckOpen.ts';
import { HomeSyncController } from '../../entry/src/main/ets/model/HomeSyncController.ts';
import { SyncActivity } from '../../entry/src/main/ets/model/SyncSettings.ts';

const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const settle = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
function pageMethods(file, names, dependencies = {}) {
  const source = readFileSync(new URL('../../entry/src/main/ets/pages/' + file + '.ets', import.meta.url), 'utf8');
  const methods = names.map(name => {
    const start = source.search(new RegExp(`^  (?:private )?(?:async )?${name}\\(`, 'm'));
    assert.ok(start >= 0, name);
    return source.slice(start, source.indexOf('\n  }', start) + 4);
  });
  Object.assign(dependencies, { loadNoteEditor, loadBrowserRows, resolveBrowserCardIds, resolveBrowserNoteIds, snapshotNotetypeChange });
  return compileWithUiFeedback(...Object.keys(dependencies), stripTypeScriptTypes(`class Page { ${methods.join('\n')} }`,
    { mode: 'transform' }) + '; return Page;')(...Object.values(dependencies));
}

function homeHarness() {
  const response = deferred(), timers = new Map(); let next = 0;
  const events = [];
  const Page = pageMethods('首页', ['homeActivity', 'canPresentStartupPrompt', 'homeActivityChanged', 'startupHost',
    '尝试显示官方公告', '尝试展示待展示官方公告', '请求主页官方公告检查', '暂停主页官方公告检查',
    '继续首次弹窗序列', '显示欢迎弹窗一次', 'closeHomeIntro', 'onBackPress', 'autoSyncCollectionFinished', 'presentPendingSyncWarning'], {
    canPresentHomePrompt, bundleManager: { BundleFlag: {}, getBundleInfoForSelf: async () => ({ versionName: 'test' }) },
    后端会话: { 获取实例: () => ({ 是否就绪: () => true }) }, 当前语言模式: () => 'zh',
    是否已确认官方公告: async () => false, 是否已完成云端牌组引导: async () => false,
    isHomeIntroCompleted: async () => false, completeHomeIntro: async () => events.push('welcome-persist'),
    官方公告检查延迟毫秒: () => 600000,
    externalDeckOpens: new ExternalDeckOpenQueue(),
    AppStorage: { get() {}, setOrCreate() {} },
    setTimeout: (fn, delay) => { const id = ++next; timers.set(id, { fn, delay }); return id; }, clearTimeout: id => timers.delete(id)
  });
  const page = new Page();
  page.transfer = initialTransferState();
  Object.assign(page, { announcementController: new HomeAnnouncementController(), homeDisposed: false,
    syncScheduler: new AutoSyncScheduler(),
    syncForeground: true, 页面栈: { size: () => 0 }, 主页允许公告检查: true, 加载状态: 'ready',
    startupSequence: new HomeStartupSequence(), homeWork: new HomeWorkCoordinator(new ExternalDeckOpenQueue(), { schedule: fn => { const id = ++next; timers.set(id, { fn, delay: 0 }); return id; }, cancel: id => timers.delete(id) }), 官方公告延迟检查任务: -1, 官方公告检查中: false, 主页公告检查已激活: true,
    官方公告服务实例: { 加载公告: () => response.promise }, 显示官方公告: false,
    scheduleAutoSyncCheck() { events.push('sync-check'); }, flushSyncAction() {},
    加载主页数据: async () => {}, 同步后检查FSRS: async () => {},
    打开云端牌组弹窗() { page.显示云端牌组弹窗 = true; events.push('cloud'); }
  });
  const syncActivity = new SyncActivity();
  page.syncController = new HomeSyncController(page.syncScheduler, syncActivity, () => ({
    activity: () => page.homeActivity(), syncCollectionBusy: () => page.autoSyncCollectionBusy === true,
    isDisposed: () => page.homeDisposed, isForeground: () => page.syncForeground && !page.homeDisposed,
    isPanelOpen: () => false, pageDepth: () => page.页面栈.size(), pathNames: () => [],
    loadState: () => page.加载状态, startupReady: () => true, externalImportPending: () => false,
    autoSyncEnabled: () => true, auth: () => null, username: () => '', setStatus: () => {}, notifyWait: () => {},
    popPage: () => {}, requestPanelDetails: () => {}, openPanel: () => {}, closePanel: () => {},
    setCollectionBusy: busy => { page.autoSyncCollectionBusy = busy; }, setPanelModal: modal => { page.autoSyncModal = modal; },
    refreshAfterCollection: async () => { await page.加载主页数据(); },
    presentFsrsWarning: async () => { await page.同步后检查FSRS(true); }, activityChanged: () => page.homeActivityChanged()
  }), { now: () => Date.now(), setTimeout: (fn, delay) => { const id = ++next; timers.set(id, { fn, delay }); return id; }, clearTimeout: id => timers.delete(id) });
  return { page, response, timers, events, tick: () => { for (const [id, timer] of [...timers]) if (timer.delay === 0) { timers.delete(id); timer.fn(); } } };
}

test('manual sync is considered before an unseen announcement can occupy the home dialog slot', async () => {
  const { page, response, events, tick } = homeHarness();
  page.显示创建牌组 = true;
  const check = page.尝试显示官方公告();
  response.resolve({ id: 'notice' }); await check;
  page.syncScheduler.requestManual();
  page.tryAutoSync = () => { events.push('manual-sync'); page.autoSyncCollectionBusy = true; };
  page.显示创建牌组 = false;
  page.homeActivityChanged(); tick();
  assert.equal(events.includes('manual-sync'), true);
  assert.equal(page.显示官方公告, false);
  assert.equal(page.announcementController.hasPending(), true);
});

for (const blocker of ['显示创建牌组', '显示牌组选项', '创建牌组中',
  'autoSyncCollectionBusy', 'autoSyncModal', 'nativeDialogOpen', '显示卡片预览', '预览加载中', '显示更多菜单']) {
  test(`late announcement waits for ${blocker}, then is shown once after release`, async () => {
    const { page, response, tick } = homeHarness();
    const check = page.尝试显示官方公告();
    page[blocker] = true;
    response.resolve({ id: 'notice' }); await check; tick();
    assert.equal(page.显示官方公告, false);
    assert.equal(page.announcementController.hasPending(), true);
    page[blocker] = false; page.homeActivityChanged(); tick();
    assert.equal(page.官方公告数据.id, 'notice');
    assert.equal(page.announcementController.hasPending(), false);
  });
}

for (const phase of ['dialog', 'picking', 'running', 'refreshing']) {
  test(`announcement waits for transfer ${phase} and resumes after release`, async () => {
    const { page, response, tick } = homeHarness();
    const check = page.尝试显示官方公告();
    page.transfer = { ...page.transfer, visible: phase === 'dialog', phase: phase === 'dialog' ? 'idle' : phase };
    response.resolve({ id: 'transfer-finished' }); await check; tick();
    assert.equal(page.显示官方公告, false);
    assert.equal(page.announcementController.hasPending(), true);
    page.transfer = initialTransferState(); page.homeActivityChanged(); tick();
    assert.equal(page.官方公告数据.id, 'transfer-finished');
    assert.equal(page.announcementController.hasPending(), false);
  });
}

test('announcement waits through navigation/background and disposal rejects late response', async () => {
  for (const kind of ['navigation', 'background', 'dispose']) {
    const { page, response, tick } = homeHarness();
    const check = page.尝试显示官方公告();
    if (kind === 'navigation') page.页面栈 = { size: () => 1 };
    else if (kind === 'background') page.syncForeground = false;
    else { page.homeDisposed = true; page.announcementController.dispose(); }
    response.resolve({ id: kind }); await check; tick();
    assert.equal(page.显示官方公告, false);
  }
});

test('sync refresh release explicitly wakes deferred announcement after asynchronous follow-up', async () => {
  const { page, response, tick } = homeHarness(), followUp = deferred();
  page.autoSyncCollectionBusy = true;
  const check = page.尝试显示官方公告(); response.resolve({ id: 'after-sync' }); await check; tick();
  page.同步后检查FSRS = () => {
    page.fsrsPromptActive = true;
    return followUp.promise.finally(() => { page.fsrsPromptActive = false; });
  };
  const finish = page.autoSyncCollectionFinished(true); await settle();
  page.homeActivityChanged(); tick(); assert.equal(page.显示官方公告, false);
  followUp.resolve(); await finish; tick();
  assert.equal(page.官方公告数据.id, 'after-sync');
});

test('startup cloud sequence is deferred behind user form and cannot reopen twice', async () => {
  const { page, events, tick } = homeHarness();
  page.显示创建牌组 = true;
  await page.继续首次弹窗序列();
  assert.deepEqual(events, []);
  page.显示创建牌组 = false; page.homeActivityChanged(); tick(); await settle();
  assert.deepEqual(events.filter(e => e === 'cloud'), ['cloud']);
  page.homeActivityChanged(); tick(); await settle();
  assert.deepEqual(events.filter(e => e === 'cloud'), ['cloud']);
});

test('welcome marker is not consumed while another dialog prevents presentation', async () => {
  const { page, events, tick } = homeHarness();
  page.显示创建牌组 = true; await page.显示欢迎弹窗一次();
  assert.equal(page.startupSequence.hasPending(), true); assert.deepEqual(events, []);
  page.显示创建牌组 = false; page.homeActivityChanged(); tick(); await settle();
  assert.equal(page.显示欢迎弹窗, true);
  assert.deepEqual(events.filter(e => e === 'welcome-persist'), []);
  page.closeHomeIntro(); await settle();
  assert.equal(page.显示欢迎弹窗, false);
  assert.deepEqual(events.filter(e => e === 'welcome-persist'), ['welcome-persist']);
});

test('back cannot remove an active transaction form', () => {
  for (const busy of ['创建牌组中', '定制牌组中', 'deckOptionsBusy', 'deckDeletionBusy']) {
    const { page } = homeHarness(); page[busy] = true; page.显示创建牌组 = true;
    assert.equal(page.onBackPress(), true); assert.equal(page.显示创建牌组, true);
  }
});

test('announcement confirm suppresses in-flight duplicate and failed checks can retry', async () => {
  const controller = new HomeAnnouncementController(), response = deferred();
  const work = controller.check(() => response.promise, async () => false);
  assert.equal(await controller.check(async () => ({ id: 'other' }), async () => false), false);
  controller.confirm('notice'); response.resolve({ id: 'notice' });
  assert.equal(await work, false); assert.equal(controller.takePending(true), null);
  await assert.rejects(controller.check(async () => { throw new Error('offline'); }, async () => false));
  assert.equal(await controller.check(async () => ({ id: 'next' }), async () => false), true);
  assert.equal(controller.takePending(false), null); assert.equal(controller.takePending(true).id, 'next');
});

function browserHarness() {
  const scheduler = new AutoSyncScheduler(), broadcasts = [], calls = [];
  const Page = pageMethods('浏览页', ['runBrowserOperation', 'runBatchOperation', 'captureBrowserSelection',
    'isBrowserSelectionCurrent', '退出多选', '解析选中为卡片ID', '解析选中笔记的卡片ID', '解析选中为笔记ID',
    '执行批量改牌组', '执行批量删除', '执行批量设置标志', '执行批量挂起', '执行批量恢复',
    '执行批量设置到期日', '执行批量重新定位', '执行批量更改笔记类型', '保存编辑', '执行查找替换',
    '行点击',
    '打开卡片信息', '关闭卡片信息', '加载更多', '预加载行', '打开改牌组弹层', '切换模式'], {
    autoSyncScheduler: scheduler, AppStorage: { setOrCreate: (...args) => broadcasts.push(args) },
    $r: key => key, console: { info() {} }, BURY_SUSPEND_MODE_SUSPEND: 2
  });
  const page = new Page();
  page.transfer = initialTransferState();
  Object.assign(page, { operations: new BrowserOperationController(), 浏览模式值: 'cards',
    选中ID列表: [101, 102], selectionVersion: 0, searchVersion: 1, editorVersion: 0, mappingVersion: 0, infoVersion: 0,
    多选模式值: true, 退出多选信号: 0, 批量忙碌: false, 批量错误: '', mutationBusy: false,
    行列表: [], 结果ID列表: [101, 102], consumedRowCount: 0, suspendedRowIds: new Set(), 阶段: 'list',
    取本地化文案: key => key, 执行搜索: async () => { calls.push('search'); page.searchVersion++; }, sortableColumns: () => [],
    卡片服务实例: { 获取卡片: async id => ({ noteId: id + 1000 }), 设置牌组: async (ids, deck) => calls.push(['move', ids, deck]) },
    笔记服务实例: { 获取笔记的卡片: async id => [id + 100], 更新笔记: async () => {} },
    笔记类型服务实例: {}, getUIContext: () => ({ getPromptAction: () => ({ showToast() {} }) })
  });
  page.noteReader = { card: id => page.卡片服务实例.获取卡片(id), note: id => page.笔记服务实例.获取笔记(id),
    notetype: id => page.笔记类型服务实例.获取笔记类型(id) };
  page.editor = initialNoteEditorState();
  page.editorSession = new NoteEditorSession(page.noteReader, state => { page.editor = state; });
  return { page, scheduler, calls, broadcasts };
}

test('old batch preserves new mode/selection and rejects concurrent writes', async () => {
  const { page, scheduler, calls } = browserHarness(), write = deferred();
  page.卡片服务实例.设置牌组 = async (ids, deck) => { calls.push(['move', ids, deck]); await write.promise; };
  const pending = page.执行批量改牌组(9); await settle();
  assert.equal(scheduler.canSync(), false);
  page.切换模式('notes'); page.选中ID列表 = [77]; page.selectionVersion++; page.多选模式值 = true;
  await page.执行批量改牌组(10);
  assert.equal(calls.filter(c => Array.isArray(c)).length, 1);
  write.resolve(); await pending;
  assert.deepEqual(page.选中ID列表, [77]); assert.equal(page.多选模式值, true);
  assert.equal(page.mutationBusy, false); assert.equal(scheduler.canSync(), true); assert.equal(scheduler.hasPending(), true);
});

for (const action of ['执行批量删除', '执行批量设置标志', '执行批量挂起', '执行批量恢复',
  '执行批量设置到期日', '执行批量重新定位', '执行批量更改笔记类型']) {
  test(`${action} keeps its original inputs while selection changes`, async () => {
    const { page } = browserHarness(), gate = deferred(), writes = [];
    const write = async (...args) => { writes.push(structuredClone(args)); await gate.promise; };
    page.卡片服务实例.删除卡片 = write; page.卡片服务实例.设置标志 = write;
    page.调度器服务实例 = { 批量埋藏或暂停卡片: write, 批量埋藏或暂停笔记: write,
      恢复埋藏与暂停的卡片: write, 设置到期日: write, 排序卡片: write };
    page.笔记类型服务实例.变更笔记类型 = write;
    page.到期日输入 = '5'; page.重新定位起始 = 3; page.重新定位步长 = 2;
    page.重新定位随机 = false; page.重新定位顺移 = true;
    page.变更笔记类型信息数据 = { input: { oldNotetypeId: 1, newNotetypeId: 2 } };
    page.选中新笔记类型ID = 2; page.字段映射 = [0, 1]; page.模板映射 = [0];
    const argument = action === '执行批量设置到期日' ? '5' : action === '执行批量重新定位' ?
      {start:3,step:2,random:false,shift:true} : action === '执行批量更改笔记类型' ?
      { oldNotetypeId: 1, newNotetypeId: 2, newFields: [0,1], newTemplates: [0], noteIds: [] } : 3;
    const work = page[action](argument); await settle();
    assert.equal(writes.length, 1);
    if (action === '执行批量更改笔记类型') {
      assert.deepEqual(writes[0][0].noteIds, [1101, 1102]);
      assert.deepEqual(writes[0][0].newFields, [0, 1]);
    } else assert.deepEqual(writes[0][0], [101, 102]);
    page.选中ID列表 = [888]; page.selectionVersion++; page.字段映射 = [99];
    gate.resolve(); await work;
    assert.deepEqual(page.选中ID列表, [888]); assert.equal(page.mutationBusy, false);
  });
}

test('same IDs reselected in a new selection session are not cleared by old completion', async () => {
  const { page } = browserHarness(), write = deferred();
  page.卡片服务实例.设置牌组 = async () => write.promise;
  const work = page.执行批量改牌组(1); await settle();
  page.退出多选(); page.选中ID列表 = [101, 102]; page.selectionVersion++; page.多选模式值 = true;
  write.resolve(); await work;
  assert.equal(page.多选模式值, true); assert.deepEqual(page.选中ID列表, [101, 102]);
});

test('late batch error cannot overwrite errors of a new selection', async () => {
  const { page } = browserHarness(), write = deferred();
  page.卡片服务实例.设置牌组 = async () => write.promise;
  const work = page.执行批量改牌组(1); await settle();
  page.选中ID列表 = [22]; page.selectionVersion++; page.批量错误 = 'new context error';
  write.reject(new Error('old error')); await work;
  assert.equal(page.批量错误, 'new context error');
});

test('editor save owns immutable fields and retains sync occupancy until actual commit after leaving', async () => {
  const { page, scheduler, calls } = browserHarness(), write = deferred(), saved = [];
  page.笔记服务实例.获取笔记 = async () => ({ id: 1, guid: 'g', notetypeId: 1, mtimeSecs: 0, usn: 0, fields: [], tags: [] });
  page.笔记类型服务实例.获取笔记类型 = async () => ({ fieldNames: ['Front', 'Back'] });
  await page.editorSession.open(1, true, () => true);
  page.笔记服务实例.更新笔记 = async notes => { saved.push(notes); await write.promise; };
  const fields = ['hello'], tags = ['t'];
  const work = page.保存编辑(fields, tags); fields[0] = 'changed'; tags.push('changed');
  await settle(); page.operations.dispose();
  assert.equal(scheduler.canSync(), false); write.resolve(); assert.equal(await work, true);
  assert.deepEqual(saved[0][0].fields, ['hello', '']); assert.deepEqual(saved[0][0].tags, ['t']);
  assert.equal(calls.includes('search'), false); assert.equal(scheduler.canSync(), true);
});

test('old pagination finally does not unlock a newer load or append stale rows', async () => {
  const { page } = browserHarness(), rows = deferred();
  page.搜索服务实例 = { 浏览器行按ID: () => rows.promise };
  const work = page.加载更多(); page.searchVersion++; page.loadingMore = true; page.consumedRowCount = 7;
  rows.resolve({ cells: [], color: 0 }); await work;
  assert.equal(page.loadingMore, true); assert.equal(page.consumedRowCount, 7); assert.deepEqual(page.行列表, []);
});

test('batch failure keeps original selection and releases lease without requesting sync', async () => {
  const { page, scheduler } = browserHarness();
  page.卡片服务实例.设置牌组 = async () => { throw new Error('write failed'); };
  await page.执行批量改牌组(9);
  assert.deepEqual(page.选中ID列表, [101, 102]); assert.match(page.批量错误, /deck_error/);
  assert.equal(scheduler.canSync(), true); assert.equal(scheduler.hasPending(), false);
});

test('departed browser finishes accepted write, broadcasts after completion, and never refreshes old UI', async () => {
  const { page, scheduler, calls, broadcasts } = browserHarness(), write = deferred();
  page.卡片服务实例.设置牌组 = async () => write.promise;
  const work = page.执行批量改牌组(9); await settle(); page.operations.dispose(); page.searchVersion++;
  assert.equal(scheduler.canSync(), false); write.resolve(); await work;
  assert.equal(scheduler.canSync(), true); assert.equal(scheduler.hasPending(), true);
  assert.equal(broadcasts.length, 1); assert.equal(calls.includes('search'), false);
  assert.deepEqual(page.选中ID列表, [101, 102]);
});

test('note expansion stays on captured IDs even if selection changes during lookup', async () => {
  const { page, calls } = browserHarness(), lookup = deferred(); page.浏览模式值 = 'notes'; page.选中ID列表 = [1, 2];
  page.笔记服务实例.获取笔记的卡片 = async id => { if (id === 1) await lookup.promise; return [id + 10]; };
  const work = page.执行批量改牌组(9); await settle();
  page.选中ID列表 = [3]; page.selectionVersion++; lookup.resolve(); await work;
  assert.deepEqual(calls[0], ['move', [11, 12], 9]); assert.deepEqual(page.选中ID列表, [3]);
});

test('selected-only find replace aborts on unresolved card instead of mutating a partial set', async () => {
  const { page, scheduler } = browserHarness(); let writes = 0;
  page.卡片服务实例.获取卡片 = async id => { if (id === 102) throw new Error('missing'); return { noteId: 1 }; };
  page.搜索服务实例 = { 查找并替换: async () => writes++ };
  assert.equal(await page.执行查找替换('a', 'b', '', false, false, true), false);
  assert.equal(writes, 0); assert.equal(scheduler.canSync(), true);
});

test('find replace captures every filtered result before waiting, deduplicates notes and ignores later searches', async () => {
  const { page } = browserHarness(), gate = deferred(), writes = [];
  page.结果ID列表 = [101, 102, 103]; page.选中ID列表 = [101];
  page.行列表 = [{ id: 101 }]; // Only the first row has been loaded.
  page.卡片服务实例.获取卡片 = async id => {
    if (id === 101) await gate.promise;
    return { noteId: id < 103 ? 10 : 20 };
  };
  page.搜索服务实例 = { 查找并替换: async request => { writes.push(request); return 2; } };
  const work = page.执行查找替换('old', 'new', 'Front', false, true, false);
  await settle();
  page.结果ID列表[2] = 999; page.浏览模式值 = 'notes'; page.searchVersion++;
  gate.resolve();
  assert.equal(await work, true);
  assert.deepEqual(writes[0].nids, [10, 20]);
  assert.equal(writes[0].fieldName, 'Front');
});

test('find replace uses note result IDs directly and never treats an empty result as the whole collection', async () => {
  const { page } = browserHarness(), writes = [];
  page.浏览模式值 = 'notes'; page.结果ID列表 = [5, 6];
  page.卡片服务实例.获取卡片 = async () => { throw new Error('notes are not card IDs'); };
  page.搜索服务实例 = { 查找并替换: async request => { writes.push(request.nids); return 2; } };
  assert.equal(await page.执行查找替换('a', 'b', '', false, false, false), true);
  assert.deepEqual(writes, [[5, 6]]);
  page.结果ID列表 = [];
  assert.equal(await page.执行查找替换('a', 'b', '', false, false, false), false);
  page.结果ID列表 = [5]; page.阶段 = 'loading';
  assert.equal(await page.执行查找替换('a', 'b', '', false, false, false), false);
  assert.equal(writes.length, 1);
});

test('latest editor request wins and dismissal invalidates in-flight loading', async () => {
  const { page } = browserHarness(), first = deferred(); page.浏览模式值 = 'notes';
  page.笔记服务实例.获取笔记 = async id => id === 1 ? first.promise : { id, notetypeId: id, fields: ['second'], tags: [] };
  page.笔记类型服务实例.获取笔记类型 = async () => ({ fieldNames: ['Front'] });
  const old = page.行点击(1); await page.行点击(2);
  first.resolve({ id: 1, notetypeId: 1, fields: ['old'], tags: [] }); await old;
  assert.equal(page.editor.note.id, 2); assert.deepEqual(page.editor.note.fields, ['second']);
  const delayed = deferred(); page.笔记服务实例.获取笔记 = () => delayed.promise;
  const closed = page.行点击(3); page.editorSession.close();
  delayed.resolve({ id: 3, notetypeId: 3, fields: ['late'], tags: [] }); await closed;
  assert.equal(page.editor.note, null); assert.equal(page.editor.busy, false);
});

test('card info page keeps only its current target and delegates loading to the panel', async () => {
  const { page } = browserHarness();
  page.打开卡片信息(1); page.打开卡片信息(2);
  assert.equal(page.infoCardId, 2); assert.equal(page.显示卡片信息, true);
  page.关闭卡片信息(); assert.equal(page.infoCardId, 0); assert.equal(page.显示卡片信息, false);
});

test('failed rows advance pagination cursor without repeating successful rows', async () => {
  const { page } = browserHarness(); page.结果ID列表 = [1, 2, 3];
  page.搜索服务实例 = { 浏览器行按ID: async id => { if (id === 2) throw new Error('bad row'); return { cells: [id], color: 0 }; } };
  await page.加载更多(); await page.加载更多();
  assert.deepEqual(page.行列表.map(r => r.id), [1, 3]); assert.equal(page.consumedRowCount, 3);
});

test('cloud import is sequential, preserves earlier success, ignores late progress and retries only failures', async () => {
  const controller = new CloudDeckImportController(), pending = deferred(), calls = [], states = [];
  let late;
  const backend = { prepare: async () => {}, download: async (deck, progress) => {
    calls.push(['download', deck.id]); late = progress; if (deck.id === 'b') throw new Error('offline'); return deck.id;
  }, importDeck: async path => { calls.push(['import', path]); if (path === 'a') await pending.promise; } };
  const decks = ['a', 'b', 'c'].map(id => ({ id, name: id }));
  const work = controller.run(decks, [], backend, state => states.push(state)); await settle();
  assert.deepEqual(calls, [['download', 'a'], ['import', 'a']]);
  await assert.rejects(controller.run(decks, [], backend, () => {}), /already running/);
  pending.resolve(); const result = await work;
  assert.deepEqual(result.successIds, ['a', 'c']); assert.deepEqual(result.failedIds, ['b']);
  const count = states.length; late(100, 100); assert.equal(states.length, count);
  const retried = await controller.run(decks, result.successIds,
    { prepare: async () => {}, download: async deck => deck.id, importDeck: async path => calls.push(['retry', path]) }, () => {});
  assert.deepEqual(calls.filter(c => c[0] === 'retry'), [['retry', 'b']]); assert.deepEqual(retried.failedIds, []);
});

test('cloud preparation failure reports all unfinished tasks and leaves controller reusable', async () => {
  const controller = new CloudDeckImportController();
  const backend = { prepare: async () => { throw new Error('db'); }, download: async () => '', importDeck: async () => {} };
  const result = await controller.run([{ id: 'a' }, { id: 'b' }], ['a'], backend, () => {});
  assert.deepEqual(result.successIds, ['a']); assert.deepEqual(result.failedIds, ['b']);
});

test('unrelated mutation occupancy blocks sync without pretending to be completed study', () => {
  const scheduler = new AutoSyncScheduler(), owner = {};
  scheduler.beginOperation(owner); scheduler.request(); assert.equal(scheduler.canSync(), false);
  assert.equal(scheduler.isStudyComplete(), false); scheduler.endOperation(owner);
  assert.equal(scheduler.canSync(), true); assert.equal(scheduler.isStudyComplete(), false);
  const state = { foreground: true, atHome: true, collectionReady: true, collectionBusy: false,
    dialogOpen: false, interactionBusy: false, startupChecking: false };
  assert.equal(canStartHomeAutoSync(state), true);
  for (const key of ['collectionBusy', 'dialogOpen', 'interactionBusy', 'startupChecking'])
    assert.equal(canStartHomeAutoSync({ ...state, [key]: true }), false, key);
});
