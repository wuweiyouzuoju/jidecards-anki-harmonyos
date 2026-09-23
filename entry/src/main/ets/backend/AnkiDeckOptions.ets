// SPDX-License-Identifier: AGPL-3.0-or-later
import { DeckOptionsBackend } from '../model/home/DeckOptionsSession';
import { DeckConfigsForUpdateView, UpdateDeckConfigsInput } from '../proto/messages/DeckConfigMessages';
import { 牌组配置服务 } from './牌组配置服务';
import { notifyFsrsStateChanged } from '../model/FSRS控制器';

export class AnkiDeckOptions implements DeckOptionsBackend {
  private service: 牌组配置服务 = new 牌组配置服务();
  load(deckId: number): Promise<DeckConfigsForUpdateView> { return this.service.获取牌组配置编辑视图(deckId); }
  save(request: UpdateDeckConfigsInput): Promise<void> { return this.service.更新牌组配置(request); }
  committed(): void {
    notifyFsrsStateChanged();
    AppStorage.setOrCreate<number>('需要刷新主页', Date.now());
  }
}
