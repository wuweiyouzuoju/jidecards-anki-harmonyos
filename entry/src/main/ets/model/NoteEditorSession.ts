// SPDX-License-Identifier: AGPL-3.0-or-later
import { loadNoteEditor } from './NoteEditorLoader';
import type { NoteEditorBackend } from './NoteEditorLoader';
import type { EditableNote } from '../proto/messages/NoteMessages';

export interface NoteEditorState {
  visible: boolean;
  busy: boolean;
  note: EditableNote | null;
  fieldNames: string[];
  error: string;
}

export function initialNoteEditorState(): NoteEditorState {
  return { visible: false, busy: false, note: null, fieldNames: [], error: '' };
}

/** 编辑读取和保存共用一个所有者；写入仍由浏览/学习各自的操作边界执行。 */
export class NoteEditorSession {
  private state: NoteEditorState = initialNoteEditorState();
  private version: number = 0;
  private disposed: boolean = false;
  private backend: NoteEditorBackend;
  private changed: (state: NoteEditorState) => void;

  constructor(backend: NoteEditorBackend, changed: (state: NoteEditorState) => void) {
    this.backend = backend;
    this.changed = changed;
  }

  async open(id: number, isNote: boolean, current: () => boolean,
    showWhileLoading: boolean = true): Promise<string> {
    if (this.disposed || !current()) return 'stale';
    const version: number = ++this.version;
    this.publish({ visible: showWhileLoading, busy: true, note: null, fieldNames: [], error: '' });
    const valid = (): boolean => !this.disposed && version === this.version && current();
    try {
      const snapshot = await loadNoteEditor(id, isNote, this.backend, valid);
      if (snapshot === null || !valid()) return 'stale';
      this.publish({ visible: true, busy: false, note: snapshot.note,
        fieldNames: snapshot.fieldNames, error: '' });
      return 'loaded';
    } catch (error) {
      if (!valid()) return 'stale';
      this.publish({ visible: showWhileLoading, busy: false, note: null, fieldNames: [], error: 'load' });
      return 'failed';
    } finally {
      if (!this.disposed && version === this.version && this.state.busy) this.close();
    }
  }

  async save(fields: string[], tags: string[], write: (note: EditableNote) => Promise<boolean>,
    padFields: boolean = false): Promise<boolean> {
    const note: EditableNote | null = this.state.note;
    if (this.disposed || this.state.busy || !this.state.visible || note === null) return false;
    const version: number = this.version;
    const values: string[] = fields.slice();
    if (padFields) while (values.length < this.state.fieldNames.length) values.push('');
    const updated: EditableNote = { id: note.id, guid: note.guid, notetypeId: note.notetypeId,
      mtimeSecs: note.mtimeSecs, usn: note.usn, fields: values, tags: tags.slice() };
    this.publish({ visible: true, busy: true, note: note, fieldNames: this.state.fieldNames, error: '' });
    let saved: boolean = false;
    try {
      saved = await write(updated);
      return saved;
    } catch (error) {
      return false;
    } finally {
      if (!this.disposed && version === this.version) {
        if (saved) this.close();
        else this.publish({ visible: true, busy: false, note: note,
          fieldNames: this.state.fieldNames, error: 'save' });
      }
    }
  }

  close(): void {
    this.version++;
    if (!this.disposed) this.publish(initialNoteEditorState());
  }

  dispose(): void { this.disposed = true; this.version++; }

  private publish(state: NoteEditorState): void {
    this.state = state;
    this.changed(state);
  }
}
