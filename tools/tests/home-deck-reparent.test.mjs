// SPDX-License-Identifier: AGPL-3.0-or-later
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { deckHierarchyEntries, planDeckReparent, assertDeckReparentUnchanged } from '../../entry/src/main/ets/model/DeckReparent.ts';
import { encodeReparentDecksRequest } from '../../entry/src/main/ets/proto/messages/DeckMessages.ts';
import { 协议读取器 } from '../../entry/src/main/ets/proto/core/ProtoReader.ts';
import { AutoSyncScheduler } from '../../entry/src/main/ets/model/AutoSyncScheduler.ts';
import { SyncActivity } from '../../entry/src/main/ets/model/SyncSettings.ts';
import { AppInterfaceTracker, APP_INTERFACE_SURFACES, visibleInterfaceItems } from '../../entry/src/main/ets/model/AppInterface.ts';
import { loadComponentLogic, loadPlatformModule } from './platform-module-harness.mjs';
import { buildAgentAppStructure, agentInterfaceRevision } from '../../entry/src/main/ets/model/agent/AgentAppStructure.ts';
import { agentFunctionTools } from '../../entry/src/main/ets/model/agent/AgentToolCatalog.ts';
import { agentSettingDefinitions } from '../../entry/src/main/ets/model/agent/AgentSettingsTools.ts';

const node = (id, name, children = [], filtered = false) => ({ deckId: id, name, children, filtered,
  level: 0, collapsed: false, reviewCount: 0, learnCount: 0, newCount: 0, totalInDeck: 0, totalIncludingChildren: 0 });
const tree = () => node(0, '', [node(1, 'A', [node(2, 'B', [node(3, 'C')])]), node(4, 'D'), node(5, 'Filtered', [], true)]);
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return {promise, resolve, reject}; };

test('move, promote and overlapping batch selections retain every descendant identity and full path', () => {
  const plan = planDeckReparent(tree(), [2, 3, 2], 4);
  assert.deepEqual(plan.deckIds, [2]);
  assert.equal(plan.parentName, 'D');
  assert.deepEqual(plan.changes.map(x => [x.id, x.before, x.after]), [[2, 'A::B', 'D::B'], [3, 'A::B::C', 'D::B::C']]);
  assert.equal(planDeckReparent(tree(), [2], 0).changes[0].after, 'B');
  assert.deepEqual(planDeckReparent(tree(), [2, 5], 4).deckIds, [2, 5]);
  assert.equal(planDeckReparent(tree(), [5], 4).changes[0].filtered, true);
  assertDeckReparentUnchanged(tree(), plan);
});

test('invalid IDs, missing targets, cycles, filtered parents, no-ops and all collision forms fail before writes', () => {
  for (const ids of [[], [0], [-1], [1.5], ['2'], [Number.MAX_SAFE_INTEGER + 1]])
    assert.throws(() => planDeckReparent(tree(), ids, 4), /invalid_ids/);
  for (const parent of [-1, '4', 1.5, null]) assert.throws(() => planDeckReparent(tree(), [2], parent), /invalid_ids/);
  assert.throws(() => planDeckReparent(tree(), [99], 4), /missing/);
  assert.throws(() => planDeckReparent(tree(), [2], 99), /missing/);
  for (const parent of [1, 2, 3]) assert.throws(() => planDeckReparent(tree(), [1], parent), /cycle/);
  assert.throws(() => planDeckReparent(tree(), [2], 5), /filtered_parent/);
  assert.throws(() => planDeckReparent(tree(), [2], 1), /unchanged/);
  const collision = tree(); collision.children[1].children.push(node(6, 'b'));
  assert.throws(() => planDeckReparent(collision, [2], 4), /conflict/);
  const batch = tree(); batch.children.push(node(7, 'Z', [node(8, 'B')]));
  assert.throws(() => planDeckReparent(batch, [2, 8], 4), /conflict/);
});

test('changed subtree identities, paths, target paths and new collisions invalidate a confirmation', () => {
  const plan = planDeckReparent(tree(), [2], 4);
  for (const mutate of [t => t.children[0].name = 'Renamed', t => t.children[1].name = 'New',
    t => t.children[0].children[0].children.push(node(6, 'Added')), t => t.children[0].children[0].children[0].deckId = 9,
    t => t.children[1].children.push(node(6, 'B'))]) {
    const changed = tree(); mutate(changed); assert.throws(() => assertDeckReparentUnchanged(changed, plan));
  }
  const counts = tree(); counts.children.reverse(); counts.children[2].totalIncludingChildren = 10;
  assertDeckReparentUnchanged(counts, plan);
});

