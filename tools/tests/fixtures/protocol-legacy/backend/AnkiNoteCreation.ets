// SPDX-License-Identifier: AGPL-3.0-or-later
import { 后端会话 } from './后端会话';
import { 笔记服务, 笔记字段校验错误 } from './笔记服务';
import { 笔记类型服务 } from './笔记类型服务';
import { 搜索服务 } from './搜索服务';
import { NoteDuplicateWarning } from '../model/NoteDuplicateSession';
import { EditableNote } from '../proto/messages/NoteMessages';
import { 图片遮罩服务 } from './图片遮罩服务';
import { importNoteImage } from './NoteImageImport';
import { importNoteAudio } from './NoteAudioImport';
import { discardNoteRecordings } from '../utils/NoteAudioRecorder';
import { NoteCreationBackend, NoteCreationInitial, NoteCreationInput, OcclusionCreationInput } from '../model/NoteCreationSession';
import { NoteTypeCatalog, standardNoteTypes } from '../model/NoteTypeCatalog';
import { prepareNoteImageFields, NoteFieldImage } from '../model/NoteImageDraft';
import { NotetypeNameId, NotetypeView } from '../proto/messages/NotetypeMessages';
import { hilog } from '@kit.PerformanceAnalysisKit';

/** 新增笔记的 Service 与永久媒体边界；已有类型和 Core 建卡协议保持不变。 */
export class AnkiNoteCreation implements NoteCreationBackend {
  private notes: 笔记服务 = new 笔记服务();
  private types: 笔记类型服务 = new 笔记类型服务();
  private occlusion: 图片遮罩服务 = new 图片遮罩服务();

  async initialize(filesDir: string): Promise<NoteCreationInitial> {
    await 后端会话.获取实例().确保已打开(filesDir);
    const defaults = await this.notes.获取添加默认值();
    let names: NotetypeNameId[] = await this.types.获取笔记类型名列表();
    let changed: boolean = false;
    let warning: string = '';
    for (const stock of standardNoteTypes()) {
      if (names.some((item: NotetypeNameId): boolean => stock.names.indexOf(item.name) >= 0)) continue;
      try {
        const json: string = await this.types.获取标准笔记类型JSON(stock.kind);
        await this.types.添加笔记类型旧版(json);
        changed = true;
      } catch (error) { warning = error instanceof Error ? error.message : `${error}`; }
    }
    if (!names.some((item: NotetypeNameId): boolean => NoteTypeCatalog.图片遮盖笔记类型名集合.indexOf(item.name) >= 0)) {
      try { await this.occlusion.添加图片遮罩笔记类型(); changed = true; }
      catch (error) { warning = error instanceof Error ? error.message : `${error}`; }
    }
    if (changed) names = await this.types.获取笔记类型名列表();
    return { types: names, defaultId: defaults.notetypeId, warning: warning };
  }

  loadType(id: number): Promise<NotetypeView> { return this.types.获取编辑笔记类型(id); }
  setFieldSticky(id: number, ord: number, sticky: boolean): Promise<void> {
    return this.types.setFieldSticky(id, ord, sticky);
  }
  /** @throws {Error} 导入失败交由会话展示，保留草稿供重试。 */
  importImage(uri: string): Promise<string> { return importNoteImage(uri); }
  /** @throws {Error} 导入失败交由会话展示。 */
  importAudio(uri: string): Promise<string> { return importNoteAudio(uri); }

  async saveNote(input: NoteCreationInput, allowDuplicate: boolean = false): Promise<void> {
    const note = await this.notes.新建笔记(input.notetypeId);
    note.fields = input.fields;
    note.tags = input.tags;
    await this.addManualNote(note, input.deckId, allowDuplicate);
    try { if ((input.audios ?? []).length > 0) await discardNoteRecordings(input.audios ?? []); }
    catch (error) { hilog.warn(0x0001, 'NoteCreation', 'Saved recording cleanup failed: %{public}s', `${error}`); }
  }

  /** 使用显式目标牌组创建标准 IO 笔记，避免依赖复习页留下的 Core 当前牌组。
   * @throws {Error} 媒体或 Core 保存失败，草稿由会话保留。
   */
  async saveOcclusion(input: OcclusionCreationInput, allowDuplicate: boolean = false): Promise<void> {
    const indexes = await this.occlusion.获取图片遮罩字段(input.notetypeId);
    const note = await this.notes.新建笔记(input.notetypeId);
    note.fields[indexes.遮罩] = input.occlusions;
    note.fields[indexes.标题] = input.header;
    note.fields[indexes.额外] = input.backExtra;
    const image: NoteFieldImage = input.image ?? { id: 0, fieldIndex: indexes.图片, uri: input.uri, filename: '' };
    image.fieldIndex = indexes.图片;
    const images: NoteFieldImage[] = [image];
    note.fields = await prepareNoteImageFields(note.fields, images, (uri: string): Promise<string> => this.importImage(uri));
    note.tags = input.tags;
    await this.addManualNote(note, input.deckId, allowDuplicate);
  }

  private async addManualNote(note: EditableNote, deckId: number, allowDuplicate: boolean): Promise<void> {
    if (allowDuplicate) { await this.notes.添加笔记允许重复(note, deckId); return; }
    try { await this.notes.添加笔记(note, deckId); }
    catch (error) {
      if (!(error instanceof 笔记字段校验错误) || error.messageKey !== 'add_note_duplicate_error') {
        throw error instanceof Error ? error : new Error(`${error}`);
      }
      const search: string = await new 搜索服务().构建搜索串({ kind: 'dupe',
        dupe: { notetypeId: note.notetypeId, firstField: note.fields[0] } });
      throw new NoteDuplicateWarning(search);
    }
  }

  committed(): void { AppStorage.setOrCreate<number>('noteAddedTick', Date.now()); }
  errorMessage(error: Error): string {
    if (error instanceof 笔记字段校验错误) {
      return error.messageKey;
    }
    return error.message;
  }
}
