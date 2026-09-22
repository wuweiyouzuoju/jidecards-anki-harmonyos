// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { compileWithUiFeedback } from './ui-feedback-harness.mjs';

const read = path => readFileSync(new URL('../../' + path, import.meta.url), 'utf8');
function methods(path, names, dependencies) {
  const source = read('entry/src/main/ets/' + path);
  const bodies = names.map(name => {
    const start = source.search(new RegExp(`^  (?:private )?(?:async )?${name}\\(`, 'm'));
    assert.ok(start >= 0, name);
    return source.slice(start, source.indexOf('\n  }', start) + 4);
  });
  return compileWithUiFeedback(...Object.keys(dependencies),
    stripTypeScriptTypes('class Page {\n' + bodies.join('\n') + '\n}', { mode: 'transform' }) + '; return Page;')(...Object.values(dependencies));
}

test('unreadable sync endpoint blocks login until an explicitly saved endpoint succeeds', async () => {
  const calls = [];
  const Group = methods('components/settings/同步分组.ets', ['aboutToAppear', '点击登录', 'saveServer'], {
    $r: key => key, 加载同步凭证: () => null, 加载媒体同步开关: () => true,
    loadCustomSyncServer() { throw Error('disk unavailable'); }, loadAutoSyncEnabled: () => false,
    normalizeSyncServer: value => value,
    saveCustomSyncServer: async value => { calls.push(['save', value]); return value; },
    保存同步凭证: value => calls.push(['credentials', value])
  });
  const group = new Group();
  Object.assign(group, { serverLoaded: false, savedServer: '', serverInput: '', 登录中: false, settingsSaving: false,
    用户名输入: 'name', 密码输入: 'password', 取本地化文本: key => key, syncSettingsBusy: () => false,
    同步服务实例: { 同步登录: async (...args) => { calls.push(['login', ...args]); return { hkey: 'key', endpoint: args[2] }; } },
    serverDialogController: { close() {} }
  });
  group.aboutToAppear();
  assert.equal(group.serverLoaded, false);
  await group.点击登录();
  assert.deepEqual(calls, []);
  assert.equal(group.错误文本, 'app.string.sync_server_load_failed');
  group.serverInput = 'https://private.example/';
  await group.saveServer();
  assert.equal(group.serverLoaded, true);
  assert.equal(group.savedServer, 'https://private.example/');
  assert.equal(group.serverError, '');
  assert.equal(group.密码输入, '', 'saving a server clears credentials before the next login');
  group.密码输入 = 'password';
  await group.点击登录();
  assert.deepEqual(calls.find(call => call[0] === 'login'), ['login', 'name', 'password', 'https://private.example/']);
});

test('history deletion handles both storage and checkpoint errors without an unhandled rejection', async () => {
  for (const failure of ['history', 'checkpoint', 'none']) {
    let resets = 0;
    const Page = methods('pages/AI制卡页.ets', ['执行删除历史会话'], {
      $r: key => key, deleteAgentConversation: async () => { if (failure === 'history') throw Error('disk'); }
    });
    const page = new Page();
    Object.assign(page, { conversationId: 'one', 历史会话列表: [{ id: 'one' }, { id: 'two' }],
      checkpointStore: { remove() { if (failure === 'checkpoint') throw Error('checkpoint'); } },
      取本地化文案: key => key, 开始新会话: () => { resets++; }
    });
    await page.执行删除历史会话('one');
    assert.equal(page.历史会话列表.length, failure === 'none' ? 1 : 2);
    assert.equal(resets, failure === 'none' ? 1 : 0);
    if (failure !== 'none') assert.equal(page.错误信息, 'app.string.ai_agent_history_delete_failed');
  }
});

test('language failure is displayed and redundant language changes remain no-ops', () => {
  const toasts = [];
  const Page = methods('components/settings/GeneralSettings.ets', ['选择语言'], {
    $r: key => key, 当前语言模式: () => 'en', 设置语言模式() { throw Error('platform unavailable'); }
  });
  const page = new Page();
  page.getUIContext = () => ({ getPromptAction: () => ({ showToast: options => toasts.push(options.message) }) });
  page.选择语言('en'); assert.deepEqual(toasts, []);
  page.选择语言('zh-Hans'); assert.deepEqual(toasts, ['app.string.settings_language_save_failed']);
});

test('application labels have one owner per locale and the form explicitly binds its storage', () => {
  for (const [locale, expected] of [['base', '记得闪卡'], ['en_US', 'JiDe Flashcards']]) {
    const app = JSON.parse(read(`AppScope/resources/${locale}/element/string.json`)).string;
    const entry = JSON.parse(read(`entry/src/main/resources/${locale}/element/string.json`)).string;
    assert.deepEqual(app.filter(item => item.name === 'app_name'), [{ name: 'app_name', value: expected }]);
    assert.equal(entry.some(item => item.name === 'app_name'), false);
  }
  const widget = read('entry/src/main/ets/widget/pages/统计卡片.ets');
  assert.match(widget, /const statsCardStorage: LocalStorage = new LocalStorage\(\)/);
  assert.match(widget, /@Entry\(statsCardStorage\)/);
  assert.match(widget, /@LocalStorageProp\(存储键\) @Watch\('数据更新'\)/);
});
