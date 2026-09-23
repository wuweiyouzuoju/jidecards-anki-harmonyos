// SPDX-License-Identifier: AGPL-3.0-or-later
import type { NotetypeNameId, 变更笔记类型信息, 变更笔记类型请求 } from '../../proto/messages/NotetypeMessages';
import { snapshotNotetypeChange } from '../BrowserSelection';

export interface BrowserNotetypeBackend {
  noteForCard(id: number): Promise<number>;
  notetypeForNote(id: number): Promise<number>;
  names(): Promise<NotetypeNameId[]>;
  mapping(oldId: number, newId: number): Promise<变更笔记类型信息>;
}
export interface BrowserNotetypeState {
  busy: boolean;
  error: string;
  names: NotetypeNameId[];
  selectedId: number;
  info: 变更笔记类型信息 | null;
  fields: number[];
  templates: number[];
}
export function initialNotetypeState(): BrowserNotetypeState {
  return { busy: true, error: '', names: [], selectedId: 0, info: null, fields: [], templates: [] };
}

/** 映射读取及草稿独立于页面；每次选择新类型使旧请求失效。 */
export class BrowserNotetypeSession {
  private backend: BrowserNotetypeBackend;
  private publish: (state: BrowserNotetypeState) => void;
  private state: BrowserNotetypeState = initialNotetypeState();
  private oldId: number = 0;
  private generation: number = 0;
  private alive: boolean = true;
  constructor(backend: BrowserNotetypeBackend, publish: (state: BrowserNotetypeState) => void) {
    this.backend = backend; this.publish = publish;
  }
  async load(firstId: number, notes: boolean): Promise<void> {
    const generation: number = ++this.generation;
    try {
      const noteId: number = notes ? firstId : await this.backend.noteForCard(firstId);
      if (!this.current(generation)) return;
      const oldId: number = await this.backend.notetypeForNote(noteId);
      if (!this.current(generation)) return;
      const names = await this.backend.names();
      if (!this.current(generation)) return;
      this.oldId = oldId; this.state.names = names;
    } catch (error) {
      if (this.current(generation)) this.state.error = error instanceof Error ? error.message : String(error);
    } finally {
      if (this.current(generation)) { this.state.busy = false; this.emit(); }
    }
  }
  async select(id: number): Promise<void> {
    if (!this.alive || this.oldId === 0) return;
    const generation: number = ++this.generation;
    this.state.selectedId = id; this.state.info = null; this.state.fields = []; this.state.templates = [];
    this.state.busy = true; this.state.error = ''; this.emit();
    try {
      const info = await this.backend.mapping(this.oldId, id);
      if (!this.current(generation)) return;
      this.state.info = info; this.state.fields = info.input.newFields.slice();
      this.state.templates = info.input.newTemplates.slice();
    } catch (error) {
      if (this.current(generation)) this.state.error = error instanceof Error ? error.message : String(error);
    } finally {
      if (this.current(generation)) { this.state.busy = false; this.emit(); }
    }
  }
  setField(index: number, value: number): void { this.state.fields[index] = value; this.emit(); }
  setTemplate(index: number, value: number): void { this.state.templates[index] = value; this.emit(); }
  request(): 变更笔记类型请求 | null {
    if (!this.alive || this.state.busy || this.state.info === null) return null;
    return snapshotNotetypeChange(this.state.info.input, this.state.fields, this.state.templates);
  }
  dispose(): void { this.alive = false; this.generation++; }
  private current(generation: number): boolean { return this.alive && generation === this.generation; }
  private emit(): void {
    if (!this.alive) return;
    const s = this.state;
    this.publish({ busy: s.busy, error: s.error, names: s.names.slice(), selectedId: s.selectedId,
      info: s.info, fields: s.fields.slice(), templates: s.templates.slice() });
  }
}
