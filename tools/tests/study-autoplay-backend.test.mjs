import { StudyOptions } from '../../entry/src/main/ets/model/StudyTiming.ts';
// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';

const source = readFileSync(new URL('../../entry/src/main/ets/backend/StudySessionBackend.ts', import.meta.url), 'utf8');
const start = source.indexOf('  async studyOptions(');
assert.ok(start >= 0);
const method = source.slice(start, source.indexOf('\n  }', start) + 4);
const Backend = new Function('StudyOptions', stripTypeScriptTypes(`class Backend { ${method} }`, { mode: 'transform' }) + '; return Backend;')(StudyOptions);

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
