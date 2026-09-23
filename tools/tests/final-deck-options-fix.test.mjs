// SPDX-License-Identifier: AGPL-3.0-or-later

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { decodeUpdateDeckConfigsRequest, encodeUpdateDeckConfigsRequest } from '../../entry/src/main/ets/proto/messages/DeckConfigMessages.ts';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

test('current deck limits and scheduler flags round-trip as editable request data', async () => {
  const { 牌组选项编辑 } = await import('../../entry/src/main/ets/model/牌组选项编辑.ets');
  const edit = 牌组选项编辑.从视图创建({ review: 100, new: null, reviewToday: 20, newToday: 10, reviewTodayActive: true, newTodayActive: false, desiredRetention: null }, false, false, false, false);
  edit.复习限额文本 = '120'; edit.新卡限额文本 = '30'; edit.今日复习文本 = '25'; edit.今日新卡文本 = '';
  edit.今日复习启用 = false; edit.今日新卡启用 = true; edit.目标保留率覆盖文本 = '0.85';
  edit.新卡忽略复习限额 = true; edit.是否启用FSRS = true; edit.应用所有父级限额 = true;
  edit.FSRS重排 = true; edit.FSRS健康检查 = true;
  assert.deepEqual(edit.校验(), []);
  assert.equal(edit.应用(), true);
  const bytes = encodeUpdateDeckConfigsRequest({ targetDeckId: 1, configs: [], removedConfigIds: [], mode: 0, cardStateCustomizer: '', ...edit.转换为请求字段() });
  const decoded = decodeUpdateDeckConfigsRequest(bytes);
  assert.equal(decoded.limits.review, 120); assert.equal(decoded.limits.new, 30); assert.equal(decoded.limits.reviewToday, 25); assert.equal(decoded.limits.newToday, null); assert.equal(decoded.limits.reviewTodayActive, false); assert.equal(decoded.limits.newTodayActive, true); assert.ok(Math.abs(decoded.limits.desiredRetention - 0.85) < 0.00001);
  assert.equal(decoded.newCardsIgnoreReviewLimit, true);
  assert.equal(decoded.fsrs, true);
  assert.equal(decoded.applyAllParentLimits, true);
  assert.equal(decoded.fsrsReschedule, true);
  assert.equal(decoded.fsrsHealthCheck, true);
});

test('invalid deck limits are atomic and identify their own fields', async () => {
  const { 牌组选项编辑 } = await import('../../entry/src/main/ets/model/牌组选项编辑.ets');
  const edit = 牌组选项编辑.从视图创建({ review: 10, new: null, reviewToday: null, newToday: null, reviewTodayActive: false, newTodayActive: false, desiredRetention: null }, false, false, false, false);
  edit.复习限额文本 = '-1'; edit.今日新卡文本 = '1.2'; edit.目标保留率覆盖文本 = '1.2';
  const before = JSON.stringify(edit.转换为请求字段());
  const issues = edit.校验();
  assert.deepEqual(issues.map((issue) => issue.字段键).sort(), ['desiredRetentionOverride', 'newToday', 'reviewLimit']);
  assert.equal(edit.应用(), false);
  assert.equal(JSON.stringify(edit.转换为请求字段()), before);
});

test('DeckConfig form enforces Anki 26.05 field bounds and FSRS array shapes atomically', async () => {
  const { 牌组配置表单 } = await import('../../entry/src/main/ets/model/牌组配置表单.ets');
  const { emptyDeckConfigSettings } = await import('../../entry/src/main/ets/proto/messages/DeckConfigMessages.ts');
  const settings = emptyDeckConfigSettings();
  const form = 牌组配置表单.从配置创建(settings);
  form.每日新卡数文本 = '10000'; form.设置数值字段('initialEase', '1.3'); form.设置数值字段('historicalRetention', '0.98');
  form.设置浮点数组字段('easyDaysPercentages', '1 1 1'); form.设置浮点数组字段('fsrsParams6', Array.from({ length: 20 }, () => '1').join(' '));
  const before = JSON.stringify(settings);
  const keys = form.校验().map((issue) => issue.字段键);
  for (const key of ['newPerDay', 'initialEase', 'historicalRetention', 'easyDaysPercentages', 'fsrsParams6']) assert.ok(keys.includes(key), key);
  assert.equal(form.应用到配置(settings), false);
  assert.equal(JSON.stringify(settings), before);
});

test('deck option controls bind editable limits and render adjacent field errors', () => {
  const panel = read('entry/src/main/ets/components/牌组选项面板.ets');
  const advanced = read('entry/src/main/ets/components/高级牌组选项面板.ets');
  // 牌组选项流已迁移：保存入口在 首页.ets（options.转换为请求字段()），开关控件在 高级牌组选项面板.ets
  const host = read('entry/src/main/ets/model/DeckOptionsDraft.ets');
  for (const key of ['reviewLimit', 'newLimit', 'reviewToday', 'newToday', 'desiredRetentionOverride', 'newCardsIgnoreReviewLimit', 'fsrs', 'applyAllParentLimits', 'fsrsReschedule', 'fsrsHealthCheck']) assert.match(`${panel}\n${advanced}\n${host}`, new RegExp(key));
  assert.match(panel, /private 字段错误资源\(key: string\)/);
  assert.match(panel, /this\.字段错误资源\(this\.fieldKey\(label\)\)/);
  assert.match(host, /options\.转换为请求字段\(\)/);
});
