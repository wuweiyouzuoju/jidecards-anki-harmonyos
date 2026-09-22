// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadUiFeedback } from './ui-feedback-harness.mjs';

test('UI resource lookup retains formatting arguments and dynamic resource names', () => {
  const api = loadUiFeedback();
  const calls = [];
  const context = { getHostContext: () => ({ resourceManager: {
    getStringSync: (id, ...args) => { calls.push([id, ...args]); return args.join(' / '); },
    getStringByNameSync: name => { calls.push(name); return 'Theme'; }
  } }) };
  assert.equal(api.resourceText(context, { id: 7 }, 'Parent', 'Child'), 'Parent / Child');
  assert.equal(api.resourceText(context, { id: 8 }, 12, 'cards'), '12 / cards');
  assert.equal(api.namedResourceText(context, 'theme_color_aurora'), 'Theme');
  assert.deepEqual(calls, [[7, 'Parent', 'Child'], [8, 12, 'cards'], 'theme_color_aurora']);
});

test('unavailable resources produce an explicit marker and log, including a missing host', () => {
  const logs = [];
  const api = loadUiFeedback({ error: (...args) => logs.push(args), warn() {} });
  for (const context of [{ getHostContext: () => undefined }, { getHostContext: () => ({
    resourceManager: { getStringSync() { throw Error('missing'); }, getStringByNameSync() { throw Error('missing'); } }
  }) }]) {
    assert.equal(api.resourceText(context, { id: 9, params: ['app.string.missing'] }), '[app.string.missing]');
    assert.equal(api.resourceText(context, { id: 9 }), '[9]');
    assert.equal(api.namedResourceText(context, 'missing'), '[missing]');
  }
  assert.equal(logs.length, 6);
});

test('a toast failure cannot turn a completed write into an operation failure', async () => {
  let written = false, failed = false;
  const logs = [];
  const api = loadUiFeedback({ error() {}, warn: (...args) => logs.push(args) });
  try {
    await Promise.resolve(); written = true;
    api.showToastSafely({ getPromptAction: () => ({ showToast() { throw Error('detached window'); } }) }, { message: 'done' });
  } catch { failed = true; }
  assert.equal(written, true);
  assert.equal(failed, false);
  assert.equal(logs.length, 1);
  const options = { message: 'done', duration: 1000 };
  api.showToastSafely({ getPromptAction: () => ({ showToast: actual => assert.equal(actual, options) }) }, options);
});
