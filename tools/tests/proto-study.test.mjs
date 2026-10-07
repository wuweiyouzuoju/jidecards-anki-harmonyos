// SPDX-License-Identifier: AGPL-3.0-or-later

// scheduler / card_rendering 消息编解码字节级测试（Anki 26.05）。
import assert from 'node:assert/strict';
import test from 'node:test';

import { 协议写入器 } from '../../entry/src/main/ets/proto/core/ProtoWriter.ts';
import {
  decodeQueuedCards,
  decodeSchedTimingToday,
  decodeSchedulingStates,
  decodeStringList,
  encodeCardAnswer,
  encodeCardId,
  encodeGetQueuedCardsRequest,
  encodeSchedulingStates,
  QUEUE_REVIEW,
  RATING_GOOD
} from '../../entry/src/main/ets/proto/messages/SchedulerMessages.ts';
import {
  decodeRenderCardResponse,
  encodeRenderExistingCardRequest
} from '../../entry/src/main/ets/proto/messages/CardRenderingMessages.ts';

function hex(bytes) {
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join(' ');
}

test('GetQueuedCardsRequest encodes fetch limit and intraday flag', () => {
  assert.equal(hex(encodeGetQueuedCardsRequest(50, true)), '08 32 10 01');
  assert.equal(hex(encodeGetQueuedCardsRequest(0, false)), '');
});

test('SchedulingStates keeps five raw state blobs for opaque round-trip', () => {
  const w = new 协议写入器();
  w.写入字节(1, new Uint8Array([0x0a, 0x01])); // current
  w.写入字节(2, new Uint8Array([0x0b, 0x02])); // again
  w.写入字节(3, new Uint8Array([0x0c, 0x03])); // hard
  w.写入字节(4, new Uint8Array([0x0d, 0x04])); // good
  w.写入字节(5, new Uint8Array([0x0e, 0x05])); // easy

  const states = decodeSchedulingStates(w.转为字节());
  assert.deepEqual([...states.current], [0x0a, 0x01]);
  assert.deepEqual([...states.easy], [0x0e, 0x05]);

  // 原样回写后字节完全一致：作答/DescribeNextStates 的保真通道
  assert.equal(hex(encodeSchedulingStates(states)), hex(w.转为字节()));
});

test('QueuedCards decodes nested card summary, queue and states', () => {
  const cardMsg = new 协议写入器();
  cardMsg.写入64位整数(1, 100); // id
  cardMsg.写入64位整数(2, 200); // note_id
  cardMsg.写入64位整数(3, 300); // deck_id
  cardMsg.写入变长整数(4, 2); // template_idx（card_ord）
  cardMsg.写入变长整数(12, 9); // reps：学习链路不需要，应被跳过
  cardMsg.写入字符串(19, '{"c":1}');

  const statesMsg = new 协议写入器();
  statesMsg.写入字节(4, new Uint8Array([0x21])); // good

  const queued = new 协议写入器();
  queued.写入子消息(1, cardMsg);
  queued.写入变长整数(2, QUEUE_REVIEW);
  queued.写入子消息(3, statesMsg);
  const context = new 协议写入器();
  context.写入字符串(1, '英语');
  queued.写入子消息(4, context); // preserve the complete context without uint64 seed rounding

  const resp = new 协议写入器();
  resp.写入子消息(1, queued);
  resp.写入变长整数(2, 7); // new_count
  resp.写入变长整数(3, 3); // learning_count
  resp.写入变长整数(4, 11); // review_count

  const view = decodeQueuedCards(resp.转为字节());
  assert.equal(view.cards.length, 1);
  assert.equal(view.cards[0].cardId, 100);
  assert.equal(view.cards[0].noteId, 200);
  assert.equal(view.cards[0].deckId, 300);
  assert.equal(view.cards[0].templateIdx, 2);
  assert.equal(view.cards[0].queue, QUEUE_REVIEW);
  assert.deepEqual([...view.cards[0].states.good], [0x21]);
  assert.deepEqual(view.cards[0].schedulingContext, context.转为字节());
  assert.equal(view.cards[0].customData, '{"c":1}');
  assert.equal(view.newCount, 7);
  assert.equal(view.learningCount, 3);
  assert.equal(view.reviewCount, 11);
});

