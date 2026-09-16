// SPDX-License-Identifier: AGPL-3.0-or-later

// proto/messages 新增消息字节级测试：Collection/Scheduler/DeckConfig/Stats（Anki 26.05）
import assert from 'node:assert/strict';
import test from 'node:test';

import { 协议写入器 } from '../../entry/src/main/ets/proto/core/ProtoWriter.ts';
import {
  decodeCheckDatabaseResponse,
  decodeOpChanges,
  decodeOpChangesAfterUndo,
  decodeUndoStatus
} from '../../entry/src/main/ets/proto/messages/CollectionMessages.ts';
import {
  BURY_SUSPEND_MODE_BURY_SCHED,
  decodeCongratsInfo,
  encodeBuryOrSuspendCardsRequest,
  encodeCardIds,
  encodeUnburyDeckRequest
} from '../../entry/src/main/ets/proto/messages/SchedulerMessages.ts';
import {
  decodeDeckConfig,
  decodeDeckConfigsForUpdate,
  decodeLimits,
  encodeDeckConfig,
  encodeDeckConfigId,
  encodeLimits,
  encodeUpdateDeckConfigsRequest
} from '../../entry/src/main/ets/proto/messages/DeckConfigMessages.ts';
import { decodeGraphsResponse, encodeGraphsRequest } from '../../entry/src/main/ets/proto/messages/StatsMessages.ts';

function hex(bytes) {
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join(' ');
}

// ── Collection ──

test('UndoStatus decodes undo/redo/last_step', () => {
  const w = new 协议写入器();
  w.写入字符串(1, 'Add Card');
  w.写入字符串(2, '');
  w.写入变长整数(3, 7);
  const s = decodeUndoStatus(w.转为字节());
  assert.equal(s.undo, 'Add Card');
  assert.equal(s.redo, '');
  assert.equal(s.lastStep, 7);
});

test('OpChanges decodes all bool flags', () => {
  const w = new 协议写入器();
  w.写入布尔(1, true);   // card
  w.写入布尔(3, true);   // deck
  w.写入布尔(10, true);  // study_queues
  w.写入布尔(11, true);  // deck_config
  w.写入布尔(12, true);  // mtime
  const c = decodeOpChanges(w.转为字节());
  assert.equal(c.card, true);
  assert.equal(c.note, false);
  assert.equal(c.deck, true);
  assert.equal(c.studyQueues, true);
  assert.equal(c.deckConfig, true);
  assert.equal(c.mtime, true);
});

test('OpChangesAfterUndo decodes nested changes/status/counter', () => {
  const changes = new 协议写入器();
  changes.写入布尔(1, true); // card
  changes.写入布尔(10, true); // study_queues

  const status = new 协议写入器();
  status.写入字符串(1, '');
  status.写入字符串(2, 'Review Card');
  status.写入变长整数(3, 2);

  const w = new 协议写入器();
  w.写入子消息(1, changes);
  w.写入字符串(2, 'Add Card');
  w.写入64位整数(3, 1752902400);
  w.写入子消息(4, status);
  w.写入变长整数(5, 42);

  const o = decodeOpChangesAfterUndo(w.转为字节());
  assert.equal(o.changes.card, true);
  assert.equal(o.changes.studyQueues, true);
  assert.equal(o.operation, 'Add Card');
  assert.equal(o.revertedToTimestamp, 1752902400);
  assert.equal(o.newStatus.redo, 'Review Card');
  assert.equal(o.counter, 42);
});

test('CheckDatabaseResponse decodes repeated problems', () => {
  const w = new 协议写入器();
  w.写入字符串(1, 'missing note');
  w.写入字符串(1, 'orphan card');
  assert.deepEqual(decodeCheckDatabaseResponse(w.转为字节()), ['missing note', 'orphan card']);
  assert.deepEqual(decodeCheckDatabaseResponse(new Uint8Array(0)), []);
});

// ── Scheduler ──

