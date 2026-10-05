// SPDX-License-Identifier: AGPL-3.0-or-later
import assert from 'node:assert/strict';
import test from 'node:test';
import { loadComponentLogic, loadPlatformModule } from './platform-module-harness.mjs';
import { readFileSync } from 'node:fs';
import { normalizeAgentSearchProvider, agentSearchPurchaseUrl } from '../../entry/src/main/ets/model/agent/AgentSearchProvider.ts';

function settingsHarness() {
  const values = new Map();
  const state = { key: '', keys: new Map(), error: null, writes: [], flushes: 0 };
  const store = {
    async get(key, fallback) { return values.get(key) ?? fallback; },
    async put(key, value) { state.writes.push([key, value]); values.set(key, value); },
    async flush() { state.flushes++; }
  };
  const settings = loadPlatformModule('backend/agent/AgentSettingsStore.ets',
    '{loadAgentWebEnabled, saveAgentWebEnabled, loadAgentSearchProvider, saveAgentSearchProvider}', {
      AppStorage: { get: () => ({}) }, preferences: { getPreferences: async () => store },
      loadAgentSearchSecret: async provider => { if (state.error) throw state.error; return state.keys.get(provider) ?? state.key; }, normalizeAgentSearchProvider
    });
  return { settings, state, values };
}

test('app web access is off by default and requires a saved key even for an old enabled preference', async () => {
  const { settings, state, values } = settingsHarness();
  state.key = 'saved-key';
  assert.equal(await settings.loadAgentSearchProvider(),'doubao');
  assert.equal(await settings.loadAgentWebEnabled(), false, 'a key alone cannot opt in');
  values.set('ai_agent_web_enabled', true);
  state.key = '  ';
  assert.equal(await settings.loadAgentWebEnabled(), false);
  await assert.rejects(() => settings.saveAgentWebEnabled(true), /web_search_key_missing/);
  assert.deepEqual(state.writes, []);
  state.key = 'saved-key';
  await settings.saveAgentWebEnabled(true);
  assert.equal(await settings.loadAgentWebEnabled(), true);
  await settings.saveAgentWebEnabled(false);
  assert.equal(await settings.loadAgentWebEnabled(), false);
  assert.equal(state.key, 'saved-key', 'turning off preserves credentials');
  assert.equal(state.flushes, 2);
});

test('selected service alone determines readiness; an old Brave key cannot enable default Doubao',async()=>{
  const { settings,state,values }=settingsHarness();
  values.set('ai_agent_web_enabled',true);state.keys.set('brave','old-brave-key');
  assert.equal(await settings.loadAgentSearchProvider(),'doubao');
  assert.equal(await settings.loadAgentWebEnabled(),false);
  await settings.saveAgentSearchProvider('brave');
  assert.equal(await settings.loadAgentWebEnabled(),true);
  await settings.saveAgentSearchProvider('doubao');
  assert.equal(await settings.loadAgentWebEnabled(),false);
  assert.equal(state.keys.get('brave'),'old-brave-key');
});

test('credential storage failures remain visible when enabled and do not prevent turning web access off', async () => {
  const { settings, state, values } = settingsHarness();
  state.error = new Error('agent_secret_unavailable');
  assert.equal(await settings.loadAgentWebEnabled(), false, 'disabled access does not read credentials');
  values.set('ai_agent_web_enabled', true);
  await assert.rejects(settings.loadAgentWebEnabled, /agent_secret_unavailable/);
  await assert.rejects(() => settings.saveAgentWebEnabled(true), /agent_secret_unavailable/);
  assert.deepEqual(state.writes, []);
  await settings.saveAgentWebEnabled(false);
  assert.equal(await settings.loadAgentWebEnabled(), false);
});

