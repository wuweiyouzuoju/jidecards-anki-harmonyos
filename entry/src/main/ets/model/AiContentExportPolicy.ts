// SPDX-License-Identifier: AGPL-3.0-or-later
import type { EditableNote } from '../proto/messages/NoteMessages';

export const AI_CONTENT_PROVENANCE_KEY: string = 'jide_ai_content_provenance_v1';
export const AI_CONTENT_EXPORT_BLOCKED: string = 'transfer_ai_content_export_blocked';
export interface AiContentProvenance { version: number; noteGuids: string[]; notetypeIds: number[]; }
export interface AiExportScope { deckId?: number; mode?: string; ids?: number[]; }
export interface AiContentExportBackend {
  read(): Promise<string>;
  write(value: string): Promise<void>;
  notes(scope: AiExportScope): Promise<EditableNote[]>;
}
export const AI_CONTENT_EXPORT_SUPPORT = {
  policy: 'block_exports_containing_recorded_ai_content',
  formats: ['apkg', 'colpkg', 'note_text', 'card_text'],
  scope: 'selected_deck_and_children_or_confirmed_subset_or_collection',
  errorKey: AI_CONTENT_EXPORT_BLOCKED,
  provenance: 'collection_config_note_guid_and_notetype_id',
  historicalLimit: 'content_saved_before_provenance_tracking_requires_explicit_identification'
};

/** 来源记录与笔记编辑分离，删标签或改正文不会抹掉来源。写入前记录，失败时宁可保守拦截。 */
export class AiContentExportPolicy {
  private queue: Promise<void> = Promise.resolve();
  constructor(private readonly backend: AiContentExportBackend) {}
  private async read(): Promise<AiContentProvenance> {
    const all: Record<string, Object> = JSON.parse(await this.backend.read()) as Record<string, Object>;
    if (all[AI_CONTENT_PROVENANCE_KEY] === undefined) return { version: 1, noteGuids: [], notetypeIds: [] };
    const value = all[AI_CONTENT_PROVENANCE_KEY] as AiContentProvenance;
    if (value === null || value.version !== 1 || !Array.isArray(value.noteGuids) || !Array.isArray(value.notetypeIds) ||
      value.noteGuids.some((guid: string): boolean => typeof guid !== 'string' || guid.length === 0) ||
      value.notetypeIds.some((id: number): boolean => !Number.isSafeInteger(id) || id <= 0)) throw new Error('ai_content_provenance_invalid');
    return value;
  }
  recordNotes(notes: EditableNote[]): Promise<void> {
    if (notes.some((note: EditableNote): boolean => typeof note.guid !== 'string' || note.guid.length === 0)) return Promise.reject(new Error('ai_content_provenance_invalid'));
    return this.record(notes.map((note: EditableNote): string => note.guid), []);
  }
  recordNotetypes(ids: number[]): Promise<void> {
    if (ids.some((id: number): boolean => !Number.isSafeInteger(id) || id <= 0)) return Promise.reject(new Error('ai_content_provenance_invalid'));
    return this.record([], ids);
  }
  private record(guids: string[], types: number[]): Promise<void> {
    const task = this.queue.catch((): void => {}).then(async (): Promise<void> => {
      const value = await this.read();
      value.noteGuids = Array.from(new Set<string>(value.noteGuids.concat(guids)));
      value.notetypeIds = Array.from(new Set<number>(value.notetypeIds.concat(types)));
      await this.backend.write(JSON.stringify(value));
    });
    this.queue = task;
    return task;
  }
  /** 无来源记录不等于识别出全部历史内容；读取失败必须阻止文件生成。 */
  async assertExport(scope: AiExportScope): Promise<void> {
    await this.queue.catch((): void => {});
    const value = await this.read();
    if (value.noteGuids.length === 0 && value.notetypeIds.length === 0) return;
    const guids = new Set<string>(value.noteGuids);
    const types = new Set<number>(value.notetypeIds);
    for (const note of await this.backend.notes(scope)) {
      if (guids.has(note.guid) || types.has(note.notetypeId)) throw new Error(AI_CONTENT_EXPORT_BLOCKED);
    }
  }
}
