// SPDX-License-Identifier: AGPL-3.0-or-later
import { NoteLinksRpc } from '../proto/generated/PrivateRpc';
import { GenericString } from '../proto/generated/CoreMessages';
import { 后端会话 } from './后端会话';
import { 笔记服务 } from './笔记服务';
import { 笔记类型服务 } from './笔记类型服务';
import { 搜索服务 } from './搜索服务';
import { autoSyncScheduler } from '../model/AutoSyncScheduler';
import { syncActivity } from '../model/SyncSettings';
import { NoteLinkData, NoteLinkNode, NoteLinkTarget, NoteLinkView, NOTE_LINK_SUPPORT,
  emptyNoteLinks, parseNoteLinks, noteLinkView, renderNoteLinkMirror, updateNoteLinkField,
  sanitizeLinkAlias } from '../model/NoteLinks';
import { EditableNote } from '../proto/messages/NoteMessages';
import { prepareNoteReferenceFields, noteReferences, changeNoteReferences } from '../model/NoteReferences';

export interface NoteLinksSnapshot { noteId: number; guid: string; metadata: string; view: NoteLinkView; }
/** One owner serializes accepted edits. Lifecycle only invalidates reads, never accepted writes. */
export class NoteLinksService {
  private notes: 笔记服务 = new 笔记服务();
  private types: 笔记类型服务 = new 笔记类型服务();
  private queue: Promise<void> = Promise.resolve();
  private rpc: NoteLinksRpc = new NoteLinksRpc(后端会话.获取实例());
  private encode(value: string): Uint8Array { const message = new GenericString(); message.setVal(value); return message.toBytes(); }
  private async graph(): Promise<NoteLinkNode[]> {
    return JSON.parse(new GenericString(await this.rpc.graph(this.encode(''))).getVal()) as NoteLinkNode[];
  }
  /** 调用方已持有保存会话的集合占用；仅校验/准备，同一次 Core 写入提交正文和关系。 */
  async prepareNote(note: EditableNote, before?: EditableNote): Promise<void> {
    const old: string[] = noteReferences(before?.fields ?? []).map((ref): string => ref.guid);
    const added: string[] = Array.from(new Set<string>(noteReferences(note.fields).map((ref): string => ref.guid)))
      .filter((guid: string): boolean => !old.includes(guid));
    if (added.length > 0) {
      const targets: NoteLinkTarget[] = await this.resolve(added);
      if (added.some((guid: string): boolean => !targets.some((target): boolean => target.guid === guid))) throw new Error('note_links_missing');
    }
    note.fields = prepareNoteReferenceFields(note.fields, note.guid, before?.fields);
  }
  async mirror(noteId: number): Promise<string> { return renderNoteLinkMirror((await this.load(noteId)).view); }
  async resolve(guids: string[]): Promise<NoteLinkTarget[]> {
    const result: NoteLinkTarget[] = [];
    const uniqueGuids: string[] = Array.from(new Set<string>(guids));
    for (let i: number = 0; i < uniqueGuids.length; i += 200) {
      const bytes: Uint8Array = await this.rpc.resolve(this.encode(JSON.stringify(uniqueGuids.slice(i, i + 200))));
      const batch: NoteLinkTarget[] = JSON.parse(new GenericString(bytes).getVal()) as NoteLinkTarget[];
      result.push(...batch);
    }
    return result;
  }
  async preview(guid: string): Promise<number[]> {
    const owner: Object = {}; autoSyncScheduler.beginOperation(owner);
    try { await syncActivity.waitForCollection(); return (await this.resolve([guid]))[0]?.cardIds ?? []; }
    finally { autoSyncScheduler.endOperation(owner); }
  }
  async load(noteId: number): Promise<NoteLinksSnapshot> {
    const owner: Object = {}; autoSyncScheduler.beginOperation(owner);
    try {
      await syncActivity.waitForCollection();
      const note: EditableNote = await this.notes.获取笔记(noteId);
      const nodes: NoteLinkNode[] = await this.graph();
      const own: NoteLinkNode | undefined = nodes.find((node: NoteLinkNode): boolean => node.guid === note.guid);
      if (own === undefined && note.fields.some((field: string): boolean => field.includes('ml-mirror-row'))) {
        throw new Error('note_links_migrate');
      }
      const preliminary: NoteLinkView = noteLinkView(note.guid, nodes, []);
      const targets: NoteLinkTarget[] = await this.resolve(preliminary.outgoing.concat(preliminary.incoming)
        .map((row): string => row.guid));
      return { noteId: noteId, guid: note.guid, metadata: own?.metadata ?? '', view: noteLinkView(note.guid, nodes, targets) };
    } finally { autoSyncScheduler.endOperation(owner); }
  }
  async search(query: string, excludedGuid: string): Promise<NoteLinkTarget[]> {
    if (!query.trim()) return [];
    const owner: Object = {}; autoSyncScheduler.beginOperation(owner);
    try {
      await syncActivity.waitForCollection();
      const ids: number[] = await new 搜索服务().搜索笔记({ search: query, order: { kind: 'none' } });
      const guids: string[] = [];
      for (const id of ids.slice(0, 60)) {
        const note: EditableNote = await this.notes.获取笔记(id);
        if (note.guid !== excludedGuid) guids.push(note.guid);
      }
      return this.resolve(guids);
    } finally { autoSyncScheduler.endOperation(owner); }
  }
  change(snapshot: NoteLinksSnapshot, targetGuid: string, kind: string, alias: string = ''): Promise<void> {
    const task: Promise<void> = this.queue.then((): Promise<void> => this.commit(snapshot, targetGuid, kind, alias));
    this.queue = task.catch((): void => {}); return task;
  }
  private async commit(snapshot: NoteLinksSnapshot, targetGuid: string, kind: string, alias: string): Promise<void> {
    const owner: Object = {}; autoSyncScheduler.beginOperation(owner);
    try {
      await syncActivity.waitForCollection();
      const nodes: NoteLinkNode[] = await this.graph();
      const source: NoteLinkNode | undefined = nodes.find((node: NoteLinkNode): boolean => node.guid === snapshot.guid);
      if ((source?.metadata ?? '') !== snapshot.metadata) throw new Error('note_links_conflict');
      const changedGuid: string = kind === 'alias' ? targetGuid : snapshot.guid;
      const changed: NoteLinkNode | undefined = nodes.find((node: NoteLinkNode): boolean => node.guid === changedGuid);
      const data: NoteLinkData = changed === undefined ? emptyNoteLinks(changedGuid) :
        parseNoteLinks(changed.metadata, changedGuid) ?? emptyNoteLinks(changedGuid);
      if (kind === 'alias') {
        const expected = snapshot.view.outgoing.concat(snapshot.view.incoming).find((row): boolean => row.guid === targetGuid);
        if (expected === undefined || expected.alias !== data.alias) throw new Error('note_links_conflict');
      }
      const before: string[] = data.targets.slice();
      if (kind === 'add' && targetGuid !== changedGuid && !data.targets.includes(targetGuid)) data.targets.push(targetGuid);
      else if (kind === 'remove') data.targets = data.targets.filter((guid: string): boolean => guid !== targetGuid);
      else if (kind === 'alias') data.alias = sanitizeLinkAlias(alias);
      else if (kind !== 'add') throw new Error('Invalid link action');
      const affected: Set<string> = new Set<string>([changedGuid, ...before, ...data.targets]);
      for (const node of nodes) if (parseNoteLinks(node.metadata, node.guid)?.targets.includes(changedGuid)) affected.add(node.guid);
      const replacement: NoteLinkNode = { noteId: changed?.noteId ?? 0, guid: changedGuid, title: changed?.title ?? '',
        metadata: updateNoteLinkField('', data, '') };
      const updated: NoteLinkNode[] = nodes.filter((node: NoteLinkNode): boolean => node.guid !== changedGuid).concat([replacement]);
      const needed: Set<string> = new Set<string>(Array.from(affected));
      for (const guid of affected) {
        const view: NoteLinkView = noteLinkView(guid, updated, []);
        for (const row of view.outgoing.concat(view.incoming)) needed.add(row.guid);
      }
      const targets: NoteLinkTarget[] = await this.resolve(Array.from(needed));
      if (kind !== 'remove' && !targets.some((target: NoteLinkTarget): boolean => target.guid === targetGuid)) throw new Error('note_links_missing');
      const originals: EditableNote[] = [], updates: EditableNote[] = [];
      for (const guid of affected) {
        const target: NoteLinkTarget | undefined = targets.find((item: NoteLinkTarget): boolean => item.guid === guid);
        if (target === undefined) continue;
        const note: EditableNote = await this.notes.获取笔记(target.noteId);
        const type = await this.types.获取笔记类型(note.notetypeId);
        const ownedOrd: number = note.fields.findIndex((field: string): boolean => field.includes('<!--jide-links:'));
        const supportOrd: number = type.fieldNames.indexOf(NOTE_LINK_SUPPORT.field);
        const ord: number = ownedOrd >= 0 ? ownedOrd : supportOrd >= 0 ? supportOrd : note.fields.length - 1;
        if (ord < 0) throw new Error('note_links_error');
        if (ownedOrd < 0 && note.fields[ord].includes('ml-mirror-row')) throw new Error('note_links_migrate');
        originals.push(note);
        const fields: string[] = note.fields.slice();
        if (kind === 'remove' && guid === snapshot.guid) {
          const unlinked: string[] = changeNoteReferences(fields, targetGuid);
          for (let index: number = 0; index < fields.length; index++) fields[index] = unlinked[index];
        }
        const record: NoteLinkNode | undefined = updated.find((item: NoteLinkNode): boolean => item.guid === guid);
        const recordData: NoteLinkData = record === undefined ? emptyNoteLinks(guid) : parseNoteLinks(record.metadata, guid) ?? emptyNoteLinks(guid);
        fields[ord] = updateNoteLinkField(fields[ord], recordData,
          supportOrd === ord ? renderNoteLinkMirror(noteLinkView(guid, updated, targets)) : '');
        updates.push({ id: note.id, guid: note.guid, notetypeId: note.notetypeId, mtimeSecs: note.mtimeSecs,
          usn: note.usn, tags: note.tags.slice(), fields: fields });
      }
      for (const original of originals) {
        const current: EditableNote = await this.notes.获取笔记(original.id);
        if (current.guid !== original.guid || current.mtimeSecs !== original.mtimeSecs ||
          current.fields.join('\u001f') !== original.fields.join('\u001f')) throw new Error('note_links_conflict');
      }
      await this.notes.更新笔记(updates);
      autoSyncScheduler.request();
    } finally { autoSyncScheduler.endOperation(owner); }
  }
}
export const noteLinksService: NoteLinksService = new NoteLinksService();
