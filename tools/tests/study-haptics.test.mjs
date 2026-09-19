// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';

const read = path => readFileSync(new URL('../../' + path, import.meta.url), 'utf8');
const root = 'entry/src/main/ets/';
const source = read(root + 'utils/StudyHaptics.ets');
const js = stripTypeScriptTypes(source.replace(/^import .*$/gm, '').replace(/^export /gm, ''));
const tick = () => new Promise(resolve => setImmediate(resolve));

function harness(supported = true) {
  let disk = new Map(), memory = new Map(), fail = false;
  const storage = new Map([['abilityContext', {}]]), calls = [], queries = [];
  const store = {
    getSync: (key, fallback) => memory.has(key) ? memory.get(key) : fallback,
    putSync: (key, value) => memory.set(key, value),
    flush: async () => { if (fail) throw new Error('disk full'); disk = new Map(memory); }
  };
  const vibrator = {
    isSupportEffect: async id => { queries.push(id); return supported; },
    startVibration: async (effect, attributes) => { calls.push({ effect, attributes }); }
  };
  const dependencies = {
    AppStorage: { get: key => storage.get(key), setOrCreate: (key, value) => storage.set(key, value) },
    preferences: { getPreferencesSync: () => store }, vibrator,
    hilog: { warn() {}, debug() {} }
  };
  const create = () => new Function(...Object.keys(dependencies), js +
    '\nreturn { initializeStudyHaptics, saveStudyHaptics, playStudyHaptic, STUDY_HAPTICS_KEY };')(...Object.values(dependencies));
  let api = create();
  return {
    get api() { return api; }, storage, vibrator, calls, queries,
    fail: value => { fail = value; },
    restart: () => { memory = new Map(disk); storage.clear(); storage.set('abilityContext', {}); api = create(); api.initializeStudyHaptics(); }
  };
}

test('haptics default on, persist off across restart, and can be enabled again', async () => {
  const h = harness();
  h.api.initializeStudyHaptics(); await tick();
  assert.equal(h.storage.get(h.api.STUDY_HAPTICS_KEY), true);
  await h.api.playStudyHaptic();
  assert.deepEqual(h.calls[0], { effect: { type: 'preset', effectId: 'haptic.effect.soft', count: 1 }, attributes: { usage: 'touch' } });
  await h.api.saveStudyHaptics(false);
  h.restart(); await tick();
  await h.api.playStudyHaptic();
  assert.equal(h.calls.length, 1);
  await h.api.saveStudyHaptics(true);
  await h.api.playStudyHaptic();
  assert.equal(h.calls.length, 2);
});

test('failed save preserves effective preference, cached preference and persisted choice', async () => {
  const h = harness();
  h.api.initializeStudyHaptics();
  await h.api.saveStudyHaptics(false);
  h.fail(true);
  await assert.rejects(h.api.saveStudyHaptics(true), /disk full/);
  assert.equal(h.storage.get(h.api.STUDY_HAPTICS_KEY), false);
  h.api.initializeStudyHaptics();
  assert.equal(h.storage.get(h.api.STUDY_HAPTICS_KEY), false);
  h.restart();
  assert.equal(h.storage.get(h.api.STUDY_HAPTICS_KEY), false);
});

test('unsupported soft effect uses one short touch vibration, without querying on every rating', async () => {
  const h = harness(false);
  h.api.initializeStudyHaptics(); await tick();
  for (let rating = 0; rating < 4; rating++) await h.api.playStudyHaptic();
  assert.equal(h.queries.length, 1);
  assert.equal(h.calls.length, 4);
  for (const call of h.calls) assert.deepEqual(call, { effect: { type: 'time', duration: 20 }, attributes: { usage: 'touch' } });
});

test('device query and vibration failures do not escape into the study flow', async () => {
  const h = harness();
  h.vibrator.isSupportEffect = () => { throw new Error('no motor'); };
  h.api.initializeStudyHaptics(); await tick();
  for (const start of [() => { throw new Error('unsupported'); }, async () => { throw new Error('system unavailable'); }]) {
    h.vibrator.startVibration = start;
    await assert.doesNotReject(h.api.playStudyHaptic());
  }
});

function method(source, name) {
  const start = source.search(new RegExp(`  (?:private )?(?:async )?${name}\\(`));
  assert.ok(start >= 0, name);
  return source.slice(start, source.indexOf('\n  }', start) + 4);
}

test('all ratings vibrate once after guards, never wait for haptics, and reject double clicks', async () => {
  const studySource = read(root + 'pages/学习页.ets');
  let haptics = 0;
  const Page = new Function('playStudyHaptic', stripTypeScriptTypes(`class Page { ${method(studySource, '评分')} }`) + '; return Page;')(
    () => { haptics++; return new Promise(() => {}); });
  for (const rating of [0, 1, 2, 3]) {
    let release, answers = 0, loads = 0;
    const gate = new Promise(resolve => { release = resolve; });
    const page = new Page();
    Object.assign(page, { studyGuideVisible: false, 评分中: false, 阶段: 'answer', 当前卡片: {}, requestVersion: 0,
      isCurrentRequest: () => true, invalidateCardWork() {},
      studySession: { answer: async (_card, value) => { assert.equal(value, rating); answers++; await gate; } },
      加载下一张卡: async () => { loads++; page.阶段 = 'question'; }, 消费待重渲染() {}, maybeShowStudyGuide() {} });
    const before = haptics;
    const answering = page.评分(rating);
    await page.评分(rating);
    assert.equal(answers, 1);
    assert.equal(haptics, before + 1);
    release(); await answering;
    assert.equal(loads, 1);
    for (const state of [{ 阶段: 'question' }, { 阶段: 'answer', studyGuideVisible: true },
      { studyGuideVisible: false, 当前卡片: null }, { 当前卡片: {}, isCurrentRequest: () => false }]) {
      Object.assign(page, state); await page.评分(rating);
    }
    assert.equal(haptics, before + 1);
  }
});

test('existing settings toggle saves once and restores display on failure', async () => {
  const layout = read(root + 'components/settings/布局分组.ets');
  let release, writes = 0;
  const gate = new Promise(resolve => { release = resolve; });
  const Control = new Function('saveStudyHaptics', stripTypeScriptTypes(`class Control { ${method(layout, 'changeStudyHaptics')} }`) + '; return Control;')(
    async () => { writes++; await gate; throw new Error('disk full'); });
  const control = new Control();
  Object.assign(control, { hapticsSaving: false, hapticsSaveFailed: false, hapticsEnabled: true, hapticsToggle: true });
  const saving = control.changeStudyHaptics(false);
  assert.equal(control.hapticsToggle, false);
  await control.changeStudyHaptics(false);
  assert.equal(writes, 1);
  release(); await saving;
  assert.equal(control.hapticsToggle, true);
  assert.equal(control.hapticsSaveFailed, true);
  assert.equal(control.hapticsSaving, false);
});

test('startup, permission and existing settings row are wired', () => {
  const ability = read(root + 'entryability/EntryAbility.ets');
  assert.match(ability, /initializeStudyHaptics\(\);/);
  assert.match(read('entry/src/main/module.json5'), /ohos\.permission\.VIBRATE/);
  const layout = read(root + 'components/settings/布局分组.ets');
  assert.match(layout, /settings_study_haptics/);
  assert.match(layout, /this\.changeStudyHaptics\(enabled\)/);
});
