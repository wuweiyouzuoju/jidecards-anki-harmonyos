// SPDX-License-Identifier: AGPL-3.0-or-later
import { common } from '@kit.AbilityKit';
import { fileIo as fs } from '@kit.CoreFileKit';
import { NoteDraftPreviewBackend, NoteDraftPreviewInput, DraftPreviewMedia } from '../model/NoteDraftPreview';
import { prepareNoteImageFields } from '../model/NoteImageDraft';
import { prepareNoteAudioFields } from '../model/NoteAudioDraft';
import { assertNoteMediaResolved } from '../model/NoteMediaParts';
import { readNoteImageData } from './NoteImageImport';
import { 笔记服务 } from './笔记服务';
import { 笔记类型服务 } from './笔记类型服务';
import { 卡片渲染服务 } from './卡片渲染服务';
import { EditableNote } from '../proto/messages/NoteMessages';
import { RenderedCard } from '../proto/messages/CardRenderingMessages';
import { syncActivity } from '../model/SyncSettings';

/** 临时文件只属于此预览；从不导入 Core 媒体库，不更改表单附件或 collection。 */
export class AnkiNoteDraftPreview implements NoteDraftPreviewBackend {
  private notes: 笔记服务 = new 笔记服务();
  private types: 笔记类型服务 = new 笔记类型服务();
  private renderer: 卡片渲染服务 = new 卡片渲染服务();
  private directory: string = '';
  private filenames: string[] = [];
  private token: string = String(Date.now()) + '-' + String(Math.floor(Math.random() * 1000000));
  wait(): Promise<void> { return syncActivity.waitForCollection(); }
  newNote(id: number): Promise<EditableNote> { return this.notes.新建笔记(id); }
  notetypeJson(id: number): Promise<string> { return this.types.获取笔记类型旧版(id); }
  clozeNumbers(note: EditableNote): Promise<number[]> { return this.notes.clozeNumbersInNote(note); }
  clozeFields(id: number): Promise<number[]> { return this.types.获取填空字段序号(id); }
  render(note: EditableNote, ordinal: number, template: string, css: string, sample: boolean): Promise<RenderedCard> {
    return this.renderer.renderUncommittedCard(note, ordinal, template, css, sample);
  }
  /** @throws {Error} 临时目录、完整媒体读取或复制失败交给预览会话显示；退出仍清理已创建文件。 */
  async prepareMedia(input: NoteDraftPreviewInput): Promise<DraftPreviewMedia> {
    const context = AppStorage.get<common.UIAbilityContext>('abilityContext');
    if (context === undefined) throw new Error('Preview context unavailable');
    if (input.images.length > 0 || input.audios.length > 0) {
      this.directory = context.cacheDir + '/note-preview-' + this.token;
      await fs.mkdir(this.directory);
    }
    const images = await prepareNoteImageFields(input.fields, input.images, async (uri: string): Promise<string> => {
      const imageData = await readNoteImageData(uri);
      const name = 'draft-image-' + this.token + '-' + this.filenames.length + '.' + imageData.extension;
      this.filenames.push(name);
      const file = await fs.open(this.directory + '/' + name, fs.OpenMode.CREATE | fs.OpenMode.WRITE_ONLY);
      try {
        const data = imageData.data.buffer as ArrayBuffer;
        let offset: number = 0;
        while (offset < data.byteLength) {
          const count = await fs.write(file.fd, data.slice(offset));
          if (count <= 0) throw new Error('Incomplete preview image');
          offset += count;
        }
      } finally { await fs.close(file); }
      return name;
    });
    const fields = await prepareNoteAudioFields(images, input.audios, async (uri: string): Promise<string> => {
      const name = 'draft-audio-' + this.token + '-' + this.filenames.length + '.' + uri.split('.').pop();
      this.filenames.push(name);
      await fs.copyFile(uri, this.directory + '/' + name);
      return name;
    });
    assertNoteMediaResolved(fields);
    return { fields: fields, directory: this.directory, filenames: this.filenames.slice() };
  }
  async releaseMedia(): Promise<void> {
    const failures: string[] = [];
    for (const name of this.filenames) {
      try { await fs.unlink(this.directory + '/' + name); }
      catch (error) { failures.push(String(error)); }
    }
    if (this.directory !== '') {
      try { await fs.rmdir(this.directory); } catch (error) { failures.push(String(error)); }
    }
    this.filenames = []; this.directory = '';
    if (failures.length > 0) throw new Error(failures.join('\n'));
  }
}
