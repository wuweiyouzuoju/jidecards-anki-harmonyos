import { createDeletion } from './home-deletion-harness.mjs';
import { compileWithUiFeedback } from './ui-feedback-harness.mjs';
// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { AutoSyncScheduler } from '../../entry/src/main/ets/model/AutoSyncScheduler.ts';
const source = readFileSync(new URL('../../entry/src/main/ets/pages/首页.ets', import.meta.url), 'utf8');
const names = ['deckDeleted', 'reconcileDeckSelection'];
const methods = names.map(name => {
  const start = source.indexOf('  private async ' + name + '(');
  assert.ok(start >= 0);
  return source.slice(start, source.indexOf('\n  }', start) + 4);
});

function harness(selected = 'child', saved = selected) {
  const events = [], dialogs = [], scheduler = new AutoSyncScheduler();
  const preferences = { saved, fail: false };
  const Page = compileWithUiFeedback('清除上次牌组ID', '加载上次牌组ID', '$r', 'console',
    stripTypeScriptTypes(`class Page { ${methods.join('\n')} }`, { mode: 'transform' }) + '; return Page;')(
    async () => { events.push('clear preference'); if (preferences.fail) return false; preferences.saved = ''; return true; },
    async () => preferences.saved, key => ({ id: key }), { info() {} });
  const page = new Page();
  Object.assign(page, {
    选中的牌组ID: selected, deckDeletionBusy: false,
    deckMediaCleanup: { snapshot: async () => [] },
    offerDeletedDeckMediaCleanup: async () => {},
    主页快照数据: { decks: [{ id: 'parent', ancestorIds: [] }, { id: 'child', ancestorIds: ['parent'] },
      { id: 'grandchild', ancestorIds: ['parent', 'child'] }, { id: 'other', ancestorIds: [] }, { id: '1', ancestorIds: [] }] },
    deferForSync: () => false, homeActivityChanged() {},
    牌组服务实例: { 删除牌组: async () => { events.push('delete committed'); return 3; } },
    requestAutoSync: () => { assert.equal(page.deckDeletionBusy, true); scheduler.request(); events.push('sync requested'); },
    scheduleAutoSyncCheck: () => { assert.equal(page.deckDeletionBusy, false); events.push('sync check'); },
    加载主页数据: async () => { events.push('refresh'); },
    getUIContext: () => ({ getHostContext: () => ({ resourceManager: { getStringSync: key => key + ' %d' } }),
      getPromptAction: () => ({ showToast: value => events.push(value.message) }),
      showAlertDialog: value => dialogs.push(value) })
  });
  const feature = createDeletion({
    getUIContext: () => page.getUIContext(), deferForSync: action => page.deferForSync(action),
    findDeck: id => page.主页快照数据.decks.find(deck => deck.id === id) ?? { id: '' },
    isVisible: () => false, onDialogChanged: open => { page.nativeDialogOpen = open; },
    onStateChanged: (busy, status) => { page.deckDeletionBusy = busy; page.deckDeletionStatus = status; },
    onDeleted: id => page.deckDeleted(id),
    onSettled: () => { page.homeActivityChanged(); page.scheduleAutoSyncCheck(); }
  }, page.牌组服务实例, page.deckMediaCleanup);
  page.确认删除牌组 = id => feature.execute(id);
  return { page, feature, preferences, events, dialogs, scheduler };
}

test('delete entry defers during sync and requires an explicit destructive confirmation', async () => {
  const { page, feature, events, dialogs } = harness();
  feature.request('missing');
  assert.equal(dialogs.length, 0);
  let deferred;
  page.deferForSync = action => { deferred = action; return true; };
  feature.request('parent');
  assert.equal(dialogs.length, 0);
  page.deferForSync = () => false;
  deferred();
  assert.equal(page.nativeDialogOpen, true);
  dialogs.at(-1).primaryButton.action();
  assert.equal(page.nativeDialogOpen, false);
  assert.deepEqual(events, []);
  feature.request('parent');
  dialogs.at(-1).cancel();
  assert.equal(page.nativeDialogOpen, false);
  assert.deepEqual(events, []);
  feature.request('parent');
  dialogs.at(-1).secondaryButton.action();
  assert.equal(page.nativeDialogOpen, false);
  for (let n = 0; n < 30 && page.deckDeletionBusy; n++) await Promise.resolve();
  assert.equal(events.filter(event => event === 'delete committed').length, 1);
  assert.equal(page.deckDeletionBusy, false);
});

