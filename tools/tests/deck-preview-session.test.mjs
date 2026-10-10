// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DeckPreviewScope, DeckPreviewSession } from '../../entry/src/main/ets/model/DeckPreviewSession.ts';
import { AutoSyncScheduler } from '../../entry/src/main/ets/model/AutoSyncScheduler.ts';
import { SyncActivity } from '../../entry/src/main/ets/model/SyncSettings.ts';
import { encodeDeckPreviewRequest, decodeDeckPreviewIds, DECK_PREVIEW_SERVICE } from '../../entry/src/main/ets/proto/messages/DeckPreviewMessages.ts';
import { 协议写入器 } from '../../entry/src/main/ets/proto/core/ProtoWriter.ts';
import { 协议读取器 } from '../../entry/src/main/ets/proto/core/ProtoReader.ts';
import { loadComponentLogic, loadPlatformModule } from './platform-module-harness.mjs';
import { appInterfaceDependencies } from './app-interface-harness.mjs';
import { componentMethods } from './sync-panel-harness.mjs';
import { isDoubleColumnDeckListStyle } from '../../entry/src/main/ets/model/DeckListAppearance.ts';
import { HomeSyncStatusController, homeSyncLabelKey, homeSyncIndicator } from '../../entry/src/main/ets/model/HomeSyncStatusController.ts';

const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const scopes = [DeckPreviewScope.TodayRemaining, DeckPreviewScope.Due, DeckPreviewScope.StudiedToday, DeckPreviewScope.All];

