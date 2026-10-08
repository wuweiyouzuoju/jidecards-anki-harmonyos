// SPDX-License-Identifier: AGPL-3.0-or-later

import type { Card } from '../../proto/messages/CardsMessages';
import type { DeckTreeNode } from '../../proto/messages/DeckMessages';
import type { EditableNote } from '../../proto/messages/NoteMessages';
import type { NotetypeCapabilities, 变更笔记类型信息 } from '../../proto/messages/NotetypeMessages';
import type { AgentMode, ChangeDraft, DraftOperation } from '../../model/agent/AgentTypes';
import { applyAgentCardStyle } from '../../model/agent/AgentCardStyle';
import { readAgentLegacyNotetype, validateAgentTemplates } from '../../model/agent/AgentTemplateUpdate';
import type { AgentLegacyNotetype, AgentTemplateUpdate } from '../../model/agent/AgentTemplateUpdate';
import { readAgentNotetypeImpact } from './AgentNotetypeImpact';
import { readAgentDeckDeletionImpact } from './AgentDeckDeletionImpact';
import { agentDeletionRoots, findAgentDeletionDeck, agentDeletionFullName } from '../../model/agent/AgentDeckDeletion';
import type { AgentDeckDeletionSnapshot } from '../../model/agent/AgentDeckDeletion';
import type { AgentNotetypeImpact } from './AgentNotetypeImpact';
import { MAX_BATCH_LIMIT } from '../../model/agent/AgentPolicy';
import type { AgentToolArguments } from '../../model/agent/AgentToolSchemas';
import { AgentToolSchemaError, decodeAgentToolArguments } from '../../model/agent/AgentToolSchemas';
import { 卡片服务 } from '../卡片服务';
import { 搜索服务 } from '../搜索服务';
import { 牌组服务 } from '../牌组服务';
import { 笔记服务 } from '../笔记服务';
import { 笔记类型服务 } from '../笔记类型服务';
import { AgentScope } from './AgentScope';
import type { AgentDraftToolHandler } from './AgentToolRegistry';
import { AgentToolRegistry } from './AgentToolRegistry';

function uniqueIds(values: number[]): number[] {
  const result: number[] = [];
  const seen: Set<number> = new Set<number>();
  for (const value of values) {
    if (!seen.has(value)) { seen.add(value); result.push(value); }
  }
  return result;
}

function assertHardLimit(cardIds: number[]): void {
  if (cardIds.length > MAX_BATCH_LIMIT) {
    throw new AgentToolSchemaError('high_risk_batch_too_large');
  }
}

function highRiskDraft(id: string, summary: string, operations: DraftOperation[],
  noteIds: number[], cardIds: number[], deckIds: number[], notetypeIds: number[]): ChangeDraft {
  return {
    id: id,
    risk: 'high_risk',
    summary: summary,
    baselineHash: JSON.stringify(operations),
    confirmationLevel: 2,
    status: 'pending',
    affectedNoteIds: uniqueIds(noteIds),
    affectedCardIds: uniqueIds(cardIds),
    affectedDeckIds: uniqueIds(deckIds),
    affectedNotetypeIds: uniqueIds(notetypeIds),
    operations: operations
  };
}

function parseMapping(json: string): number[] {
  let values: number[];
  try { values = JSON.parse(json) as number[]; } catch (error) {
    throw new AgentToolSchemaError('invalid_tool_arguments');
  }
  if (!Array.isArray(values) || values.length > 100) {
    throw new AgentToolSchemaError('invalid_tool_arguments');
  }
  for (const value of values) {
    if (!Number.isSafeInteger(value) || value < -1) {
      throw new AgentToolSchemaError('invalid_tool_arguments');
    }
  }
  return values;
}

class HighRiskHandler implements AgentDraftToolHandler {
  private readonly owner: HighRiskAgentTools;
  private readonly name: string;
  constructor(owner: HighRiskAgentTools, name: string) { this.owner = owner; this.name = name; }
  /** @throws {Error} 提案校验/读取错误交给 Registry/Runner 诊断，不写入。 */
  propose(argumentsJson: string): Promise<ChangeDraft> { return this.owner.propose(this.name, argumentsJson); }
}

