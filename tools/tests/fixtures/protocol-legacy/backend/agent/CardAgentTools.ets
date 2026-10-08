// SPDX-License-Identifier: AGPL-3.0-or-later
import { AgentDocumentAccess } from '../../model/agent/AgentDocuments';

import type { Card } from '../../proto/messages/CardsMessages';
import type { DeckTreeNode } from '../../proto/messages/DeckMessages';
import type { EditableNote } from '../../proto/messages/NoteMessages';
import type { NotetypeCapabilities, NotetypeNameId } from '../../proto/messages/NotetypeMessages';
import type { CardStatsView, StatsRevlogEntry } from '../../proto/messages/StatsMessages';
import type { TagTreeNode } from '../../proto/messages/TagsMessages';
import type { AgentImageAttachment, AgentImageCandidate, AgentMode, ChangeDraft, DraftOperation } from '../../model/agent/AgentTypes';
import { validateAgentNoteFields } from '../../model/agent/AgentNoteValidation';
import { buildAgentLearningOverview } from '../../model/agent/AgentLearningOverview';
import type { AgentToolArguments } from '../../model/agent/AgentToolSchemas';
import {
  AgentToolSchemaError,
  decodeAgentToolArguments,
  resolveCreateNoteFields
} from '../../model/agent/AgentToolSchemas';
import { 卡片服务 } from '../卡片服务';
import { 搜索服务 } from '../搜索服务';
import { 牌组服务 } from '../牌组服务';
import { 笔记服务 } from '../笔记服务';
import { 笔记类型服务 } from '../笔记类型服务';
import { 标签服务 } from '../标签服务';
import { 统计服务 } from '../统计服务';
import { AgentScope } from './AgentScope';
import { WikimediaImageService, WikimediaImageServiceError } from './WikimediaImageService';
import type { AgentDraftToolHandler, AgentReadToolHandler } from './AgentToolRegistry';
import { AgentToolRegistry } from './AgentToolRegistry';

interface FieldUpdate {
  noteId: number;
  fieldOrd: number;
  after: string;
}

interface RawFieldUpdate {
  noteId?: number;
  fieldOrd?: number;
  after?: string;
}

interface CreateOperationGroup {
  noteId: number;
  operations: DraftOperation[];
}

interface AgentDeckView {
  deckId: number;
  name: string;
  cardCount: number;
}

interface AgentNoteContextView {
  noteId: number;
  notetypeId: number;
  fields: string[];
  fieldLengths: number[];
  tags: string[];
  cardIds: number[];
  deckIds: number[];
  capability: NotetypeCapabilities;
}

interface AgentNotetypeDetailsView {
  capability: NotetypeCapabilities;
  legacyJson: string;
  legacyJsonTruncated: boolean;
  totalLength: number;
  nextOffset: number;
}

interface AgentTagView {
  name: string;
  level: number;
}

interface AgentCardStatisticsView {
  cardId: number;
  noteId: number;
  deck: string;
  added: number;
  firstReview?: number;
  latestReview?: number;
  dueDate?: number;
  duePosition?: number;
  interval: number;
  ease: number;
  reviews: number;
  lapses: number;
  averageSecs: number;
  totalSecs: number;
  cardType: string;
  notetype: string;
  fsrsRetrievability?: number;
  totalReviewEntries: number;
  recentReviews: StatsRevlogEntry[];
}

function parseFieldUpdates(json: string): FieldUpdate[] {
  let raw: RawFieldUpdate[];
  try {
    raw = JSON.parse(json) as RawFieldUpdate[];
  } catch (error) {
    throw new AgentToolSchemaError('invalid_tool_arguments');
  }
  if (!Array.isArray(raw) || raw.length > 1000) {
    throw new AgentToolSchemaError('invalid_tool_arguments');
  }
  const result: FieldUpdate[] = [];
  for (const item of raw) {
    if (item === null || typeof item !== 'object' ||
      !Number.isSafeInteger(item.noteId) || item.noteId === undefined || item.noteId < 0 ||
      !Number.isSafeInteger(item.fieldOrd) || item.fieldOrd === undefined || item.fieldOrd < 0 ||
      typeof item.after !== 'string') {
      throw new AgentToolSchemaError('invalid_tool_arguments');
    }
    result.push({ noteId: item.noteId, fieldOrd: item.fieldOrd, after: item.after });
  }
  return result;
}

