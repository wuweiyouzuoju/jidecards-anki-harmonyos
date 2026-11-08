// SPDX-License-Identifier: AGPL-3.0-or-later
import { AiContentExportPolicy, AiContentExportBackend, AiExportScope, AI_CONTENT_PROVENANCE_KEY } from '../model/AiContentExportPolicy';
import { 配置服务 } from './配置服务';
import { 搜索服务 } from './搜索服务';
import { 笔记服务 } from './笔记服务';
import { 卡片服务 } from './卡片服务';
import { 牌组服务 } from './牌组服务';
import type { DeckTreeNode } from '../proto/messages/DeckMessages';
import type { EditableNote } from '../proto/messages/NoteMessages';
import { deckScopeSearch } from '../model/DeckScope';

function deckName(node: DeckTreeNode, id: number, parent: string = ''): string {
  const path: string = node.deckId <= 0 ? '' : parent.length === 0 ? node.name : parent + '::' + node.name;
  if (node.deckId === id) return path;
  for (const child of node.children) { const found: string = deckName(child, id, path); if (found !== '') return found; }
  return '';
}
class AnkiAiContentExportBackend implements AiContentExportBackend {
  read(): Promise<string> { return new 配置服务().获取全部配置(); }
  async write(value: string): Promise<void> {
    await new 配置服务().设置配置JSON({ key: AI_CONTENT_PROVENANCE_KEY, valueJson: value, undoable: false });
  }
  async notes(scope: AiExportScope): Promise<EditableNote[]> {
    let ids: number[] = [];
    if (scope.mode !== undefined) {
      if ((scope.mode !== 'notes' && scope.mode !== 'cards') || scope.ids === undefined || scope.ids.length === 0 ||
        scope.ids.some((id: number): boolean => !Number.isSafeInteger(id) || id <= 0)) throw new Error('invalid_export_subset');
      if (scope.mode === 'notes') ids = scope.ids;
      else for (const id of scope.ids) ids.push((await new 卡片服务().获取卡片(id)).noteId);
    } else {
      let search: string = '';
      if (scope.deckId !== undefined && scope.deckId > 0) {
        const name: string = deckName(await new 牌组服务().获取牌组树(), scope.deckId);
        if (name === '') throw new Error('deck_not_found');
        search = deckScopeSearch(name);
      }
      ids = await new 搜索服务().搜索笔记({ search: search, order: { kind: 'none' } });
    }
    const notes: EditableNote[] = [];
    for (const id of new Set<number>(ids)) notes.push(await new 笔记服务().获取笔记(id));
    return notes;
  }
}
export const aiContentExportPolicy: AiContentExportPolicy = new AiContentExportPolicy(new AnkiAiContentExportBackend());