/** 高风险工具只计算精确影响并生成草稿，不执行删除或结构写入。 */
export class HighRiskAgentTools {
  private readonly scope: AgentScope;
  private readonly notes: 笔记服务 = new 笔记服务();
  private readonly cards: 卡片服务 = new 卡片服务();
  private readonly decks: 牌组服务 = new 牌组服务();
  private readonly notetypes: 笔记类型服务 = new 笔记类型服务();
  private readonly searches: 搜索服务 = new 搜索服务();

  constructor(scope: AgentScope) { this.scope = scope; }

  register(registry: AgentToolRegistry, mode: AgentMode = 'edit'): void {
    registry.registerHighRiskDraft('propose_update_card_style', new HighRiskHandler(this, 'propose_update_card_style'));
    registry.registerHighRiskDraft('propose_update_note_type_templates', new HighRiskHandler(this, 'propose_update_note_type_templates'));
    if (mode === 'create') { return; }
    registry.registerHighRiskDraft('propose_delete_notes', new HighRiskHandler(this, 'propose_delete_notes'));
    registry.registerHighRiskDraft('propose_delete_cards', new HighRiskHandler(this, 'propose_delete_cards'));
    registry.registerHighRiskDraft('propose_change_note_type', new HighRiskHandler(this, 'propose_change_note_type'));
    registry.registerHighRiskDraft('propose_delete_deck', new HighRiskHandler(this, 'propose_delete_deck'));
    registry.registerHighRiskDraft('propose_delete_note_type', new HighRiskHandler(this, 'propose_delete_note_type'));
  }

  /** @throws {Error} 提案失败保留真实原因，成功前不占用 draftId。 */
  async propose(name: string, argumentsJson: string): Promise<ChangeDraft> {
    const args: AgentToolArguments = decodeAgentToolArguments(name, argumentsJson);
    if (args.draftId.length === 0) {
      throw new AgentToolSchemaError('missing_property', 'draftId', 'Provide a non-empty draftId.');
    }
    let draft: ChangeDraft;
    if (name === 'propose_delete_notes') { draft = await this.proposeDeleteNotes(args); }
    else if (name === 'propose_delete_cards') { draft = await this.proposeDeleteCards(args); }
    else if (name === 'propose_change_note_type') { draft = await this.proposeChangeNotetype(args); }
    else if (name === 'propose_update_note_type_templates' || name === 'propose_update_card_style') {
      draft = await this.proposeTemplates(args, name === 'propose_update_card_style');
    } else if (name === 'propose_delete_deck') { draft = await this.proposeDeleteDeck(args); }
    else { draft = await this.proposeDeleteNotetype(args); }
    // Failed reads/validation do not consume the ID; concurrent successful proposals still cannot duplicate it.
    if (!this.scope.registerDraftId(args.draftId)) {
      throw new AgentToolSchemaError('duplicate_draft_id');
    }
    return draft;
  }

  private async proposeDeleteNotes(args: AgentToolArguments): Promise<ChangeDraft> {
    this.scope.assertReadableNoteIds(args.noteIds);
    const operations: DraftOperation[] = [];
    const cardIds: number[] = [];
    for (const noteId of args.noteIds) {
      const note: EditableNote = await this.notes.获取笔记(noteId);
      const siblings: number[] = await this.notes.获取笔记的卡片(noteId);
      cardIds.push(...siblings);
      operations.push({
        kind: 'delete_note', noteId: noteId, cardId: 0, deckId: 0, fieldOrd: -1,
        before: JSON.stringify(note), after: ''
      });
    }
    assertHardLimit(uniqueIds(cardIds));
    this.scope.assertBatchCount(uniqueIds(cardIds).length);
    return highRiskDraft(args.draftId, args.reason, operations, args.noteIds, cardIds, [], []);
  }

