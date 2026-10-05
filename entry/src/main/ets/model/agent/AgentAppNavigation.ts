// SPDX-License-Identifier: AGPL-3.0-or-later
import { APP_NAVIGATION_ACTIONS, appNavigationRequested, validateAppNavigation, appNavigationStackBlockReason } from '../navigation/AppNavigation';
import type { AppNavigationArguments, AppNavigationRequest } from '../navigation/AppNavigation';
import type { AppInterfaceContext } from '../AppInterface';
import type { ProviderFunctionTool } from './ProviderProtocol';
import { SETTINGS_ENTRIES } from '../SettingsNavigation';

export function agentAppNavigationTools(): ProviderFunctionTool[] {
  return [{ name: 'navigate_app', description: '按用户意图进入真实页面、开始学习、预览卡片或打开笔记编辑。可用动作和各自参数由软件共同声明生成，回复完成后执行。',
    parametersJson: JSON.stringify({ type: 'object', properties: {
      action: { type: 'string', enum: APP_NAVIGATION_ACTIONS.map((item): string => item.id),
        description: APP_NAVIGATION_ACTIONS.map((item): string => item.id + ': required=' + item.required.join(',') +
          '; optional=' + item.optional.join(',')).join('\n') },
      deckId: { type: 'integer', minimum: 1, description: 'Real ID discovered through list_decks.' },
      noteId: { type: 'integer', minimum: 1, description: 'Real note ID discovered through search_notes/get_note_context.' },
      cardId: { type: 'integer', minimum: 1, description: 'Real card ID discovered through search_cards/get_note_context.' },
      sectionId: { type: 'string', enum: SETTINGS_ENTRIES.map((entry): string => entry.id) },
      query: { type: 'string', maxLength: 1000 }, notesMode: { type: 'boolean' }
    }, required: ['action'], additionalProperties: false }),
    exampleArgumentsJson: '{"action":"start_study","deckId":1}',
    rules: 'Navigation only. Use get_app_structure actions and requiredArguments/optionalArguments for current capabilities. available means registered; executionState/blockedReason describe current host readiness, not user authorization or discovered targets. Pass only that action\'s parameters; never invent page names or IDs. Search real targets first; clarify ambiguous matches. open_edit_note opens the existing editor for manual changes; it does not save or grant AI write permission. open_card_preview opens the existing browser preview without starting a review or rating. open_deck_details selects the deck on the home page; open_deck_options opens its existing form for manual editing and does not save. Actions with resetsStack=true refuse to discard an underlying edit/add form. The current user must request navigation, preview or starting learning; explanation alone is not permission. At most one destination per turn. queued is not opened or learning completed: execution follows a successful reply and rechecks foreground, pending drafts, collection occupancy and target existence. Cancelled, failed or interrupted turns discard the request. Does not answer, rate, delete, sync or save cards.' }];
}

export interface AgentNavigationHost {
  context(): AppInterfaceContext;
  canNavigate(): boolean;
  collectionBusy(): boolean;
  pathNames?(): string[];
  assertReadableTarget(args: AppNavigationArguments): void;
  readTarget(args: AppNavigationArguments): Promise<string>;
  navigate(request: AppNavigationRequest): void;
}

export interface AgentNavigationReadiness {
  action: string; executionState: 'ready' | 'blocked' | 'unknown'; blockedReason: string;
}

/** 单个 JIDE 页面拥有队列和代次；已隐藏/离开的页面不会发起迟到导航。 */
export class AgentAppNavigationSession {
  private readonly host: AgentNavigationHost;
  private generation: number = 0;
  private userRequest: string = '';
  private pending: AppNavigationArguments | null = null;
  private used: boolean = false;
  constructor(host: AgentNavigationHost) { this.host = host; }

  beginTurn(userRequest: string): number {
    this.cancel(); this.userRequest = userRequest; this.used = false;
    return this.generation;
  }
  cancel(): void { this.generation++; this.pending = null; this.userRequest = ''; }

  /** 不读取目标、不消费本轮许可；结构工具读取的是当前宿主事实。 */
  readiness(): AgentNavigationReadiness[] {
    return APP_NAVIGATION_ACTIONS.map((action): AgentNavigationReadiness => {
      const reason: string = this.hostBlockReason(action.id) || (this.used ? 'navigation_already_queued' : '');
      return { action: action.id, executionState: reason !== '' ? 'blocked' :
        this.host.pathNames === undefined ? 'unknown' : 'ready', blockedReason: reason };
    });
  }

  async queue(argumentsJson: string): Promise<string> {
    const generation: number = this.generation;
    const args: AppNavigationArguments = JSON.parse(argumentsJson) as AppNavigationArguments;
    const action = validateAppNavigation(args, this.host.context());
    if (!appNavigationRequested(this.userRequest)) throw new Error('navigation_user_request_required');
    if (this.used) throw new Error('navigation_already_queued');
    this.assertAvailable(action.id);
    this.host.assertReadableTarget(args);
    const deckName: string = await this.host.readTarget(args);
    if (generation !== this.generation) throw new Error('navigation_cancelled');
    validateAppNavigation(args, this.host.context());
    this.assertAvailable(action.id);
    if (this.used) throw new Error('navigation_already_queued');
    this.pending = { action: args.action, deckId: args.deckId, noteId: args.noteId, cardId: args.cardId, sectionId: args.sectionId,
      query: args.query, notesMode: args.notesMode };
    this.used = true;
    return JSON.stringify({ status: 'queued', action: action.id, surface: action.surface,
      deckId: args.deckId, deckName: deckName, noteId: args.noteId, cardId: args.cardId,
      executes: 'after_successful_reply', completed: false });
  }

  async finish(success: boolean, generation: number = this.generation): Promise<void> {
    if (generation !== this.generation) return;
    const args: AppNavigationArguments | null = this.pending;
    this.pending = null;
    this.userRequest = '';
    if (!success || args === null) return;
    // 去掉可选的 undefined 字段后重新验证，不让运行时快照扩大参数权限。
    const clean: AppNavigationArguments = JSON.parse(JSON.stringify(args)) as AppNavigationArguments;
    const action = validateAppNavigation(clean, this.host.context());
    this.assertAvailable(action.id);
    this.host.assertReadableTarget(clean);
    const deckName: string = await this.host.readTarget(clean);
    if (generation !== this.generation) return;
    validateAppNavigation(clean, this.host.context());
    this.assertAvailable(action.id);
    this.host.navigate({ action: args.action, surface: action.surface, deckId: args.deckId,
      deckName: deckName, noteId: args.noteId, cardId: args.cardId, sectionId: args.sectionId, query: args.query, notesMode: args.notesMode });
  }

  private hostBlockReason(action: string): string {
    if (!this.host.canNavigate()) return 'navigation_unavailable';
    if (this.host.collectionBusy()) return 'navigation_collection_busy';
    const names: string[] | undefined = this.host.pathNames?.();
    return names === undefined ? '' : appNavigationStackBlockReason(action, names);
  }

  private assertAvailable(action: string): void {
    const reason: string = this.hostBlockReason(action);
    if (reason !== '') throw new Error(reason);
  }
}
