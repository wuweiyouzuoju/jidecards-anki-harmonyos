// SPDX-License-Identifier: AGPL-3.0-or-later
import { GraphsView } from '../proto/messages/StatsMessages';
import { DeckTreeNode } from '../proto/messages/DeckMessages';
import { 平铺牌组树 } from '../model/牌组层级';
import { 提取卡片数据, 保存卡片数据, 桌面卡片数据 } from '../model/桌面卡片数据存储';

// 全库桌面快照的唯一发布队列；接受后的写入独立完成，防止较慢旧推送覆盖后续推送。
let publication: Promise<void> = Promise.resolve();

/** 调用方在入队前确认请求代次及全库范围，页面不参与卡片存储协议。 */
export function createStatsWidget(graphs: GraphsView, tree: DeckTreeNode | null,
  hours: number, separate: boolean): 桌面卡片数据 {
  let due: number = 0;
  if (tree !== null) for (const child of tree.children) due += child.newCount + child.learnCount + child.reviewCount;
  const count: number = tree === null ? 0 : 平铺牌组树(tree).length;
  const data: 桌面卡片数据 = 提取卡片数据(graphs, due, count, hours, separate);
  return data;
}

export async function publishStatsWidget(data: 桌面卡片数据): Promise<void> {
  const accepted: Promise<void> = publication.then((): Promise<void> => 保存卡片数据(data));
  publication = accepted.catch((): void => {});
  await accepted;
}
