// SPDX-License-Identifier: AGPL-3.0-or-later

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

function read(path) {
  return readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
}

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

test('all main settings groups share one card shell and rotating header', () => {
  const shell = read('entry/src/main/ets/components/settings/设置分组卡片.ets');
  assert.match(shell, /@BuilderParam\s+内容/);
  assert.match(shell, /设置面板色板_取\(this\.是否深色\)\.背景/);
  assert.match(shell, /\.padding\(应用尺寸\.卡片内边距\)/);
  assert.match(shell, /\.borderRadius\(应用尺寸\.圆角_卡片\)/);
  assert.match(shell, /Text\('▼'\)/);
  assert.match(shell,
    /\.rotate\(\{ angle: this\.是否展开 \? 0 : -90 \}\)\s*\.animation\(\{ duration: 150, curve: Curve\.EaseOut \}\)/);
  assert.doesNotMatch(shell, /animateTo\([\s\S]*?this\.切换展开回调/);
  assert.match(shell, /\.onClick\(\(\): void => \{\s*this\.切换展开回调\(\);\s*\}\)/);

  for (const name of [
    '外观分组.ets', '调度器分组.ets', '布局分组.ets', '同步分组.ets',
    'AIAgent设置分组.ets', '术语分组.ets', '数据分组.ets',
  ]) {
    const source = read(`entry/src/main/ets/components/settings/${name}`);
    assert.match(source, /设置分组卡片\(/, name);
    assert.doesNotMatch(source, /private 分组头部\(/, name);
  }

  const settings = read('entry/src/main/ets/components/设置面板.ets');
  assert.match(settings, /AIAgent设置分组\(\{[\s\S]*?是否深色:\s*this\.是否深色/);
  assert.ok((settings.match(/设置分组卡片\(/g) ?? []).length >= 3,
    'database, about, and experimental inline groups must use the shared shell');
});
