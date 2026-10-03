// SPDX-License-Identifier: AGPL-3.0-or-later

import { common } from '@kit.AbilityKit';
import { preferences } from '@kit.ArkData';
import { normalizeBatchLimit } from '../../model/agent/AgentPolicy';
import type { ProviderId } from '../../model/agent/AgentTypes';
import { DEEPSEEK_PROVIDER, OPENAI_PROVIDER, normalizeDeepSeekModel } from '../../model/agent/ProviderCatalog';
import { loadAgentSearchSecret } from './AgentSecretStore';
import { normalizeAgentSearchProvider } from '../../model/agent/AgentSearchProvider';
import type { AgentSearchProvider } from '../../model/agent/AgentSearchProvider';

const STORE_NAME: string = 'jidecards_settings';
const CONTEXT_KEY: string = 'abilityContext';
const PROVIDER_KEY: string = 'ai_agent_provider';
const DEEPSEEK_MODEL_KEY: string = 'ai_agent_deepseek_model';
const OPENAI_MODEL_KEY: string = 'ai_agent_openai_model';
const CUSTOM_BASE_URL_KEY: string = 'ai_agent_custom_base_url';
const CUSTOM_MODEL_KEY: string = 'ai_agent_custom_model';
const CUSTOM_VISION_KEY: string = 'ai_agent_custom_vision';
const BATCH_LIMIT_KEY: string = 'ai_agent_batch_limit';
const WEB_ENABLED_KEY: string = 'ai_agent_web_enabled';
const SEARCH_PROVIDER_KEY: string = 'ai_agent_search_provider';

const LEGACY_API_KEY: string = 'ai_api_key';
const LEGACY_BASE_URL_KEY: string = 'ai_base_url';
const LEGACY_MODEL_KEY: string = 'ai_model';

export interface AgentSettings {
  selectedProvider: ProviderId;
  deepseekModel: string;
  openaiModel: string;
  customBaseUrl: string;
  customModel: string;
  customVisionEnabled?: boolean;
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
      customVisionEnabled: await store.get(CUSTOM_VISION_KEY, false) === true,
      batchLimit: normalizeBatchLimit(typeof batchValue === 'number' ? batchValue : defaults.batchLimit)
    };
  } catch (error) {
    return defaults;
  }
}

/** @throws {Error} 设置提交或旧密钥清理失败，由设置/迁移入口处理。 */
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
  await store.put(CUSTOM_VISION_KEY, settings.customVisionEnabled === true);
  await store.put(BATCH_LIMIT_KEY, normalizeBatchLimit(settings.batchLimit));
  await store.flush();
}

/** @throws {Error} 联网偏好读取失败，不把存储错误当作用户关闭联网。 */
export async function loadAgentWebEnabled(): Promise<boolean> {
  const store: preferences.Preferences | null = await openStore();
  if (store === null) { throw new Error('agent_settings_unavailable'); }
  if (await store.get(WEB_ENABLED_KEY, false) !== true) { return false; }
  const provider: AgentSearchProvider = normalizeAgentSearchProvider(stringValue(await store.get(SEARCH_PROVIDER_KEY, 'doubao'), 'doubao'));
  return (await loadAgentSearchSecret(provider)).trim().length > 0;
}

/** @throws {Error} 联网偏好提交失败，由设置入口展示失败。 */
export async function saveAgentWebEnabled(value: boolean): Promise<void> {
  if (value && (await loadAgentSearchSecret(await loadAgentSearchProvider())).trim().length === 0) {
    throw new Error('web_search_key_missing');
  }
  const store: preferences.Preferences | null = await openStore();
  if (store === null) { throw new Error('agent_settings_unavailable'); }
  await store.put(WEB_ENABLED_KEY, value);
  await store.flush();
}

/** @throws {Error} 搜索服务配置读取失败。 */
export async function loadAgentSearchProvider(): Promise<AgentSearchProvider> {
  const store: preferences.Preferences | null = await openStore();
  if (store === null) { throw new Error('agent_settings_unavailable'); }
  return normalizeAgentSearchProvider(stringValue(await store.get(SEARCH_PROVIDER_KEY, 'doubao'), 'doubao'));
}

/** @throws {Error} 搜索服务配置保存失败。 */
export async function saveAgentSearchProvider(provider: AgentSearchProvider): Promise<void> {
  const store: preferences.Preferences | null = await openStore();
  if (store === null) { throw new Error('agent_settings_unavailable'); }
  await store.put(SEARCH_PROVIDER_KEY, provider);
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
/** @throws {Error} 设置提交或旧密钥清理失败，由设置/迁移入口处理。 */
export async function clearLegacyAgentSecret(): Promise<void> {
  const store: preferences.Preferences | null = await openStore();
  if (store === null) {
    throw new Error('agent_settings_unavailable');
  }
  await store.delete(LEGACY_API_KEY);
  await store.flush();
}
