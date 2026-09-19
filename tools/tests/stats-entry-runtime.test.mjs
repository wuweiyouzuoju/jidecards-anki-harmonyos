// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { SyncActivity } from '../../entry/src/main/ets/model/SyncSettings.ts';
import { decodeGraphsResponse } from '../../entry/src/main/ets/proto/messages/StatsMessages.ts';

const read = name => readFileSync(new URL('../../entry/src/main/ets/pages/' + name + '.ets', import.meta.url), 'utf8');
const settle = async () => { for (let i = 0; i < 5; i++) await new Promise(setImmediate); };
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
function component(name, names, dependencies) {
  const source = read(name);
  const methods = names.map(name => {
    const start = source.search(new RegExp(`  (?:private )?(?:async )?${name}\\(`));
    assert.ok(start >= 0, name);
    return source.slice(start, source.indexOf('\n  }', start) + 4);
  });
  const js = stripTypeScriptTypes(`class Page { ${methods.join('\n')} }`, { mode: 'transform' });
  return new Function(...Object.keys(dependencies), js + '; return Page;')(...Object.values(dependencies));
}

function harness({ snapshot = decodeGraphsResponse(new Uint8Array()), theme = Promise.resolve('dark'), days = 365 } = {}) {
  const sync = new SyncActivity(), events = [], fresh = decodeGraphsResponse(new Uint8Array());
  const Page = component('统计页', ['aboutToAppear', 'aboutToDisappear', '加载统计数据', '加载牌组列表', '更新偏好', 'on分离变更'], {
    syncActivity: sync,
    AppStorage: { get: () => 'dark' },
    CustomTransition: { getInstance: () => ({ 注册NavParam() {}, 注销NavParam() {} }) },
    加载主题模式: () => theme,
    加载小时分布窗口: async () => 0,
    加载统计天数: async () => days,
    后端会话: { 获取实例: () => ({ 确保已打开: async () => { events.push('open'); } }) },
    牌组服务: class { async 获取牌组树() { events.push('decks'); return { children: [] }; } },
    平铺牌组树: () => [],
    默认偏好: () => ({ cardCountsSeparateInactive: false }),
    hilog: { info() {}, error() {} }, $r: key => key
  });
  const page = new Page();
  Object.assign(page, {
    pageActive: false, 请求序号: 0, 阶段: 'loading', 图表数据: null,
    initialSnapshot: { graphs: snapshot, days: 365 }, 图表偏好: { cardCountsSeparateInactive: false },
    取搜索串: () => '', 取能力上下文: () => ({ filesDir: 'test' }),
    刷新卡片快照: async () => { events.push('widgets'); },
    统计服务实例: {
      获取图表统计: async () => { events.push('graphs'); return fresh; },
      获取图表偏好: async () => { events.push('preferences'); return { cardCountsSeparateInactive: true }; },
      设置图表偏好: async () => { events.push('save preferences'); }
    }
  });
  return { page, sync, events, snapshot, fresh };
}

test('home retains full graphs with their range and opens statistics immediately during sync', async () => {
  const graph = decodeGraphsResponse(new Uint8Array()); let navigated;
  const Home = component('首页', ['静默加载图表', '打开统计页'], { 加载统计天数: async () => 0 });
  const home = new Home();
  Object.assign(home, {
    统计服务实例: { 获取图表统计: async days => { assert.equal(days, 0); return graph; } },
    autoSyncCollectionBusy: true, autoSyncRefreshing: true,
    deferForSync: () => { throw new Error('navigation must not wait'); },
    pendingSyncAction: () => {}, 暂停主页官方公告检查() {}, 页面栈: { pushPath: value => { navigated = value; } }
  });
  assert.equal(await home.静默加载图表(), graph);
  home.打开统计页();
  assert.equal(navigated.name, 'StatsPage');
  assert.deepEqual(navigated.param, { graphs: graph, days: 0 });
  assert.equal(home.pendingSyncAction, null);
  home.统计服务实例.获取图表统计 = async () => { throw new Error('unavailable'); };
  assert.equal(await home.静默加载图表(), null);
  assert.equal(home.statsSnapshot.graphs, graph);
  assert.match(read('首页'), /initialSnapshot: param as 统计页参数/);
});

test('cached charts are available before any await; RPCs wait only for collection release', async () => {
  const theme = deferred();
  const h = harness({ theme: theme.promise });
  h.sync.reserveCollection();
  const ready = h.page.aboutToAppear();
  assert.equal(h.page.图表数据, h.snapshot);
  assert.equal(h.page.主题模式值, 'dark');
  theme.resolve('dark'); await settle();
  assert.deepEqual(h.events, []);
  h.sync.cancelReservation(); await ready; await settle();
  assert.equal(h.page.图表数据, h.fresh);
  assert.equal(h.page.阶段, 'content');
  assert.ok(h.events.includes('graphs') && h.events.includes('decks'));
});

test('leaving while waiting cancels queries and queued preference writes', async () => {
  const h = harness(); h.sync.reserveCollection();
  const ready = h.page.aboutToAppear();
  const write = h.page.更新偏好(old => ({ ...old, cardCountsSeparateInactive: true }));
  await settle(); h.page.aboutToDisappear(); h.sync.cancelReservation();
  await Promise.all([ready, write]); await settle();
  assert.deepEqual(h.events, []);
});

test('leaving during local preference loading never starts collection work', async () => {
  const theme = deferred(), h = harness({ theme: theme.promise });
  const ready = h.page.aboutToAppear(); h.page.aboutToDisappear(); theme.resolve('dark');
  await ready; assert.deepEqual(h.events, []);
});

test('a missing snapshot or a changed range retains an honest initial loading state', async () => {
  for (const options of [{ snapshot: null }, { days: 0 }]) {
    const h = harness(options); h.sync.reserveCollection();
    const ready = h.page.aboutToAppear(); await settle();
    assert.equal(h.page.图表数据, null);
    assert.equal(h.page.阶段, 'loading');
    h.sync.cancelReservation(); await ready;
    assert.equal(h.page.图表数据, h.fresh);
  }
});

test('an old preferences response cannot overwrite a newer statistics request', async () => {
  const h = harness(), old = deferred(); let calls = 0;
  h.page.统计服务实例.获取图表偏好 = async () => ++calls === 1 ? old.promise : { revision: 2 };
  const first = h.page.aboutToAppear(); await settle();
  await h.page.加载统计数据();
  old.resolve({ revision: 1 }); await first;
  assert.equal(h.page.图表偏好.revision, 2);
  assert.equal(h.events.filter(e => e === 'widgets').length, 1);
});

test('a failed background query preserves the display snapshot and reports the error', async () => {
  const h = harness();
  h.page.统计服务实例.获取图表统计 = async () => { throw new Error('query failed'); };
  await h.page.aboutToAppear();
  assert.equal(h.page.图表数据, h.snapshot);
  assert.equal(h.page.阶段, 'error');
  assert.equal(h.page.错误详情, 'query failed');
  assert.match(read('统计页'), /if \(this\.图表数据 !== null\) \{\s*this\.统计内容\(\)/);
});

test('separate-inactive preference is applied before the widget snapshot refresh', async () => {
  const h = harness(); await h.page.aboutToAppear();
  h.page.刷新卡片快照 = async () => { assert.equal(h.page.图表偏好.cardCountsSeparateInactive, false); };
  await h.page.on分离变更(false);
});