test('ReparentDecks wire fields preserve 64-bit IDs and zero means top level', () => {
  const ids = [1750000000001, 1750000000002];
  for (const parent of [0, 1750000000003]) {
    const r = new 协议读取器(encodeReparentDecksRequest(ids, parent)); const decoded = []; let target = 0, tag;
    while ((tag = r.读取标签()) !== null) {
      assert.equal(tag.线类型, 0);
      if (tag.字段号 === 1) decoded.push(r.读取64位整数());
      else { assert.equal(tag.字段号, 2); target = r.读取64位整数(); }
    }
    assert.deepEqual(decoded, ids); assert.equal(target, parent);
  }
});

function commandsHarness(root = tree()) {
  const state = { root, writes: [], gate: null };
  const scheduler = new AutoSyncScheduler(), activity = new SyncActivity();
  const Commands = loadPlatformModule('backend/DeckHierarchyCommands.ets', 'DeckHierarchyCommands', {
    牌组服务: class { async 获取牌组树() { return state.root; } async 调整牌组父级(...args) {
      state.writes.push(args); if (state.gate) await state.gate.promise; return args[0].length; } },
    planDeckReparent, assertDeckReparentUnchanged, autoSyncScheduler: scheduler, syncActivity: activity
  });
  return { commands: new Commands(), state, scheduler, activity };
}

test('real command rechecks confirmation, excludes syncing and retains operation ownership until the write settles', async () => {
  const h = commandsHarness(); const plan = await h.commands.prepare([2], 4);
  h.state.root.children[1].name = 'changed'; await assert.rejects(h.commands.execute(plan), /stale/); assert.equal(h.state.writes.length, 0);
  h.state.root = tree(); h.activity.reserveCollection(); await assert.rejects(h.commands.execute(plan), /sync_busy/);
  h.activity.cancelReservation(); h.state.gate = deferred(); const pending = h.commands.execute(plan);
  plan.deckIds[0] = 99; await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.scheduler.canSync(), false); assert.deepEqual(h.state.writes, [[[2], 4]]);
  h.state.gate.resolve(); assert.equal(await pending, 1); assert.equal(h.scheduler.canSync(), true); assert.equal(h.scheduler.hasPending(), true);
});

function componentHarness() {
  const h = commandsHarness(); const events = [], tracker = new AppInterfaceTracker();
  const Feature = loadComponentLogic('components/home/DeckReparentFeature.ets', 'DeckReparentFeature', {
    DeckHierarchyCommands: class { execute(plan) { return h.commands.execute(plan); } },
    牌组服务: class { async 获取牌组树() { return h.state.root; } },
    deckHierarchyEntries, planDeckReparent, appInterface: tracker,
    $r: key => key, resourceText: (_ui, key) => key, namedResourceText: (_ui, key) => key,
    interfaceItemText: (_ui, surface, id) => `${surface}.${id}`,
    AppStorage: { setOrCreate: () => events.push('broadcast') }, showToastSafely: () => events.push('refresh-error')
  });
  const feature = new Feature(); feature.deckId = 2; feature.getUIContext = () => ({});
  feature.onBusy = busy => events.push(busy ? 'busy' : 'idle'); feature.onClose = () => events.push('close');
  feature.onSaved = async () => events.push('saved');
  return {...h, feature, events, tracker};
}

test('real move panel exposes shared menu and live selection, excludes descendants and guards busy/back/double submission', async () => {
  assert.ok(visibleInterfaceItems('deck_details_more', {simple: false, agent: true, cloudDeck: false, themeHasTextures: false}).some(x => x.id === 'move' && x.opens === 'deck_move'));
  assert.ok(APP_INTERFACE_SURFACES.some(x => x.id === 'deck_move'));
  const h = componentHarness(); await h.feature.load(); assert.deepEqual(h.feature.candidateIds(), [0, 1, 4]);
  h.feature.select(2); assert.equal(h.feature.plan.changes[0].after, 'D::B');
  h.state.gate = deferred(); const save = h.feature.save(); await new Promise(resolve => setImmediate(resolve));
  h.feature.select(0); h.feature.handleBackRequest(); await h.feature.save();
  assert.equal(h.feature.parentId, 4); assert.equal(h.state.writes.length, 1); assert.ok(!h.events.includes('close'));
  h.state.gate.resolve(); await save; assert.deepEqual(h.events, ['busy', 'broadcast', 'saved', 'close', 'idle']);
});

