// SPDX-License-Identifier: AGPL-3.0-or-later
import type { NotetypeNameId, NotetypeView } from '../proto/messages/NotetypeMessages';
import { NoteSaveLifecycle } from './NoteSaveLifecycle';
import { prepareNoteImageFields } from './NoteImageDraft';
import type { NoteFieldImage } from './NoteImageDraft';

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
}
export interface OcclusionCreationInput {
  deckId: number;
  uri: string;
  occlusions: string;
  header: string;
  backExtra: string;
  tags: string[];
  notetypeId: number;
}
export interface NoteCreationBackend {
  initialize(filesDir: string): Promise<NoteCreationInitial>;
  loadType(id: number): Promise<NotetypeView>;
  importImage(uri: string): Promise<string>;
  saveNote(input: NoteCreationInput): Promise<void>;
  saveOcclusion(input: OcclusionCreationInput): Promise<void>;
  committed(): void;
  errorMessage(error: Error): string;
}
export interface NoteCreationState {
  busy: boolean;
  types: NotetypeNameId[];
  view: NotetypeView | null;
  error: string;
  saved: boolean;
}

/** 输入仍由表单编辑；会话拥有读取代次和一次提交，离页仅取消回写而不撤回已接受保存。 */
export class NoteCreationSession {
  private backend: NoteCreationBackend;
  private publish: (state: NoteCreationState) => void;
  private lifecycle: NoteSaveLifecycle = new NoteSaveLifecycle();
  private generation: number = 0;
  private saving: boolean = false;
  private saved: boolean = false;
  private types: NotetypeNameId[] = [];
  private view: NotetypeView | null = null;

  constructor(backend: NoteCreationBackend, publish: (state: NoteCreationState) => void) {
    this.backend = backend;
    this.publish = publish;
    this.lifecycle.appear();
  }

  dispose(): void { this.generation++; this.lifecycle.disappear(); }

  private emit(busy: boolean, error: string = ''): void {
    if (this.lifecycle.accept() === null) return;
    this.publish({ busy: busy, types: this.types.slice(), view: this.view, error: error, saved: this.saved });
  }

  async initialize(filesDir: string): Promise<void> {
    if (this.saving || this.saved || this.lifecycle.accept() === null) return;
    const generation: number = ++this.generation;
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
      this.emit(false, initial.warning);
    } catch (error) {
      if (generation !== this.generation) return;
      this.view = null;
      this.emit(false, 'add_note_notetype_load_failed');
    }
  }

  async loadType(id: number): Promise<void> {
    if (this.saving || this.saved || this.lifecycle.accept() === null) return;
    const generation: number = ++this.generation;
    this.emit(true);
    try {
      const view: NotetypeView = await this.backend.loadType(id);
      if (generation !== this.generation) return;
      this.view = view;
      this.emit(false);
    } catch (error) {
      if (generation !== this.generation) return;
      this.view = null;
      this.emit(false, 'add_note_notetype_load_failed');
    }
  }

  async save(input: NoteCreationInput): Promise<void> {
    const frozen: NoteCreationInput = { deckId: input.deckId, notetypeId: input.notetypeId,
      fields: input.fields.slice(), tags: input.tags.slice(), images: input.images.slice() };
    await this.commit(async (): Promise<void> => {
      try { frozen.fields = await prepareNoteImageFields(frozen.fields, frozen.images,
        (uri: string): Promise<string> => this.backend.importImage(uri)); }
      catch (error) { throw new Error('add_note_image_import_failed'); }
      await this.backend.saveNote(frozen);
    });
  }

  async saveOcclusion(input: OcclusionCreationInput): Promise<void> {
    const frozen: OcclusionCreationInput = { deckId: input.deckId, uri: input.uri, occlusions: input.occlusions,
      header: input.header, backExtra: input.backExtra, tags: input.tags.slice(), notetypeId: input.notetypeId };
    await this.commit((): Promise<void> => this.backend.saveOcclusion(frozen));
  }

  private async commit(write: () => Promise<void>): Promise<void> {
    if (this.saving || this.saved) return;
    const token: number | null = this.lifecycle.accept();
    if (token === null) return;
    this.generation++;
    this.saving = true;
    this.emit(true);
    try {
      await write();
      this.saved = true;
      this.backend.committed();
      if (this.lifecycle.isCurrent(token)) this.emit(false);
    } catch (error) {
      if (this.lifecycle.isCurrent(token)) this.emit(false,
        this.backend.errorMessage(error instanceof Error ? error : new Error(`${error}`)));
    } finally { this.saving = false; }
  }
}
