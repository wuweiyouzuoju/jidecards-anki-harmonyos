// SPDX-License-Identifier: AGPL-3.0-or-later
import { BrowserOperationController } from './BrowserOperationController';
import type { NotetypeFieldDraft } from './NotetypeFieldDraft';

export interface NotetypeTemplateDraft {
  /** 原模板身份；新模板用 null，数组位置表达新的顺序。 */
  ord: number | null;
  name: string;
  qfmt: string;
  afmt: string;
  sourceOrd?: number;
}

export interface NotetypeStructureChange {
  kind: string;
  name: string;
  oldName: string;
  from: number;
  to: number;
}
export interface NotetypeImpact {
  noteIds: number[];
  cardIds: number[];
  removedCardIds: number[];
  movedCardIds: number[];
}

/** 旧 ord 表示身份，数组位置表示顺序；影响列表保留名称和前后位置。 */
export function notetypeStructureChanges(originalJson: string, draftJson: string): NotetypeStructureChange[] {
  const original = JSON.parse(originalJson) as Record<string, Object>;
  const draft = JSON.parse(draftJson) as Record<string, Object>;
  const changes: NotetypeStructureChange[] = [];
  for (const group of ['flds', 'tmpls']) {
    const oldItems = original[group] as Record<string, Object>[];
    const items = draft[group] as Record<string, Object | null>[];
    const prefix = group === 'flds' ? 'field' : 'template';
    oldItems.forEach((item: Record<string, Object>, index: number): void => {
      if (!items.some((next: Record<string, Object | null>): boolean => next['ord'] === item['ord'])) {
        changes.push({ kind: prefix + '_removed', name: item['name'] as string, oldName: '', from: index + 1, to: 0 });
      }
    });
    items.forEach((item: Record<string, Object | null>, index: number): void => {
      const previous = oldItems.find((old: Record<string, Object>): boolean => old['ord'] === item['ord']);
      if (previous === undefined) {
        changes.push({ kind: prefix + '_added', name: item['name'] as string, oldName: '', from: 0, to: index + 1 });
      } else {
        const from = oldItems.indexOf(previous) + 1;
        if (from !== index + 1) changes.push({ kind: prefix + '_moved', name: item['name'] as string, oldName: '', from: from, to: index + 1 });
        if (item['name'] !== previous['name']) changes.push({ kind: prefix + '_renamed', name: item['name'] as string,
          oldName: previous['name'] as string, from: from, to: index + 1 });
        if (group === 'tmpls' && item['qfmt'] !== previous['qfmt']) changes.push({ kind: 'template_front',
          name: item['name'] as string, oldName: '', from: from, to: index + 1 });
      }
    });
  }
  return changes;
}

export function sameNotetypeImpact(first: NotetypeImpact, second: NotetypeImpact): boolean {
  const left: number[][] = [first.noteIds, first.cardIds, first.removedCardIds, first.movedCardIds];
  const right: number[][] = [second.noteIds, second.cardIds, second.removedCardIds, second.movedCardIds];
  return left.every((ids: number[], index: number): boolean => {
    const a = ids.slice().sort((x: number, y: number): number => x - y);
    const b = right[index].slice().sort((x: number, y: number): number => x - y);
    return a.length === b.length && a.every((id: number, index: number): boolean => id === b[index]);
  });
}

export function serializeNotetypeTemplates(original: Object[], templates: NotetypeTemplateDraft[]): Object[] {
  if (templates.length === 0) throw new Error('notetype_last_template');
  const seen: number[] = [];
  return templates.map((template: NotetypeTemplateDraft): Object => {
    let source: Record<string, Object | null> = {};
    if (template.ord === null && template.sourceOrd !== undefined) {
      const cloned = original.find((item: Object): boolean => (item as Record<string, Object>)['ord'] === template.sourceOrd);
      if (cloned !== undefined) source = JSON.parse(JSON.stringify(cloned)) as Record<string, Object | null>;
      source['id'] = null;
    }
    if (template.ord !== null) {
      if (seen.indexOf(template.ord) >= 0) throw new Error('Duplicate template identity');
      seen.push(template.ord);
      const found = original.find((item: Object): boolean =>
        (item as Record<string, Object>)['ord'] === template.ord);
      if (found === undefined) throw new Error('Missing original template');
      source = JSON.parse(JSON.stringify(found)) as Record<string, Object | null>;
    }
    source['ord'] = template.ord;
    source['name'] = template.name;
    source['qfmt'] = template.qfmt;
    source['afmt'] = template.afmt;
    return source;
  });
}

