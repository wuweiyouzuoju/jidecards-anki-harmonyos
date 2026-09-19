// SPDX-License-Identifier: AGPL-3.0-or-later

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import test from 'node:test';
import { DEEPSEEK_PROVIDER, OPENAI_PROVIDER, normalizeDeepSeekModel } from '../../entry/src/main/ets/model/agent/ProviderCatalog.ts';
import { normalizeBatchLimit } from '../../entry/src/main/ets/model/agent/AgentPolicy.ts';

function read(path) {
  return readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
}

test('settings load and save retire old DeepSeek models without altering other provider preferences', async () => {
  const values = new Map([
    ['ai_agent_provider', 'custom'],
    ['ai_agent_custom_base_url', 'https://gateway.example/v1'],
    ['ai_agent_custom_model', 'custom-model'],
    ['ai_agent_openai_model', 'gpt-5.6-sol'],
  ]);
  const store = {
    get: async (key, fallback) => values.get(key) ?? fallback,
    put: async (key, value) => values.set(key, value),
    flush: async () => {},
  };
  const source = stripTypeScriptTypes(read('entry/src/main/ets/backend/agent/AgentSettingsStore.ets')
    .replace(/^import .*;\r?\n/gm, '').replace(/^export /gm, ''));
  const settingsApi = new Function('preferences', 'AppStorage', 'DEEPSEEK_PROVIDER', 'OPENAI_PROVIDER',
    'normalizeDeepSeekModel', 'normalizeBatchLimit', `${source}\nreturn { loadAgentSettings, saveAgentSettings };`)(
    { getPreferences: async () => store }, { get: () => ({}) }, DEEPSEEK_PROVIDER, OPENAI_PROVIDER,
    normalizeDeepSeekModel, normalizeBatchLimit);
  for (const oldModel of ['deepseek-v4-flash', 'deepseek-v4-flash-vision-exp', 'deepseek-chat', '']) {
    values.set('ai_agent_deepseek_model', oldModel);
    const loaded = await settingsApi.loadAgentSettings();
    assert.equal(loaded.deepseekModel, 'deepseek-flash');
    assert.equal(loaded.selectedProvider, 'custom');
    assert.equal(loaded.customBaseUrl, 'https://gateway.example/v1');
    assert.equal(loaded.customModel, 'custom-model');
    assert.equal(loaded.openaiModel, 'gpt-5.6-sol');
    loaded.deepseekModel = oldModel;
    await settingsApi.saveAgentSettings(loaded);
    assert.equal(values.get('ai_agent_deepseek_model'), 'deepseek-flash');
  }
  values.set('ai_agent_deepseek_model', 'deepseek-v4-pro');
  const pro = await settingsApi.loadAgentSettings();
  assert.equal(pro.deepseekModel, 'deepseek-v4-pro');
  await settingsApi.saveAgentSettings(pro);
  assert.equal(values.get('ai_agent_deepseek_model'), 'deepseek-v4-pro');
});

test('agent settings remember provider models, custom coordinates, and batch limit', () => {
  const store = read('entry/src/main/ets/backend/agent/AgentSettingsStore.ets');
  for (const key of [
    'ai_agent_provider',
    'ai_agent_deepseek_model',
    'ai_agent_openai_model',
    'ai_agent_custom_base_url',
    'ai_agent_custom_model',
    'ai_agent_batch_limit',
  ]) {
    assert.match(store, new RegExp(key));
  }
  assert.doesNotMatch(store, /PRIVACY_NOTICE|privacyNoticeAccepted|ai_agent_privacy_notice_accepted/);
  assert.doesNotMatch(store, /searchMode|SEARCH_MODE|ai_agent_search_mode/,
    'web search is permanently disabled: no search preference may be stored or loaded');
  assert.match(store, /normalizeBatchLimit/);
  assert.match(store, /ProviderId/);
  assert.match(store, /isAgentProviderConfigured/);
  assert.match(store, /customBaseUrl\.trim\(\)\.startsWith\('https:\/\/'\)/);
});

test('provider secrets use Asset Store aliases and never Preferences', () => {
  const secretStore = read('entry/src/main/ets/backend/agent/AgentSecretStore.ets');
  assert.match(secretStore, /@kit\.AssetStoreKit/);
  assert.match(secretStore, /asset\.Tag\.ALIAS/);
  assert.match(secretStore, /asset\.Tag\.SECRET/);
  assert.match(secretStore, /asset\.ReturnType\.ALL/);
  assert.match(secretStore, /asset\.Accessibility\.DEVICE_FIRST_UNLOCKED/);
  assert.match(secretStore, /jidecards\.ai\.provider\./);
  assert.doesNotMatch(secretStore, /preferences|ArkData|console\.|hilog/);
});

test('legacy AI config migrates plaintext only after a successful Asset Store write', () => {
  const legacy = read('entry/src/main/ets/model/AI制卡存储.ets');
  assert.match(legacy, /saveAgentSecret/);
  assert.match(legacy, /clearLegacyAgentSecret/);
  assert.match(legacy, /await\s+saveAgentSecret[\s\S]*clearLegacyAgentSecret/);
  assert.doesNotMatch(legacy, /put\(API密钥键/);
  assert.doesNotMatch(legacy, /密钥明文存沙箱/);
});

test('legacy compatibility facade resolves built-in URLs from provider catalog', () => {
  const legacy = read('entry/src/main/ets/model/AI制卡存储.ets');
  assert.match(legacy, /DEEPSEEK_PROVIDER/);
  assert.match(legacy, /OPENAI_PROVIDER/);
  assert.match(legacy, /loadAgentSettings/);
  assert.match(legacy, /loadAgentSecret/);
  assert.match(legacy, /saveAgentSettings/);
});

test('detail settings use static sections and the data page keeps a single action list', () => {
  const shell = read('entry/src/main/ets/components/settings/设置分组卡片.ets');
  assert.match(shell, /@BuilderParam\s+内容/);
  assert.match(shell, /设置面板色板_取\(this\.是否深色\)\.背景/);
  assert.match(shell, /\.padding\(\{ left: 应用尺寸\.卡片内边距, right: 应用尺寸\.卡片内边距, top: 8, bottom: 8 \}\)/);
  assert.match(shell, /\.borderRadius\(16\)/);
  assert.doesNotMatch(shell, /是否展开|切换展开回调|\.rotate\(/);
  assert.match(shell, /this\.内容\(\)/);
  assert.match(shell, /this\.打开说明回调\(this\.帮助标题/);

  for (const name of [
    '外观分组.ets', '调度器分组.ets', '布局分组.ets', '同步分组.ets',
    'AIAgent设置分组.ets', '术语分组.ets', 'GeneralSettings.ets', 'ReviewControlsSettings.ets',
  ]) {
    const source = read(`entry/src/main/ets/components/settings/${name}`);
    assert.match(source, /设置分组卡片\(/, name);
    assert.doesNotMatch(source, /private 分组头部\(/, name);
  }

  const settings = read('entry/src/main/ets/components/设置面板.ets');
  assert.match(settings, /AIAgent设置分组\(\{[\s\S]*?是否深色:\s*this\.是否深色/);
  assert.ok((settings.match(/设置分组卡片\(/g) ?? []).length >= 1,
    'about uses the shared shell');
  const data = read('entry/src/main/ets/components/settings/数据分组.ets');
  assert.doesNotMatch(data, /设置分组卡片\(|settings_data_management/,
    'data actions do not repeat the page title or create a separate maintenance card');
  assert.match(data, /this\.onCheckDatabase\(\)/);
});
