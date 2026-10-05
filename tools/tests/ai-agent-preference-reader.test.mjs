// SPDX-License-Identifier: AGPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import { agentPreferenceDefinitions, agentWritablePreferenceIds, decodeAgentPreference } from '../../entry/src/main/ets/model/agent/AgentPreferenceSettings.ts';
import { localPreferenceApi } from './local-preference-harness.mjs';
import { loadPlatformModule } from './platform-module-harness.mjs';
import * as appearance from '../../entry/src/main/ets/model/DeckListAppearance.ts';
const legacyDeckListStyle = loadPlatformModule('utils/DeckListAppearanceStore.ets', 'legacyDeckListStyle', appearance);

test('real preference reader reads only requested catalog keys, distinguishes missing defaults from IO failure, and never writes', async () => {
  const state = { context: {}, calls: [], value: undefined, fail: false };
  const read = loadPlatformModule('backend/agent/AgentPreferenceReader.ets', 'readAgentPreference', {
    agentPreferenceDefinitions, agentWritablePreferenceIds, decodeAgentPreference, legacyDeckListStyle,
    ...localPreferenceApi({}),
    AppStorage: {get: () => state.context},
    preferences: {async getPreferences(context,name) {
      if (state.fail) throw Error('unreadable');
      const get = (key,fallback) => { state.calls.push([name,key]); return state.value ?? fallback; };
      return {getSync: get, get};
    }}
  });
  for (const definition of agentPreferenceDefinitions()) {
    const output = await read(definition.id);
    assert.equal(output.value, decodeAgentPreference(definition,definition.defaultValue));
    assert.deepEqual(state.calls.at(-1),[definition.store,definition.key]);
    assert.deepEqual(Object.keys(output),['id','value','source']);
  }
  const previous = state.calls.length;
  await assert.rejects(read('sync_hkey'), /invalid_setting_id/);
  assert.equal(state.calls.length,previous);
  state.fail = true; await assert.rejects(read('simple_mode'), /unreadable/);
  state.fail = false; state.context = undefined;
  await assert.rejects(read('simple_mode'), /ability_context_unavailable/);
  state.context = {}; state.value = ['unsafe'];
  await assert.rejects(read('simple_mode'), /invalid_saved_setting/);
  state.value = 'true'; await assert.rejects(read('simple_mode'), /invalid_saved_setting/);
  state.value = 201; await assert.rejects(read('card_text_size'), /invalid_saved_setting/);
  state.value = 'invalid'; await assert.rejects(read('study_layout'), /invalid_saved_setting/);
  state.value = 'true'; await assert.rejects(read('sync_media'), /invalid_saved_setting/);
});

test('preference domain rejects corrupt types, enums and numeric ranges instead of coercing saved values', () => {
  const definitions = agentPreferenceDefinitions();
  for (const [id,value] of [['simple_mode',1],['card_text_size',NaN],['card_text_size',99.5],
    ['card_text_size',49],['stats_hours_range',4],['stats_days_range',7],['sync_media',true]]) {
    assert.throws(() => decodeAgentPreference(definitions.find(x => x.id === id),value), /invalid_saved_setting/);
  }
  assert.equal(decodeAgentPreference(definitions.find(x => x.id === 'sync_media'),'0'),false);
});
