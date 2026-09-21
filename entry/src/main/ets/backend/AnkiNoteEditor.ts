// SPDX-License-Identifier: AGPL-3.0-or-later
import { 卡片服务 } from './卡片服务';
import { 笔记服务 } from './笔记服务';
import { 笔记类型服务 } from './笔记类型服务';
import type { NoteEditorBackend, NoteEditorCard, NoteEditorNotetype } from '../model/NoteEditorLoader';
import type { EditableNote } from '../proto/messages/NoteMessages';
export class AnkiNoteEditor implements NoteEditorBackend {
  private readonly cards: 卡片服务 = new 卡片服务();
  private readonly notes: 笔记服务 = new 笔记服务();
  private readonly notetypes: 笔记类型服务 = new 笔记类型服务();
  card(id: number): Promise<NoteEditorCard> { return this.cards.获取卡片(id); }
  note(id: number): Promise<EditableNote> { return this.notes.获取笔记(id); }
  notetype(id: number): Promise<NoteEditorNotetype> { return this.notetypes.获取笔记类型(id); }
}
