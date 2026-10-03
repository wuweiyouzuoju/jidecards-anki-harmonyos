// SPDX-License-Identifier: AGPL-3.0-or-later
import type { NotetypeNameId, NotetypeView } from '../proto/messages/NotetypeMessages';
import { NoteSaveLifecycle } from './NoteSaveLifecycle';
import { prepareNoteImageFields } from './NoteImageDraft';
import type { NoteFieldImage } from './NoteImageDraft';
import { prepareNoteAudioFields } from './NoteAudioDraft';
import { assertNoteMediaResolved } from './NoteMediaParts';
import type { NoteFieldAudio } from './NoteAudioDraft';
import { NoteDuplicateWarning } from './NoteDuplicateSession';

export interface NoteCreationInitial {
  types: NotetypeNameId[];
  defaultId: number;
  warning: string;
}
export interface NoteCreationInput {
  deckId: number;
  notetypeId: number;
  fields: string[];
  tags: string[];
  images: NoteFieldImage[];
  audios?: NoteFieldAudio[];
}
export interface OcclusionCreationInput {
  deckId: number;
  uri: string;
  occlusions: string;
  header: string;
  backExtra: string;
  tags: string[];
  notetypeId: number;
  image?: NoteFieldImage;
}
export interface NoteCreationBackend {
  initialize(filesDir: string): Promise<NoteCreationInitial>;
  loadType(id: number): Promise<NotetypeView>;
  setFieldSticky(id: number, ord: number, sticky: boolean): Promise<void>;
  importImage(uri: string): Promise<string>;
  importAudio(uri: string): Promise<string>;
  saveNote(input: NoteCreationInput, allowDuplicate?: boolean): Promise<void>;
  saveOcclusion(input: OcclusionCreationInput, allowDuplicate?: boolean): Promise<void>;
  committed(): void;
  errorMessage(error: Error): string;
}
export interface NoteCreationState {
  busy: boolean;
  stickySaving: boolean;
  types: NotetypeNameId[];
  view: NotetypeView | null;
  error: string;
  saved: boolean;
  completion: NoteCreationCompletion | null;
  duplicateSearch: string;
}

export interface NoteCreationCompletion {
  exit: boolean;
  next: NoteCreationInput | null;
  nextOcclusion: OcclusionCreationInput | null;
}

/** 固定配置只取当前 Core 类型；下一张使用已解析的永久媒体引用，不再携带待导入附件。 */
export function nextCreationInput(input: NoteCreationInput, view: NotetypeView | null): NoteCreationInput {
  return { deckId: input.deckId, notetypeId: input.notetypeId, tags: input.tags.slice(),
    fields: input.fields.map((value: string, index: number): string =>
      view?.id === input.notetypeId && view.fields?.[index]?.sticky === true ? value : ''),
    images: [], audios: [] };
}

function nextOcclusionInput(input: OcclusionCreationInput, view: NotetypeView | null): OcclusionCreationInput {
  const indexes: number[] = view?.imageOcclusionFields ?? [];
  const sticky = (index: number): boolean => view?.id === input.notetypeId && view.fields?.[index]?.sticky === true;
  const keepImage: boolean = sticky(indexes[1]);
  return { deckId: input.deckId, notetypeId: input.notetypeId, tags: input.tags.slice(),
    uri: keepImage ? input.uri : '', image: keepImage ? input.image : undefined,
    occlusions: sticky(indexes[0]) ? input.occlusions : '',
    header: sticky(indexes[2]) ? input.header : '', backExtra: sticky(indexes[3]) ? input.backExtra : '' };
}

/** 表单拥有草稿；会话串行接受保存/配置写入，成功才准备下一张，离页不撤回已接受写入。 */
export class NoteCreationSession {
  private backend: NoteCreationBackend;
  private publish: (state: NoteCreationState) => void;
  private lifecycle: NoteSaveLifecycle = new NoteSaveLifecycle();
  private generation: number = 0;
  private saving: boolean = false;
  private stickyWrite: Promise<string> | null = null;
  private reading: boolean = false;
  private saved: boolean = false;
  private types: NotetypeNameId[] = [];
  private view: NotetypeView | null = null;
  private occlusionImage: NoteFieldImage | null = null;
  private duplicateSearch: string = '';
  private duplicateWrite: (() => Promise<void>) | null = null;
  private duplicateCompletion: (() => NoteCreationCompletion) | null = null;

