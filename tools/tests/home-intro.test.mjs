// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';

const source = readFileSync(new URL('../../entry/src/main/ets/utils/HomeIntroStore.ets', import.meta.url), 'utf8');
function storeHarness() {
  const values = new Map([['welcome_shown', '2.7.0']]);
  const state = { fail: false };
  const store = {
    getSync: (key, fallback) => values.get(key) ?? fallback,
    putSync: (key, value) => values.set(key, value),
    flush: async () => { if (state.fail) throw new Error('disk full'); }
  };
  const body = source.slice(source.indexOf('const INTRO_KEY')).replaceAll('export ', '');
  const api = new Function('AppStorage', 'preferences', stripTypeScriptTypes(body, { mode: 'transform' }) +
    ';return { isHomeIntroCompleted, completeHomeIntro };')({ get: () => ({}) }, { getPreferencesSync: () => store });
  return { api, state, values };
}

test('new installs and existing welcome versions receive the introduction once after confirmation', async () => {
  const { api, values } = storeHarness();
  assert.equal(await api.isHomeIntroCompleted(), false);
  assert.equal(values.get('welcome_shown'), '2.7.0');
  await api.completeHomeIntro();
  assert.equal(await api.isHomeIntroCompleted(), true);
});

test('failed persistence rolls back the in-memory marker so the introduction is retried', async () => {
  const { api, state } = storeHarness();
  state.fail = true;
  await assert.rejects(api.completeHomeIntro());
  assert.equal(await api.isHomeIntroCompleted(), false);
  state.fail = false;
  await api.completeHomeIntro();
  assert.equal(await api.isHomeIntroCompleted(), true);
});