test('CongratsInfo decodes all fields', () => {
  const w = new 协议写入器();
  w.写入变长整数(1, 5);      // learn_remaining
  w.写入变长整数(2, 3600);   // secs_until_next_learn
  w.写入布尔(3, true);     // review_remaining
  w.写入布尔(4, false);    // new_remaining
  w.写入布尔(5, true);     // have_sched_buried
  w.写入布尔(6, false);    // have_user_buried
  w.写入布尔(7, false);    // is_filtered_deck
  w.写入布尔(8, true);     // bridge_commands_supported
  w.写入字符串(9, 'desc'); // deck_description

  const c = decodeCongratsInfo(w.转为字节());
  assert.equal(c.learnRemaining, 5);
  assert.equal(c.secsUntilNextLearn, 3600);
  assert.equal(c.reviewRemaining, true);
  assert.equal(c.newRemaining, false);
  assert.equal(c.haveSchedBuried, true);
  assert.equal(c.haveUserBuried, false);
  assert.equal(c.isFilteredDeck, false);
  assert.equal(c.bridgeCommandsSupported, true);
  assert.equal(c.deckDescription, 'desc');
});

test('CardIds encodes packed repeated int64', () => {
  assert.equal(hex(encodeCardIds([1, 2, 3])), '0a 03 01 02 03');
  assert.equal(hex(encodeCardIds([])), '');
  assert.equal(hex(encodeCardIds([-1])), '0a 0a ff ff ff ff ff ff ff ff ff 01');
});

test('BuryOrSuspendCardsRequest encodes card_ids/note_ids/mode', () => {
  const bytes = encodeBuryOrSuspendCardsRequest([10, 20], [], BURY_SUSPEND_MODE_BURY_SCHED);
  const w = new 协议写入器();
  w.写入打包64位整数(1, [10, 20]);
  w.写入变长整数(3, BURY_SUSPEND_MODE_BURY_SCHED);
  assert.equal(hex(bytes), hex(w.转为字节()));

  const noteBytes = encodeBuryOrSuspendCardsRequest([], [30, 40], 0);
  const noteWriter = new 协议写入器();
  noteWriter.写入打包64位整数(2, [30, 40]);
  assert.equal(hex(noteBytes), hex(noteWriter.转为字节()));
});

test('UnburyDeckRequest encodes deck_id and mode', () => {
  const bytes = encodeUnburyDeckRequest(42, 1);
  const w = new 协议写入器();
  w.写入64位整数(1, 42);
  w.写入变长整数(2, 1);
  assert.equal(hex(bytes), hex(w.转为字节()));
});

// ── DeckConfig ──

test('DeckConfigId encodes dcid only', () => {
  assert.equal(hex(encodeDeckConfigId(7)), '08 07');
  assert.equal(hex(encodeDeckConfigId(0)), '');
});

test('DeckConfig roundtrips with settings preservation', () => {
  const legacy = new 协议写入器();
  legacy.写入变长整数(16, 36500);    // maximum_review_interval（未建模）
  legacy.写入浮点(11, 2.5);       // initial_ease（未建模）
  legacy.写入字节(255, new Uint8Array([0xab, 0xcd])); // other

  const settings = {
    learnSteps: [1, 10],
    newPerDay: 20,
    reviewsPerDay: 200,
    preserved: [legacy.转为字节()]
  };
  const config = {
    id: 1752902400123,
    name: '默认配置',
    mtimeSecs: 1752902400,
    usn: 0,
    config: settings
  };

  const encoded = encodeDeckConfig(config);
  const decoded = decodeDeckConfig(encoded);
  assert.equal(decoded.id, config.id);
  assert.equal(decoded.name, config.name);
  assert.deepEqual(decoded.config.learnSteps, [1, 10]);
  assert.equal(decoded.config.newPerDay, 20);
  assert.equal(decoded.config.reviewsPerDay, 200);
  // 未建模字段按块保留，再次编码后字节完全一致（update 回写不丢字段）
  assert.equal(decoded.config.maximumReviewInterval, 36500);
  assert.ok(Math.abs(decoded.config.initialEase - 2.5) < 1e-6);
  assert.deepEqual(decoded.config.other, new Uint8Array([0xab, 0xcd]));
  assert.equal(decoded.config.preserved.length, 0);
  assert.deepEqual(decodeDeckConfig(encodeDeckConfig(decoded)), decoded);
});

