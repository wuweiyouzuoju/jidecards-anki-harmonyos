// SPDX-License-Identifier: AGPL-3.0-or-later
import { BrowserSearchBackend } from '../model/BrowserSearchSession';
import { 后端会话 } from './后端会话';
import { 搜索服务 } from './搜索服务';
import { 配置服务 } from './配置服务';
import { ConfigKeyBool } from '../proto/messages/ConfigMessages';
import type { BrowserColumns, BrowserRow, SearchNode, SearchRequest } from '../proto/messages/SearchMessages';

export class AnkiBrowserSearch implements BrowserSearchBackend {
  private readonly searchService: 搜索服务 = new 搜索服务();
  private readonly config: 配置服务 = new 配置服务();
  async open(filesDir: string): Promise<void> { await 后端会话.获取实例().确保已打开(filesDir); }
  async setNotesMode(notes: boolean): Promise<void> {
    await this.config.设置配置布尔({ key: ConfigKeyBool.BROWSER_TABLE_SHOW_NOTES_MODE, value: notes, undoable: false });
  }
  columns(): Promise<BrowserColumns> { return this.searchService.全部浏览器列(); }
  async activateColumns(keys: string[]): Promise<void> { await this.searchService.设置激活浏览器列(keys); }
  buildSearch(node: SearchNode): Promise<string> { return this.searchService.构建搜索串(node); }
  search(request: SearchRequest, notes: boolean): Promise<number[]> {
    return notes ? this.searchService.搜索笔记(request) : this.searchService.搜索卡片(request);
  }
  row(id: number): Promise<BrowserRow> { return this.searchService.浏览器行按ID(id); }
}
