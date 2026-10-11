// SPDX-License-Identifier: AGPL-3.0-or-later
// Exercise production settings through the existing probe's temporary collection only.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { once } from 'node:events';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { CoreRpc } from '../entry/src/main/ets/proto/generated/CoreRpc.ts';
import { encodeDeckId, encodeDeck, decodeDeck, encode过滤牌组更新, decode过滤牌组更新 } from '../entry/src/main/ets/proto/messages/DeckMessages.ts';
import { decodeOpChangesWithId, decodeOpChangesWithCount } from '../entry/src/main/ets/proto/messages/CollectionMessages.ts';
import { encodeAddNoteRequest } from '../entry/src/main/ets/proto/messages/NoteMessages.ts';
import * as deck from '../entry/src/main/ets/proto/messages/DeckConfigMessages.ts';
import * as prefs from '../entry/src/main/ets/proto/messages/PreferencesMessages.ts';
import * as stats from '../entry/src/main/ets/proto/messages/StatsMessages.ts';
import * as scheduler from '../entry/src/main/ets/proto/messages/SchedulerMessages.ts';
import * as cards from '../entry/src/main/ets/proto/messages/CardsMessages.ts';
import { CollectionOpenCollectionRequest } from '../entry/src/main/ets/proto/generated/CoreMessages.ts';
import { DECK_OPTION_GROUPS, deckOptionChoices } from '../entry/src/main/ets/model/DeckOptionsCatalog.ts';
import { buildDeckConfigRequest } from '../entry/src/main/ets/model/DeckConfigSave.ts';
import { copyDeckConfig } from '../entry/src/main/ets/model/DeckConfigSave.ts';
import { DeckOptionsSession } from '../entry/src/main/ets/model/home/DeckOptionsSession.ts';
import { decodeWritablePreference } from '../entry/src/main/ets/model/agent/AgentPreferenceSettings.ts';
import { FilteredDeckCommands } from '../entry/src/main/ets/model/FilteredDeckCommands.ts';
import { 牌组配置表单 } from '../entry/src/main/ets/model/牌组配置表单.ets';
import { 牌组选项编辑 } from '../entry/src/main/ets/model/牌组选项编辑.ets';
import { applyDeckOptionEdit } from '../entry/src/main/ets/model/DeckOptionsEdit.ets';
import { prepareDeckOptionsDraft } from '../entry/src/main/ets/model/DeckOptionsDraft.ets';
import { loadPlatformModule } from './tests/platform-module-harness.mjs';

const child = spawn('cargo', ['run', '--locked', '-p', 'jidecards_core', '--features', 'anki-core', '--example', 'protocol_probe'],
  { cwd: new URL('../', import.meta.url), stdio: ['pipe', 'pipe', 'inherit'], windowsHide: true });
const exited = once(child, 'exit');
const lines = createInterface({ input: child.stdout })[Symbol.asyncIterator]();
const hashFiles = files => {
  const hash = createHash('sha256');
  for (const file of files) hash.update(decodeURIComponent(file.pathname.split('/').at(-1))).update('\0').update(readFileSync(file));
  return hash.digest('hex');
};
const androidRoot = new URL('../../AnkiDroid/', import.meta.url);
const xmlRoot = new URL('AnkiDroid/src/main/res/xml/', androidRoot);
const androidXml = existsSync(xmlRoot) ? readdirSync(xmlRoot).filter(name => /^preferences.*\.xml$/.test(name)).sort()
  .map(name => new URL(name, xmlRoot)) : [];
