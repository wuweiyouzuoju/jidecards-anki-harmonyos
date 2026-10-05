// SPDX-License-Identifier: AGPL-3.0-or-later

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  decodeDeckConfig,
  encodeDeckConfig
} from '../../entry/src/main/ets/proto/messages/DeckConfigMessages.ts';
import { 协议写入器 } from '../../entry/src/main/ets/proto/core/ProtoWriter.ts';

function completeSettings() {
  return {
    learnSteps: [1, 10], relearnSteps: [10], fsrsParams4: [0.1], easyDaysPercentages: [0.2],
    fsrsParams5: [0.3], fsrsParams6: [0.4], newPerDay: 20, reviewsPerDay: 200,
    initialEase: 2.5, easyMultiplier: 1.3, hardMultiplier: 1.2, lapseMultiplier: 0,
    intervalMultiplier: 1, maximumReviewInterval: 36500, minimumLapseInterval: 1,
    graduatingIntervalGood: 1, graduatingIntervalEasy: 4, newCardInsertOrder: 1,
    leechAction: 1, leechThreshold: 8, disableAutoplay: true, capAnswerTimeToSecs: 60,
    showTimer: true, skipQuestionWhenReplayingAnswer: true, buryNew: true, buryReviews: true,
    buryInterdayLearning: true, newMix: 2, interdayLearningMix: 1, newCardSortOrder: 4,
    reviewOrder: 7, newCardGatherPriority: 5, newPerDayMinimum: 1, questionAction: 1,
    desiredRetention: 0.9, stopTimerOnAnswer: true, historicalRetention: 0.88,
    secondsToShowQuestion: 4, secondsToShowAnswer: 5, answerAction: 2, waitForAudio: true,
    paramSearch: 'deck:English', ignoreRevlogsBeforeDate: '2025-01-01', other: new Uint8Array([1, 2]),
    preserved: []
  };
}

function assertEverySetting(actual, expected) {
  const fields = [
    'learnSteps', 'relearnSteps', 'fsrsParams4', 'easyDaysPercentages', 'fsrsParams5', 'fsrsParams6',
    'newPerDay', 'reviewsPerDay', 'initialEase', 'easyMultiplier', 'hardMultiplier', 'lapseMultiplier',
    'intervalMultiplier', 'maximumReviewInterval', 'minimumLapseInterval', 'graduatingIntervalGood',
    'graduatingIntervalEasy', 'newCardInsertOrder', 'leechAction', 'leechThreshold', 'disableAutoplay',
    'capAnswerTimeToSecs', 'showTimer', 'skipQuestionWhenReplayingAnswer', 'buryNew', 'buryReviews',
    'buryInterdayLearning', 'newMix', 'interdayLearningMix', 'newCardSortOrder', 'reviewOrder',
    'newCardGatherPriority', 'newPerDayMinimum', 'questionAction', 'desiredRetention', 'stopTimerOnAnswer',
    'historicalRetention', 'secondsToShowQuestion', 'secondsToShowAnswer', 'answerAction', 'waitForAudio',
    'paramSearch', 'ignoreRevlogsBeforeDate', 'other'
  ];
  assert.equal(fields.length, 44, 'fields 1-46 excluding reserved 7,8,39');
  for (const field of fields) {
    const current = actual[field]; const wanted = expected[field];
    if (current instanceof Uint8Array) assert.deepEqual(current, wanted, field);
    else if (Array.isArray(current)) {
      assert.equal(current.length, wanted.length, field);
      current.forEach((value, index) => assert.ok(Math.abs(value - wanted[index]) < 0.00001, `${field}[${index}]`));
    } else if (typeof current === 'number' && !Number.isInteger(wanted)) assert.ok(Math.abs(current - wanted) < 0.00001, field);
    else assert.equal(current, wanted, field);
  }
}