test('DeckConfig encoding omits defaults like prost', () => {
  // config 缺省（null）：全默认不产生任何字节
  const bare = encodeDeckConfig({ id: 0, name: '', mtimeSecs: 0, usn: 0, config: null });
  assert.equal(bare.length, 0);
  // config 存在但全默认：仅 field5 空消息（与 prost Some(默认) 一致）
  const withEmpty = encodeDeckConfig({
    id: 0,
    name: '',
    mtimeSecs: 0,
    usn: 0,
    config: { learnSteps: [], newPerDay: 0, reviewsPerDay: 0, preserved: [] }
  });
  assert.equal(hex(withEmpty), '2a 00');
});

test('Limits roundtrip with optional null defaults', () => {
  const limits = {
    review: 100,
    new: 20,
    reviewToday: null,
    newToday: null,
    reviewTodayActive: true,
    newTodayActive: false,
    desiredRetention: 0.85
  };
  const decoded = decodeLimits(encodeLimits(limits).转为字节());
  assert.equal(decoded.review, 100);
  assert.equal(decoded.new, 20);
  assert.equal(decoded.reviewToday, null);
  assert.equal(decoded.newToday, null);
  assert.equal(decoded.reviewTodayActive, true);
  assert.equal(decoded.newTodayActive, false);
  assert.ok(Math.abs(decoded.desiredRetention - 0.85) < 1e-6);
});

test('DeckConfigsForUpdate decodes nested structure', () => {
  const cfgW = new 协议写入器();
  cfgW.写入64位整数(1, 1);
  cfgW.写入字符串(2, '预设1');
  cfgW.写入变长整数(9, 10);

  const extraW = new 协议写入器();
  extraW.写入子消息(1, cfgW);
  extraW.写入变长整数(2, 3);

  const limitsW = new 协议写入器();
  limitsW.写入变长整数(1, 100);
  limitsW.写入变长整数(2, 20);

  const currentW = new 协议写入器();
  currentW.写入字符串(1, '英语');
  currentW.写入64位整数(2, 1);
  currentW.写入打包64位整数(3, [1]);
  currentW.写入子消息(4, limitsW);

  const topW = new 协议写入器();
  topW.写入子消息(1, extraW);
  topW.写入子消息(2, currentW);
  topW.写入布尔(4, true);

  const view = decodeDeckConfigsForUpdate(topW.转为字节());
  assert.equal(view.allConfigs.length, 1);
  assert.equal(view.allConfigs[0].config.name, '预设1');
  assert.equal(view.allConfigs[0].useCount, 3);
  assert.equal(view.currentDeck.name, '英语');
  assert.equal(view.currentDeck.configId, 1);
  assert.deepEqual(view.currentDeck.parentConfigIds, [1]);
  assert.equal(view.currentDeck.limits.review, 100);
  assert.equal(view.schemaModified, true);
});

test('UpdateDeckConfigsRequest encodes full input', () => {
  const config = {
    id: 1,
    name: '预设1',
    mtimeSecs: 0,
    usn: 0,
    config: { learnSteps: [1], newPerDay: 10, reviewsPerDay: 100, preserved: [] }
  };
  const bytes = encodeUpdateDeckConfigsRequest({
    targetDeckId: 42,
    configs: [config],
    removedConfigIds: [7],
    mode: 0,
    cardStateCustomizer: '',
    limits: null,
    newCardsIgnoreReviewLimit: false,
    fsrs: false,
    applyAllParentLimits: false,
    fsrsReschedule: false,
    fsrsHealthCheck: false
  });

  const w = new 协议写入器();
  w.写入64位整数(1, 42);
  w.写入字节(2, encodeDeckConfig(config));
  w.写入打包64位整数(3, [7]);
  assert.equal(hex(bytes), hex(w.转为字节()));
});

