// SPDX-License-Identifier: AGPL-3.0-or-later
import { 后端会话 } from './后端会话';
import { 笔记服务, 笔记字段校验错误 } from './笔记服务';
import { 笔记类型服务 } from './笔记类型服务';
import { 图片遮罩服务 } from './图片遮罩服务';
import { importNoteImage } from './NoteImageImport';
import { NoteCreationBackend, NoteCreationInitial, NoteCreationInput, OcclusionCreationInput } from '../model/NoteCreationSession';
import { NoteTypeCatalog, standardNoteTypes } from '../model/NoteTypeCatalog';
import { prepareNoteImageFields, NoteFieldImage } from '../model/NoteImageDraft';
import { NotetypeNameId, NotetypeView } from '../proto/messages/NotetypeMessages';

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
  /** @throws {Error} 导入失败交由会话展示，保留草稿供重试。 */
  importImage(uri: string): Promise<string> { return importNoteImage(uri); }

  async saveNote(input: NoteCreationInput): Promise<void> {
    const note = await this.notes.新建笔记(input.notetypeId);
    note.fields = input.fields;
    note.tags = input.tags;
    await this.notes.添加笔记(note, input.deckId);
  }

  /** 使用显式目标牌组创建标准 IO 笔记，避免依赖复习页留下的 Core 当前牌组。
   * @throws {Error} 媒体或 Core 保存失败，草稿由会话保留。
   */
  async saveOcclusion(input: OcclusionCreationInput): Promise<void> {
    const indexes = await this.occlusion.获取图片遮罩字段(input.notetypeId);
    const note = await this.notes.新建笔记(input.notetypeId);
    note.fields[indexes.遮罩] = input.occlusions;
    note.fields[indexes.标题] = input.header;
    note.fields[indexes.额外] = input.backExtra;
    const images: NoteFieldImage[] = [{ id: 0, fieldIndex: indexes.图片, uri: input.uri, filename: '' }];
    note.fields = await prepareNoteImageFields(note.fields, images, (uri: string): Promise<string> => this.importImage(uri));
    note.tags = input.tags;
    await this.notes.添加笔记(note, input.deckId);
  }

  committed(): void { AppStorage.setOrCreate<number>('noteAddedTick', Date.now()); }
  errorMessage(error: Error): string {
    if (error instanceof 笔记字段校验错误) {
      return error.messageKey === 'add_note_empty_error' || error.messageKey === 'add_note_duplicate_error' ?
        error.messageKey : 'add_note_cloze_missing';
    }
    return error.message;
  }
}
