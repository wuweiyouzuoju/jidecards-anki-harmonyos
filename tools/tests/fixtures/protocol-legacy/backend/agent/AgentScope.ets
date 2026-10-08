// SPDX-License-Identifier: AGPL-3.0-or-later

import type { AgentImageCandidate } from '../../model/agent/AgentTypes';
import { AgentRetrieval } from '../../model/agent/AgentRetrieval';

export class AgentScopeError extends Error {
  readonly code: string;

  constructor(code: string) {
    super(code);
    this.code = code;
  }
}

/** 一轮会话可引用的稳定 ID 集合；模型不能凭空构造卡库对象 ID。 */
export class AgentScope {
  readonly retrieval: AgentRetrieval = new AgentRetrieval();

  /** 每轮只刷新操作上下文，保留会话中已发现的只读对象和分页进度。 */
  beginTurn(): void {
    this.cardIds.clear(); this.noteIds.clear(); this.deckIds.clear(); this.notetypeIds.clear();
    this.requireYearCloze = false;
  }

  restoreReadableIds(cardIds: number[], noteIds: number[], deckIds: number[], notetypeIds: number[]): void {
    this.registerReadableCardIds(cardIds); this.registerReadableNoteIds(noteIds);
    this.registerReadableDeckIds(deckIds); this.registerReadableNotetypeIds(notetypeIds);
  }

  readableIds(): number[][] {
    return [Array.from(this.readableCardIds), Array.from(this.readableNoteIds),
      Array.from(this.readableDeckIds), Array.from(this.readableNotetypeIds)];
  }
  private readonly readableCardIds: Set<number> = new Set<number>();
  private readonly readableNoteIds: Set<number> = new Set<number>();
  private readonly readableDeckIds: Set<number> = new Set<number>();
  private readonly readableNotetypeIds: Set<number> = new Set<number>();
  private readonly cardIds: Set<number> = new Set<number>();
  private readonly noteIds: Set<number> = new Set<number>();
  private readonly deckIds: Set<number> = new Set<number>();
  private readonly notetypeIds: Set<number> = new Set<number>();
  private readonly imageCandidates: Map<string, AgentImageCandidate> =
    new Map<string, AgentImageCandidate>();
  private readonly draftIds: Set<string> = new Set<string>();
  private batchLimit: number = 100;
  private createDeckId: number = 0;
  private createNotetypeId: number = 0;
  private createDraftSequence: number = 0;
  private requireYearCloze: boolean = false;
  private cardSearchPrefix: string = '';

  /** 写入授权同时包含读取授权；只读搜索结果必须使用 registerReadable*，不能自动提升写权限。 */
  registerCardIds(ids: number[]): void {
    this.registerIds(this.cardIds, ids);
    this.registerIds(this.readableCardIds, ids);
  }
  registerNoteIds(ids: number[]): void {
    this.registerIds(this.noteIds, ids);
    this.registerIds(this.readableNoteIds, ids);
  }
  registerDeckIds(ids: number[]): void {
    this.registerIds(this.deckIds, ids);
    this.registerIds(this.readableDeckIds, ids);
  }
  registerNotetypeIds(ids: number[]): void {
    this.registerIds(this.notetypeIds, ids);
    this.registerIds(this.readableNotetypeIds, ids);
  }

  registerReadableCardIds(ids: number[]): void { this.registerIds(this.readableCardIds, ids); }
  registerReadableNoteIds(ids: number[]): void { this.registerIds(this.readableNoteIds, ids); }
  registerReadableDeckIds(ids: number[]): void { this.registerIds(this.readableDeckIds, ids); }
  registerReadableNotetypeIds(ids: number[]): void { this.registerIds(this.readableNotetypeIds, ids); }

  registerImageCandidate(candidate: AgentImageCandidate): void {
    if (candidate.candidateId.trim().length === 0) {
      throw new AgentScopeError('invalid_image_candidate');
    }
    this.imageCandidates.set(candidate.candidateId, {
      candidateId: candidate.candidateId,
      title: candidate.title,
      thumbnailUrl: candidate.thumbnailUrl,
      downloadUrl: candidate.downloadUrl,
      sourceUrl: candidate.sourceUrl,
      mime: candidate.mime,
      license: candidate.license,
      credit: candidate.credit
    });
  }

  getImageCandidate(candidateId: string): AgentImageCandidate {
    const candidate: AgentImageCandidate | undefined = this.imageCandidates.get(candidateId);
    if (candidate === undefined) {
      throw new AgentScopeError('image_candidate_out_of_scope');
    }
    return {
      candidateId: candidate.candidateId,
      title: candidate.title,
      thumbnailUrl: candidate.thumbnailUrl,
      downloadUrl: candidate.downloadUrl,
      sourceUrl: candidate.sourceUrl,
      mime: candidate.mime,
      license: candidate.license,
      credit: candidate.credit
    };
  }