test('cascade deletion clears selected descendants and persisted selection before refreshing and syncing', async () => {
  for (const selected of ['parent', 'child', 'grandchild']) {
    const { page, preferences, events, scheduler } = harness(selected);
    await page.确认删除牌组('parent');
    assert.equal(page.选中的牌组ID, '');
    assert.equal(preferences.saved, '');
    assert.equal(scheduler.hasPending(), true);
    assert.deepEqual(events.slice(0, 4), ['delete committed', 'sync requested', 'clear preference', 'refresh']);
    assert.equal(events.at(-1), 'sync check');
  }
});

test('phone with no selection still clears a deleted saved deck; unrelated and default selection survive', async () => {
  const hidden = harness('', 'grandchild');
  await hidden.page.确认删除牌组('parent');
  assert.equal(hidden.preferences.saved, '');
  for (const selected of ['other', '1']) {
    const { page, preferences } = harness(selected);
    await page.确认删除牌组(selected === '1' ? '1' : 'parent');
    assert.equal(page.选中的牌组ID, selected);
    assert.equal(preferences.saved, selected);
  }
});

test('preference failure preserves successful deletion, refreshes home, and still requests sync', async () => {
  const { page, preferences, events, scheduler } = harness();
  preferences.fail = true;
  await page.确认删除牌组('parent');
  assert.equal(page.选中的牌组ID, '');
  assert.equal(scheduler.hasPending(), true);
  assert.ok(events.includes('refresh'));
  assert.ok(events.some(event => event.includes('deck_delete_success') && event.includes('home_selection_save_failed')));
  assert.ok(!events.some(event => event.includes('deck_delete_failed')));
});

test('failed backend deletion leaves selection unchanged and does not request sync', async () => {
  const { page, preferences, events, scheduler } = harness();
  page.牌组服务实例.删除牌组 = async () => { throw new Error('disk full'); };
  await page.确认删除牌组('parent');
  assert.equal(page.选中的牌组ID, 'child');
  assert.equal(preferences.saved, 'child');
  assert.equal(scheduler.hasPending(), false);
  assert.ok(!events.includes('refresh'));
  assert.ok(events.some(event => event.includes('deck_delete_failed')));
  assert.equal(page.deckDeletionBusy, false);
});

test('repeat delete is ignored while a write is pending, and refresh reconciliation clears only missing ids', async () => {
  const { page, events } = harness();
  let release;
  page.牌组服务实例.删除牌组 = () => new Promise(resolve => { events.push('write'); release = resolve; });
  const first = page.确认删除牌组('parent');
  await page.确认删除牌组('parent');
  while (!release) await Promise.resolve();
  assert.equal(events.filter(event => event === 'write').length, 1);
  release(3); await first;
  page.选中的牌组ID = 'other';
  await page.reconcileDeckSelection([{ id: 'other' }]);
  assert.equal(page.选中的牌组ID, 'other');
  await page.reconcileDeckSelection([]);
  assert.equal(page.选中的牌组ID, '');
});

test('actual last-deck storage reports flush failure without throwing or claiming persistence succeeded', async () => {
  const storageSource = readFileSync(new URL('../../entry/src/main/ets/model/上次牌组存储.ets', import.meta.url), 'utf8');
  const start = storageSource.indexOf('export async function 清除上次牌组ID');
  const method = storageSource.slice(start).replace('export ', '');
  let fail = false;
  const clear = compileWithUiFeedback('取上下文', 'preferences', '存储名', '上次牌组键',
    stripTypeScriptTypes(method, { mode: 'transform' }) + ';return 清除上次牌组ID;')(
    () => ({}), { getPreferences: async () => ({ delete: async () => {}, flush: async () => { if (fail) throw new Error('disk full'); } }) },
    'settings', 'last_deck');
  assert.equal(await clear(), true);
  fail = true;
  assert.equal(await clear(), false);
});
