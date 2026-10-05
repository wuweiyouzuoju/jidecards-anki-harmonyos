// SPDX-License-Identifier: AGPL-3.0-or-later
import { 牌组服务 } from './牌组服务';
import { 标签服务 } from './标签服务';
import { 配置服务 } from './配置服务';
import type { BrowserSidebarBackend } from '../model/BrowserSidebar';
import type { DeckTreeNode } from '../proto/messages/DeckMessages';
import type { TagTreeNode } from '../proto/messages/TagsMessages';
import { ConfigKeyBool } from '../proto/messages/ConfigMessages';

interface SavedSearchConfig { savedFilters?: object; }

export class AnkiBrowserSidebar implements BrowserSidebarBackend {
  private readonly deckService: 牌组服务 = new 牌组服务();
  private readonly tagService: 标签服务 = new 标签服务();
  private readonly config: 配置服务 = new 配置服务();
  decks(): Promise<DeckTreeNode> { return this.deckService.获取牌组树(); }
  tags(): Promise<TagTreeNode> { return this.tagService.标签树(); }
  async savedSearches(): Promise<string> {
    // 对齐 AnkiDroid：缺失键表示空列表，真实读取失败仍上抛。
    const config: SavedSearchConfig = JSON.parse(await this.config.获取全部配置()) as SavedSearchConfig;
    return config.savedFilters === undefined ? '{}' : JSON.stringify(config.savedFilters);
  }
  async saveSavedSearches(json: string): Promise<void> {
    await this.config.设置配置JSON({ key: 'savedFilters', valueJson: json, undoable: false });
  }
  collapsed(key: ConfigKeyBool): Promise<boolean> { return this.config.获取配置布尔(key); }
}
