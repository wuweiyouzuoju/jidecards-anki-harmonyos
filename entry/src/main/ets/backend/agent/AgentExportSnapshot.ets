// SPDX-License-Identifier: AGPL-3.0-or-later
import { 笔记服务 } from '../笔记服务';
import { 卡片服务 } from '../卡片服务';

/** 卡片子集还依赖笔记字段；确认期间修改内容同样会使旧导出提案失效。 */
export async function readAgentExportSnapshot(id: number, mode: string, notes: 笔记服务, cards: 卡片服务): Promise<string> {
  if (mode === 'notes') return JSON.stringify(await notes.获取笔记(id));
  const card = await cards.获取卡片(id);
  return JSON.stringify({ card: card, note: await notes.获取笔记(card.noteId) });
}
