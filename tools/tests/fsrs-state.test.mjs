import { compileWithUiFeedback } from './ui-feedback-harness.mjs';
// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { decodeDeckConfigsForUpdate } from '../../entry/src/main/ets/proto/messages/DeckConfigMessages.ts';
import { decodeGraphsResponse } from '../../entry/src/main/ets/proto/messages/StatsMessages.ts';

const read = path => readFileSync(new URL('../../entry/src/main/ets/' + path, import.meta.url), 'utf8');
const settle = async () => { for (let i = 0; i < 5; i++) await new Promise(resolve => setImmediate(resolve)); };

// 执行真实方法，后端和 ArkUI 由替身控制；不复制业务实现。
function componentMethods(path, names, dependencies) {
  const source = read(path);
  const methods = names.map(name => {
    const start = source.search(new RegExp(`  (?:private )?(?:async )?${name}\\(`));
    assert.ok(start >= 0, name);
    return source.slice(start, source.indexOf('\n  }', start) + 4);
  });
  const js = stripTypeScriptTypes(`class Component { ${methods.join('\n')} }`, { mode: 'transform' });
  return compileWithUiFeedback(...Object.keys(dependencies), js + '\nreturn Component;')(...Object.values(dependencies));
}

function dialogHarness(path, { current = false, choice = 0, save = async () => true } = {}) {
  const state = { prompts: 0, writes: 0, toasts: [] };
  const Page = componentMethods(path, ['同步后检查FSRS'], {
    加载FSRS开启状态: async () => current,
    设置FSRS开启状态: async value => { assert.equal(value, true); state.writes++; return save(); },
    $r: key => ({ id: key })
  });
  const page = new Page();
  page.fsrsPromptActive = false;
  page.homeActivityChanged = () => {};
  page.getUIContext = () => ({
    getHostContext: () => ({ resourceManager: { getStringSync: key => key } }),
    getPromptAction: () => ({
      showDialog: async () => { state.prompts++; return { index: choice }; },
      showToast: value => state.toasts.push(value.message)
    })
  });
  return { page, state };
}

// 手动/自动同步都由首页根宿主交付集合结果，设置页不再持有同步弹窗。
for (const path of ['pages/首页.ets']) {
  test(`${path}: no transition, an already re-enabled state and a read failure never show a warning`, async () => {
    for (const [transition, current] of [[false, false], [true, true], [true, null]]) {
      const { page, state } = dialogHarness(path, { current });
      await page.同步后检查FSRS(transition);
      assert.equal(state.prompts, 0);
      assert.equal(state.writes, 0);
    }
  });

  test(`${path}: Keep Disabled does not write; re-enable awaits persistence and prevents duplicate prompts`, async () => {
    const keep = dialogHarness(path, { choice: 1 });
    await keep.page.同步后检查FSRS(true);
    assert.equal(keep.state.writes, 0);
    let finish;
    const { page, state } = dialogHarness(path, { save: () => new Promise(resolve => { finish = resolve; }) });
    const pending = page.同步后检查FSRS(true);
    await settle();
    assert.equal(page.fsrsPromptActive, true);
    await page.同步后检查FSRS(true);
    assert.equal(state.prompts, 1);
    finish(true); await pending;
    assert.equal(state.writes, 1);
    assert.equal(page.fsrsPromptActive, false);
  });

  test(`${path}: re-enable failure is visible and releases the prompt guard`, async () => {
    const { page, state } = dialogHarness(path, { save: async () => { throw new Error('write failed'); } });
    await page.同步后检查FSRS(true);
    assert.deepEqual(state.toasts, ['app.string.sync_fsrs_reenable_error']);
    assert.equal(page.fsrsPromptActive, false);
  });
}

function groupHarness() {
  const state = { value: true, read: async () => state.value, save: async value => { state.value = value; } };
  const Group = componentMethods('components/settings/调度器分组.ets',
    ['aboutToAppear', 'aboutToDisappear', '刷新FSRS状态', 'onFsrsStateChanged', '切换FSRS开关'], {
      加载FSRS开启状态: () => state.read(), 设置FSRS开启状态: value => state.save(value), $r: key => key
    });
  const group = new Group();
  Object.assign(group, { fsrsReadSequence: 0, disposed: false, FSRS操作中: false,
    是否启用FSRS: null, FSRS错误信息: '', 取本地化文本: key => key });
  return { group, state };
}