const report = { baseline: { checkedAt: new Date().toISOString(), node: process.version,
  app: readFileSync(new URL('../AppScope/app.json5', import.meta.url), 'utf8').match(/versionName:\s*['"]([^'"]+)/)?.[1],
  upstreamLock: readFileSync(new URL('../UPSTREAM.lock', import.meta.url), 'utf8'),
  ankidroid: androidXml.length ? {
    version: readFileSync(new URL('AnkiDroid/build.gradle', androidRoot), 'utf8').match(/versionName\s*=\s*"([^"]+)/)?.[1],
    backend: readFileSync(new URL('gradle/libs.versions.toml', androidRoot), 'utf8').match(/ankiBackend\s*=\s*['"]([^'"]+)/)?.[1],
    preferenceXmlFiles: androidXml.length,
    keyedEntries: androidXml.reduce((count, file) => count + [...readFileSync(file, 'utf8').replace(/<!--[\s\S]*?-->/g, '').matchAll(/android:key\s*=/g)].length, 0),
    preferenceXmlSha256: hashFiles(androidXml) } : { available: false },
  productionInputsSha256: hashFiles(['model/home/DeckOptionsSession.ts', 'model/DeckOptionsPresets.ts', 'model/DeckConfigSave.ts',
    'model/DeckOptionsCatalog.ts', 'model/DeckOptionsEdit.ets', 'model/FSRS控制器.ets', 'backend/GraphPreferencesCommands.ts',
    'model/agent/AgentPreferenceSettings.ts', 'model/agent/AgentSettingsTools.ts', 'components/home/DeckOptionsFeature.ets',
    'proto/messages/DeckConfigMessages.ts', 'proto/messages/PreferencesMessages.ts', 'model/FilteredDeckCommands.ts']
    .map(file => new URL('../entry/src/main/ets/' + file, import.meta.url))) },
  checks: [], findings: [], unverified: ['HarmonyOS/Android device UI', 'online synchronization'] };
const output = new URL('../.local/settings-core-audit/report.json', import.meta.url);
const transport = { 调用: async (service, method, input) => {
  child.stdin.write(JSON.stringify({ service, method, input: Buffer.from(input).toString('hex') }) + '\n');
  let result;
  for (;;) {
    const line = await lines.next();
    assert.equal(line.done, false, 'Core probe terminated unexpectedly');
    // Locked Core's compute_all_params prints diagnostics before the probe's JSON response.
    if (!line.value.startsWith('{')) { (report.coreDiagnostics ??= []).push(line.value); continue; }
    result = JSON.parse(line.value);
    assert.equal(typeof result.output, 'string', 'Invalid Core probe response');
    assert.equal(typeof result.error, 'boolean', 'Invalid Core probe response');
    break;
  }
  assert.equal(result.error, false, `Core rejected service ${service}, method ${method}: ${result.output}`);
  return new Uint8Array(Buffer.from(result.output, 'hex'));
} };
const rpc = new CoreRpc(transport);
try {
  const first = await lines.next();
  assert.equal(first.done, false, 'Core probe did not create its temporary fixture');
  const fixture = JSON.parse(first.value);
  const loadDeck = async (id = 1) => deck.decodeDeckConfigsForUpdate(await rpc.DeckConfig_get_deck_configs_for_update(encodeDeckId(id)));
  const currentConfig = view => view.allConfigs.find(item => item.config.id === view.currentDeck.configId).config;
  const optionsFor = view => ({ limits: view.currentDeck.limits, cardStateCustomizer: view.cardStateCustomizer,
    fsrs: view.fsrs, newCardsIgnoreReviewLimit: view.newCardsIgnoreReviewLimit, applyAllParentLimits: view.applyAllParentLimits,
    fsrsReschedule: false, fsrsHealthCheck: view.fsrsHealthCheck });
  const saveRequest = input => rpc.DeckConfig_update_deck_configs(deck.encodeUpdateDeckConfigsRequest(input));
  const addDeck = async name => {
    const template = decodeDeck(await rpc.Decks_new_deck()); template.id = 0; template.name = name;
    return decodeOpChangesWithId(await rpc.Decks_add_deck(encodeDeck(template)));
  };
  const queuedCards = async id => {
    await rpc.Decks_set_current_deck(encodeDeckId(id));
    return scheduler.decodeQueuedCards(await rpc.Scheduler_get_queued_cards(scheduler.encodeGetQueuedCardsRequest(20, false))).cards;
  };
  let view = await loadDeck();
  const original = view.allConfigs.find(item => item.config.id === view.currentDeck.configId).config;
  const form = 牌组配置表单.从配置创建(original.config);
  const options = 牌组选项编辑.从视图创建(view.currentDeck.limits, view.newCardsIgnoreReviewLimit,
    view.fsrs, view.applyAllParentLimits, view.fsrsHealthCheck);
  const values = {
    newPerDay: '23', reviewsPerDay: '231', newCardsIgnoreReviewLimit: 'true', applyAllParentLimits: 'true',
    learnSteps: '30s 5m', graduatingIntervalGood: '3', graduatingIntervalEasy: '7', newCardInsertOrder: '1',
    relearnSteps: '2m', minimumLapseInterval: '2', leechThreshold: '5', leechAction: '1',
    newCardGatherPriority: '1', newCardSortOrder: '1', newMix: '2', interdayLearningMix: '1', reviewOrder: '3',
    fsrsEnabled: 'false', desiredRetention: '0.86', fsrsParameters: '', paramSearch: 'did:1 -is:suspended',
    fsrsReschedule: 'false', fsrsHealthCheck: 'false', buryNew: 'true', buryReviews: 'true', buryInterdayLearning: 'true',
    disableAutoplay: 'true', skipQuestionWhenReplayingAnswer: 'true', capAnswerTimeToSecs: '17', showTimer: 'true',
    stopTimerOnAnswer: 'true', secondsToShowQuestion: '1.5', secondsToShowAnswer: '2.5', waitForAudio: 'false',
    questionAction: '1', answerAction: '3', easyDaysPercentages: '1 0.5 0 1 0.5 1 1', maximumReviewInterval: '12345',
    initialEase: '2.7', easyMultiplier: '1.5', intervalMultiplier: '0.95', hardMultiplier: '1.3', lapseMultiplier: '0.1',
    historicalRetention: '0.87', ignoreRevlogsBeforeDate: '2020-01-01',
    customScheduling: 'states.good.normal.review.scheduledDays = 7;'
  };
  const fields = DECK_OPTION_GROUPS.flatMap(group => group.fields);
  assert.deepEqual(Object.keys(values).sort(), fields.map(field => field.key).sort());
  for (const field of fields) applyDeckOptionEdit(form, options, field.key, values[field.key], field.kind);
  const draft = prepareDeckOptionsDraft(original, form, options);
  assert.equal(draft.errorKey, '');
  const request = buildDeckConfigRequest(1, view, original, draft.config, false, draft.options);
  await rpc.DeckConfig_update_deck_configs(deck.encodeUpdateDeckConfigsRequest(request));
  view = await loadDeck();
  const saved = view.allConfigs.find(item => item.config.id === view.currentDeck.configId).config;
  assert.notEqual(saved.id, original.id, 'default preset must be isolated');
  assert.deepEqual(saved.config, request.configs.at(-1).config);
  assert.deepEqual(view.allConfigs.find(item => item.config.id === original.id).config.config, original.config);
  for (const key of ['newCardsIgnoreReviewLimit', 'applyAllParentLimits', 'fsrs', 'fsrsHealthCheck', 'cardStateCustomizer'])
    assert.equal(view[key], request[key], key);
  report.checks.push({ name: 'all_deck_option_fields_to_real_core', passed: true, groups: DECK_OPTION_GROUPS.length,
    fields: fields.length, fsrsParameters: 'empty reset only; nonempty optimization covered by native fsrs tests',
    fsrsReschedule: 'enabled separately on a card with a real review below' });

  const limitRequest = buildDeckConfigRequest(1, view, saved, saved, true, { ...request,
    limits: { ...view.currentDeck.limits, new: 2, review: 3, newToday: 0, newTodayActive: true,
      reviewToday: 0, reviewTodayActive: true, desiredRetention: .88 } });
  await rpc.DeckConfig_update_deck_configs(deck.encodeUpdateDeckConfigsRequest(limitRequest));
  view = await loadDeck();
  assert.equal(view.currentDeck.limits.newToday, 0);
  assert.equal(view.currentDeck.limits.reviewTodayActive, true);
  assert.equal(view.currentDeck.limits.desiredRetention, Math.fround(.88));
  assert.equal(scheduler.decodeQueuedCards(await rpc.Scheduler_get_queued_cards(scheduler.encodeGetQueuedCardsRequest(1, false))).cards.length, 0);
  const clearLimits = buildDeckConfigRequest(1, view, saved, saved, true, { ...request,
    limits: { review: null, new: null, reviewToday: null, newToday: null,
      reviewTodayActive: false, newTodayActive: false, desiredRetention: null } });
  await rpc.DeckConfig_update_deck_configs(deck.encodeUpdateDeckConfigsRequest(clearLimits));
  view = await loadDeck();
  assert.equal(view.currentDeck.limits.new, null);
  assert.equal(view.currentDeck.limits.newTodayActive, false);
  assert.equal(scheduler.decodeQueuedCards(await rpc.Scheduler_get_queued_cards(scheduler.encodeGetQueuedCardsRequest(1, false))).cards[0].cardId, fixture.cardId);
  report.checks.push({ name: 'deck_and_today_limits_drive_queue_and_clear_to_inheritance', passed: true });

  const preferenceValues = [7, 777, 61, 0, 0, 1, 1, 3, 2, 1, 19, 1, 0];
  assert.equal(Object.keys(prefs.ReviewPreferenceField).filter(key => !/^\d+$/.test(key)).length, preferenceValues.length);
  const edits = preferenceValues.map((value, field) => ({ field, value }));
  const before = await rpc.Config_get_preferences();
  const expected = prefs.decodeReviewPreferences(prefs.patchReviewPreferences(before, edits));
  await rpc.Config_set_preferences(prefs.patchReviewPreferences(before, edits));
  assert.deepEqual(prefs.decodeReviewPreferences(await rpc.Config_get_preferences()), expected);
  await rpc.Collection_close_collection();
  const open = new CollectionOpenCollectionRequest();
  open.setCollectionPath(fixture.directory + '/protocol.anki2');
  open.setMediaFolderPath(fixture.directory + '/media');
  open.setMediaDbPath(fixture.directory + '/media.db');
  await rpc.Collection_open_collection(open.toBytes());
  assert.deepEqual(prefs.decodeReviewPreferences(await rpc.Config_get_preferences()), expected);
  assert.deepEqual((await loadDeck()).allConfigs.find(item => item.config.id === saved.id).config.config, saved.config);
  report.checks.push({ name: 'all_collection_preferences_and_deck_config_survive_reopen', passed: true, preferences: edits.length });

  const queued = scheduler.decodeQueuedCards(await rpc.Scheduler_get_queued_cards(scheduler.encodeGetQueuedCardsRequest(1, false))).cards[0];
  await rpc.Scheduler_answer_card(scheduler.encodeCardAnswer({ cardId: fixture.cardId, currentState: queued.states.current,
    newState: queued.states.easy, rating: 3, answeredAtMillis: Date.now(), millisecondsTaken: 90000 }));
  const beforeFsrs = cards.decodeCard(await rpc.Cards_get_card(cards.encodeCardId(fixture.cardId)));
  assert.equal(beforeFsrs.memoryState, undefined);
  view = await loadDeck();
  const fsrsDraft = copyDeckConfig(view.allConfigs.find(item => item.config.id === view.currentDeck.configId).config);
  fsrsDraft.config.desiredRetention = .95;
  const fsrsRequest = buildDeckConfigRequest(1, view, saved, fsrsDraft, true,
    { ...request, limits: view.currentDeck.limits, fsrs: true, fsrsReschedule: true });
  await rpc.DeckConfig_update_deck_configs(deck.encodeUpdateDeckConfigsRequest(fsrsRequest));
  const afterFsrs = cards.decodeCard(await rpc.Cards_get_card(cards.encodeCardId(fixture.cardId)));
  assert.ok(afterFsrs.memoryState?.stability > 0);
  assert.equal(afterFsrs.desiredRetention, Math.fround(.95));
  assert.equal((await loadDeck()).fsrs, true);
  report.checks.push({ name: 'enable_fsrs_and_reschedule_updates_real_review_card', passed: true,
    beforeInterval: beforeFsrs.interval, afterInterval: afterFsrs.interval, desiredRetention: afterFsrs.desiredRetention });

  const Service = class {
    async 获取图表偏好() { return stats.decodeGraphPreferences(await rpc.Stats_get_graph_preferences()); }
    async 设置图表偏好(value) { await rpc.Stats_set_graph_preferences(stats.encodeGraphPreferences(value)); }
  };
  const graph = loadPlatformModule('backend/GraphPreferencesCommands.ts', '({saveGraphPreferences,graphPreferencesSnapshot})', { 统计服务: Service });
  const graphBefore = await new Service().获取图表偏好();
  assert.equal(graphBefore.browserLinksSupported, true);
  const graphAfter = { ...graphBefore, calendarFirstDayOfWeek: 1,
    cardCountsSeparateInactive: !graphBefore.cardCountsSeparateInactive, futureDueShowBacklog: !graphBefore.futureDueShowBacklog,
    browserLinksSupported: false };
  let graphError = '';
  try { await graph.saveGraphPreferences(graphAfter, graph.graphPreferencesSnapshot(graphBefore)); }
  catch (error) { graphError = error.message; }
  const actual = await new Service().获取图表偏好();
  assert.equal(actual.browserLinksSupported, true);
  if (graphError === 'graph_preferences_save_unverified') {
    assert.deepEqual(actual, { ...graphAfter, browserLinksSupported: true });
    report.findings.push({ id: 'graph_readonly_capability_exposed_as_writable', severity: 'P2',
      message: 'Core ignores browserLinksSupported=false, commits the other three settings, then production save reports unverified.',
      requested: graphAfter, actual });
  } else {
    assert.deepEqual(actual, graphError ? graphBefore : { ...graphAfter, browserLinksSupported: true });
    const writable = { calendarFirstDayOfWeek: 6, cardCountsSeparateInactive: true, futureDueShowBacklog: true };
    assert.throws(() => decodeWritablePreference('graph_preferences', JSON.stringify(graphAfter)), /invalid_setting_value/);
    const canonical = decodeWritablePreference('graph_preferences', JSON.stringify(writable));
    await graph.saveGraphPreferences(JSON.parse(canonical), graph.graphPreferencesSnapshot(actual));
    assert.deepEqual(await new Service().获取图表偏好(), { ...writable, browserLinksSupported: true });
    report.checks.push({ name: 'graph_readonly_capability_is_normalized_or_rejected_before_write', passed: true });
  }

  // Returning to the shared default also exercises its protection for future decks.
  view = await loadDeck();
  const defaultPreset = view.allConfigs.find(item => item.config.id === 1).config;
  await rpc.DeckConfig_update_deck_configs(deck.encodeUpdateDeckConfigsRequest(
    buildDeckConfigRequest(1, view, defaultPreset, defaultPreset, true, request)));
  let state;
  let submitted;
  const session = new DeckOptionsSession(1, { load: loadDeck,
    save: async input => { submitted = input; await rpc.DeckConfig_update_deck_configs(deck.encodeUpdateDeckConfigsRequest(input)); },
    committed() {} }, value => { state = value; });
  try {
    await session.load();
    assert.equal(state.phase, 'ready');
    const changed = copyDeckConfig(state.config);
    changed.config.newPerDay = 31;
    assert.equal(session.editPreset('rename', 'Audit renamed preset', changed), true);
    assert.equal(await session.save(copyDeckConfig(state.config), false, request), true);
    const afterRename = await loadDeck();
    if (submitted.configs.at(-1).id === 1) {
      assert.equal(afterRename.allConfigs.find(item => item.config.id === 1).config.config.newPerDay, 31);
      report.findings.push({ id: 'preset_rename_replaces_baseline_and_bypasses_deck_scope', severity: 'P1',
        message: 'Editing a field then renaming the preset replaces the original baseline. Saving with shared=false writes preset 1 instead of cloning it.',
        before: defaultPreset.config.newPerDay, requested: 31, submittedPresetId: submitted.configs.at(-1).id });
    } else {
      assert.equal(submitted.configs.at(-1).id, 0);
      assert.equal(afterRename.allConfigs.find(item => item.config.id === 1).config.config.newPerDay, defaultPreset.config.newPerDay);
      assert.equal(currentConfig(afterRename).name, 'Audit renamed preset');
      assert.equal(currentConfig(afterRename).config.newPerDay, 31);
      report.checks.push({ name: 'preset_rename_preserves_deck_only_scope', passed: true });
    }
  } finally { session.dispose(); }

  // Stage an edit on A, switch to B, and save with the deck-only scope still selected.
  view = await loadDeck();
  const switchDefault = view.allConfigs.find(item => item.config.id === 1).config;
  await saveRequest(buildDeckConfigRequest(1, view, switchDefault, switchDefault, true, optionsFor(view)));
  view = await loadDeck();
  const otherPreset = view.allConfigs.find(item => item.config.id !== 1).config;
  const defaultBeforeSwitch = view.allConfigs.find(item => item.config.id === 1).config;
  let switchedState;
  let switchedRequest;
  const switchSession = new DeckOptionsSession(1, { load: loadDeck,
    save: async input => { switchedRequest = input; await saveRequest(input); }, committed() {} }, value => { switchedState = value; });
  try {
    await switchSession.load();
    const changed = copyDeckConfig(switchedState.config); changed.config.newPerDay = 37;
    switchSession.editPreset('select', String(otherPreset.id), changed);
    assert.equal(await switchSession.save(copyDeckConfig(switchedState.config), false, optionsFor(view)), true);
    const after = await loadDeck();
    const defaultAfter = after.allConfigs.find(item => item.config.id === 1).config;
    if (defaultAfter.config.newPerDay !== defaultBeforeSwitch.config.newPerDay) {
      report.findings.push({ id: 'noncurrent_preset_edits_bypass_deck_scope', severity: 'P1',
        message: 'Editing A then selecting B commits the staged A globally even with shared=false.',
        before: defaultBeforeSwitch.config.newPerDay, after: defaultAfter.config.newPerDay,
        submittedPresetIds: switchedRequest.configs.map(config => config.id) });
    } else {
      assert.equal(after.currentDeck.configId, otherPreset.id);
      const isolated = switchedRequest.configs.find(config => config.id === 0 && config.config.newPerDay === 37);
      assert.ok(isolated, 'switched-away edits must be retained as an independent preset');
      assert.equal(after.allConfigs.find(item => item.config.name === isolated.name).config.config.newPerDay, 37);
      report.checks.push({ name: 'noncurrent_preset_edits_preserve_deck_only_scope', passed: true });
    }
  } finally { switchSession.dispose(); }

  // The actual global controller must keep Default's assignment even with multiple presets.
  view = await loadDeck();
  const defaultForToggle = view.allConfigs.find(item => item.config.id === 1).config;
  const sortedLast = copyDeckConfig(currentConfig(view)); sortedLast.name = 'ZZZ audit preset';
  const bindDefault = buildDeckConfigRequest(1, view, defaultForToggle, defaultForToggle, true, optionsFor(view));
  bindDefault.configs.unshift(sortedLast); await saveRequest(bindDefault);
  view = await loadDeck();
  assert.notEqual(view.allConfigs.at(-1).config.id, view.currentDeck.configId);
  const fsrsController = loadPlatformModule('model/FSRS控制器.ets', '({设置FSRS开启状态,确保FSRS已开启一次})', {
    UPDATE_DECK_CONFIGS_MODE_NORMAL: 0, AppStorage: { get: () => undefined, setOrCreate() {} }, hilog: { error() {} },
    牌组配置服务: class { async 获取牌组配置编辑视图(id) { return loadDeck(id); } async 更新牌组配置(input) { await saveRequest(input); } }
  });
  const assignmentBeforeToggle = view.currentDeck.configId;
  await fsrsController.设置FSRS开启状态(!view.fsrs);
  const afterToggle = await loadDeck();
  assert.equal(afterToggle.fsrs, !view.fsrs);
  if (afterToggle.currentDeck.configId !== assignmentBeforeToggle) {
    report.findings.push({ id: 'global_fsrs_toggle_reassigns_default_deck', severity: 'P1',
      message: 'The production global FSRS controller submits name-sorted presets; Core binds Default to the last preset.',
      beforePresetId: assignmentBeforeToggle, afterPresetId: afterToggle.currentDeck.configId,
      beforeNewPerDay: currentConfig(view).config.newPerDay, afterNewPerDay: currentConfig(afterToggle).config.newPerDay });
  } else {
    for (const enabled of [false, true, false]) {
      await fsrsController.设置FSRS开启状态(enabled);
      const saved = await loadDeck();
      assert.equal(saved.fsrs, enabled); assert.equal(saved.currentDeck.configId, assignmentBeforeToggle);
      assert.deepEqual(saved.currentDeck.limits, view.currentDeck.limits);
    }
    await fsrsController.确保FSRS已开启一次();
    const initialized = await loadDeck();
    assert.equal(initialized.fsrs, true); assert.equal(initialized.currentDeck.configId, assignmentBeforeToggle);
    for (const entry of view.allConfigs) {
      const saved = copyDeckConfig(initialized.allConfigs.find(item => item.config.id === entry.config.id).config);
      saved.mtimeSecs = entry.config.mtimeSecs; saved.usn = entry.config.usn;
      assert.deepEqual(deck.encodeDeckConfig(saved), deck.encodeDeckConfig(entry.config), 'global FSRS must preserve preset contents');
    }
    report.checks.push({ name: 'global_fsrs_toggle_preserves_default_deck_assignment', passed: true, initialization: true });
  }

  // Parent limits and review-limit coupling must change actual queues, not just round-trip.
  const parentId = await addDeck('Audit parent');
  const childId = await addDeck('Audit parent::Child');
  await rpc.Notes_add_note(encodeAddNoteRequest({ id: 0, guid: '', notetypeId: fixture.notetypeId,
    mtimeSecs: 0, usn: 0, tags: [], fields: ['parent limits audit', 'answer'] }, childId));
  const parentView = await loadDeck(parentId);
  await saveRequest(buildDeckConfigRequest(parentId, parentView, currentConfig(parentView), currentConfig(parentView), true,
    { ...optionsFor(parentView), limits: { ...parentView.currentDeck.limits, new: 0 } }));
  let childView = await loadDeck(childId);
  assert.ok(childView.currentDeck.parentConfigIds.length > 0);
  await saveRequest(buildDeckConfigRequest(childId, childView, currentConfig(childView), currentConfig(childView), true,
    { ...optionsFor(childView), limits: { ...childView.currentDeck.limits, new: 5, review: 5 }, applyAllParentLimits: false }));
  assert.equal((await queuedCards(childId)).length, 1);
  childView = await loadDeck(childId);
  await saveRequest(buildDeckConfigRequest(childId, childView, currentConfig(childView), currentConfig(childView), true,
    { ...optionsFor(childView), applyAllParentLimits: true }));
  assert.equal((await queuedCards(childId)).length, 0);
  childView = await loadDeck(childId);
  await saveRequest(buildDeckConfigRequest(childId, childView, currentConfig(childView), currentConfig(childView), true,
    { ...optionsFor(childView), limits: { ...childView.currentDeck.limits, review: 0 },
      applyAllParentLimits: false, newCardsIgnoreReviewLimit: false }));
  assert.equal((await queuedCards(childId)).length, 0);
  childView = await loadDeck(childId);
  await saveRequest(buildDeckConfigRequest(childId, childView, currentConfig(childView), currentConfig(childView), true,
    { ...optionsFor(childView), newCardsIgnoreReviewLimit: true }));
  assert.equal((await queuedCards(childId)).length, 1);
  report.checks.push({ name: 'parent_limits_and_new_cards_ignore_review_limit_drive_queue', passed: true });

  // Two searches and preview delays are exposed through JIDE's real filtered-deck owner.
  const filtered = decode过滤牌组更新(await rpc.Decks_get_or_create_filtered_deck(encodeDeckId(0)));
  filtered.name = 'Audit filtered'; filtered.allowEmpty = true;
  filtered.config.searchTerms = [{ search: 'nid:0', limit: 10, order: 0 }];
  const filteredId = decodeOpChangesWithId(await rpc.Decks_add_or_update_filtered_deck(encode过滤牌组更新(filtered)));
  const filteredCommands = new FilteredDeckCommands({
    read: async id => decode过滤牌组更新(await rpc.Decks_get_or_create_filtered_deck(encodeDeckId(id))),
    save: async value => decodeOpChangesWithId(await rpc.Decks_add_or_update_filtered_deck(encode过滤牌组更新(value))),
    empty: async id => { await rpc.Scheduler_empty_filtered_deck(encodeDeckId(id)); },
    rebuild: async id => decodeOpChangesWithCount(await rpc.Scheduler_rebuild_filtered_deck(encodeDeckId(id))), changed() {}
  });
  const patch = { reschedule: false, searchTerms: [{ search: 'deck:"Audit parent::Child"', limit: 10, order: 1 },
    { search: 'nid:0', limit: 20, order: 10 }], previewDelay: 7, previewAgainSecs: 15, previewHardSecs: 30, previewGoodSecs: 60 };
  const proposal = await filteredCommands.prepare(filteredId, JSON.stringify(patch));
  const result = await filteredCommands.save(proposal);
  for (const [key, value] of Object.entries(patch)) {
    if (key !== 'searchTerms') assert.deepEqual(result.config[key], value, key);
  }
  assert.deepEqual(result.config.searchTerms.map(({ limit, order }) => ({ limit, order })),
    patch.searchTerms.map(({ limit, order }) => ({ limit, order })));
  // Core canonicalizes search quoting; verify the selected card instead of literal syntax.
  const filteredCard = (await queuedCards(filteredId))[0];
  assert.equal(cards.decodeCard(await rpc.Cards_get_card(cards.encodeCardId(filteredCard.cardId))).originalDeckId, childId);
  await assert.rejects(filteredCommands.save(proposal), /filtered_deck_changed_since_proposal/);
  await filteredCommands.maintain(filteredId, 'empty_filtered');
  assert.equal((await queuedCards(filteredId)).length, 0);
  assert.equal(await filteredCommands.maintain(filteredId, 'rebuild_filtered'), 1);
  report.checks.push({ name: 'filtered_deck_two_searches_preview_delays_stale_guard_empty_rebuild', passed: true });

  let enumCases = 0;
  for (const fsrsEnabled of [false, true]) {
    const cases = fields.filter(field => field.kind === 'enum' && field.key !== 'newCardSortOrder')
      .flatMap(field => deckOptionChoices(field.key, fsrsEnabled).map(choice => [[field.key, choice.value]]));
    for (const gather of deckOptionChoices('newCardGatherPriority', fsrsEnabled)) {
      for (const sort of deckOptionChoices('newCardSortOrder', fsrsEnabled, gather.value))
        cases.push([['newCardGatherPriority', gather.value], ['newCardSortOrder', sort.value]]);
    }
    for (const edits of cases) {
      const before = await loadDeck(); const baseline = currentConfig(before);
      const form = 牌组配置表单.从配置创建(baseline.config);
      const options = 牌组选项编辑.从视图创建(before.currentDeck.limits, before.newCardsIgnoreReviewLimit,
        fsrsEnabled, before.applyAllParentLimits, before.fsrsHealthCheck);
      for (const [key, value] of edits) applyDeckOptionEdit(form, options, key, String(value), 'enum');
      const draft = prepareDeckOptionsDraft(baseline, form, options); assert.equal(draft.errorKey, '');
      const request = buildDeckConfigRequest(1, before, baseline, draft.config, true, draft.options);
      await saveRequest(request);
      assert.deepEqual(currentConfig(await loadDeck()).config, request.configs.at(-1).config);
      enumCases++;
    }
  }
  report.checks.push({ name: 'all_visible_enum_values_and_gather_sort_combinations_in_sm2_and_fsrs', passed: true, cases: enumCases });

  const unrelatedId = await addDeck('Audit unrelated');
  const unrelatedBefore = await loadDeck(unrelatedId);
  const parentBefore = await loadDeck(parentId);
  const parentDraft = copyDeckConfig(currentConfig(parentBefore)); parentDraft.config.newPerDay = 43;
  await saveRequest(buildDeckConfigRequest(parentId, parentBefore, currentConfig(parentBefore), parentDraft, false,
    { ...optionsFor(parentBefore), mode: deck.UPDATE_DECK_CONFIGS_MODE_APPLY_TO_CHILDREN }));
  const parentAfter = await loadDeck(parentId); const childAfter = await loadDeck(childId);
  assert.notEqual(parentAfter.currentDeck.configId, parentBefore.currentDeck.configId);
  assert.equal(childAfter.currentDeck.configId, parentAfter.currentDeck.configId);
  assert.equal(currentConfig(childAfter).config.newPerDay, 43);
  assert.deepEqual(childAfter.currentDeck.limits, parentAfter.currentDeck.limits);
  assert.equal((await loadDeck(unrelatedId)).currentDeck.configId, unrelatedBefore.currentDeck.configId);
  let removalState;
  const removal = new DeckOptionsSession(parentId, { load: loadDeck, save: saveRequest, committed() {} }, value => { removalState = value; });
  try {
    await removal.load();
    assert.equal(removal.editPreset('remove', '', copyDeckConfig(removalState.config)), true);
    assert.equal(await removal.save(copyDeckConfig(removalState.config), false, optionsFor(parentAfter)), true);
    const removed = await loadDeck(parentId);
    assert.ok(!removed.allConfigs.some(item => item.config.id === parentAfter.currentDeck.configId));
    assert.equal((await loadDeck(childId)).currentDeck.configId, removed.currentDeck.configId);
  } finally { removal.dispose(); }
  report.checks.push({ name: 'apply_to_children_and_remove_shared_preset_keep_unrelated_assignment', passed: true });

  view = await loadDeck();
  const assignmentBeforeCompute = view.currentDeck.configId;
  await saveRequest(buildDeckConfigRequest(1, view, currentConfig(view), currentConfig(view), true,
    { ...optionsFor(view), fsrs: true, mode: deck.UPDATE_DECK_CONFIGS_MODE_COMPUTE_ALL_PARAMS }));
  const afterCompute = await loadDeck();
  assert.equal(afterCompute.currentDeck.configId, assignmentBeforeCompute);
  assert.equal(afterCompute.fsrs, true);
  assert.deepEqual(afterCompute.allConfigs.map(item => item.config.id), view.allConfigs.map(item => item.config.id));
  assert.ok(afterCompute.allConfigs.every(item => [0, 17, 19, 21].includes(item.config.config.fsrsParams6.length)));
  report.checks.push({ name: 'compute_all_params_save_mode_preserves_target_assignment', passed: true,
    parameterLengths: afterCompute.allConfigs.map(item => item.config.config.fsrsParams6.length),
    note: 'empty parameters select Core defaults for insufficient history; trained parameter quality is outside this probe' });
} catch (error) {
  report.error = error.stack;
  process.exitCode = 2;
} finally {
  child.stdin.end();
  await exited;
  mkdirSync(new URL('./', output), { recursive: true });
  writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
  if (report.findings.length && !process.exitCode) process.exitCode = 1;
}
