// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { DeckMediaCleanup } from '../../entry/src/main/ets/model/DeckMediaCleanup.ts';

function harness() {
  const state = { unused: ['old.png'], syncing: false, fail: false, trashed: [], checks: 0 };
  const cleanup = new DeckMediaCleanup({
    isSyncing: async () => state.syncing,
    unused: async () => { state.checks++; if (state.fail) throw new Error('check failed'); return [...state.unused]; },
    trash: async files => { state.trashed.push(...files); }
  });
  return { state, cleanup };
}

test('only newly unused files are offered, and files referenced again after confirmation are preserved', async () => {
  const { state, cleanup } = harness();
  const before = await cleanup.snapshot();
  state.unused = ['old.png', 'removed.jpg', 'shared.mp3'];
  const candidates = await cleanup.candidates(before);
  assert.deepEqual(candidates, ['removed.jpg', 'shared.mp3']);
  state.unused = ['old.png', 'removed.jpg', 'unrelated-new.png'];
  assert.equal(await cleanup.cleanup(candidates), 1);
  assert.deepEqual(state.trashed, ['removed.jpg']);
});

test('media sync or failed checks prevent every media deletion', async () => {
  for (const mode of ['syncing', 'fail']) {
    const { state, cleanup } = harness();
    state[mode] = true;
    await assert.rejects(cleanup.cleanup(['old.png']));
    assert.deepEqual(state.trashed, []);
  }
  let syncing = false;
  const cleanup = new DeckMediaCleanup({
    isSyncing: async () => syncing,
    unused: async () => { syncing = true; return ['x']; },
    trash: async () => assert.fail('must not trash during sync')
  });
  await assert.rejects(cleanup.snapshot());
});

test('filtered deck deletion or unchanged references offer no media', async () => {
  const { cleanup } = harness();
  assert.deepEqual(await cleanup.candidates(await cleanup.snapshot()), []);
});

const home = readFileSync(new URL('../../entry/src/main/ets/pages/首页.ets', import.meta.url), 'utf8');
const methodNames = ['offerDeletedDeckMediaCleanup', 'confirmDeletedDeckMedia'];
const methods = methodNames.map(name => {
  const start = home.search(new RegExp('^  private (?:async )?' + name + '\\(', 'm'));
  assert.ok(start >= 0);
  return home.slice(start, home.indexOf('\n  }', start) + 4);
});
const Page = new Function('$r', 'DialogAlignment', stripTypeScriptTypes(`class Page { ${methods.join('\n')} }`,
  { mode: 'transform' }) + '; return Page;')(id => ({ id }), { Center: 'center' });

function pageHarness() {
  const { state, cleanup } = harness();
  const page = new Page();
  const dialogs = [], messages = [];
  Object.assign(page, {
    homeDisposed: false, syncForeground: true, deckMediaCleanup: cleanup,
    显示提示: value => messages.push(value.id),
    getUIContext: () => ({
      getHostContext: () => ({ resourceManager: { getStringSync: id => id + ' %d' } }),
      showAlertDialog: value => dialogs.push(value),
      getPromptAction: () => ({ showToast: value => messages.push(value.message) })
    })
  });
  return { page, state, dialogs, messages };
}

test('actual home flow waits for separate confirmation and cancellation keeps media', async () => {
  for (const confirm of [false, true]) {
    const { page, state, dialogs } = pageHarness();
    state.unused = ['old.png', 'removed.jpg'];
    const pending = page.offerDeletedDeckMediaCleanup(['old.png']);
    for (let n = 0; n < 30 && dialogs.length === 0; n++) await Promise.resolve();
    assert.equal(dialogs.length, 1);
    assert.deepEqual(state.trashed, []);
    assert.match(dialogs[0].message, /1$/);
    if (confirm) dialogs[0].secondaryButton.action();
    else dialogs[0].primaryButton.action();
    await pending;
    assert.deepEqual(state.trashed, confirm ? ['removed.jpg'] : []);
    assert.equal(state.checks, confirm ? 2 : 1);
  }
});

test('failed baseline, backgrounding, and failed final check never clear media or misreport deck deletion', async () => {
  const baseline = pageHarness();
  await baseline.page.offerDeletedDeckMediaCleanup(null);
  assert.equal(baseline.dialogs.length, 0);
  assert.deepEqual(baseline.state.trashed, []);
  assert.deepEqual(baseline.messages, ['app.string.deck_media_check_failed']);
  for (const mode of ['background', 'check-failed']) {
    const { page, state, dialogs, messages } = pageHarness();
    state.unused = ['old.png', 'removed.jpg'];
    const pending = page.offerDeletedDeckMediaCleanup(['old.png']);
    for (let n = 0; n < 30 && dialogs.length === 0; n++) await Promise.resolve();
    if (mode === 'background') page.syncForeground = false;
    else state.fail = true;
    dialogs[0].secondaryButton.action();
    await pending;
    assert.deepEqual(state.trashed, []);
    assert.ok(messages.every(message => !message.includes('deck_delete_failed')));
  }
});