export function templateStructureChanged(json: string, templates: NotetypeTemplateDraft[]): boolean {
  const original = (JSON.parse(json) as Record<string, Object>)['tmpls'] as Record<string, Object>[];
  return original.length !== templates.length || templates.some((template: NotetypeTemplateDraft, index: number): boolean =>
    template.ord !== original[index]['ord']);
}

export function cloneNotetypeJson(json: string, name: string): string {
  if (name.trim() === '') throw new Error('notetype_name_required');
  const source = JSON.parse(json) as Record<string, Object>;
  source['id'] = 0;
  source['mod'] = 0;
  source['usn'] = 0;
  source['name'] = name.trim();
  return JSON.stringify(source);
}

/** Core 的未提交卡片渲染使用已保存的字段结构；模板与 CSS 可直接使用草稿。 */
export function previewFieldsUnchanged(json: string, fields: NotetypeFieldDraft[]): boolean {
  const original = (JSON.parse(json) as Record<string, Object>)['flds'] as Record<string, Object>[];
  return original.length === fields.length && fields.every((field: NotetypeFieldDraft, index: number): boolean =>
    field.ord === original[index]['ord'] && field.name === original[index]['name']);
}

export interface NotetypeManagementBackend {
  获取标准笔记类型JSON(kind: number): Promise<string>;
  获取笔记类型旧版(id: number): Promise<string>;
  添加笔记类型旧版(json: string): Promise<number>;
  更新笔记类型旧版(json: string, skipChecks: boolean): Promise<void>;
  移除笔记类型(id: number): Promise<void>;
  impact(id: number, original: string, draft: string): Promise<NotetypeImpact>;
}

/** 复用集合保护；已接受写入独立完成，离页禁止导航但仍广播刷新与同步。 */
export class NotetypeOperationSession {
  private operations: BrowserOperationController = new BrowserOperationController();
  private backend: NotetypeManagementBackend;
  private changed: () => void;
  constructor(backend: NotetypeManagementBackend, changed: () => void) { this.backend = backend; this.changed = changed; }
  dispose(): void { this.operations.dispose(); }
  isAlive(): boolean { return this.operations.isAlive(); }

  async run(write: () => Promise<void>): Promise<boolean> {
    const context = this.operations.begin('notetype', [], 0, 0);
    if (context === null) return false;
    let failure: Error | null = null;
    const result = await this.operations.execute(context, write, {
      afterCommit: async (): Promise<void> => {}, changed: this.changed,
      failed: (error: Error): void => { failure = error; },
      refreshFailed: (error: Error): void => { failure = error; }
    });
    if (failure !== null) throw failure;
    return result;
  }

  async create(kind: number, sourceId: number, name: string): Promise<number> {
    let id: number = 0;
    await this.run(async (): Promise<void> => {
      const json = sourceId > 0 ? await this.backend.获取笔记类型旧版(sourceId) :
        await this.backend.获取标准笔记类型JSON(kind);
      id = await this.backend.添加笔记类型旧版(cloneNotetypeJson(json, name));
    });
    return id;
  }

  async save(id: number, expected: string, draft: string, impact: NotetypeImpact | null = null): Promise<boolean> {
    return this.run(async (): Promise<void> => {
      if (await this.backend.获取笔记类型旧版(id) !== expected) throw new Error('notetype_changed');
      if (impact !== null && !sameNotetypeImpact(impact, await this.backend.impact(id, expected, draft))) throw new Error('notetype_impact_changed');
      await this.backend.更新笔记类型旧版(draft, false);
    });
  }

  async remove(id: number, expected: string, impact: NotetypeImpact): Promise<boolean> {
    return this.run(async (): Promise<void> => {
      if (await this.backend.获取笔记类型旧版(id) !== expected ||
        !sameNotetypeImpact(impact, await this.backend.impact(id, expected, expected))) throw new Error('notetype_impact_changed');
      await this.backend.移除笔记类型(id);
    });
  }
}
