// SPDX-License-Identifier: AGPL-3.0-or-later

import { common } from '@kit.AbilityKit';
import type { Card } from '../../proto/messages/CardsMessages';
import type { DeckTreeNode } from '../../proto/messages/DeckMessages';
import type { EditableNote } from '../../proto/messages/NoteMessages';
import type { NotetypeCapabilities, 变更笔记类型请求 } from '../../proto/messages/NotetypeMessages';
import type { AgentImageAttachment, AgentImageCandidate, ChangeDraft, DraftOperation } from '../../model/agent/AgentTypes';
import { AgentConfirmationManager } from '../../model/agent/AgentConfirmation';
import type { AgentConfirmationToken } from '../../model/agent/AgentConfirmation';
import { 卡片服务 } from '../卡片服务';
import { 牌组服务 } from '../牌组服务';
import { 笔记服务 } from '../笔记服务';
import { 笔记类型服务 } from '../笔记类型服务';
import { 媒体服务 } from '../媒体服务';
import { WikimediaImageService } from './WikimediaImageService';

interface TemplateUpdatePayload {
  templates: string;
  css: string;
}

interface ChangeNotetypePayload {
  noteIds: number[];
  newFields: number[];
  newTemplates: number[];
}

interface LegacyNotetypeJson {
  css: string;
  tmpls: Object[];
}

interface CreateOperationGroup {
  noteId: number;
  operations: DraftOperation[];
}

export interface PreparedAgentDraft {
  draft: ChangeDraft;
  firstToken: AgentConfirmationToken;
  preparedAt: number;
}

export interface AgentDraftItemResult {
  operation: string;
  targetId: number;
  succeeded: boolean;
  errorCode: string;
}

export interface AgentDraftExecutionResult {
  draftId: string;
  status: string;
  succeeded: number;
  failed: number;
  affectedCardCount: number;
  items: AgentDraftItemResult[];
}

export class AgentDraftExecutorError extends Error {
  readonly code: string;
  constructor(code: string) { super(code); this.code = code; }
}

function findDeck(node: DeckTreeNode, id: number): DeckTreeNode | null {
  if (node.deckId === id) { return node; }
  for (const child of node.children) {
    const found: DeckTreeNode | null = findDeck(child, id);
    if (found !== null) { return found; }
  }
  return null;
}

function errorCode(error: Error): string {
  return error.message.length > 0 ? error.message : 'backend_write_failed';
}

function parseChangePayload(json: string): ChangeNotetypePayload {
  try { return JSON.parse(json) as ChangeNotetypePayload; } catch (error) {
    throw new AgentDraftExecutorError('invalid_draft_payload');
  }
}

function parseChangeRequest(json: string): 变更笔记类型请求 {
  try { return JSON.parse(json) as 变更笔记类型请求; } catch (error) {
    throw new AgentDraftExecutorError('invalid_draft_payload');
  }
}

function parseTemplatePayload(json: string): TemplateUpdatePayload {
  try { return JSON.parse(json) as TemplateUpdatePayload; } catch (error) {
    throw new AgentDraftExecutorError('invalid_draft_payload');
  }
}

function parseTemplates(json: string): Object[] {
  try {
    const value: Object[] = JSON.parse(json) as Object[];
    if (!Array.isArray(value)) { throw new AgentDraftExecutorError('invalid_draft_payload'); }
    return value;
  } catch (error) {
    throw new AgentDraftExecutorError('invalid_draft_payload');
  }
}

/**
 * Agent 草稿的唯一写入边界。模型与工具注册表只能生成 ChangeDraft；只有 UI
 * 持有的确认令牌能让本类调用现有业务 Service。
 */
export class AgentDraftExecutor {
  private readonly notes: 笔记服务 = new 笔记服务();
  private readonly cards: 卡片服务 = new 卡片服务();
  private readonly decks: 牌组服务 = new 牌组服务();
  private readonly notetypes: 笔记类型服务 = new 笔记类型服务();
  private readonly media: 媒体服务 = new 媒体服务();
  private readonly images: WikimediaImageService = new WikimediaImageService();
  private readonly confirmations: AgentConfirmationManager;

  constructor(confirmations: AgentConfirmationManager = new AgentConfirmationManager()) {
    this.confirmations = confirmations;
  }

