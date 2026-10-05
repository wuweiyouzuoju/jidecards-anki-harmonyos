// SPDX-License-Identifier: AGPL-3.0-or-later

import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';
import { 牌组配置方法, 服务号 } from '../../entry/src/main/ets/backend/服务索引.ts';

function read(path) { return readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8'); }
const PANEL = 'entry/src/main/ets/components/牌组选项面板.ets';
const PANE = 'entry/src/main/ets/components/牌组详情面板.ets';

test('deck config methods match Anki 26.05 backend service', () => {
  assert.equal(服务号.后端牌组配置, 11);
  assert.equal(牌组配置方法.获取牌组配置编辑视图, 6);
  assert.equal(牌组配置方法.更新牌组配置, 7);
});

test('deck options remain presentation-only with mode-specific content and a shared catalog', () => {
  assert.equal(existsSync(new URL(`../../${PANEL}`, import.meta.url)), true);
  const panel = read(PANEL);
  const full = read('entry/src/main/ets/components/高级牌组选项面板.ets');
  assert.match(panel, /牌组配置表单/);
  assert.match(panel, /字段帮助面板/);
  assert.match(panel, /高级牌组选项面板/);
  assert.match(full, /DECK_OPTION_GROUPS/);
  assert.match(full, /visibleDeckOptionFields/);
  assert.match(full, /DeckOptionField\(\{/);
  assert.doesNotMatch(panel + full, /后端会话|牌组配置服务|libjidecards\.so/);
  // Group order, exact field visibility, enum values, resources and actual field callbacks execute in deck-options-parity.
});

test('every editable Anki DeckConfig field has a form or panel binding', () => {
  const panel = read(PANEL); const advanced = read('entry/src/main/ets/components/高级牌组选项面板.ets'); const form = read('entry/src/main/ets/model/牌组配置表单.ets');
  const editable = ['learnSteps', 'relearnSteps', 'fsrsParams4', 'easyDaysPercentages', 'fsrsParams5', 'fsrsParams6', 'newPerDay', 'reviewsPerDay', 'initialEase', 'easyMultiplier', 'hardMultiplier', 'lapseMultiplier', 'intervalMultiplier', 'maximumReviewInterval', 'minimumLapseInterval', 'graduatingIntervalGood', 'graduatingIntervalEasy', 'newCardInsertOrder', 'newCardGatherPriority', 'newCardSortOrder', 'newMix', 'reviewOrder', 'interdayLearningMix', 'leechAction', 'leechThreshold', 'disableAutoplay', 'capAnswerTimeToSecs', 'showTimer', 'stopTimerOnAnswer', 'secondsToShowQuestion', 'secondsToShowAnswer', 'questionAction', 'answerAction', 'waitForAudio', 'skipQuestionWhenReplayingAnswer', 'buryNew', 'buryReviews', 'buryInterdayLearning', 'desiredRetention', 'historicalRetention', 'paramSearch', 'ignoreRevlogsBeforeDate'];
  for (const key of editable) assert.match(`${panel}\n${advanced}\n${form}`, new RegExp(key), key);
  assert.match(form, /other.*preserved/, 'opaque Anki bytes remain preserved, not edited as text');
});

test('home mounts the deck feature without owning editable drafts or persistence', () => {
  const home=read('entry/src/main/ets/pages/首页.ets');
  assert.match(home,/DeckOptionsFeature\(\{/);
  assert.doesNotMatch(home,/编辑表单|编辑视图|牌组配置服务实例/);
  const feature=read('entry/src/main/ets/components/home/DeckOptionsFeature.ets');
  assert.match(feature,/prepareDeckOptionsDraft/);
  assert.match(feature,/DeckOptionsSession/);
  // Validation, shared presets, preserved bytes, retries and lifecycle execute in deck-config-save/deck-options-session.
});
