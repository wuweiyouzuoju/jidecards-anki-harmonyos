// SPDX-License-Identifier: AGPL-3.0-or-later

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { loadComponentLogic, loadPlatformModule } from './platform-module-harness.mjs';
import { DEEPSEEK_PROVIDER, OPENAI_PROVIDER } from '../../entry/src/main/ets/model/agent/ProviderCatalog.ts';
import { normalizeBatchLimit } from '../../entry/src/main/ets/model/agent/AgentPolicy.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

test('draft UI shows exact impact and uses separate high-risk confirmation events', () => {
  const page = read('entry/src/main/ets/pages/AI制卡页.ets');
  assert.match(page, /affectedNoteIds/);
  assert.match(page, /affectedCardIds/);
  assert.match(page, /affectedDeckIds/);
  assert.match(page, /affectedNotetypeIds/);
  assert.match(page, /准备执行草稿/);
  assert.match(page, /打开高风险最终确认/);
  assert.match(page, /authorizeHighRisk/);
  assert.match(page, /executeHighRisk/);
  assert.match(page, /executeOrdinary/);
  assert.match(page, /永久/);
});

test('provider settings use dropdowns, remember provider/models and keep keys in Asset Store', () => {
  const settings = read('entry/src/main/ets/components/settings/AIAgent设置分组.ets');
  for (const key of ['ai_provider', 'ai_model', 'ai_batch_limit']) {
    assert.match(settings, new RegExp(`FormSelectRow\\(\\{ label: settingsItemText\\([^\\n]*'${key}'`));
  }
  const select = read('entry/src/main/ets/components/common/FormSelectRow.ets');
  assert.match(select, /Select\(this\.options\)\.selected\(this\.selectedIndex\)\.value\(this\.value\)/);
  assert.match(select, /\.onSelect\([\s\S]*?this\.select\(index\)/);
  assert.match(settings, /onSelect:[^\n]*this\.switchProvider\(index\)/);
  assert.match(settings, /onSelect:[^\n]*this\.deepseekModel = DEEPSEEK_PROVIDER\.models\[index\]/);
  assert.match(settings, /onSelect:[^\n]*this\.batchLimit = \[100, 250, 500, 1000\]\[index\]/);
  assert.match(settings, /DeepSeek/);
  // OpenAI 选项按产品要求在 UI 上隐藏（2026-09-02）；存档层仍保留 openai 模型记忆。
  assert.doesNotMatch(settings, /'OpenAI'/);
  assert.match(settings, /OPENAI_PROVIDER/);
  assert.match(settings, /openaiModel/);
  assert.match(settings, /ai_agent_provider_custom/);
  assert.match(settings, /loadAgentSettings/);
  assert.match(settings, /saveAgentSettings/);
  assert.match(settings, /loadAgentSecret/);
  assert.match(settings, /saveAgentSecret/);
  assert.match(settings, /customBaseUrl/);
  assert.match(settings, /customModel/);
  assert.doesNotMatch(settings, /preferences.*apiKey|apiKey.*preferences/si);
});

test('provider selection loads its own key and saving preserves model memories without storing secrets in settings', async () => {
  const defaultAgentSettings = loadPlatformModule('backend/agent/AgentSettingsStore.ets', 'defaultAgentSettings', {
    DEEPSEEK_PROVIDER, OPENAI_PROVIDER, normalizeBatchLimit
  });
  const initial = { ...defaultAgentSettings(), selectedProvider: 'custom', deepseekModel: 'deepseek-v4-pro',
    openaiModel: 'remembered-openai-model', customBaseUrl: 'https://gateway.example/v1', customModel: 'custom-model',
    customVisionEnabled: true, batchLimit: 250 };
  const reads = [], settingsWrites = [], secretWrites = [];
  const keys = { deepseek: 'test-deepseek-key', custom: 'test-custom-key' };
  const Component = loadComponentLogic('components/settings/AIAgent设置分组.ets', 'AIAgent设置分组', {
    DEEPSEEK_PROVIDER, OPENAI_PROVIDER, defaultAgentSettings,
    loadAgentSettings: async () => ({ ...initial }),
    saveAgentSettings: async value => settingsWrites.push({ ...value }),
    loadAgentSecret: async provider => { reads.push(provider); return keys[provider]; },
    saveAgentSecret: async (provider, secret) => secretWrites.push([provider, secret]),
    $r: key => ({ id: key }), AppStorage: { get: () => ({ resourceManager: { getStringSync: id => id } }) }
  });
  const component = new Component();
  await component.aboutToAppear();
  assert.equal(component.providerIndex(), 1);
  assert.equal(component.modelIndex(), 1);
  assert.deepEqual(component.modelOptions(), DEEPSEEK_PROVIDER.models.map(value => ({ value })));
  assert.equal(component.secret, keys.custom);
  await component.switchProvider(0);
  assert.equal(component.providerIndex(), 0);
  assert.equal(component.secret, keys.deepseek);
  assert.equal(component.deepseekModel, initial.deepseekModel);
  await component.switchProvider(1);
  assert.equal(component.secret, keys.custom);
  assert.deepEqual(reads, ['custom', 'deepseek', 'custom']);
  assert.deepEqual(settingsWrites, [], 'switching alone must not persist preferences');
  assert.deepEqual(secretWrites, [], 'switching alone must not persist credentials');
  await component.save();
  assert.deepEqual(settingsWrites, [initial]);
  assert.deepEqual(secretWrites, [['custom', keys.custom]]);
  assert.equal(component.saving, false);
  assert.equal(component.message, 'app.string.ai_agent_saved_securely');
  component.customBaseUrl = 'http://gateway.example/v1';
  await component.save();
  assert.equal(component.message, 'app.string.ai_agent_custom_invalid');
  assert.equal(settingsWrites.length, 1);
  assert.equal(secretWrites.length, 1);
});

test('shared page renders real streaming, tool and source events', () => {
  const page = read('entry/src/main/ets/pages/AI制卡页.ets');
  assert.match(page, /text_delta/);
  assert.match(page, /reasoning_delta|reasoning_summary/);
  assert.match(page, /tool_started/);
  assert.match(page, /search_source/);
  assert.match(page, /来源/);
});
