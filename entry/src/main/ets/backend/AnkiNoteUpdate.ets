// SPDX-License-Identifier: AGPL-3.0-or-later
import { 笔记服务 } from './笔记服务';
import { importNoteVisual } from './NoteVisualImport';
import { importNoteAudio } from './NoteAudioImport';
import { prepareNoteAudioFields, NoteFieldAudio } from '../model/NoteAudioDraft';
import { discardNoteRecordings } from '../utils/NoteAudioRecorder';
import { prepareNoteImageFields, NoteFieldImage } from '../model/NoteImageDraft';
import { EditableNote } from '../proto/messages/NoteMessages';
import { assertNoteMediaResolved } from '../model/NoteMediaParts';
import { assertNoteEditorUnchanged } from '../model/NoteEditorConflict';

export class AnkiNoteUpdate {
  private notes: 笔记服务 = new 笔记服务();
  /** 调用方先持有集合操作保护；失败保留已导入文件名，重试不会重复导入。 */
  async save(note: EditableNote, images: NoteFieldImage[], audios: NoteFieldAudio[] = [], before?: EditableNote): Promise<void> {
    if (before !== undefined) assertNoteEditorUnchanged(before, await this.notes.获取笔记(note.id));
    note.fields = await prepareNoteImageFields(note.fields, images, importNoteVisual);
    if (audios.length > 0) note.fields = await prepareNoteAudioFields(note.fields, audios, importNoteAudio);
    assertNoteMediaResolved(note.fields);
    // 媒体导入有异步等待，落盘前再次核对，防止等待期间其它入口修改同一笔记。
    if (before !== undefined && (images.length > 0 || audios.length > 0))
      assertNoteEditorUnchanged(before, await this.notes.获取笔记(note.id));
    await this.notes.更新笔记([note], false);
    if (audios.length > 0) await discardNoteRecordings(audios);
  }
  committed(): void {
    AppStorage.setOrCreate<number>('cardContentChangedTick', Date.now());
    AppStorage.setOrCreate<number>('需要刷新主页', Date.now());
  }
}
