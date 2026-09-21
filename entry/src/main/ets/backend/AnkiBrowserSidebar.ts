// SPDX-License-Identifier: AGPL-3.0-or-later
import { 牌组服务 } from './牌组服务';
import { 标签服务 } from './标签服务';
import { 配置服务 } from './配置服务';
import type { BrowserSidebarBackend } from '../model/BrowserSidebar';
import type { DeckTreeNode } from '../proto/messages/DeckMessages';
import type { TagTreeNode } from '../proto/messages/TagsMessages';
import { ConfigKeyBool } from '../proto/messages/ConfigMessages';
export class AnkiBrowserSidebar implements BrowserSidebarBackend {
  private readonly deckService: 牌组服务 = new 牌组服务();
  private readonly tagService: 标签服务 = new 标签服务();
  private readonly config: 配置服务 = new 配置服务();
  decks(): Promise<DeckTreeNode> { return this.deckService.获取牌组树(); }
  tags(): Promise<TagTreeNode> { return this.tagService.标签树(); }
  savedSearches(): Promise<string> { return this.config.获取配置JSON('savedSearches'); }
  collapsed(key: ConfigKeyBool): Promise<boolean> { return this.config.获取配置布尔(key); }
}