  async prepare(draft: ChangeDraft, now: number = Date.now()): Promise<PreparedAgentDraft> {
    if (draft.status !== 'pending') { throw new AgentDraftExecutorError('draft_not_pending'); }
    try {
      await this.assertBaseline(draft);
    } catch (error) {
      draft.status = 'conflict';
      if (error instanceof AgentDraftExecutorError) { throw error; }
      throw new AgentDraftExecutorError('draft_conflict');
    }
    draft.status = 'prepared';
    return {
      draft: draft,
      firstToken: this.confirmations.issue(draft.id, 1, now),
      preparedAt: now
    };
  }

  authorizeHighRisk(prepared: PreparedAgentDraft, firstToken: AgentConfirmationToken,
    now: number = Date.now()): AgentConfirmationToken {
    if (prepared.draft.risk !== 'high_risk' || prepared.draft.status !== 'prepared') {
      throw new AgentDraftExecutorError('high_risk_confirmation_not_allowed');
    }
    this.confirmations.check(firstToken, prepared.draft.id, 1, now);
    return this.confirmations.issue(prepared.draft.id, 2, now);
  }

  async executeOrdinary(prepared: PreparedAgentDraft, token: AgentConfirmationToken,
    now: number = Date.now()): Promise<AgentDraftExecutionResult> {
    const draft: ChangeDraft = prepared.draft;
    if (draft.risk !== 'write' || draft.status !== 'prepared') {
      throw new AgentDraftExecutorError('ordinary_execution_not_allowed');
    }
    this.confirmations.consume(token, draft.id, 1, now);
    await this.revalidateForExecution(draft);
    draft.status = 'executing';
    const result: AgentDraftExecutionResult = await this.executeOrdinaryOperations(draft);
    draft.status = result.failed === 0 ? 'completed' : (result.succeeded > 0 ? 'partial' : 'failed');
    result.status = draft.status;
    return result;
  }

  async executeHighRisk(prepared: PreparedAgentDraft, firstToken: AgentConfirmationToken,
    secondToken: AgentConfirmationToken, now: number = Date.now()): Promise<AgentDraftExecutionResult> {
    const draft: ChangeDraft = prepared.draft;
    if (draft.risk !== 'high_risk' || draft.status !== 'prepared') {
      throw new AgentDraftExecutorError('high_risk_execution_not_allowed');
    }
    this.confirmations.consumePair(firstToken, secondToken, draft.id, now);
    await this.revalidateForExecution(draft);
    draft.status = 'executing';
    const result: AgentDraftExecutionResult = await this.executeHighRiskOperations(draft);
    draft.status = result.failed === 0 ? 'completed' : (result.succeeded > 0 ? 'partial' : 'failed');
    result.status = draft.status;
    return result;
  }

