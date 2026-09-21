import { loadPlatformModule } from './platform-module-harness.mjs';
// SPDX-License-Identifier: AGPL-3.0-or-later
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { buildDeckStudyHistory, deckHistorySearch, historyStudyDayKey } from '../../entry/src/main/ets/model/DeckStudyHistory.ts';
import { copyDeckConfig, buildDeckConfigRequest, prepareDeckConfigForSave } from '../../entry/src/main/ets/model/DeckConfigSave.ts';
import { emptyDeckConfigSettings } from '../../entry/src/main/ets/proto/messages/DeckConfigMessages.ts';

const kinds = (learn = 0, relearn = 0, young = 0, mature = 0, filtered = 0) => ({ learn, relearn, young, mature, filtered });
const graphs = (count = 0) => ({
  reviewCountsByDaysAgo: new Map([[0, kinds(count)]]),
  reviewTimesByDaysAgo: new Map([[0, kinds(count * 1250)]]),
  rolloverHour: 4
});

test('seven study days use signed backend buckets, all answer kinds, exact milliseconds and zero-filled gaps', () => {
  const data = graphs(1);
  data.reviewCountsByDaysAgo.set(-1, kinds(1, 2, 3, 4, 5));
  data.reviewCountsByDaysAgo.set(-6, kinds(2));
  data.reviewCountsByDaysAgo.set(-7, kinds(999));
  data.reviewCountsByDaysAgo.set(1, kinds(999));
  data.reviewTimesByDaysAgo.set(-1, kinds(100, 200, 300, 400, 500));
  data.reviewTimesByDaysAgo.set(-6, kinds(25));
  data.reviewTimesByDaysAgo.set(-7, kinds(999999));
  const result = buildDeckStudyHistory(data);
  assert.deepEqual(result.days.map(day => day.daysAgo), [6, 5, 4, 3, 2, 1, 0]);
  assert.deepEqual(result.days.map(day => day.count), [2, 0, 0, 0, 0, 15, 1]);
  assert.equal(result.activeDays, 3);
  assert.equal(result.totalCount, 18);
  assert.equal(result.totalMillis, 2775);
  assert.equal(result.maxCount, 15);
});

test('missing stats are errors; empty maps are a valid zero-history response', () => {
  assert.throws(() => buildDeckStudyHistory({ ...graphs(), reviewCountsByDaysAgo: null }));
  assert.throws(() => buildDeckStudyHistory({ ...graphs(), reviewTimesByDaysAgo: null }));
  const result = buildDeckStudyHistory({ ...graphs(), reviewCountsByDaysAgo: new Map(), reviewTimesByDaysAgo: new Map() });
  assert.equal(result.days.length, 7);
  assert.equal(result.activeDays, 0);
  assert.equal(result.totalMillis, 0);
});

test('scope includes descendants but excludes siblings; special deck names never become search syntax', () => {
  const decks = [
    { id: '10', fullName: '刑法*"' },
    { id: '11', fullName: '刑法*"::第一章' },
    { id: '12', fullName: '刑法*"::第一章::案例' },
    { id: '13', fullName: '刑法其他' },
    { id: '14', fullName: '刑法*"::第二章' }
  ];
  assert.equal(deckHistorySearch('10', decks), 'did:10,11,12,14');
  assert.equal(deckHistorySearch('11', decks), 'did:11,12');
  assert.equal(deckHistorySearch('missing', decks), '');
  assert.equal(deckHistorySearch('invalid', [{ id: 'invalid', fullName: 'x' }]), '');
});

test('day rollover follows local study day across midnight and month/year boundaries', () => {
  const before = new Date(2026, 0, 1, 3, 59, 59);
  assert.equal(historyStudyDayKey(before, 4), '2025-11-31');
  assert.equal(historyStudyDayKey(new Date(2026, 0, 1, 4), 4), '2026-0-1');
  assert.equal(historyStudyDayKey(new Date(2026, 0, 1, 0), 0), '2026-0-1');
  assert.equal(before.getDate(), 1, 'input date is not mutated');
});

