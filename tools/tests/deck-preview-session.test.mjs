// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DeckPreviewScope, DeckPreviewSession } from '../../entry/src/main/ets/model/DeckPreviewSession.ts';
import { encodeDeckPreviewRequest, decodeDeckPreviewIds, DECK_PREVIEW_SERVICE } from '../../entry/src/main/ets/proto/messages/DeckPreviewMessages.ts';
import { 协议写入器 } from '../../entry/src/main/ets/proto/core/ProtoWriter.ts';
import { 协议读取器 } from '../../entry/src/main/ets/proto/core/ProtoReader.ts';
import { loadComponentLogic, loadPlatformModule } from './platform-module-harness.mjs';
import { appInterfaceDependencies } from './app-interface-harness.mjs';
import { componentMethods } from './sync-panel-harness.mjs';

const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const scopes = [DeckPreviewScope.TodayRemaining, DeckPreviewScope.Due, DeckPreviewScope.StudiedToday, DeckPreviewScope.All];

test('home cancels pending preview across background/return, deck reselection and back', async () => {
  const source = readFileSync(new URL('../../entry/src/main/ets/pages/首页.ets', import.meta.url), 'utf8');
  const Page = componentMethods(source, ['打开牌组预览', 'syncForegroundChanged', 'previewDeckChanged', 'publishHomeInterface', 'onBackPress'], {
    ...appInterfaceDependencies(), $r: key => key
  });
  for (const reason of ['background', 'deck', 'back']) {
    const pending = deferred(), toasts = [];
    const page = new Page();
    Object.assign(page, {
      deckPreviewSession: new DeckPreviewSession({ cardIds: () => pending.promise }),
      syncController: { foregroundChanged() {}, cancel() {} }, backupController: { schedule() {}, stop() {} },
      syncForeground: true, transfer: { phase: 'idle' }, homeDisposed: false, 选中的牌组ID: '1',
      选中牌组: () => ({ id: page.选中的牌组ID }), 取能力上下文: () => ({ filesDir: '/test' }),
      页面栈: { size: () => 0 }, deferForSync: () => false, homeActivityChanged() {},
      牌组数据源: { snapshotDecks: () => [] }, homeActivity: () => ({ collectionBusy: false }),
      显示提示: key => toasts.push(key), 显示卡片预览: false
    });
    const loading = page.打开牌组预览(DeckPreviewScope.TodayRemaining);
    assert.equal(page.预览加载中, true);
    if (reason === 'background') {
      page.syncForeground = false; page.syncForegroundChanged();
      page.syncForeground = true; page.syncForegroundChanged();
    } else if (reason === 'deck') {
      page.选中的牌组ID = '2'; page.previewDeckChanged();
      page.选中的牌组ID = '1'; page.previewDeckChanged();
    } else assert.equal(page.onBackPress(), true);
    pending.resolve([111]); await loading;
    assert.equal(page.显示卡片预览, false, reason);
    assert.equal(page.预览加载中, false, reason);
    assert.deepEqual(toasts, [], reason);
  }
});

test('preview session freezes IDs in backend order and sends all four scopes through its query-only boundary', async () => {
  const calls = [];
  const session = new DeckPreviewSession({ cardIds: async (deck, scope) => { calls.push([deck, scope]); return [90, 3, 12, 90]; } });
  for (const scope of scopes) assert.deepEqual(await session.load('123', scope), [90, 3, 12]);
  assert.deepEqual(calls, scopes.map(scope => ['123', scope]));
  session.dispose(); assert.equal(await session.load('123', scopes[0]), null); assert.equal(calls.length, 4);
});

test('cancel, replacement, disposal and stale errors cannot open or overwrite a newer preview', async () => {
  const pending = [], session = new DeckPreviewSession({ cardIds: () => { const item = deferred(); pending.push(item); return item.promise; } });
  const first = session.load('1', scopes[0]), second = session.load('2', scopes[3]);
  pending[1].resolve([222]); assert.deepEqual(await second, [222]);
  pending[0].resolve([111]); assert.equal(await first, null);
  const canceled = session.load('1', scopes[0]); session.invalidate(); pending[2].reject(new Error('stale')); assert.equal(await canceled, null);
  const disposed = session.load('1', scopes[0]); session.dispose(); pending[3].resolve([111]); assert.equal(await disposed, null);
  const failed = new DeckPreviewSession({ cardIds: async () => { throw new Error('snapshot failed'); } });
  await assert.rejects(failed.load('1', scopes[0]), /snapshot failed/);
  for (const id of [0, -1, Number.MAX_SAFE_INTEGER + 1, 1.5]) {
    await assert.rejects(new DeckPreviewSession({ cardIds: async () => [id] }).load('1', scopes[0]), /Invalid preview card ID/);
  }
});

