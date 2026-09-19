// SPDX-License-Identifier: AGPL-3.0-or-later

import type { ProviderCapabilities, ProviderId } from './AgentTypes';

export interface ProviderCatalogEntry {
  id: ProviderId;
  displayName: string;
  baseUrl: string;
  models: string[];
  defaultModel: string;
  isDefault: boolean;
  baseUrlEditable: boolean;
  modelEditable: boolean;
  capabilities: ProviderCapabilities;
}

export const DEEPSEEK_PROVIDER: ProviderCatalogEntry = {
  id: 'deepseek',
  displayName: 'DeepSeek',
  baseUrl: 'https://api.deepseek.com',
  models: [
    'deepseek-flash',
    'deepseek-v4-pro'
  ],
  defaultModel: 'deepseek-flash',
  isDefault: true,
  baseUrlEditable: false,
  modelEditable: false,
  capabilities: {
    text: true,
    image: false,
    audio: false,
    streaming: true,
    toolCalls: true,
    reasoning: true,
    webSearch: true
  }
};

/** 内置模型仅接受当前目录选项，已退役或空配置恢复为最新默认模型。 */
export function normalizeDeepSeekModel(model: string): string {
  const normalized: string = model.trim();
  return DEEPSEEK_PROVIDER.models.includes(normalized) ? normalized : DEEPSEEK_PROVIDER.defaultModel;
}

export const OPENAI_PROVIDER: ProviderCatalogEntry = {
  id: 'openai',
  displayName: 'OpenAI',
  baseUrl: 'https://api.openai.com/v1',
  models: ['gpt-5.6-luna', 'gpt-5.6-terra', 'gpt-5.6-sol'],
  defaultModel: 'gpt-5.6-luna',
  isDefault: false,
  baseUrlEditable: false,
  modelEditable: false,
  capabilities: {
    text: true,
    image: true,
    audio: false,
    streaming: true,
    toolCalls: true,
    reasoning: true,
    webSearch: true
  }
};

export function customProviderDefaults(): ProviderCatalogEntry {
  return {
    id: 'custom',
    displayName: 'Custom',
    baseUrl: '',
    models: [],
    defaultModel: '',
    isDefault: false,
    baseUrlEditable: true,
    modelEditable: true,
    capabilities: {
      text: true,
      image: false,
      audio: false,
      streaming: true,
      toolCalls: true,
      reasoning: false,
      webSearch: false
    }
  };
}

export function builtInProviders(): ProviderCatalogEntry[] {
  return [DEEPSEEK_PROVIDER, OPENAI_PROVIDER];
}
