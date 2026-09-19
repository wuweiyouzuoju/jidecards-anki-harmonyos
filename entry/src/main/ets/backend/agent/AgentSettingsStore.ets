// SPDX-License-Identifier: AGPL-3.0-or-later

import { common } from '@kit.AbilityKit';
import { preferences } from '@kit.ArkData';
import { normalizeBatchLimit } from '../../model/agent/AgentPolicy';
import type { ProviderId } from '../../model/agent/AgentTypes';
import { DEEPSEEK_PROVIDER, OPENAI_PROVIDER, normalizeDeepSeekModel } from '../../model/agent/ProviderCatalog';

const STORE_NAME: string = 'jidecards_settings';
const CONTEXT_KEY: string = 'abilityContext';
const PROVIDER_KEY: string = 'ai_agent_provider';
const DEEPSEEK_MODEL_KEY: string = 'ai_agent_deepseek_model';
const OPENAI_MODEL_KEY: string = 'ai_agent_openai_model';
const CUSTOM_BASE_URL_KEY: string = 'ai_agent_custom_base_url';
const CUSTOM_MODEL_KEY: string = 'ai_agent_custom_model';
const BATCH_LIMIT_KEY: string = 'ai_agent_batch_limit';

const LEGACY_API_KEY: string = 'ai_api_key';
const LEGACY_BASE_URL_KEY: string = 'ai_base_url';
const LEGACY_MODEL_KEY: string = 'ai_model';

export interface AgentSettings {
  selectedProvider: ProviderId;
  deepseekModel: string;
  openaiModel: string;
  customBaseUrl: string;
  customModel: string;
  batchLimit: number;
}

export interface LegacyAIConfiguration {
  apiKey: string;
  baseUrl: string;
  model: string;
}

export function defaultAgentSettings(): AgentSettings {
  return {
    selectedProvider: 'deepseek',
    deepseekModel: DEEPSEEK_PROVIDER.defaultModel,
    openaiModel: OPENAI_PROVIDER.defaultModel,
    customBaseUrl: '',
    customModel: '',
    batchLimit: normalizeBatchLimit(100)
  };
}

/** 判断当前选中的 Provider 是否具备可发起请求的完整配置。 */
export function isAgentProviderConfigured(settings: AgentSettings, secret: string): boolean {
  const model: string = settings.selectedProvider === 'deepseek' ? settings.deepseekModel :
    (settings.selectedProvider === 'openai' ? settings.openaiModel : settings.customModel);
  if (secret.trim().length === 0 || model.trim().length === 0) { return false; }
  return settings.selectedProvider !== 'custom' || settings.customBaseUrl.trim().startsWith('https://');
}

function getContext(): common.UIAbilityContext | null {
  const context: common.UIAbilityContext | undefined =
    AppStorage.get<common.UIAbilityContext>(CONTEXT_KEY);
  return context === undefined ? null : context;
}

async function openStore(): Promise<preferences.Preferences | null> {
  const context: common.UIAbilityContext | null = getContext();
  if (context === null) {
    return null;
  }
  try {
    return await preferences.getPreferences(context, STORE_NAME);
  } catch (error) {
    return null;
  }
}

function stringValue(value: preferences.ValueType, fallback: string): string {
  return typeof value === 'string' ? value.trim() : fallback;
}

function providerValue(value: string): ProviderId {
  if (value === 'openai' || value === 'custom') {
    return value;
  }
  return 'deepseek';
}

export async function loadAgentSettings(): Promise<AgentSettings> {
  const defaults: AgentSettings = defaultAgentSettings();
  const store: preferences.Preferences | null = await openStore();
  if (store === null) {
    return defaults;
  }
  try {
    const provider: string = stringValue(await store.get(PROVIDER_KEY, defaults.selectedProvider), 'deepseek');
    const batchValue: preferences.ValueType = await store.get(BATCH_LIMIT_KEY, defaults.batchLimit);
    return {
      selectedProvider: providerValue(provider),
      deepseekModel: normalizeDeepSeekModel(stringValue(
        await store.get(DEEPSEEK_MODEL_KEY, defaults.deepseekModel), defaults.deepseekModel)),
      openaiModel: stringValue(
        await store.get(OPENAI_MODEL_KEY, defaults.openaiModel), defaults.openaiModel),
      customBaseUrl: stringValue(await store.get(CUSTOM_BASE_URL_KEY, ''), ''),
      customModel: stringValue(await store.get(CUSTOM_MODEL_KEY, ''), ''),
      batchLimit: normalizeBatchLimit(typeof batchValue === 'number' ? batchValue : defaults.batchLimit)
    };
  } catch (error) {
    return defaults;
  }
}

export async function saveAgentSettings(settings: AgentSettings): Promise<void> {
  const store: preferences.Preferences | null = await openStore();
  if (store === null) {
    throw new Error('agent_settings_unavailable');
  }
  await store.put(PROVIDER_KEY, settings.selectedProvider);
  await store.put(DEEPSEEK_MODEL_KEY, normalizeDeepSeekModel(settings.deepseekModel));
  await store.put(OPENAI_MODEL_KEY, settings.openaiModel.trim());
  await store.put(CUSTOM_BASE_URL_KEY, settings.customBaseUrl.trim());
  await store.put(CUSTOM_MODEL_KEY, settings.customModel.trim());
  await store.put(BATCH_LIMIT_KEY, normalizeBatchLimit(settings.batchLimit));
  await store.flush();
}

export async function loadLegacyAIConfiguration(): Promise<LegacyAIConfiguration> {
  const store: preferences.Preferences | null = await openStore();
  if (store === null) {
    return { apiKey: '', baseUrl: '', model: '' };
  }
  try {
    return {
      apiKey: stringValue(await store.get(LEGACY_API_KEY, ''), ''),
      baseUrl: stringValue(await store.get(LEGACY_BASE_URL_KEY, ''), ''),
      model: stringValue(await store.get(LEGACY_MODEL_KEY, ''), '')
    };
  } catch (error) {
    return { apiKey: '', baseUrl: '', model: '' };
  }
}

/** 只有调用方确认 Asset Store 写入成功后才能调用。 */
export async function clearLegacyAgentSecret(): Promise<void> {
  const store: preferences.Preferences | null = await openStore();
  if (store === null) {
    throw new Error('agent_settings_unavailable');
  }
  await store.delete(LEGACY_API_KEY);
  await store.flush();
}