  private async assertBaseline(draft: ChangeDraft): Promise<void> {
    for (const operation of draft.operations) {
      if (operation.kind === 'create_note') {
        await this.notetypes.获取笔记类型能力(draft.affectedNotetypeIds[0]);
        const tree: DeckTreeNode = await this.decks.获取牌组树();
        if (findDeck(tree, operation.deckId) === null) { throw new AgentDraftExecutorError('draft_conflict'); }
      } else if (operation.kind === 'update_field') {
        const note: EditableNote = await this.notes.获取笔记(operation.noteId);
        if (operation.fieldOrd >= note.fields.length || note.fields[operation.fieldOrd] !== operation.before) {
          throw new AgentDraftExecutorError('draft_conflict');
        }
      } else if (operation.kind === 'update_tags') {
        const note: EditableNote = await this.notes.获取笔记(operation.noteId);
        if (JSON.stringify(note.tags) !== operation.before) { throw new AgentDraftExecutorError('draft_conflict'); }
      } else if (operation.kind === 'move_card') {
        const card: Card = await this.cards.获取卡片(operation.cardId);
        if (String(card.deckId) !== operation.before) { throw new AgentDraftExecutorError('draft_conflict'); }
        const tree: DeckTreeNode = await this.decks.获取牌组树();
        if (findDeck(tree, operation.deckId) === null) { throw new AgentDraftExecutorError('draft_conflict'); }
      } else if (operation.kind === 'delete_note') {
        const note: EditableNote = await this.notes.获取笔记(operation.noteId);
        if (JSON.stringify(note) !== operation.before) { throw new AgentDraftExecutorError('draft_conflict'); }
      } else if (operation.kind === 'delete_card') {
        const card: Card = await this.cards.获取卡片(operation.cardId);
        if (JSON.stringify(card) !== operation.before) { throw new AgentDraftExecutorError('draft_conflict'); }
      } else if (operation.kind === 'delete_deck') {
        const tree: DeckTreeNode = await this.decks.获取牌组树();
        const deck: DeckTreeNode | null = findDeck(tree, operation.deckId);
        if (deck === null || JSON.stringify(deck) !== operation.before) {
          throw new AgentDraftExecutorError('draft_conflict');
        }
      } else if (operation.kind === 'delete_note_type') {
        const id: number = draft.affectedNotetypeIds[0];
        const capability: NotetypeCapabilities = await this.notetypes.获取笔记类型能力(id);
        if (JSON.stringify(capability) !== operation.before) { throw new AgentDraftExecutorError('draft_conflict'); }
      } else if (operation.kind === 'update_template') {
        const json: string = await this.notetypes.获取笔记类型旧版(draft.affectedNotetypeIds[0]);
        if (json !== operation.before) { throw new AgentDraftExecutorError('draft_conflict'); }
      } else if (operation.kind === 'change_note_type') {
        const before: 变更笔记类型请求 = parseChangeRequest(operation.before);
        const oldId: number = await this.notes.获取笔记的唯一笔记类型(draft.affectedNoteIds);
        if (oldId !== before.oldNotetypeId) { throw new AgentDraftExecutorError('draft_conflict'); }
        const current = await this.notetypes.获取变更笔记类型信息(oldId, before.newNotetypeId);
        if (JSON.stringify(current.input) !== operation.before) {
          throw new AgentDraftExecutorError('draft_conflict');
        }
      }
    }
    for (const attachment of draft.imageAttachments ?? []) {
      if (attachment.noteId <= 0) { continue; }
      const note: EditableNote = await this.notes.获取笔记(attachment.noteId);
      if (attachment.fieldOrd < 0 || attachment.fieldOrd >= note.fields.length ||
        (attachment.before !== undefined && note.fields[attachment.fieldOrd] !== attachment.before)) {
        throw new AgentDraftExecutorError('draft_conflict');
      }
    }
  }

  private async revalidateForExecution(draft: ChangeDraft): Promise<void> {
    try {
      await this.assertBaseline(draft);
    } catch (error) {
      draft.status = 'conflict';
      if (error instanceof AgentDraftExecutorError) { throw error; }
      throw new AgentDraftExecutorError('draft_conflict');
    }
  }

  private groupCreateOperations(operations: DraftOperation[]): CreateOperationGroup[] {
    const groups: CreateOperationGroup[] = [];
    for (const operation of operations) {
      let group: CreateOperationGroup | null = null;
      for (const candidate of groups) {
        if (candidate.noteId === operation.noteId) { group = candidate; break; }
      }
      if (group === null) {
        group = { noteId: operation.noteId, operations: [] };
        groups.push(group);
      }
      group.operations.push(operation);
    }
    return groups;
  }

  private emptyResult(draft: ChangeDraft): AgentDraftExecutionResult {
    return {
      draftId: draft.id, status: 'executing', succeeded: 0, failed: 0,
      affectedCardCount: draft.affectedCardIds.length, items: []
    };
  }

  private appendSuccess(result: AgentDraftExecutionResult, operation: string, targetId: number): void {
    result.succeeded += 1;
    result.items.push({ operation: operation, targetId: targetId, succeeded: true, errorCode: '' });
  }

  private appendFailure(result: AgentDraftExecutionResult, operation: string,
    targetId: number, error: Error): void {
    result.failed += 1;
    result.items.push({ operation: operation, targetId: targetId, succeeded: false, errorCode: errorCode(error) });
  }

  private getAbilityContext(): common.UIAbilityContext {
    const context: common.UIAbilityContext | undefined =
      AppStorage.get<common.UIAbilityContext>('abilityContext');
    if (context === undefined) {
      throw new AgentDraftExecutorError('context_unavailable');
    }
    return context;
  }