test('accepted move finishes after panel disposal without late UI updates; refresh failure cannot repeat a committed write', async () => {
  const h = componentHarness(); await h.feature.load(); h.feature.select(0); h.state.gate = deferred();
  const saving = h.feature.save(); h.feature.aboutToDisappear(); h.state.gate.resolve(); await saving;
  assert.deepEqual(h.events, ['busy', 'broadcast']); assert.equal(h.scheduler.canSync(), true);
  const refresh = componentHarness(); await refresh.feature.load(); refresh.feature.select(0);
  refresh.feature.onSaved = async () => { throw Error('refresh failed'); }; await refresh.feature.save(); await refresh.feature.save();
  assert.equal(refresh.state.writes.length, 1); assert.ok(refresh.events.includes('refresh-error')); assert.ok(refresh.events.includes('close'));
});

test('Chinese and English move labels resolve to complete resources', () => {
  const resources = ['base', 'en_US'].map(locale => JSON.parse(readFileSync(new URL(`../../entry/src/main/resources/${locale}/element/string.json`, import.meta.url))).string);
  for (const entries of resources) for (const item of APP_INTERFACE_SURFACES.find(x => x.id === 'deck_move').items)
    assert.ok(entries.find(x => x.name === item.titleKey)?.value);
});

test('JIDE reads the actual move dialog controls and current capability in both languages', async () => {
  const h = componentHarness(); await h.feature.load();
  const context = {simple: false, agent: true, cloudDeck: false, themeHasTextures: false};
  const tools = agentFunctionTools(100, 'assistant');
  const view = locale => {
    const strings = new Map(JSON.parse(readFileSync(new URL(`../../entry/src/main/resources/${locale}/element/string.json`, import.meta.url))).string.map(x => [x.name, x.value]));
    return buildAgentAppStructure(context, 'deck_move', '', key => strings.get(key), agentSettingDefinitions(), tools,
      h.tracker.snapshot(), 'home');
  };
  for (const locale of ['base', 'en_US']) {
    const structure = view(locale), items = structure.surfaces[0].items;
    assert.equal(items.find(x => x.id === 'reload').visibility, 'hidden');
    assert.equal(items.find(x => x.id === 'confirm').enabled, false);
    assert.ok(structure.tools.some(x => x.name === 'propose_reparent_decks'));
    assert.equal(structure.observations[0].selectedId, '1');
    assert.deepEqual(structure.observations[0].optionIds, ['0', '1', '4']);
  }
  assert.notEqual(agentInterfaceRevision(tools), agentInterfaceRevision(tools.filter(x => x.name !== 'propose_reparent_decks')));
  h.feature.select(2); assert.equal(view('base').surfaces[0].items.find(x => x.id === 'confirm').enabled, true);
  assert.equal(view('en_US').observations[0].selectedId, '4');
  h.feature.errorCode = 'deck_move_stale'; h.feature.plan = null; h.feature.publishInterface();
  assert.equal(view('base').surfaces[0].items.find(x => x.id === 'reload').visibility, 'observed');
  assert.equal(view('base').surfaces[0].items.find(x => x.id === 'confirm').enabled, false);
  h.feature.saving = true; h.feature.publishInterface();
  assert.ok(view('base').surfaces[0].items.every(x => !x.enabled));
  h.feature.aboutToDisappear(); assert.equal(h.tracker.snapshot().length, 0);
});

test('failed moves keep the panel open for reload and do not publish a successful write', async () => {
  const h = componentHarness(); await h.feature.load(); h.feature.select(2);
  h.state.root.children[1].name = 'Changed'; await h.feature.save();
  assert.equal(h.feature.errorCode, 'deck_move_stale'); assert.equal(h.feature.plan, null);
  assert.deepEqual(h.events, ['busy', 'idle']); assert.deepEqual(h.state.writes, []);
  await h.feature.load(); h.feature.select(2); await h.feature.save();
  assert.deepEqual(h.state.writes, [[[2], 4]]); assert.ok(h.events.includes('close'));
});
