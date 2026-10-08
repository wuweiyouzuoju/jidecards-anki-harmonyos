// SPDX-License-Identifier: AGPL-3.0-or-later
import { AgentScope } from './AgentScope';
import { AgentToolRegistry } from './AgentToolRegistry';
import type { AgentActionToolHandler } from './AgentToolRegistry';
import { AnkiDeckOptions } from '../AnkiDeckOptions';
import { DeckOptionsSession } from '../../model/home/DeckOptionsSession';
import type { DeckOptionsSnapshot, DeckOptionsBackend } from '../../model/home/DeckOptionsSession';
import type { DeckConfigsForUpdateView, UpdateDeckConfigsInput } from '../../proto/messages/DeckConfigMessages';
import { decodeAgentDeckOptionsArguments, agentDeckOptionsFingerprint } from '../../model/agent/AgentDeckOptionsTools';
import type { AgentDeckOptionsAction } from '../../model/agent/AgentDeckOptionsTools';
import { prepareAgentDeckOptions } from '../../model/agent/AgentDeckOptionsDraft';
import { createAgentAction } from '../../model/agent/AgentAction';
import type { AgentAction } from '../../model/agent/AgentAction';

class DeckOptionsActionHandler implements AgentActionToolHandler {
  private owner: AgentDeckOptionsTools;
  constructor(owner: AgentDeckOptionsTools) { this.owner = owner; }
  propose(json: string): Promise<AgentAction> { return this.owner.propose(json); }
}
/** 确认前后都读真实 Core；排队提交前再查快照，避免确认期间覆盖其他修改。 */
class ConfirmedDeckOptionsBackend implements DeckOptionsBackend {
  private source: AnkiDeckOptions;
  private deckId: number;
  private before: string;
  constructor(source: AnkiDeckOptions, deckId: number, before: string) { this.source = source; this.deckId = deckId; this.before = before; }
  load(deckId: number): Promise<DeckConfigsForUpdateView> { return this.source.load(deckId); }
  async save(request: UpdateDeckConfigsInput): Promise<void> {
    const current = await this.source.load(this.deckId);
    if (agentDeckOptionsFingerprint(current) !== this.before) throw new Error('deck_options_changed_since_preview');
    await this.source.save(request);
  }
  committed(): void { this.source.committed(); }
}
export class AgentDeckOptionsTools {
  private scope: AgentScope;
  constructor(scope: AgentScope) { this.scope = scope; }
  register(registry: AgentToolRegistry): void { registry.registerAction('propose_update_deck_options', new DeckOptionsActionHandler(this)); }
  async propose(json: string): Promise<AgentAction> {
    const args = decodeAgentDeckOptionsArguments(json);
    this.scope.assertReadableDeckIds([args.deckId]);
    const view = await new AnkiDeckOptions().load(args.deckId);
    const prepared = prepareAgentDeckOptions(view, args);
    const entry = view.allConfigs.find((item): boolean => item.config.id === view.currentDeck?.configId)!;
    const payload: AgentDeckOptionsAction = { deckId: args.deckId, scope: args.scope, changes: args.changes,
      before: agentDeckOptionsFingerprint(view), deckName: view.currentDeck!.name, presetName: entry.config.name,
      presetUseCount: entry.useCount, fsrsBefore: view.fsrs, fsrsAfter: prepared.draft.options!.fsrs, preview: prepared.preview };
    return createAgentAction('deck_options_change', JSON.stringify(payload));
  }
}
export async function executeAgentDeckOptionsAction(scope: AgentScope, payload: AgentDeckOptionsAction): Promise<string> {
  const args = decodeAgentDeckOptionsArguments(JSON.stringify({ deckId: payload.deckId, scope: payload.scope, changes: payload.changes }));
  scope.assertReadableDeckIds([args.deckId]);
  const source = new AnkiDeckOptions();
  let snapshot: DeckOptionsSnapshot | null = null;
  const session = new DeckOptionsSession(args.deckId, new ConfirmedDeckOptionsBackend(source, args.deckId, payload.before),
    (state: DeckOptionsSnapshot): void => { snapshot = state; });
  try {
    await session.load();
    const state = snapshot as DeckOptionsSnapshot | null;
    if (state === null || state.phase !== 'ready' || state.view === null) throw new Error(state?.error ?? 'deck_options_unavailable');
    if (agentDeckOptionsFingerprint(state.view) !== payload.before) throw new Error('deck_options_changed_since_preview');
    const prepared = prepareAgentDeckOptions(state.view, args);
    const saved: boolean = await session.save(prepared.draft.config!, prepared.draft.shared, prepared.draft.options!);
    if (!saved) throw new Error((snapshot as DeckOptionsSnapshot | null)?.error ?? 'deck_options_save_failed');
    return JSON.stringify({ status: 'completed', saved: true, deckId: args.deckId, scope: args.scope,
      affectedPresetUseCount: args.scope === 'preset' ? payload.presetUseCount : 1,
      changes: args.changes, fsrsReschedule: prepared.draft.options!.fsrsReschedule });
  } finally { session.dispose(); }
}
