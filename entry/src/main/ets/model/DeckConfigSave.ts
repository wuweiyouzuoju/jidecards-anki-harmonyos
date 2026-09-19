// SPDX-License-Identifier: AGPL-3.0-or-later
import type { DeckConfig, DeckConfigsForUpdateView } from '../proto/messages/DeckConfigMessages';
import { decodeDeckConfig, encodeDeckConfig } from '../proto/messages/DeckConfigMessages';

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
