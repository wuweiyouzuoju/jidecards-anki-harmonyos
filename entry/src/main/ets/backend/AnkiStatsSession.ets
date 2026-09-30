// SPDX-License-Identifier: AGPL-3.0-or-later
import { hilog } from '@kit.PerformanceAnalysisKit';
import { StatsBackend, StatsRequest } from '../model/StatsSession';
import { GraphPreferences, GraphsView } from '../proto/messages/StatsMessages';
import { DeckTreeNode } from '../proto/messages/DeckMessages';
import { syncActivity } from '../model/SyncSettings';
import { 后端会话 } from './后端会话';
import { 统计服务 } from './统计服务';
import { 牌组服务 } from './牌组服务';
import { createStatsWidget, publishStatsWidget } from './StatsWidgetPublisher';

export class AnkiStatsSession implements StatsBackend {
  private filesDir: string;
  private stats: 统计服务 = new 统计服务();
  private decks: 牌组服务 = new 牌组服务();
  constructor(filesDir: string) { this.filesDir = filesDir; }
  waitForCollection(): Promise<void> { return syncActivity.waitForCollection(); }
  async graphs(request: StatsRequest, current: () => boolean): Promise<GraphsView> {
    await 后端会话.获取实例().确保已打开(this.filesDir);
    if (!current()) throw new Error('Statistics request expired');
    return this.stats.获取图表统计(request.days, request.search);
  }
  preferences(): Promise<GraphPreferences> { return this.stats.获取图表偏好(); }
  savePreferences(value: GraphPreferences): Promise<void> { return this.stats.设置图表偏好(value); }
  async publishWidget(graphs: GraphsView, hours: number, separate: boolean, current: () => boolean): Promise<void> {
    let tree: DeckTreeNode | null = null;
    await syncActivity.waitForCollection();
    if (!current()) return;
    try { tree = await this.decks.获取牌组树(); } catch (error) {}
    if (!current()) return;
    try { await publishStatsWidget(createStatsWidget(graphs, tree, hours, separate)); }
    catch (error) { hilog.error(0xFFFE, '统计页', `保存卡片数据失败 ${error}`); }
  }
}
