// SPDX-License-Identifier: AGPL-3.0-or-later
import { decodeMaintenanceArguments, collectionPreferenceEdits } from '../../model/agent/AgentMaintenanceTools';
import type { MaintenanceArguments } from '../../model/agent/AgentMaintenanceTools';
import { agentRestoreStockKind, patchAgentNotetypeFields } from '../../model/agent/AgentNotetypeFields';
import { patchAgentNotetypeLatex } from '../../model/agent/AgentNotetypeLatex';
import { createAgentAction } from '../../model/agent/AgentAction';
import type { AgentAction } from '../../model/agent/AgentAction';
import type { CollectionPreferencesAction, StudyControlsAction, ExportSubsetAction, RestoreNotetypeAction } from '../../model/agent/AgentMaintenanceActions';
import type { ChangeDraft, DraftOperation } from '../../model/agent/AgentTypes';
import { validateStudyControls } from '../../model/StudyControls';
import type { StudyControls } from '../../model/StudyControls';
import { reviewPreferences } from '../ReviewPreferencesService';
import { readStudyControls } from '../StudyControlsService';
import { 笔记服务 } from '../笔记服务';
import { 卡片服务 } from '../卡片服务';
import { 笔记类型服务 } from '../笔记类型服务';
import { readAgentNotetypeImpact } from './AgentNotetypeImpact';
import { readAgentExportSnapshot } from './AgentExportSnapshot';
import { AgentScope } from './AgentScope';
import { AgentToolRegistry } from './AgentToolRegistry';
import type { AgentReadToolHandler, AgentActionToolHandler, AgentDraftToolHandler } from './AgentToolRegistry';

