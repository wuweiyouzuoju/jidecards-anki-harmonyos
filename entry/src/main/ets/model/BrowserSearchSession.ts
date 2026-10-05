// SPDX-License-Identifier: AGPL-3.0-or-later
import { browserFilterNode } from './BrowserQuickFilter';
import { makeCardStateNode, SearchNodeCardState } from '../proto/messages/SearchMessages';
import type { BrowserColumn, BrowserColumns, BrowserRow, BrowserCell, BrowserRowColor, SearchNode, SearchRequest, SortOrder } from '../proto/messages/SearchMessages';

export interface BrowserDisplayRow {
  id: number;
  cells: BrowserCell[];
  color: BrowserRowColor;
  hasSuspendedCards: boolean;
  marked?: boolean;
}
export interface BrowserSearchBackend {
  open(filesDir: string): Promise<void>;
  setNotesMode(notes: boolean): Promise<void>;
  columns(): Promise<BrowserColumns>;
  activateColumns(keys: string[]): Promise<void>;
  buildSearch(node: SearchNode): Promise<string>;
  search(request: SearchRequest, notes: boolean): Promise<number[]>;
  row(id: number): Promise<BrowserRow>;
  markedIds?(notes: boolean): Promise<number[]>;
}
export interface BrowserQuery {
  filesDir: string;
  notes: boolean;
  text: string;
  filter: string;
  sortColumn: string;
  sortReverse: boolean;
}
export interface BrowserSearchResult {
  columns: BrowserColumn[];
  ids: number[];
  suspended: Set<number>;
  marked: Set<number>;
  rows: BrowserDisplayRow[];
  consumed: number;
}

// 模式和激活列属于同一 collection，跨页面实例及分页共享读队列。
let browserReadTail: Promise<void> = Promise.resolve();
function serializeBrowserRead<T>(read: () => Promise<T>): Promise<T> {
  const result: Promise<T> = browserReadTail.then(read, read);
  browserReadTail = result.then((): void => {}, (): void => {});
  return result;
}
export function loadBrowserRows(ids: number[], suspended: Set<number>,
  rowForId: (id: number) => Promise<BrowserRow>, current: () => boolean,
  marked: Set<number> = new Set<number>()): Promise<BrowserDisplayRow[]> {
  return serializeBrowserRead((): Promise<BrowserDisplayRow[]> => readBrowserRows(ids, suspended, rowForId, current, marked));
}

/** 固定并发上限，失败行也由调用方消费游标；不以成功行数计算下一页。 */
async function readBrowserRows(ids: number[], suspended: Set<number>,
  rowForId: (id: number) => Promise<BrowserRow>, current: () => boolean,
  marked: Set<number>): Promise<BrowserDisplayRow[]> {
  const rows: BrowserDisplayRow[] = [];
  for (let offset = 0; offset < ids.length; offset += 20) {
    if (!current()) return [];
    const batch: number[] = ids.slice(offset, offset + 20);
    const loaded: (BrowserRow | null)[] = await Promise.all(batch.map((id: number): Promise<BrowserRow | null> =>
      rowForId(id).catch((): null => null)));
    if (!current()) return [];
    batch.forEach((id: number, index: number): void => {
      const row: BrowserRow | null = loaded[index];
      if (row !== null) rows.push({ id: id, cells: row.cells, color: row.color,
        hasSuspendedCards: suspended.has(id), marked: marked.has(id) });
    });
  }
  return rows;
}

/** 后端浏览模式是集合级配置：串行化整个搜索，避免旧请求把新模式的行解释成另一类 ID。 */
export class BrowserSearchSession {
  private columnsCache: BrowserColumn[] = [];
  private result: BrowserSearchResult | null = null;
  private generation: number = 0;
  private loadingMore: boolean = false;
  private readonly backend: BrowserSearchBackend;
  constructor(backend: BrowserSearchBackend) { this.backend = backend; }

  search(query: BrowserQuery, current: () => boolean): Promise<BrowserSearchResult | null> {
    const generation: number = ++this.generation;
    this.result = null;
    this.loadingMore = false;
    const valid = (): boolean => generation === this.generation && current();
    const run = async (): Promise<BrowserSearchResult | null> => {
      const result = await this.execute(query, valid);
      if (!valid()) return null;
      this.result = result;
      return result;
    };
    return serializeBrowserRead(run);
  }

  /** 搜索会话独占分页游标与结果；失败行也消费 ID，旧分页不影响新查询。 */
  async more(current: () => boolean): Promise<BrowserSearchResult | null> {
    const result: BrowserSearchResult | null = this.result;
    if (this.loadingMore || result === null || result.consumed >= result.ids.length || !current()) return null;
    const generation: number = this.generation;
    const valid = (): boolean => generation === this.generation && current();
    const ids: number[] = result.ids.slice(result.consumed, result.consumed + 100);
    this.loadingMore = true;
    try {
      const rows = await loadBrowserRows(ids, result.suspended,
        (id: number): Promise<BrowserRow> => this.backend.row(id), valid, result.marked);
      if (!valid()) return null;
      this.result = { columns: result.columns, ids: result.ids, suspended: result.suspended, marked: result.marked,
        rows: result.rows.concat(rows), consumed: result.consumed + ids.length };
      return this.result;
    } finally {
      if (generation === this.generation) this.loadingMore = false;
    }
  }

  private async execute(query: BrowserQuery, current: () => boolean): Promise<BrowserSearchResult | null> {
    if (!current()) return null;
    await this.backend.open(query.filesDir);
    if (!current()) return null;
    await this.backend.setNotesMode(query.notes);
    if (!current()) return null;
    if (this.columnsCache.length === 0) {
      const columns: BrowserColumns = await this.backend.columns();
      if (!current()) return null;
      await this.backend.activateColumns(['question', 'deck', 'cardDue', 'flags', 'answer']);
      if (!current()) return null;
      this.columnsCache = columns.columns;
    }
    const search: string = await this.backend.buildSearch(browserFilterNode(query.text, query.filter));
    if (!current()) return null;
    const order: SortOrder = query.sortColumn === '' ? { kind: 'none' } :
      { kind: 'builtin', column: query.sortColumn, reverse: query.sortReverse };
    const ids: number[] = await this.backend.search({ search: search, order: order }, query.notes);
    if (!current()) return null;
    const suspendedSearch: string = await this.backend.buildSearch(makeCardStateNode(SearchNodeCardState.CARD_STATE_SUSPENDED));
    if (!current()) return null;
    const suspendedIds: number[] = await this.backend.search({ search: suspendedSearch, order: { kind: 'none' } }, query.notes);
    if (!current()) return null;
    const suspended: Set<number> = new Set<number>(suspendedIds);
    const marked: Set<number> = new Set<number>(this.backend.markedIds === undefined ? [] : await this.backend.markedIds(query.notes));
    if (!current()) return null;
    const rows: BrowserDisplayRow[] = await readBrowserRows(ids.slice(0, 200), suspended,
      (id: number): Promise<BrowserRow> => this.backend.row(id), current, marked);
    if (!current()) return null;
    return { columns: this.columnsCache.slice(), ids: ids, suspended: suspended, marked: marked,
      rows: rows, consumed: Math.min(200, ids.length) };
  }
}
