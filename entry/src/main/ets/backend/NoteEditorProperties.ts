// SPDX-License-Identifier: AGPL-3.0-or-later
import { BrowserOperationController } from '../model/BrowserOperationController';
import { assertNoteEditorUnchanged } from '../model/NoteEditorConflict';
import { 卡片服务 } from './卡片服务';
import { 笔记服务 } from './笔记服务';
import { 笔记类型服务 } from './笔记类型服务';
import { 牌组服务 } from './牌组服务';
import type { EditableNote } from '../proto/messages/NoteMessages';
import type { DeckTreeNode } from '../proto/messages/DeckMessages';
import type { 变更笔记类型请求 } from '../proto/messages/NotetypeMessages';

/** 编辑器属性操作与浏览批量操作共用 Core 服务和集合占用；不提交字段草稿。 */
export class NoteEditorProperties {
  private readonly operations: BrowserOperationController = new BrowserOperationController();
  private readonly notes: 笔记服务 = new 笔记服务();
  decks(): Promise<DeckTreeNode> { return new 牌组服务().获取牌组树(); }
  move(note: EditableNote, deckId: number): Promise<boolean> {
    return this.write(note, async (): Promise<void> => {
      const ids: number[] = await this.notes.获取笔记的卡片(note.id);
      if (ids.length > 0) await new 卡片服务().设置牌组(ids, deckId);
    });
  }
  changeType(note: EditableNote, input: 变更笔记类型请求): Promise<boolean> {
    const frozen: 变更笔记类型请求 = JSON.parse(JSON.stringify(input)) as 变更笔记类型请求;
    frozen.noteIds = [note.id];
    return this.write(note, (): Promise<void> => new 笔记类型服务().变更笔记类型(frozen));
  }
  private async write(note: EditableNote, action: () => Promise<void>): Promise<boolean> {
    const before: EditableNote = JSON.parse(JSON.stringify(note)) as EditableNote;
    const operation = this.operations.begin('notes', [before.id], 0, 0);
    if (operation === null) return false;
    return this.operations.execute(operation, async (): Promise<void> => {
      assertNoteEditorUnchanged(before, await this.notes.获取笔记(before.id));
      await action();
    }, { afterCommit: async (): Promise<void> => {}, failed: (): void => {}, refreshFailed: (): void => {},
      changed: (): void => {
        AppStorage.setOrCreate<number>('cardContentChangedTick', Date.now());
        AppStorage.setOrCreate<number>('需要刷新主页', Date.now());
      } });
  }
  dispose(): void { this.operations.dispose(); }
}