  constructor(backend: NoteCreationBackend, publish: (state: NoteCreationState) => void) {
    this.backend = backend;
    this.publish = publish;
    this.lifecycle.appear();
  }

  dispose(): void { this.generation++; this.lifecycle.disappear(); this.duplicateWrite = null; }

  private emit(busy: boolean, error: string = '', completion: NoteCreationCompletion | null = null): void {
    if (this.lifecycle.accept() === null) return;
    this.publish({ busy: busy, stickySaving: this.stickyWrite !== null,
      types: this.types.slice(), view: this.view, error: error, saved: this.saved,
      completion: completion, duplicateSearch: this.duplicateSearch });
  }

  async initialize(filesDir: string): Promise<void> {
    if (this.stickyWrite !== null && !await this.finishStickyWrite()) return;
    if (this.saving || this.saved || this.duplicateWrite !== null || this.lifecycle.accept() === null) return;
    const generation: number = ++this.generation;
    this.reading = true;
    this.emit(true);
    try {
      const initial: NoteCreationInitial = await this.backend.initialize(filesDir);
      if (generation !== this.generation) return;
      this.types = initial.types.slice();
      if (this.types.length === 0) throw new Error('add_note_notetype_load_failed');
      const id: number = this.types.some((type: NotetypeNameId): boolean => type.id === initial.defaultId) ?
        initial.defaultId : this.types[0].id;
      const view: NotetypeView = await this.backend.loadType(id);
      if (generation !== this.generation) return;
      this.view = view;
      this.reading = false;
      this.emit(false, initial.warning);
    } catch (error) {
      if (generation !== this.generation) return;
      this.view = null;
      this.reading = false;
      this.emit(false, 'add_note_notetype_load_failed');
    }
  }

  async loadType(id: number): Promise<void> {
    if (this.stickyWrite !== null && !await this.finishStickyWrite()) return;
    if (this.saving || this.saved || this.duplicateWrite !== null || this.lifecycle.accept() === null) return;
    const generation: number = ++this.generation;
    this.reading = true;
    this.emit(true);
    try {
      const view: NotetypeView = await this.backend.loadType(id);
      if (generation !== this.generation) return;
      this.view = view;
      this.occlusionImage = null;
      this.reading = false;
      this.emit(false);
    } catch (error) {
      if (generation !== this.generation) return;
      // 读取新类型失败时仍可重试旧草稿，不清空字段或已导入媒体。
      this.reading = false;
      this.emit(false, 'add_note_notetype_load_failed');
    }
  }

  async setFieldSticky(index: number, sticky: boolean): Promise<void> {
    if (this.saving || this.stickyWrite !== null || this.reading || this.saved || this.duplicateWrite !== null || this.view === null) return;
    const token: number | null = this.lifecycle.accept();
    const field = this.view.fields[index];
    if (token === null || field === undefined || field.sticky === sticky) return;
    const view: NotetypeView = this.view;
    this.generation++;
    this.stickyWrite = this.persistFieldSticky(view, index, sticky);
    this.emit(false);
    const errorMessage: string = await this.stickyWrite;
    this.stickyWrite = null;
    if (this.lifecycle.isCurrent(token)) this.emit(false, errorMessage);
  }

  private async persistFieldSticky(view: NotetypeView, index: number, sticky: boolean): Promise<string> {
    const field = view.fields[index];
    try {
      await this.backend.setFieldSticky(view.id, field.ord, sticky);
      field.sticky = sticky;
      return '';
    } catch (error) { return 'add_note_sticky_failed'; }
  }

  /** 配置落盘只占用开关；保存和类型切换等待它结束，避免丢弃紧接着的操作。 */
  private async finishStickyWrite(): Promise<boolean> {
    const write: Promise<string> | null = this.stickyWrite;
    if (write === null) return true;
    this.emit(true);
    return await write === '';
  }

