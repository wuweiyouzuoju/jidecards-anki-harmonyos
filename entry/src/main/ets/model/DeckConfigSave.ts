// SPDX-License-Identifier: AGPL-3.0-or-later
import type { DeckConfig, DeckConfigsForUpdateView, DeckLimits, UpdateDeckConfigsInput } from '../proto/messages/DeckConfigMessages';
import { decodeDeckConfig, encodeDeckConfig, encodeUpdateDeckConfigsRequest, decodeUpdateDeckConfigsRequest, UPDATE_DECK_CONFIGS_MODE_NORMAL } from '../proto/messages/DeckConfigMessages';

/** 复制完整配置，避免校验或保存失败污染原始预设及重试依据。 */
export function copyDeckConfig(config: DeckConfig): DeckConfig {
  return decodeDeckConfig(encodeDeckConfig(config));
}

/** 返回使用当前预设的牌组数量，供保存范围提示与分离判断共用。 */
export function deckConfigUseCount(view: DeckConfigsForUpdateView, configId: number): number {
  for (const entry of view.allConfigs) {
    if (entry.config.id === configId) {
      return entry.useCount;
    }
  }
  return 0;
}

/**
 * 默认按牌组隔离预设修改；显式选择共享时才更新原预设。
 * Invariants: 原配置不变；无修改不分离；ID 1 留给未来新牌组；ID 0 由后端原子创建并绑定。
 */
export function prepareDeckConfigForSave(view: DeckConfigsForUpdateView, original: DeckConfig,
  draft: DeckConfig, applyToSharedDecks: boolean): DeckConfig {
  const before: Uint8Array = encodeDeckConfig(original);
  const after: Uint8Array = encodeDeckConfig(draft);
  const changed: boolean = before.length !== after.length || before.some((value: number, index: number): boolean => value !== after[index]);
  const shared: boolean = deckConfigUseCount(view, original.id) > 1;
  if (changed && !applyToSharedDecks && (original.id === 1 || shared)) {
    draft.id = 0;
    draft.name = view.currentDeck === null ? original.name : view.currentDeck.name;
    draft.mtimeSecs = 0;
    draft.usn = 0;
  }
  return draft;
}

export interface DeckConfigRequestOptions {
  limits: DeckLimits | null;
  newCardsIgnoreReviewLimit: boolean;
  fsrs: boolean;
  applyAllParentLimits: boolean;
  fsrsReschedule: boolean;
  fsrsHealthCheck: boolean;
}

/** Core 只按今日数值是否存在保存覆盖；Active 是读取状态，不是停用指令。 */
function limitsForSave(limits: DeckLimits | null): DeckLimits | null {
  if (limits === null) return null;
  return {
    review: limits.review, new: limits.new, desiredRetention: limits.desiredRetention,
    reviewToday: limits.reviewTodayActive ? limits.reviewToday : null,
    newToday: limits.newTodayActive ? limits.newToday : null,
    reviewTodayActive: limits.reviewTodayActive && limits.reviewToday !== null,
    newTodayActive: limits.newTodayActive && limits.newToday !== null
  };
}
/** 生成独立请求；共享预设分离与调度器开关由同一个领域边界决定。 */
export function buildDeckConfigRequest(targetDeckId: number, view: DeckConfigsForUpdateView,
  original: DeckConfig, draft: DeckConfig, applyToSharedDecks: boolean,
  edited: DeckConfigRequestOptions): UpdateDeckConfigsInput {
  const request: UpdateDeckConfigsInput = {
    targetDeckId: targetDeckId,
    configs: [prepareDeckConfigForSave(view, original, copyDeckConfig(draft), applyToSharedDecks)],
    removedConfigIds: [], mode: UPDATE_DECK_CONFIGS_MODE_NORMAL, cardStateCustomizer: view.cardStateCustomizer,
    limits: limitsForSave(edited.limits), newCardsIgnoreReviewLimit: edited.newCardsIgnoreReviewLimit,
    fsrs: edited.fsrs, applyAllParentLimits: edited.applyAllParentLimits,
    fsrsReschedule: edited.fsrsReschedule, fsrsHealthCheck: edited.fsrsHealthCheck
  };
  return decodeUpdateDeckConfigsRequest(encodeUpdateDeckConfigsRequest(request));
}
