// SPDX-License-Identifier: AGPL-3.0-or-later
import type { EditableNote } from '../proto/messages/NoteMessages';
import type { RenderedCard } from '../proto/messages/CardRenderingMessages';
import type { NoteFieldImage } from './NoteImageDraft';
import type { NoteFieldAudio } from './NoteAudioDraft';

export interface NoteDraftPreviewInput {
  notetypeId: number;
  note?: EditableNote;
  fields: string[];
  tags: string[];
  images: NoteFieldImage[];
  audios: NoteFieldAudio[];
  templateJson?: string;
  css?: string;
  ordinal?: number;
  sample?: boolean;
}
export interface DraftPreviewMedia {
  fields: string[];
  directory: string;
  filenames: string[];
}
export interface DraftPreviewOption { ordinal: number; name: string; templateJson: string; }
export interface DraftPreviewState {
  busy: boolean;
  error: string;
  options: DraftPreviewOption[];
  selected: number;
  rendered: RenderedCard | null;
  revision: number;
  media: DraftPreviewMedia;
}
export function initialDraftPreviewState(): DraftPreviewState {
  return { busy: false, error: '', options: [], selected: 0, rendered: null, revision: 0,
    media: { fields: [], directory: '', filenames: [] } };
}
export interface NoteDraftPreviewBackend {
  wait(): Promise<void>;
  newNote(id: number): Promise<EditableNote>;
  notetypeJson(id: number): Promise<string>;
  clozeNumbers(note: EditableNote): Promise<number[]>;
  clozeFields(id: number): Promise<number[]>;
  prepareMedia(input: NoteDraftPreviewInput): Promise<DraftPreviewMedia>;
  releaseMedia(): Promise<void>;
  render(note: EditableNote, ordinal: number, template: string, css: string, sample: boolean): Promise<RenderedCard>;
}

/** 只冻结草稿和执行 Core 读取；临时媒体由适配器独占，退出等真实读取结束后释放。 */
export class NoteDraftPreviewSession {
  private backend: NoteDraftPreviewBackend;
  private changed: (state: DraftPreviewState) => void;
  private state: DraftPreviewState = initialDraftPreviewState();
  private alive: boolean = true;
  private version: number = 0;
  private pending: Promise<void> = Promise.resolve();
  private cleanup: Promise<void> | null = null;
  private note: EditableNote | null = null;
  private css: string = '';
  private sample: boolean = false;
  constructor(backend: NoteDraftPreviewBackend, changed: (state: DraftPreviewState) => void) {
    this.backend = backend; this.changed = changed;
  }
  async open(input: NoteDraftPreviewInput): Promise<void> {
    if (!this.alive || this.state.busy) return;
    // 输入包含附件对象，必须在第一个等待前复制，不能给保存流程写回预览文件名。
    const frozen: NoteDraftPreviewInput = JSON.parse(JSON.stringify(input)) as NoteDraftPreviewInput;
    const version = ++this.version;
    this.state.busy = true; this.state.error = ''; this.publish();
    this.pending = this.load(frozen, version);
    await this.pending;
  }
  private async load(input: NoteDraftPreviewInput, version: number): Promise<void> {
    try {
      await this.backend.wait();
      if (!this.current(version)) return;
      const json = JSON.parse(await this.backend.notetypeJson(input.notetypeId)) as Record<string, Object>;
      if (!this.current(version)) return;
      const note: EditableNote = input.note ?? await this.backend.newNote(input.notetypeId);
      if (!this.current(version)) return;
      const media = await this.backend.prepareMedia(input);
      if (!this.current(version)) return;
      note.fields = media.fields.slice(); note.tags = input.tags.slice();
      this.note = note; this.css = input.css ?? json['css'] as string; this.sample = input.sample ?? false;
      const templates = input.templateJson === undefined ? json['tmpls'] as Object[] : [JSON.parse(input.templateJson) as Object];
      const cloze: boolean = json['type'] === 1;
      // Core 从模板引用的字段确定 Cloze 字段，非 Cloze 字段中的标记不产生选项。
      const numbersNote: EditableNote = JSON.parse(JSON.stringify(note)) as EditableNote;
      if (cloze && !this.sample) {
        const fields = await this.backend.clozeFields(input.notetypeId);
        if (!this.current(version)) return;
        numbersNote.fields = note.fields.map((value: string, index: number): string =>
          fields.indexOf(index) >= 0 ? value : '');
      }
      const numbers = cloze ? (this.sample ? [1] : await this.backend.clozeNumbers(numbersNote)) : [];
      if (!this.current(version)) return;
      const options: DraftPreviewOption[] = [];
      if (cloze) {
        // 对照 AnkiDroid ephemeralCard：临时 ord 指向目标编号，Core 优先复用其卡片身份。
        // 固定 ord=0 会把 c6 渲染成既有 c1；不存在的目标由 Core 合成，不写入 collection。
        for (const number of numbers) {
          const template = JSON.parse(JSON.stringify(templates[0])) as Record<string, Object | null>;
          template['ord'] = number - 1;
          options.push({ ordinal: number - 1, name: 'c' + number, templateJson: JSON.stringify(template) });
        }
      } else {
        templates.forEach((item: Object, index: number): void => {
          const template = item as Record<string, Object>;
          options.push({ ordinal: input.ordinal ?? index, name: template['name'] as string, templateJson: JSON.stringify(template) });
        });
      }
      this.state.media = media; this.state.options = options;
      if (options.length === 0) throw new Error('note_preview_no_cloze');
      await this.render(0, version);
    } catch (error) {
      if (this.current(version)) this.state.error = error instanceof Error ? error.message : String(error);
    } finally {
      if (this.current(version)) { this.state.busy = false; this.publish(); }
    }
  }
  async select(index: number): Promise<void> {
    if (!this.alive || this.state.busy || index < 0 || index >= this.state.options.length) return;
    const version = ++this.version;
    this.state.busy = true; this.state.error = ''; this.state.rendered = null; this.publish();
    this.pending = this.renderSelection(index, version);
    await this.pending;
  }
  private async renderSelection(index: number, version: number): Promise<void> {
    try { await this.backend.wait(); if (this.current(version)) await this.render(index, version); }
    catch (error) { if (this.current(version)) this.state.error = error instanceof Error ? error.message : String(error); }
    finally { if (this.current(version)) { this.state.busy = false; this.publish(); } }
  }
  private async render(index: number, version: number): Promise<void> {
    const option = this.state.options[index];
    if (this.note === null) return;
    const rendered = await this.backend.render(this.note, option.ordinal, option.templateJson, this.css, this.sample);
    if (!this.current(version)) return;
    this.state.selected = index; this.state.rendered = rendered; this.state.revision++;
  }
  dispose(resourcesReleased: Promise<void> = Promise.resolve()): Promise<void> {
    if (this.cleanup !== null) return this.cleanup;
    this.alive = false; this.version++;
    this.cleanup = this.pending.then((): Promise<void> => resourcesReleased,
      (): Promise<void> => resourcesReleased).finally((): Promise<void> => this.backend.releaseMedia());
    return this.cleanup;
  }
  private current(version: number): boolean { return this.alive && this.version === version; }
  private publish(): void { if (this.alive) this.changed(JSON.parse(JSON.stringify(this.state)) as DraftPreviewState); }
}
