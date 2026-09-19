import { AutoSyncScheduler } from '../../entry/src/main/ets/model/AutoSyncScheduler.ts';
// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { SyncActivity } from '../../entry/src/main/ets/model/SyncSettings.ts';
import * as flow from '../../entry/src/main/ets/model/同步流程.ts';

const read = path => readFileSync(new URL('../../entry/src/main/ets/' + path, import.meta.url), 'utf8');

test('automatic execution is wired to startup/foreground/home return and manual panels retain navigation guards', () => {
  const home = read('pages/首页.ets'), settings = read('pages/设置页.ets');
  assert.match(home, /aboutToAppear\(\): void \{[\s\S]*?this\.requestAutoSync\(\)/);
  assert.match(home, /@StorageProp\(APP_FOREGROUND_KEY\) @Watch\('syncForegroundChanged'\)/);
  assert.match(home, /private 返回主页后刷新\(\)[\s\S]*?this\.requestAutoSync\(\)/);
  assert.match(home, /同步面板\(\{[\s\S]*?automatic: true/);
  assert.match(settings, /\.onBackPressed\(\(\): boolean => this\.显示同步面板\)/);
  assert.match(settings, /private 返回\(\): void \{\s*if \(this\.显示同步面板\) return;/);
});

// 执行真实组件方法，用可控时钟/后端代替 HarmonyOS；不复制同步实现。
function componentMethods(source, names, dependencies) {
  const methods = names.map(name => {
    const start = source.search(new RegExp(`  (?:private )?(?:async )?${name}\\(`));
    assert.ok(start >= 0, name);
    const end = source.indexOf('\n  }', start);
    return source.slice(start, end + 4);
  });
  const js = stripTypeScriptTypes(`class Component { ${methods.join('\n')} }`, { mode: 'transform' });
  return new Function(...Object.keys(dependencies), js + '\nreturn Component;')(...Object.values(dependencies));
}

function homeHarness() {
  const state = { enabled: true, ready: true, auth: { hkey: 'test-key', endpoint: 'http://lan:8080/', username: 'u' }, timers: new Map(), seq: 0, navigation: [], toasts: 0 };
  const gate = new SyncActivity();
  const Page = componentMethods(read('pages/首页.ets'), ['requestAutoSync', 'scheduleAutoSyncCheck', 'isAutoSyncLocationSafe', 'stopAutoSyncTimer', 'tryAutoSync', 'syncForegroundChanged', 'onPageHide', 'onBackPress', 'deferForSync', 'flushSyncAction', 'autoSyncCollectionFinished', 'autoSyncStateChanged', '选择牌组', '开始学习', 'openCreateDeck', 'openSettings', 'openReminders'], {
    AppStorage: { get() {}, setOrCreate() {} },
    loadAutoSyncEnabled: () => state.enabled, 加载同步凭证: () => state.auth,
    $r: key => key, 牌组显示名: deck => deck.name, 保存上次牌组ID: async () => {},
    后端会话: { 获取实例: () => ({ 是否就绪: () => state.ready }) }, syncActivity: gate,
    setTimeout: fn => { const id = ++state.seq; state.timers.set(id, fn); return id; },
    clearTimeout: id => state.timers.delete(id)
  });
  const page = new Page();
  Object.assign(page, { syncForeground: true, autoSyncStartupReady: true, syncScheduler: new AutoSyncScheduler(), autoSyncTimer: -1,
    页面栈: { size: () => 0, pushPath: path => state.navigation.push(path) }, 加载状态: 'ready', 显示同步面板: false,
    autoSyncCollectionBusy: false, autoSyncRefreshing: false, autoSyncModal: false, pendingSyncAction: null,
    显示提示: () => { state.toasts++; }, 已选中牌组: () => true, 选中牌组: () => ({ id: 'deck', name: 'deck' }), 展开牌组路径() {}, 当前断点: 'xs',
    加载主页数据: async () => {}, 同步后检查FSRS: async () => {}, 暂停主页官方公告检查() {} });
  page.syncScheduler.setListener(() => page.scheduleAutoSyncCheck());
  const tick = () => { const callbacks = [...state.timers.values()]; state.timers.clear(); callbacks.forEach(fn => fn()); };
  return { page, state, tick, gate };
}

test('startup waits for collection and prompts, then opens one auto sync with latest persisted endpoint', () => {
  const { page, state, tick } = homeHarness();
  state.ready = false;
  page.requestAutoSync(); page.requestAutoSync();
  assert.equal(state.timers.size, 1);
  tick();
  assert.equal(page.显示同步面板, false);
  state.ready = true; page.显示欢迎弹窗 = true;
  tick(); assert.equal(page.显示同步面板, false);
  page.显示欢迎弹窗 = false;
  state.auth.endpoint = 'https://redirect.example/anki/';
  tick();
  assert.equal(page.显示同步面板, true);
  assert.equal(page.同步面板认证.endpoint, state.auth.endpoint);
  assert.equal(state.timers.size, 0);
  page.requestAutoSync();
  assert.equal(state.timers.size, 0);
  assert.equal(page.onBackPress(), false, 'background status must not consume the system back button');
});

test('auto sync does not poll during study/background and resumes on the next foreground/home request', () => {
  const { page, state, tick } = homeHarness();
  page.页面栈 = { size: () => 1 };
  page.requestAutoSync(); tick();
  assert.equal(page.显示同步面板, false);
  assert.equal(state.timers.size, 0);
  page.页面栈 = { size: () => 0 };
  page.requestAutoSync(); page.syncForeground = false; page.syncForegroundChanged();
  assert.equal(state.timers.size, 0);
  page.syncForeground = true; page.syncForegroundChanged(); tick();
  assert.equal(page.显示同步面板, true);
});

test('editing, import, sorting, startup prompts and manual sync defer automatic work', () => {
  for (const field of ['显示创建牌组', '显示牌组选项', '显示自定义学习', '显示过滤牌组面板',
    '显示数据迁移', '数据迁移中', '显示牌组定制', '官方公告检查中', '显示官方公告', '显示云端牌组弹窗',
    '显示欢迎弹窗', '显示主页操作', '显示更多菜单', '排序模式中', '刷新中', '云端牌组忙碌', 'fsrsPromptActive']) {
    const { page, tick } = homeHarness();
    page[field] = true; page.requestAutoSync(); tick();
    assert.equal(page.显示同步面板, false, field);
    page[field] = false; tick();
    assert.equal(page.显示同步面板, true, field);
  }
  const { page, gate, tick } = homeHarness(), manual = {};
  gate.acquire(manual); page.requestAutoSync(); tick();
  assert.equal(page.显示同步面板, false);
  gate.release(manual, Date.now()); tick();
  assert.equal(page.显示同步面板, false, 'manual sync release starts a cooldown');
});

test('disabled sync and logged-out state stop queued work without a network request', () => {
  for (const loggedOut of [false, true]) {
    const { page, state, tick } = homeHarness();
    if (loggedOut) state.auth = null; else state.enabled = false;
    page.requestAutoSync(); tick();
    assert.equal(page.显示同步面板, false);
    assert.equal(state.timers.size, 0);
  }
});

test('deletion keeps a queued sync pending until its refresh and preference cleanup finish', () => {
  const { page, tick } = homeHarness();
  page.deckDeletionBusy = true;
  page.requestAutoSync();
  tick();
  assert.equal(page.显示同步面板, false);
  assert.equal(page.syncScheduler.hasPending(), true);
  page.deckDeletionBusy = false;
  tick();
  assert.equal(page.显示同步面板, true);
  assert.equal(page.syncScheduler.hasPending(), false);
});

test('successful learning requests coalesce without polling and start on the visible completion screen', () => {
  const { page, state, tick } = homeHarness(), study = {};
  page.页面栈 = { size: () => 1, getAllPathName: () => ['StudyPage'] };
  page.syncScheduler.setStudyActive(study, true);
  for (let card = 0; card < 10; card++) page.syncScheduler.request();
  assert.equal(state.timers.size, 0);
  assert.equal(page.syncScheduler.hasPending(), true);
  page.syncScheduler.setStudyActive(study, false);
  assert.equal(state.timers.size, 1);
  tick();
  assert.equal(page.显示同步面板, true);
  assert.equal(page.syncScheduler.hasPending(), false);
  assert.equal(state.timers.size, 0);
});

test('resuming study before the scheduled sync cancels execution and retains unsynced intent', () => {
  const { page, state, tick } = homeHarness(), study = {};
  page.页面栈 = { size: () => 1, getAllPathName: () => ['StudyPage'] };
  page.syncScheduler.setStudyActive(study, false); page.syncScheduler.request();
  assert.equal(state.timers.size, 1);
  page.syncScheduler.setStudyActive(study, true); tick();
  assert.equal(page.显示同步面板, false);
  assert.equal(state.timers.size, 0);
  assert.equal(page.syncScheduler.hasPending(), true);
  page.页面栈 = { size: () => 0 };
  page.syncScheduler.removeStudy(study); tick();
  assert.equal(page.显示同步面板, true);
});

test('a completed but hidden study screen cannot sync through another editor or while backgrounded', () => {
  for (const names of [['SettingsPage'], ['StudyPage', 'SettingsPage']]) {
    const { page, state, tick } = homeHarness(), study = {};
    page.页面栈 = { size: () => names.length, getAllPathName: () => names };
    page.syncScheduler.setStudyActive(study, false); page.syncScheduler.request();
    assert.equal(state.timers.size, 0);
    assert.equal(page.显示同步面板, false);
    page.syncForeground = false; page.syncForegroundChanged();
    page.页面栈 = { size: () => 1, getAllPathName: () => ['StudyPage'] };
    page.syncScheduler.setStudyActive(study, false);
    assert.equal(state.timers.size, 0);
    page.syncForeground = true; page.syncForegroundChanged(); tick();
    assert.equal(page.显示同步面板, true);
  }
});

async function settle() { for (let i = 0; i < 8; i++) await new Promise(resolve => setImmediate(resolve)); }

function panelHarness({ required = 1, media = false, automatic = true, fsrsBefore = true, fsrsAfter = true } = {}) {
  const state = { closed: 0, refreshed: 0, media, pending: false, cleared: false, endpoint: '', calls: [], timers: new Map(),
    fsrsValues: [fsrsBefore, fsrsAfter], fsrsReads: 0, fsrsNotifications: 0, fsrsResults: [], states: [], delays: [], cancellations: [],
    response: { required, newEndpoint: '', hostNumber: 0, serverMediaUsn: 3, serverMessage: '' } };
  class BackendError extends Error {}
  const gate = new SyncActivity();
  const Panel = componentMethods(read('components/同步面板.ets'), ['aboutToAppear', 'aboutToDisappear', '启动同步',
    'notifySyncResult', 'notifyCollectionResult', 'captureFsrsAfterSync', '处理同步错误', '完成中止', '冲突确认', '启动媒体阶段', '开始媒体轮询', '清理轮询定时器', '是否允许关闭', 'publishSyncState', 'setSyncPhase', 'dismissPresentation', 'syncForegroundChanged', 'requestBackgroundTime', 'releaseSuspendDelay'], {
    ...flow, syncActivity: gate, 后端错误: BackendError,
    加载FSRS开启状态: async () => state.fsrsValues[state.fsrsReads++],
    notifyFsrsStateChanged: () => { state.fsrsNotifications++; },
    加载媒体同步开关: () => state.media, 加载媒体待同步: () => state.pending,
    设置媒体待同步: value => { state.pending = value; }, 保存同步端点: value => { state.endpoint = value; },
    清除同步凭证: () => { state.cleared = true; },
    backgroundTaskManager: { requestSuspendDelay: (_reason, expire) => { state.delays.push(expire); return { requestId: state.delays.length }; }, cancelSuspendDelay: id => { state.cancellations.push(id); } },
    hilog: { info() {}, error() {}, warn() {} }, 同步日志域: 0, 同步日志标签: 'test', $r: key => key,
    setInterval: fn => { state.timers.set(1, fn); return 1; }, clearInterval: id => state.timers.delete(id)
  });
  const panel = new Panel();
  const auth = { hkey: 'test-key', endpoint: 'https://custom.example/anki/', ioTimeoutSecs: 0 };
  Object.assign(panel, { syncOwner: {}, automatic, 初始鉴权: auth, 当前阶段: 'syncing', 错误文案: '', 是否请求中止: false,
    轮询定时器: -1, 集合已同步: false, 是否在媒体阶段: false, detailsVisible: false, suspendDelayId: -1, syncForeground: true,
    状态变化回调: (busy, modal) => { state.states.push({ busy, modal }); },
    取本地化文案: key => key, 关闭回调: () => { state.closed++; },
    同步完成回调: value => { state.refreshed++; state.fsrsResults.push(value); },
    同步服务实例: {
      中止媒体同步: async () => {},
      同步状态检查: async a => { state.calls.push(['status', a]); return { required: required === 0 ? 0 : 1, newEndpoint: '' }; },
      同步集合: async (a, m) => { state.calls.push(['collection', a, m]); return state.response; },
      全量上传或下载: async (a, upload, usn) => { state.calls.push(['full', a, upload, usn]); },
      同步媒体: async a => { state.calls.push(['media', a]); },
      媒体同步状态: async () => ({ active: false, progress: { checked: '', added: '', removed: '' } })
    }
  });
  return { panel, state, gate };
}

test('automatic incremental sync uses custom endpoint, refreshes and closes; manual success stays visible', async () => {
  for (const automatic of [false, true]) {
    const { panel, state, gate } = panelHarness({ automatic });
    panel.aboutToAppear(); await settle();
    assert.equal(state.calls[0][0], 'collection', 'syncStatus cache must not prevent a fresh server check');
    assert.equal(state.calls[0][1].endpoint, 'https://custom.example/anki/');
    assert.equal(state.closed, automatic ? 1 : 0);
    assert.equal(state.refreshed, 1);
    assert.equal(gate.canAutoSync(Date.now()), false);
    panel.aboutToDisappear();
    assert.equal(gate.canAutoSync(Date.now() + 31000), true);
  }
});

test('FSRS warning describes only a confirmed on-to-off transition for normal and full sync', async () => {
  for (const required of [0, 1, 2, 3, 4]) {
    for (const before of [true, false, null]) {
      for (const after of [true, false, null]) {
        const { panel, state } = panelHarness({ required, fsrsBefore: before, fsrsAfter: after });
        panel.aboutToAppear(); await settle();
        if (required >= 2) {
          assert.equal(state.fsrsReads, 1, 'conflict has not applied cloud data yet');
          assert.deepEqual(state.fsrsResults, []);
          panel.冲突确认(required === 4); await settle();
        }
        assert.equal(state.fsrsReads, 2);
        assert.equal(state.fsrsNotifications, 1);
        assert.deepEqual(state.fsrsResults, [before === true && after === false]);
        panel.notifyCollectionResult();
        assert.equal(state.refreshed, 1, 'collection completion is delivered once');
      }
    }
  }
});

test('FSRS transition survives media failure or abort, but a collection failure never reports it', async () => {
  for (const outcome of ['media-failure', 'abort', 'collection-failure']) {
    const { panel, state } = panelHarness({ media: true, fsrsAfter: false });
    if (outcome === 'collection-failure') panel.同步服务实例.同步集合 = async () => { throw new Error('network'); };
    if (outcome === 'media-failure') panel.同步服务实例.同步媒体 = async () => { throw new Error('network'); };
    panel.aboutToAppear(); await settle();
    if (outcome === 'abort') panel.完成中止();
    assert.deepEqual(state.fsrsResults, outcome === 'collection-failure' ? [] : [true]);
    assert.equal(state.fsrsNotifications, outcome === 'collection-failure' ? 0 : 1);
  }
});

test('removing a panel while FSRS reads are pending cannot start sync or deliver a late result', async () => {
  const { panel, state } = panelHarness();
  panel.aboutToAppear(); panel.aboutToDisappear(); await settle();
  assert.equal(state.calls.length, 0);
  assert.deepEqual(state.fsrsResults, []);
});

test('media-only sync runs even with unchanged collection and closes only after media completes', async () => {
  const { panel, state } = panelHarness({ required: 0, media: true });
  panel.aboutToAppear(); await settle();
  assert.equal(state.calls.some(call => call[0] === 'collection'), true);
  assert.equal(state.calls.some(call => call[0] === 'media'), true);
  assert.equal(state.closed, 0);
  state.timers.get(1)(); await settle();
  assert.equal(state.closed, 1);
  assert.equal(state.pending, false);
});

test('full-sync conflicts never pick a direction automatically, allow postponing, and preserve explicit direction', async () => {
  for (const required of [2, 3, 4]) {
    const { panel, state } = panelHarness({ required });
    panel.aboutToAppear(); await settle();
    assert.equal(panel.当前阶段, 'conflict');
    assert.equal(state.closed, 0);
    assert.equal(state.calls.some(call => call[0] === 'full'), false);
    assert.equal(panel.是否允许关闭(), true);
    panel.冲突确认(required !== 3); await settle();
    const full = state.calls.find(call => call[0] === 'full');
    assert.equal(full[2], required !== 3);
    assert.equal(full[3], null, 'media disabled skips media USN for full sync');
    assert.equal(state.closed, 1);
  }
});

test('network/auth/media failures remain visible and cannot be mistaken for automatic success', async () => {
  for (const kind of ['network', 'auth', 'media']) {
    const { panel, state } = panelHarness({ media: kind === 'media' });
    if (kind !== 'media') panel.同步服务实例.同步集合 = async () => { throw new Error(kind === 'auth' ? '401 unauthorized' : 'network timeout'); };
    else panel.同步服务实例.同步媒体 = async () => { throw new Error('network timeout'); };
    panel.aboutToAppear(); await settle();
    assert.equal(panel.当前阶段, 'done');
    assert.notEqual(panel.错误文案, '');
    assert.equal(state.closed, 0);
    assert.equal(state.cleared, kind === 'auth');
    assert.equal(state.pending, kind === 'media');
    assert.equal(state.refreshed, kind === 'media' ? 1 : 0);
  }
});

test('server redirects are passed through to media as well as collection sync', async () => {
  const { panel, state } = panelHarness({ media: true });
  state.response.newEndpoint = 'https://redirect.example/prefix/';
  panel.aboutToAppear(); await settle();
  assert.equal(state.endpoint, state.response.newEndpoint);
  assert.equal(state.calls.find(call => call[0] === 'media')[1].endpoint, state.response.newEndpoint);
});

test('slow media polls do not overlap or deliver stale completion after the panel is removed', async () => {
  const { panel, state } = panelHarness({ media: true });
  let finish, polls = 0;
  panel.同步服务实例.媒体同步状态 = () => { polls++; return new Promise(resolve => { finish = resolve; }); };
  panel.aboutToAppear(); await settle();
  const tick = state.timers.get(1);
  tick(); tick();
  assert.equal(polls, 1);
  panel.aboutToDisappear();
  finish({ active: false, progress: { checked: '', added: '', removed: '' } });
  await settle();
  assert.equal(state.closed, 0);
  assert.equal(state.refreshed, 1, 'collection was delivered before media; late media result cannot deliver it again');
  assert.equal(state.pending, true);
});

test('login uses the saved custom endpoint, blocks unsaved input, and never persists a password', async () => {
  const calls = [], persisted = [];
  class BackendError extends Error {}
  const Group = componentMethods(read('components/settings/同步分组.ets'), ['点击登录', 'syncSettingsBusy'], {
    syncActivity: new SyncActivity(),
    保存同步凭证: auth => persisted.push(auth), 后端错误: BackendError, 分类同步错误: flow.分类同步错误, $r: value => value
  });
  const group = new Group();
  Object.assign(group, { 登录中: false, settingsSaving: false, serverInput: 'https://new.example/',
    savedServer: 'https://saved.example/', 用户名输入: 'user', 密码输入: 'transient-password',
    取本地化文本: key => key,
    同步服务实例: { 同步登录: async (...args) => { calls.push(args); return { hkey: 'test-key', endpoint: args[2], ioTimeoutSecs: 0 }; } }
  });
  await group.点击登录();
  assert.equal(calls.length, 0);
  group.serverInput = group.savedServer;
  await group.点击登录();
  assert.deepEqual(calls, [['user', 'transient-password', 'https://saved.example/']]);
  assert.deepEqual(persisted, [{ hkey: 'test-key', username: 'user', endpoint: 'https://saved.example/' }]);
  assert.equal(group.密码输入, '');
  assert.equal(group.当前状态, '已登录');
});

test('login/server save cannot be overlapped and invalid URL produces a localized error before saving', async () => {
  const calls = [];
  const Group = componentMethods(read('components/settings/同步分组.ets'), ['saveServer', 'syncSettingsBusy'], {
    syncActivity: new SyncActivity(),
    normalizeSyncServer: input => { if (input === 'invalid') throw new Error('invalid'); return input; },
    saveCustomSyncServer: async input => { calls.push(input); return input; }, $r: key => key
  });
  const group = new Group();
  let closes = 0;
  Object.assign(group, { 登录中: true, settingsSaving: false, 当前状态: '未登录', serverInput: 'https://new.example/',
    savedServer: '', 取本地化文本: key => key,
    serverDialogController: { open: () => {}, close: () => { closes++; } } });
  await group.saveServer(); assert.equal(calls.length, 0);
  group.登录中 = false; group.serverInput = 'invalid';
  await group.saveServer(); assert.equal(calls.length, 0);
  assert.equal(group.serverError, 'app.string.sync_server_invalid');
  group.serverInput = 'https://new.example/';
  await group.saveServer();
  assert.equal(group.savedServer, 'https://new.example/');
  assert.equal(closes, 1);
});

test('the server entry lives inside the sync card and the editor is a centered custom dialog', () => {
  const source = read('components/settings/同步分组.ets');
  assert.equal(/\.bindSheet\(/.test(source), false, 'bindSheet cannot center on phone-width windows');
  assert.ok(source.includes('@CustomDialog'), 'server editor must be a @CustomDialog');
  assert.ok(source.includes('struct 自定义服务器弹窗'), 'server dialog struct must exist');
  assert.ok(source.includes('alignment: DialogAlignment.Center'), 'server dialog must be centered');
  const entryLine = source.split(/\r?\n/).find(line => line.includes('sync_custom_server_entry'));
  assert.ok(entryLine !== undefined && entryLine.startsWith(' '.repeat(14)),
    'entry must be nested in the sync card content');
});

test('centered server dialog opens on the persisted value, cancels drafts, and blocks dismissal during save', () => {
  const Group = componentMethods(read('components/settings/同步分组.ets'), ['openServerDialog', 'closeServerDialog'], {});
  const group = new Group();
  let opened = 0, closed = 0;
  Object.assign(group, { 登录中: false, settingsSaving: false, savedServer: 'https://saved.example/',
    serverInput: 'https://draft.example/', serverError: 'old error',
    serverDialogController: { open: () => { opened++; }, close: () => { closed++; } } });
  group.openServerDialog();
  assert.equal(opened, 1);
  assert.equal(group.serverInput, group.savedServer);
  assert.equal(group.serverError, '');
  group.serverInput = 'https://draft.example/'; group.serverError = 'invalid'; group.settingsSaving = true;
  group.closeServerDialog(); assert.equal(closed, 0);
  group.settingsSaving = false; group.closeServerDialog();
  assert.equal(closed, 1);
  assert.equal(group.serverInput, group.savedServer);
  assert.equal(group.serverError, '');
});


test('automatic sync protects only collection work, delivers it before media, and hiding details retains the task', async () => {
  const { panel, state, gate } = panelHarness({ media: true });
  let finishCollection;
  panel.同步服务实例.同步集合 = () => new Promise(resolve => { finishCollection = resolve; });
  panel.aboutToAppear(); await settle();
  assert.deepEqual(state.states.at(-1), { busy: true, modal: false });
  assert.equal(state.refreshed, 0);
  finishCollection(state.response); await settle();
  assert.deepEqual(state.states.at(-1), { busy: false, modal: false });
  assert.equal(state.refreshed, 1);
  assert.equal(gate.isActive(), true, 'media retains the account lease');
  panel.detailsVisible = true; panel.publishSyncState();
  assert.equal(state.states.at(-1).modal, true);
  panel.dismissPresentation();
  assert.equal(state.states.at(-1).modal, false);
  assert.equal(state.closed, 0);
  assert.equal(state.timers.size, 1, 'hiding details must not destroy media polling');
  state.timers.get(1)(); await settle();
  assert.equal(state.refreshed, 1);
  assert.equal(gate.isActive(), false);
  assert.equal(state.closed, 1);
});

test('collection completion waits for the home snapshot before consuming the latest click once', async () => {
  const { page, state } = homeHarness();
  let finishRefresh;
  page.加载主页数据 = () => new Promise(resolve => { finishRefresh = resolve; });
  page.autoSyncStateChanged(true, false);
  page.开始学习(); page.openSettings(); page.开始学习();
  assert.equal(state.navigation.length, 0);
  assert.equal(state.toasts, 3);
  const refreshed = page.autoSyncCollectionFinished(false);
  page.autoSyncStateChanged(false, false);
  assert.equal(state.navigation.length, 0, 'collection unlock alone is insufficient');
  finishRefresh(); await refreshed;
  assert.deepEqual(state.navigation.map(path => path.name), ['StudyPage']);
  page.autoSyncStateChanged(false, false);
  assert.equal(state.navigation.length, 1);
  page.开始学习();
  assert.equal(state.navigation.length, 2, 'background media does not defer learning');
});

test('back/background cancels queued navigation; refreshed data is revalidated before learning', async () => {
  for (const cancel of ['back', 'background', 'deck-deleted', 'refresh-failed']) {
    const { page, state } = homeHarness();
    page.autoSyncStateChanged(true, false); page.开始学习();
    if (cancel === 'back') page.onBackPress();
    if (cancel === 'background') { page.syncForeground = false; page.syncForegroundChanged(); }
    if (cancel === 'deck-deleted') page.已选中牌组 = () => false;
    if (cancel === 'refresh-failed') page.加载主页数据 = async () => { page.加载状态 = 'error'; };
    await page.autoSyncCollectionFinished(false);
    page.autoSyncStateChanged(false, false);
    assert.equal(state.navigation.length, 0, cancel);
  }
});

test('full conflicts block queued actions until dismissed and never silently overwrite', async () => {
  const { page, state } = homeHarness();
  page.autoSyncStateChanged(true, false); page.开始学习();
  page.autoSyncStateChanged(false, true);
  assert.equal(state.navigation.length, 0);
  page.autoSyncStateChanged(false, false);
  assert.equal(state.navigation.length, 1);
  const { panel, state: sync } = panelHarness({ required: 2 });
  panel.aboutToAppear(); await settle();
  assert.deepEqual(sync.states.at(-1), { busy: false, modal: true });
  panel.dismissPresentation();
  assert.equal(sync.closed, 1);
  assert.equal(sync.calls.some(call => call[0] === 'full'), false);
});

test('short background allowance is requested synchronously by Ability and returned on finish, foreground or expiry', async () => {
  assert.match(read('entryability/EntryAbility.ets'), /onBackground\(\): void \{\s*syncActivity.continueInBackground\(\)/);
  for (const end of ['finished', 'foreground', 'expiry', 'destroyed']) {
    const { panel, state, gate } = panelHarness({ media: true });
    panel.aboutToAppear(); await settle();
    gate.continueInBackground(); gate.continueInBackground();
    assert.equal(state.delays.length, 1);
    if (end === 'finished') { state.timers.get(1)(); await settle(); }
    if (end === 'foreground') panel.syncForegroundChanged();
    if (end === 'expiry') state.delays[0]();
    if (end === 'destroyed') panel.aboutToDisappear();
    assert.deepEqual(state.cancellations, [1], end);
    panel.releaseSuspendDelay();
    assert.deepEqual(state.cancellations, [1], 'quota is returned exactly once');
  }
});

test('account changes and a second manual sync cannot race background media', async () => {
  const gate = new SyncActivity(), owner = {};
  const Group = componentMethods(read('components/settings/同步分组.ets'),
    ['syncSettingsBusy', '确认注销', '点击立即同步', 'saveServer', '点击登录'], {
      syncActivity: gate, $r: key => key,
      清除同步凭证: () => { throw new Error('must not clear while media is running'); }
    });
  const group = new Group(); group.取本地化文本 = key => key;
  gate.acquire(owner);
  group.确认注销(); group.点击立即同步(); await group.saveServer(); await group.点击登录();
  assert.equal(group.错误文本, 'app.string.sync_already_running');
  assert.equal(gate.isActive(), true);
  gate.release(owner, Date.now());
  assert.equal(group.syncSettingsBusy(), false);
});

test('a completed old status cannot release a newer sync lease', () => {
  const gate = new SyncActivity(), oldOwner = {}, newOwner = {};
  gate.acquire(oldOwner); gate.release(oldOwner, 1);
  gate.acquire(newOwner); gate.release(oldOwner, 2);
  assert.equal(gate.isActive(), true);
});

test('automatic sync stays invisible during transfer and preserves error/conflict recovery', () => {
  const home = read('pages/首页.ets'), panel = read('components/同步面板.ets');
  assert.ok(home.indexOf('同步面板({') > home.indexOf('.navDestination(this.页面映射)'));
  assert.match(panel, /HitTestMode.Transparent : HitTestMode.Default/);
  assert.doesNotMatch(panel, /statusVisible|sync_background_collection|sync_background_media/);
  assert.match(panel, /else if \(this\.错误文案 !== ''\) \{\s*this\.syncErrorStatus\(\)/);
  assert.match(panel, /if \(!this.automatic \|\| this.detailsVisible \|\| this.当前阶段 === 'conflict'\)/);
});


test('selecting another deck remains available during collection sync and cancels the previous study intent', () => {
  const { page, state } = homeHarness();
  page.autoSyncStateChanged(true, false); page.开始学习();
  page.选择牌组('another-deck');
  assert.equal(page.选中的牌组ID, 'another-deck');
  assert.equal(page.显示牌组详情, true);
  assert.equal(page.pendingSyncAction, null);
  page.autoSyncStateChanged(false, false);
  assert.equal(state.navigation.length, 0, 'selecting a deck does not automatically study it');
});
