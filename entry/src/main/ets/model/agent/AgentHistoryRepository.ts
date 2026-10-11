// SPDX-License-Identifier: AGPL-3.0-or-later
import type { AgentConversation, AgentConversationSummary } from './AgentConversationTypes';
import { UTF8编码 } from '../../proto/core/utf8';

export const AGENT_HISTORY_DEFAULT_LIMIT: number = 500;
export const AGENT_HISTORY_LIMITS: number[] = [100, 500, 1000];
interface HistoryEntry extends AgentConversationSummary { file: string; }
interface HistoryIndex {
  schema: number; revision: string; limit: number; entries: HistoryEntry[];
  garbageFiles: string[]; garbageConversations: string[];
}
export interface AgentHistoryInfo { count: number; limit: number; storedBytes: number; revision: string; }
export interface AgentHistoryMatch extends AgentConversationSummary { snippet: string; messageIndex: number; }
export interface AgentHistorySearch {
  revision: string; retentionLimit: number; totalMatched: number; items: AgentHistoryMatch[]; nextOffset: number;
}
export interface AgentHistoryIO {
  read(name: string): Promise<string | null>;
  write(name: string, text: string): Promise<void>;
  remove(name: string): Promise<void>;
  legacy(): Promise<AgentConversation[]>;
  clearLegacy(): Promise<void>;
  sanitize(value: AgentConversation): AgentConversation;
  cleanupConversation(id: string): Promise<void>;
}

