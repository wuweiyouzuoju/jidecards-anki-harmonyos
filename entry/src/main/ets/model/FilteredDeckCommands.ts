// SPDX-License-Identifier: AGPL-3.0-or-later
import type { 过滤牌组更新, 搜索条件 } from '../proto/messages/DeckMessages';
import { encode过滤牌组更新, decode过滤牌组更新 } from '../proto/messages/DeckMessages';
import { AutoSyncScheduler, autoSyncScheduler } from './AutoSyncScheduler';
import { SyncActivity, syncActivity } from './SyncSettings';

export const FILTERED_DECK_ACTIONS: FilteredDeckMenuAction[] = [
  { id: 'empty_filtered', titleKey: 'filtered_deck_empty' },
  { id: 'rebuild_filtered', titleKey: 'filtered_deck_rebuild' }
];
export interface FilteredDeckMenuAction { id: string; titleKey: string; }
export interface FilteredDeckBackend {
  read(id: number): Promise<过滤牌组更新>;
  save(deck: 过滤牌组更新): Promise<number>;
  empty(id: number): Promise<void>;
  rebuild(id: number): Promise<number>;
  changed(): void;
}
export interface FilteredDeckPatch {
  reschedule?: boolean; searchTerms?: 搜索条件[];
  previewDelay?: number; previewAgainSecs?: number; previewHardSecs?: number; previewGoodSecs?: number;
}
export interface FilteredDeckProposal { deckId: number; before: number[]; changesJson: string; }

export function filteredDeckPatch(deck: 过滤牌组更新, json: string): 过滤牌组更新 {
  const patch: FilteredDeckPatch = JSON.parse(json) as FilteredDeckPatch;
  const allowed: string[] = ['reschedule', 'searchTerms', 'previewDelay', 'previewAgainSecs', 'previewHardSecs', 'previewGoodSecs'];
  if (patch === null || typeof patch !== 'object' || Array.isArray(patch) || Object.keys(patch).length === 0 ||
    Object.keys(patch).some((key: string): boolean => !allowed.includes(key))) throw new Error('invalid_filtered_deck_patch');
  if (patch.reschedule !== undefined && typeof patch.reschedule !== 'boolean') throw new Error('invalid_filtered_deck_patch');
  for (const seconds of [patch.previewDelay, patch.previewAgainSecs, patch.previewHardSecs, patch.previewGoodSecs]) {
    if (seconds !== undefined && (!Number.isInteger(seconds) || seconds < 0 || seconds > 86400)) throw new Error('invalid_filtered_deck_patch');
  }
  if (patch.searchTerms !== undefined && (!Array.isArray(patch.searchTerms) || patch.searchTerms.length < 1 || patch.searchTerms.length > 2 ||
    patch.searchTerms.some((term: 搜索条件): boolean => term === null || typeof term !== 'object' || Array.isArray(term) ||
      Object.keys(term).some((key: string): boolean => !['search', 'limit', 'order'].includes(key)) ||
      typeof term.search !== 'string' || term.search.length > 10000 || !Number.isInteger(term.limit) || term.limit < 1 || term.limit > 100000 ||
      !Number.isInteger(term.order) || term.order < 0 || term.order > 10))) throw new Error('invalid_filtered_deck_patch');
  const out: 过滤牌组更新 = decode过滤牌组更新(encode过滤牌组更新(deck));
  if (patch.reschedule !== undefined) out.config.reschedule = patch.reschedule;
  if (patch.searchTerms !== undefined) out.config.searchTerms = patch.searchTerms.map((term: 搜索条件, index: number): 搜索条件 =>
    ({ search: term.search, limit: term.limit, order: term.order, preserved: out.config.searchTerms[index]?.preserved }));
  if (patch.previewDelay !== undefined) out.config.previewDelay = patch.previewDelay;
  if (patch.previewAgainSecs !== undefined) out.config.previewAgainSecs = patch.previewAgainSecs;
  if (patch.previewHardSecs !== undefined) out.config.previewHardSecs = patch.previewHardSecs;
  if (patch.previewGoodSecs !== undefined) out.config.previewGoodSecs = patch.previewGoodSecs;
  out.allowEmpty = true;
  return out;
}

/** 手动维护和确认后的 JIDE 写入共享串行队列，写入不依赖页面存活。 */
export class FilteredDeckCommands {
  private tail: Promise<void> = Promise.resolve();
  private backend: FilteredDeckBackend;
  private scheduler: AutoSyncScheduler;
  private activity: SyncActivity;
  constructor(backend: FilteredDeckBackend, scheduler: AutoSyncScheduler = autoSyncScheduler, activity: SyncActivity = syncActivity) {
    this.backend = backend; this.scheduler = scheduler; this.activity = activity;
  }
  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const owner: Object = new Object(); this.scheduler.beginOperation(owner);
    const result: Promise<T> = this.tail.then(async (): Promise<T> => {
      try { await this.activity.waitForCollection(); return await operation(); }
      finally { this.scheduler.endOperation(owner); }
    });
    this.tail = result.then((): void => {}, (): void => {}); return result;
  }
  read(id: number): Promise<过滤牌组更新> {
    if (!Number.isSafeInteger(id) || id <= 0) throw new Error('invalid_filtered_deck_id');
    return this.enqueue(async (): Promise<过滤牌组更新> => {
      const deck: 过滤牌组更新 = await this.backend.read(id);
      if (deck.id !== id) throw new Error('filtered_deck_missing');
      return deck;
    });
  }
  async prepare(id: number, changesJson: string): Promise<FilteredDeckProposal> {
    const deck: 过滤牌组更新 = await this.read(id); filteredDeckPatch(deck, changesJson);
    return { deckId: id, before: Array.from(encode过滤牌组更新(deck)), changesJson: changesJson };
  }
  maintain(id: number, action: string): Promise<number> {
    if (!Number.isSafeInteger(id) || id <= 0 || !FILTERED_DECK_ACTIONS.some((item): boolean => item.id === action)) throw new Error('invalid_filtered_deck_action');
    return this.enqueue(async (): Promise<number> => {
      const deck: 过滤牌组更新 = await this.backend.read(id);
      if (deck.id !== id) throw new Error('filtered_deck_missing');
      let count: number = 0;
      if (action === 'empty_filtered') await this.backend.empty(id);
      else count = await this.backend.rebuild(id);
      this.backend.changed(); this.scheduler.request(); return count;
    });
  }
  save(proposal: FilteredDeckProposal): Promise<过滤牌组更新> {
    const accepted: FilteredDeckProposal = JSON.parse(JSON.stringify(proposal)) as FilteredDeckProposal;
    if (!Number.isSafeInteger(accepted.deckId) || accepted.deckId <= 0 || !Array.isArray(accepted.before)) throw new Error('invalid_filtered_deck_proposal');
    filteredDeckPatch(decode过滤牌组更新(new Uint8Array(accepted.before)), accepted.changesJson);
    return this.enqueue(async (): Promise<过滤牌组更新> => {
      const current: 过滤牌组更新 = await this.backend.read(accepted.deckId);
      if (current.id !== accepted.deckId || JSON.stringify(Array.from(encode过滤牌组更新(current))) !== JSON.stringify(accepted.before)) throw new Error('filtered_deck_changed_since_proposal');
      const id: number = await this.backend.save(filteredDeckPatch(current, accepted.changesJson));
      if (id !== accepted.deckId) throw new Error('filtered_deck_identity_changed');
      this.backend.changed(); this.scheduler.request(); return this.backend.read(id);
    });
  }
}