test('native preview protocol round-trips scope and packed IDs without touching locked scheduler RPC', async () => {
  const calls = [];
  const writer = new 协议写入器(); writer.写入打包64位整数(1, [90, 3]); writer.写入64位整数(1, 12); writer.写入变长整数(9, 7);
  assert.deepEqual(decodeDeckPreviewIds(writer.转为字节()), [90, 3, 12]);
  const Service = loadPlatformModule('backend/DeckPreviewService.ts', 'DeckPreviewService', {
    后端会话: { 获取实例: () => ({ 调用: async (...args) => { calls.push(args); return writer.转为字节(); } }) },
    DECK_PREVIEW_SERVICE, encodeDeckPreviewRequest, decodeDeckPreviewIds
  });
  for (const scope of scopes) {
    assert.deepEqual(await new Service().cardIds('1700000000000', scope), [90, 3, 12]);
    const [service, method, bytes] = calls.at(-1);
    assert.deepEqual([service, method], [1001, 0]);
    const reader = new 协议读取器(bytes);
    assert.equal(reader.读取标签().字段号, 1); assert.equal(reader.读取64位整数(), 1700000000000);
    assert.equal(reader.读取标签().字段号, 2); assert.equal(reader.读取变长整数(), scope);
    assert.equal(reader.已读完, true);
  }
  for (const deck of ['0', '-1', '1.5', 'abc', '9007199254740992']) assert.throws(() => encodeDeckPreviewRequest(deck, scopes[0]));
  for (const scope of [-1, 4, 1.5, NaN]) assert.throws(() => encodeDeckPreviewRequest('1', scope));
});

const Details = () => loadComponentLogic('components/home/HomeDeckDetails.ets', 'HomeDeckDetails', {
  ...appInterfaceDependencies(),
  DECK_LIST_NARROW_KEY: 'narrow', PAGE_SURFACE_KEY: 'surface', AI_AGENT_CHANNELS_APP_STORAGE_KEY: 'agent', APP_FOREGROUND_KEY: 'foreground'
});

test('mobile scope selection retains its Preview row anchor, consumes back and releases both menus before query', () => {
  const page = new (Details())(), events = [], selections = [];
  page.compact = true; page.onMenuStateChange = open => events.push(open); page.onPreview = scope => {
    assert.equal(page.actionsMenuOpen, false); assert.equal(page.previewMenuOpen, false); selections.push(scope);
  };
  page.aboutToAppear();
  page.toggleActionsMenu(); page.openPreviewMenu();
  assert.equal(page.actionsMenuOpen, true, 'parent menu keeps the Preview row mounted'); assert.equal(page.previewMenuOpen, true);
  assert.equal(page.consumeBack(), true); assert.equal(page.consumeBack(), false); assert.deepEqual(selections, []);
  for (const scope of scopes) { page.toggleActionsMenu(); page.openPreviewMenu(); page.selectPreview(scope); }
  assert.deepEqual(selections, scopes); assert.equal(events.at(-1), false);
  page.previewBusy = true; page.openPreviewMenu(); page.toggleActionsMenu(); assert.equal(page.previewMenuOpen, false); assert.equal(page.actionsMenuOpen, false);
  page.previewBusy = false; page.toggleActionsMenu(); page.openPreviewMenu(); page.foreground = false; page.foregroundChanged();
  assert.equal(page.consumeBack(), false);
});

test('wide scope popup shares options and closes on deck/layout changes and unmount', () => {
  const page = new (Details())(), registrations = [];
  page.onBackHandlerChange = handler => registrations.push(handler); page.aboutToAppear();
  page.openPreviewMenu(); assert.equal(page.previewMenuOpen, true); assert.equal(registrations.at(-1)(), true);
  page.openPreviewMenu(); page.closeActionsMenu(); assert.equal(page.previewMenuOpen, false);
  page.openPreviewMenu(); page.compact = true; page.compactChanged(); assert.equal(page.previewMenuOpen, false);
  page.openPreviewMenu(); page.aboutToDisappear(); assert.equal(page.previewMenuOpen, false); assert.equal(registrations.at(-1), null);
  const Menu = loadComponentLogic('components/home/DeckPreviewScopeMenu.ets', 'DeckPreviewScopeMenu', { ...appInterfaceDependencies(), DeckPreviewScope, $r: key => key });
  assert.deepEqual(new Menu().options().map(option => Number(option.id)), scopes);
  const resources = locale => JSON.parse(readFileSync(new URL(`../../entry/src/main/resources/${locale}/element/string.json`, import.meta.url), 'utf8')).string;
  for (const locale of ['base', 'en_US']) {
    const items = resources(locale);
    for (const option of new Menu().options()) assert.ok(items.some(item => item.name === option.titleKey && item.value));
  }
});
