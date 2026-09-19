// SPDX-License-Identifier: AGPL-3.0-or-later
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { copyDeckConfig, deckConfigUseCount, prepareDeckConfigForSave } from '../../entry/src/main/ets/model/DeckConfigSave.ts';
import { emptyDeckConfigSettings, encodeDeckConfig, encodeUpdateDeckConfigsRequest, decodeUpdateDeckConfigsRequest } from '../../entry/src/main/ets/proto/messages/DeckConfigMessages.ts';
import { 牌组配置表单 } from '../../entry/src/main/ets/model/牌组配置表单.ets';
import { 牌组选项编辑 } from '../../entry/src/main/ets/model/牌组选项编辑.ets';
import { 协议写入器 } from '../../entry/src/main/ets/proto/core/ProtoWriter.ts';

const read = path => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
function fixture(id = 1, useCount = 2) {
  const unknown = new 协议写入器();
  unknown.写入变长整数(200, 42);
  const original = copyDeckConfig({
    id, name: 'Shared', mtimeSecs: 123, usn: -1,
    config: { ...emptyDeckConfigSettings(), learnSteps: [1, 10], relearnSteps: [10],
      newPerDay: 20, reviewsPerDay: 200, initialEase: 2.5, easyMultiplier: 1.3,
      hardMultiplier: 1.2, intervalMultiplier: 1, maximumReviewInterval: 36500,
      minimumLapseInterval: 1, graduatingIntervalGood: 1, graduatingIntervalEasy: 4,
      leechThreshold: 8, capAnswerTimeToSecs: 60, desiredRetention: 0.9,
      fsrsParams6: Array(21).fill(0.5), other: new Uint8Array([8, 1]),
      preserved: [unknown.转为字节()] }
  });
  const limits = { review: 80, new: null, reviewToday: 12, newToday: null,
    reviewTodayActive: true, newTodayActive: false, desiredRetention: null };
  const view = { allConfigs: [{ config: original, useCount }],
    currentDeck: { name: 'Languages::English', configId: id, parentConfigIds: [id], limits },
    defaults: null, schemaModified: false, cardStateCustomizer: 'custom',
    newCardsIgnoreReviewLimit: true, fsrs: true, applyAllParentLimits: true, fsrsHealthCheck: true };
  return { original, view };
}

function saveHarness(id = 1, useCount = 2) {
  const { original, view } = fixture(id, useCount);
  const source = read('entry/src/main/ets/pages/首页.ets').replaceAll('\r\n', '\n');
  const start = source.indexOf('  private async 保存牌组选项(');
  const end = source.indexOf('\n  }', start) + 4;
  const dependencies = { copyDeckConfig, prepareDeckConfigForSave,
    UPDATE_DECK_CONFIGS_MODE_NORMAL: 0, notifyFsrsStateChanged: () => {} };
  const code = stripTypeScriptTypes(`class Harness { ${source.slice(start, end)} }`, { mode: 'transform' });
  const Harness = new Function(...Object.keys(dependencies), code + '\nreturn Harness;')(...Object.values(dependencies));
  const calls = [];
  const state = Object.assign(new Harness(), {
    编辑视图: view, 编辑配置: original, 牌组选项牌组ID: 10, 牌组选项中: false,
    牌组选项错误: '', 牌组选项校验消息: issue => issue.消息键,
    关闭牌组选项: () => { state.closed = true; }, 加载主页数据: async () => {},
    牌组配置服务实例: { 更新牌组配置: async request => {
      calls.push(decodeUpdateDeckConfigsRequest(encodeUpdateDeckConfigsRequest(request)));
      if (state.failSave) throw new Error('save failed');
    } }
  });
  const form = 牌组配置表单.从配置创建(original.config);
  const options = 牌组选项编辑.从视图创建(view.currentDeck.limits, true, true, true, true);
  options.sharedDeckCount = deckConfigUseCount(view, id);
  assert.deepEqual(form.校验(), []);
  return { state, original, view, form, options, calls };
}

test('editing a shared preset defaults to a new config bound only to the selected deck', async () => {
  const { state, original, form, options, calls } = saveHarness(42, 3);
  const before = encodeDeckConfig(original);
  form.每日新卡数文本 = '10';
  form.学习步骤文本 = '2 15';
  await state.保存牌组选项(form, options);
  const request = calls[0];
  assert.equal(request.targetDeckId, 10);
  assert.equal(request.mode, 0, 'must not apply to child decks');
  assert.deepEqual(request.removedConfigIds, []);
  assert.equal(request.configs.length, 1);
  const saved = request.configs[0];
  assert.equal(saved.id, 0, 'backend allocates and assigns the new preset in the same transaction');
  assert.equal(saved.name, 'Languages::English');
  assert.equal(saved.mtimeSecs, 0);
  assert.equal(saved.usn, 0);
  assert.equal(saved.config.newPerDay, 10);
  assert.deepEqual(saved.config.learnSteps, [2, 15]);
  assert.deepEqual(saved.config.fsrsParams6, original.config.fsrsParams6);
  assert.deepEqual(saved.config.other, original.config.other);
  assert.deepEqual(saved.config.preserved, original.config.preserved);
  assert.deepEqual(encodeDeckConfig(original), before, 'other decks retain the original preset unchanged');
  assert.deepEqual(request.limits, state.编辑视图.currentDeck.limits);
  for (const field of ['newCardsIgnoreReviewLimit', 'fsrs', 'applyAllParentLimits', 'fsrsHealthCheck']) assert.equal(request[field], true);
  assert.equal(request.cardStateCustomizer, 'custom');
  assert.equal(state.closed, true);
});

