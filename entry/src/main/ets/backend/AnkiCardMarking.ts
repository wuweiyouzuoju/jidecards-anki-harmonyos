// SPDX-License-Identifier: AGPL-3.0-or-later
import { 卡片服务 } from './卡片服务';
import { 笔记服务 } from './笔记服务';
import { 配置服务 } from './配置服务';
import type { Card } from '../proto/messages/CardsMessages';
import type { EditableNote } from '../proto/messages/NoteMessages';
import type { CardMarkingBackend } from '../model/CardMarking';
import type { FlagLabels } from '../model/CardMarking';
interface MarkingConfig { flagLabels?: FlagLabels; }

/** 标记复用 Core 数据和撤销，调用方拥有集合占用及界面生命周期。 */
export class AnkiCardMarking implements CardMarkingBackend {
  private cards: 卡片服务 = new 卡片服务();
  private notes: 笔记服务 = new 笔记服务();
  private config: 配置服务 = new 配置服务();
  card(id: number): Promise<Card> { return this.cards.获取卡片(id); }
  note(id: number): Promise<EditableNote> { return this.notes.获取笔记(id); }
  async updateNotes(notes: EditableNote[]): Promise<void> { await this.notes.更新笔记(notes, false); }
  async setFlag(ids: number[], flag: number): Promise<void> { await this.cards.设置标志(ids, flag); }
  async labels(): Promise<string> {
    const config: MarkingConfig = JSON.parse(await this.config.获取全部配置()) as MarkingConfig;
    return config.flagLabels === undefined ? '' : JSON.stringify(config.flagLabels);
  }
  async saveLabels(json: string): Promise<void> {
    await this.config.设置配置JSON({ key: 'flagLabels', valueJson: json, undoable: true });
  }
}