function uniqueIds(ids: number[]): number[] {
  const output: number[] = [];
  const seen: Set<number> = new Set<number>();
  for (const id of ids) {
    if (!seen.has(id)) {
      seen.add(id);
      output.push(id);
    }
  }
  return output;
}

function flattenDeckTree(node: DeckTreeNode, output: AgentDeckView[], prefix: string = ''): void {
  const full: string = prefix.length === 0 ? node.name : `${prefix}::${node.name}`;
  if (node.deckId > 0) {
    output.push({ deckId: node.deckId, name: full, cardCount: node.totalIncludingChildren });
  }
  for (const child of node.children) {
    flattenDeckTree(child, output, node.deckId > 0 ? full : '');
  }
}

function flattenTagTree(node: TagTreeNode, output: AgentTagView[]): void {
  if (node.name.length > 0) {
    output.push({ name: node.name, level: node.level });
  }
  for (const child of node.children) {
    flattenTagTree(child, output);
  }
}

function cardStatisticsView(value: CardStatsView, historyLimit: number): AgentCardStatisticsView {
  return {
    cardId: value.cardId,
    noteId: value.noteId,
    deck: value.deck,
    added: value.added,
    firstReview: value.firstReview,
    latestReview: value.latestReview,
    dueDate: value.dueDate,
    duePosition: value.duePosition,
    interval: value.interval,
    ease: value.ease,
    reviews: value.reviews,
    lapses: value.lapses,
    averageSecs: value.averageSecs,
    totalSecs: value.totalSecs,
    cardType: value.cardType,
    notetype: value.notetype,
    fsrsRetrievability: value.fsrsRetrievability,
    totalReviewEntries: value.revlog.length,
    recentReviews: value.revlog.slice(0, historyLimit)
  };
}

class NamedReadHandler implements AgentReadToolHandler {
  private readonly owner: CardAgentTools;
  private readonly name: string;
  constructor(owner: CardAgentTools, name: string) { this.owner = owner; this.name = name; }
  execute(argumentsJson: string): Promise<string> { return this.owner.executeRead(this.name, argumentsJson); }
}

class NamedDraftHandler implements AgentDraftToolHandler {
  private readonly owner: CardAgentTools;
  private readonly name: string;
  constructor(owner: CardAgentTools, name: string) { this.owner = owner; this.name = name; }
  propose(argumentsJson: string): Promise<ChangeDraft> { return this.owner.proposeDraft(this.name, argumentsJson); }
}

/** 只读上下文和普通写草稿；本文件不调用任何写 Service。 */
export class CardAgentTools {
  private readonly documents: AgentDocumentAccess | null;
  private readonly scope: AgentScope;
  private readonly notes: 笔记服务 = new 笔记服务();
  private readonly cards: 卡片服务 = new 卡片服务();
  private readonly notetypes: 笔记类型服务 = new 笔记类型服务();
  private readonly searches: 搜索服务 = new 搜索服务();
  private readonly decks: 牌组服务 = new 牌组服务();
  private readonly tags: 标签服务 = new 标签服务();
  private readonly stats: 统计服务 = new 统计服务();
  private readonly imageSearch: WikimediaImageService = new WikimediaImageService();

  constructor(scope: AgentScope, documents: AgentDocumentAccess | null = null) { this.scope = scope; this.documents = documents; }

