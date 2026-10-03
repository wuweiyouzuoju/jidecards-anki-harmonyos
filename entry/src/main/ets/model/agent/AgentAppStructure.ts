// SPDX-License-Identifier: AGPL-3.0-or-later
import { SETTINGS_ENTRIES, settingsEntryVisible } from '../SettingsNavigation';
import { SETTINGS_GROUPS, visibleSettingsGroups, settingsItemVisible } from '../SettingsStructure';
import type { SettingsGroup, SettingsItem } from '../SettingsStructure';
import { APP_INTERFACE_SURFACES, visibleInterfaceItems } from '../AppInterface';
import type { AppInterfaceContext, AppInterfaceObservation, AppInterfaceControl } from '../AppInterface';
import type { AgentSettingDefinition } from './AgentSettingsTools';
import type { ProviderFunctionTool } from './ProviderProtocol';

export interface AgentInterfaceItem {
  id: string; title: string; opens: string; visibility: string; condition: string;
  settingId: string; readTool: string; writeTool: string; sensitive: boolean;
  enabled?: boolean; selected?: boolean;
}
export interface AgentInterfaceGroup {
  id: string; title: string; visible: boolean; items: AgentInterfaceItem[];
}
export interface AgentInterfaceSection {
  id: string; title: string; description: string; visible: boolean; hiddenReason: string;
  cardCount: number; cards: AgentInterfaceGroup[];
}
export interface AgentInterfaceSurface {
  id: string; title: string; parent: string; declaredItemCount: number; items: AgentInterfaceItem[];
}
export interface AgentAppStructure {
  source: string; coverage: string[]; limitation: string; simpleMode: boolean;
  observations: AppInterfaceObservation[]; tools: AgentInterfaceTool[];
  surfaces: AgentInterfaceSurface[]; visibleSettingsSectionCount: number; sections: AgentInterfaceSection[];
  foregroundSurface: string;
  observationDetailsIncluded: boolean;
}
export interface AgentInterfaceTool { name: string; description: string; }

