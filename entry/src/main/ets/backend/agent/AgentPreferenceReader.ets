// SPDX-License-Identifier: AGPL-3.0-or-later
import { common } from '@kit.AbilityKit';
import { preferences } from '@kit.ArkData';
import { agentPreferenceDefinitions, agentWritablePreferenceIds, decodeAgentPreference } from '../../model/agent/AgentPreferenceSettings';
import { readLocalPreference } from '../../utils/LocalPreferenceWrite';
import type { AgentPreferenceDefinition, AgentPreferenceValue } from '../../model/agent/AgentPreferenceSettings';

export interface AgentPreferenceState { id: string; value: AgentPreferenceValue; source: string; }

/** @throws {Error} 只读产品白名单；IO 失败原样传回，不用默认值伪造成功。 */
export async function readAgentPreference(id: string): Promise<AgentPreferenceState> {
  const definition: AgentPreferenceDefinition | undefined = agentPreferenceDefinitions().find(
    (item: AgentPreferenceDefinition): boolean => item.id === id);
  if (definition === undefined) { throw new Error('invalid_setting_id'); }
  const context: common.UIAbilityContext | undefined = AppStorage.get<common.UIAbilityContext>('abilityContext');
  if (context === undefined) { throw new Error('ability_context_unavailable'); }
  const store: preferences.Preferences = await preferences.getPreferences(context, definition.store);
  const stored: preferences.ValueType = agentWritablePreferenceIds().includes(id) ?
    await readLocalPreference(store, definition.key, definition.defaultValue) :
    await store.get(definition.key, definition.defaultValue);
  if (typeof stored !== 'string' && typeof stored !== 'boolean' && typeof stored !== 'number') {
    throw new Error('invalid_saved_setting:' + id);
  }
  return { id: id, value: decodeAgentPreference(definition, stored), source: 'saved_preference' };
}