test('mounted settings refresh after sync or deck-options save; late reads cannot restore stale state', async () => {
  const { group, state } = groupHarness();
  await group.aboutToAppear(); assert.equal(group.是否启用FSRS, true);
  let oldRead;
  state.read = () => new Promise(resolve => { oldRead = resolve; });
  const old = group.刷新FSRS状态();
  state.read = async () => false;
  group.onFsrsStateChanged(); await settle();
  assert.equal(group.是否启用FSRS, false);
  oldRead(true); await old;
  assert.equal(group.是否启用FSRS, false);
  group.aboutToDisappear();
  state.read = async () => true;
  group.onFsrsStateChanged(); await settle();
  assert.equal(group.是否启用FSRS, false);
});

test('a settings save refreshes the confirmed value while preserving its failure message', async () => {
  const { group, state } = groupHarness();
  await group.aboutToAppear();
  state.save = async () => { throw new Error('write failed'); };
  await group.切换FSRS开关(false);
  assert.equal(group.是否启用FSRS, true);
  assert.equal(group.FSRS错误信息, 'write failed');
  state.read = async () => null;
  group.onFsrsStateChanged(); await settle();
  assert.equal(group.是否启用FSRS, null);
  assert.equal(group.FSRS错误信息, 'app.string.settings_fsrs_load_error');
});

test('the controller verifies saved FSRS and notifies readers even on write/readback failure', async () => {
  const source = read('model/FSRS控制器.ets');
  const start = source.indexOf('export async function 设置FSRS开启状态(');
  const fn = source.slice(start, source.indexOf('\n}', start) + 2).replace('export ', '');
  const js = stripTypeScriptTypes(fn, { mode: 'transform' });
  for (const failure of ['none', 'write', 'readback', 'mismatch']) {
    let reads = 0, notifications = 0, desktopRefreshes = 0;
    class Service {
      async 获取牌组配置编辑视图() {
        reads++;
        if (reads === 2 && failure === 'readback') throw new Error('read failed');
        return { fsrs: reads === 2 && failure !== 'mismatch' };
      }
      async 更新牌组配置() { if (failure === 'write') throw new Error('write failed'); }
    }
    const save = compileWithUiFeedback('牌组配置服务', '默认牌组ID', '构造请求', 'notifyFsrsStateChanged', '刷新桌面卡片数据', 'hilog',
      js + ';return 设置FSRS开启状态;')(
      Service, 1, () => ({}), () => notifications++, async () => desktopRefreshes++, { error() {} }
    );
    if (failure === 'none') assert.equal(await save(true), true);
    else await assert.rejects(save(true));
    assert.equal(notifications, 1);
    assert.equal(desktopRefreshes, failure === 'none' ? 1 : 0);
  }
});

test('deck options and statistics decode the same enabled/disabled values independently of other FSRS fields', () => {
  for (const enabled of [false, true]) {
    // 上游协议：DeckConfigsForUpdate.fsrs=8，GraphsResponse.fsrs=13。
    const deck = decodeDeckConfigsForUpdate(new Uint8Array([64, Number(enabled), 88, 1]));
    const graphs = decodeGraphsResponse(new Uint8Array([104, Number(enabled)]));
    assert.equal(deck.fsrs, enabled);
    assert.equal(graphs.fsrs, enabled);
    assert.equal(deck.fsrsHealthCheck, true, 'health check is a separate option');
  }
  assert.equal(decodeDeckConfigsForUpdate(new Uint8Array()).fsrs, false);
  assert.equal(decodeGraphsResponse(new Uint8Array()).fsrs, false);
});

test('statistics reload their backend snapshot on FSRS changes and both visible readers subscribe', () => {
  const Stats = componentMethods('pages/统计页.ets', ['onFsrsStateChanged'], {});
  const stats = new Stats(); let reloads = 0;
  stats.加载统计数据 = () => reloads++;
  stats.fsrsRefreshReady = true; stats.onFsrsStateChanged();
  stats.fsrsRefreshReady = false; stats.onFsrsStateChanged();
  assert.equal(reloads, 1);
  for (const path of ['pages/统计页.ets', 'components/settings/调度器分组.ets']) {
    assert.match(read(path), /@StorageProp\(FSRS_STATE_REVISION_KEY\) @Watch\('onFsrsStateChanged'\)/);
  }
  assert.match(read('pages/首页.ets'), /await this\.牌组配置服务实例\.更新牌组配置\(request\);\s*notifyFsrsStateChanged\(\)/);
});