test('default preset is protected for future decks even with only one current user', async () => {
  const { state, form, options, calls } = saveHarness(1, 1);
  form.每日新卡数文本 = '9';
  await state.保存牌组选项(form, options);
  assert.equal(calls[0].configs[0].id, 0);
});

test('an existing independent preset is reused on subsequent edits', async () => {
  const { state, form, options, calls } = saveHarness(42, 1);
  form.每日复习数文本 = '100';
  await state.保存牌组选项(form, options);
  assert.equal(calls[0].configs[0].id, 42);
  assert.equal(calls[0].configs[0].config.reviewsPerDay, 100);
});

test('explicit shared editing updates the shared preset while limits stay deck-specific', async () => {
  const { state, form, options, calls } = saveHarness(42, 2);
  options.applyToSharedDecks = true;
  options.今日新卡文本 = '5';
  options.今日新卡启用 = true;
  form.每日新卡数文本 = '7';
  await state.保存牌组选项(form, options);
  assert.equal(calls[0].configs[0].id, 42);
  assert.equal(calls[0].configs[0].config.newPerDay, 7);
  assert.equal(calls[0].limits.newToday, 5);
  assert.equal(calls[0].targetDeckId, 10);
  assert.equal(calls[0].mode, 0);
  assert.equal(牌组选项编辑.从视图创建(null, false, false, false, false).applyToSharedDecks, false);
});

test('unchanged saves, reverted edits and deck-limit-only saves do not create presets', async () => {
  for (const edit of [() => {}, form => { form.每日新卡数文本 = '8'; form.每日新卡数文本 = '20'; },
    (_form, options) => { options.新卡限额文本 = '6'; }]) {
    const { state, form, options, calls } = saveHarness();
    edit(form, options);
    await state.保存牌组选项(form, options);
    assert.equal(calls[0].configs[0].id, 1);
  }
});

test('global-only edits keep the preset and send the explicit global choice', async () => {
  const { state, form, options, calls } = saveHarness();
  options.是否启用FSRS = false;
  await state.保存牌组选项(form, options);
  assert.equal(calls[0].configs[0].id, 1);
  assert.equal(calls[0].fsrs, false);
});

test('failed save preserves original data and retries with the same isolated request', async () => {
  const { state, original, form, options, calls } = saveHarness();
  const before = encodeDeckConfig(original);
  form.每日新卡数文本 = '9';
  state.failSave = true;
  await state.保存牌组选项(form, options);
  assert.equal(state.closed, undefined);
  assert.equal(state.牌组选项错误, 'save failed');
  assert.equal(state.牌组选项中, false);
  assert.deepEqual(encodeDeckConfig(original), before);
  state.failSave = false;
  await state.保存牌组选项(form, options);
  assert.deepEqual(calls[0], calls[1]);
  assert.equal(calls[1].configs[0].id, 0);
  assert.equal(state.closed, true);
});

test('invalid drafts never write or modify the original config', async () => {
  const { state, original, form, options, calls } = saveHarness();
  const before = encodeDeckConfig(original);
  form.学习步骤文本 = 'invalid';
  await state.保存牌组选项(form, options);
  assert.equal(calls.length, 0);
  assert.equal(state.closed, undefined);
  assert.deepEqual(encodeDeckConfig(original), before);
  assert.ok(state.牌组选项错误.length > 0);
});

test('editing or discarding drafts without saving leaves collection data untouched', () => {
  const { original, form, options, calls } = saveHarness();
  const before = encodeDeckConfig(original);
  form.每日新卡数文本 = '8';
  options.applyToSharedDecks = true;
  assert.equal(calls.length, 0);
  assert.deepEqual(encodeDeckConfig(original), before);
});

test('UI displays default scope, explicit shared count and a separate global group', () => {
  const home = read('entry/src/main/ets/pages/首页.ets');
  const panel = read('entry/src/main/ets/components/牌组选项面板.ets');
  const advanced = read('entry/src/main/ets/components/高级牌组选项面板.ets');
  assert.match(home, /sharedDeckCount = deckConfigUseCount\(view, config.id\)/);
  assert.match(panel, /options.applyToSharedDecks \? \$r\('app.string.deck_save_scope_shared', this.options.sharedDeckCount\)/);
  assert.match(advanced, /if \(this.options.sharedDeckCount > 1\)/);
  const start = advanced.indexOf('if (this.globalExpanded)');
  const end = advanced.indexOf("app.string.deck_group_advanced'", start);
  const globals = advanced.slice(start, end);
  for (const key of ['fsrsEnabled', 'fsrsHealthCheck', 'newCardsIgnoreReviewLimit', 'applyAllParentLimits']) {
    assert.ok(globals.includes(`deck_${key}_label`));
    assert.equal(advanced.split(`deck_${key}_label`).length - 1, 1);
  }
});