  private async proposeDeleteCards(args: AgentToolArguments): Promise<ChangeDraft> {
    this.scope.assertReadableCardIds(args.cardIds);
    assertHardLimit(args.cardIds);
    this.scope.assertBatchCount(args.cardIds.length);
    const operations: DraftOperation[] = [];
    const noteIds: number[] = [];
    for (const cardId of args.cardIds) {
      const card: Card = await this.cards.获取卡片(cardId);
      noteIds.push(card.noteId);
      operations.push({
        kind: 'delete_card', noteId: card.noteId, cardId: card.id, deckId: card.deckId,
        fieldOrd: -1, before: JSON.stringify(card), after: ''
      });
    }
    return highRiskDraft(args.draftId, args.reason, operations, noteIds, args.cardIds, [], []);
  }

  private async proposeChangeNotetype(args: AgentToolArguments): Promise<ChangeDraft> {
    this.scope.assertReadableNoteIds(args.noteIds);
    this.scope.assertReadableNotetypeIds([args.targetNotetypeId]);
    const oldId: number = await this.notes.获取笔记的唯一笔记类型(args.noteIds);
    const info: 变更笔记类型信息 = await this.notetypes.获取变更笔记类型信息(oldId, args.targetNotetypeId);
    const fields: number[] = parseMapping(args.fieldMappingJson);
    const templates: number[] = parseMapping(args.templateMappingJson);
    const cardIds: number[] = [];
    for (const noteId of args.noteIds) { cardIds.push(...await this.notes.获取笔记的卡片(noteId)); }
    assertHardLimit(uniqueIds(cardIds));
    this.scope.assertBatchCount(uniqueIds(cardIds).length);
    const operation: DraftOperation = {
      kind: 'change_note_type', noteId: 0, cardId: 0, deckId: 0, fieldOrd: -1,
      before: JSON.stringify(info.input),
      after: JSON.stringify({ noteIds: args.noteIds, newFields: fields, newTemplates: templates })
    };
    return highRiskDraft(args.draftId, args.reason, [operation], args.noteIds, cardIds, [], [oldId, args.targetNotetypeId]);
  }

  private async proposeTemplates(args: AgentToolArguments, styleOnly: boolean): Promise<ChangeDraft> {
    this.scope.assertReadableNotetypeIds(args.notetypeIds);
    if (args.notetypeIds.length !== 1) {
      throw new AgentToolSchemaError('invalid_value', 'notetypeIds', 'Select exactly one discovered note type.');
    }
    const id: number = args.notetypeIds[0];
    const before: string = await this.notetypes.获取笔记类型旧版(id);
    const current: AgentLegacyNotetype = readAgentLegacyNotetype(before);
    let templates: string = JSON.stringify(current.tmpls);
    if (args.hasTemplateJson) {
      try { templates = JSON.stringify(validateAgentTemplates(args.templateJson)); } catch (error) {
        throw new AgentToolSchemaError('invalid_value', 'templateJson',
          error instanceof Error ? error.message : 'invalid_template_json');
      }
    }
    const payload: AgentTemplateUpdate = { templates: templates,
      css: styleOnly ? applyAgentCardStyle(current.css, args.style) : (args.hasCss ? args.css : current.css) };
    if (styleOnly) { payload.style = args.style; }
    const impact: AgentNotetypeImpact = await readAgentNotetypeImpact(id);
    // A shared CSS update is one operation. Template structure changes retain the destructive batch ceiling.
    if (templates !== JSON.stringify(current.tmpls)) {
      assertHardLimit(impact.cardIds);
      this.scope.assertBatchCount(impact.cardIds.length);
    }
    const operation: DraftOperation = {
      kind: 'update_template', noteId: 0, cardId: 0, deckId: 0, fieldOrd: -1,
      before: before, after: JSON.stringify(payload)
    };
    const summary: string = `${args.reason}\n笔记类型 ID ${id}：影响全部 ${impact.noteIds.length} 条笔记、` +
      `${impact.cardIds.length} 张卡片（包括其他牌组）。`;
    return highRiskDraft(args.draftId, summary, [operation], impact.noteIds, impact.cardIds, [], [id]);
  }

