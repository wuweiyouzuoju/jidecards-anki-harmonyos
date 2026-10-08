// SPDX-License-Identifier: AGPL-3.0-or-later
import { CoreRpc } from '../proto/generated/CoreRpc';
import { 后端会话 } from './后端会话';
import { decodeJsonResponse } from '../proto/messages/ConfigMessages';
import { 牌组配置服务 } from './牌组配置服务';
import { encodeCardId } from '../proto/messages/CardsMessages';
import type { DeckConfig, DeckConfigWithUseCount } from '../proto/messages/DeckConfigMessages';
import type { DeckConfigRequestOptions } from '../model/DeckConfigSave';
import { fsrsPresetIdSearch } from '../model/FsrsOptions';
import type { ComputeFsrsParamsInput, ComputeFsrsParamsOutput, SimulateFsrsInput, FsrsWorkloadOutput } from '../proto/messages/FsrsMessages';
import { encodeComputeFsrsParams, decodeComputeFsrsParams, encodeSimulateFsrs, decodeFsrsWorkload } from '../proto/messages/FsrsMessages';
import { encodeEvaluateFsrs, decodeEvaluateFsrs, decodeFsrsMemory, encodeFsrsHistoryCount, decodeFsrsHistoryCount, decodeFsrsDaily } from '../proto/messages/FsrsMessages';
import type { EvaluateFsrsInput, EvaluateFsrsOutput, FsrsMemoryOutput, FsrsHistoryCount, FsrsDailyOutput } from '../proto/messages/FsrsMessages';
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
        const selected: DeckConfigWithUseCount | undefined = view.allConfigs.find((entry: DeckConfigWithUseCount): boolean => entry.config.id === view.currentDeck?.configId);
        if (selected === undefined || selected.config.config === null)
            throw new Error('fsrs_deck_config_unavailable');
        return { deckId: deckId, config: selected.config,
            options: { limits: view.currentDeck?.limits ?? null, newCardsIgnoreReviewLimit: view.newCardsIgnoreReviewLimit, fsrs: view.fsrs,
                applyAllParentLimits: view.applyAllParentLimits, fsrsHealthCheck: view.fsrsHealthCheck, fsrsReschedule: false },
            search: await this.presetSearch(selected.config.id) };
    }
    async evaluate(input: EvaluateFsrsInput): Promise<EvaluateFsrsOutput> {
        return decodeEvaluateFsrs(await new CoreRpc(后端会话.获取实例()).Scheduler_evaluate_params_legacy(encodeEvaluateFsrs(input)));
    }
    async memoryState(cardId: number): Promise<FsrsMemoryOutput> {
        return decodeFsrsMemory(await new CoreRpc(后端会话.获取实例()).Scheduler_compute_memory_state(encodeCardId(cardId)));
    }
    async historyCount(date: string, search: string): Promise<FsrsHistoryCount> {
        return decodeFsrsHistoryCount(await new CoreRpc(后端会话.获取实例()).DeckConfig_get_ignored_before_count(encodeFsrsHistoryCount(date, search)));
    }
    async daily(input: SimulateFsrsInput): Promise<FsrsDailyOutput> {
        return decodeFsrsDaily(await new CoreRpc(后端会话.获取实例()).Scheduler_simulate_fsrs_review(encodeSimulateFsrs(input)), input.daysToSimulate);
    }
    async presetSearch(id: number): Promise<string> {
        const bytes = await new CoreRpc(后端会话.获取实例()).Decks_get_all_decks_legacy(new Uint8Array(0));
        return fsrsPresetIdSearch(id, decodeJsonResponse(bytes));
    }
    async optimize(input: ComputeFsrsParamsInput): Promise<ComputeFsrsParamsOutput> {
        return decodeComputeFsrsParams(await new CoreRpc(后端会话.获取实例()).Scheduler_compute_fsrs_params(encodeComputeFsrsParams(input)));
    }
    async workload(input: SimulateFsrsInput): Promise<FsrsWorkloadOutput> {
        return decodeFsrsWorkload(await new CoreRpc(后端会话.获取实例()).Scheduler_simulate_fsrs_workload(encodeSimulateFsrs(input)));
    }
}
