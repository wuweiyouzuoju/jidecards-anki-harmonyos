// SPDX-License-Identifier: AGPL-3.0-or-later
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, readdirSync } from 'node:fs';
import { motionApi } from './motion-harness.mjs';
import { loadPlatformModule, loadComponentLogic } from './platform-module-harness.mjs';
import { localPreferenceApi } from './local-preference-harness.mjs';
import * as model from '../../entry/src/main/ets/model/MotionStyle.ts';
import { SETTINGS_GROUPS } from '../../entry/src/main/ets/model/SettingsStructure.ts';
import { agentSettingDefinitions } from '../../entry/src/main/ets/model/agent/AgentSettingsTools.ts';

test('both profiles update menus immediately, preserve anchor and close without geometry animation', () => {
  const api = motionApi();
  const effect = (kind, value) => ({kind, value,
    combine(other) { this.combined = other; return this; },
    animation(options) { this.options = options; return this; }});
  const Surface = loadPlatformModule('components/common/MenuSurface.ets', 'MenuSurface', {
    ...api, TransitionEffect: {opacity: value => effect('opacity', value), scale: value => effect('scale', value),
      asymmetric: (enter, exit) => ({enter, exit})}
  });
  for (const [style, scale, enterMs, exitMs] of [['restrained', 0.98, 150, 150], ['lively', 0.94, 220, 140], ['restrained', 0.98, 150, 150]]) {
    api.setStyle(style);
    const result = Surface.popupTransition('100%', 88);
    assert.deepEqual(result.enter.combined.value, {x:scale, y:scale, centerX:'100%', centerY:88});
    assert.equal(result.enter.options.duration, enterMs);
    assert.equal(result.exit.options.duration, exitMs);
    assert.equal(result.exit.combined, undefined);
    assert.equal(typeof result.enter.options.curve === 'object', style === 'lively');
  }
});

test('lively presses reset on release and disable without calling unsupported modifier animation', () => {
  const api = motionApi('lively');
  const Feedback = loadPlatformModule('utils/PressFeedback.ets', 'PressFeedback', api);
  const state = {};
  const node = {opacity(value) { state.opacity=value; return this; }, scale(value) { state.scale=value; return this; },
    animation() { throw Error('animation is unsupported in AttributeModifier'); }};
  const feedback = new Feedback(0.6);
  for (let i=0; i<8; i++) {
    feedback.applyPressedAttribute(node);
    assert.equal(state.opacity, 0.6*0.72); assert.deepEqual(state.scale, {x:0.975, y:0.975});
    feedback.applyNormalAttribute(node);
    assert.equal(state.opacity, 0.6); assert.deepEqual(state.scale, {x:1, y:1});
  }
  feedback.applyDisabledAttribute(node);
  assert.equal(state.opacity, 0.4); assert.deepEqual(state.scale, {x:1, y:1});
  api.setStyle('restrained'); feedback.applyPressedAttribute(node);
  assert.deepEqual(state.scale, {x:1, y:1});
});

test('screen-size duration cache does not cache user style and respects existing device duration', () => {
  for (const [width, height, dpi, base] of [[1080,2400,400,200], [1920,2560,320,250], [1920,2560,200,300], [0,0,0,250]]) {
    const api = motionApi(); let reads = 0;
    const timing = loadPlatformModule('utils/转场时长.ets', '({取全屏转场时长,取全屏转场曲线})', {
      ...api, display: {getDefaultDisplaySync() { reads++; return {width,height,densityDPI:dpi}; }}
    });
    assert.equal(timing.取全屏转场时长(), base);
    api.setStyle('lively'); assert.equal(timing.取全屏转场时长(), base+40);
    assert.deepEqual(timing.取全屏转场曲线(), {spring:[0,1,280,24]});
    api.setStyle('restrained'); assert.equal(timing.取全屏转场时长(), base);
    assert.equal(reads, 1);
    assert.equal(api.navigationEnterOffset(true), 0);
    api.setStyle('lively'); assert.equal(api.navigationEnterOffset(true), 16); assert.equal(api.navigationEnterOffset(false), -16);
  }
});

function storeFixture() {
  const cache = new Map(), disk = new Map(), active = new Map();
  const state = {fail:false};
  const AppStorage = {get: () => ({}), setOrCreate: (key,value) => active.set(key,value)};
  const queue = localPreferenceApi(AppStorage);
  const store = {getSync: (key,fallback) => cache.has(key) ? cache.get(key) : fallback,
    putSync: (key,value) => cache.set(key,value),
    async flush() { if (state.fail) throw Error('disk full'); for (const [key,value] of cache) disk.set(key,value); }};
  const api = loadPlatformModule('utils/MotionStyleStore.ets', '({initializeMotionStyle, saveMotionStyle})', {
    ...model, ...queue, AppStorage, preferences:{getPreferencesSync:()=>store}, hilog:{warn(){}}
  });
  return {cache,disk,active,state,...api};
}