const source = readFileSync(new URL('../../entry/src/main/ets/components/DeckStudyHistoryCard.ets', import.meta.url), 'utf8');
const methods = source.slice(source.indexOf('  aboutToAppear()'), source.indexOf('  build()'));
const js = stripTypeScriptTypes(`class HistoryHarness { ${methods} }`, { mode: 'transform' });
function harness(fetch) {
  let timerCallback;
  let cleared = 0;
  const Harness = new Function('buildDeckStudyHistory', 'historyStudyDayKey', 'setInterval', 'clearInterval',
    js + '\nreturn HistoryHarness;')(buildDeckStudyHistory, historyStudyDayKey,
    fn => { timerCallback = fn; return 1; }, () => { cleared++; });
  const state = Object.assign(new Harness(), {
    service: { 获取图表统计: fetch }, active: true, requestId: 0, timer: -1,
    search: 'did:10', loading: false, failed: false, history: buildDeckStudyHistory(graphs()), dayKey: ''
  });
  return { state, tick: () => timerCallback(), cleared: () => cleared };
}
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};

test('switching deck discards slow old success; reloading same scope fetches new counts after undo', async () => {
  const pending = [];
  const { state } = harness((days, scope) => {
    assert.equal(days, 6);
    const item = deferred(); pending.push({ ...item, scope }); return item.promise;
  });
  const old = state.reload();
  state.search = 'did:20';
  const current = state.reload();
  assert.equal(state.loading, true, 'old values are hidden during refresh');
  pending[1].resolve(graphs(20)); await current;
  pending[0].resolve(graphs(99)); await old;
  assert.equal(state.history.totalCount, 20);
  assert.deepEqual(pending.map(item => item.scope), ['did:10', 'did:20']);
  const undo = state.reload(); pending[2].resolve(graphs(19)); await undo;
  assert.equal(state.history.totalCount, 19);
});

test('old errors do not replace fresh data and disappearing invalidates in-flight work', async () => {
  const pending = [];
  const { state } = harness(() => { const item = deferred(); pending.push(item); return item.promise; });
  const old = state.reload(), current = state.reload();
  pending[1].resolve(graphs(3)); await current;
  pending[0].reject(new Error('stale')); await old;
  assert.equal(state.failed, false);
  const hidden = state.reload(); state.aboutToDisappear();
  pending[2].resolve(graphs(100)); await hidden;
  assert.equal(state.history.totalCount, 3);
});

test('failure can retry and missing scope never queries the entire collection', async () => {
  let calls = 0;
  const { state } = harness(async () => { if (++calls === 1) throw new Error('offline'); return graphs(2); });
  await state.reload(); assert.equal(state.failed, true);
  await state.reload(); assert.equal(state.failed, false); assert.equal(state.history.totalCount, 2);
  state.search = ''; await state.reload();
  assert.equal(state.failed, true); assert.equal(calls, 2);
});

test('visibility refreshes data and rollover polling only queries when study day changes', async () => {
  let calls = 0;
  const { state, tick, cleared } = harness(async () => { calls++; return graphs(1); });
  state.setVisible(true); await Promise.resolve();
  assert.equal(calls, 1);
  tick(); assert.equal(calls, 1);
  state.dayKey = 'previous-day'; tick(); await Promise.resolve();
  assert.equal(calls, 2);
  state.setVisible(false); assert.equal(cleared(), 1);
  await state.reload(); assert.equal(calls, 2);
  state.setVisible(true); await Promise.resolve(); assert.equal(calls, 3);
});

test('both detail layouts refresh on committed home snapshots and history watches scope/token', () => {
  const home = readFileSync(new URL('../../entry/src/main/ets/pages/首页.ets', import.meta.url), 'utf8');
  assert.match(home, /this\.主页快照数据 = snapshot;\s*this\.historyRefreshToken\+\+/);
  assert.equal((home.match(/historyRefreshToken: this\.historyRefreshToken/g) ?? []).length, 2);
  assert.match(source, /@Prop @Watch\('reload'\) search/);
  assert.match(source, /@Prop @Watch\('reload'\) refreshToken/);
  assert.match(home, /name: 'StudyPage',[\s\S]*?onPop:[\s\S]*?this\.返回主页后刷新\(\)/);
});

