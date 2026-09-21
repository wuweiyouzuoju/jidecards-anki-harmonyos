import { StudyOptions } from '../../entry/src/main/ets/model/StudyTiming.ts';
// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { UNBURY_MODE_ALL } from '../../entry/src/main/ets/proto/messages/SchedulerMessages.ts';

// 唯一替身是平台动态库；误触真实 RPC 必须失败，领域适配器直接导入执行。
const native = 'data:text/javascript,' + encodeURIComponent(
  'export function openBackend(){throw Error("Unexpected native call")} export const closeBackend=openBackend; export const runMethodRaw=openBackend;');
const hook = `export function resolve(s,c,n){if(s==='libjidecards.so')return {url:${JSON.stringify(native)},shortCircuit:true};return n(s,c)}`;
register('data:text/javascript,' + encodeURIComponent(hook), import.meta.url);
const { AnkiStudySessionBackend: Backend } = await import('../../entry/src/main/ets/backend/StudySessionBackend.ts');

test('autoplay uses the card deck, or its original deck for filtered cards, and refreshes changed preferences', async () => {
  for (const originalDeckId of [0, 7]) {
    const backend = new Backend(), requested = [];
    let disabled = true;
    backend.cards = { 获取卡片: async id => { assert.equal(id, 42); return { deckId: 8, originalDeckId }; } };
    backend.deckConfigs = { 获取牌组配置编辑视图: async id => {
      requested.push(id);
      return { currentDeck: { configId: 2 }, allConfigs: [
        { config: { id: 1, config: { disableAutoplay: false } } },
        { config: { id: 2, config: { disableAutoplay: disabled, showTimer: true, stopTimerOnAnswer: true,
          capAnswerTimeToSecs: 45, secondsToShowQuestion: 2.5, secondsToShowAnswer: 3, waitForAudio: true,
          skipQuestionWhenReplayingAnswer: true, questionAction: 1, answerAction: 3 } } }
      ] };
    } };
    assert.equal((await backend.studyOptions(42)).autoplay, false);
    disabled = false;
    assert.equal((await backend.studyOptions(42)).autoplay, true);
    assert.deepEqual(requested, [originalDeckId || 8, originalDeckId || 8]);
    assert.deepEqual(await backend.studyOptions(42), Object.assign(new StudyOptions(), {
      autoplay: true, showTimer: true, stopTimerOnAnswer: true, capAnswerTimeToSecs: 45,
      secondsToShowQuestion: 2.5, secondsToShowAnswer: 3, waitForAudio: true,
      skipQuestionWhenReplayingAnswer: true, questionAction: 1, answerAction: 3
    }));
  }
});

test('missing or unreadable deck preferences propagate failure instead of allowing unexpected audio', async () => {
  const backend = new Backend();
  backend.cards = { 获取卡片: async () => ({ deckId: 8, originalDeckId: 0 }) };
  backend.deckConfigs = { 获取牌组配置编辑视图: async () => ({ currentDeck: null, allConfigs: [] }) };
  await assert.rejects(backend.studyOptions(42), /configuration unavailable/);
  backend.deckConfigs.获取牌组配置编辑视图 = async () => { throw new Error('offline backend'); };
  await assert.rejects(backend.studyOptions(42), /offline backend/);
});

test('study mutation adapter retains note undo, single-card deletion and deck-scoped unbury semantics', async () => {
  const calls = [], scheduler = {
    埋藏或暂停卡片: async (...args) => calls.push(['bury', ...args]),
    按牌组恢复埋藏: async (...args) => calls.push(['unbury', ...args])
  };
  const backend = new Backend(scheduler, {}, {});
  backend.cards = { 删除卡片: async ids => calls.push(['delete', ids]) };
  backend.notes = { 更新笔记: async (notes, skipUndo) => calls.push(['edit', notes, skipUndo]) };
  const note = { id: 8, fields: ['edited'] };
  await backend.updateNote(note); await backend.buryCard(9, 2); await backend.removeCard(10); await backend.unburyDeck(11);
  assert.deepEqual(calls, [['edit', [note], false], ['bury', 9, 2], ['delete', [10]], ['unbury', 11, UNBURY_MODE_ALL]]);
});