// ── Stats ──

test('GraphsResponse decodes today counts and retrievability', () => {
  const todayW = new 协议写入器();
  todayW.写入变长整数(1, 100); // answer_count
  todayW.写入变长整数(3, 80);  // correct_count
  todayW.写入变长整数(5, 60);  // mature_count
  todayW.写入变长整数(7, 40);  // review_count

  const retW = new 协议写入器();
  retW.写入浮点(2, 0.92);   // average
  retW.写入浮点(3, 12.5);   // sum_by_card
  retW.写入浮点(4, 10.0);   // sum_by_note

  const topW = new 协议写入器();
  topW.写入子消息(4, todayW);
  topW.写入子消息(12, retW);
  topW.写入布尔(13, true);   // fsrs

  const view = decodeGraphsResponse(topW.转为字节());
  assert.equal(view.today.answerCount, 100);
  assert.equal(view.today.correctCount, 80);
  assert.equal(view.today.matureCount, 60);
  assert.equal(view.today.reviewCount, 40);
  assert.ok(Math.abs(view.retrievability.average - 0.92) < 1e-6);
  assert.equal(view.fsrs, true);
});

test('GraphsRequest encodes days only, search stays empty', () => {
  assert.equal(hex(encodeGraphsRequest(0)), '');
  assert.equal(hex(encodeGraphsRequest(30)), '10 1e');
});

test('GraphsResponse decodes per-day review counts map and skips time map', () => {
  // map 条目：field1=key（距今天数），field2=Reviews 子消息
  const entry0 = new 协议写入器();
  entry0.写入变长整数(1, 0); // 今天
  const reviews0 = new 协议写入器();
  reviews0.写入变长整数(1, 2); // learn
  reviews0.写入变长整数(3, 3); // young
  entry0.写入子消息(2, reviews0);

  const entry3 = new 协议写入器();
  entry3.写入变长整数(1, 3); // 3 天前
  const reviews3 = new 协议写入器();
  reviews3.写入变长整数(2, 1); // relearn
  reviews3.写入变长整数(4, 5); // mature
  reviews3.写入变长整数(5, 1); // filtered
  entry3.写入子消息(2, reviews3);

  // time map（field2）首页不用，解码必须跳过而不串位
  const timeEntry = new 协议写入器();
  timeEntry.写入变长整数(1, 0);
  const timeReviews = new 协议写入器();
  timeReviews.写入变长整数(1, 999);
  timeEntry.写入子消息(2, timeReviews);

  const countsW = new 协议写入器();
  countsW.写入子消息(1, entry0);
  countsW.写入子消息(1, entry3);
  countsW.写入子消息(2, timeEntry);

  const topW = new 协议写入器();
  topW.写入子消息(9, countsW); // reviews

  const view = decodeGraphsResponse(topW.转为字节());
  assert.equal(view.reviewCountsByDaysAgo.size, 2);
  assert.deepEqual(view.reviewCountsByDaysAgo.get(0), {
    learn: 2, relearn: 0, young: 3, mature: 0, filtered: 0
  });
  assert.deepEqual(view.reviewCountsByDaysAgo.get(3), {
    learn: 0, relearn: 1, young: 0, mature: 5, filtered: 1
  });
});

test('GraphsResponse without reviews field yields null map', () => {
  const view = decodeGraphsResponse(new Uint8Array(0));
  assert.equal(view.reviewCountsByDaysAgo, null);
  assert.equal(view.today, null);
  assert.equal(view.retrievability, null);
  assert.equal(view.fsrs, false);
});