  register(registry: AgentToolRegistry, mode: AgentMode = 'edit'): void {
    registry.registerRead('get_note_type_capabilities', new NamedReadHandler(this, 'get_note_type_capabilities'));
    registry.registerRead('get_note_context', new NamedReadHandler(this, 'get_note_context'));
    registry.registerRead('read_note_field', new NamedReadHandler(this, 'read_note_field'));
    registry.registerRead('search_cards', new NamedReadHandler(this, 'search_cards'));
    registry.registerRead('search_notes', new NamedReadHandler(this, 'search_notes'));
    registry.registerRead('list_decks', new NamedReadHandler(this, 'list_decks'));
    registry.registerRead('list_notetypes', new NamedReadHandler(this, 'list_notetypes'));
    registry.registerRead('list_tags', new NamedReadHandler(this, 'list_tags'));
    registry.registerRead('get_notetype_details', new NamedReadHandler(this, 'get_notetype_details'));
    registry.registerRead('get_card_statistics', new NamedReadHandler(this, 'get_card_statistics'));
    registry.registerRead('get_learning_overview', new NamedReadHandler(this, 'get_learning_overview'));
    registry.registerRead('search_images', new NamedReadHandler(this, 'search_images'));
    if (mode !== 'edit') {
      registry.registerDraft('create_flashcards', new NamedDraftHandler(this, 'create_flashcards'));
    }
    if (mode !== 'create') {
      registry.registerDraft('propose_update_notes', new NamedDraftHandler(this, 'propose_update_notes'));
      registry.registerDraft('propose_move_cards', new NamedDraftHandler(this, 'propose_move_cards'));
    }
  }

