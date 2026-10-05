// SPDX-License-Identifier: AGPL-3.0-or-later
import type { AppInterfaceObservation, AppInterfaceValue } from '../AppInterface';
import { APP_NAVIGATION_ACTIONS } from '../navigation/AppNavigation';
import type { ProviderFunctionTool } from './ProviderProtocol';

export interface AgentRecommendationDefinition {
  id: string; promptKey: string; reasonKey: string; requiredTools: string[]; action: string;
}

/** 建议规则与提示目录共用于结构工具和空会话；只描述已经接通的能力。 */
export const AGENT_APP_RECOMMENDATIONS: AgentRecommendationDefinition[] = [
  { id: 'document_cards', promptKey: 'ai_agent_context_document', reasonKey: 'ai_agent_context_document_reason',
    requiredTools: ['list_documents', 'read_document_page', 'create_flashcards'], action: '' },
  { id: 'study_help', promptKey: 'ai_agent_context_study_help', reasonKey: 'ai_agent_context_study_help_reason',
    requiredTools: ['get_app_structure', 'search_anki_help', 'read_anki_help'], action: '' },
  { id: 'study_summary', promptKey: 'ai_agent_context_study_summary', reasonKey: 'ai_agent_context_study_summary_reason',
    requiredTools: ['list_decks', 'get_learning_overview'], action: '' },
  { id: 'browser_empty', promptKey: 'ai_agent_context_browser_empty', reasonKey: 'ai_agent_context_browser_empty_reason',
    requiredTools: ['get_app_structure', 'search_anki_help', 'read_anki_help'], action: '' },
  { id: 'browser_selection', promptKey: 'ai_agent_context_browser_selection', reasonKey: 'ai_agent_context_browser_selection_reason',
    requiredTools: ['get_app_structure'], action: '' },
  { id: 'deck_study', promptKey: 'ai_agent_context_deck_study', reasonKey: 'ai_agent_context_deck_study_reason',
    requiredTools: ['list_decks', 'navigate_app'], action: 'start_study' },
  { id: 'deck_empty', promptKey: 'ai_agent_context_deck_empty', reasonKey: 'ai_agent_context_deck_empty_reason',
    requiredTools: ['list_decks', 'request_create_target', 'create_flashcards'], action: '' },
  { id: 'deck_limits', promptKey: 'ai_agent_context_deck_limits', reasonKey: 'ai_agent_context_deck_limits_reason',
    requiredTools: ['list_decks', 'get_deck_options', 'get_learning_overview'], action: '' },
  { id: 'deck_overview', promptKey: 'ai_agent_context_deck_overview', reasonKey: 'ai_agent_context_deck_overview_reason',
    requiredTools: ['list_decks', 'get_learning_overview'], action: '' }
];

export interface AgentAppRecommendation {
  id: string; promptKey: string; reasonKey: string;
  sourceSurface: string; contextSurface: string; evidence: AppInterfaceValue[];
  requiredTools: string[]; action: string; requiresUserRequest: boolean;
}

function count(view: AppInterfaceObservation, id: string): number | null {
  const text: string | undefined = view.values?.find((value): boolean => value.id === id)?.value;
  if (text === undefined || !new RegExp('^(0|[1-9][0-9]*)$').test(text)) return null;
  const value: number = Number(text);
  return Number.isSafeInteger(value) ? value : null;
}

function positiveId(value: string): boolean {
  return new RegExp('^[1-9][0-9]*$').test(value) && Number.isSafeInteger(Number(value));
}

/** 输入是已登记的语义观察，不读卡面，不写卡库，不从任意文本推断许可。 */
export function buildAgentAppRecommendations(tools: ProviderFunctionTool[], observations: AppInterfaceObservation[],
  foregroundSurface: string, contextSurface: string): AgentAppRecommendation[] {
  if (foregroundSurface === '') return [];
  const source: string = foregroundSurface === 'agent' ? contextSurface : foregroundSurface;
  const result: AgentAppRecommendation[] = [];
  const names: string[] = tools.map((tool): string => tool.name);
  const add = (id: string, view: AppInterfaceObservation, evidence: AppInterfaceValue[]): void => {
    const definition = AGENT_APP_RECOMMENDATIONS.find((item): boolean => item.id === id);
    if (definition === undefined || !definition.requiredTools.every((name): boolean => names.includes(name))) return;
    if (definition.action !== '' && !APP_NAVIGATION_ACTIONS.some((action): boolean => action.id === definition.action)) return;
    if (result.length >= 3) return;
    result.push({ id: id, promptKey: definition.promptKey, reasonKey: definition.reasonKey,
      sourceSurface: view.surface, contextSurface: view.surface === 'agent' ? 'agent' : source,
      evidence: evidence.map((value): AppInterfaceValue => ({ id: value.id, value: value.value })),
      requiredTools: definition.requiredTools.slice(), action: definition.action, requiresUserRequest: true });
  };
  const agent = observations.find((view): boolean => view.surface === 'agent');
  if (foregroundSurface === 'agent' && agent !== undefined && !agent.busy && agent.sectionId === 'conversation' &&
    agent.optionsTotal !== undefined && Number.isSafeInteger(agent.optionsTotal) && agent.optionsTotal > 0) {
    add('document_cards', agent, [{ id: 'document_count', value: String(agent.optionsTotal) }]);
  }
  // 非 JIDE 前台只用当前页；JIDE 前台可使用最近进入 JIDE 前的页面上下文。
  const view = observations.find((item): boolean => item.surface === source);
  if (view === undefined || view.busy) return result;
  if (source === 'study') {
    if (view.sectionId === 'question' || view.sectionId === 'answer') {
      add('study_help', view, [{ id: 'phase', value: view.sectionId }]);
    } else if (view.sectionId === 'done') {
      add('study_summary', view, [{ id: 'phase', value: 'done' }]);
    }
  } else if (source === 'browser' && view.sectionId === 'list') {
    if (view.optionsTotal === 0) add('browser_empty', view, [{ id: 'results_total', value: '0' }]);
    const selected: number | null = count(view, 'selected_count');
    if (selected !== null && selected > 0) {
      add('browser_selection', view, [{ id: 'selected_count', value: String(selected) }]);
    }
  } else if (source === 'home') {
    const deck = observations.find((item): boolean => item.surface === 'deck_details');
    if (deck === undefined || deck.busy || !positiveId(deck.selectedId) || deck.selectedId !== view.selectedId) return result;
    const total: number | null = count(deck, 'total');
    if (total === null) return result;
    const evidence: AppInterfaceValue[] = [{ id: 'deckId', value: deck.selectedId }, { id: 'total', value: String(total) }];
    if (total === 0) add('deck_empty', deck, evidence);
    else {
      const fresh: number | null = count(deck, 'new');
      const learning: number | null = count(deck, 'learning');
      const review: number | null = count(deck, 'review');
      if (fresh !== null && learning !== null && review !== null) {
        const counts: AppInterfaceValue[] = evidence.concat([{ id: 'new', value: String(fresh) },
          { id: 'learning', value: String(learning) }, { id: 'review', value: String(review) }]);
        if (fresh > 0 || learning > 0 || review > 0) {
          const blocked: boolean = observations.some((item): boolean =>
            ['study', 'add_note', 'edit_note'].includes(item.surface));
          if (!blocked) add('deck_study', deck, counts);
        } else add('deck_limits', deck, counts);
      }
      add('deck_overview', deck, evidence);
    }
  }
  return result;
}
