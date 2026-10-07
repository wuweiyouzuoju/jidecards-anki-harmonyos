// SPDX-License-Identifier: AGPL-3.0-or-later
import { FilteredDeckCommands } from '../model/FilteredDeckCommands';
import type { FilteredDeckBackend } from '../model/FilteredDeckCommands';
import type { 过滤牌组更新 } from '../proto/messages/DeckMessages';
import { 牌组服务 } from './牌组服务';
import { 调度器服务 } from './调度器服务';

class CoreFilteredDeckBackend implements FilteredDeckBackend {
  private decks: 牌组服务 = new 牌组服务();
  private scheduler: 调度器服务 = new 调度器服务();
  read(id: number): Promise<过滤牌组更新> { return this.decks.获取或创建过滤牌组(id); }
  save(deck: 过滤牌组更新): Promise<number> { return this.decks.添加或更新过滤牌组(deck); }
  empty(id: number): Promise<void> { return this.scheduler.清空过滤牌组(id); }
  rebuild(id: number): Promise<number> { return this.scheduler.重建过滤牌组(id); }
  changed(): void { AppStorage.setOrCreate<number>('需要刷新主页', Date.now()); }
}
export const filteredDeckCommands: FilteredDeckCommands = new FilteredDeckCommands(new CoreFilteredDeckBackend());