function homeSaveHarness(method, dependencies) {
  const home = readFileSync(new URL('../../entry/src/main/ets/pages/首页.ets', import.meta.url), 'utf8').replaceAll('\r\n', '\n');
  const start = home.indexOf(`  private async ${method}(`);
  assert.ok(start >= 0);
  const end = home.indexOf('\n  }', start) + 4;
  const code = stripTypeScriptTypes(`class SaveHarness { ${home.slice(start, end)} }`, { mode: 'transform' });
  const Harness = new Function(...Object.keys(dependencies), code + '\nreturn SaveHarness;')(...Object.values(dependencies));
  const page = new Harness();
  if (method === '应用牌组定制') {
    const Commands = loadPlatformModule('backend/HomeDeckCommands.ets', 'HomeDeckCommands', { ...dependencies, 牌组服务: class {} });
    page.deckCommands = new Commands();
  }
  return page;
}

test('editing a deck waits for metadata writes then refreshes even when its ID is unchanged', async () => {
  const events = [];
  const saved = deferred();
  const state = homeSaveHarness('应用牌组定制', {
    保存牌组别名: async (id, name) => { assert.equal(id, '10'); assert.equal(name, '刑法笔记'); events.push('save'); await saved.promise; },
    保存牌组背景图: async () => { events.push('background'); },
    清除牌组背景图: async () => { throw new Error('unexpected remove'); },
    $r: name => name
  });
  Object.assign(state, {
    定制牌组中: false, 定制牌组ID: '10', 显示牌组定制: true,
    按ID查牌组: () => ({ id: '10', name: '刑法', displayName: '' }),
    加载主页数据: async () => { events.push('refresh'); },
    显示提示: () => { events.push('done'); }
  });
  const pending = state.应用牌组定制({ 新名: '刑法笔记', 背景动作: 'replace', 背景像素图: {} });
  assert.deepEqual(events, ['save'], 'must not refresh before persistence finishes');
  saved.resolve(); await pending;
  assert.deepEqual(events, ['save', 'background', 'refresh', 'done']);
  assert.equal(state.定制牌组ID, '10');
  assert.equal(state.显示牌组定制, false);
  assert.equal(state.定制牌组中, false);
});

test('saving deck options refreshes only after backend changes finish', async () => {
  const events = [];
  const saved = deferred();
  const state = homeSaveHarness('保存牌组选项', {
    copyDeckConfig, buildDeckConfigRequest, prepareDeckConfigForSave,
    UPDATE_DECK_CONFIGS_MODE_NORMAL: 0,
    notifyFsrsStateChanged: () => { events.push('fsrs'); }
  });
  Object.assign(state, {
    牌组选项中: false, 牌组选项牌组ID: 10,
    编辑视图: { cardStateCustomizer: '', allConfigs: [] },
    编辑配置: { id: 1, name: 'Default', mtimeSecs: 0, usn: 0, config: emptyDeckConfigSettings() },
    牌组配置服务实例: { 更新牌组配置: async request => {
      assert.equal(request.targetDeckId, 10); events.push('save'); await saved.promise;
    } },
    关闭牌组选项: () => { events.push('close'); },
    加载主页数据: async () => { events.push('refresh'); }
  });
  const pending = state.保存牌组选项({ 校验: () => [], 应用到配置: () => true }, {
    校验: () => [], 应用: () => true, 转换为请求字段: () => ({ limits: null, newCardsIgnoreReviewLimit: false, fsrs: false, applyAllParentLimits: false, fsrsReschedule: false, fsrsHealthCheck: false })
  });
  assert.deepEqual(events, ['save']);
  saved.resolve(); await pending;
  assert.deepEqual(events, ['save', 'fsrs', 'close', 'refresh']);
  assert.equal(state.牌组选项中, false);
});
