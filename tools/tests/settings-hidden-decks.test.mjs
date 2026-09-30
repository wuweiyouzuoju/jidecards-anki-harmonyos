// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { activeHiddenDeckIds } from '../../entry/src/main/ets/model/HiddenDecks.ts';

test('two existing hidden decks count as two despite four saved IDs', () => {
  const saved = ['10', '20', 'deleted', 'old-collection'];
  assert.deepEqual(activeHiddenDeckIds(saved, ['1', '10', '20', '30']), ['10', '20']);
  assert.deepEqual(saved, ['10', '20', 'deleted', 'old-collection']);
});

test('hidden IDs are unique, preserve string precision and return after deletion undo', () => {
  const saved = ['', '9007199254740993', '9007199254740993', '20'];
  assert.deepEqual(activeHiddenDeckIds(saved, ['9007199254740993']), ['9007199254740993']);
  assert.deepEqual(activeHiddenDeckIds(saved, ['9007199254740993', '20']), ['9007199254740993', '20']);
  assert.deepEqual(activeHiddenDeckIds(saved, []), []);
  assert.deepEqual(activeHiddenDeckIds([], ['1']), []);
});

test('hiding a parent counts the explicitly hidden deck without counting its children', () => {
  assert.deepEqual(activeHiddenDeckIds(['parent'], ['parent', 'child-a', 'child-b']), ['parent']);
});