function componentHarness() {
  const writes = [];
  const Component = loadComponentLogic('components/settings/AgentWebSettingsSection.ets', 'AgentWebSettingsSection', {
    $r: key => key, resourceText: (_, resource) => resource,
    loadAgentWebEnabled: async () => false, loadAgentSearchProvider: async () => 'doubao',
    loadAgentSearchSecret: async provider => provider === 'brave' ? 'brave-key' : '',
    saveAgentSearchSecret: async (key,provider) => writes.push(['key', key,provider]),
    saveAgentSearchProvider: async provider => writes.push(['provider',provider]),
    saveAgentWebEnabled: async value => writes.push(['enabled', value]), agentSearchPurchaseUrl,
    pasteboard:{MIMETYPE_TEXT_PLAIN:'text',createData:(_,url)=>url,getSystemPasteboard:()=>({setData:async url=>writes.push(['copy',url])})}
  });
  const component = new Component();
  component.getUIContext = () => ({});
  return { component, writes };
}

test('web settings turn on to reveal configuration, then reject saving without a key', async () => {
  const { component, writes } = componentHarness();
  assert.equal(component.webEnabled, false);
  await component.aboutToAppear();
  component.secret = '  ';
  component.changeEnabled(true);
  assert.equal(component.webEnabled, true);
  assert.equal(writes.length,0,'opening configuration does not opt into network access');
  await component.save();
  assert.equal(component.message, 'app.string.ai_web_key_required');
  assert.equal(writes.length,0);
  component.secret = 'new-key';
  component.changeEnabled(true);
  await component.save();
  assert.deepEqual(writes, [['key', 'new-key','doubao'], ['provider','doubao'], ['enabled', true]]);
  component.secret = '';
  await component.save();
  assert.equal(writes.length, 3, 'clearing input while on must not remove the saved key');
  component.changeEnabled(false);
  await component.save();
  assert.deepEqual(writes.slice(3), [['key', '','doubao'], ['provider','doubao'], ['enabled', false]]);
});

test('switching search services loads only its own key and purchase link follows the selection', async()=>{
  const { component, writes } = componentHarness();
  await component.aboutToAppear();component.changeEnabled(true);
  assert.equal(component.searchProvider,'doubao');
  let opened;
  component.getUIContext=()=>({getHostContext:()=>({startAbility:async want=>{opened=want;}})});
  await component.openPurchase();
  assert.equal(opened.uri,'https://console.volcengine.com/search-infinity/web-search');
  await component.switchProvider(1);
  assert.equal(component.secret,'brave-key');
  await component.openPurchase();assert.equal(opened.uri,agentSearchPurchaseUrl('brave'));
  await component.save();assert.deepEqual(writes.slice(0,2),[['key','brave-key','brave'],['provider','brave']]);
  component.getUIContext=()=>({getHostContext:()=>({startAbility:async()=>{throw new Error('no browser');}})});
  await component.openPurchase();assert.deepEqual(writes.at(-1),['copy',agentSearchPurchaseUrl('brave')]);
});

test('configuration fields are conditional on the switch and purchase action has its own labeled row',()=>{
  const source=readFileSync(new URL('../../entry/src/main/ets/components/settings/AgentWebSettingsSection.ets',import.meta.url),'utf8');
  assert.match(source,/if \(this.webEnabled\) \{[\s\S]*FormSelectRow\([\s\S]*TextInput\(/);
  assert.match(source,/FormSelectRow\([\s\S]*LabeledActionRow\([\s\S]*actionLabel: settingsItemText\(this\.getUIContext\(\), 'ai_web_purchase', this\.uiLanguage\)/);
  assert.match(source,/onAction:.*this\.openPurchase\(\)/);
});

test('busy and disposed settings reject late switch and save callbacks', async () => {
  const { component, writes } = componentHarness();
  await component.aboutToAppear();
  component.secret = 'new-key';
  component.saving = true;
  component.changeEnabled(true);
  await component.save();
  assert.equal(component.webEnabled, false);
  component.saving = false;
  component.aboutToDisappear();
  component.changeEnabled(true);
  await component.save();
  assert.equal(component.webEnabled, false);
  assert.deepEqual(writes, []);
});
