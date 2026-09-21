// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { homeDataHarness } from './home-data-harness.mjs';
test('home repository uses persisted graph range and widget preferences, localizes default deck and retains snapshot', async () => {
  const { repository, state } = homeDataHarness();
  const result = await repository.load('/collection', '默认牌组');
  assert.deepEqual(state.calls.slice(0, 4), ['open', 'fsrs', 'tree', ['graphs', 0]]);
  assert.deepEqual(state.calls[4], ['widget', state.graph, 9, 1, 2, true]);
  assert.equal(result.graphs, state.graph); assert.equal(result.days, 0);
  assert.equal(result.snapshot.graph, state.graph); assert.equal(result.snapshot.decks[0].name, '默认牌组');
  assert.deepEqual(result.hiddenIds, ['hidden']); assert.equal(result.cardData.今日完成数, 9);
});
test('graph and widget persistence failures leave home deck loading available', async () => {
  const { repository, state } = homeDataHarness();
  state.failGraphs = true; let result = await repository.load('/', 'Default');
  assert.equal(result.graphs, null); assert.equal(result.cardData, null); assert.equal(result.snapshot.decks.length, 1);
  assert.equal(state.calls.includes('save'), false);
  state.failGraphs = false; state.failSave = true; result = await repository.load('/', 'Default');
  assert.equal(result.graphs, state.graph); assert.equal(result.cardData.今日完成数, 9);
});