test('home cancels pending preview across background/return, deck reselection, long press and back', async () => {
  const source = readFileSync(new URL('../../entry/src/main/ets/pages/首页.ets', import.meta.url), 'utf8');
  const Page = componentMethods(source, ['打开牌组预览', 'openDeckMenu', 'syncForegroundChanged', 'previewDeckChanged', 'homeActionControls', 'publishHomeInterface', 'onBackPress'], {
    ...appInterfaceDependencies(), isDoubleColumnDeckListStyle, homeSyncLabelKey, homeSyncIndicator, $r: key => key
  });
  Page.prototype.closeHomeActions = new Function(source.match(/private closeHomeActions\(\): void \{([^\n]*)\}/)[1]);
  for (const reason of ['background', 'deck', 'long_press', 'back']) {
    const pending = deferred(), toasts = [];
    const page = new Page();
    Object.assign(page, {
      deckMenuId: '', deckMenuBackRequest: 0,
      deckPreviewSession: new DeckPreviewSession({ cardIds: () => pending.promise }),
      syncController: { foregroundChanged() {}, cancel() {} }, backupController: { schedule() {}, stop() {} },
      syncStatusController: new HomeSyncStatusController({ auth: () => null, canRead: () => false,
        read: () => { throw new Error('preview lifecycle must not read sync status without auth'); },
        changed() {}, failed() {}, saveEndpoint() {} }),
      syncForeground: true, transfer: { phase: 'idle' }, homeDisposed: false, 选中的牌组ID: '1',
      选中牌组: () => ({ id: page.选中的牌组ID }), 取能力上下文: () => ({ filesDir: '/test' }),
      按ID查牌组: id => ({ id }),
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
    } else if (reason === 'long_press') {
      page.openDeckMenu('2', { left: 24, top: 300, width: 360, height: 68 });
      assert.equal(page.选中的牌组ID, '2');
      page.previewDeckChanged();
    } else assert.equal(page.onBackPress(), true);
    pending.resolve([111]); await loading;
    assert.equal(page.显示卡片预览, false, reason);
    assert.equal(page.预览加载中, false, reason);
    assert.deepEqual(toasts, [], reason);
  }
});

test('preview session freezes IDs in backend order and sends all four scopes through its query-only boundary', async () => {
  const calls = [];
  const session = new DeckPreviewSession({ cardIds: async (deck, scope, filesDir) => { calls.push([deck, scope, filesDir]); return [90, 3, 12, 90]; } });
  for (const scope of scopes) assert.deepEqual(await session.load('123', scope, '/collection'), [90, 3, 12]);
  assert.deepEqual(calls, scopes.map(scope => ['123', scope, '/collection']));
  session.dispose(); assert.equal(await session.load('123', scopes[0], '/collection'), null); assert.equal(calls.length, 4);
});

test('cancel, replacement, disposal and stale errors cannot open or overwrite a newer preview', async () => {
  const pending = [], session = new DeckPreviewSession({ cardIds: () => { const item = deferred(); pending.push(item); return item.promise; } });
  const first = session.load('1', scopes[0], '/collection'), second = session.load('2', scopes[3], '/collection');
  pending[1].resolve([222]); assert.deepEqual(await second, [222]);
  pending[0].resolve([111]); assert.equal(await first, null);
  const canceled = session.load('1', scopes[0], '/collection'); session.invalidate(); pending[2].reject(new Error('stale')); assert.equal(await canceled, null);
  const disposed = session.load('1', scopes[0], '/collection'); session.dispose(); pending[3].resolve([111]); assert.equal(await disposed, null);
  const failed = new DeckPreviewSession({ cardIds: async () => { throw new Error('snapshot failed'); } });
  await assert.rejects(failed.load('1', scopes[0], '/collection'), /snapshot failed/);
  for (const id of [0, -1, Number.MAX_SAFE_INTEGER + 1, 1.5]) {
    await assert.rejects(new DeckPreviewSession({ cardIds: async () => [id] }).load('1', scopes[0], '/collection'), /Invalid preview card ID/);
  }
});

test('native preview protocol round-trips scope and packed IDs without touching locked scheduler RPC', async () => {
  const calls = [];
  const writer = new 协议写入器(); writer.写入打包64位整数(1, [90, 3]); writer.写入64位整数(1, 12); writer.写入变长整数(9, 7);
  assert.deepEqual(decodeDeckPreviewIds(writer.转为字节()), [90, 3, 12]);
  const Service = loadPlatformModule('backend/DeckPreviewService.ts', 'DeckPreviewService', {
    后端会话: { 获取实例: () => ({ 确保已打开: async () => {}, 调用: async (...args) => { calls.push(args); return writer.转为字节(); } }) },
    syncActivity: new SyncActivity(), autoSyncScheduler: new AutoSyncScheduler(),
    DECK_PREVIEW_SERVICE, encodeDeckPreviewRequest, decodeDeckPreviewIds
  });
  for (const scope of scopes) {
    assert.deepEqual(await new Service().cardIds('1700000000000', scope, '/collection'), [90, 3, 12]);
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

const Details = () => {
  const Host = loadComponentLogic('components/home/HomeDeckDetails.ets', 'HomeDeckDetails', {
    ...appInterfaceDependencies(), interfaceItemText: (_context, _surface, id) => id,
    应用尺寸: loadPlatformModule('utils/应用尺寸.ets', '应用尺寸', {}),
    DECK_LIST_NARROW_KEY: 'narrow', PAGE_SURFACE_KEY: 'surface', AI_AGENT_CHANNELS_APP_STORAGE_KEY: 'agent', APP_FOREGROUND_KEY: 'foreground'
  });
  Host.prototype.getUIContext = () => ({});
  return Host;
};

test('mobile preview opens directly at its toolbar anchor and closes before querying', () => {
  const page = new (Details())(), events = [], selections = [];
  page.compact = true; page.onMenuStateChange = open => events.push(open); page.onPreview = scope => {
    assert.equal(page.previewMenuOpen, false); selections.push(scope);
  };
  page.aboutToAppear();
  page.openPreviewMenu();
  assert.equal(page.previewMenuOpen, true);
  assert.equal(page.consumeBack(), true); assert.equal(page.consumeBack(), false); assert.deepEqual(selections, []);
  for (const scope of scopes) { page.openPreviewMenu(); page.selectPreview(scope); }
  assert.deepEqual(selections, scopes); assert.equal(events.at(-1), false);
  page.previewBusy = true; page.openPreviewMenu(); assert.equal(page.previewMenuOpen, false);
  page.previewBusy = false; page.openPreviewMenu(); page.foreground = false; page.foregroundChanged();
  assert.equal(page.consumeBack(), false);
});

test('menu anchors subtract the detail origin once and align the right edge after resize', () => {
  const page = new (Details())();
  page.detailsAreaChanged({ globalPosition: { x: 600, y: 180 }, width: 420, height: 700 });
  page.actionAnchor = { left: 612, top: 236, width: 396 };
  assert.deepEqual(page.menuAnchor(), { left: 12, top: 56, width: 396 });
  const anchor = page.menuAnchor();
  assert.equal(600 + anchor.left + anchor.width, 1008, 'right edge equals the measured wide toolbar/card edge');
  page.detailsAreaChanged({ globalPosition: { x: 420, y: 100 }, width: 300, height: 520 });
  page.actionAnchor = { left: 432, top: 152, width: 276 };
  assert.deepEqual(page.menuAnchor(), { left: 12, top: 52, width: 276 });
  page.detailsAreaChanged({ globalPosition: { x: 0, y: 0 }, width: 360, height: 800 });
  page.compactAnchorChanged({ globalPosition: { x: 0, y: 0 }, width: 360, height: 76 });
  assert.deepEqual(page.menuAnchor(), { left: 12, top: 88, width: 336 }, 'public content gap is added once');
  page.narrowDeckLayout = true;
  page.compactAnchorChanged({ globalPosition: { x: 0, y: 0 }, width: 280, height: 70 });
  assert.deepEqual(page.menuAnchor(), { left: 12, top: 78, width: 256 });
});

test('scope list shares actual choices with JIDE and rejects invalid or stale choices', () => {
  const deps = appInterfaceDependencies();
  const Menu = loadComponentLogic('components/home/DeckPreviewScopeMenu.ets', 'DeckPreviewScopeMenu', { ...deps, DeckPreviewScope });
  Menu.prototype.getUIContext = () => ({});
  const menu = new Menu(), selected = [];
  menu.onSelect = scope => selected.push(scope);
  menu.aboutToAppear();
  assert.deepEqual(menu.menuItems().map(item => item.id), deps.appInterface.snapshot()[0].optionIds);
  for (const scope of scopes) menu.selectOption(String(scope));
  for (const id of ['4', '-1', '1.5', '', 'no-scope']) menu.selectOption(id);
  assert.deepEqual(selected, scopes);
  menu.aboutToDisappear();
  assert.equal(deps.appInterface.snapshot().length, 0);
});

test('JIDE sees the exposed icon toolbar and its real availability, and withdraws it under the popup', () => {
  const deps = appInterfaceDependencies();
  const Host = loadComponentLogic('components/home/HomeDeckDetails.ets', 'HomeDeckDetails', {
    ...deps, 应用尺寸: loadPlatformModule('utils/应用尺寸.ets', '应用尺寸', {}),
    interfaceItemText: (_context, _surface, id) => id,
    PAGE_SURFACE_KEY: 'surface', AI_AGENT_CHANNELS_APP_STORAGE_KEY: 'agent'
  });
  Host.prototype.getUIContext = () => ({});
  const page = new Host();
  page.compact = true; page.deckId = '42'; page.aboutToAppear();
  const toolbar = () => deps.appInterface.snapshot().find(item => item.surface === 'deck_actions');
  assert.equal(toolbar().sectionId, 'toolbar_right');
  assert.deepEqual(toolbar().items.map(item => item.id), ['add_note', 'preview']);
  assert.deepEqual(toolbar().items.map(item => item.iconKey), ['ic_study_edit', 'ic_common_preview']);
  page.agentEnabled = true; page.publishInterface();
  assert.deepEqual(toolbar().items.map(item => item.id), ['add_note', 'agent', 'preview']);
  page.previewBusy = true; page.publishInterface();
  assert.equal(toolbar().items.find(item => item.id === 'preview').enabled, false);
  assert.equal(toolbar().items.find(item => item.id === 'add_note').enabled, true);
  page.previewBusy = false;
  page.openPreviewMenu(); page.publishInterface();
  assert.equal(deps.appInterface.snapshot().some(item => item.surface === 'deck_actions'), false);
  page.consumeBack(); page.publishInterface();
  assert.equal(toolbar().items.length, 3, 'dismissal reveals the toolbar again');
  page.deckId = ''; page.closePreviewMenu();
  assert.equal(toolbar().items.every(item => !item.enabled), true);
  page.compact = false; page.compactChanged();
  assert.equal(toolbar(), undefined);
});

test('wide scope popup shares options and closes on deck/layout changes and unmount', () => {
  const page = new (Details())(), registrations = [];
  page.onBackHandlerChange = handler => registrations.push(handler); page.aboutToAppear();
  page.openPreviewMenu(); assert.equal(page.previewMenuOpen, true); assert.equal(registrations.at(-1)(), true);
  page.openPreviewMenu(); page.closePreviewMenu(); assert.equal(page.previewMenuOpen, false);
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
