// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { HomeStartupSequence } from '../../entry/src/main/ets/model/HomeStartupSequence.ts';

const source = readFileSync(new URL('../../entry/src/main/ets/utils/HomeIntroStore.ets', import.meta.url), 'utf8');
const panel = readFileSync(new URL('../../entry/src/main/ets/components/HomeIntroPanel.ets', import.meta.url), 'utf8');
const homePage = readFileSync(new URL('../../entry/src/main/ets/pages/首页.ets', import.meta.url), 'utf8');
function storeHarness(initial = [['welcome_shown', '2.7.0']]) {
  const values = new Map(initial);
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
  for (const initial of [[], [['welcome_shown', '2.7.0']]]) {
    const { api, values } = storeHarness(initial);
    assert.equal(await api.isHomeIntroCompleted(), false);
    assert.equal(values.get('welcome_shown'), initial[0]?.[1]);
    await api.completeHomeIntro();
    assert.equal(await api.isHomeIntroCompleted(), true);
  }
});

test('real startup sequence presents unread introduction and skips it only after persisted confirmation', async () => {
  const { api, values } = storeHarness([]);
  let shown = 0;
  const host = {
    canPresent: () => true, checkAnnouncement: async () => false, activateAnnouncementChecks() {},
    cloudCompleted: async () => true, introCompleted: api.isHomeIntroCompleted, giftCompleted: async () => true,
    showCloud: () => assert.fail('cloud already completed'), showIntro: () => { shown++; },
    showGift: () => assert.fail('gift already completed')
  };
  await new HomeStartupSequence().start(host);
  assert.equal(shown, 1);
  assert.equal(values.has('home_intro_completed_v1'), false, 'rendering must not mark the introduction read');
  await new HomeStartupSequence().start(host);
  assert.equal(shown, 2, 'a restart before confirmation must exercise the same rendering');
  await api.completeHomeIntro();
  await new HomeStartupSequence().start(host);
  assert.equal(shown, 2, 'an existing read marker skips the crash-sensitive first-start path');
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

test('overview reassures new users and remains part of the first-start popup flow', () => {
  assert.match(panel, /home_intro_simple_start_title/);
  assert.match(panel, /home_intro_simple_start_body/);
  assert.match(homePage, /introCompleted:\s*\(\): Promise<boolean> => isHomeIntroCompleted\(\)/);
  assert.match(homePage, /showIntro:\s*\(\): void => \{ this\.显示欢迎弹窗 = true; \}/);
});

test('introduction paragraphs stay in a Builder method compiled into native Text operations', () => {
  assert.match(panel, /@Builder\s+private paragraph\(body: Resource\)\s*\{\s*Text\(body\)\.fontSize/);
  assert.match(panel, /HomeIntroSection\(\{ title, content: \(\) => \{ this\.paragraph\(body\); \} \}\)/);
});