  async executeRead(name: string, argumentsJson: string): Promise<string> {
    const args: AgentToolArguments = decodeAgentToolArguments(name, argumentsJson);
    if (name === 'get_note_type_capabilities') {
      this.scope.assertReadableNotetypeIds(args.notetypeIds);
      const values: NotetypeCapabilities[] = [];
      for (const id of args.notetypeIds) {
        values.push(await this.notetypes.获取笔记类型能力(id));
      }
      return JSON.stringify(values);
    }
    if (name === 'get_note_context') {
      return this.getNoteContext(args);
    }
    if (name === 'search_cards' || name === 'search_notes') {
      const allIds: number[] = args.cursor.length > 0 ? [] : (name === 'search_cards' ?
        await this.searches.搜索卡片({ search: args.query, order: { kind: 'none' } }) :
        await this.searches.搜索笔记({ search: args.query, order: { kind: 'none' } }));
      const page = args.cursor.length > 0 ? this.scope.retrieval.next(name, args.cursor, args.limit) :
        this.scope.retrieval.begin(name, args.query, allIds, args.limit);
      if (name === 'search_cards') {
        this.scope.registerReadableCardIds(page.ids);
        return JSON.stringify({ cardIds: page.ids, totalMatched: page.totalMatched,
          nextCursor: page.nextCursor, returnedCount: page.returnedCount, query: page.query });
      }
      this.scope.registerReadableNoteIds(page.ids);
      return JSON.stringify({ noteIds: page.ids, totalMatched: page.totalMatched,
        nextCursor: page.nextCursor, returnedCount: page.returnedCount, query: page.query });
    }
    if (name === 'read_note_field') {
      this.scope.assertReadableNoteIds([args.noteId]);
      this.scope.retrieval.beforeRead([args.noteId]);
      const note: EditableNote = await this.notes.获取笔记(args.noteId);
      if (args.fieldOrd >= note.fields.length) { throw new Error('field_out_of_range'); }
      const field: string = note.fields[args.fieldOrd];
      if (args.offset > field.length) { throw new Error('field_offset_out_of_range'); }
      const end: number = Math.min(field.length, args.offset + args.length);
      this.scope.retrieval.recordRead(note.id);
      return JSON.stringify({ noteId: note.id, fieldOrd: args.fieldOrd, text: field.slice(args.offset, end),
        totalLength: field.length, nextOffset: end < field.length ? end : -1, readCount: this.scope.retrieval.readCount() });
    }
    if (name === 'list_notetypes') {
      const allValues: NotetypeNameId[] = await this.notetypes.获取笔记类型名列表();
      const filtered: NotetypeNameId[] = [];
      const query: string = args.query.toLocaleLowerCase();
      for (const value of allValues) {
        if (query.length === 0 || value.name.toLocaleLowerCase().includes(query)) {
          filtered.push(value);
        }
      }
      const limit: number = Math.min(1000, args.limit === 0 ? 100 : args.limit);
      const result: NotetypeNameId[] = filtered.slice(args.offset, args.offset + limit);
      this.scope.registerReadableNotetypeIds(result.map((value: NotetypeNameId): number => value.id));
      return JSON.stringify({ notetypes: result, totalMatched: filtered.length, nextOffset: args.offset + limit < filtered.length ? args.offset + limit : -1 });
    }
    if (name === 'list_tags') {
      const tree: TagTreeNode = await this.tags.标签树();
      const allValues: AgentTagView[] = [];
      flattenTagTree(tree, allValues);
      const filtered: AgentTagView[] = [];
      const query: string = args.query.toLocaleLowerCase();
      for (const value of allValues) {
        if (query.length === 0 || value.name.toLocaleLowerCase().includes(query)) {
          filtered.push(value);
        }
      }
      const limit: number = Math.min(1000, args.limit === 0 ? 100 : args.limit);
      return JSON.stringify({ tags: filtered.slice(args.offset, args.offset + limit), totalMatched: filtered.length, nextOffset: args.offset + limit < filtered.length ? args.offset + limit : -1 });
    }
    if (name === 'get_notetype_details') {
      this.scope.assertReadableNotetypeIds(args.notetypeIds);
      const values: AgentNotetypeDetailsView[] = [];
      for (const id of args.notetypeIds) {
        const capability: NotetypeCapabilities = await this.notetypes.获取笔记类型能力(id);
        const legacyJson: string = await this.notetypes.获取笔记类型旧版(id);
        if (args.offset > legacyJson.length) { throw new Error('field_offset_out_of_range'); }
        const end: number = Math.min(legacyJson.length, args.offset + args.length);
        const truncated: boolean = args.offset > 0 || end < legacyJson.length;
        values.push({
          capability: capability,
          legacyJson: legacyJson.slice(args.offset, end),
          legacyJsonTruncated: truncated, totalLength: legacyJson.length,
          nextOffset: end < legacyJson.length ? end : -1
        });
      }
      return JSON.stringify(values);
    }
    if (name === 'get_learning_overview') {
      const query: string = args.query;
      const graphs = await this.stats.获取图表统计(Math.max(1, args.days - 1), query);
      return JSON.stringify(buildAgentLearningOverview(graphs, query, args.days, args.forecastDays));
    }
    if (name === 'get_card_statistics') {
      this.scope.assertReadableCardIds(args.cardIds);
      this.scope.assertBatchCount(args.cardIds.length);
      const historyLimit: number = Math.min(200, args.limit === 0 ? 50 : args.limit);
      const values: AgentCardStatisticsView[] = [];
      for (const id of args.cardIds) {
        values.push(cardStatisticsView(await this.stats.获取卡片统计(id), historyLimit));
      }
      return JSON.stringify(values);
    }
    if (name === 'search_images') {
      try {
        const candidates: AgentImageCandidate[] = await this.imageSearch.search(args.query, args.limit);
        for (const candidate of candidates) {
          this.scope.registerImageCandidate(candidate);
        }
        return JSON.stringify({ candidates: candidates, totalMatched: candidates.length });
      } catch (error) {
        if (error instanceof WikimediaImageServiceError) { throw error; }
        throw new WikimediaImageServiceError('search_http', error instanceof Error ? error.message : `${error}`);
      }
    }
    const tree: DeckTreeNode = await this.decks.获取牌组树();
    const allDecks: AgentDeckView[] = [];
    flattenDeckTree(tree, allDecks);
    const filtered: AgentDeckView[] = [];
    const query: string = args.query.toLocaleLowerCase();
    for (const deck of allDecks) {
      if (query.length === 0 || deck.name.toLocaleLowerCase().includes(query)) {
        filtered.push(deck);
      }
    }
    const limit: number = Math.min(1000, args.limit === 0 ? 100 : args.limit);
    const result: AgentDeckView[] = filtered.slice(args.offset, args.offset + limit);
    this.scope.registerReadableDeckIds(result.map((deck: AgentDeckView): number => deck.deckId));
    return JSON.stringify({ decks: result, totalMatched: filtered.length, nextOffset: args.offset + limit < filtered.length ? args.offset + limit : -1 });
  }