test('motion setting persists and restores, rejects stale changes, and does not publish failed saves', async () => {
  const f = storeFixture();
  f.initializeMotionStyle(); assert.equal(f.active.get(model.MOTION_STYLE_KEY),'restrained');
  await assert.rejects(f.saveMotionStyle('invalid'), /invalid_setting_value/);
  await f.saveMotionStyle('lively','restrained');
  assert.equal(f.disk.get(model.MOTION_STYLE_KEY),'lively'); assert.equal(f.active.get(model.MOTION_STYLE_KEY),'lively');
  f.initializeMotionStyle(); assert.equal(f.active.get(model.MOTION_STYLE_KEY),'lively');
  await assert.rejects(f.saveMotionStyle('restrained','restrained'), /setting_changed_since_proposal/);
  f.state.fail=true; await assert.rejects(f.saveMotionStyle('restrained'), /disk full/);
  assert.equal(f.cache.get(model.MOTION_STYLE_KEY),'lively'); assert.equal(f.active.get(model.MOTION_STYLE_KEY),'lively');
  f.state.fail=false; await f.saveMotionStyle('restrained');
  assert.equal(f.disk.get(model.MOTION_STYLE_KEY),'restrained');
});

test('setting control excludes concurrent and invalid changes and restores displayed selection after failure', async () => {
  let reject; const saved=[];
  const pending = new Promise((_resolve, failed) => {reject=failed;});
  const Control = loadComponentLogic('components/settings/MotionStyleControl.ets', 'MotionStyleControl', {
    ...model, saveMotionStyle: style => {saved.push(style); return pending;}
  });
  const control = new Control();
  for (const index of [-1,0,2]) await control.selectStyle(index);
  const task = control.selectStyle(1); assert.equal(control.saving,true);
  await control.selectStyle(1); assert.deepEqual(saved,['lively']);
  reject(Error('disk full')); await task;
  assert.equal(control.style,'restrained'); assert.equal(control.saveFailed,true);
  assert.equal(control.selectionRevision,1); assert.equal(control.saving,false);
});

test('appearance and JIDE share the motion name, both profiles and an actual confirmed write tool', () => {
  const item = SETTINGS_GROUPS.find(group=>group.id==='appearance').items.find(item=>item.id==='motion_style');
  assert.equal(item.titleKey,'motion_style'); assert.equal(item.settingId,'motion_style'); assert.equal(item.condition,undefined);
  const setting = agentSettingDefinitions().find(item=>item.id==='motion_style');
  assert.equal(setting.writable,true); assert.equal(setting.writeTool,'propose_set_setting');
  assert.deepEqual(setting.allowedValues,['restrained','lively']);
  for (const locale of ['base','en_US']) {
    const strings = new Map(JSON.parse(readFileSync(new URL(`../../entry/src/main/resources/${locale}/element/string.json`,import.meta.url),'utf8')).string.map(item=>[item.name,item.value]));
    for (const key of ['motion_style','motion_style_restrained','motion_style_lively','motion_style_hint','motion_style_save_failed']) assert.ok(strings.get(key));
  }
});

test('native dialog and disclosure variants use the shared profile, with card documents outside its scope', () => {
  const root = new URL('../../entry/src/main/ets/',import.meta.url);
  const files = readdirSync(root,{recursive:true}).filter(path=>path.endsWith('.ets'));
  let dialogs=0, arrows=0;
  for (const path of files) {
    const source=readFileSync(new URL(path.replaceAll('\\','/'),root),'utf8');
    assert.doesNotMatch(source,/TransitionEffect\.scale\(\{ x: 0\.96, y: 0\.96 \}\)/,path);
    if (source.includes('SurfaceTransition.dialog()')) dialogs++;
    if (source.includes('disclosureAnimation()')) arrows++;
  }
  assert.ok(dialogs>=15); assert.ok(arrows>=5);
  for (const path of ['model/CardWebBuffer.ts','model/CardWebSession.ts','model/学习卡片HTML构建器.ts']) {
    assert.doesNotMatch(readFileSync(new URL(path,root),'utf8'),/AppMotion|MotionStyle|rotate[XY]/,path);
  }
});
