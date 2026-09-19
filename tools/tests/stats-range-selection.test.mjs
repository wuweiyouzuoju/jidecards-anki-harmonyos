// SPDX-License-Identifier: AGPL-3.0-or-later
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import test from 'node:test';

const read = file => readFileSync(new URL('../../entry/src/main/ets/' + file, import.meta.url), 'utf8');
const page = read('pages/统计页.ets');

function component(source, names) {
  const methods = names.map(name => {
    const start = source.search(new RegExp(`  (?:private )?${name}\\(`));
    assert.ok(start >= 0, name);
    return source.slice(start, source.indexOf('\n  }', start) + 4);
  });
  return new Function(stripTypeScriptTypes(`class Component { ${methods.join('\n')} }`,
    { mode: 'transform' }) + '; return Component;')();
}

test('every chart range is controlled by its title selector and invalidates cached data', () => {
  for (const [name, state, initial] of [
    ['预测卡', 'forecastRange', 0], ['复习卡', 'reviewsRange', 0],
    ['间隔分布卡', 'intervalRange', 2], ['稳定度分布卡', 'stabilityRange', 2],
    ['难度分布卡', 'difficultyRange', 0], ['记忆率卡', 'retrievabilityRange', 0],
    ['回答按钮卡', 'buttonsRange', 2], ['新增卡', 'addedRange', 0]
  ]) {
    const source = read(`components/stats/${name}.ets`);
    assert.match(source, /@Prop @Watch\('更新缓存'\) 范围索引/);
    assert.doesNotMatch(source, /范围切换条\(/);
    assert.ok(page.includes(`@State private ${state}: number = ${initial};`));
    assert.match(page, new RegExp(`${name}\\(\\{\\s*范围索引: this\\.${state}`));
    assert.match(page, new RegExp(`rangeIndex: this\\.${state},\\s*onRangeChange: \\(index: number\\): void => \\{ this\\.${state} = index; \\}`));
  }
  const section = read('components/stats/统计图表分区.ets');
  assert.ok(section.indexOf('范围切换条({') < section.indexOf('if (this.有数据)'));
  assert.match(read('components/stats/范围切换条.ets'), /Select\(this\.options\(\)\)/);
  assert.doesNotMatch(page, /显示统计范围菜单/);
});

test('global one-year range removes hidden all-time choices without changing independent percentile ranges', () => {
  const Page = component(page, ['normalizeTimeRanges']);
  const state = Object.assign(new Page(), { 统计天数: 0, forecastRange: 3, reviewsRange: 1,
    buttonsRange: 3, addedRange: 3, intervalRange: 3, stabilityRange: 2, difficultyRange: 3 });
  state.normalizeTimeRanges();
  assert.equal(state.forecastRange, 3);
  state.统计天数 = 365; state.normalizeTimeRanges();
  assert.deepEqual([state.forecastRange, state.reviewsRange, state.buttonsRange, state.addedRange], [2, 1, 2, 2]);
  assert.deepEqual([state.intervalRange, state.stabilityRange, state.difficultyRange], [3, 2, 3]);
});

test('answer-button chart refreshes to the selected month, quarter, year and all-time data', () => {
  const Card = component(read('components/stats/回答按钮卡.ets'), ['更新缓存']);
  const card = new Card();
  card.按钮数据 = { oneMonth: { total: 1 }, threeMonths: { total: 3 }, oneYear: { total: 12 }, allTime: { total: 24 } };
  for (const [index, key] of ['oneMonth', 'threeMonths', 'oneYear', 'allTime'].entries()) {
    card.范围索引 = index;
    card.更新缓存();
    assert.deepEqual(card.组缓存, [card.按钮数据[key]]);
  }
});

test('hour range title callback persists the new value and refreshes home/widget data', () => {
  const start = page.indexOf('rangeIndex: this.小时分布窗口');
  const callback = page.slice(start).match(/onRangeChange: (\(索引: number\): void => \{[\s\S]*?\n\s*\}),/)[1];
  const saved = [];
  const updates = [];
  const state = { 小时分布窗口: 0, 刷新卡片快照() { updates.push(this.小时分布窗口); } };
  const select = new Function('保存小时分布窗口', stripTypeScriptTypes(`const callback = ${callback};`,
    { mode: 'transform' }) + '\nreturn callback;')
    .call(state, value => { saved.push(value); return Promise.resolve(); });
  select(2);
  assert.equal(state.小时分布窗口, 2);
  assert.deepEqual(saved, [2]);
  assert.deepEqual(updates, [2]);
});
