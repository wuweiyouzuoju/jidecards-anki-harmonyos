// SPDX-License-Identifier: AGPL-3.0-or-later

// 统计对齐契约测试：覆盖 统计色板（Anki d3 色带插值）与 统计分箱（d3 ticks/nice/分位）
// 两个纯函数模块，以及 GraphsResponse.retrievability 的 map 桶解码（记忆率直方图数据源）。
// 对齐目标：Anki 26.05 ts/routes/graphs/*（FutureDue/Added/Hour/Intervals/Difficulty 等）。
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';

import { 协议写入器 } from '../../entry/src/main/ets/proto/core/ProtoWriter.ts';
import { decodeGraphsResponse, encodeGraphsRequest } from '../../entry/src/main/ets/proto/messages/StatsMessages.ts';
import {
  取蓝色, 取绿色, 取红黄绿,
  取小时柱色, 取预测柱色, 取新增柱色, 取间隔柱色,
  取难度柱色, 取可提取性柱色, 取按钮色, 取复习系列色,
  色卡片_新卡, 色卡片_学习中, 色卡片_重学中,
  色卡片_年轻, 色卡片_成熟, 色卡片_已暂停, 色卡片_已埋藏,
  色保留率_年轻, 色保留率_成熟
} from '../../entry/src/main/ets/model/统计色板.ets';
import {
  取刻度, 取美观域, 按刻度分箱, 取轴域,
  加权分位, 取分布分位, 取最小键, 取最大键
} from '../../entry/src/main/ets/model/统计分箱.ets';

// ── 统计色板：d3 色带锚点与关键取值 ──

test('color scales hit anchor endpoints', () => {
  assert.equal(取蓝色(0), '#f7fbff');
  assert.equal(取蓝色(1), '#08306b');
  assert.equal(取绿色(0), '#f7fcf5');
  assert.equal(取绿色(1), '#00441b');
  assert.equal(取红黄绿(0), '#a50026');
  assert.equal(取红黄绿(1), '#006837');
});

test('color scales clamp out-of-range t', () => {
  assert.equal(取蓝色(-1), '#f7fbff');
  assert.equal(取蓝色(2), '#08306b');
  assert.equal(取红黄绿(1.5), '#006837');
});

test('hour bar color maps [0,1] into Blues(0.1,0.8) — Anki HourGraph', () => {
  assert.equal(取小时柱色(0), 取蓝色(0.1));
  assert.equal(取小时柱色(1), 取蓝色(0.8));
});

test('forecast bar color is Greens(0.7→0.3) — Anki FutureDue', () => {
  assert.equal(取预测柱色(0), 取绿色(0.7));
  assert.equal(取预测柱色(1), 取绿色(0.3));
});

test('added bar color is Blues(0.7→0.3) — Anki AddedGraph', () => {
  assert.equal(取新增柱色(0), 取蓝色(0.7));
  assert.equal(取新增柱色(1), 取蓝色(0.3));
});

test('interval bar color is Blues(0.3→0.7) — Anki IntervalsGraph', () => {
  assert.equal(取间隔柱色(0), 取蓝色(0.3));
  assert.equal(取间隔柱色(1), 取蓝色(0.7));
});

test('difficulty/retrievability bar colors use RdYlGn — Anki Difficulty/Retrievability', () => {
  // 难度高 → 红：取难度柱色(1) 应等于 RdYlGn(0)
  assert.equal(取难度柱色(1), 取红黄绿(0));
  assert.equal(取难度柱色(0), 取红黄绿(1));
  // 可提取性高 → 绿
  assert.equal(取可提取性柱色(1), 取红黄绿(1));
  assert.equal(取可提取性柱色(0), 取红黄绿(0));
});

test('answer button colors follow RdYlGn quartiles — Anki ButtonsGraph', () => {
  assert.equal(取按钮色(1), 取红黄绿(0));
  assert.equal(取按钮色(2), 取红黄绿(1 / 3));
  assert.equal(取按钮色(3), 取红黄绿(2 / 3));
  assert.equal(取按钮色(4), 取红黄绿(1));
});