test('CardAnswer encodes all six fields in proto order', () => {
  const bytes = encodeCardAnswer({
    cardId: 123,
    currentState: new Uint8Array([0xaa]),
    newState: new Uint8Array([0xbb, 0xcc]),
    rating: RATING_GOOD,
    answeredAtMillis: 1000,
    millisecondsTaken: 500
  });
  assert.equal(
    hex(bytes),
    '08 7b 12 01 aa 1a 02 bb cc 20 02 28 e8 07 30 f4 03'
  );
});

test('CardAnswer omits AGAIN rating and empty states (proto3 defaults)', () => {
  const bytes = encodeCardAnswer({
    cardId: 1,
    currentState: new Uint8Array(0),
    newState: new Uint8Array(0),
    rating: 0, // AGAIN
    answeredAtMillis: 0,
    millisecondsTaken: 0
  });
  assert.equal(hex(bytes), '08 01');
});

test('CardId encodes cid field', () => {
  assert.equal(hex(encodeCardId(1752902400123)), hex((() => {
    const w = new 协议写入器();
    w.写入64位整数(1, 1752902400123);
    return w.转为字节();
  })()));
});

test('SchedTimingToday decodes days_elapsed and next_day_at', () => {
  const w = new 协议写入器();
  w.写入变长整数(1, 5432);
  w.写入64位整数(2, 1752998400);
  const timing = decodeSchedTimingToday(w.转为字节());
  assert.equal(timing.daysElapsed, 5432);
  assert.equal(timing.nextDayAt, 1752998400);
});

test('StringList decodes repeated vals (DescribeNextStates output)', () => {
  const w = new 协议写入器();
  w.写入字符串(1, '1分钟');
  w.写入字符串(1, '10分钟');
  w.写入字符串(1, '4天');
  assert.deepEqual(decodeStringList(w.转为字节()), ['1分钟', '10分钟', '4天']);
});

test('RenderExistingCardRequest requests deferred FrontSide completion', () => {
  assert.equal(hex(encodeRenderExistingCardRequest(42)), '08 2a 18 01');
});

test('RenderCardResponse decodes mixed text/replacement nodes and flags', () => {
  const textNode = new 协议写入器();
  textNode.写入字符串(1, '问题：');

  const replMsg = new 协议写入器();
  replMsg.写入字符串(1, 'Front');
  replMsg.写入字符串(2, '世界');
  replMsg.写入字符串(3, 'cloze:Front');
  replMsg.写入字符串(3, 'hint');
  const replNode = new 协议写入器();
  replNode.写入子消息(2, replMsg);

  const resp = new 协议写入器();
  resp.写入子消息(1, textNode);
  resp.写入子消息(1, replNode);
  resp.写入子消息(2, textNode); // answer 侧复用同一节点即可验证解码
  resp.写入字符串(3, '.card { font-size: 20px; }');
  resp.写入布尔(4, true);
  resp.写入布尔(5, false);

  const rendered = decodeRenderCardResponse(resp.转为字节());
  assert.equal(rendered.questionNodes.length, 2);
  assert.equal(rendered.questionNodes[0].text, '问题：');
  assert.equal(rendered.questionNodes[0].replacement, null);
  assert.equal(rendered.questionNodes[1].text, null);
  assert.equal(rendered.questionNodes[1].replacement.fieldName, 'Front');
  assert.equal(rendered.questionNodes[1].replacement.currentText, '世界');
  assert.deepEqual(rendered.questionNodes[1].replacement.filters, ['cloze:Front', 'hint']);
  assert.equal(rendered.answerNodes.length, 1);
  assert.equal(rendered.css, '.card { font-size: 20px; }');
  assert.equal(rendered.latexSvg, true);
  assert.equal(rendered.isEmpty, false);
});
