// SPDX-License-Identifier: AGPL-3.0-or-later
import { 后端会话 } from './后端会话';
import { 搜索服务 } from './搜索服务';
import type { DuplicateScanBackend, DuplicateScanInput } from '../model/NoteDuplicateSession';
import type { DuplicateField } from '../proto/messages/NoteDuplicateMessages';
import { NOTE_DUPLICATE_SERVICE, encodeDuplicateFields, decodeDuplicateFields } from '../proto/messages/NoteDuplicateMessages';
import type { SearchNode } from '../proto/messages/SearchMessages';
import { SearchNodeJoiner } from '../proto/messages/SearchMessages';

export class AnkiNoteDuplicates implements DuplicateScanBackend {
  private searchService: 搜索服务 = new 搜索服务();
  async search(input: DuplicateScanInput): Promise<number[]> {
    const node: SearchNode = { kind: 'group', group: { joiner: SearchNodeJoiner.AND,
      nodes: [{ kind: 'parsable_text', text: `mid:${input.notetypeId}` },
        { kind: 'parsable_text', text: input.search }] } };
    const search: string = await this.searchService.构建搜索串(node);
    return this.searchService.搜索笔记({ search: search, order: { kind: 'none' } });
  }
  async fields(ids: number[], notetypeId: number, fieldOrd: number): Promise<DuplicateField[]> {
    const bytes = await 后端会话.获取实例().调用(NOTE_DUPLICATE_SERVICE, 0,
      encodeDuplicateFields(ids, notetypeId, fieldOrd));
    return decodeDuplicateFields(bytes);
  }
}