  /** @throws {Error} 删除范围读取失败时拒绝发布草稿，Runner 负责反馈。 */
  private async proposeDeleteDeck(args: AgentToolArguments): Promise<ChangeDraft> {
    for (let index: number = 0; index < args.deckIds.length; index++) {
      try { this.scope.assertReadableDeckIds([args.deckIds[index]]); }
      catch (error) {
        throw new AgentToolSchemaError('id_out_of_scope', `deckIds[${index}]`,
          `Deck ID ${args.deckIds[index]} was not discovered in this session. Read list_decks before proposing deletion.`);
      }
    }
    const tree: DeckTreeNode = await this.decks.获取牌组树();
    for (let index: number = 0; index < args.deckIds.length; index++) {
      if (findAgentDeletionDeck(tree, args.deckIds[index]) === null) {
        throw new AgentToolSchemaError('deck_not_found', `deckIds[${index}]`,
          `Deck ID ${args.deckIds[index]} no longer exists. Refresh list_decks.`);
      }
    }
    const roots: DeckTreeNode[] = agentDeletionRoots(tree, args.deckIds);
    const cardIds: number[] = [];
    const noteIds: number[] = [];
    const deckIds: number[] = [];
    const operations: DraftOperation[] = [];
    for (const deck of roots) {
      const impact: AgentDeckDeletionSnapshot = await readAgentDeckDeletionImpact(deck);
      impact.name = agentDeletionFullName(tree, deck.deckId);
      cardIds.push(...impact.cardIds); noteIds.push(...impact.noteIds); deckIds.push(...impact.deckIds);
      if (uniqueIds(cardIds).length > MAX_BATCH_LIMIT) {
        throw new AgentToolSchemaError('high_risk_batch_too_large', 'deckIds',
          `The combined deck scope exceeds ${MAX_BATCH_LIMIT} cards. Select a smaller scope.`);
      }
      try { this.scope.assertBatchCount(uniqueIds(cardIds).length); }
      catch (error) {
        throw new AgentToolSchemaError('tool_batch_too_large', 'deckIds',
          `The combined deck scope affects ${uniqueIds(cardIds).length} cards, exceeding the configured batch limit.`);
      }
      operations.push({ kind: 'delete_deck', noteId: 0, cardId: 0, deckId: deck.deckId, fieldOrd: -1,
        before: JSON.stringify(deck), after: JSON.stringify(impact) });
    }
    const summary: string = `${args.reason}\n牌组：${roots.map((deck: DeckTreeNode): string => agentDeletionFullName(tree, deck.deckId)).join('；')}\n` +
      `涉及 ${uniqueIds(deckIds).length} 个牌组（含子牌组）、${uniqueIds(cardIds).length} 张卡片；删除筛选牌组时，其卡片按 Core 规则归还原牌组。`;
    return highRiskDraft(args.draftId, summary, operations, noteIds, cardIds, deckIds, []);
  }

  private async proposeDeleteNotetype(args: AgentToolArguments): Promise<ChangeDraft> {
    this.scope.assertReadableNotetypeIds(args.notetypeIds);
    if (args.notetypeIds.length !== 1) {
      throw new AgentToolSchemaError('invalid_value', 'notetypeIds',
        'propose_delete_note_type currently requires exactly one discovered note type ID.');
    }
    const id: number = args.notetypeIds[0];
    const capability: NotetypeCapabilities = await this.notetypes.获取笔记类型能力(id);
    const query: string = await this.searches.构建搜索串({ kind: 'note', note: capability.name });
    const noteIds: number[] = await this.searches.搜索笔记({ search: query, order: { kind: 'none' } });
    const cardIds: number[] = [];
    for (const noteId of noteIds) { cardIds.push(...await this.notes.获取笔记的卡片(noteId)); }
    assertHardLimit(uniqueIds(cardIds));
    this.scope.assertBatchCount(uniqueIds(cardIds).length);
    const operation: DraftOperation = {
      kind: 'delete_note_type', noteId: 0, cardId: 0, deckId: 0, fieldOrd: -1,
      before: JSON.stringify(capability), after: ''
    };
    return highRiskDraft(args.draftId, args.reason, [operation], noteIds, cardIds, [], [id]);
  }
}
