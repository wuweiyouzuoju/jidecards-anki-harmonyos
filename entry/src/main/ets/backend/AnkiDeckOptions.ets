// SPDX-License-Identifier: AGPL-3.0-or-later
import { DeckOptionsBackend } from '../model/home/DeckOptionsSession';
import { DeckConfigsForUpdateView, UpdateDeckConfigsInput } from '../proto/messages/DeckConfigMessages';
import { 牌组配置服务 } from './牌组配置服务';
import { notifyFsrsStateChanged } from '../model/FSRS控制器';
import { FsrsService } from './FsrsService';
import { ComputeFsrsParamsInput, ComputeFsrsParamsOutput, SimulateFsrsInput,
  FsrsWorkloadOutput, EvaluateFsrsInput, EvaluateFsrsOutput, FsrsHistoryCount } from '../proto/messages/FsrsMessages';

export class AnkiDeckOptions implements DeckOptionsBackend {
  private service: 牌组配置服务 = new 牌组配置服务();
  private fsrs: FsrsService = new FsrsService();
  load(deckId: number): Promise<DeckConfigsForUpdateView> { return this.service.获取牌组配置编辑视图(deckId); }
  save(request: UpdateDeckConfigsInput): Promise<void> { return this.service.更新牌组配置(request); }
  optimize(input: ComputeFsrsParamsInput): Promise<ComputeFsrsParamsOutput> { return this.fsrs.optimize(input); }
  workload(input: SimulateFsrsInput): Promise<FsrsWorkloadOutput> { return this.fsrs.workload(input); }
  presetSearch(id: number): Promise<string> { return this.fsrs.presetSearch(id); }
  evaluate(input: EvaluateFsrsInput): Promise<EvaluateFsrsOutput> { return this.fsrs.evaluate(input); }
  historyCount(date: string, search: string): Promise<FsrsHistoryCount> { return this.fsrs.historyCount(date, search); }
  committed(): void {
    notifyFsrsStateChanged();
    AppStorage.setOrCreate<number>('需要刷新主页', Date.now());
  }
}