  async save(input: NoteCreationInput, exitAfterSave: boolean = true): Promise<void> {
    const view: NotetypeView | null = this.view;
    const frozen: NoteCreationInput = { deckId: input.deckId, notetypeId: input.notetypeId,
      fields: input.fields.slice(), tags: input.tags.slice(), images: input.images.slice(), audios: (input.audios ?? []).slice() };
    if (this.stickyWrite !== null && !await this.finishStickyWrite()) return;
    await this.commit(async (): Promise<void> => {
      try { frozen.fields = await prepareNoteImageFields(frozen.fields, frozen.images,
        (uri: string): Promise<string> => this.backend.importImage(uri)); }
      catch (error) { throw new Error('add_note_image_import_failed'); }
      try {
        if ((frozen.audios ?? []).length > 0) frozen.fields = await prepareNoteAudioFields(frozen.fields, frozen.audios ?? [],
          (uri: string): Promise<string> => this.backend.importAudio(uri));
      } catch (error) { throw new Error('note_audio_import_failed'); }
      assertNoteMediaResolved(frozen.fields);
      await this.backend.saveNote(frozen);
    }, (): NoteCreationCompletion => ({ exit: exitAfterSave,
      next: exitAfterSave ? null : nextCreationInput(frozen, view), nextOcclusion: null }),
      (): Promise<void> => this.backend.saveNote(frozen, true));
  }

  async saveOcclusion(input: OcclusionCreationInput, exitAfterSave: boolean = true): Promise<void> {
    if (this.stickyWrite !== null && !await this.finishStickyWrite()) return;
    if (this.saving || this.reading || this.saved || this.duplicateWrite !== null || this.lifecycle.accept() === null) return;
    const view: NotetypeView | null = this.view;
    if (input.image !== undefined || this.occlusionImage === null || this.occlusionImage.uri !== input.uri) {
      this.occlusionImage = input.image ?? { id: 0, fieldIndex: 0, uri: input.uri, filename: '' };
    }
    const frozen: OcclusionCreationInput = { deckId: input.deckId, uri: input.uri, occlusions: input.occlusions,
      header: input.header, backExtra: input.backExtra, tags: input.tags.slice(), notetypeId: input.notetypeId,
      image: this.occlusionImage };
    await this.commit((): Promise<void> => this.backend.saveOcclusion(frozen), (): NoteCreationCompletion =>
      ({ exit: exitAfterSave, next: null, nextOcclusion: exitAfterSave ? null : nextOcclusionInput(frozen, view) }),
      (): Promise<void> => this.backend.saveOcclusion(frozen, true));
  }

  cancelDuplicate(): void {
    if (this.saving || this.duplicateWrite === null) return;
    this.duplicateWrite = null; this.duplicateCompletion = null; this.duplicateSearch = ''; this.emit(false);
  }

  async confirmDuplicate(): Promise<void> {
    const write = this.duplicateWrite;
    const completion = this.duplicateCompletion;
    if (write === null || completion === null || this.saving || this.lifecycle.accept() === null) return;
    this.duplicateWrite = null; this.duplicateCompletion = null; this.duplicateSearch = '';
    await this.commit(write, completion);
  }

  private async commit(write: () => Promise<void>, completion: () => NoteCreationCompletion,
    duplicateWrite: (() => Promise<void>) | null = null): Promise<void> {
    if (this.saving || this.reading || this.saved || this.duplicateWrite !== null) return;
    const token: number | null = this.lifecycle.accept();
    if (token === null) return;
    this.generation++;
    this.saving = true;
    this.emit(true);
    try {
      await write();
    } catch (error) {
      this.saving = false;
      if (error instanceof NoteDuplicateWarning && duplicateWrite !== null && this.lifecycle.isCurrent(token)) {
        this.duplicateWrite = duplicateWrite; this.duplicateCompletion = completion; this.duplicateSearch = error.search;
      }
      if (this.lifecycle.isCurrent(token)) this.emit(false,
        this.backend.errorMessage(error instanceof Error ? error : new Error(`${error}`)));
      return;
    }
    const result: NoteCreationCompletion = completion();
    this.saved = result.exit;
    // 已落库后的通知失败不能把笔记变回可重试提交，否则会重复创建。
    let warning: string = '';
    try { this.backend.committed(); }
    catch (error) { warning = 'add_note_refresh_failed'; }
    this.saving = false;
    if (this.lifecycle.isCurrent(token)) this.emit(false, warning, result);
  }
}
