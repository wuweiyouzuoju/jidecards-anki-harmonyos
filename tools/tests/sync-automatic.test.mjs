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
  assert.match(home, /aboutToAppear\(\): void \{\s*this\.requestAutoSync\(\)/);
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
  const state = { enabled: true, ready: true, auth: { hkey: 'test-key', endpoint: 'http://lan:8080/', username: 'u' }, timers: new Map(), seq: 0 };
  const gate = new SyncActivity();
  const Page = componentMethods(read('pages/首页.ets'), ['requestAutoSync', 'stopAutoSyncTimer', 'tryAutoSync', 'syncForegroundChanged', 'onPageHide', 'onBackPress'], {
    loadAutoSyncEnabled: () => state.enabled, 加载同步凭证: () => state.auth,
    后端会话: { 获取实例: () => ({ 是否就绪: () => state.ready }) }, syncActivity: gate,
    setTimeout: fn => { const id = ++state.seq; state.timers.set(id, fn); return id; },
    clearTimeout: id => state.timers.delete(id)
  });
  const page = new Page();
  Object.assign(page, { syncForeground: true, autoSyncStartupReady: true, autoSyncPending: false, autoSyncTimer: -1,
    页面栈: { size: () => 0 }, 加载状态: 'ready', 显示同步面板: false, 暂停主页官方公告检查() {} });
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
  assert.equal(page.onBackPress(), true);
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
    '显示欢迎弹窗', '显示主页操作', '显示更多菜单', '排序模式中', '刷新中', '云端牌组忙碌']) {
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

async function settle() { for (let i = 0; i < 8; i++) await new Promise(resolve => setImmediate(resolve)); }

function panelHarness({ required = 1, media = false, automatic = true } = {}) {
  const state = { closed: 0, refreshed: 0, media, pending: false, cleared: false, endpoint: '', calls: [], timers: new Map(),
    response: { required, newEndpoint: '', hostNumber: 0, serverMediaUsn: 3, serverMessage: '' } };
  class BackendError extends Error {}
  const gate = new SyncActivity();
  const Panel = componentMethods(read('components/同步面板.ets'), ['aboutToAppear', 'aboutToDisappear', '启动同步',
    'notifySyncResult', '处理同步错误', '完成中止', '冲突确认', '启动媒体阶段', '开始媒体轮询', '清理轮询定时器', '是否允许关闭'], {
    ...flow, syncActivity: gate, 后端错误: BackendError,
    加载媒体同步开关: () => state.media, 加载媒体待同步: () => state.pending,
    设置媒体待同步: value => { state.pending = value; }, 保存同步端点: value => { state.endpoint = value; },
    清除同步凭证: () => { state.cleared = true; },
    hilog: { info() {}, error() {} }, 同步日志域: 0, 同步日志标签: 'test', $r: key => key,
    setInterval: fn => { state.timers.set(1, fn); return 1; }, clearInterval: id => state.timers.delete(id)
  });
  const panel = new Panel();
  const auth = { hkey: 'test-key', endpoint: 'https://custom.example/anki/', ioTimeoutSecs: 0 };
  Object.assign(panel, { syncOwner: {}, automatic, 初始鉴权: auth, 当前阶段: 'syncing', 错误文案: '', 是否请求中止: false,
    轮询定时器: -1, 集合已同步: false, 是否在媒体阶段: false,
    取本地化文案: key => key, 关闭回调: () => { state.closed++; }, 同步完成回调: () => { state.refreshed++; },
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
  assert.equal(state.refreshed, 0);
  assert.equal(state.pending, true);
});

test('login uses the saved custom endpoint, blocks unsaved input, and never persists a password', async () => {
  const calls = [], persisted = [];
  class BackendError extends Error {}
  const Group = componentMethods(read('components/settings/同步分组.ets'), ['点击登录'], {
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
  const Group = componentMethods(read('components/settings/同步分组.ets'), ['saveServer'], {
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