class MaintenanceRead implements AgentReadToolHandler {
  private owner: AgentMaintenanceTools;
  constructor(owner: AgentMaintenanceTools) { this.owner = owner; }
  /** @throws {Error} 由 Registry 记录读取失败。 */
  execute(json: string): Promise<string> { return this.owner.read(json); }
}
class MaintenanceAction implements AgentActionToolHandler {
  private owner: AgentMaintenanceTools; private name: string;
  constructor(owner: AgentMaintenanceTools, name: string) { this.owner = owner; this.name = name; }
  /** @throws {Error} 由 Registry 拒绝无效或读取失败的提案。 */
  propose(json: string): Promise<AgentAction> { return this.owner.proposeAction(this.name, json); }
}
class MaintenanceDraft implements AgentDraftToolHandler {
  private owner: AgentMaintenanceTools; private name: string;
  constructor(owner: AgentMaintenanceTools, name: string) { this.owner = owner; this.name = name; }
  propose(json: string): Promise<ChangeDraft> { return this.owner.proposeDraft(this.name, json); }
}
/** 仅准备真实快照与提案；此模块不持有任何确认执行器或写入权限。 */
export class AgentMaintenanceTools {
  private scope: AgentScope;
  private notes: 笔记服务 = new 笔记服务();
  private cards: 卡片服务 = new 卡片服务();
  private types: 笔记类型服务 = new 笔记类型服务();
  constructor(scope: AgentScope) { this.scope = scope; }
  register(registry: AgentToolRegistry): void {
    registry.registerRead('get_advanced_settings', new MaintenanceRead(this));
    for (const name of ['propose_update_collection_preferences', 'propose_update_study_controls', 'propose_export_subset']) {
      registry.registerAction(name, new MaintenanceAction(this, name));
    }
    registry.registerDraft('propose_duplicate_note', new MaintenanceDraft(this, 'propose_duplicate_note'));
    for (const name of ['propose_update_notetype_fields', 'propose_restore_notetype', 'propose_update_notetype_latex']) {
      registry.registerHighRiskDraft(name, new MaintenanceDraft(this, name));
    }
  }
  /** @throws {Error} 真实配置读取失败交给工具结果。 */
  async read(json: string): Promise<string> {
    const args: MaintenanceArguments = decodeMaintenanceArguments('get_advanced_settings', json);
    if (args.group === 'study') return JSON.stringify({ scope: 'device', controls: await readStudyControls(),
      screenAwakeEffect: 'Only the visible foreground study page borrows the window state; device support is not guaranteed.' });
    const current = await reviewPreferences.read();
    return JSON.stringify({ scope: 'collection', loadBalancer: current.loadBalancer, shortTermWithSteps: current.shortTermWithSteps,
      backupDaily: current.backupDaily, backupWeekly: current.backupWeekly,
      backupMonthly: current.backupMonthly, backupInterval: current.backupInterval,
      backupIncludesMedia: false, changesRescheduleCards: false });
  }
  /** @throws {Error} 参数、范围或当前值读取失败时不生成提案。 */
  async proposeAction(name: string, json: string): Promise<AgentAction> {
    const args: MaintenanceArguments = decodeMaintenanceArguments(name, json);
    if (name === 'propose_update_collection_preferences') {
      collectionPreferenceEdits(args.changesJson!);
      const payload: CollectionPreferencesAction = { before: await reviewPreferences.read(), changesJson: args.changesJson! };
      return createAgentAction('collection_preferences', JSON.stringify(payload));
    }
    if (name === 'propose_update_study_controls') {
      const after: StudyControls = validateStudyControls(JSON.parse(args.controlsJson!) as StudyControls);
      const payload: StudyControlsAction = { before: await readStudyControls(), after: after };
      return createAgentAction('study_controls', JSON.stringify(payload));
    }
    if (name !== 'propose_export_subset') throw new Error('tool_unavailable');
    const ids: number[] = args.ids!;
    if (args.mode === 'notes') this.scope.assertReadableNoteIds(ids); else this.scope.assertReadableCardIds(ids);
    const snapshots: string[] = [];
    for (const id of ids) snapshots.push(await readAgentExportSnapshot(id, args.mode!, this.notes, this.cards));
    const payload: ExportSubsetAction = { ids: ids, mode: args.mode!, format: args.format!,
      withMedia: args.withMedia!, withScheduling: args.withScheduling!, snapshots: snapshots };
    return createAgentAction('export_subset', JSON.stringify(payload));
  }
  async proposeDraft(name: string, json: string): Promise<ChangeDraft> {
    const args: MaintenanceArguments = decodeMaintenanceArguments(name, json);
    let draft: ChangeDraft;
    if (name === 'propose_duplicate_note') {
      this.scope.assertReadableNoteIds([args.noteId!]); this.scope.assertReadableDeckIds([args.deckId!]);
      this.scope.assertBatchCount(1);
      const note = await this.notes.获取笔记(args.noteId!);
      const type: string = await this.types.获取笔记类型旧版(note.notetypeId);
      this.scope.registerReadableNotetypeIds([note.notetypeId]);
      const operations: DraftOperation[] = note.fields.map((field: string, ordinal: number): DraftOperation =>
        ({ kind: 'create_note', noteId: -1, cardId: 0, deckId: args.deckId!, fieldOrd: ordinal, before: '', after: field }));
      draft = { id: args.draftId!, risk: 'write', summary: args.reason!, baselineHash: '', confirmationLevel: 1,
        status: 'pending', affectedNoteIds: [], affectedCardIds: [], affectedDeckIds: [args.deckId!],
        affectedNotetypeIds: [note.notetypeId], operations: operations,
        duplicateSource: { noteId: note.id, snapshot: JSON.stringify(note), notetypeJson: type } };
    } else {
      this.scope.assertReadableNotetypeIds([args.notetypeId!]);
      const before: string = await this.types.获取笔记类型旧版(args.notetypeId!);
      const impact = await readAgentNotetypeImpact(args.notetypeId!);
      let operation: DraftOperation;
      if (name === 'propose_update_notetype_fields') {
        operation = { kind: 'update_notetype_fields', noteId: 0, cardId: 0, deckId: 0, fieldOrd: -1,
          before: before, after: patchAgentNotetypeFields(before, args.fieldsJson!, args.sortFieldIndex) };
      } else if (name === 'propose_update_notetype_latex') {
        operation = { kind: 'update_notetype_latex', noteId: 0, cardId: 0, deckId: 0, fieldOrd: -1,
          before: before, after: patchAgentNotetypeLatex(before, { latexPre: args.latexPre,
            latexPost: args.latexPost, latexSvg: args.latexSvg }) };
      } else if (name === 'propose_restore_notetype') {
        this.scope.assertBatchCount(impact.cardIds.length);
        this.scope.assertBatchCount(impact.noteIds.length);
        const kind: number = agentRestoreStockKind(before, args.forceKind);
        const payload: RestoreNotetypeAction = { forceKind: args.forceKind,
          stockJson: await this.types.获取标准笔记类型JSON(kind) };
        operation = { kind: 'restore_notetype', noteId: 0, cardId: 0, deckId: 0, fieldOrd: -1,
          before: before, after: JSON.stringify(payload) };
      } else throw new Error('tool_unavailable');
      draft = { id: args.draftId!, risk: 'high_risk', summary: args.reason! +
        `\n${impact.noteIds.length} notes / ${impact.cardIds.length} cards across all decks.`, baselineHash: '',
        confirmationLevel: 2, status: 'pending', affectedNoteIds: impact.noteIds, affectedCardIds: impact.cardIds,
        affectedDeckIds: [], affectedNotetypeIds: [args.notetypeId!], operations: [operation] };
    }
    if (!this.scope.registerDraftId(draft.id)) throw new Error('duplicate_draft_id');
    return draft;
  }
}