  private escapeHtmlAttribute(value: string): string {
    return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;')
      .replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  private mediaDesiredName(draftId: string, noteIndex: number, imageIndex: number,
    extension: string): string {
    const safeId: string = draftId.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 80);
    return `ai-agent-${safeId}-${noteIndex}-${imageIndex}.${extension}`;
  }

  /** @throws {Error} 图片下载或写入失败，调用方通过 writtenMedia 补偿已写入媒体。 */
  private async appendImages(note: EditableNote, attachments: AgentImageAttachment[],
    draftId: string, noteIndex: number, writtenMedia: string[]): Promise<void> {
    if (attachments.length === 0) { return; }
    const context: common.UIAbilityContext = this.getAbilityContext();
    for (let index: number = 0; index < attachments.length; index++) {
      const attachment: AgentImageAttachment = attachments[index];
      const candidate: AgentImageCandidate | undefined = attachment.candidate;
      if (candidate === undefined) {
        throw new AgentDraftExecutorError('image_candidate_out_of_scope');
      }
      const bytes: Uint8Array = await this.images.download(context, candidate, draftId, noteIndex * 10 + index);
      const extension: string = WikimediaImageService.extensionForBytes(bytes);
      if (extension.length === 0) {
        throw new AgentDraftExecutorError('invalid_image');
      }
      const desiredName: string = this.mediaDesiredName(draftId, noteIndex, index, extension);
      const 最终文件名: string = await this.media.添加媒体文件(desiredName, bytes);
      if (最终文件名.length === 0) {
        throw new AgentDraftExecutorError('media_write_failed');
      }
      // 逐项登记到调用方的补偿列表，后续图片失败时也能回收此前写入。
      writtenMedia.push(最终文件名);
      const altText: string = this.escapeHtmlAttribute(attachment.altText);
      const imageTag: string = altText.length === 0
        ? `<img src="${this.escapeHtmlAttribute(最终文件名)}">`
        : `<img src="${this.escapeHtmlAttribute(最终文件名)}" alt="${altText}">`;
      const current: string = note.fields[attachment.fieldOrd];
      note.fields[attachment.fieldOrd] = current.length === 0 ? imageTag : `${current}<br>${imageTag}`;
    }
  }

  private async compensateMedia(fileNames: string[]): Promise<string> {
    if (fileNames.length === 0) { return ''; }
    try {
      await this.media.媒体文件进回收站(fileNames);
      return '';
    } catch (error) {
      return `media_compensation_failed:${fileNames.join(',')}`;
    }
  }

  private async failureWithMediaCompensation(error: Error, media: string[]): Promise<Error> {
    const compensationError: string = await this.compensateMedia(media);
    return compensationError.length === 0 ? error : new Error(`${errorCode(error)};${compensationError}`);
  }