  async proposeDraft(name: string, argumentsJson: string): Promise<ChangeDraft> {
    const args: AgentToolArguments = decodeAgentToolArguments(name, argumentsJson);
    let draft: ChangeDraft;
    if (name === 'create_flashcards') {
      args.targetDeckId = this.scope.createTargetDeckId();
      args.targetNotetypeId = this.scope.createTargetNotetypeId();
      args.draftId = this.scope.nextCreateDraftId();
      args.reason = `生成 ${args.createNotes.length} 张闪卡`;
      draft = await this.proposeCreate(args);
    } else if (name === 'propose_update_notes') {
      draft = await this.proposeUpdate(args);
    } else {
      draft = await this.proposeMove(args);
    }
    if (!this.scope.registerDraftId(args.draftId)) {
      throw new AgentToolSchemaError('duplicate_draft_id');
    }
    return draft;
  }

  private async getNoteContext(args: AgentToolArguments): Promise<string> {
    this.scope.assertReadableCardIds(args.cardIds);
    this.scope.assertReadableNoteIds(args.noteIds);
    const noteIds: number[] = args.noteIds.slice();
    for (const cardId of args.cardIds) {
      const card: Card = await this.cards.获取卡片(cardId);
      noteIds.push(card.noteId);
      this.scope.registerReadableNoteIds([card.noteId]);
      this.scope.registerReadableDeckIds([card.deckId]);
    }
    const contexts: AgentNoteContextView[] = [];
    const allNoteIds: number[] = uniqueIds(noteIds);
    const pageIds: number[] = allNoteIds.slice(args.offset, args.offset + Math.min(5, args.limit || 5));
    this.scope.retrieval.beforeRead(pageIds);
    for (const noteId of pageIds) {
      const note: EditableNote = await this.notes.获取笔记(noteId);
      const cardIds: number[] = await this.notes.获取笔记的卡片(noteId);
      const deckIds: number[] = [];
      for (const cardId of cardIds) {
        const card: Card = await this.cards.获取卡片(cardId);
        deckIds.push(card.deckId);
      }
      const capability: NotetypeCapabilities = await this.notetypes.获取笔记类型能力(note.notetypeId);
      this.scope.registerReadableCardIds(cardIds);
      this.scope.registerReadableNotetypeIds([note.notetypeId]);
      this.scope.registerReadableDeckIds(uniqueIds(deckIds));
      contexts.push({
        noteId: note.id,
        notetypeId: note.notetypeId,
        fields: note.fields.map((field: string): string => field.slice(0, Math.min(1000, Math.max(1, Math.floor(4000 / note.fields.length))))),
        fieldLengths: note.fields.map((field: string): number => field.length),
        tags: note.tags.slice(),
        cardIds: cardIds,
        deckIds: uniqueIds(deckIds),
        capability: capability
      });
    }
    for (const item of contexts) { this.scope.retrieval.recordRead(item.noteId); }
    return JSON.stringify({ notes: contexts, totalRequested: allNoteIds.length,
      nextOffset: args.offset + pageIds.length < allNoteIds.length ? args.offset + pageIds.length : -1,
      readCount: this.scope.retrieval.readCount(), fieldPreviewLimit: 1000 });
  }

