// SPDX-License-Identifier: AGPL-3.0-or-later

import { common } from '@kit.AbilityKit';
import { preferences } from '@kit.ArkData';

const SETTINGS_STORE: string = 'jidecards_settings';
const AI_AGENT_CHANNELS_PREFERENCE_KEY: string = 'developer_debug_agent_enabled';
const ABILITY_CONTEXT_KEY: string = 'abilityContext';
const DEVELOPER_DEBUG_KEY_NORMALIZED: string = 'jidecardsdeveloperdebug3.0.0';

/** AppStorage protocol key shared by every hidden Agent entry. */
export const AI_AGENT_CHANNELS_APP_STORAGE_KEY: string = 'aiAgentChannelsEnabled';

function normalizeDeveloperDebugKey(value: string): string {
  let normalized: string = '';
  const lower: string = value.trim().toLowerCase();
  for (let index: number = 0; index < lower.length; index += 1) {
    const character: string = lower.charAt(index);
    if (character !== ' ' && character !== '\t' && character !== '\r' && character !== '\n' &&
      character !== '+' && character !== '＋' && character !== '-' && character !== '_') {
      normalized += character;
    }
  }
  return normalized;
}

/**
 * The local developer key is a feature gate, not an authentication boundary.
 * Accepted spelling: "JideCards Developer Debug + 3.0.0" (case and separators are ignored).
 */
export function isDeveloperDebugKeyValid(value: string): boolean {
  return normalizeDeveloperDebugKey(value) === DEVELOPER_DEBUG_KEY_NORMALIZED;
}

function getAbilityContext(): common.UIAbilityContext | null {
  const context: common.UIAbilityContext | undefined =
    AppStorage.get<common.UIAbilityContext>(ABILITY_CONTEXT_KEY);
  return context === undefined ? null : context;
}

export async function loadAiAgentChannelsEnabled(): Promise<boolean> {
  const context: common.UIAbilityContext | null = getAbilityContext();
  if (context === null) {
    return false;
  }
  try {
    const store: preferences.Preferences = await preferences.getPreferences(context, SETTINGS_STORE);
    const value: preferences.ValueType = await store.get(AI_AGENT_CHANNELS_PREFERENCE_KEY, false);
    return value === true;
  } catch (error) {
    return false;
  }
}

/** Loads the persistent gate on process startup and broadcasts it to all ArkUI components. */
export async function initializeAiAgentChannels(): Promise<void> {
  const enabled: boolean = await loadAiAgentChannelsEnabled();
  AppStorage.setOrCreate<boolean>(AI_AGENT_CHANNELS_APP_STORAGE_KEY, enabled);
}

/** Validates the developer key and permanently enables the hidden Agent channels. */
export async function enableAiAgentChannels(developerKey: string): Promise<boolean> {
  if (!isDeveloperDebugKeyValid(developerKey)) {
    return false;
  }
  const context: common.UIAbilityContext | null = getAbilityContext();
  if (context === null) {
    throw new Error('ability_context_unavailable');
  }
  const store: preferences.Preferences = await preferences.getPreferences(context, SETTINGS_STORE);
  await store.put(AI_AGENT_CHANNELS_PREFERENCE_KEY, true);
  await store.flush();
  AppStorage.setOrCreate<boolean>(AI_AGENT_CHANNELS_APP_STORAGE_KEY, true);
  return true;
}
