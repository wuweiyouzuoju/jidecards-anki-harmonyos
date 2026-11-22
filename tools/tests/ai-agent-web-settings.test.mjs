// SPDX-License-Identifier: AGPL-3.0-or-later
import assert from 'node:assert/strict';
import test from 'node:test';
import { loadPlatformModule } from './platform-module-harness.mjs';
import { readFileSync } from 'node:fs';
import { normalizeAgentSearchProvider } from '../../entry/src/main/ets/model/agent/AgentSearchProvider.ts';

function settingsHarness() {
  const values = new Map();
  const state = { key: '', keys: new Map(), error: null, writes: [], flushes: 0 };
  const store = {
    async get(key, fallback) { return values.get(key) ?? fallback; },
    async put(key, value) { state.writes.push([key, value]); values.set(key, value); },
    async flush() { state.flushes++; }
  };
  const settings = loadPlatformModule('backend/agent/AgentSettingsStore.ets',
    '{loadAgentWebEnabled, saveAgentWebSettings, loadAgentSearchProvider}', {
      AppStorage: { get: () => ({}) }, preferences: { getPreferences: async () => store },
      loadAgentSearchSecret: async provider => { if (state.error) throw state.error; return state.keys.get(provider) ?? state.key; }, normalizeAgentSearchProvider
    });
  return { settings, state, values };
}

test('app web access is off by default and requires a saved key even for an old enabled preference', async () => {
  const { settings, state, values } = settingsHarness();
  state.key = 'saved-key';
  assert.equal(await settings.loadAgentSearchProvider(),'deepseek');
  assert.equal(await settings.loadAgentWebEnabled(), false, 'a key alone cannot opt in');
  values.set('ai_agent_web_enabled', true);
  state.key = '  ';
  assert.equal(await settings.loadAgentWebEnabled(), false);
  await assert.rejects(() => settings.saveAgentWebSettings('deepseek', true), /web_search_key_missing/);
  assert.deepEqual(state.writes, []);
  state.key = 'saved-key';
  await settings.saveAgentWebSettings('deepseek', true);
  assert.equal(await settings.loadAgentWebEnabled(), true);
  await settings.saveAgentWebSettings('deepseek', false);
  assert.equal(await settings.loadAgentWebEnabled(), false);
  assert.equal(state.key, 'saved-key', 'turning off preserves credentials');
  assert.equal(state.flushes, 2);
});

test('selected service alone determines readiness; an old Brave key cannot enable default Doubao',async()=>{
  const { settings,state,values }=settingsHarness();
  values.set('ai_agent_web_enabled',true);values.set('ai_agent_search_provider','doubao');state.keys.set('brave','old-brave-key');
  assert.equal(await settings.loadAgentSearchProvider(),'doubao');
  assert.equal(await settings.loadAgentWebEnabled(),false);
  await settings.saveAgentWebSettings('brave', true);
  assert.equal(await settings.loadAgentWebEnabled(),true);
  await settings.saveAgentWebSettings('doubao', false);
  assert.equal(await settings.loadAgentWebEnabled(),false);
  assert.equal(state.keys.get('brave'),'old-brave-key');
});

test('new search configurations default to DeepSeek, retain explicit providers and keep the switch required',async()=>{
  const {settings,state,values}=settingsHarness();
  state.keys.set('deepseek','model-key');
  assert.equal(await settings.loadAgentSearchProvider(),'deepseek');
  assert.equal(await settings.loadAgentWebEnabled(),false);
  values.set('ai_agent_web_enabled',true);
  assert.equal(await settings.loadAgentWebEnabled(),true);
  await settings.saveAgentWebSettings('doubao', false);
  assert.equal(await settings.loadAgentSearchProvider(),'doubao');
  assert.equal(await settings.loadAgentWebEnabled(),false);
});

test('credential storage failures remain visible when enabled and do not prevent turning web access off', async () => {
  const { settings, state, values } = settingsHarness();
  state.error = new Error('agent_secret_unavailable');
  assert.equal(await settings.loadAgentWebEnabled(), false, 'disabled access does not read credentials');
  values.set('ai_agent_web_enabled', true);
  await assert.rejects(settings.loadAgentWebEnabled, /agent_secret_unavailable/);
  await assert.rejects(() => settings.saveAgentWebSettings('deepseek', true), /agent_secret_unavailable/);
  assert.deepEqual(state.writes, []);
  await settings.saveAgentWebSettings('deepseek', false);
  assert.equal(await settings.loadAgentWebEnabled(), false);
});

test('configuration fields are conditional on the switch and purchase action has its own labeled row',()=>{
  const source=readFileSync(new URL('../../entry/src/main/ets/components/settings/AgentWebSettingsSection.ets',import.meta.url),'utf8');
  assert.match(source,/if \(this.webEnabled\) \{[\s\S]*FormSelectRow\([\s\S]*TextInput\(/);
  assert.match(source,/FormSelectRow\([\s\S]*LabeledActionRow\([\s\S]*actionLabel: settingsItemText\(this\.getUIContext\(\), 'ai_web_purchase', this\.uiLanguage\)/);
  assert.match(source,/onAction:.*this\.onPurchase\(\)/);
});


test('rejected combined write leaves the previously saved search provider and switch intact', async () => {
  const { settings,state,values } = settingsHarness();
  state.keys.set('deepseek','saved-key');
  await settings.saveAgentWebSettings('deepseek', true);
  await assert.rejects(() => settings.saveAgentWebSettings('brave', true), /web_search_key_missing/);
  assert.equal(await settings.loadAgentSearchProvider(),'deepseek');
  assert.equal(await settings.loadAgentWebEnabled(),true);
  assert.equal(values.get('ai_agent_web_enabled'),true);
  assert.equal(state.flushes,1);
});
