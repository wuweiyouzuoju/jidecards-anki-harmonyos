// SPDX-License-Identifier: AGPL-3.0-or-later

// 首页统计接线契约测试（T6）：
// - 服务索引 的 后端统计=43 / 统计方法.图表=2 与 backend.rs 构建产物一致；
// - 统计服务 只经 后端会话 走 Graphs 调用，search 固定空串（全库）；
// - 首页.ets 拉取失败静默降级（返回 null），快照照常构建，热力/记忆率回落空态。
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

function projectUrl(relativePath) {
  return new URL(`../../${relativePath}`, import.meta.url);
}

function read(relativePath) {
  return readFileSync(projectUrl(relativePath), 'utf8');
}

const SERVICE_IDS = 'entry/src/main/ets/backend/服务索引.ts';
const STATS_SERVICE = 'entry/src/main/ets/backend/统计服务.ts';
const INDEX_PAGE = 'entry/src/main/ets/pages/首页.ets';
const MAPPER = 'entry/src/main/ets/model/主页快照映射器.ets';

test('service ids pin backend stats service 43 and graphs method 2', () => {
  const ids = read(SERVICE_IDS);
  assert.match(ids, /后端统计:\s*43/, 'backend.rs: 43 => run_backend_stats_service_method');
  assert.match(ids, /图表:\s*2/, 'backend.rs: method 2 => Backend::graphs');
});

test('stats service wraps the graphs call through the shared session', () => {
  const service = read(STATS_SERVICE);
  assert.match(service, /async 获取图表统计\(天数: number, 搜索串: string = ''\): Promise<GraphsView>/);
  assert.match(service, /服务号\.后端统计/);
  assert.match(service, /统计方法\.图表/);
  assert.match(service, /encodeGraphsRequest\(天数, 搜索串\)/);
  assert.match(service, /decodeGraphsResponse\(响应字节\)/);
  assert.doesNotMatch(service, /new 后端客户端/, 'must go through 后端会话');
});

test('stats service exposes GetGraphPreferences via method 3 and decodes response', () => {
  const service = read(STATS_SERVICE);
  assert.match(service, /async 获取图表偏好\(\): Promise<GraphPreferences>/);
  assert.match(service, /统计方法\.获取图表偏好/);
  assert.match(service, /encodeEmpty\(\)/, 'GetGraphPreferences takes generic.Empty');
  assert.match(service, /decodeGraphPreferences\(响应字节\)/);
});

test('stats service exposes SetGraphPreferences via method 4 and encodes request', () => {
  const service = read(STATS_SERVICE);
  assert.match(service, /async 设置图表偏好\(偏好: GraphPreferences\): Promise<void>/);
  assert.match(service, /统计方法\.设置图表偏好/);
  assert.match(service, /encodeGraphPreferences\(偏好\)/);
});

test('service index pins GetGraphPreferences=3 and SetGraphPreferences=4', () => {
  const ids = read(SERVICE_IDS);
  assert.match(ids, /获取图表偏好:\s*3/, 'backend.rs: method 3 => GetGraphPreferences');
  assert.match(ids, /设置图表偏好:\s*4/, 'backend.rs: method 4 => SetGraphPreferences');
});

test('home wires graphs into the snapshot and degrades quietly', () => {
  const index = read(INDEX_PAGE) + read('entry/src/main/ets/backend/HomeDataRepository.ets');
  assert.match(index, /import \{ 统计服务 \} from '..\/backend\/统计服务'/);
  assert.match(index, /readGraphs\(\): Promise<GraphsView \| null>/);
  assert.match(index, /构建主页快照\(tree, graphs/);
  assert.doesNotMatch(index, /构建月历\(new Date\(\), snapshot\.reviewCountsByDate\)/,
    'homepage no longer constructs the retired monthly calendar UI');

  const method = index.match(/private async readGraphs[\s\S]*?\n  \}/);
  assert.notEqual(method, null);
  // 2026-08-26 起跟随统计页「近 1 年/全部」本地持久化偏好（加载统计天数），
  // 不再写死 365；仍禁止用日期函数派生天数。
  assert.match(method[0], /const days: number = await 加载统计天数\(\);[\s\S]*获取图表统计\(days\)/,
    'lookback window must follow the persisted stats range preference, not a date-derived value');
  assert.doesNotMatch(method[0], /获取图表统计\(new Date\(\)/,
    'days must never be derived from the current date');
  assert.match(method[0], /catch \(error\)[\s\S]*?return null/,
    'stats failure must degrade to the empty state without blocking home');
});

test('mapper keeps empty states when graphs data is absent', () => {
  const mapper = read(MAPPER);
  assert.match(mapper, /图表数据: GraphsView \| null = null/);
  assert.match(mapper, /图表数据\.fsrs/, 'memory requires the fsrs flag');
  assert.match(mapper, /average > 0/, 'memory requires real fsrs memory-state data');
  assert.match(mapper, /average \/ 100/, 'backend percent scale converts to 0-1 ratio');
});