  private async proposeCreate(args: AgentToolArguments): Promise<ChangeDraft> {
    this.scope.assertReadableDeckIds([args.targetDeckId]);
    this.scope.assertReadableNotetypeIds([args.targetNotetypeId]);
    this.scope.assertCreateTarget(args.targetDeckId, args.targetNotetypeId);
    this.scope.assertBatchCount(args.createNotes.length);
    const capability: NotetypeCapabilities = await this.notetypes.获取笔记类型能力(args.targetNotetypeId);
    const imageAttachments: AgentImageAttachment[] = [];
    for (let index: number = 0; index < args.createNotes.length; index++) {
      const item = args.createNotes[index];
      item.fields = resolveCreateNoteFields(item, capability.fieldNames);
      const validationError: string = validateAgentNoteFields(capability, item.fields,
        { requireYearCloze: this.scope.createRequiresYearCloze() });
      if (validationError.length > 0) {
        throw new AgentToolSchemaError(validationError, `cards[${index}].fields`,
          validationError === 'missing_year_cloze' ?
            'Every requested card must contain a four-digit year inside an allowed cloze answer' :
          'The note fields do not satisfy the selected note type');
      }
      for (const image of item.images) {
        const candidate: AgentImageCandidate = this.scope.getImageCandidate(image.candidateId);
        if (image.fieldOrd >= item.fields.length || image.fieldOrd >= capability.fieldNames.length) {
          throw new AgentToolSchemaError('invalid_tool_arguments', `cards[${index}].images`,
            'Image fieldOrd is outside the selected note type fields');
        }
        imageAttachments.push({
          noteId: -(index + 1), fieldOrd: image.fieldOrd, candidateId: image.candidateId,
          placement: 'append', altText: image.altText, before: '', candidate: candidate
        });
      }
      if ((item.sources ?? []).length > 0) {
        if (this.documents === null) throw new Error('document_tools_unavailable');
        item.fields = this.documents.annotate(item.fields, item.sources ?? []);
      }
    }
    const operations: DraftOperation[] = [];
    const groups: CreateOperationGroup[] = this.parseCreateNotes(args);
    for (const group of groups) {
      for (const operation of group.operations) {
        operations.push(operation);
      }
    }
    return {
      id: args.draftId, risk: 'write', summary: args.reason,
      baselineHash: '', confirmationLevel: 1, status: 'pending',
      affectedNoteIds: [], affectedCardIds: [], affectedDeckIds: [args.targetDeckId],
      affectedNotetypeIds: [args.targetNotetypeId], operations: operations,
      imageAttachments: imageAttachments
    };
  }

  private parseCreateNotes(args: AgentToolArguments): CreateOperationGroup[] {
    const result: CreateOperationGroup[] = [];
    for (let index: number = 0; index < args.createNotes.length; index++) {
      const noteId: number = -(index + 1);
      const fields: string[] = args.createNotes[index].fields;
      const operations: DraftOperation[] = [];
      for (let fieldOrd: number = 0; fieldOrd < fields.length; fieldOrd++) {
        operations.push({
          kind: 'create_note', noteId: noteId, cardId: 0, deckId: args.targetDeckId,
          fieldOrd: fieldOrd, before: '', after: fields[fieldOrd]
        });
      }
      result.push({ noteId: noteId, operations: operations });
    }
    return result;
  }

