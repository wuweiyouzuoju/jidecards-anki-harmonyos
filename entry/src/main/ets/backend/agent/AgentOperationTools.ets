// SPDX-License-Identifier: AGPL-3.0-or-later
import { agentOperationDefinitions, decodeOperationArguments } from '../../model/agent/AgentOperations';
import type { OperationArguments } from '../../model/agent/AgentOperations';
import type { ChangeDraft } from '../../model/agent/AgentTypes';
import { agentOperationCoordinator } from './AppAgentOperations';
import { AgentScope } from './AgentScope';
import { AgentToolRegistry } from './AgentToolRegistry';
import type { AgentReadToolHandler, AgentDraftToolHandler } from './AgentToolRegistry';
import { AnkiNoteDuplicates } from '../AnkiNoteDuplicates';
import { NoteDuplicateSession, initialDuplicateScanState } from '../../model/NoteDuplicateSession';
import type { DuplicateScanBackend, DuplicateScanInput, DuplicateScanState } from '../../model/NoteDuplicateSession';
import type { DuplicateField } from '../../proto/messages/NoteDuplicateMessages';
import { 笔记类型服务 } from '../笔记类型服务';
import type { MediaSnapshotPage } from '../../proto/messages/MediaSnapshotMessages';
import type { Card } from '../../proto/messages/CardsMessages';
class ReadOperation implements AgentReadToolHandler {
  private owner: AgentOperationTools; private name: string;
  constructor(owner: AgentOperationTools, name: string) { this.owner = owner; this.name = name; }
  execute(json: string): Promise<string> { return this.owner.read(this.name,json); }
  cancel(): void { this.owner.cancel(); }
}
class DraftOperationHandler implements AgentDraftToolHandler {
  private owner: AgentOperationTools; private name: string;
  constructor(owner: AgentOperationTools, name: string) { this.owner = owner; this.name = name; }
  propose(json: string): Promise<ChangeDraft> { return this.owner.propose(this.name,json); }
}
class FrozenDuplicates implements DuplicateScanBackend {
  private backend: AnkiNoteDuplicates = new AnkiNoteDuplicates();
  private ids: number[]; private scope: AgentScope;
  constructor(ids: number[], scope: AgentScope) { this.ids = ids; this.scope = scope; }
  async search(_input: DuplicateScanInput): Promise<number[]> { return this.ids.slice(); }
  async fields(ids: number[], type: number, field: number): Promise<DuplicateField[]> {
    this.scope.retrieval.beforeRead(ids); const result = await this.backend.fields(ids,type,field);
    for (const row of result) this.scope.retrieval.recordRead(row.noteId); return result;
  }
}
interface EmptyCardRow { 笔记ID: number; 卡片IDs: number[]; }
interface EmptyCardPage { rows: EmptyCardRow[]; }
interface CardStates { cards: Card[]; }
interface PresetPage { presets: OperationPreset[]; }
interface OperationPreset { id: number; }
interface BackupPage { names: string[]; }
interface ReminderPage { 提醒项列表: OperationReminder[]; }
interface OperationReminder { 唯一ID: number; }
/** 同一目录驱动注册；写入只能生成既有确认草稿。 */
export class AgentOperationTools {
  private duplicates: NoteDuplicateSession | null = null;
  private cancelled: boolean = false;
  private scope: AgentScope;
  constructor(scope: AgentScope) { this.scope = scope; }
  cancel(): void { this.cancelled = true; this.duplicates?.cancel(); }
  register(registry: AgentToolRegistry): void {
    for (const tool of agentOperationDefinitions()) {
      if (tool.risk === 'read') registry.registerRead(tool.name,new ReadOperation(this,tool.name));
      else if (tool.risk === 'high_risk') registry.registerHighRiskDraft(tool.name,new DraftOperationHandler(this,tool.name));
      else registry.registerDraft(tool.name,new DraftOperationHandler(this,tool.name));
    }
  }
  private arguments(name: string, json: string): OperationArguments {
    const args = decodeOperationArguments(name,json);
    if (args.cardIds !== undefined) { this.scope.assertReadableCardIds(args.cardIds); this.scope.assertBatchCount(args.cardIds.length); }
    if (args.noteIds !== undefined) { this.scope.assertReadableNoteIds(args.noteIds); this.scope.assertBatchCount(args.noteIds.length); }
    if (args.deckId !== undefined) this.scope.assertReadableDeckIds([args.deckId]);
    if (args.notetypeId !== undefined) this.scope.assertReadableNotetypeIds([args.notetypeId]); return args;
  }
  async read(name: string, json: string): Promise<string> {
    this.cancelled = false; const args = this.arguments(name,json);
    if (name === 'get_operation_result') this.scope.assertOperationTarget('operation_results',args.name!);
    if (name === 'get_duplicate_notes') {
      const type = await new 笔记类型服务().获取编辑笔记类型(args.notetypeId!);
      const field = type.fieldNames.indexOf(args.field!); if (field < 0) throw new Error('notetype_field_missing');
      const input: DuplicateScanInput = { notetypeId: args.notetypeId!, fieldOrd: field, search: this.scope.scopedCardSearchQuery(args.query!) };
      const ids = await new AnkiNoteDuplicates().search(input);
      this.scope.retrieval.begin('duplicates',input.search,ids,100); this.scope.retrieval.beforeRead(ids);
      if (this.cancelled) throw new Error('operation_cancelled');
      let state: DuplicateScanState = initialDuplicateScanState();
      const session = new NoteDuplicateSession(new FrozenDuplicates(ids,this.scope),(value): void => { state = value; }); this.duplicates = session;
      try {
        await session.scan(input); if (!state.complete || this.cancelled) throw new Error(state.error || 'duplicate_scan_incomplete');
        this.scope.registerReadableNoteIds(state.groups.flatMap((group): number[] => group.noteIds)); return JSON.stringify(state);
      } finally { session.dispose(); if (this.duplicates === session) this.duplicates = null; }
    }
    const result = await agentOperationCoordinator.read(name,JSON.stringify(args)); if (this.cancelled) throw new Error('operation_cancelled');
    if (name === 'get_deck_presets') this.scope.registerOperationTargets('presets',(JSON.parse(result) as PresetPage).presets.map((item): string => String(item.id)));
    if (name === 'get_backups') this.scope.registerOperationTargets('backups',(JSON.parse(result) as BackupPage).names);
    if (name === 'get_reminders') this.scope.registerOperationTargets('reminders',(JSON.parse(result) as ReminderPage).提醒项列表.map((item): string => String(item.唯一ID)));
    if (name === 'get_empty_cards') {
      const page = JSON.parse(result) as EmptyCardPage; this.scope.registerReadableNoteIds(page.rows.map((row): number => row.笔记ID));
      this.scope.registerReadableCardIds(page.rows.flatMap((row): number[] => row.卡片IDs));
    } else if (name === 'get_card_states') this.scope.registerReadableNoteIds((JSON.parse(result) as CardStates).cards.map((card): number => card.noteId));
    else if (name === 'get_media_report' && args.scope === 'missing_notes') this.scope.registerReadableNoteIds((JSON.parse(result) as MediaSnapshotPage).noteIds ?? []);
    return result;
  }
  async propose(name: string, json: string): Promise<ChangeDraft> {
    const args = this.arguments(name,json);
    if (args.presetId !== undefined) this.scope.assertOperationTarget('presets',String(args.presetId));
    if (args.reminderId !== undefined) this.scope.assertOperationTarget('reminders',String(args.reminderId));
    if (name === 'propose_restore_backup') this.scope.assertOperationTarget('backups',args.name!);
    const draft = await agentOperationCoordinator.propose(name,JSON.stringify(args));
    this.scope.registerOperationTargets('operation_results',[draft.id]);
    if (args.cardIds !== undefined || args.noteIds !== undefined) this.scope.assertBatchCount(draft.affectedCardIds.length); return draft;
  }
}
