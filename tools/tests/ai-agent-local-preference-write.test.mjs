// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { localPreferenceApi } from './local-preference-harness.mjs';
import { loadComponentLogic } from './platform-module-harness.mjs';
import { readFileSync } from 'node:fs';

test('shared preference queue orders manual and confirmed writes; reads never see an unfinished save', async () => {
  const cache = new Map([['size',100]]), app = new Map(), events = [];
  let release;
  const blocked = new Promise(resolve => { release = resolve; });
  const api = localPreferenceApi({setOrCreate:(key,value) => { app.set(key,value); events.push(['apply',value]); }});
  const store = {getSync:(key,fallback) => cache.get(key) ?? fallback,
    putSync:(key,value) => { cache.set(key,value); events.push(['put',value]); },
    flush: async () => { events.push(['flush']); await blocked; }};
  const manual = api.saveLocalPreference(store,'size',120,100);
  await new Promise(resolve => setImmediate(resolve));
  const confirmed = api.saveLocalPreference(store,'size',150,100,100);
  let readDone = false;
  const reading = api.readLocalPreference(store,'size',100).then(value => { readDone = true; return value; });
  assert.equal(cache.get('size'),120); assert.equal(app.has('size'),false); assert.equal(readDone,false);
  const stale = assert.rejects(confirmed,/setting_changed_since_proposal/);
  release(); await manual; await stale;
  assert.equal(await reading,120);
  assert.deepEqual(events,[['put',120],['flush'],['apply',120]]);
  await api.saveLocalPreference(store,'size',150,100,120);
  assert.equal(app.get('size'),150,'failed work must not poison the shared queue');
});

test('readback mismatch and corrupt types cannot publish success', async () => {
  const app = new Map(); let value = true, mismatch = false;
  const api = localPreferenceApi({setOrCreate:(key,next) => app.set(key,next)});
  const store = {getSync:() => value, putSync:(_key,next) => { value = next; },
    flush:async () => { if (mismatch) value = true; }};
  mismatch = true;
  await assert.rejects(api.saveLocalPreference(store,'haptics',false,true,true),error =>
    error instanceof api.LocalPreferenceWriteError && error.saved === false);
  assert.equal(app.size,0);
  value = 'false';
  await assert.rejects(api.readLocalPreference(store,'haptics',true),/invalid_saved_setting/);
  await assert.rejects(api.saveLocalPreference(store,'haptics',false,true),/invalid_saved_setting/);
});

test('font control follows shared setting updates while preserving its own in-flight selection', () => {
  const Control = loadComponentLogic('components/settings/CardTextSizeControl.ets','CardTextSizeControl', {
    DEFAULT_CARD_TEXT_SIZE:100
  });
  const control = new Control();
  control.savedSize = 140; control.syncSavedSize(); assert.equal(control.selectedSize,140);
  control.saving = true; control.selectedSize = 160; control.savedSize = 150;
  control.syncSavedSize(); assert.equal(control.selectedSize,160);
});

test('confirmation previews use actual localized names and values for font, width and haptics', () => {
  for (const locale of ['base','en_US']) {
    const resources = new Map(JSON.parse(readFileSync(new URL(
      `../../entry/src/main/resources/${locale}/element/string.json`,import.meta.url),'utf8')).string.map(x => [x.name,x.value]));
    const Control = loadComponentLogic('components/agent/AgentActionCard.ets','AgentActionCard', {
      $r: name => name.split('.').at(-1),
      resourceText: (_context,key) => resources.get(key), namedResourceText: (_context,key) => resources.get(key)
    });
    const control = new Control(); control.getUIContext = () => ({});
    for (const [id,before,after,label,beforeText,afterText] of [
      ['card_text_size','100','130','card_text_size','100%','130%'],
      ['deck_list_style','single_wide','double_narrow','deck_width',resources.get('deck_style_single_wide'),resources.get('deck_style_double_narrow')],
      ['study_haptics','true','false','settings_study_haptics',resources.get('ai_agent_setting_on'),resources.get('ai_agent_setting_off')]
    ]) {
      control.action = {kind:'setting_change',payloadJson:JSON.stringify({settingId:id,before,after})};
      assert.equal(control.settingLabel(),label);
      assert.equal(control.settingValue(before),beforeText); assert.equal(control.settingValue(after),afterText);
      assert.ok(resources.get(control.settingScope()));
      assert.notEqual(control.settingScope(),'ai_agent_setting_fsrs_scope');
    }
  }
});
