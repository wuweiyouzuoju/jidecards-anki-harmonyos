// SPDX-License-Identifier: AGPL-3.0-or-later
import type { DuplicateField } from '../proto/messages/NoteDuplicateMessages';
import { NOTE_DUPLICATE_BATCH_SIZE } from '../proto/messages/NoteDuplicateMessages';

export interface DuplicateGroup {
  value: string;
  noteIds: number[];
}
export interface DuplicateScanInput {
  notetypeId: number;
  fieldOrd: number;
  search: string;
}
export interface DuplicateScanState {
  busy: boolean;
  scanned: number;
  total: number;
  complete: boolean;
  cancelled: boolean;
  error: string;
  groups: DuplicateGroup[];
}
export interface DuplicateScanBackend {
  search(input: DuplicateScanInput): Promise<number[]>;
  fields(ids: number[], notetypeId: number, fieldOrd: number): Promise<DuplicateField[]>;
}
export function duplicateGroupSearch(group: DuplicateGroup): string {
  if (group.noteIds.length < 2 || group.noteIds.some((id: number): boolean => !Number.isSafeInteger(id) || id <= 0)) {
    throw new Error('Invalid duplicate group');
  }
  return `nid:${group.noteIds.join(',')}`;
}
export function initialDuplicateScanState(): DuplicateScanState {
  return { busy: false, scanned: 0, total: 0, complete: false, cancelled: false, error: '', groups: [] };
}
/** IDs and grouping keys are O(N); field content crosses the bridge only in bounded batches. */
export class NoteDuplicateSession {
  private backend: DuplicateScanBackend;
  private publish: (state: DuplicateScanState) => void;
  private generation: number = 0;
  private disposed: boolean = false;
  private state: DuplicateScanState = initialDuplicateScanState();

  constructor(backend: DuplicateScanBackend, publish: (state: DuplicateScanState) => void) {
    this.backend = backend;
    this.publish = publish;
  }
  cancel(): void {
    this.generation++;
    this.state.busy = false;
    this.state.complete = false;
    this.state.cancelled = true;
    this.state.groups = [];
    this.emit();
  }
  reset(): void { this.generation++; this.state = initialDuplicateScanState(); this.emit(); }
  dispose(): void { this.disposed = true; this.generation++; }
  private emit(): void {
    if (this.disposed) return;
    this.publish({ busy: this.state.busy, scanned: this.state.scanned, total: this.state.total,
      complete: this.state.complete, cancelled: this.state.cancelled, error: this.state.error,
      groups: this.state.groups.map((group: DuplicateGroup): DuplicateGroup =>
        ({ value: group.value, noteIds: group.noteIds.slice() })) });
  }
  async scan(input: DuplicateScanInput): Promise<void> {
    if (this.disposed) return;
    const frozen: DuplicateScanInput = { notetypeId: input.notetypeId, fieldOrd: input.fieldOrd, search: input.search };
    const generation: number = ++this.generation;
    const current = (): boolean => !this.disposed && generation === this.generation;
    this.state = initialDuplicateScanState(); this.state.busy = true; this.emit();
    try {
      const ids: number[] = (await this.backend.search(frozen)).slice();
      if (!current()) return;
      if (new Set<number>(ids).size !== ids.length) throw new Error('find_dupes_changed');
      this.state.total = ids.length; this.emit();
      const groups = new Map<string, number[]>();
      for (let offset = 0; offset < ids.length; offset += NOTE_DUPLICATE_BATCH_SIZE) {
        if (!current()) return;
        const batch: number[] = ids.slice(offset, offset + NOTE_DUPLICATE_BATCH_SIZE);
        const fields: DuplicateField[] = await this.backend.fields(batch, frozen.notetypeId, frozen.fieldOrd);
        if (!current()) return;
        const expected = new Set<number>(batch);
        if (fields.length !== expected.size) throw new Error('find_dupes_changed');
        for (const field of fields) {
          if (!expected.delete(field.noteId)) throw new Error('find_dupes_changed');
          // Desktop find_dupes uses Core strip_html_media and exact case/space equality.
          if (field.value === '') continue;
          const group: number[] | undefined = groups.get(field.value);
          if (group === undefined) groups.set(field.value, [field.noteId]);
          else group.push(field.noteId);
        }
        this.state.scanned += batch.length; this.emit();
      }
      groups.forEach((noteIds: number[], value: string): void => {
        if (noteIds.length > 1) this.state.groups.push({ value: value, noteIds: noteIds });
      });
      this.state.groups.sort((a: DuplicateGroup, b: DuplicateGroup): number => b.noteIds.length - a.noteIds.length);
      this.state.complete = true;
    } catch (error) {
      if (!current()) return;
      this.state.error = error instanceof Error ? error.message : `${error}`;
      this.state.groups = [];
    } finally {
      if (current()) { this.state.busy = false; this.emit(); }
    }
  }
}

/** Warning passed only to the manual creation session; the default service still rejects duplicates. */
export class NoteDuplicateWarning extends Error {
  readonly search: string;
  constructor(search: string) { super('add_note_duplicate_error'); this.search = search; }
}