/** 单一串行提交入口：先写独立版本文件，最后原子替换索引；失败不改旧索引/正文。 */
export class AgentHistoryRepository {
  private readonly io: AgentHistoryIO;
  private queue: Promise<void> = Promise.resolve();
  private sequence: number = 0;
  private searchRevision: string = '';
  private searchQuery: string = '';
  private searchMatches: AgentHistoryMatch[] = [];
  // 当前进程中旧页面/长任务可能晚到保存；删除后同ID不能复活，重启后旧页面已不存在。
  private readonly deletedConversations: Set<string> = new Set<string>();
  constructor(io: AgentHistoryIO) { this.io = io; }
  private serial<T>(work: () => Promise<T>): Promise<T> {
    const accepted: Promise<T> = this.queue.then(work);
    this.queue = accepted.then((): void => {}, (): void => {});
    return accepted;
  }
  private token(): string { return `${Date.now()}-${++this.sequence}-${Math.random().toString(36).slice(2)}`; }
  private checkId(id: string): void {
    if (!new RegExp('^[A-Za-z0-9._-]{1,160}$').test(id)) throw new Error('invalid_conversation_id');
  }
  private async storeEntry(value: AgentConversation): Promise<HistoryEntry> {
    this.checkId(value.id);
    const safe: AgentConversation = this.io.sanitize(value);
    const text: string = JSON.stringify(safe);
    const file: string = `${value.id}-${this.token()}.json`;
    await this.io.write(file, text);
    return { id: safe.id, mode: safe.mode, title: safe.title, updatedAt: safe.updatedAt,
      messageCount: safe.messages.length, storedBytes: UTF8编码(text).length, file: file };
  }
  private async index(): Promise<HistoryIndex> {
    const raw: string | null = await this.io.read('index.json');
    if (raw !== null) {
      const index: HistoryIndex = JSON.parse(raw) as HistoryIndex;
      if (index.schema !== 2 || !Array.isArray(index.entries) || !AGENT_HISTORY_LIMITS.includes(index.limit) ||
        typeof index.revision !== 'string' || !Array.isArray(index.garbageFiles) ||
        !Array.isArray(index.garbageConversations)) throw new Error('history_index_invalid');
      return index;
    }
    // 旧Preferences保留为迁移备份；索引只在全部会话文件成功写入后提交。
    const legacy: AgentConversation[] = await this.io.legacy();
    const entries: HistoryEntry[] = [];
    try {
      for (const value of legacy) {
        if (!entries.some((entry: HistoryEntry): boolean => entry.id === value.id)) entries.push(await this.storeEntry(value));
      }
      const index: HistoryIndex = { schema: 2, revision: this.token(), limit: AGENT_HISTORY_DEFAULT_LIMIT,
        entries: entries, garbageFiles: [], garbageConversations: [] };
      await this.io.write('index.json', JSON.stringify(index));
      return index;
    } catch (error) {
      for (const entry of entries) await this.io.remove(entry.file);
      throw error;
    }
  }
  private async cleanup(index: HistoryIndex): Promise<void> {
    // 清理清单随索引持久化，失败会重试；旧迁移备份不会再次导入已删除记录。
    // 发生删除/淘汰后同步清除迁移备份，不能在“已删除”的旧Preferences里留下正文。
    if (index.garbageConversations.length > 0) await this.io.clearLegacy();
    for (const file of index.garbageFiles) await this.io.remove(file);
    for (const id of index.garbageConversations) await this.io.cleanupConversation(id);
    if (index.garbageFiles.length > 0 || index.garbageConversations.length > 0) {
      index.garbageFiles = []; index.garbageConversations = [];
      await this.io.write('index.json', JSON.stringify(index));
    }
  }
  private async commit(index: HistoryIndex, entries: HistoryEntry[], limit: number): Promise<void> {
    const removed: HistoryEntry[] = index.entries.filter((old: HistoryEntry): boolean =>
      !entries.some((next: HistoryEntry): boolean => next.file === old.file));
    index.garbageFiles = index.garbageFiles.concat(removed.map((entry: HistoryEntry): string => entry.file));
    index.garbageConversations = index.garbageConversations.concat(removed.filter((old: HistoryEntry): boolean =>
      !entries.some((next: HistoryEntry): boolean => next.id === old.id)).map((entry: HistoryEntry): string => entry.id));
    index.entries = entries; index.limit = limit; index.revision = this.token();
    await this.io.write('index.json', JSON.stringify(index));
    for (const id of index.garbageConversations) this.deletedConversations.add(id);
    this.searchRevision = ''; this.searchQuery = ''; this.searchMatches = [];
    await this.cleanup(index);
  }
  private summary(entry: HistoryEntry): AgentConversationSummary {
    return { id: entry.id, mode: entry.mode, title: entry.title, updatedAt: entry.updatedAt,
      messageCount: entry.messageCount, storedBytes: entry.storedBytes };
  }
  private async readEntry(entry: HistoryEntry): Promise<AgentConversation> {
    const raw: string | null = await this.io.read(entry.file);
    if (raw === null) throw new Error('history_content_missing');
    const value: AgentConversation = JSON.parse(raw) as AgentConversation;
    if (value.id !== entry.id || !Array.isArray(value.messages)) throw new Error('history_content_invalid');
    return this.io.sanitize(value);
  }
  list(): Promise<AgentConversationSummary[]> {
    return this.serial(async (): Promise<AgentConversationSummary[]> => {
      const index: HistoryIndex = await this.index(); await this.cleanup(index);
      return index.entries.map((entry: HistoryEntry): AgentConversationSummary => this.summary(entry));
    });
  }
  info(): Promise<AgentHistoryInfo> {
    return this.serial(async (): Promise<AgentHistoryInfo> => {
      const index: HistoryIndex = await this.index();
      await this.cleanup(index);
      return { count: index.entries.length, limit: index.limit, revision: index.revision,
        storedBytes: index.entries.reduce((total: number, entry: HistoryEntry): number => total + entry.storedBytes, 0) };
    });
  }
  read(id: string, revision: string = ''): Promise<AgentConversation> {
    return this.serial(async (): Promise<AgentConversation> => {
      this.checkId(id);
      const index: HistoryIndex = await this.index();
      if (revision !== '' && revision !== index.revision) throw new Error('history_changed_search_again');
      const entry: HistoryEntry | undefined = index.entries.find((item: HistoryEntry): boolean => item.id === id);
      if (entry === undefined) throw new Error('history_not_found');
      return this.readEntry(entry);
    });
  }
  save(value: AgentConversation): Promise<void> {
    // 冻结已接受写入，UI销毁不取消；所有宿主共享本仓库队列。
    const snapshot: AgentConversation = JSON.parse(JSON.stringify(value)) as AgentConversation;
    return this.serial(async (): Promise<void> => {
      const index: HistoryIndex = await this.index();
      await this.cleanup(index);
      if (this.deletedConversations.has(snapshot.id)) {
        await this.io.cleanupConversation(snapshot.id);
        throw new Error('history_deleted_start_new_conversation');
      }
      const entry: HistoryEntry = await this.storeEntry(snapshot);
      const entries: HistoryEntry[] = [entry, ...index.entries.filter((item: HistoryEntry): boolean => item.id !== entry.id)];
      try { await this.commit(index, entries.slice(0, index.limit), index.limit); }
      catch (error) {
        const raw: string | null = await this.io.read('index.json');
        const committed: HistoryIndex | null = raw === null ? null : JSON.parse(raw) as HistoryIndex;
        if (committed === null || !committed.entries.some((item: HistoryEntry): boolean => item.file === entry.file)) {
          await this.io.remove(entry.file);
        }
        throw error;
      }
    });
  }
  remove(id: string, revision: string = ''): Promise<void> {
    return this.serial(async (): Promise<void> => {
      this.checkId(id);
      const index: HistoryIndex = await this.index();
      if (revision !== '' && revision !== index.revision) throw new Error('history_changed_search_again');
      await this.commit(index, index.entries.filter((entry: HistoryEntry): boolean => entry.id !== id), index.limit);
    });
  }
  clear(revision: string = ''): Promise<void> {
    return this.serial(async (): Promise<void> => {
      const index: HistoryIndex = await this.index();
      if (revision !== '' && revision !== index.revision) throw new Error('history_changed_search_again');
      await this.commit(index, [], index.limit);
    });
  }
  setLimit(limit: number, revision: string = ''): Promise<void> {
    return this.serial(async (): Promise<void> => {
      if (!AGENT_HISTORY_LIMITS.includes(limit)) throw new Error('history_limit_invalid');
      const index: HistoryIndex = await this.index();
      if (revision !== '' && revision !== index.revision) throw new Error('history_changed_search_again');
      await this.commit(index, index.entries.slice(0, limit), limit);
    });
  }
  search(query: string, offset: number = 0, limit: number = 20, revision: string = ''): Promise<AgentHistorySearch> {
    return this.serial(async (): Promise<AgentHistorySearch> => {
      if (query.length > 200 || !Number.isInteger(offset) || offset < 0 || !Number.isInteger(limit) || limit < 1 || limit > 20) {
        throw new Error('history_search_invalid');
      }
      const index: HistoryIndex = await this.index();
      if (revision !== '' && revision !== index.revision) throw new Error('history_changed_search_again');
      const term: string = query.trim().toLocaleLowerCase();
      if (this.searchRevision === index.revision && this.searchQuery === term) {
        const page: AgentHistoryMatch[] = this.searchMatches.slice(offset, offset + limit);
        return { revision: index.revision, retentionLimit: index.limit, totalMatched: this.searchMatches.length, items: page,
          nextOffset: offset + page.length < this.searchMatches.length ? offset + page.length : -1 };
      }
      const items: AgentHistoryMatch[] = [];
      for (const entry of index.entries) {
        let snippet: string = entry.title; let messageIndex: number = -1;
        let matched: boolean = term === '' || entry.title.toLocaleLowerCase().includes(term);
        if (!matched) {
          const value: AgentConversation = await this.readEntry(entry);
          for (let at: number = 0; at < value.messages.length; at++) {
            const text: string = value.messages[at].text;
            const position: number = text.toLocaleLowerCase().indexOf(term);
            if (position >= 0) { matched = true; messageIndex = at; snippet = text.slice(Math.max(0, position - 50), position + 150); break; }
          }
        }
        if (!matched) continue;
        items.push({ id: entry.id, mode: entry.mode, title: entry.title,
          updatedAt: entry.updatedAt, messageCount: entry.messageCount, storedBytes: entry.storedBytes,
          snippet: snippet.slice(0, 200), messageIndex: messageIndex });
      }
      this.searchRevision = index.revision; this.searchQuery = term; this.searchMatches = items;
      const page: AgentHistoryMatch[] = items.slice(offset, offset + limit);
      return { revision: index.revision, retentionLimit: index.limit, totalMatched: items.length, items: page,
        nextOffset: offset + page.length < items.length ? offset + page.length : -1 };
    });
  }
}