test('reviews series colors match Anki ramp endpoints', () => {
  // Mature Greens 0.4→0.7；Young Greens 0.3→0.5；Relearn Reds；Learn Oranges；Filtered Purples
  assert.equal(取复习系列色(0, 0), 取绿色(0.4));
  assert.equal(取复习系列色(0, 1), 取绿色(0.7));
  assert.equal(取复习系列色(1, 1), 取绿色(0.5));
  // Filtered 系列（Purples 0.3→0.5）位置插值合法 hex 且与 Greens 端点不同
  assert.match(取复习系列色(4, 0.5), /^#[0-9a-f]{6}$/);
  assert.notEqual(取复习系列色(4, 0.5), 取绿色(0.5));
});

test('card count series colors match Anki scheme[5] picks', () => {
  assert.equal(色卡片_新卡, '#6baed6');
  assert.equal(色卡片_学习中, '#fd8d3c');
  assert.equal(色卡片_重学中, '#fb6a4a');
  assert.equal(色卡片_年轻, '#74c476');
  assert.equal(色卡片_成熟, '#31a354');
  assert.equal(色卡片_已暂停, '#FFDC41');
  assert.equal(色卡片_已埋藏, '#808080');
  assert.equal(色保留率_年轻, '#64c476');
  assert.equal(色保留率_成熟, '#31a354');
});

// ── 统计分箱：d3 数值算法 ──

test('ticks picks 1/2/5×10^k steps like d3', () => {
  // 0..31 期望 31 → 步长 1（每日一刻度）
  const 月刻度 = 取刻度(0, 31, 31);
  assert.equal(月刻度[0], 0);
  assert.equal(月刻度[月刻度.length - 1], 31);
  assert.equal(月刻度.length, 32);
  // 0..364 期望 70 → 原始步长 5.2 → d3 取 5（阈值 √10≈3.16 < 5.2 < √50≈7.07）
  const 年刻度 = 取刻度(0, 364, 70);
  assert.equal(年刻度[1] - 年刻度[0], 5);
  // 0..89 期望 70 → 原始步长 1.27 → d3 取 1
  const 季刻度 = 取刻度(0, 89, 70);
  assert.equal(季刻度[1] - 季刻度[0], 1);
});

test('nice extends domain to 1/2/5 multiples', () => {
  // d3 nice(0.3, 7.2)：步长 0.5 → [0, 7.5]；nice(12, 88)：步长 10 → [10, 90]
  assert.deepEqual(取美观域(0.3, 7.2), [0, 7.5]);
  assert.deepEqual(取美观域(12, 88), [10, 90]);
});

test('axis domain binds upper bound with ticks for exact alignment', () => {
  // 反例回归：峰值 126 时 取美观域 上限 130 与 取刻度 步长 50 不整除 → 刻度缺顶值错位；
  // 取轴域 必须在同一计算内绑定产出：等差刻度、端点 0 与上限
  const 域126 = 取轴域(126, 4);
  assert.equal(域126.上限 >= 126, true);
  assert.equal(域126.刻度[域126.刻度.length - 1], 域126.上限);
  assert.equal(域126.刻度[0], 0);
  for (let i = 1; i < 域126.刻度.length; i++) {
    assert.equal(
      Math.abs(域126.刻度[i] - 域126.刻度[i - 1] - (域126.刻度[1] - 域126.刻度[0])) < 1e-9,
      true,
      `刻度必须等差：${域126.刻度}`
    );
  }

  // 常规值：93 → 上限 100，刻度 [0,20,40,60,80,100]
  const 域93 = 取轴域(93, 4);
  assert.equal(域93.上限, 100);
  assert.deepEqual(域93.刻度, [0, 20, 40, 60, 80, 100]);

  // 小数据（新用户第一天）：峰值 1 → 步长 0.2，小数刻度保留（显示层不再四舍五入）
  const 域1 = 取轴域(1, 4);
  assert.equal(域1.上限, 1);
  assert.equal(域1.刻度.length, 6);

  // 零/负峰值：退化为 [0,1] 不抛错
  assert.deepEqual(取轴域(0, 4).刻度, [0, 1]);
  assert.deepEqual(取轴域(-5, 4).刻度, [0, 1]);

  // 全域扫描：任意 1..2000 峰值下绑定性质恒成立（端点、等差、上限覆盖峰值）
  for (let 峰值 = 1; 峰值 <= 2000; 峰值++) {
    const 域 = 取轴域(峰值, 4);
    assert.equal(域.上限 >= 峰值, true, `上限须覆盖峰值：${峰值}`);
    assert.equal(域.刻度[0], 0, `刻度首项须为 0：${峰值}`);
    assert.equal(
      Math.abs(域.刻度[域.刻度.length - 1] - 域.上限) < 1e-9,
      true,
      `刻度末项须等于上限：${峰值} → ${域.刻度}`
    );
    const 步长 = 域.刻度[1] - 域.刻度[0];
    for (let i = 1; i < 域.刻度.length; i++) {
      assert.equal(
        Math.abs(域.刻度[i] - 域.刻度[i - 1] - 步长) < 1e-9,
        true,
        `刻度须等差：${峰值} → ${域.刻度}`
      );
    }
    assert.equal(域.刻度.length <= 9, true, `刻度数防御上限：${峰值} → ${域.刻度.length}`);
  }
});

test('binning by thresholds sums values per interval', () => {
  const 数据 = new Map([[0, 3], [1, 4], [2, 5], [3, 6], [10, 7]]);
  const 箱 = 按刻度分箱(数据, [2, 4], 0);
  // 边界 [0,2),[2,4),[4,+∞)→末箱含 10（超过末刻度丢弃）
  assert.equal(箱.length, 2);
  assert.equal(箱[0].总量, 7);  // 0,1
  assert.equal(箱[1].总量, 11); // 2,3
});

test('weighted quantile matches Anki easeQuantile semantics', () => {
  const 数据 = new Map([[10, 1], [20, 1], [30, 1], [40, 1]]);
  assert.equal(加权分位(数据, 0.25), 10);
  assert.equal(加权分位(数据, 0.5), 20);
  assert.equal(加权分位(数据, 1), 40);
  assert.equal(加权分位(new Map(), 0.5), 0);
});

test('bucket quantile preserves d3 interpolation without expanding card counts', () => {
  const data = new Map([[1, 2], [5, 1], [9, 1]]);
  assert.equal(取分布分位(data, 0.5), 3);
  assert.ok(Math.abs(取分布分位(data, 0.95) - 8.4) < 1e-9);
  assert.equal(取分布分位(new Map(), 0.5), 0);
  assert.equal(取分布分位(new Map([[4, 1]]), 0.95), 4);
  assert.equal(取分布分位(new Map([[4, 0]]), 0.5), 0);
  for (let mask = 1; mask < 256; mask++) {
    const buckets = new Map([9, 1, 5, 20].map((key, i) => [key, (mask >> (i * 2)) & 3]));
    const expanded = [...buckets].flatMap(([key, count]) => Array(count).fill(key)).sort((a, b) => a - b);
    for (const p of [0, 0.1, 0.25, 0.5, 0.95, 1]) {
      const position = (expanded.length - 1) * p, lower = Math.floor(position);
      const expected = expanded[lower] + ((expanded[Math.ceil(position)] - expanded[lower]) * (position - lower));
      assert.equal(取分布分位(buckets, p), expected);
    }
  }
});

test('interval and stability charts handle uint32 card counts with bounded memory', () => {
  for (const [name, field, median] of [['间隔分布卡', '间隔数据', '取中位间隔'], ['稳定度分布卡', '稳定度数据', '取中位稳定度']]) {
    const source = readFileSync(new URL(`../../entry/src/main/ets/components/stats/${name}.ets`, import.meta.url), 'utf8');
    const names = ['取显示上限', '更新缓存', median];
    const methods = names.map(name => {
      const start = source.indexOf(`  private ${name}(`) >= 0 ? source.indexOf(`  private ${name}(`) : source.indexOf(`  ${name}(`);
      assert.ok(start >= 0, name);
      return source.slice(start, source.indexOf('\n  }', start) + 4);
    });
    const js = stripTypeScriptTypes(`class Chart { ${methods.join('\n')} }`, { mode: 'transform' });
    const Chart = new Function('取分布分位', '取最大键', js + '; return Chart;')(取分布分位, 取最大键);
    const chart = new Chart();
    chart[field] = { intervals: new Map([[1, 0xffffffff], [100, 0xffffffff]]) };
    for (const [range, upper] of [[0, 30], [1, 50.5], [2, 100], [3, 100]]) {
      chart.范围索引 = range;
      chart.更新缓存();
      assert.equal(chart.显示上限, upper);
      assert.ok(chart.柱缓存.length <= 71);
      assert.equal(chart.柱缓存.reduce((a, b) => a + b, 0), upper < 100 ? 0xffffffff : 2 * 0xffffffff);
      assert.equal(chart[median](), 51);
    }
    chart[field] = null; chart.更新缓存();
    assert.deepEqual(chart.柱缓存, []);
    assert.equal(chart[median](), 0);
  }
});

test('min/max key helpers with fallback', () => {
  const 数据 = new Map([[-3, 2], [0, 5], [7, 1]]);
  assert.equal(取最小键(数据, 0), -3);
  assert.equal(取最大键(数据, 0), 7);
  assert.equal(取最小键(new Map(), -31), -31);
  // 量为 0 的键不算
  const 零量 = new Map([[5, 0], [9, 1]]);
  assert.equal(取最大键(零量, 0), 9);
});

// ── retrievability map 桶解码（记忆率直方图数据源） ──

function 构造键值对(键, 值) {
  const w = new 协议写入器();
  w.写入变长整数(1, 键);
  w.写入变长整数(2, 值);
  return w.转为字节();
}

test('GraphsResponse.retrievability decodes 1%-granularity buckets map', () => {
  // Retrievability { retrievability: map<uint32,uint32>, average, sum_by_card, sum_by_note }
  const r = new 协议写入器();
  r.写入字节(1, 构造键值对(85, 3));
  r.写入字节(1, 构造键值对(92, 5));
  r.写入浮点(2, 87.5);
  r.写入浮点(3, 42.0);
  r.写入浮点(4, 40.5);

  const top = new 协议写入器();
  top.写入子消息(12, r); // field 12 = retrievability

  const view = decodeGraphsResponse(top.转为字节());
  assert.notEqual(view.retrievability, null);
  assert.notEqual(view.retrievability.buckets, null);
  assert.equal(view.retrievability.buckets.get(85), 3);
  assert.equal(view.retrievability.buckets.get(92), 5);
  assert.ok(Math.abs(view.retrievability.average - 87.5) < 1e-6);
  assert.ok(Math.abs(view.retrievability.sumByCard - 42.0) < 1e-6);
  assert.ok(Math.abs(view.retrievability.sumByNote - 40.5) < 1e-6);
});

test('GraphsResponse.retrievability without map leaves buckets null', () => {
  const r = new 协议写入器();
  r.写入浮点(2, 10.0);
  const top = new 协议写入器();
  top.写入子消息(12, r);
  const view = decodeGraphsResponse(top.转为字节());
  assert.notEqual(view.retrievability, null);
  assert.equal(view.retrievability.buckets, null);
  assert.ok(Math.abs(view.retrievability.average - 10.0) < 1e-6);
});

test('encodeGraphsRequest carries deck search string (field 1)', () => {
  const 空请求 = encodeGraphsRequest(365);
  // 仅 field2：tag(0x10) + varint(365 需 2 字节) = 3 字节
  assert.equal(空请求.length, 3);
  const 带搜索 = encodeGraphsRequest(365, 'deck:"A::B"');
  // field1 (tag 0x0A) + 长度 + 内容 + field2 varint
  assert.equal(带搜索[0], 0x0A);
  const 解码 = new TextDecoder().decode(带搜索.slice(2, 2 + 带搜索[1]));
  assert.equal(解码, 'deck:"A::B"');
});