  private async executeOrdinaryOperations(draft: ChangeDraft): Promise<AgentDraftExecutionResult> {
    const result: AgentDraftExecutionResult = this.emptyResult(draft);
    if (draft.operations.length > 0 && draft.operations[0].kind === 'create_note') {
      const groups: CreateOperationGroup[] = this.groupCreateOperations(draft.operations);
      for (let groupIndex: number = 0; groupIndex < groups.length; groupIndex++) {
        const group: CreateOperationGroup = groups[groupIndex];
        const writtenMedia: string[] = [];
        try {
          const note: EditableNote = await this.notes.新建笔记(draft.affectedNotetypeIds[0]);
          for (const operation of group.operations) { note.fields[operation.fieldOrd] = operation.after; }
          const imageAttachments: AgentImageAttachment[] = (draft.imageAttachments ?? []).filter(
            (attachment: AgentImageAttachment): boolean => attachment.noteId === group.noteId);
          await this.appendImages(note, imageAttachments, draft.id, groupIndex, writtenMedia);
          const noteId: number = await this.notes.添加笔记(note, draft.affectedDeckIds[0]);
          this.appendSuccess(result, 'create_note', noteId);
        } catch (error) {
          const finalError: Error = await this.failureWithMediaCompensation(
            error instanceof Error ? error : new Error(`${error}`), writtenMedia);
          this.appendFailure(result, 'create_note', group.noteId, finalError);
        }
      }
      return result;
    }

    for (const noteId of draft.affectedNoteIds) {
      const noteOperations: DraftOperation[] = draft.operations.filter(
        (operation: DraftOperation): boolean => operation.noteId === noteId &&
          (operation.kind === 'update_field' || operation.kind === 'update_tags'));
      const imageAttachments: AgentImageAttachment[] = (draft.imageAttachments ?? []).filter(
        (attachment: AgentImageAttachment): boolean => attachment.noteId === noteId);
      if (noteOperations.length === 0 && imageAttachments.length === 0) { continue; }
      const writtenMedia: string[] = [];
      try {
        const note: EditableNote = await this.notes.获取笔记(noteId);
        for (const operation of noteOperations) {
          if (operation.kind === 'update_field') { note.fields[operation.fieldOrd] = operation.after; }
          if (operation.kind === 'update_tags') { note.tags = JSON.parse(operation.after) as string[]; }
        }
        await this.appendImages(note, imageAttachments, draft.id, noteId, writtenMedia);
        await this.notes.更新笔记([note], false);
        this.appendSuccess(result, 'update_note', noteId);
      } catch (error) {
        const finalError: Error = await this.failureWithMediaCompensation(
          error instanceof Error ? error : new Error(`${error}`), writtenMedia);
        this.appendFailure(result, 'update_note', noteId, finalError);
      }
    }
    for (const operation of draft.operations) {
      if (operation.kind !== 'move_card') { continue; }
      try {
        await this.cards.设置牌组([operation.cardId], operation.deckId);
        this.appendSuccess(result, 'move_card', operation.cardId);
      } catch (error) { this.appendFailure(result, 'move_card', operation.cardId, error as Error); }
    }
    return result;
  }

  private async executeHighRiskOperations(draft: ChangeDraft): Promise<AgentDraftExecutionResult> {
    const result: AgentDraftExecutionResult = this.emptyResult(draft);
    for (const operation of draft.operations) {
      try {
        if (operation.kind === 'delete_note') {
          const ids: number[] = await this.notes.获取笔记的卡片(operation.noteId);
          await this.cards.删除卡片(ids);
          this.appendSuccess(result, operation.kind, operation.noteId);
        } else if (operation.kind === 'delete_card') {
          await this.cards.删除卡片([operation.cardId]);
          this.appendSuccess(result, operation.kind, operation.cardId);
        } else if (operation.kind === 'delete_deck') {
          await this.decks.删除牌组([operation.deckId]);
          this.appendSuccess(result, operation.kind, operation.deckId);
        } else if (operation.kind === 'delete_note_type') {
          const id: number = draft.affectedNotetypeIds[0];
          await this.notetypes.移除笔记类型(id);
          this.appendSuccess(result, operation.kind, id);
        } else if (operation.kind === 'change_note_type') {
          const request: 变更笔记类型请求 = parseChangeRequest(operation.before);
          const payload: ChangeNotetypePayload = parseChangePayload(operation.after);
          request.noteIds = payload.noteIds.slice();
          request.newFields = payload.newFields.slice();
          request.newTemplates = payload.newTemplates.slice();
          await this.notetypes.变更笔记类型(request);
          this.appendSuccess(result, operation.kind, payload.noteIds.length);
        } else if (operation.kind === 'update_template') {
          const payload: TemplateUpdatePayload = parseTemplatePayload(operation.after);
          const notetype: LegacyNotetypeJson = JSON.parse(operation.before) as LegacyNotetypeJson;
          notetype.tmpls = parseTemplates(payload.templates);
          notetype.css = payload.css;
          await this.notetypes.更新笔记类型旧版(JSON.stringify(notetype), false);
          this.appendSuccess(result, operation.kind, draft.affectedNotetypeIds[0]);
        }
      } catch (error) {
        const target: number = operation.noteId || operation.cardId || operation.deckId ||
          (draft.affectedNotetypeIds.length > 0 ? draft.affectedNotetypeIds[0] : 0);
        this.appendFailure(result, operation.kind, target, error as Error);
      }
    }
    return result;
  }
}
