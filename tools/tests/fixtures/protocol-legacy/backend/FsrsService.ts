// SPDX-License-Identifier: AGPL-3.0-or-later
import { 后端会话 } from './后端会话';
import { 服务号, 调度器方法, 牌组方法, 牌组配置方法 } from './服务索引';
import { decodeJsonResponse } from '../proto/messages/ConfigMessages';
import { 牌组配置服务 } from './牌组配置服务';
import { encodeCardId } from '../proto/messages/CardsMessages';
import type { DeckConfig, DeckConfigWithUseCount } from '../proto/messages/DeckConfigMessages';
import type { DeckConfigRequestOptions } from '../model/DeckConfigSave';
import { fsrsPresetIdSearch } from '../model/FsrsOptions';
import type { ComputeFsrsParamsInput, ComputeFsrsParamsOutput, SimulateFsrsInput,
  FsrsWorkloadOutput } from '../proto/messages/FsrsMessages';
import { encodeComputeFsrsParams, decodeComputeFsrsParams, encodeSimulateFsrs,
  decodeFsrsWorkload } from '../proto/messages/FsrsMessages';
import { encodeEvaluateFsrs, decodeEvaluateFsrs, decodeFsrsMemory, encodeFsrsHistoryCount,
  decodeFsrsHistoryCount, decodeFsrsDaily } from '../proto/messages/FsrsMessages';
import type { EvaluateFsrsInput, EvaluateFsrsOutput, FsrsMemoryOutput, FsrsHistoryCount,
  FsrsDailyOutput } from '../proto/messages/FsrsMessages';

export interface FsrsDeckContext {
  deckId: number;
  config: DeckConfig;
  options: DeckConfigRequestOptions;
  search: string;
}

export function fsrsContextSnapshot(context: FsrsDeckContext): string {
  return JSON.stringify(context);
}

export class FsrsService {
  async deckContext(deckId: number): Promise<FsrsDeckContext> {
    const view = await new 牌组配置服务().获取牌组配置编辑视图(deckId);
    const selected: DeckConfigWithUseCount | undefined = view.allConfigs.find(
      (entry: DeckConfigWithUseCount): boolean => entry.config.id === view.currentDeck?.configId);
    if (selected === undefined || selected.config.config === null) throw new Error('fsrs_deck_config_unavailable');
    return { deckId: deckId, config: selected.config,
      options: { limits: view.currentDeck?.limits ?? null, newCardsIgnoreReviewLimit: view.newCardsIgnoreReviewLimit, fsrs: view.fsrs,
        applyAllParentLimits: view.applyAllParentLimits, fsrsHealthCheck: view.fsrsHealthCheck, fsrsReschedule: false },
      search: await this.presetSearch(selected.config.id) };
  }

  async evaluate(input: EvaluateFsrsInput): Promise<EvaluateFsrsOutput> {
    return decodeEvaluateFsrs(await 后端会话.获取实例().调用(服务号.后端调度器,
      调度器方法.evaluateParamsLegacy, encodeEvaluateFsrs(input)));
  }

  async memoryState(cardId: number): Promise<FsrsMemoryOutput> {
    return decodeFsrsMemory(await 后端会话.获取实例().调用(服务号.后端调度器,
      调度器方法.computeMemoryState, encodeCardId(cardId)));
  }

  async historyCount(date: string, search: string): Promise<FsrsHistoryCount> {
    return decodeFsrsHistoryCount(await 后端会话.获取实例().调用(服务号.后端牌组配置,
      牌组配置方法.getIgnoredBeforeCount, encodeFsrsHistoryCount(date, search)));
  }

  async daily(input: SimulateFsrsInput): Promise<FsrsDailyOutput> {
    return decodeFsrsDaily(await 后端会话.获取实例().调用(服务号.后端调度器,
      调度器方法.simulateFsrsReview, encodeSimulateFsrs(input)), input.daysToSimulate);
  }
  async presetSearch(id: number): Promise<string> {
    const bytes = await 后端会话.获取实例().调用(服务号.后端牌组, 牌组方法.getAllDecksLegacy, new Uint8Array(0));
    return fsrsPresetIdSearch(id, decodeJsonResponse(bytes));
  }

  async optimize(input: ComputeFsrsParamsInput): Promise<ComputeFsrsParamsOutput> {
    return decodeComputeFsrsParams(await 后端会话.获取实例().调用(服务号.后端调度器,
      调度器方法.computeFsrsParams, encodeComputeFsrsParams(input)));
  }

  async workload(input: SimulateFsrsInput): Promise<FsrsWorkloadOutput> {
    return decodeFsrsWorkload(await 后端会话.获取实例().调用(服务号.后端调度器,
      调度器方法.simulateFsrsWorkload, encodeSimulateFsrs(input)));
  }
}