  private async proposeUpdate(args: AgentToolArguments): Promise<ChangeDraft> {
    this.scope.assertReadableNoteIds(args.noteIds);
    const updates: FieldUpdate[] = args.fieldUpdatesJson.trim().length === 0 ? [] :
      parseFieldUpdates(args.fieldUpdatesJson);
    const operations: DraftOperation[] = [];
    const imageAttachments: AgentImageAttachment[] = [];
    const affectedCards: number[] = [];
    const imageTargets: Set<number> = new Set<number>();
    for (const image of args.imageUpdates) {
      if (args.noteIds.indexOf(image.noteId) < 0) {
        throw new AgentToolSchemaError('invalid_tool_arguments', 'imagesJson',
          'Every image update noteId must be included in noteIds');
      }
      if (imageTargets.has(image.noteId)) {
        throw new AgentToolSchemaError('invalid_tool_arguments', `imagesJson.${image.noteId}`,
          'Each note may contain at most one image attachment');
      }
      imageTargets.add(image.noteId);
    }
    for (const noteId of args.noteIds) {
      const note: EditableNote = await this.notes.获取笔记(noteId);
      const capability: NotetypeCapabilities = await this.notetypes.获取笔记类型能力(note.notetypeId);
      const cardIds: number[] = await this.notes.获取笔记的卡片(noteId);
      affectedCards.push(...cardIds);
      for (const update of updates) {
        if (update.noteId === noteId) {
          if (update.fieldOrd >= note.fields.length) {
            throw new AgentToolSchemaError('invalid_tool_arguments');
          }
          operations.push({
            kind: 'update_field', noteId: noteId, cardId: 0, deckId: 0,
            fieldOrd: update.fieldOrd, before: note.fields[update.fieldOrd], after: update.after
          });
        }
      }
      if (args.tags.length > 0) {
        operations.push({
          kind: 'update_tags', noteId: noteId, cardId: 0, deckId: 0, fieldOrd: -1,
          before: JSON.stringify(note.tags), after: JSON.stringify(args.tags)
        });
      }
      for (const image of args.imageUpdates) {
        if (image.noteId !== noteId) { continue; }
        const candidate: AgentImageCandidate = this.scope.getImageCandidate(image.candidateId);
        if (image.fieldOrd >= note.fields.length || image.fieldOrd >= capability.fieldNames.length) {
          throw new AgentToolSchemaError('invalid_tool_arguments', `imagesJson.${noteId}.fieldOrd`,
            'Image fieldOrd is outside the note fields');
        }
        imageAttachments.push({
          noteId: noteId, fieldOrd: image.fieldOrd, candidateId: image.candidateId,
          placement: 'append', altText: image.altText, before: note.fields[image.fieldOrd], candidate: candidate
        });
      }
    }
    if (operations.length === 0 && imageAttachments.length === 0) {
      throw new AgentToolSchemaError('invalid_tool_arguments', '$',
        'At least one field, tag, or image update is required');
    }
    return {
      id: args.draftId, risk: 'write', summary: args.reason,
      baselineHash: JSON.stringify(operations), confirmationLevel: 1, status: 'pending',
      affectedNoteIds: args.noteIds.slice(), affectedCardIds: uniqueIds(affectedCards),
      affectedDeckIds: [], affectedNotetypeIds: [],
      operations: operations, imageAttachments: imageAttachments
    };
  }

  private async proposeMove(args: AgentToolArguments): Promise<ChangeDraft> {
    this.scope.assertReadableCardIds(args.cardIds);
    this.scope.assertReadableDeckIds([args.targetDeckId]);
    const operations: DraftOperation[] = [];
    const noteIds: number[] = [];
    for (const cardId of args.cardIds) {
      const card: Card = await this.cards.获取卡片(cardId);
      noteIds.push(card.noteId);
      operations.push({
        kind: 'move_card', noteId: card.noteId, cardId: card.id, deckId: args.targetDeckId,
        fieldOrd: -1, before: String(card.deckId), after: String(args.targetDeckId)
      });
    }
    return {
      id: args.draftId, risk: 'write', summary: args.reason,
      baselineHash: JSON.stringify(operations), confirmationLevel: 1, status: 'pending',
      affectedNoteIds: uniqueIds(noteIds), affectedCardIds: args.cardIds.slice(),
      affectedDeckIds: [args.targetDeckId], affectedNotetypeIds: [],
      operations: operations
    };
  }
}