test('DeckConfig.Config round-trips every public field and unknown chunks', () => {
  const unknown = new 协议写入器();
  unknown.写入变长整数(200, 42);
  const deck = { id: 1, name: 'Default', mtimeSecs: 2, usn: 3, config: completeSettings() };
  deck.config.preserved.push(unknown.转为字节());
  const decoded = decodeDeckConfig(encodeDeckConfig(deck));
  assertEverySetting(decoded.config, completeSettings());
  assert.deepEqual(decoded.config.learnSteps, [1, 10]);
  assert.deepEqual(decoded.config.relearnSteps, [10]);
  assert.equal(decoded.config.maximumReviewInterval, 36500);
  assert.equal(decoded.config.reviewOrder, 7);
  assert.equal(decoded.config.stopTimerOnAnswer, true);
  assert.ok(Math.abs(decoded.config.desiredRetention - 0.9) < 0.00001);
  assert.equal(decoded.config.answerAction, 2);
  assert.equal(decoded.config.ignoreRevlogsBeforeDate, '2025-01-01');
  assert.deepEqual(decoded.config.other, new Uint8Array([1, 2]));
  assert.ok(decoded.config.preserved.some((chunk) => chunk.length > 0));
  assert.deepEqual(decodeDeckConfig(encodeDeckConfig(decoded)).config, decoded.config);
});

test('DeckConfig form rejects invalid values without partially changing settings', async () => {
  const { 牌组配置表单 } = await import('../../entry/src/main/ets/model/牌组配置表单.ets');
  const settings = completeSettings();
  const form = 牌组配置表单.从配置创建(settings);
  form.学习步骤文本 = '1 zero';
  form.目标保留率文本 = '1.1';
  const before = JSON.stringify(settings);
  assert.ok(form.校验().length > 0);
  assert.equal(form.应用到配置(settings), false);
  assert.equal(JSON.stringify(settings), before);
});

test('DeckConfig form retains invalid raw numeric and fractional enum edits for validation', async () => {
  const { 牌组配置表单 } = await import('../../entry/src/main/ets/model/牌组配置表单.ets');
  const settings = completeSettings(); const form = 牌组配置表单.从配置创建(settings);
  form.设置数值字段('maximumReviewInterval', 'not-a-number');
  form.设置数值字段('reviewOrder', '1.5');
  assert.equal(form.取字段文本值('maximumReviewInterval'), 'not-a-number');
  assert.ok(form.校验().some((issue) => issue.字段键 === 'maximumReviewInterval'));
  assert.ok(form.校验().some((issue) => issue.字段键 === 'reviewOrder'));
  assert.equal(form.应用到配置(settings), false);
});

test('DeckConfig form retains invalid float-array input until it can be corrected', async () => {
  const { 牌组配置表单 } = await import('../../entry/src/main/ets/model/牌组配置表单.ets');
  const settings = completeSettings(); const form = 牌组配置表单.从配置创建(settings);
  form.设置浮点数组字段('fsrsParams6', '0.4 invalid 2');
  assert.equal(form.取浮点数组文本('fsrsParams6'), '0.4 invalid 2');
  assert.ok(form.校验().some((issue) => issue.字段键 === 'fsrsParams6'));
  assert.equal(form.应用到配置(settings), false);
});

test('simple mode keeps four fields while full mode mounts the official catalog', () => {
  const panel = readFileSync(new URL('../../entry/src/main/ets/components/牌组选项面板.ets', import.meta.url), 'utf8');
  const full = readFileSync(new URL('../../entry/src/main/ets/components/高级牌组选项面板.ets', import.meta.url), 'utf8');
  assert.match(panel, /if \(this\.简洁模式\) \{\s*this\.commonOptions\(\)\s*\} else \{\s*this\.experimentalOptions\(\)/);
  assert.match(panel, /高级牌组选项面板\(\{ form: this.form, options: this.options/);
  assert.match(full, /ForEach\(DECK_OPTION_GROUPS/);
  assert.match(full, /this\.fields\(group\)/);
  assert.match(full, /DeckOptionField\(\{/);
  assert.doesNotMatch(full, /DialogBackdrop|DialogHeader|更新牌组配置/);
});