/** 每次调用从当前界面共同声明、资源语言和真实工具声明重新构建；不写入模型记忆。 */
export function buildAgentAppStructure(context: AppInterfaceContext, surfaceId: string, sectionId: string,
  localize: (key: string) => string, settings: AgentSettingDefinition[], tools: ProviderFunctionTool[],
  observations: AppInterfaceObservation[], foregroundSurface: string = ''): AgentAppStructure {
  const views: AppInterfaceObservation[] = observations.map((view: AppInterfaceObservation): AppInterfaceObservation => {
    const declaration = APP_INTERFACE_SURFACES.find((surface): boolean => surface.id === view.surface);
    const controls: AppInterfaceControl[] | undefined = view.items?.map((item: AppInterfaceControl): AppInterfaceControl =>
      ({ id: item.id, title: item.titleKey === undefined ? item.title : localize(item.titleKey), titleKey: item.titleKey,
        enabled: item.enabled, selected: item.selected }));
    return { surface: view.surface, titleKey: view.titleKey, controlsComplete: view.controlsComplete,
      sectionId: view.sectionId, selectedId: view.selectedId, optionIds: view.optionIds,
      optionLabels: view.optionLabels.map((label: string, index: number): string => {
        const control = controls?.find((item): boolean => item.id === view.optionIds[index]);
        const item = declaration?.items.find((entry): boolean => entry.id === view.optionIds[index]);
        return control?.title ?? (item === undefined ? label : localize(item.titleKey));
      }), optionsTotal: view.optionsTotal, busy: view.busy, items: controls, values: view.values };
  });
  const names: string[] = tools.map((tool: ProviderFunctionTool): string => tool.name);
  const sections: AgentInterfaceSection[] = [];
  if (surfaceId === 'app' || surfaceId === 'settings') {
    for (const section of SETTINGS_ENTRIES) {
      if (sectionId !== '' && sectionId !== section.id) continue;
      const visible: boolean = settingsEntryVisible(section, context.simple, context.agent);
      const visibleGroups: SettingsGroup[] = visibleSettingsGroups(section.id, context.simple, context.agent);
      const cards: AgentInterfaceGroup[] = SETTINGS_GROUPS.filter((group: SettingsGroup): boolean =>
        group.sectionId === section.id).map((group: SettingsGroup): AgentInterfaceGroup => ({
          id: group.id, title: localize(group.titleKey), visible: visibleGroups.some((entry): boolean => entry.id === group.id),
          items: sectionId === '' ? [] : group.items.map((item: SettingsItem): AgentInterfaceItem => {
            const capability = settings.find((setting: AgentSettingDefinition): boolean => setting.id === item.settingId);
            let visibility: string = !visible || (group.fullOnly && context.simple) ||
              !settingsItemVisible(item, context.simple, context.themeHasTextures) ? 'hidden' : 'available_in_section';
            if (visibility !== 'hidden' && item.condition === 'agent_disabled' && context.agent) visibility = 'hidden';
            if (visibility !== 'hidden' && item.condition === 'agent_enabled' && !context.agent) visibility = 'hidden';
            if (visibility !== 'hidden' && item.condition !== undefined &&
              !['theme_has_textures', 'agent_enabled', 'agent_disabled'].includes(item.condition)) visibility = 'conditional';
            return { id: item.id, title: localize(item.titleKey), opens: '', visibility: visibility,
              condition: item.condition ?? '', settingId: item.settingId ?? '',
              readTool: capability !== undefined && names.includes('get_settings') ? 'get_settings' : '',
              writeTool: capability?.writable && names.includes(capability.writeTool) ? capability.writeTool : '',
              sensitive: item.sensitive === true };
          })
        }));
      sections.push({ id: section.id, title: localize(section.titleKey),
        description: localize(context.simple ? (section.simpleDescriptionKey ?? section.descriptionKey) : section.descriptionKey),
        visible: visible, hiddenReason: visible ? '' : (section.fullOnly && context.simple ? 'simple_mode' : 'agent_disabled'),
        cardCount: visibleGroups.length, cards: cards });
    }
  }
  const surfaces: AgentInterfaceSurface[] = [];
  for (const surface of APP_INTERFACE_SURFACES) {
    if (surfaceId !== 'app' && surfaceId !== surface.id) continue;
    const visibleIds: string[] = visibleInterfaceItems(surface.id, context).map((item): string => item.id);
    const observation = views.find((view: AppInterfaceObservation): boolean => view.surface === surface.id);
    surfaces.push({ id: surface.id, title: localize(observation?.titleKey ?? surface.titleKey), parent: surface.parent,
      declaredItemCount: surface.items.length,
      items: surfaceId === 'app' ? [] : surface.items.map((item): AgentInterfaceItem => {
        const control = observation?.items?.find((entry): boolean => entry.id === item.id);
        const liveMenu: boolean = ['home_create', 'study_more'].includes(surface.id) && observation !== undefined;
        const absentControl: boolean = control === undefined && (observation?.controlsComplete === true ||
          (surface.id === 'study' && item.condition !== undefined && observation?.items !== undefined));
        return { id: item.id, title: localize(control?.titleKey ?? item.titleKey), opens: item.opens ?? '',
          visibility: !visibleIds.includes(item.id) || absentControl || (liveMenu && observation !== undefined && !observation.optionIds.includes(item.id)) ? 'hidden' :
            control !== undefined ? 'observed' : (item.condition === undefined ? 'available_in_surface' : 'conditional'),
          condition: item.condition ?? '', enabled: control?.enabled, selected: control?.selected,
          settingId: '', readTool: '', writeTool: '', sensitive: false };
      }).concat((observation?.items ?? []).filter((control): boolean => !surface.items.some((item): boolean => item.id === control.id))
        .map((control): AgentInterfaceItem => ({ id: control.id, title: control.title, opens: '', visibility: 'observed', condition: '',
          enabled: control.enabled, selected: control.selected, settingId: '', readTool: '', writeTool: '', sensitive: false }))) });
  }
  return { source: 'shared_ui_declarations_and_live_observations',
    coverage: APP_INTERFACE_SURFACES.map((surface): string => surface.id).concat(['settings']),
    limitation: 'Semantic interface structure, not a pixel screenshot. foregroundSurface comes from page visibility callbacks; empty means unknown or background. Observations describe mounted registered surfaces and can belong to a hidden page. observed/disabled controls are UI facts, not agent permissions. Conditional content without observation remains unknown. Destinations outside coverage have no detailed interface description. Secret values are never included.',
    foregroundSurface: foregroundSurface, simpleMode: context.simple,
    observationDetailsIncluded: surfaceId !== 'app',
    observations: surfaceId === 'app' ? views.map((view): AppInterfaceObservation =>
      ({ surface: view.surface, titleKey: view.titleKey, sectionId: view.sectionId, selectedId: view.selectedId,
        optionIds: [], optionLabels: [], optionsTotal: view.optionsTotal, busy: view.busy })) :
      views.filter((view): boolean => view.surface === surfaceId),
    tools: tools.map((tool: ProviderFunctionTool): AgentInterfaceTool => ({ name: tool.name, description: tool.description })), surfaces: surfaces,
    visibleSettingsSectionCount: SETTINGS_ENTRIES.filter((section): boolean => settingsEntryVisible(section, context.simple, context.agent)).length,
    sections: sections };
}