  assertCardIdsInScope(ids: number[]): void { this.assertIds(this.cardIds, ids); }
  assertNoteIdsInScope(ids: number[]): void { this.assertIds(this.noteIds, ids); }
  assertDeckIdsInScope(ids: number[]): void { this.assertIds(this.deckIds, ids); }
  assertNotetypeIdsInScope(ids: number[]): void { this.assertIds(this.notetypeIds, ids); }

  assertReadableCardIds(ids: number[]): void { this.assertIds(this.readableCardIds, ids); }
  assertReadableNoteIds(ids: number[]): void { this.assertIds(this.readableNoteIds, ids); }
  assertReadableDeckIds(ids: number[]): void { this.assertIds(this.readableDeckIds, ids); }
  assertReadableNotetypeIds(ids: number[]): void { this.assertIds(this.readableNotetypeIds, ids); }

  configureBatchLimit(value: number): void {
    if (!Number.isFinite(value) || value <= 0) { this.batchLimit = 100; return; }
    this.batchLimit = Math.min(1000, Math.max(1, Math.floor(value)));
  }

  assertBatchCount(count: number): void {
    if (!Number.isSafeInteger(count) || count < 0 || count > this.batchLimit) {
      throw new AgentScopeError('tool_batch_too_large');
    }
  }

  configureCreateTarget(deckId: number, notetypeId: number): void {
    this.createDeckId = deckId;
    this.createNotetypeId = notetypeId;
  }

  currentCreateTarget(): number[] { return [this.createDeckId, this.createNotetypeId]; }

  createTargetDeckId(): number {
    this.assertConfiguredCreateTarget();
    return this.createDeckId;
  }

  createTargetNotetypeId(): number {
    this.assertConfiguredCreateTarget();
    return this.createNotetypeId;
  }

  nextCreateDraftId(): string {
    this.assertConfiguredCreateTarget();
    this.createDraftSequence += 1;
    return `create-${Date.now()}-${this.createDraftSequence}`;
  }

  configureCreateConstraints(requireYearCloze: boolean): void {
    this.requireYearCloze = requireYearCloze;
  }

  createRequiresYearCloze(): boolean { return this.requireYearCloze; }

  configureCardSearchPrefix(value: string): void {
    this.cardSearchPrefix = value.trim();
  }

  scopedCardSearchQuery(query: string): string {
    const requested: string = query.trim();
    if (this.cardSearchPrefix.length === 0) { return requested; }
    if (requested.length === 0) { return this.cardSearchPrefix; }
    return `${this.cardSearchPrefix} (${requested})`;
  }

  assertCreateTarget(deckId: number, notetypeId: number): void {
    if (this.createDeckId <= 0 || this.createNotetypeId <= 0 ||
      deckId !== this.createDeckId || notetypeId !== this.createNotetypeId) {
      throw new AgentScopeError('create_target_out_of_scope');
    }
  }

  registerDraftId(id: string): boolean {
    if (id.length === 0 || this.draftIds.has(id)) {
      return false;
    }
    this.draftIds.add(id);
    return true;
  }

  reset(): void {
    this.retrieval.clear();
    this.readableCardIds.clear();
    this.readableNoteIds.clear();
    this.readableDeckIds.clear();
    this.readableNotetypeIds.clear();
    this.cardIds.clear();
    this.noteIds.clear();
    this.deckIds.clear();
    this.notetypeIds.clear();
    this.imageCandidates.clear();
    this.draftIds.clear();
    this.createDeckId = 0;
    this.createNotetypeId = 0;
    this.createDraftSequence = 0;
    this.requireYearCloze = false;
    this.cardSearchPrefix = '';
  }

  private registerIds(target: Set<number>, ids: number[]): void {
    for (const id of ids) {
      if (!Number.isSafeInteger(id) || id <= 0) {
        throw new AgentScopeError('invalid_stable_id');
      }
      target.add(id);
    }
  }

  private assertConfiguredCreateTarget(): void {
    if (this.createDeckId <= 0 || this.createNotetypeId <= 0) {
      throw new AgentScopeError('create_target_out_of_scope');
    }
  }

  private assertIds(target: Set<number>, ids: number[]): void {
    for (const id of ids) {
      if (!target.has(id)) {
        throw new AgentScopeError('id_out_of_scope');
      }
    }
  }
}
